---
title: "JPA 배치 쓰기 완전 정복 — `hibernate.jdbc.batch_size`와 `IDENTITY` 함정"
date: "2026-04-28"
category: "study"
tags: ["배치 쓰기"]
excerpt: "JPA에서 대량 INSERT/UPDATE가 느린 진짜 원인은 네트워크 왕복입니다. JDBC 배치, hibernate.jdbc.batch_size, order_inserts, MySQL의 rewriteBatchedStatements, 그리고 IDENTITY 전략이 배치를 막는 이유와 해결책을 정리합니다."
---

## 배치 쓰기, 왜 따로 알아야 하나요?

대량 `INSERT`나 `UPDATE`가 느릴 때 대부분의 첫 반응은 "DB가 느려서"입니다. 그러나 실제 원인은 DB가 아니라 **네트워크 왕복(round-trip)** 인 경우가 압도적으로 많습니다. 한 행씩 `INSERT`를 반복하면 **행 수 × 왕복 비용**이 그대로 응답 시간에 더해집니다.

- 사용자 데이터 1만 건을 한 번에 저장하는데 **응답이 수 분** 걸립니다
- SQL 로그를 보니 `INSERT`가 **한 건씩 수천 번** 반복됩니다
- `hibernate.jdbc.batch_size`를 설정했는데 **여전히 개별 쿼리가 나갑니다**
- 배치 옵션을 다 켰는데도 **MySQL에서는** 속도 차이가 작습니다

이 증상들의 원인은 전부 **JPA의 배치 쓰기가 어떤 조건에서 켜지고, 어떤 조건에서 꺼지는지**를 몰라서 생깁니다. 특히 `IDENTITY` ID 생성 전략은 배치를 **구조적으로 막는 가장 큰 이유**인데, MySQL 환경에서는 이걸 우회하기가 까다롭습니다. 이 글은 배치가 동작하는 구조, 막히는 이유, 그리고 실무에서 우회하는 방법을 순서대로 정리합니다.

> **기준:** 이 글은 **Jakarta Persistence 3.1** 명세와 **Hibernate 6.x**, **MySQL 8.4 Connector/J** 기준으로 작성합니다. Hibernate 배치 옵션은 [Hibernate 6 User Guide — §13. Batching](https://docs.jboss.org/hibernate/orm/6.6/userguide/html_single/Hibernate_User_Guide.html#batch), MySQL JDBC 드라이버의 `rewriteBatchedStatements` 파라미터는 [MySQL Connector/J Reference](https://dev.mysql.com/doc/connector-j/en/connector-j-connp-props-performance-extensions.html)를 참조합니다. 영속성 컨텍스트와 flush 동작은 [앞 글](/posts/43-jpa-flush-and-osiv)을 전제로 합니다. 코드 예시는 Kotlin + Spring Data JPA입니다.

## 먼저 가장 짧은 답부터 보면

- JDBC 드라이버의 **배치(`addBatch`/`executeBatch`)** 는 여러 SQL을 **한 번의 네트워크 왕복**으로 전송하는 메커니즘입니다
- Hibernate는 `hibernate.jdbc.batch_size`가 설정되어 있어야 배치를 **시도**합니다. 기본값은 **비활성화**입니다
- **`IDENTITY` ID 전략은 배치를 구조적으로 막습니다**. ID를 DB가 만들어 주기 때문에 `persist()` 순간 개별 `INSERT` 가 필요합니다
- MySQL은 `IDENTITY = AUTO_INCREMENT`이므로 이 함정을 정면으로 맞습니다. **애플리케이션에서 ID를 만드는 방식**(UUIDv7, Snowflake)이 실질적 대안입니다
- MySQL 드라이버의 **`rewriteBatchedStatements=true`** 를 켜면 다중 `INSERT`가 단일 `multi-VALUES` 문으로 재작성되어 실제 효과가 큽니다

## Phase 1. JDBC 배치가 실제로 해결하는 것

### 핵심: 네트워크 왕복 수를 줄입니다

`INSERT` 한 건의 비용은 대부분 **DB의 쓰기 자체**가 아니라 **네트워크 왕복 + SQL 파싱**입니다. 한 건을 1ms에 처리할 수 있는 DB라도, 왕복이 5ms면 10,000건을 차례로 보내는 데 수십 초가 걸립니다.

```text
개별 INSERT 10,000건
  app ──INSERT──▶ db      왕복 1
   ◀──ack────
  app ──INSERT──▶ db      왕복 2
   ◀──ack────
  ... × 10,000
```

JDBC 배치는 **여러 SQL을 한 번의 왕복으로 전송**합니다.

```text
배치 INSERT 10,000건 (batch_size = 500)
  app ──INSERT × 500──▶ db   왕복 1
   ◀───acks──────
  ... × 20 (왕복 수 1/500로 축소)
```

### JDBC 수준에서의 동작

JDBC 드라이버는 `Statement#addBatch()`로 쌓인 SQL을 `executeBatch()`로 한 번에 전송합니다. Hibernate의 `hibernate.jdbc.batch_size`는 이 `executeBatch()`가 언제 호출될지를 조정합니다.

## Phase 2. Hibernate 배치 설정

### 기본 설정

```yaml
spring:
  jpa:
    properties:
      hibernate:
        jdbc:
          batch_size: 100
        order_inserts: true
        order_updates: true
```

각 설정의 역할은 이렇습니다.

| 속성 | 역할 |
|------|------|
| `hibernate.jdbc.batch_size` | 한 배치에 묶을 최대 SQL 수. 기본값 `0` (비활성화) |
| `hibernate.order_inserts` | `INSERT`를 **테이블별로 정렬**해서 같은 테이블 것끼리 연속 배치 가능하게 함 |
| `hibernate.order_updates` | `UPDATE`도 같은 방식으로 정렬 |

### 왜 `order_inserts`가 필요한가요?

JDBC 배치는 **같은 SQL 문자열**만 묶을 수 있습니다. Hibernate는 엔티티를 영속화한 순서대로 `INSERT` 큐를 만들기 때문에, 여러 종류의 엔티티가 섞여 있으면 다음처럼 됩니다.

```text
INSERT user ...
INSERT order ...
INSERT user ...
INSERT order ...
```

이 상태에서는 배치 크기가 아무리 커도 **같은 테이블 `INSERT`가 연달아 있지 않아** 묶이지 않습니다. `order_inserts=true`는 이 큐를 테이블별로 정렬해 다음처럼 바꿉니다.

```text
INSERT user ...
INSERT user ...
INSERT order ...
INSERT order ...
```

이 상태가 되어야 배치가 실제로 작동합니다.

### 배치가 실행되는 시점

Hibernate는 다음 중 하나의 시점에 배치를 내보냅니다.

1. 배치 큐 크기가 **`batch_size`에 도달**할 때
2. **다른 테이블에 대한 SQL**이 끼어들 때 (같은 문자열이 아니므로 먼저 flush)
3. **커밋 직전**의 최종 `flush`

이 동작은 `order_inserts`와 결합되어야 효과가 납니다. 둘 다 켜지지 않은 상태에서는 설정 값만 바꿔도 실제 배치로 묶이지 않을 수 있습니다.

## Phase 3. `IDENTITY` 전략이 배치를 막는 진짜 이유

### 핵심: ID를 DB가 만들어야 해서 `INSERT`를 하나씩 보낼 수밖에 없습니다

`GenerationType.IDENTITY`는 `AUTO_INCREMENT` 같은 DB 기능으로 ID를 만듭니다. 이 전략의 문제는 "**`INSERT`를 실행해야 ID를 알 수 있다**"는 점입니다.

영속성 컨텍스트는 엔티티를 1차 캐시에 넣을 때 ID를 키로 씁니다. 그래서 `persist()` 순간 ID를 알아야 하고, 결과적으로 `INSERT`를 **즉시** 실행합니다. 이 순간 배치 큐는 사용할 수 없습니다.

```kotlin
@Transactional
fun insertMany(users: List<User>) {
  users.forEach { em.persist(it) }  // 각 persist()마다 INSERT 실행
}
```

`batch_size` 설정이 아무리 커도 위 코드는 건별 `INSERT`를 냅니다. MySQL 환경에서 배치가 "안 먹는" 듯 보이는 가장 큰 원인이 이것입니다.

### Hibernate는 이 상황에서 조용히 배치를 끕니다

Hibernate는 `IDENTITY` 전략의 엔티티에 대해 **경고 없이 배치를 비활성화**합니다. 별도의 로그 메시지가 뜨지 않기 때문에 "`batch_size`를 줬는데 왜 안 빨라지지?" 하고 의아한 상황을 만들기 쉽습니다. SQL 로그에서 **개별 `INSERT`가 줄줄이 찍히는지**를 직접 확인하는 것이 가장 빠른 진단입니다.

## Phase 4. `IDENTITY`를 우회하는 네 가지 방법

### 1. `SEQUENCE` (PostgreSQL / Oracle 환경)

`SEQUENCE` 전략은 DB에 "다음 ID"를 미리 물어볼 수 있습니다. Hibernate는 시퀀스를 **pooled 방식**으로 여러 ID를 한꺼번에 가져와 캐싱할 수 있어, `persist()` 시점에 `INSERT` 없이도 ID를 확보할 수 있습니다.

```kotlin
@Entity
class User(
  @Id
  @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "user_seq")
  @SequenceGenerator(name = "user_seq", sequenceName = "user_seq", allocationSize = 50)
  val id: Long = 0,
  val name: String
)
```

이 전략에서는 배치가 자연스럽게 동작합니다. 다만 **MySQL에는 SEQUENCE가 없습니다**.

### 2. `TABLE` 전략 (모든 DB 사용 가능, 그러나 느림)

`TABLE` 전략은 별도의 ID 관리 테이블을 만들어 ID를 할당합니다. 이식성은 좋지만 **매 할당마다 ID 테이블을 `UPDATE`** 해야 하기 때문에 성능이 좋지 않습니다. MySQL 환경에서도 대안으로 거론되지만 대규모 환경에서는 거의 사용되지 않습니다.

### 3. 애플리케이션이 ID를 생성 — `UUIDv7`, `Snowflake`

가장 실무적인 선택은 **ID를 애플리케이션이 만드는 것**입니다. ID를 영속화 전에 이미 알고 있기 때문에 `persist()` 순간 `INSERT`를 내보낼 필요가 없습니다. 배치 큐에 그대로 쌓일 수 있습니다.

```kotlin
@Entity
class User(
  @Id
  val id: UUID,  // UUIDv7 등 애플리케이션에서 생성
  val name: String
)
```

UUIDv7은 [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562)로 표준화되어 있고, 시간 단조 증가 속성이 있어 **`BIGINT AUTO_INCREMENT`에 가까운 인덱스 성능**을 보입니다. 완전 랜덤 UUIDv4는 `InnoDB` 클러스터드 인덱스에 삽입할 때 페이지 분할 비용이 커서, 대량 `INSERT`에는 적합하지 않습니다. 애플리케이션 ID를 선택할 때는 **시간 단조 증가 여부**를 반드시 확인합니다.

### 4. `JdbcTemplate` / 네이티브 배치 — 최후의 수단

정말 큰 `INSERT`(수십만 건 이상)는 JPA를 우회해 **`JdbcTemplate.batchUpdate()`** 를 쓰는 편이 현실적입니다. 영속성 컨텍스트를 거치지 않고 직접 SQL을 배치로 보내기 때문에, ID 전략과 무관하게 최고 성능이 나옵니다.

```kotlin
jdbcTemplate.batchUpdate(
  "INSERT INTO user (id, name) VALUES (?, ?)",
  users.chunked(1000).flatMap { chunk ->
    chunk.map { arrayOf<Any>(it.id, it.name) }
  }
)
```

이 방법의 트레이드오프는 명확합니다. **영속성 컨텍스트의 장점(변경 감지, 연관 관리 등)이 사라집니다**. 대량 초기 로딩이나 로그 적재처럼 **영속성 컨텍스트가 오히려 짐**이 되는 경우에만 선택합니다.

## Phase 5. MySQL에서 반드시 확인해야 할 드라이버 설정

### `rewriteBatchedStatements=true`

MySQL Connector/J는 기본적으로 **배치 INSERT를 여러 개의 개별 `INSERT` 문으로 전송**합니다. 즉, 네트워크 왕복 수는 줄어들어도 SQL 파싱 비용은 그대로입니다. 이 문제를 풀기 위한 드라이버 옵션이 `rewriteBatchedStatements=true`입니다.

```yaml
spring:
  datasource:
    url: jdbc:mysql://.../mydb?rewriteBatchedStatements=true
```

이 옵션을 켜면 드라이버가 다음처럼 SQL을 재작성합니다.

```sql
-- 옵션 꺼짐
INSERT INTO user (id, name) VALUES (?, ?);
INSERT INTO user (id, name) VALUES (?, ?);
...

-- 옵션 켜짐
INSERT INTO user (id, name) VALUES (?, ?), (?, ?), (?, ?), ...;
```

이 한 줄의 설정만으로 **대량 `INSERT` 성능이 5~10배 이상** 빨라지는 경우가 많습니다. MySQL 환경에서 **배치를 켜고도 효과가 작게 느껴진다면, 가장 먼저 이 옵션을 확인**합니다.

### `max_allowed_packet`

`rewriteBatchedStatements`를 켜면 한 `INSERT` 문의 크기가 커집니다. MySQL 서버의 `max_allowed_packet` 이 너무 작으면 "packet too large" 에러가 납니다. MySQL 8.x의 기본값은 `64MB` 로 충분하지만, 운영 환경에서는 명시적으로 확인합니다.

## Phase 6. `UPDATE` 배치와 `@Version`

### 낙관적 잠금이 켜진 엔티티도 배치로 묶입니다

`@Version`으로 낙관적 잠금이 걸린 엔티티의 `UPDATE`를 배치로 묶는 것은 **Hibernate 5 이후부터 기본값으로 활성화**되어 있습니다. 관련 설정은 `hibernate.jdbc.batch_versioned_data` 이고, **기본값이 `true`** 입니다 (pre-12c Oracle dialect처럼 일부 환경에서만 꺼져 있습니다).

```yaml
spring:
  jpa:
    properties:
      hibernate:
        jdbc:
          batch_versioned_data: true  # 기본값, 명시적 확인용
```

이때 Hibernate는 `executeBatch()` 반환 값에서 **각 행의 업데이트 수**를 확인해 버전 충돌을 감지합니다. **드라이버가 배치 결과의 개별 row count를 지원**해야 동작하고, MySQL Connector/J는 이 기능을 지원합니다. 즉 현대 MySQL 환경이라면 이 설정은 이미 켜진 상태로 동작합니다.

## Phase 7. 실전 점검 순서

"배치를 켰는데 왜 안 빨라지지?"라는 의심이 들 때, 다음 순서로 점검하면 대부분의 원인이 드러납니다.

1. **ID 생성 전략이 `IDENTITY`가 아닌가?** — MySQL이라면 애플리케이션 ID(UUIDv7 등)로 바꾸는 것이 가장 큰 효과
2. **`hibernate.jdbc.batch_size`가 설정되어 있고 0이 아닌가?** — 기본값이 0이라 많은 프로젝트가 놓칩니다
3. **`order_inserts` / `order_updates`가 켜져 있는가?** — 엔티티가 섞여 있을 때 반드시 필요
4. **MySQL 드라이버의 `rewriteBatchedStatements=true`가 켜져 있는가?** — MySQL 환경에서는 이 한 줄이 결정적
5. **`@Version`이 걸린 엔티티의 `UPDATE`를 쓰고 있다면** `batch_versioned_data`가 꺼져 있지 않은지 확인 (기본값 `true`이므로 보통 문제없음)
6. **대량 처리 중 `em.flush() + em.clear()`를 주기적으로 호출하고 있는가?** — 영속성 컨텍스트가 커지면 변경 감지 비용만으로도 병목이 됩니다

### 대량 처리 루프의 일반적인 틀

```kotlin
@Transactional
fun bulkInsert(items: List<Item>) {
  items.chunked(1000).forEach { chunk ->
    chunk.forEach { em.persist(it) }
    em.flush()
    em.clear()  // 영속성 컨텍스트를 비워 메모리와 dirty-check 비용을 통제
  }
}
```

이 구조에 **애플리케이션 ID + 배치 설정 + `rewriteBatchedStatements`** 가 맞물리면 JPA로도 수만 건/초 수준의 처리량이 나옵니다. 그 이상의 처리량이 필요하면 `JdbcTemplate`로 우회합니다.

## 정리

JPA 배치 쓰기의 효과는 **"네트워크 왕복 수를 줄인다"** 이 한 줄에 집약됩니다. 그러나 이 효과를 실제로 보려면 여러 조각이 동시에 맞아야 합니다.

| 조각 | 확인할 것 |
|------|----------|
| Hibernate | `batch_size`, `order_inserts`, `order_updates` |
| `UPDATE` 배치 | `batch_versioned_data` (Hibernate 5+ 기본 `true`) + 드라이버의 개별 row count 지원 |
| ID 전략 | `IDENTITY`면 배치 불가, 애플리케이션 ID로 대체 |
| MySQL 드라이버 | `rewriteBatchedStatements=true` + `max_allowed_packet` 확인 |
| 메모리 관리 | 주기적 `em.flush() + em.clear()` |

MySQL 환경에서 이 조합 중 **`IDENTITY` 회피**와 **`rewriteBatchedStatements`** 가 가장 큰 레버입니다. 둘 중 하나라도 빠지면 배치 효과의 상당 부분을 잃습니다. 설계 시점부터 ID 생성 전략을 고민하는 것이, 뒤늦게 튜닝으로 회복하는 것보다 훨씬 저렴합니다.

다음 글은 JPA 시리즈의 마지막 — **`merge` vs `persist`와 `detached` 엔티티 다루기**를 정리합니다. 지금까지 쌓인 영속성 컨텍스트·fetch 전략·트랜잭션·배치의 개념이 모여, 실무에서 엔티티 상태를 언제 어떻게 올려야 하는지가 정돈됩니다.

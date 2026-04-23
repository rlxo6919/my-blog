---
title: "JPA 영속성 컨텍스트 완전 정복 — 1차 캐시와 변경 감지는 어떻게 동작하나요?"
date: "2026-04-22"
category: "study"
tags: ["영속성 컨텍스트"]
excerpt: "JPA가 개발자를 대신해 엔티티 상태를 관리하고 SQL을 뒤늦게 내보내는 구조인 영속성 컨텍스트의 동작 원리를 엔티티 상태, 1차 캐시, 변경 감지, flush 시점 중심으로 정리합니다."
---

## 영속성 컨텍스트, 왜 알아야 하나요?

JPA를 쓰다 보면 분명히 배운 대로 썼는데 결과가 이상한 상황을 자주 만납니다.

- `save()`를 부르지 않았는데 `UPDATE`가 나갔습니다
- 같은 `findById()`를 두 번 호출했는데 SQL은 한 번만 나갔습니다
- 트랜잭션 밖에서 엔티티 필드를 바꿨더니 반영되지 않았습니다
- `persist()`를 불렀는데 `INSERT`가 트랜잭션 커밋 직전까지 미뤄졌습니다

이 모든 동작의 중심에 **영속성 컨텍스트(`Persistence Context`)** 가 있습니다. 영속성 컨텍스트는 JPA가 엔티티를 바로 DB로 내보내지 않고 **트랜잭션 동안 엔티티를 관리하는 작업 공간**입니다. 개발자가 명시적으로 `UPDATE`를 쓰지 않아도 값을 바꾸기만 하면 DB에 반영되는 이유가 이 작업 공간의 동작 원리 때문입니다.

> **기준:** 이 글은 **Jakarta Persistence 3.1 (JPA 3.1) 명세**와 **Hibernate 6.x** 구현을 기준으로 작성합니다. 개념 정의는 [Jakarta Persistence 3.1 Specification](https://jakarta.ee/specifications/persistence/3.1/jakarta-persistence-spec-3.1.html)의 `§3. Entity Operations` 장을 참고하고, `flush`·변경 감지·배치 구현 세부는 [Hibernate 6 User Guide](https://docs.jboss.org/hibernate/orm/6.6/userguide/html_single/Hibernate_User_Guide.html)를 인용합니다. 실제 SQL 동작은 **MySQL 8.4 + `InnoDB`** 기준이고, 트랜잭션 경계는 Spring의 `@Transactional`이 관리하는 상황을 전제합니다. 코드 예시는 Kotlin + Spring Data JPA로 작성합니다.

## 먼저 가장 짧은 답부터 보면

영속성 컨텍스트가 대신해 주는 일은 네 가지로 줄일 수 있습니다.

- **1차 캐시** — 같은 트랜잭션 안에서 같은 ID를 여러 번 조회해도 SQL은 한 번만 나갑니다
- **변경 감지** — 엔티티 필드를 바꾸기만 해도 `UPDATE`가 자동으로 만들어집니다
- **쓰기 지연** — `persist()`/`save()`는 바로 SQL을 내보내지 않고 모아서 내보냅니다
- **동일성 보장** — 같은 영속성 컨텍스트에서 같은 ID로 조회한 엔티티는 `===` 비교가 성립합니다

이 네 가지는 서로 독립된 기능이 아니라 **하나의 구조에서 파생**됩니다. 영속성 컨텍스트가 엔티티의 "현재 모습"과 "DB에서 처음 읽어온 모습(스냅샷)"을 함께 들고 있기 때문에 가능한 일입니다.

## Phase 1. 영속성 컨텍스트는 무엇을 대신해 주나요?

### 핵심: 영속성 컨텍스트는 엔티티의 논리 저장소입니다

Jakarta Persistence 3.1 명세 `§3.1`은 영속성 컨텍스트를 "**엔티티 인스턴스의 집합으로, 그 안에서 각 엔티티의 영속 식별자(persistent identity)에 대해 최대 하나의 인스턴스만 존재**"하는 공간으로 정의합니다.

한 줄로 줄이면 이렇습니다.

- 영속성 컨텍스트는 **`EntityManager` 하나가 관리하는 엔티티들의 모음**입니다
- 한 영속성 컨텍스트 안에서 같은 `(엔티티 클래스, 식별자)` 쌍은 **정확히 한 개의 인스턴스**로만 존재합니다

이 규칙 하나가 뒤에 나올 1차 캐시, 변경 감지, 동일성 보장을 전부 떠받칩니다.

### 트랜잭션과의 관계

Spring 환경에서 `@Transactional`이 붙은 메서드에 들어가는 순간 **새 영속성 컨텍스트가 열리고**, 커밋되거나 롤백될 때 **영속성 컨텍스트도 닫힙니다**. 즉, 기본 설정에서 **영속성 컨텍스트의 수명 = 트랜잭션의 수명**입니다.

```text
@Transactional 메서드 진입
  ├─ 영속성 컨텍스트 열림
  ├─ find/save/update 호출들이 이 안에서 일어남
  └─ 커밋 직전에 flush → 이후 영속성 컨텍스트 닫힘
```

트랜잭션이 끝나면 그 안에서 관리되던 엔티티들은 전부 `detached` 상태가 됩니다. 이 지점부터는 필드를 바꿔도 DB에 반영되지 않습니다.

## Phase 2. 엔티티의 네 가지 상태

JPA 명세는 엔티티가 가질 수 있는 상태를 네 가지로 정의합니다. 영속성 컨텍스트의 대부분의 동작은 이 네 상태 사이의 전이로 설명됩니다.

### 상태 정의

| 상태 | 설명 | 영속성 컨텍스트와의 관계 |
|------|------|-------------------------|
| `new` / `transient` | `new User()`로 막 만든 상태 | 관리 대상 아님 |
| `managed` / `persistent` | 영속성 컨텍스트가 추적 중인 상태 | 변경 시 자동으로 `UPDATE` 생성 |
| `detached` | 한때 관리됐지만 영속성 컨텍스트가 닫혀 추적이 끊긴 상태 | 변경해도 DB 반영 안 됨 |
| `removed` | 삭제 예약된 상태 | 커밋 시 `DELETE` |

### 상태 전이 흐름

```text
             persist()                 commit / close
 new ───────────────────────▶ managed ─────────────────▶ detached
                                │  ▲
                        remove()│  │ merge()
                                ▼  │
                              removed
```

각 전이는 구체적으로 이렇게 일어납니다.

- `persist(entity)` — `new` 엔티티를 `managed`로 바꿉니다. 이 시점에 `INSERT` SQL이 바로 나가지는 않습니다 (단, `IDENTITY` 전략은 예외. Phase 5에서 다룹니다)
- `find()` / `JPQL` 조회 — DB에서 읽어온 엔티티를 `managed` 상태로 영속성 컨텍스트에 넣습니다
- `remove(entity)` — `managed` 엔티티를 `removed`로 바꿉니다. 커밋 시점에 `DELETE`가 나갑니다
- `detach(entity)` / 영속성 컨텍스트 종료 — `managed`가 `detached`로 바뀝니다
- `merge(detachedEntity)` — `detached` 엔티티의 **내용을 새 `managed` 인스턴스에 복사**합니다

### 가장 많이 틀리는 지점: `merge`는 원본을 영속화하지 않습니다

JPA 명세에서 `merge()`는 **인자로 받은 `detached` 엔티티를 반환값이 가리키는 새로운 `managed` 인스턴스에 복사**하는 연산입니다. 원본 `detached` 엔티티는 그대로 남아 있고, **반환된 새 인스턴스**만 `managed`입니다.

```kotlin
val detached = User(id = 1, name = "before")
val managed = entityManager.merge(detached)

detached.name = "after"   // 반영 안 됨 (still detached)
managed.name = "after"    // 반영됨 (managed)
```

`merge`가 필요한 경우는 제한적입니다. 대부분의 실무 코드는 **`find()`로 `managed` 상태의 엔티티를 먼저 가져와서 값을 바꾸는 패턴**이 더 안전합니다.

## Phase 3. 1차 캐시 — 왜 같은 ID 조회가 한 번만 나가나요?

### 핵심: 식별자 기반 동일성 맵

영속성 컨텍스트는 내부적으로 **`(엔티티 클래스, 식별자) → 엔티티 인스턴스`** 로 매핑되는 Map을 들고 있습니다. 이걸 JPA에서는 **1차 캐시**, 또는 **identity map** 이라고 부릅니다.

`find()`가 호출되면 JPA는 이렇게 동작합니다.

1. 영속성 컨텍스트의 1차 캐시에 해당 `(클래스, id)` 키가 있는지 먼저 봅니다
2. 있으면 **DB에 쿼리를 보내지 않고** 이미 들고 있는 인스턴스를 반환합니다
3. 없으면 DB에서 읽어와 1차 캐시에 넣고 반환합니다

```kotlin
@Transactional
fun demo(id: Long) {
  val u1 = userRepository.findById(id).get()  // SELECT 실행
  val u2 = userRepository.findById(id).get()  // SQL 나가지 않음
  println(u1 === u2)  // true
}
```

### 동일성 보장의 의미

같은 영속성 컨텍스트 안에서 같은 ID로 조회한 엔티티는 `===` 가 성립합니다. 서로 다른 인스턴스가 아니라 **정확히 같은 객체**입니다. 이 보장이 있기 때문에 한 트랜잭션 안에서 한쪽에서 바꾼 값이 다른 쪽에서 그대로 보입니다.

### 1차 캐시의 범위가 좁다는 점도 같이 기억해야 합니다

- **트랜잭션 스코프**에서 끝납니다. 트랜잭션이 끝나면 캐시도 사라집니다
- **다른 트랜잭션과 공유되지 않습니다**. 1차 캐시는 요청 단위 캐시지, 애플리케이션 레벨 캐시가 아닙니다
- **JPQL로 조회하면 `SELECT`가 반드시 나갑니다**. JPQL은 "먼저 DB에 물어보고, 그 결과를 1차 캐시에 있는 것과 맞춰" 반환합니다. JPQL 자체는 캐시를 읽지 않습니다

> **참고:** 애플리케이션 전체에서 공유되는 캐시가 필요하면 **2차 캐시(`SessionFactory` 레벨)** 나 **Redis 같은 외부 캐시**를 따로 구성해야 합니다. 2차 캐시는 별도 글에서 다룹니다. 외부 캐시 전략은 [캐시 전략 글](/posts/16-cache-strategy-fundamentals)을 참고하세요.

## Phase 4. 변경 감지(`Dirty Checking`) — 왜 `UPDATE` 없이 값이 반영되나요?

### 핵심: 스냅샷 비교로 바뀐 필드를 찾아냅니다

영속성 컨텍스트가 엔티티를 처음 로드할 때, JPA는 그 엔티티의 **스냅샷(초기 필드 값들)** 을 같이 저장해 둡니다. 그리고 커밋이나 `flush` 시점에 현재 엔티티의 값과 스냅샷을 비교해서 **바뀐 필드에 대해서만 `UPDATE` SQL을 생성**합니다.

```kotlin
@Transactional
fun rename(id: Long, newName: String) {
  val user = userRepository.findById(id).get()  // 스냅샷 저장
  user.name = newName                           // 필드만 변경
  // save() 호출 없이 트랜잭션 커밋
}
```

위 코드는 `save()`를 부르지 않았지만 커밋 직전에 `UPDATE user SET ... WHERE id = ?` 이 나갑니다.

### 왜 이 설계가 안전한가요?

- **바뀐 엔티티만 SQL이 생성**되므로 불필요한 `UPDATE`가 줄어듭니다
- **낙관적 잠금과 결합**하면 충돌을 정확히 판정할 수 있습니다 (`@Version`과 함께)
- **트랜잭션 경계 안에서만 반영**되기 때문에 의도하지 않은 중간 상태가 남지 않습니다

### 주의: 기본적으로 모든 컬럼이 `UPDATE` 문에 포함됩니다

Hibernate는 기본 동작으로 **변경 감지로 바꿀 필드가 하나라도 생기면 엔티티의 모든 컬럼을 `UPDATE` SQL에 포함**시킵니다. 바뀐 컬럼만 포함시키려면 엔티티에 `@DynamicUpdate` 를 붙여야 합니다. 다만 이 옵션을 기본으로 켜는 것은 권장되지 않습니다. SQL이 동적으로 바뀌면 DB의 SQL 플랜 캐시 적중률이 떨어지기 때문에, 테이블의 컬럼 수가 아주 많거나 특정 컬럼의 `UPDATE` 비용이 현저히 큰 경우에 선택적으로 적용합니다.

```kotlin
@Entity
@DynamicUpdate
class Product(
  @Id val id: Long,
  var name: String,
  var description: String,
  // ... 수십 개 컬럼
)
```

### 흔한 오해: 변경 감지는 `setter` 호출 시점에 일어나지 않습니다

변경 감지는 **`setter`가 호출될 때 즉시 동작하지 않습니다.** `flush` 시점에 **모든 `managed` 엔티티의 현재 값과 스냅샷을 한꺼번에 비교**하는 방식입니다. 그래서 한 트랜잭션 안에서 같은 필드를 여러 번 바꿔도 최종적으로 나가는 `UPDATE`는 한 번입니다.

## Phase 5. 쓰기 지연과 `flush` — SQL은 언제 실제로 나가나요?

### 핵심: 영속성 컨텍스트는 SQL을 모아뒀다가 한꺼번에 내보냅니다

`persist()`로 예약된 `INSERT`, 변경 감지로 생긴 `UPDATE`, `remove()`로 생긴 `DELETE` 는 **바로 DB로 전송되지 않습니다**. 영속성 컨텍스트가 내부 큐(**action queue**)에 쌓아뒀다가 **`flush` 시점에 한꺼번에 내보냅니다**.

### `flush`가 일어나는 세 가지 시점

Hibernate 6 기준, `flush`는 다음 중 하나일 때 일어납니다.

1. **트랜잭션 커밋 직전** — 기본 동작. 가장 흔합니다
2. **JPQL / Criteria 쿼리 실행 직전** — `FlushMode`가 `AUTO`(기본값)일 때. 쿼리가 방금 변경한 내용을 보려면 DB에 먼저 반영돼야 하기 때문입니다
3. **`em.flush()` 를 명시적으로 호출** — ID가 필요하거나 특정 시점에 강제로 내보내야 할 때

```kotlin
@Transactional
fun createOrder(userId: Long): Long {
  val order = Order(userId = userId)
  val saved = orderRepository.save(order)

  // 여기서 JPQL을 실행하면 AUTO flush로 INSERT가 먼저 나감
  val count = orderRepository.countByUserId(userId)

  return saved.id
  // 메서드 종료 시 커밋 직전에 남은 작업들이 flush
}
```

### `FlushMode`를 `COMMIT`으로 바꾸면?

JPA의 `FlushModeType`은 `AUTO`(기본)와 `COMMIT` 두 가지입니다. `COMMIT`으로 바꾸면 쿼리 실행 전에 `flush`가 일어나지 않고 **오직 커밋 직전에만** 일어납니다.

- **장점**: 불필요한 중간 `flush`가 줄어 성능에 유리할 수 있습니다
- **단점**: 쿼리 결과가 "방금 변경한 내용"을 반영하지 않을 수 있습니다. 정말 의도가 분명한 경우에만 선택하세요

### `INSERT`가 앞당겨지는 이유 — `IDENTITY` 전략의 함정

ID 생성 전략이 `GenerationType.IDENTITY`일 때는 `persist()` 호출 순간에 바로 `INSERT`가 실행됩니다. ID를 DB가 생성하기 때문에, ID를 모르면 영속성 컨텍스트에 넣을 수조차 없습니다. 이 때문에 **`IDENTITY` 전략은 JDBC batch insert 최적화를 막습니다**. Hibernate가 엔티티를 영속화하는 매 순간 ID를 얻으려고 `INSERT`를 개별적으로 실행하기 때문에, `hibernate.jdbc.batch_size`를 설정해도 묶이지 않습니다.

대용량 `INSERT`가 많은 테이블이라면 다른 선택지를 검토합니다.

- **PostgreSQL/Oracle**: `SEQUENCE` 전략 (ID를 미리 받아와 배치 가능)
- **MySQL**: `AUTO_INCREMENT = IDENTITY` 이므로 시퀀스가 없습니다. 애플리케이션이 ID를 만들어 `UUIDv7`이나 `Snowflake ID`를 쓰는 접근이 현실적입니다

배치 쓰기 최적화 자체는 별도 글에서 깊게 다룹니다.

## Phase 6. 영속성 컨텍스트의 범위는 어디까지인가요?

### 기본값: 트랜잭션 스코프

Spring의 `@Transactional`과 함께 쓰는 일반적인 설정에서 영속성 컨텍스트는 **하나의 트랜잭션과 같은 수명**을 가집니다.

```text
controller
   │
   ▼
@Transactional service.doWork()  ← 진입 시 PC 열림
   │
   ▼
repository.findById()            ← 이 안에서 managed
   │
   ▼
@Transactional 끝                ← PC 닫힘, 엔티티는 detached
```

### OSIV — 컨트롤러/뷰까지 확장되는 범위

Spring Boot는 기본적으로 `spring.jpa.open-in-view=true` 입니다. 이 옵션이 켜져 있으면 **영속성 컨텍스트의 수명이 HTTP 요청 단위**로 확장됩니다. 컨트롤러와 뷰 렌더링 단계에서도 `LAZY` 연관이 로딩됩니다.

OSIV의 실질적 의미는 다음과 같습니다.

- **장점**: 컨트롤러/뷰에서 `LAZY` 연관을 접근해도 `LazyInitializationException`이 터지지 않습니다
- **단점**: **DB 커넥션이 뷰 렌더링이 끝날 때까지 반환되지 않습니다**. 요청 단위로 커넥션을 물고 있기 때문에 외부 API 호출이 섞이거나 뷰 렌더링이 느려지면 커넥션 풀이 금방 고갈됩니다

트래픽이 큰 서비스는 **`open-in-view=false`** 로 끄고, 서비스 레이어에서 필요한 연관을 전부 로딩해 DTO로 내려주는 패턴을 권장합니다. 커넥션 풀 동작과 고갈 원인은 [커넥션 풀 글](/posts/12-database-connection-pool-fundamentals)에서 다뤘습니다.

### `Extended` 영속성 컨텍스트

JPA 명세는 `@PersistenceContext(type = PersistenceContextType.EXTENDED)` 로 영속성 컨텍스트의 수명을 여러 트랜잭션에 걸쳐 유지할 수 있게 허용합니다. 다만 Stateful Session Bean 같은 환경이 전제되기 때문에 일반적인 Spring Boot + `@Transactional` 구성에서는 거의 쓰지 않습니다.

## Phase 7. 자주 만나는 함정

### 1. 트랜잭션 밖에서 엔티티 수정

```kotlin
fun update(id: Long, newName: String) {
  val user = userRepository.findById(id).get()
  user.name = newName
  // 반영 안 됨
}
```

`@Transactional`이 없어 `findById` 호출 직후 트랜잭션이 끝나고, 엔티티는 `detached` 상태가 됩니다. 변경은 메모리의 인스턴스에만 남고 DB로 흘러가지 않습니다. 이런 실수는 대부분 **서비스 메서드에 `@Transactional`을 빼먹어서** 생깁니다.

### 2. `@Transactional`이 `self-invocation`으로 우회됨

`@Transactional`은 Spring AOP 프록시 기반이라 **같은 클래스 안에서 다른 메서드를 직접 호출하면 프록시를 거치지 않습니다**. 즉 `@Transactional`이 아예 걸리지 않습니다. 이 주제는 다음 글에서 따로 다룹니다.

### 3. 영속성 컨텍스트가 너무 커짐

한 트랜잭션에서 수만 건의 엔티티를 `findAll()` 해서 루프를 돌리면 1차 캐시가 메모리를 크게 차지합니다. 벌크 작업에서는 다음 중 하나를 선택합니다.

- 주기적으로 `em.flush()` + `em.clear()` 로 영속성 컨텍스트를 비웁니다
- JPQL 벌크 `UPDATE`/`DELETE` 를 씁니다
- 아예 `JdbcTemplate` 이나 `JDBC` 배치로 우회합니다

### 4. 벌크 JPQL 이후 영속성 컨텍스트 오염

```kotlin
@Transactional
fun deactivateAll() {
  val users = userRepository.findAll()        // 1000건 managed

  em.createQuery("UPDATE User u SET u.active = false")
    .executeUpdate()                          // DB만 바뀜

  users.first().active  // true (1차 캐시는 그대로)
}
```

JPQL 벌크 연산은 **영속성 컨텍스트를 거치지 않고 DB에만 반영**합니다. 이 시점 이후의 1차 캐시는 DB와 달라진 상태가 됩니다. 벌크 연산 직후에는 `em.clear()` 를 부르거나, 그 이후에 해당 엔티티를 쓰지 않도록 흐름을 나눕니다.

## 정리

영속성 컨텍스트는 "자동으로 SQL을 만들어 주는 마법"이 아니라, **엔티티의 현재 모습과 DB에서 읽어온 스냅샷을 같이 들고 있으면서 커밋 직전에 그 둘을 비교해 필요한 SQL을 만드는 구조**입니다. 네 가지 효과는 이 구조에서 자연스럽게 따라 나옵니다.

| 효과 | 원리 |
|------|------|
| 1차 캐시 | `(클래스, id) → 인스턴스` 매핑을 유지 |
| 변경 감지 | 현재 값과 스냅샷을 `flush` 시점에 비교 |
| 쓰기 지연 | SQL을 큐에 쌓아 `flush` 시점에 배치 전송 |
| 동일성 보장 | 같은 식별자에 대해 항상 같은 인스턴스만 반환 |

실무에서 실수는 대부분 **영속성 컨텍스트의 범위를 오해**해서 생깁니다. 트랜잭션 밖, `self-invocation`으로 프록시를 거치지 않은 경우, 벌크 JPQL 이후처럼 **영속성 컨텍스트가 닫혔거나 우회된 상황**을 먼저 의심하면 원인을 빨리 찾을 수 있습니다.

이 글에서 잡은 기반 위에서 다음 글은 **`LAZY` / `EAGER` Fetch 전략과 N+1이 생기는 진짜 이유**로 이어집니다. 변경 감지와 1차 캐시가 머리에 들어오면, N+1이 왜 생기고 왜 `fetch join`이 그것을 해결하는지가 훨씬 명확해집니다.

---
title: "JPA `flush`와 OSIV 완전 정복 — 영속성 컨텍스트의 경계는 어디까지인가요?"
date: "2026-04-27"
category: "study"
tags: ["영속성 컨텍스트"]
excerpt: "flush가 언제 일어나는지, FlushMode별 동작 차이, OSIV가 커넥션을 언제까지 붙들고 있는지, 그리고 실무에서 open-in-view를 끄면 벌어지는 일들을 Hibernate/Spring Boot 레퍼런스 기준으로 정리합니다."
---

## `flush`와 OSIV, 왜 따로 다뤄야 하나요?

영속성 컨텍스트의 동작 원리는 [앞 글](/posts/38-jpa-persistence-context)에서 다뤘습니다. 이 글은 그 다음 질문 — **"그래서 `flush`는 정확히 언제 일어나고, 영속성 컨텍스트는 언제까지 열려 있는가"** 에 답합니다. 실무에서 자주 만나는 증상들이 전부 이 경계에서 발생합니다.

- **목록 API 응답이 튀는데 쿼리 로그에는 이상한 `SELECT`가 뷰 렌더링 중에 찍혀 있습니다**
- 벌크 `UPDATE` JPQL 이후 **이전에 로드한 엔티티 값이 DB와 다릅니다**
- 외부 API를 호출하는 서비스에서 **커넥션 풀이 쉽게 고갈됩니다**
- `@Transactional(readOnly = true)` 로 바꿨는데 **기대한 만큼 빨라지지 않습니다**

이 증상들은 `flush`가 언제 일어나는지와 영속성 컨텍스트가 어느 범위에서 살아 있는지를 알지 못하면 디버깅이 오래 걸립니다. 이 글은 두 개념을 한 줄에 묶어 **"쓰기 타이밍"과 "스코프 경계"** 두 축으로 정리합니다.

> **기준:** 이 글은 **Jakarta Persistence 3.1 (JPA 3.1) 명세**와 **Hibernate 6.x** / **Spring Boot 3.x** 기준으로 작성합니다. `flush`는 [Jakarta Persistence 3.1 — §3.2.4 Synchronization to the Database](https://jakarta.ee/specifications/persistence/3.1/jakarta-persistence-spec-3.1.html)와 [Hibernate 6 User Guide — §8. Flushing](https://docs.jboss.org/hibernate/orm/6.6/userguide/html_single/Hibernate_User_Guide.html#flushing) 기준으로 설명합니다. OSIV는 Spring Boot의 `spring.jpa.open-in-view` 속성 동작과 [`OpenEntityManagerInViewInterceptor`](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/orm/jpa/support/OpenEntityManagerInViewInterceptor.html) JavaDoc을 참조합니다. 코드 예시는 Kotlin + Spring Boot입니다.

## 먼저 가장 짧은 답부터 보면

- `flush`는 **`COMMIT`이 아닙니다.** SQL을 DB에 "보내는 것"일 뿐이며, 커밋은 별개 단계에서 일어납니다
- `FlushMode`의 기본값은 **`AUTO`** 로, **JPQL 실행 직전과 커밋 직전**에 자동으로 `flush`합니다
- OSIV(Open Session In View)는 영속성 컨텍스트를 **HTTP 요청이 끝날 때까지** 열어두는 옵션입니다. 기본 `true` 입니다
- OSIV가 켜져 있으면 **DB 커넥션이 서비스 레이어를 벗어나서도 뷰 렌더링이 끝날 때까지 점유**됩니다
- 트래픽이 크면 OSIV를 끄고 **서비스 레이어에서 DTO로 내려주는 패턴**이 권장됩니다

## Phase 1. `flush`와 `commit`은 같은 게 아닙니다

### 핵심: `flush`는 SQL 전송, `commit`은 트랜잭션 확정

이 둘은 아주 자주 혼동됩니다. 실제로 일어나는 일은 완전히 다릅니다.

| 동작 | 의미 |
|------|------|
| `flush` | 영속성 컨텍스트에 쌓여 있던 SQL을 DB로 **전송** |
| `commit` | 그 시점까지 DB에 쓰인 변경 사항을 **영구화** |

`flush` 후에 `rollback`이 오면, DB에 이미 전송된 SQL은 **롤백**됩니다. 즉 `flush`로 보낸 내용은 아직 **트랜잭션 내부의 중간 상태**일 뿐입니다. 이 차이 때문에 `em.flush()`를 호출해도 다른 트랜잭션에서는 그 변경이 보이지 않습니다 (기본 격리 수준 `REPEATABLE READ` 기준).

```text
BEGIN
  INSERT ...    ← em.persist()
  UPDATE ...    ← dirty checking
  em.flush()    ← 여기서 위 SQL이 DB로 전송
  SELECT ...    ← 같은 트랜잭션에서는 보임
  em.flush()를 여러 번 해도 커밋 전까지는 다른 세션에 안 보임
COMMIT          ← 이 순간부터 영구 반영
```

### 왜 이 구분이 중요한가요?

`flush`를 명시적으로 호출해야 하는 경우는 드뭅니다. 다만 다음 상황에서는 `flush` 시점을 정확히 알아야 합니다.

- **벌크 JPQL 직전**: `AUTO` flush 모드는 JPQL 실행 전에 `flush`를 내보내 **쓰기 지연 상태를 DB에 반영**합니다
- **ID가 당장 필요할 때**: `IDENTITY` 전략이 아닌 경우, `persist()` 후에 ID를 써야 하면 명시적 `flush`가 필요할 수 있습니다
- **벌크 루프 처리**: 영속성 컨텍스트가 너무 커지지 않게 주기적으로 `em.flush() + em.clear()`를 수동으로 호출

## Phase 2. `FlushMode` 세 가지의 차이

JPA 명세는 `FlushModeType.AUTO` 와 `FlushModeType.COMMIT` 두 가지만 정의합니다. Hibernate는 여기에 `MANUAL` 을 확장으로 추가합니다.

| 모드 | `flush` 트리거 | 용도 |
|------|---------------|------|
| `AUTO` (기본값) | 커밋 직전 + JPQL/Criteria 실행 직전 | 대부분의 실무 코드 |
| `COMMIT` | 커밋 직전에만 | 중간 flush를 의도적으로 피하고 싶을 때 |
| `MANUAL` (Hibernate 확장) | `em.flush()` 호출 시에만 | **읽기 전용 전용** 최적화 |

### `AUTO` — 왜 JPQL 전에 `flush`가 필요한가요?

영속성 컨텍스트에만 있는 변경 사항은 **DB에 아직 반영되지 않은 상태**입니다. 이 상태에서 JPQL `SELECT` 를 날리면, 방금 영속성 컨텍스트에서 바꾼 값은 조회 결과에 반영되지 않습니다. `AUTO` 모드는 이 상황을 막기 위해 **쿼리 직전에 자동으로 `flush`** 합니다.

```kotlin
@Transactional
fun demo(id: Long) {
  val order = em.find(Order::class.java, id)
  order.status = "CANCELED"  // 아직 DB에 안 감

  val canceled = em.createQuery(
    "SELECT o FROM Order o WHERE o.status = 'CANCELED'",
    Order::class.java
  ).resultList
  // 위 SELECT 직전에 AUTO flush → UPDATE가 먼저 나가고
  // 그 결과 canceled에 해당 Order가 포함됨
}
```

### `COMMIT` — 중간 flush 비용을 줄이고 싶을 때

루프 안에서 수많은 JPQL을 섞어 쓰는 코드가 있다면 `AUTO` 는 매 쿼리 직전에 `flush`를 반복할 수 있습니다. `COMMIT`으로 바꾸면 **커밋 직전에만** `flush`가 일어나서 불필요한 중간 전송이 줄어듭니다.

단점은 **JPQL 결과가 방금 변경한 내용을 반영하지 않을 수 있다**는 것입니다. 팀 전체가 이 동작을 인지하지 못하면 **조용히 잘못된 결과**를 내는 버그가 생깁니다. 이 모드를 전역으로 켜는 것은 권장하지 않습니다.

### Hibernate `MANUAL` — 읽기 전용 전용

Hibernate 확장 `MANUAL` 모드는 **`em.flush()`를 명시적으로 호출하지 않는 한 절대 `flush`하지 않습니다**. `@Transactional(readOnly = true)` 를 켜면 Spring의 JPA 통합이 이 모드를 자동으로 적용합니다.

`readOnly = true` 의 실제 효과가 바로 이것입니다.

- 변경 감지 스냅샷 비교를 **건너뜁니다**
- `flush` 자체가 일어나지 않아 **쓰기 지연 큐도 처리하지 않습니다**
- 결과적으로 읽기 전용 트랜잭션의 성능이 쓰기 트랜잭션보다 가볍습니다

이 효과 때문에 **목록 조회/리포트 API의 서비스 메서드에는 거의 기본값처럼** `@Transactional(readOnly = true)` 를 붙입니다.

## Phase 3. `flush` 시점에 Hibernate가 실제로 하는 일

### 순서

Hibernate는 `flush` 시점에 다음 작업을 **이 순서대로** 수행합니다.

```text
1. 영속성 컨텍스트의 모든 managed 엔티티를 훑음
2. 변경 감지 — 스냅샷과 비교해 달라진 엔티티 목록을 추림
3. action queue 정렬 — 고정된 실행 순서로 SQL 생성
   (1) OrphanRemoval     ← 고아 객체 제거
   (2) EntityInsert       ← INSERT
   (3) EntityUpdate       ← UPDATE
   (4) CollectionRemove / CollectionUpdate / CollectionRecreate
   (5) EntityDelete       ← DELETE
4. JDBC 배치로 SQL 전송
5. 영속성 컨텍스트 상태를 "flushed"로 마킹
```

### 순서가 고정되어 있다는 점의 의미

같은 엔티티에 대해 `UPDATE`와 `DELETE`를 섞어 부르면 Hibernate가 재정렬합니다. 그래서 **메서드에서 호출한 순서와 실제 SQL이 나가는 순서는 다를 수 있습니다**. 특히 **`orphanRemoval`은 `INSERT`보다 먼저 실행**되기 때문에, 같은 트랜잭션에서 "자식 하나를 제거하고 새 자식을 추가"하면 기대와 달리 유니크 제약이 잡히는 등 예상치 못한 동작이 생기기 쉽습니다.

정렬 순서를 보장하면서 순차적으로 내보내야 한다면 **중간에 `em.flush()`를 수동으로** 호출해 경계를 명확히 나누는 편이 안전합니다.

### 벌크 JPQL 이후 영속성 컨텍스트는 이미 "오염"되어 있습니다

```kotlin
@Transactional
fun deactivateAll() {
  val users = userRepository.findAll()  // 영속성 컨텍스트에 로딩

  em.createQuery("UPDATE User u SET u.active = false")
    .executeUpdate()  // DB는 바뀌지만 1차 캐시는 그대로

  users.first().active  // 여전히 true
}
```

JPQL 벌크 연산은 **영속성 컨텍스트를 거치지 않고 DB에 직접 반영**됩니다. `flush`와 무관합니다. 이 시점 이후 1차 캐시의 엔티티는 **DB와 다른 상태**가 됩니다. 벌크 연산 직후에는 `em.clear()`를 호출해 영속성 컨텍스트를 비우고, 필요하면 다시 로딩하는 편이 안전합니다.

## Phase 4. OSIV — 영속성 컨텍스트를 HTTP 요청 전체로 확장

### OSIV가 하는 일

OSIV(Open Session In View)는 Spring Boot가 기본으로 `true`로 켜두는 설정입니다. 이 설정이 켜져 있으면 **영속성 컨텍스트의 수명이 서비스 레이어가 아니라 HTTP 요청 전체**로 늘어납니다.

```text
OSIV OFF
  [Filter] → [Controller] → [Service @Transactional] → [Repository]
                                  └ PC 열림 ─ PC 닫힘 ┘
                            (이후 컨트롤러/뷰에서 LAZY 접근 시 예외)

OSIV ON
  [Filter] → [Controller] → [Service @Transactional] → [Repository]
     └ PC 열림 ──────────────────────────────────── PC 닫힘 ┘
                                                     (View 렌더링 이후)
```

### OSIV가 커넥션을 언제 점유하는가

흔한 오해가 있습니다. "OSIV가 켜져 있으면 요청 전체가 같은 트랜잭션이다"라는 생각입니다. 사실은 다릅니다.

- **트랜잭션**은 여전히 `@Transactional` 경계에서 시작하고 끝납니다. OSIV와 무관합니다
- OSIV가 유지하는 것은 **영속성 컨텍스트(`EntityManager`)와 DB 커넥션** 입니다

즉, `@Transactional`이 끝나 커밋되었어도 **커넥션 자체는 반환되지 않고** 영속성 컨텍스트에 매달려 뷰 렌더링이 끝날 때까지 대기합니다. 이 때문에 **뷰 렌더링이 느리면 커넥션이 그만큼 오래 점유**됩니다.

### 왜 이 설계가 만들어졌나요?

OSIV는 한때 **뷰에서 `LazyInitializationException`을 피하기 위한 실용적 해결책**이었습니다. 서버 사이드 템플릿(JSP, Thymeleaf)이 엔티티를 직접 받아 렌더링하는 시절에는, 뷰에서 `user.orders`처럼 LAZY 연관에 접근해도 예외가 터지지 않도록 영속성 컨텍스트를 계속 열어두는 것이 유용했습니다. 그래서 Spring Boot는 **호환성과 편의를 위해 기본값을 `true`** 로 둡니다.

### 트래픽이 커지면 무엇이 문제인가요?

API 서버 시대에는 다음 이유로 **OSIV가 오히려 병목**이 됩니다.

1. **커넥션 점유 시간이 뷰/직렬화 단계까지 늘어납니다**. HTTP 응답이 큰 JSON 직렬화에 시간이 걸리면 그 동안 커넥션이 반환되지 않습니다
2. **외부 API 호출이 컨트롤러 레이어에 섞이면** 그 동안 커넥션이 물린 채 네트워크 대기를 합니다
3. **동시 요청 수에 비례해 커넥션 수요**가 커져 풀이 쉽게 고갈됩니다. 이 동작은 [커넥션 풀 글](/posts/12-database-connection-pool-fundamentals)에서 다룬 고갈 패턴과 직접 연결됩니다

### OSIV를 끌 때 벌어지는 일

```yaml
spring:
  jpa:
    open-in-view: false
```

이 설정을 끄면 **서비스 레이어를 벗어나는 순간 영속성 컨텍스트가 닫힙니다**. 커넥션도 그 시점에 반환됩니다.

대신 이런 증상들이 드러납니다.

- 컨트롤러/뷰에서 LAZY 연관을 접근하면 **`LazyInitializationException`** 이 발생합니다
- 엔티티를 그대로 JSON 직렬화하던 코드가 연관 필드에서 예외를 냅니다

이 예외들은 **원래부터 있던 구조적 위험이 수면 위로 올라온 것**입니다. OSIV는 이걸 "뷰까지 LAZY가 되도록" 미뤄뒀을 뿐, 위험 자체를 없앤 적이 없습니다.

## Phase 5. OSIV를 끄는 실무 패턴

### 원칙: 서비스 레이어에서 필요한 모든 것을 조합해 DTO로 내려준다

OSIV를 끄는 순간 구조적 질문 하나가 강제됩니다. **"응답에 필요한 데이터를 서비스 레이어에서 확정 지을 수 있는가?"** 답이 예여야 합니다.

```kotlin
@Service
class OrderQueryService(
  private val orderRepository: OrderRepository
) {

  @Transactional(readOnly = true)
  fun getOrderSummary(userId: Long): List<OrderSummaryDto> {
    val orders = orderRepository.findWithItemsByUserId(userId)
    // 이 시점에 items도 이미 로딩됨
    return orders.map { OrderSummaryDto.from(it) }
    // 트랜잭션이 끝나기 전에 DTO 변환 완료
  }
}
```

핵심은 두 가지입니다.

- 서비스 메서드 안에서 **필요한 연관을 미리 로딩** (fetch join, `@EntityGraph`, `@BatchSize`. [앞 글](/posts/40-jpa-n-plus-1-solution-tools) 참고)
- 서비스 메서드 안에서 **DTO로 변환해 내려줌**

### 컨트롤러에는 순수 DTO만 전달

컨트롤러 레이어까지 엔티티를 내려보내면 OSIV가 꺼진 상태에서 LAZY 예외가 언제든 튈 수 있습니다. 컨트롤러에서 받는 타입은 **DTO**로 제한합니다. 이 규칙을 유지하면 OSIV가 켜졌든 꺼졌든 동작이 바뀌지 않습니다.

### 외부 API 호출은 트랜잭션 밖에서

외부 HTTP 호출은 **트랜잭션 안에 들어오면 안 됩니다**. 응답이 느리거나 멈추면 커넥션이 그 시간만큼 점유되고, 요청이 몰리면 풀이 금방 비어 버립니다.

일반적인 실무 구조는 이렇습니다.

```text
[Service @Transactional]       [Service (no tx)]
    저장/변경 작업       →           외부 API 호출
                                       ↓
                                   (필요 시)
                          [Service @Transactional]
                                 후처리 저장
```

외부 호출을 기준으로 트랜잭션을 쪼개면, 커넥션 점유 시간이 크게 줄어듭니다.

### `readOnly = true`를 기본값처럼 쓰기

조회 API의 서비스 메서드에는 **대부분 `@Transactional(readOnly = true)`** 를 기본으로 붙입니다. Phase 2에서 설명한 대로 Hibernate의 flush가 비활성화되고, 리드 레플리카로 라우팅하는 구성을 조합하기 쉬워집니다.

## 정리

`flush`와 OSIV는 한 가지 공통 질문을 던집니다. "**영속성 컨텍스트의 쓰기와 스코프가 정확히 어디서 일어나는가?**"

`flush` 쪽의 기억할 점은 이렇습니다.

- `flush` 는 **커밋이 아닙니다**. 커밋 전까지는 트랜잭션 내부 상태일 뿐입니다
- `AUTO` 모드의 기본 동작은 **JPQL 실행 직전과 커밋 직전** 두 시점에 자동으로 일어납니다
- `@Transactional(readOnly = true)` 는 Hibernate `MANUAL` 모드를 켜서 flush 자체를 건너뛰게 합니다
- 벌크 JPQL은 **영속성 컨텍스트를 우회**하므로 직후에는 `em.clear()` 를 고려합니다

OSIV 쪽의 기억할 점은 이렇습니다.

- 기본값은 `true`이고, 켜져 있으면 **커넥션이 뷰 렌더링이 끝날 때까지 점유**됩니다
- 트래픽이 큰 API 서버에서는 끄는 편이 거의 항상 안전합니다
- 끄면 **LAZY 예외가 서비스 레이어 위에서 드러나므로**, 필요한 연관은 서비스 메서드에서 미리 로딩해 **DTO로 확정**시켜 내려줍니다
- 외부 API 호출은 트랜잭션 밖으로 빼 커넥션을 일찍 반환시킵니다

이 두 축을 맞추고 나면, 서비스 레이어와 컨트롤러 사이에서 벌어지는 대부분의 "이상한 쿼리"와 "커넥션 고갈"을 줄일 수 있습니다. 다음 글은 JPA의 쓰기 성능을 밀어붙이는 실제 방법 — **배치 `INSERT`와 `hibernate.jdbc.batch_size`** 를 다룹니다.

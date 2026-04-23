---
title: "N+1 해결 도구 완전 정복 — `fetch join` / `@EntityGraph` / `@BatchSize`는 언제 쓰나요?"
date: "2026-04-24"
category: "study"
tags: ["N+1", "Fetch 전략"]
excerpt: "JPA에서 N+1을 줄이는 세 가지 도구인 fetch join, @EntityGraph, @BatchSize는 해결하는 축이 각각 다릅니다. 단일 연관과 컬렉션, 페이징 여부, 재사용성 관점에서 상황별 선택 기준을 정리합니다."
---

## 세 도구, 왜 비교해서 알아야 하나요?

N+1을 줄일 수 있는 도구는 JPA에 여러 개 있는데, 많은 문서가 "`fetch join`을 쓰자"로 끝납니다. 실제로는 상황에 따라 `fetch join`으로 해결이 안 되거나 오히려 더 나쁜 선택이 됩니다.

- `fetch join`으로 묶고 싶은 연관이 **두 개 이상의 컬렉션**입니다
- 한 레포지토리 메서드를 **두 가지 컨텍스트**에서 쓰는데 한쪽만 연관이 필요합니다
- **페이징**이 필요한 목록 조회에서 컬렉션까지 로딩해야 합니다
- 이미 여러 경로에서 같은 엔티티를 조회하는데, 조회마다 `fetch join` JPQL을 새로 짜기 번거롭습니다

이 상황마다 적합한 도구가 다릅니다. `fetch join`, `@EntityGraph`, `@BatchSize` 는 **N+1을 줄인다는 목표는 같지만, 해결하는 축이 서로 다릅니다**. 이 글은 세 도구의 동작을 각각 풀고, 마지막에 **상황별 선택 기준**을 표로 정리합니다.

> **기준:** 이 글은 **Jakarta Persistence 3.1 (JPA 3.1)** 명세와 **Hibernate 6.x** 구현을 기준으로 작성합니다. `fetch join`은 [Jakarta Persistence 3.1 — §4.4.5.3 Fetch Joins](https://jakarta.ee/specifications/persistence/3.1/jakarta-persistence-spec-3.1.html), `@EntityGraph`는 같은 명세의 `§3.7 Entity Graphs`, `@BatchSize`는 [Hibernate 6 User Guide — §5.1.6 Batch fetching](https://docs.jboss.org/hibernate/orm/6.6/userguide/html_single/Hibernate_User_Guide.html#fetching-batch)을 참조합니다. 이 글은 [JPA Fetch 전략 글](/posts/39-jpa-fetch-strategy)과 [영속성 컨텍스트 글](/posts/38-jpa-persistence-context)을 전제로 하고, 기본 N+1 개념은 [N+1 글](/posts/15-n-plus-1-query-problem)에서 이미 다뤘습니다. 코드 예시는 Kotlin + Spring Data JPA입니다.

## 먼저 가장 짧은 답부터 보면

세 도구는 **"쿼리 수를 어떻게 줄이는가"** 가 다릅니다.

- `fetch join` — **한 번의 `JOIN` 쿼리로** 연관을 함께 조회합니다
- `@EntityGraph` — **같은 아이디어**지만 JPQL을 바꾸지 않고 메서드에 선언합니다
- `@BatchSize` — 쿼리를 **0으로 줄이는 게 아니라 `N`개를 `IN` 쿼리 하나로 묶습니다**

| 관점 | `fetch join` | `@EntityGraph` | `@BatchSize` |
|------|-------------|----------------|--------------|
| 표준 | JPQL 문법 | JPA 표준 | Hibernate 확장 |
| 접근 방식 | 쿼리 재작성 | 메서드 애너테이션 | 로딩 시점 개선 |
| 쿼리 모양 | `LEFT JOIN` | `LEFT JOIN` | 원래 쿼리 + `IN` 쿼리 추가 |
| 컬렉션 2개 | 불가 | 불가 | 가능 |
| 페이징 + 컬렉션 | 위험 (메모리 페이징) | 위험 (같은 이유) | 안전 |
| 재사용성 | 쿼리마다 새로 작성 | 메서드 단위 재사용 | 엔티티 전역 설정 |

즉, "무조건 `fetch join`"이 아니라 **상황에 맞게 조합**하는 것이 정답입니다.

## Phase 1. `fetch join` — 한 번의 `JOIN`으로 끌어오기

### 핵심: JPQL에서 연관을 `JOIN FETCH`로 선언합니다

```kotlin
@Query("""
  SELECT o FROM Order o
  JOIN FETCH o.user
  WHERE o.status = :status
""")
fun findPaidOrdersWithUser(status: String): List<Order>
```

이 쿼리는 다음 하나의 SQL을 만듭니다.

```sql
SELECT o.*, u.*
FROM `order` o
LEFT JOIN user u ON o.user_id = u.id
WHERE o.status = ?;
```

부모와 연관이 한 번에 로딩되므로 루프 안에서 `order.user.name` 을 접근해도 추가 쿼리가 나가지 않습니다.

### 장점

- **표준 JPQL 문법**이라 어떤 JPA 구현체에서도 동작합니다
- **해당 쿼리에만** 적용되기 때문에, 같은 엔티티를 다른 쿼리에서는 `LAZY` 그대로 둘 수 있습니다

### 한계

- **JPQL을 직접 써야** 합니다. Spring Data 파생 쿼리(`findByStatus`)에는 적용할 수 없습니다
- **컬렉션 `JOIN FETCH`는 페이징과 궁합이 나쁩니다** (앞 글에서 다룬 카르테시안 곱과 메모리 페이징 경고)
- **두 개 이상의 컬렉션을 `JOIN FETCH`** 하면 `MultipleBagFetchException`이 납니다

### `JOIN FETCH` + `DISTINCT`

컬렉션을 `JOIN FETCH`하면 부모가 자식 수만큼 중복됩니다. JPA에서는 `SELECT DISTINCT`를 붙이는 관습이 있습니다.

```kotlin
@Query("""
  SELECT DISTINCT o FROM Order o
  JOIN FETCH o.items
  WHERE o.status = :status
""")
fun findPaidOrdersWithItems(status: String): List<Order>
```

Hibernate 6부터는 엔티티 레벨에서 이미 중복 제거를 해주기 때문에 `DISTINCT`는 **SQL 레벨 중복 제거를 막는 힌트** 정도로 의미가 줄었습니다. 여전히 명시적으로 붙이는 코드가 많지만, 반드시 필요한 것은 아닙니다.

## Phase 2. `@EntityGraph` — JPQL 없이 쿼리 단위로 연관 지정

### 핵심: 어떤 연관을 함께 로딩할지 메서드에 선언합니다

`@EntityGraph`는 JPA 2.1부터 표준입니다. Spring Data JPA에서는 리포지토리 메서드에 애너테이션으로 붙일 수 있습니다.

```kotlin
interface OrderRepository : JpaRepository<Order, Long> {

  @EntityGraph(attributePaths = ["user", "shippingAddress"])
  fun findByStatus(status: String): List<Order>
}
```

실행 시 Hibernate는 `user`와 `shippingAddress`를 **`LEFT JOIN`으로 묶은 쿼리**를 만듭니다. 동작 결과는 `fetch join`과 거의 같습니다.

### `fetch join`과 무엇이 다른가요?

기능상 겹치지만, **쿼리를 직접 쓰지 않고 연관만 선언**한다는 점이 중요합니다.

- Spring Data의 **파생 쿼리**(`findByStatus`, `findByUserId...`)에 그대로 붙일 수 있습니다
- **같은 메서드를 재사용**하면서 연관만 바꾸고 싶을 때 편리합니다
- 페치 그래프를 **재사용 가능한 이름**(`@NamedEntityGraph`)으로 정의해 둘 수도 있습니다

### 한계

- 내부적으로 `LEFT JOIN`을 쓰기 때문에 **컬렉션을 두 개 이상** 넣으면 `fetch join`과 같은 카르테시안 곱 문제가 생깁니다
- **페이징 + 컬렉션** 조합도 `fetch join`과 똑같이 메모리 페이징 경고가 뜹니다
- 연관마다 로딩 전략을 세밀하게 바꾸려면 **`EntityGraphType.FETCH` / `LOAD`** 의 차이를 이해해야 합니다 (대부분 기본값으로 충분합니다)

> **참고:** `@EntityGraph(type = EntityGraphType.FETCH)` 는 그래프에 포함된 연관만 `EAGER`로 당기고, 나머지는 `LAZY`로 둡니다. `LOAD` 타입은 그래프에 없는 연관을 **엔티티에 선언된 기본 Fetch 전략** 대로 둡니다. 기본값은 `FETCH` 입니다.

## Phase 3. `@BatchSize` — `IN` 쿼리로 묶어서 줄이기

### 핵심: 쿼리 수를 0으로 만들지는 않지만, N을 상수로 줄입니다

`@BatchSize`는 Hibernate 확장입니다. 프록시 또는 컬렉션이 초기화될 때 **한 번에 여러 부모의 연관을 묶어서 읽습니다**.

```kotlin
@Entity
class Order(
  @Id val id: Long,

  @OneToMany(mappedBy = "order", fetch = FetchType.LAZY)
  @BatchSize(size = 100)
  val items: List<OrderItem>,
)
```

이 엔티티에서 주문 50건을 읽고 각각 `items`를 접근하면, SQL은 다음처럼 나갑니다.

```text
SELECT * FROM `order` WHERE status = ?;              -- 1번
SELECT * FROM order_item WHERE order_id IN (?, ?, ..., ?);  -- 1번 (50개 IN)
```

쿼리는 **1 + 1 = 2번** 으로 끝납니다. 페이지 크기가 100을 넘으면 `IN` 묶음이 2번, 3번으로 늘어나지만 **여전히 상수입니다**.

### 장점

- **카르테시안 곱이 없습니다** — 각 테이블을 개별 쿼리로 읽기 때문에 행이 곱해지지 않습니다
- **두 개 이상의 컬렉션을 같이 로딩**해도 문제가 없습니다. 각각 별개의 `IN` 쿼리로 나갑니다
- **페이징과 궁합이 좋습니다** — 부모 페이징은 DB에서 그대로 일어나고, 자식은 `IN`으로 끌어옵니다

### 한계

- **표준이 아닙니다** (Hibernate 확장). JPA 명세를 100% 지키는 코드베이스면 쓸 수 없습니다
- 쿼리가 **완전히 한 번**은 아닙니다. 부모 쿼리 + 연관 쿼리가 합쳐 최소 2번은 나갑니다
- **엔티티 레벨 애너테이션**이기 때문에, 이 엔티티를 읽는 **모든 쿼리에 영향**을 줍니다. 특정 쿼리에서만 끄기 어렵습니다

### 전역 설정 — `default_batch_fetch_size`

`@BatchSize`를 연관마다 붙이지 않고 한 번에 적용하려면 `application.yml`에서 전역 설정을 켭니다.

```yaml
spring:
  jpa:
    properties:
      hibernate:
        default_batch_fetch_size: 100
```

프로젝트 대부분에서는 이 설정만 켜두고, 특별히 더 큰 값이 필요한 연관에만 `@BatchSize`를 덧붙이는 패턴을 많이 씁니다.

### `IN` 절 크기에 대한 주의

DB마다 `IN` 절에 들어갈 수 있는 최대 파라미터 수에 제한이 있습니다. MySQL은 명시적 상한이 없지만 파서 메모리 한계에 의존합니다. PostgreSQL은 과거 `$32767` 파라미터 제한이 있었지만 최신은 완화됐습니다. Oracle은 `1000` 제한이 있습니다. 대부분의 실무 `@BatchSize` 값은 **100~500 사이**에서 잡습니다. 너무 크게 잡으면 쿼리 캐시 적중률이 떨어지고, 너무 작게 잡으면 쿼리 수가 늘어납니다.

## Phase 4. 실전 선택 기준

세 도구의 선택은 **세 가지 축**만 보면 빠르게 결정됩니다.

### 축 1 — 연관이 단일이냐 컬렉션이냐

- **단일 연관 (`@ManyToOne`/`@OneToOne`)**: `fetch join` 또는 `@EntityGraph`. 행이 안 늘어나므로 한 번의 `JOIN`으로 끝납니다
- **컬렉션**: 건수가 적으면 `fetch join` 가능. 많거나 두 개 이상이면 **`@BatchSize`**

### 축 2 — 페이징이 필요한가

- 컬렉션이 포함되고 페이징도 필요하면 `fetch join`/`@EntityGraph`는 **메모리 페이징 경고**가 뜹니다
- 이 조합에서는 거의 항상 **`@BatchSize`** 가 정답입니다

### 축 3 — 한 번만 쓰는 쿼리냐, 여러 곳에서 재사용되는 연관이냐

- **한 번만 쓰는 목록 쿼리**: JPQL + `fetch join`이 읽기 쉬움
- **여러 API에서 같은 연관을 자주 로딩**: `@EntityGraph`로 메서드에 선언하거나 `@NamedEntityGraph`로 이름 붙여 재사용
- **엔티티를 읽는 대부분의 경로에서 필요**: `@BatchSize` 또는 `default_batch_fetch_size`를 설정해 전역으로 커버

### 상황별 추천

| 상황 | 추천 | 이유 |
|------|------|------|
| 단일 연관만 함께 조회 | `JOIN FETCH` 또는 `@EntityGraph` | 단일 `JOIN`으로 끝남 |
| 컬렉션 하나, 작은 건수, 페이징 없음 | `JOIN FETCH` + `DISTINCT` | 전형적 사용법 |
| 컬렉션 하나, 페이징 있음 | `@BatchSize` | 메모리 페이징 회피 |
| 컬렉션 둘 이상 | `@BatchSize` | `fetch join`은 불가능 |
| 파생 쿼리(`findByXxx`)에 연관 추가 | `@EntityGraph` | JPQL을 쓰지 않고 선언만 |
| 여러 API에서 반복되는 페치 | `@NamedEntityGraph` | 이름 붙여 재사용 |
| 전역 기본값으로 덜어내기 | `default_batch_fetch_size` | 프로젝트 전반의 N+1을 저렴하게 완화 |

### 조합해서 쓰기

현실에서는 **하나의 조회**가 세 도구를 조합하기도 합니다. 예를 들어 주문 목록에 `user`는 `fetch join`으로 묶고, `items` 컬렉션과 `coupons` 컬렉션은 `@BatchSize`로 가져오는 식입니다.

```kotlin
@Entity
class Order(
  @Id val id: Long,

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "user_id")
  val user: User,

  @OneToMany(mappedBy = "order", fetch = FetchType.LAZY)
  @BatchSize(size = 200)
  val items: List<OrderItem>,

  @OneToMany(mappedBy = "order", fetch = FetchType.LAZY)
  @BatchSize(size = 200)
  val coupons: List<Coupon>,
)

@Query("""
  SELECT o FROM Order o
  JOIN FETCH o.user
  WHERE o.status = :status
""")
fun findPaidOrdersWithUser(status: String, pageable: Pageable): Page<Order>
```

위 조합은 다음처럼 동작합니다.

- `user`는 `JOIN FETCH`로 한 쿼리 안에 포함
- 페이징은 `JOIN FETCH`가 단일 연관만 포함하기 때문에 DB에서 안전하게 수행
- `items`와 `coupons`는 접근 시 **`IN` 쿼리 두 번**으로 묶여서 끌려옴

즉, `fetch join`은 **안전한 단일 연관에만** 사용하고, **컬렉션은 `@BatchSize`에 위임**하는 패턴이 가장 자주 쓰이는 실전 형태입니다.

## Phase 5. 함께 주의해야 할 지점

### 1. `fetch join`과 `GROUP BY`/집계

`JOIN FETCH`는 결과를 엔티티로 돌려주기 때문에 **집계 쿼리와 잘 맞지 않습니다**. 집계가 필요하면 `JOIN FETCH` 대신 일반 `JOIN` + `GROUP BY`를 쓰고, DTO 프로젝션으로 결과를 받습니다.

### 2. `@EntityGraph` + `native query`

`@EntityGraph`는 JPQL/Criteria에만 적용됩니다. 네이티브 쿼리에는 동작하지 않으므로, 네이티브 쿼리가 필요하면 `JOIN`으로 직접 써서 DTO에 매핑합니다.

### 3. `@BatchSize`의 로그 확인

`@BatchSize`가 실제로 `IN` 쿼리로 묶이는지 확인하려면 `hibernate.show_sql` 또는 `p6spy` 같은 SQL 로거로 쿼리를 봐야 합니다. "N+1이 해결된 줄 알았는데 여전히 수십 번 쿼리가 나가는" 원인의 상당수가 **`@BatchSize`가 예상한 연관에 안 붙어 있거나**, **해당 트랜잭션이 닫혀 다른 트랜잭션에서 로딩되는 경우**입니다.

### 4. DTO 프로젝션이 더 깔끔한 순간

세 도구를 조합해도 엔티티 전체를 끌고 올 필요가 없는 목록 API는 많습니다. 이럴 때는 **DTO 프로젝션**이 더 단순한 답입니다.

```kotlin
@Query("""
  SELECT new com.example.OrderView(o.id, u.name, o.totalPrice)
  FROM Order o JOIN o.user u
  WHERE o.status = :status
""")
fun listOrderViews(status: String): List<OrderView>
```

이 쿼리는 영속성 컨텍스트도, 프록시도, N+1도 신경 쓸 필요가 없습니다. **목록 API에서 엔티티 자체가 필요 없다면 DTO가 거의 항상 더 단순합니다**.

## 정리

N+1을 줄이는 도구는 하나가 아닙니다. 세 도구의 역할은 명확히 다릅니다.

- **`fetch join`** — JPQL로 쿼리 모양을 다시 씁니다. 단일 연관에 안전합니다
- **`@EntityGraph`** — 같은 효과를 파생 쿼리에도 붙일 수 있게 합니다
- **`@BatchSize`** — 쿼리 수를 0으로 만들지 않지만, 컬렉션과 페이징이 있을 때 가장 안전한 선택입니다

상황을 가르는 기준은 **"연관이 단일인가 컬렉션인가"**, **"페이징이 필요한가"**, **"이 쿼리만 쓸 것인가 아니면 여러 곳에서 쓸 것인가"** 세 가지입니다. 현실에서는 조합해 쓰는 경우가 많으며, 실전 패턴은 **단일 연관은 `fetch join`, 컬렉션은 `@BatchSize`** 입니다.

다음 글에서는 JPA 영역을 잠시 벗어나 **Spring `@Transactional`의 전파 속성과 롤백 규칙**을 다룹니다. Fetch 전략까지 다져놓았다면, 그 다음은 트랜잭션 경계를 설계하는 방식이 제일 큰 설계 결정입니다.

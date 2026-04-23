---
title: "JPA Fetch 전략 완전 정복 — `LAZY` vs `EAGER`와 N+1이 생기는 진짜 이유"
date: "2026-04-23"
category: "study"
tags: ["Fetch 전략", "N+1"]
excerpt: "연관 관계 기본 Fetch 전략, 프록시로 구현되는 LAZY 동작, EAGER에서도 N+1이 생기는 이유, 컬렉션과의 조합에서 발생하는 카르테시안 폭발까지 JPA Fetch 전략의 내부 동작을 정리합니다."
---

## Fetch 전략, 왜 알아야 하나요?

JPA에서 N+1이 생기는 원인은 대부분 "뭐가 `LAZY`고 뭐가 `EAGER`인지 정확히 모른 채 연관을 걸었기 때문"입니다.

- `@ManyToOne`만 걸어뒀는데 목록 조회마다 연관 테이블로 20번씩 쿼리가 나갑니다
- `fetch = FetchType.EAGER` 로 바꿨더니 오히려 쿼리 수가 더 늘었습니다
- 두 개의 `@OneToMany`를 `JOIN FETCH` 했더니 결과 행이 수백 배로 불어났습니다
- 로그에는 `SELECT` 한 번만 찍혔는데 응답 시간은 여전히 튑니다

이 문제들의 공통점은 **"어떤 쿼리가 언제 나가는가"** 를 모르는 데 있습니다. `LAZY`/`EAGER`는 단순한 튜닝 옵션이 아니라 **JPA가 프록시와 영속성 컨텍스트로 어떻게 연관을 해석하는지를 결정하는 구조적 선택**입니다. 이 글은 그 내부 동작을 풀어봅니다.

> **기준:** 이 글은 **Jakarta Persistence 3.1 (JPA 3.1) 명세**와 **Hibernate 6.x** 구현을 기준으로 작성합니다. 연관 관계 Fetch 디폴트 정의는 [Jakarta Persistence 3.1 Specification](https://jakarta.ee/specifications/persistence/3.1/jakarta-persistence-spec-3.1.html) `§11. Metadata Annotations`, 프록시/`Bytecode Enhancement` 구현 세부는 [Hibernate 6 User Guide — §5. Fetching](https://docs.jboss.org/hibernate/orm/6.6/userguide/html_single/Hibernate_User_Guide.html#fetching)을 참조합니다. 1차 캐시와 변경 감지의 동작은 [앞 글](/posts/38-jpa-persistence-context)을 전제로 합니다. 코드 예시는 Kotlin + Spring Data JPA입니다.

## 먼저 가장 짧은 답부터 보면

- `@ManyToOne`과 `@OneToOne`은 기본값이 **`EAGER`** 입니다
- `@OneToMany`와 `@ManyToMany`는 기본값이 **`LAZY`** 입니다
- `LAZY`는 실제 데이터를 쓸 때 추가 SQL을 내보냅니다 → **루프 안에서 접근하면 N+1**
- `EAGER`도 **연관마다 개별 쿼리**를 내보낼 수 있습니다 → **목록 조회 시 N+1**
- 두 개 이상의 `@OneToMany`를 `JOIN FETCH`하면 **카르테시안 곱**으로 행이 폭증합니다
- 실무 원칙은 **모든 연관을 `LAZY`로 시작하고, 쿼리별로 필요한 연관을 명시적으로 로딩**합니다

이 글은 왜 이 원칙이 나오는지 순서대로 짚습니다.

## Phase 1. 연관 관계의 기본 Fetch 전략

### 명세가 정한 디폴트

JPA 3.1 명세는 연관 관계 애너테이션마다 기본 Fetch 전략을 정해두고 있습니다.

| 애너테이션 | 기본 Fetch | 이유 |
|------------|-----------|------|
| `@ManyToOne` | `EAGER` | 역사적 이유로 단일 연관은 즉시 로딩이 기본값 |
| `@OneToOne` | `EAGER` | 단일 연관이라 같은 이유 |
| `@OneToMany` | `LAZY` | 컬렉션을 무조건 읽으면 대부분 오버페치가 됩니다 |
| `@ManyToMany` | `LAZY` | 같은 이유 |

### 이 디폴트가 왜 위험한가요?

대부분의 엔티티에는 `@ManyToOne` 연관이 하나 이상 있습니다. 그리고 그것들은 **기본적으로 `EAGER`** 입니다. 그래서 아무 생각 없이 엔티티를 설계하면, **목록 조회 때마다 연관 엔티티가 매 행마다 개별 `SELECT` 로 따라 나오는 구조**가 됩니다.

실무에서 권장되는 첫 번째 규칙은 거의 하나입니다.

```kotlin
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "user_id")
val user: User

@OneToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "profile_id")
val profile: Profile
```

**모든 연관을 `LAZY`로 명시**한 다음, 필요한 곳에서 `fetch join` 또는 `@EntityGraph`로 읽는 것입니다. 이 도구들의 비교는 다음 글에서 다룹니다.

## Phase 2. `LAZY`는 어떻게 구현돼 있나요?

### 핵심: `LAZY` 연관은 엔티티가 아니라 "프록시 객체"로 채워집니다

`fetch = LAZY`가 걸린 연관은, 부모 엔티티를 로드한 시점에 **실제 엔티티 대신 프록시 객체**가 필드에 들어갑니다. 이 프록시는 `Hibernate`가 런타임에 생성한 엔티티의 서브클래스(`ByteBuddy` 또는 `CGLIB`)로, 내부에는 **ID만 채워져 있고** 다른 필드는 비어 있습니다.

```text
Order (managed)
 ├─ id = 1
 └─ user  → User$HibernateProxy (id = 10, 나머지 필드 = 초기화 X)
```

### 프록시가 실제 데이터를 채우는 순간

프록시의 **`id`를 제외한 다른 필드**를 읽으려 하면, 그 순간 프록시가 `SELECT`를 내보내 영속성 컨텍스트를 통해 실제 데이터를 채웁니다. 이걸 **프록시 초기화(Proxy Initialization)** 라고 부릅니다.

```kotlin
val order = orderRepository.findById(1L).get()
// 이 시점까지는 User 프록시만 있음, SQL 안 나감

println(order.user.id)    // SQL 안 나감 — 프록시가 ID는 알고 있음
println(order.user.name)  // 이 순간 SELECT user WHERE id = 10 실행
```

### 영속성 컨텍스트가 닫힌 뒤에 접근하면?

프록시는 **영속성 컨텍스트가 열려 있을 때만** 초기화할 수 있습니다. 트랜잭션이 끝난 뒤 `order.user.name`을 접근하면 `LazyInitializationException`이 발생합니다. OSIV가 켜진 상태에서는 이 예외가 뷰 렌더링까지는 늦춰집니다 — 그래서 OSIV를 끄면 이 예외가 자주 튀어나오는 것처럼 보이지만, **사실은 이전에 숨어 있던 문제가 드러난 것**입니다.

### Bytecode Enhancement를 쓰면?

Hibernate는 프록시 대신 **바이트코드 enhancement**로 `LAZY`를 구현하는 옵션을 제공합니다. 이 방식은 엔티티 클래스 자체에 훅을 심어 필드 접근 시점에 로딩합니다. 프록시 기반 구현의 한계(`final` 클래스/메서드 사용 불가, equals/hashCode 함정 등)를 우회할 때 선택합니다. 다만 빌드 도구 설정이 늘어나기 때문에 대부분 프로젝트는 프록시 방식을 그대로 씁니다.

## Phase 3. 왜 `LAZY`가 N+1을 만드나요?

`LAZY`는 **한 번의 접근 = 한 번의 `SELECT`** 이기 때문에, 루프 안에서 접근하면 반복 횟수만큼 쿼리가 나갑니다.

```kotlin
@Transactional(readOnly = true)
fun listOrderSummaries(): List<OrderView> {
  val orders = orderRepository.findAll()   // SELECT order × 1
  return orders.map { o ->
    OrderView(o.id, o.user.name)           // SELECT user × N
  }
}
```

주문이 20건이면 쿼리가 21번 나갑니다. 이 구조적 원인은 [N+1 글](/posts/15-n-plus-1-query-problem)에서 이미 다뤘으므로, 여기서는 **왜 이 구조가 JPA 구현의 자연스러운 귀결인지**만 짚습니다.

- `LAZY` 프록시는 **자기 자신의 필드 접근에 대해서만 초기화**를 트리거합니다
- Hibernate는 루프의 다음 이터레이션에서 어떤 프록시가 접근될지 **예측하지 않습니다**
- 그래서 각 프록시는 **접근되는 순간에 하나씩** 쿼리를 내보냅니다

다시 말해, N+1은 `LAZY`의 결함이 아니라 **`LAZY`가 일부러 "요청받을 때만 로딩"하도록 설계된 결과**입니다. 이 결과를 회피하려면 **읽기 전에 필요한 연관을 한 번에 같이 로딩하도록 쿼리를 다시 써야** 합니다. 그 도구가 `fetch join`, `@EntityGraph`, `@BatchSize` 등이고, 다음 글의 주제입니다.

## Phase 4. `EAGER`도 N+1을 만듭니다

많은 문서가 "`EAGER`는 N+1을 피한다"고 단순화하지만, 정확하지 않습니다. **`EAGER`는 N+1을 **더 조용히** 만드는 경우가 많습니다.**

### `EAGER`가 쿼리를 내보내는 방식

`fetch = EAGER` 연관은 부모를 로딩한 뒤, **로딩된 부모마다 개별 `SELECT`** 를 추가로 내보낼 수 있습니다. JPQL로 엔티티 목록을 읽었을 때 특히 이 동작이 잘 보입니다.

```kotlin
@Entity
class Order(
  @Id val id: Long,

  @ManyToOne(fetch = FetchType.EAGER)
  @JoinColumn(name = "user_id")
  val user: User,
)

@Transactional(readOnly = true)
fun list() {
  em.createQuery("SELECT o FROM Order o", Order::class.java)
    .resultList
}
```

이 상황의 SQL은 다음처럼 나갑니다.

```text
SELECT * FROM `order`;                    -- 주문 목록 1번
SELECT * FROM user WHERE id = ?;          -- 주문 20건 × 1
SELECT * FROM user WHERE id = ?;
...
```

**N+1이 `EAGER`에서도 그대로 재현됩니다.** `@ManyToOne(fetch = EAGER)` 디폴트가 위험한 진짜 이유가 이것입니다.

### 왜 JOIN으로 묶어서 가져오지 않나요?

JPA 구현체가 `EAGER` 연관을 처리하는 방식은 두 가지가 있습니다.

- **`SELECT` — 개별 쿼리로 하나씩** (Hibernate의 기본 동작)
- **`JOIN` — 부모 쿼리에 LEFT OUTER JOIN으로 붙여 한 번에**

JPQL로 엔티티 목록을 조회할 때는 Hibernate가 `EAGER` 연관을 **`JOIN`으로 묶어 주지 않고**, 부모를 먼저 로드한 뒤 **개별 `SELECT`로 따라잡는 경우가 많습니다**. 연관을 `JOIN`으로 묶고 싶다면 `@Fetch(FetchMode.JOIN)` 같은 벤더 확장을 쓰거나, JPQL에 직접 `fetch join`을 씁니다. 그래서 `EAGER`는 "알아서 효율적으로 묶어주겠지"가 아니라 **실제로는 개별 쿼리가 따라 나오는 경우가 흔합니다**.

### `EAGER`가 더 나쁜 이유

`LAZY`는 적어도 "안 쓰는 연관은 안 불러옵니다". `EAGER`는 **쓰지 않더라도 무조건 로딩**합니다. 엔티티가 조금만 많아지면 다음이 전부 동시에 벌어집니다.

- 안 쓰는 데이터까지 메모리에 올라갑니다
- `LAZY`에서 나던 N+1이 그대로 재현됩니다
- 나중에 쿼리를 튜닝하려 해도 `EAGER`는 **전역 설정**이라 특정 쿼리만 다르게 동작하게 만들기 어렵습니다

그래서 실무 권장은 **모든 연관을 `LAZY`로 시작**하고, 쿼리 단위로 필요한 연관을 명시적으로 로딩하는 쪽입니다.

## Phase 5. `JOIN FETCH`와 컬렉션 — 카르테시안 폭발

### 단일 연관 `JOIN FETCH`는 안전합니다

`@ManyToOne`을 `JOIN FETCH`하면 부모와 단일 연관을 한 번의 `JOIN` 쿼리로 가져옵니다.

```sql
SELECT o, u FROM Order o JOIN FETCH o.user u
```

이 쿼리는 주문이 20건이면 결과도 20행입니다.

### 컬렉션을 `JOIN FETCH`하면 행이 곱해집니다

`@OneToMany`나 `@ManyToMany`를 `JOIN FETCH`하면 상황이 다릅니다. DB가 돌려주는 결과 집합은 **부모 × 자식 조합**만큼 불어납니다.

```sql
SELECT o, i FROM Order o JOIN FETCH o.items i
```

주문 20건 × 각 주문의 아이템 10개 = **200행**이 돌아옵니다. 주문 엔티티는 개념적으로 20개인데, 영속성 컨텍스트는 이 200행을 받아서 **중복 제거와 컬렉션 조립**을 합니다. 건수가 적으면 문제가 안 되지만, 페이지당 수백 건 이상이 되면 결과 집합이 쉽게 수만 행이 됩니다.

### 여러 컬렉션을 동시에 `JOIN FETCH`하면?

Hibernate가 **`MultipleBagFetchException`** 을 던집니다. 이것은 JPA 명세 차원의 금지가 아니라 **Hibernate 구현 제약**입니다. 두 개 이상의 **bag(순서 없는 `List`) 컬렉션을 동시에 fetch**하면 결과 행이 `부모 × 자식A × 자식B`로 폭증하면서 중복을 안정적으로 제거할 방법이 없기 때문에 Hibernate가 미리 막습니다. 컬렉션 타입을 `Set`으로 바꾸면 예외 자체는 피할 수 있지만, **카르테시안 곱 문제는 그대로 남습니다**.

해결책은 나눠서 로딩하는 것입니다.

- `fetch join`은 연관 하나만 씁니다
- 나머지 연관은 **`@BatchSize`** 로 묶어 로딩하거나, 별도 쿼리로 분리합니다

이 도구들의 비교는 다음 글에서 상세히 다룹니다.

### 페이징과 컬렉션 `JOIN FETCH`의 함정

컬렉션을 `JOIN FETCH`한 쿼리에 `setFirstResult()` / `setMaxResults()` 로 페이징을 걸면, Hibernate는 **DB 수준 페이징을 포기하고 전체 결과를 메모리로 가져와** 잘라 냅니다. 로그에는 다음 경고가 찍힙니다.

```text
HHH90003004: firstResult/maxResults specified with collection fetch;
             applying in memory
```

주문 10만 건을 `items`와 함께 읽고 20건만 페이징하면, DB에서는 **10만 × N개** 행이 다 돌아옵니다. 컬렉션 페이징이 필요하면 다음 중 하나를 선택합니다.

- **ID만 페이징**하고, 그 ID들로 실제 엔티티를 한 번 더 조회합니다 (`@BatchSize`와 조합하기 좋습니다)
- 컬렉션을 분리해 **별도의 `IN` 쿼리**로 가져옵니다
- 목록 API 레벨에서는 **컬렉션을 DTO로 따로 집계**해 내려줍니다

## Phase 6. 실무 원칙 요약

| 원칙 | 이유 |
|------|------|
| 모든 연관을 `LAZY`로 시작 | 안 쓰는 연관이 목록 조회마다 개별 쿼리를 만드는 것을 방지 |
| 쿼리별로 필요한 연관을 명시 | 공통 설정으로 한 번에 "좋은 답"을 내는 것은 불가능 |
| 단일 연관은 `JOIN FETCH` | `@ManyToOne`/`@OneToOne`은 행이 안 늘어나 안전 |
| 컬렉션은 `JOIN FETCH`를 아껴서 | 행이 곱해지고, 두 개 이상은 아예 불가 |
| 페이징 + 컬렉션 `JOIN FETCH`는 피함 | DB 페이징을 잃고 전체 결과를 메모리에 적재 |
| 필드 기반 `open-in-view=false` 유지 | `LazyInitializationException`이 서비스 레이어에서 드러나게 만들기 |

## 정리

`LAZY`와 `EAGER`는 "**어떤 쿼리가 언제 나갈지**" 를 결정합니다. `LAZY`는 "접근할 때 그 프록시만 초기화"하기 때문에 구조상 루프 안에서 N+1을 만듭니다. `EAGER`는 그 N+1을 **부모 로딩 시점으로 앞당길 뿐** 없애지 않습니다. 안전한 답은 전략 자체를 바꾸는 것이 아니라, **쿼리 단위로 필요한 연관을 명시적으로 로딩**하는 쪽입니다.

다음 글은 그 도구들 — **`fetch join`, `@EntityGraph`, `@BatchSize`** — 을 비교하면서 **언제 어떤 것을 고르면 되는지** 를 정리합니다. 세 가지 모두 N+1을 줄이지만, 각각이 **해결하는 축이 달라서** 상황별 선택이 필요합니다.

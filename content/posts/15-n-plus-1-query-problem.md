---
title: "N+1 쿼리 문제 완전 정복 — 왜 느려지고 어떻게 해결할까"
date: "2026-04-09"
category: "study"
tags: ["N+1", "쿼리 최적화"]
excerpt: "N+1 쿼리가 무엇인지, 왜 성능을 망가뜨리는지, JPA와 서비스 레이어에서 어떻게 발생하는지, 그리고 어떤 방식으로 해결해야 하는지 정리합니다."
---

## N+1 문제, 왜 따로 알아야 하나요?

[커뮤니티 모듈 성능 개선기](/posts/02-n-plus-1-and-cache-key-strategy), [Discovery 모듈 성능 개선기](/posts/04-discovery-cache-and-protobuf-removal), [채팅방 목록 요약 API 성능 개선기](/posts/14-chatting-list-ref-api-optimization) 같은 트러블슈팅 글을 보면 반복해서 등장하는 문제가 있습니다.

- 목록 20건인데 쿼리가 수십 번 나갑니다
- 페이지 크기를 10에서 50으로 늘렸더니 응답 시간이 갑자기 튑니다
- 캐시를 붙여도 cold start에서는 여전히 느립니다

이런 상황의 대표적인 원인이 **N+1 쿼리 문제**입니다. 이름은 단순하지만, 실무에서는 API 응답 시간, DB 부하, 커넥션 풀까지 함께 흔드는 문제입니다.

> **기준:** 이 글은 Spring Boot + JPA/Hibernate + 일반적인 서비스 레이어 조회 코드를 기준으로 설명합니다. 다만 N+1 자체는 ORM에만 있는 문제가 아니라, "목록을 읽고 루프 안에서 추가 조회를 반복하는 구조" 전반에 나타나는 문제입니다.

## Phase 1. N+1 쿼리란 무엇인가?

가장 짧게 정의하면 이렇습니다.

> **기본 조회 1번 + 결과 건수 N만큼 추가 조회가 반복되는 문제**

예를 들어 주문 20건을 먼저 읽고, 각 주문의 사용자 정보를 개별 조회하면:

```text
1. 주문 목록 조회 1번
2. 주문 20건 각각에 대해 사용자 조회 20번

총 21번 쿼리
```

그래서 보통 `1 + N` 구조인데, 관습적으로 **N+1 문제**라고 부릅니다.

### 가장 단순한 예시

```kotlin
val orders = orderRepository.findAllByStatus("PAID")   // 1번

val result = orders.map { order ->
    val user = userRepository.findById(order.userId)   // N번
    OrderView(order.id, user.name)
}
```

주문이 5건이면 6번, 100건이면 101번 쿼리가 나갑니다.

핵심은 "쿼리가 여러 번 나간다" 자체보다, **조회 건수에 비례해서 쿼리 수도 선형으로 증가한다**는 점입니다.

## Phase 2. N+1은 어떻게 발생할까?

N+1은 한 가지 방식으로만 생기지 않습니다. 실무에서는 크게 두 가지 패턴이 많습니다.

### ORM의 지연 로딩(Lazy Loading)

JPA/Hibernate에서 가장 유명한 케이스입니다.

```kotlin
@Entity
class Order(
    @Id val id: Long,

    @ManyToOne(fetch = FetchType.LAZY)
    val user: User,
)
```

```kotlin
val orders = orderRepository.findAllByStatus("PAID")   // 1번

val views = orders.map { order ->
    OrderView(
        id = order.id,
        userName = order.user.name,                    // 접근 시 추가 조회
    )
}
```

겉으로는 단순히 필드 접근처럼 보이지만, 실제로는 `order.user`를 읽는 순간 Hibernate가 프록시를 초기화하면서 추가 쿼리를 보낼 수 있습니다.

> **참고:** `EAGER`로 바꾼다고 N+1이 자동으로 사라지는 것은 아닙니다. 어떤 SQL이 나가는지는 실제 조회 쿼리와 매핑 방식에 따라 달라지므로, 결국 SQL 로그나 실행 결과로 확인해야 합니다.

```text
SELECT * FROM orders WHERE status = 'PAID';      -- 1번
SELECT * FROM users WHERE id = 1;                -- N번 중 1
SELECT * FROM users WHERE id = 2;                -- N번 중 2
SELECT * FROM users WHERE id = 3;                -- N번 중 3
...
```

### 서비스 레이어의 루프 안 개별 조회

이건 ORM이 없어도 발생합니다.

```kotlin
val reviews = reviewStore.list(pageable)         // 1번

val result = reviews.map { review ->
    val seller = sellerStore.findByItemId(review.itemId)   // N번
    val image = imageStore.findByItemId(review.itemId)     // N번
    ReviewView(review.id, seller, image)
}
```

이 구조는 JPA 프록시와 무관합니다. 그냥 **루프 안에서 조회를 반복**하고 있기 때문에 N+1입니다.

실무에서는 오히려 이 두 방식이 섞여 있는 경우가 많습니다.

- 엔티티 연관 관계 접근으로 한 번
- 외부 포트/리포지토리 호출로 또 한 번

그러면 `1 + N + N` 구조가 되어 금방 수십 번 쿼리로 커집니다.

## Phase 3. 왜 이렇게 중요한가?

N+1은 단순히 "쿼리 수가 좀 많다" 수준에서 끝나지 않습니다.

### 응답 시간이 데이터 크기에 비례해 나빠집니다

예를 들어 목록 20건에서 건당 2개의 추가 조회가 있다면:

```text
기본 목록 조회 1번
+ 판매자 조회 20번
+ 이미지 조회 20번
= 총 41번
```

페이지 크기를 50으로 올리면 바로 101번이 됩니다.

즉, 코드 한 줄이 아니라 **목록 크기 자체가 성능 문제의 레버**가 됩니다.

### DB 부하와 커넥션 점유 시간이 같이 증가합니다

쿼리 1번이 빠르더라도, 그 쿼리가 수십 번 반복되면 총 시간이 커집니다.

- DB는 같은 종류의 조회를 계속 반복 처리해야 하고
- 애플리케이션은 그동안 커넥션을 더 오래 붙잡고 있고
- 동시 요청이 많아지면 커넥션 풀이 빠르게 바닥날 수 있습니다

그래서 N+1은 [DB 커넥션 풀](/posts/12-database-connection-pool-fundamentals), [실행 계획](/posts/11-explain-query-execution-plan) 문제로도 이어집니다.

### 개발 환경에서는 잘 안 보입니다

로컬 DB에 데이터가 3건뿐이면:

- 1번 쿼리
- 추가 3번 쿼리

이 정도는 거의 티가 안 납니다.

하지만 운영에서는 페이지당 20건, 50건, 100건씩 조회하고 동시 요청도 많습니다. 그래서 N+1은 **초기에는 숨고, 트래픽과 데이터가 쌓일수록 터지는 문제**입니다.

### 캐시는 구조적 해결책이 아닙니다

캐시가 일부 조회를 가려 줄 수는 있지만, cold start나 캐시 미스가 나는 순간 N+1 구조는 다시 드러납니다. 즉, 캐시는 보강책일 수 있어도 **구조를 고치는 해결책은 아닙니다.**

## Phase 4. N+1은 어떻게 찾을까?

실무에서는 보통 아래 순서로 찾습니다.

### 1. 페이지 크기에 따라 쿼리 수가 같이 늘어나는지 봅니다

가장 강력한 신호입니다.

```text
pageSize=10  → 쿼리 11번
pageSize=20  → 쿼리 21번
pageSize=50  → 쿼리 51번
```

이 패턴이면 N+1을 강하게 의심할 수 있습니다.

### 2. 루프 안 조회 코드를 먼저 찾습니다

코드 리뷰에서 가장 먼저 볼 질문은 이것입니다.

> `map`, `forEach`, `associate`, `groupBy` 안에서 리포지토리나 포트를 호출하고 있지 않은가?

예:

```kotlin
items.map { item ->
    sellerPort.getSeller(item)
}
```

이런 코드는 거의 항상 의심 대상입니다.

### 3. SQL 로그를 봅니다

SQL 로그를 켜 보면 같은 형태의 쿼리가 반복되는 경우가 많습니다.

```text
select * from users where id = ?
select * from users where id = ?
select * from users where id = ?
select * from users where id = ?
```

파라미터만 바뀐 같은 조회가 연속으로 반복되면 N+1 가능성이 큽니다.

### 4. Lazy Loading 접근 지점을 확인합니다

JPA에서는 특히 아래 코드가 흔한 출발점입니다.

```kotlin
orders.map { it.user.name }
articles.map { it.tags.map(Tag::name) }
```

겉으로는 필드 접근처럼 보이지만, 실제로는 SQL이 뒤에서 추가로 나갈 수 있습니다.

## Phase 5. 해결 방법은 무엇인가?

N+1 해결은 한 가지 기술로 끝나지 않습니다. **조회 대상의 성격**에 따라 해법이 달라집니다.

### 방법 1. `fetch join`으로 함께 읽는다

연관 엔티티를 한 번에 가져오는 방식입니다.

```kotlin
@Query(
    """
    select o
    from Order o
    join fetch o.user
    where o.status = :status
    """
)
fun findAllWithUserByStatus(status: OrderStatus): List<Order>
```

이 방식은 특히 `ManyToOne`, `OneToOne` 같은 **to-one 연관 관계**에 잘 맞습니다.

장점:

- 쿼리 수를 1번으로 줄이기 쉽습니다
- 코드가 직관적입니다

주의:

- 컬렉션 `fetch join`은 결과 행이 불어나기 쉽고
- JPA에서 컬렉션 `fetch join`과 페이지네이션을 같이 쓰면 문제가 생기기 쉽습니다

### 방법 2. ID를 모아 `IN` 쿼리로 배치 조회한다

트러블슈팅 글들에서 가장 자주 등장한 방식입니다.

```kotlin
val itemIds = reviews.map { it.itemId }.distinct()

val sellersByItemId = sellerRepository.findAllByItemIdIn(itemIds)
    .associateBy { it.itemId }

val imagesByItemId = imageRepository.findAllByItemIdIn(itemIds)
    .groupBy { it.itemId }
```

그다음 메모리에서 조립합니다.

```kotlin
val result = reviews.map { review ->
    ReviewView(
        id = review.id,
        seller = sellersByItemId[review.itemId],
        images = imagesByItemId[review.itemId].orEmpty(),
    )
}
```

이 방식은 아래 같은 경우에 특히 강합니다.

- 컬렉션 조회
- 외부 포트/리포지토리 반복 호출
- 서비스 레이어에서 여러 부가 정보를 조합하는 API

### 방법 3. DTO/Projection 조회로 N+1이 숨어들지 않게 다시 설계한다

이건 `fetch join`이나 `IN` 배치 조회처럼 연관 로딩을 직접 제어하는 기법이라기보다, **엔티티를 따라가며 추가 조회하지 않도록 조회 자체를 다시 설계하는 방식**에 가깝습니다.

목록 API라면 엔티티 그래프 전체보다 **응답에 필요한 컬럼만** 바로 읽는 편이 낫습니다.

```kotlin
@Query(
    """
    select new com.example.OrderListRow(
        o.id,
        u.name,
        o.status
    )
    from Order o
    join o.user u
    where o.status = :status
    """
)
fun findOrderListRows(status: OrderStatus): List<OrderListRow>
```

장점:

- 필요한 값만 조회합니다
- Lazy Loading 여지를 줄입니다
- 목록/요약 API에 잘 맞습니다

즉, DTO/Projection은 "N+1을 자동으로 해결하는 기능"이라기보다, **N+1이 생기기 쉬운 엔티티 순회 구조를 아예 만들지 않는 설계**라고 보는 편이 더 정확합니다.

### 방법 4. `EntityGraph`를 사용한다

JPA에서 fetch 전략을 선언적으로 붙이는 방식입니다.

```kotlin
@EntityGraph(attributePaths = ["user"])
fun findAllByStatus(status: OrderStatus): List<Order>
```

장점:

- 리포지토리 메서드 수준에서 의도를 드러내기 쉽습니다

주의:

- 결국 어떤 SQL이 나가는지는 여전히 확인해야 합니다
- 복잡한 조립 API에서는 배치 조회 패턴이 더 명확할 때도 많습니다

### 방법 5. 배치 페치 설정으로 "완화"한다

Hibernate의 `default_batch_fetch_size`나 `@BatchSize`는 N+1을 완전히 없애기보다, **N번을 여러 묶음으로 줄이는** 전략입니다.

예를 들어 N=100인데 배치 크기가 20이면:

```text
1번 + 100번
→ 1번 + 5번 정도로 완화
```

그래서 이 방법은:

- 빠른 응급처치로는 유용하지만
- 목록 API를 구조적으로 정리하는 최종 해법은 아닌 경우가 많습니다

## Phase 6. 상황별로 무엇을 선택해야 할까?

정답은 하나가 아닙니다. 보통은 이렇게 판단하면 됩니다.

| 상황 | 추천 방법 |
|------|----------|
| `ManyToOne`, `OneToOne` 조회 | `fetch join`, `EntityGraph` |
| 컬렉션/부가 정보 조회 | `IN` 배치 조회 + `Map`/`groupBy` |
| 목록/요약 API | DTO Projection으로 조회를 다시 설계하거나, 배치 조회로 조립 |
| 기존 구조를 크게 못 바꾸는 경우 | batch fetch 설정으로 완화 |

핵심은 이겁니다.

> **조회 결과를 한 건씩 처리하면서 추가 조회하지 말고, 필요한 데이터를 먼저 모아서 한 번에 읽는다**

## Phase 7. 해결할 때 자주 하는 실수

### `fetch join`만 붙이면 끝난다고 생각하는 경우

to-one에서는 효과적이지만, 컬렉션까지 무턱대고 묶으면:

- 중복 행이 늘어나고
- 메모리 사용량이 커지고
- 페이지네이션과 충돌할 수 있습니다

### 캐시로 덮으려는 경우

캐시는 **해결 후 보강책**으로는 좋지만, 구조가 N+1이면:

- 캐시 미스 시 다시 터지고
- invalidation 포인트가 많아지고
- cold start 성능은 여전히 불안정합니다

### 트랜잭션을 길게 유지하며 Lazy Loading에 기대는 경우

이 방식은 개발 중에는 편해 보여도:

- 어디서 SQL이 나가는지 흐려지고
- API 응답 조립 과정에서 N+1이 숨어들고
- 문제를 재현하기도 어려워집니다

즉, N+1은 단순히 쿼리 수 문제가 아니라 **조회 책임이 흐려졌다는 신호**이기도 합니다.

## 한눈에 보는 N+1 점검 순서

실무에서는 아래 순서로 보면 대부분의 원인을 빠르게 좁힐 수 있습니다.

| 순서 | 확인 항목 | 무엇을 보는가 |
|:----:|----------|--------------|
| 1 | 페이지 크기 | 건수가 늘 때 쿼리 수도 비례해서 느는가 |
| 2 | 루프 안 조회 | `map`, `forEach` 안에서 조회를 호출하는가 |
| 3 | Lazy 접근 | `entity.user`, `entity.tags` 접근이 추가 SQL을 만드는가 |
| 4 | SQL 로그 | 같은 형태의 조회가 파라미터만 바뀌어 반복되는가 |
| 5 | 해결 전략 | `fetch join`, 배치 조회, DTO Projection 재설계 중 무엇이 맞는가 |
| 6 | 검증 | 개선 후 실제 쿼리 수가 줄었는가 |

## 정리

1. **N+1은 기본 조회 1번 뒤에 결과 건수 N만큼 추가 조회가 반복되는 문제입니다** — 데이터가 늘수록 쿼리 수도 선형으로 증가합니다
2. **JPA Lazy Loading만의 문제가 아닙니다** — 서비스 레이어에서 루프 안 조회를 반복해도 똑같이 발생합니다
3. **왜 중요한가?** — 응답 시간, DB 부하, 커넥션 점유 시간이 함께 커지기 때문입니다
4. **가장 먼저 찾는 방법은 페이지 크기에 따라 쿼리 수가 같이 늘어나는지 보는 것입니다**
5. **해결의 핵심은 "한 건씩 읽고 추가 조회"가 아니라 "먼저 모아서 한 번에 읽기"입니다**
6. **상황에 따라 해법이 다릅니다** — to-one은 `fetch join`, 조합형 목록 API는 배치 조회가 직접 해법인 경우가 많고, DTO Projection은 N+1이 생기지 않도록 조회 자체를 다시 설계하는 방식에 가깝습니다

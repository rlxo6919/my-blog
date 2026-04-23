---
title: "알림 목록 API 쿼리 최적화 — 34컬럼 Projection · `EXISTS` semi-join · `DISTINCT` IN 절"
date: "2026-05-01"
category: "troubleshooting"
tags: ["쿼리 최적화"]
excerpt: "스키마와 인덱스는 그대로 두고, 결과 집합 동일성을 100% 유지한 채 알림 목록 API의 P95 10초를 풀어낸 과정을 정리합니다. 34컬럼 Projection, 중복 IN 절 제거, EXISTS semi-join, 버려지는 ORDER BY 제거까지 네 가지 병목을 단계적으로 해체합니다."
---

## 이런 증상을 겪고 계신가요?

알림 목록 같은 "단순 조회" API인데 특정 경로만 유독 느려지는 증상입니다.

- 한 API의 **P95가 10초**를 넘고, 특정 조건일 때만 재현됩니다
- 쿼리 로그에 컬럼이 **30개 넘게** 딸려 오지만, 후속 로직은 **한 컬럼만** 씁니다
- `IN` 절에 **같은 ID가 수십 번 중복**으로 들어가 있습니다
- 두 테이블이 같은 DB에 있는데 **두 번의 쿼리로 분리**되어 앱 ↔ DB 왕복이 추가됩니다
- 쿼리의 `ORDER BY` 결과가 **호출자 쪽에서 다시 정렬**되어 버려집니다

이 글은 **DB 스키마·인덱스 변경 없이**, **결과 집합 동일성을 100% 유지**한 채, **앱 레벨 캐시도 도입하지 않고**, 오직 쿼리와 호출 흐름을 재구성해서 위 증상들을 해결한 과정을 정리합니다. 동작 동일성이 가장 엄격한 제약이었고, 그래서 **검토했지만 선택하지 않은 대안**도 함께 기록합니다.

> **기준:** 이 글은 **Spring Data JPA + Hibernate 6 + MySQL 8.4 InnoDB** 환경을 가정합니다. 클라이언트 코드는 Kotlin. 공식 문서 기준은 [MySQL 8.4 — `EXISTS` and `NOT EXISTS` Subqueries](https://dev.mysql.com/doc/refman/8.4/en/exists-and-not-exists-subqueries.html), [Optimizing Subqueries with Semijoin Transformations](https://dev.mysql.com/doc/refman/8.4/en/semijoins.html), [Hibernate 6 User Guide — §10. Query Language](https://docs.jboss.org/hibernate/orm/6.6/userguide/html_single/Hibernate_User_Guide.html#query-language)를 참고했습니다. N+1과 배치 조회 기본 원리는 [N+1 글](/posts/15-n-plus-1-query-problem)과 [N+1 해결 도구 글](/posts/40-jpa-n-plus-1-solution-tools)에서 이미 다뤘습니다.

## Phase 1. 병목 네 가지를 먼저 나열하고 시작합니다

문제 파악 단계에서 원인이 네 축에 걸쳐 있다는 걸 확인했습니다. 글 읽기 편하도록 먼저 정리해 두고, Phase마다 하나씩 해체합니다.

| # | 병목 | 징후 |
|---|------|------|
| 1 | 불필요한 34컬럼 fetch + 엔티티 hydration | `SELECT *` 로 TEXT 컬럼까지 딸려옴 |
| 2 | `IN` 절 중복 폭증 | 고유 75개 ID가 100개 이상으로 부풀어 있음 |
| 3 | 두 번의 DB 왕복 | 같은 DB 두 테이블을 두 쿼리로 분리 |
| 4 | 버려지는 `ORDER BY idx DESC` | 호출자가 다른 컬럼으로 재정렬 |

각 병목은 독립적으로 작은 비용이지만, **같은 요청에서 겹치면 10초** 로 확대됩니다. 순서대로 제거합니다.

## Phase 2. 첫 번째 병목 — 34컬럼을 전부 가져와 엔티티로 만든다

### 문제: 실제로 쓰는 컬럼은 하나뿐

문제의 Repository 쿼리는 이런 구조였습니다.

```kotlin
// Before — 엔티티 전체를 읽음
@Query("""
  select n from Notification n
  where n.userId = :userId
    and n.type in :typeIn
    and n.subscriptionId in :subscriptionIds
    and n.itemId not in :bannedItems
  order by n.idx desc
""")
fun findByKeywordSubscriptions(
  userId: String,
  typeIn: List<NotificationType>,
  subscriptionIds: List<String>,
  bannedItems: List<String>,
): List<Notification>
```

`select n`은 엔티티 전체를 가져옵니다. 이 엔티티는 본문(`body`), 템플릿 파라미터, 원본 에러/성공 메시지 등 **TEXT 컬럼을 포함한 34개 필드** 를 갖고 있었습니다. 그런데 호출자 코드를 따라가 보면 결과에서 실제로 쓰는 건 딱 하나였습니다.

```kotlin
val itemIds = allNotifications.mapNotNull { it.itemId }
```

**34개 컬럼을 가져와서 34개 필드를 채우고, 34개 필드 중 1개만 읽는 구조.** 불필요한 네트워크 전송과 JVM 메모리 부담이 붙습니다.

더 큰 부담은 **Hibernate 엔티티 hydration** 입니다. 각 행이 `Notification` 엔티티로 materialize되면서 다음 일들이 일어납니다.

- 1차 캐시(영속성 컨텍스트)에 등록 — 행 수만큼 메모리 점유
- 변경 감지(`dirty checking`)의 스냅샷 생성
- 이후 `flush` 시점에 비교 대상이 됨

변경할 생각이 없는 엔티티를 **로드만 하는 행위가 이미 비용** 입니다. 영속성 컨텍스트의 동작 원리는 [앞 글](/posts/38-jpa-persistence-context)에서 자세히 다뤘습니다.

### 해결: 단일 컬럼 Projection으로 바꾼다

`itemId` 하나만 뽑아내는 프로젝션 쿼리로 교체합니다. 반환 타입도 `List<String>` 으로 단순화하고, 이 단계에서 **중복 제거 `DISTINCT`** 도 같이 적용합니다.

```kotlin
// After — 1 컬럼 projection, 엔티티 hydration 없음
@Query("""
  select distinct n.itemId from Notification n
  where n.userId = :userId
    and n.type in :typeIn
    and n.itemId is not null
    and n.itemId not in :bannedItems
""")
fun findItemIdsByActiveSubscriptions(
  userId: String,
  typeIn: List<NotificationType>,
  bannedItems: List<String>,
): List<String>
```

`ORDER BY` 절과 `subscriptionId IN (...)` 절은 Phase 4·5에서 이어서 다룹니다.

### 왜 이 방식이 유효한가요?

- **네트워크 전송량이 줄어듭니다.** 34컬럼(TEXT 포함) → 1컬럼. 한 행당 수 KB에서 수십 바이트로 축소
- **엔티티 hydration이 완전히 사라집니다.** `List<String>` 매핑은 영속성 컨텍스트를 거치지 않습니다
- **후속 `IN` 쿼리의 파라미터가 작아집니다.** `DISTINCT` 로 중복 `itemId` 가 미리 제거됩니다

Projection은 "필요한 컬럼만 뽑는 최적화"처럼 가볍게 들리지만, 실제로는 **Hibernate가 엔티티로 처리할지 값 목록으로 처리할지를 바꾸는 구조적 변화** 입니다.

## Phase 3. 두 번째 병목 — `IN` 절에 같은 ID가 수십 번 반복된다

### 문제: 상위에서 중복을 걸러주지 않음

쿼리 파라미터를 실측해 보면 `IN` 절이 이렇게 찍히고 있었습니다.

```text
subscriptionId IN (
  'sub_0001',
  'sub_0002',
  ...
  'sub_0075',
  'sub_0075',          -- 같은 ID가 반복
  'sub_0075',
  ...
)
```

고유한 ID는 약 75개인데, **실제 전달되는 리스트 크기는 100개+** 였습니다. 원인은 상위 코드에서 리스트를 조합할 때 `.distinct()` 가 누락된 것이었습니다.

```kotlin
// 문제가 있던 상위 코드
val subscriptionIds = activeSubscriptions.map { it.id }  // 중복 그대로
```

`activeSubscriptions` 는 여러 조건이 합쳐진 집합이라 같은 id가 반복 등장할 수 있었습니다. `IN` 절의 중복은 아래 세 곳에서 비용을 만듭니다.

- **쿼리 파서/플래너 비용** — `IN` 절이 클수록 파싱·상수 테이블 구성 비용이 증가
- **옵티마이저 판단 비용** — MySQL의 `IN` 절 처리는 리스트 크기에 따라 range/ref/index_merge 등 다른 접근을 선택하므로 크기가 플랜을 흔들 수 있음
- **네트워크 전송량** — 각 UUID가 수십 바이트, 수백 개면 KB 단위 오버헤드

### 해결: 수집 단계에서 `.distinct()`

```kotlin
val subscriptionIds = activeSubscriptions
  .mapNotNull { it.id }
  .distinct()

val bannedItems = itemPort.listBySellerInAndStatusIn(bannedUserIds, ...)
  .mapNotNull { it.id }
  .distinct()
```

"너무 당연한 수정 아니냐"고 느낄 수 있지만, **실무에서 놀랄 만큼 자주 누락되는 패턴** 입니다. 리스트 조합이 여러 단계를 거칠수록 어디서 중복이 들어오는지 파악하기 어렵고, 컴파일러가 경고하지도 않습니다.

`IN` 절에 들어가는 컬렉션은 **수집 직후 반드시 `.distinct()` 를 한 번 거친다** — 이 습관만 잡아도 상당수의 비용이 사라집니다.

## Phase 4. 세 번째 병목 — 같은 DB 두 테이블을 두 번에 나눠 조회

### 문제: 앱 ↔ DB 왕복 1회가 불필요

기존 흐름은 이렇게 두 단계로 나뉘어 있었습니다.

```text
Step 1. (DB) keyword_subscription 조회
        WHERE userId = :userId
          AND isActive = true
          AND keywordIdx IN :keywordIdxes
        → 결과 id 리스트를 앱으로 가져옴 (75개)

Step 2. (DB) notification 조회
        WHERE ...
          AND subscriptionId IN (75개 UUID)
        → 결과 itemId 리스트를 앱으로 가져옴
```

두 테이블이 **같은 DB 인스턴스** 에 있고, 개념적으로 **semi-join** 관계입니다. 그런데 앱이 중간에 id를 한 번 받아 다시 `IN` 절에 밀어넣는 구조 때문에 다음이 추가 비용으로 붙습니다.

- 앱 ↔ DB **추가 왕복 1회**
- `keyword_subscription` 의 `id` 75개를 **서버 → 앱 → 서버** 로 두 번 전송
- `IN (…)` 절의 상수 리스트가 쿼리 플래너를 다시 파싱하게 만듦

### 해결: `EXISTS` 서브쿼리로 semi-join을 한 번에

두 쿼리를 하나로 합치는 표준 도구가 **`EXISTS` 서브쿼리** 입니다. JPQL도 그대로 지원합니다.

```kotlin
@Query("""
  select distinct n.itemId from Notification n
  where n.userId = :userId
    and n.type in :typeIn
    and n.itemId is not null
    and n.itemId not in :bannedItems
    and exists (
      select 1 from KeywordSubscription k
      where k.id = n.subscriptionId
        and k.userId = :userId
        and k.isActive = true
        and k.keywordIdx in :keywordIdxes
    )
""")
fun findItemIdsByActiveSubscriptions(
  userId: String,
  typeIn: List<NotificationType>,
  keywordIdxes: List<Long>,
  bannedItems: List<String>,
): List<String>
```

### 왜 이 방식이 유효한가요?

- **앱 ↔ DB 왕복 1회 제거** — 왕복 비용(네트워크 RTT + 앱 스레드 점유)이 한 번 사라짐
- **중간에 떠다니던 UUID 리스트가 사라짐** — `IN (?, ?, …)` 에 담기던 75개 문자열 상수가 제거됨
- **기존 인덱스가 그대로 적중** — `keyword_subscription` 테이블의 `(userId, isActive, keywordIdx)` 인덱스를 서브쿼리가 그대로 탑니다. 스키마 변경 없이 자연스럽게 semi-join 성립

MySQL 8 이후 `EXISTS` 는 **semijoin 변환** 으로 내부적으로 최적화됩니다. 자세한 내용은 [MySQL 문서 — Semijoin Transformations](https://dev.mysql.com/doc/refman/8.4/en/semijoins.html)를 참고하세요.

## Phase 5. 네 번째 병목 — 쓰지도 않는 `ORDER BY`

### 문제: 호출자가 다시 정렬한다

원래 쿼리는 `ORDER BY n.idx DESC` 로 정렬했습니다. 그런데 이 결과를 받는 호출자는 아래처럼 **다른 컬럼으로 재정렬** 하고 있었습니다.

```kotlin
// 호출자 쪽 쿼리
itemPort.listByIdInAndStatusesInWithOffset(
  idIn = itemIds,             // 알림 쿼리에서 받은 리스트
  statuses = statuses,
  offset = offset,
  limit = limitSize,
)

// itemPort 내부 쿼리
// SELECT * FROM item
// WHERE id IN :idIn AND status IN :statuses
// ORDER BY firstPublishedAt DESC
// LIMIT :limitSize OFFSET :offsetSize
```

두 가지 관찰.

1. `IN :idIn` 은 **집합 연산** 입니다. 리스트의 순서도 중복도 결과에 영향을 주지 않습니다
2. 최종 정렬은 `item.firstPublishedAt` 기준으로 **호출자가 수행** 합니다

즉 알림 쿼리에서 `ORDER BY n.idx DESC` 로 정렬한 결과는 **그 다음 단계에서 그대로 버려집니다**. `filesort` 비용만 낭비되는 셈입니다.

### 해결: 알림 쿼리의 `ORDER BY` 제거

Phase 2·4에서 만든 최종 쿼리에는 `ORDER BY` 가 이미 없습니다.

```kotlin
@Query("""
  select distinct n.itemId from Notification n
  where ...
    and exists (...)
""")  // ORDER BY 없음
```

### 안전성 증명 — 왜 `ORDER BY` 를 빼도 결과가 달라지지 않나요?

- 알림 쿼리의 반환값 `itemIds` 는 **다음 단계의 `IN` 절 입력** 으로만 쓰임
- `IN` 은 순서/중복 모두에 무관한 집합 연산
- 최종 페이지 결과는 `item.firstPublishedAt DESC + LIMIT/OFFSET` 으로 결정

따라서 **알림 쿼리 내 정렬은 최종 응답에 아무 영향이 없습니다**. 제거가 안전합니다.

## Phase 6. 검토했지만 선택하지 않은 대안들

성능만 보면 더 공격적인 선택지들이 있었지만, 제약이 있었습니다. **"결과 집합과 동작이 100% 동일해야 한다"** 는 원칙. 아래 세 안은 이 기준에서 탈락했습니다. **왜 탈락시켰는지가 이 글의 가장 중요한 교훈이기도 합니다.**

### 대안 A — `NOT IN` 절을 앱 레벨 차집합으로 변환

DB에 `NOT IN (…bannedItems…)` 를 보내는 대신, 알림을 먼저 읽고 앱에서 `bannedItems` 를 빼는 방식.

- **correctness 리스크** — 기존 코드에는 `bannedItems.ifEmpty { listOf("") }` 같은 방어 로직이 있었음. 앱 차집합으로 옮기면 이 의미가 달라질 수 있음
- **성능 역효과 가능성** — `bannedItems` 가 크면 `NOT IN` 이 걸러내 주던 행들이 전부 앱으로 올라와 메모리에서 걸러짐 → 네트워크 전송량과 GC 부담이 오히려 증가

성능이 단조로 좋아진다고 확신할 수 없었고, 잠재적 buggy 경로도 있어 제외.

### 대안 B — Redis 캐시 도입 (`bannedUsers`, `activeSubscriptions`)

읽기가 빈번한 목록 캐싱.

- **staleness 문제** — 캐시 TTL 안에서는 "차단 직후에도 해당 유저의 아이템이 알림에 노출" 같은 **관측 가능한 동작 변경** 이 발생
- **완벽한 invalidation도 race가 남음** — 분산 환경에서 캐시 갱신 시점과 쓰기 시점 사이의 틈

캐시 전략·무효화·race condition의 일반 논의는 [캐시 전략 글](/posts/16-cache-strategy-fundamentals)과 [캐시 스탬피드 글](/posts/17-cache-stampede-and-hot-key)에서 다뤘습니다. 여기서는 **동작 동일성 제약을 깨뜨린다** 는 이유로 제외.

### 대안 C — 선행 조회 병렬화 (`coroutineScope { async { ... } }` 등)

`keyword_subscription` 조회와 `bannedItems` 조회를 병렬로 실행.

- **트랜잭션 스냅샷 경계 변화** — 순차 실행에서는 동일 트랜잭션·동일 스냅샷으로 읽던 두 데이터가, 병렬화 시 서로 다른 커넥션에서 실행될 수 있음
- **읽기 일관성 미세 차이** — `REPEATABLE READ` 기준에서 트랜잭션이 갈리면 읽기 스냅샷 시점이 달라져, 경계 사례에서 기존과 다른 결과가 나올 수 있음

"아무도 눈치 못 챌 수준"이지만 **읽기 일관성 의미가 달라진다는 사실 자체** 가 이 제약에서는 선택할 수 없는 근거가 됩니다. 격리 수준과 스냅샷의 의미는 [격리 수준 글](/posts/07-transaction-isolation-levels)에서 다뤘습니다.

### 배제의 공통 원칙

세 대안을 배제한 이유는 결국 하나입니다.

> **성능 이득이 확실하지 않거나, 성능 이득이 있더라도 동작이 "관측 가능하게" 달라지는 변경은 선택하지 않는다.**

성능 개선은 **correctness 위에서만** 의미가 있고, correctness를 양보한 성능은 나중에 더 큰 버그 비용으로 돌아옵니다.

## Phase 7. 최종 코드

Phase 2–5 를 모두 합친 결과입니다.

```kotlin
interface NotificationRepository : JpaRepository<Notification, Long> {

  /**
   * 활성 키워드 구독에 연결된 알림에서 itemId만 projection.
   * EXISTS로 semi-join, ORDER BY 제거, 단일 컬럼 반환.
   */
  @Query("""
    select distinct n.itemId from Notification n
    where n.userId = :userId
      and n.type in :typeIn
      and n.itemId is not null
      and n.itemId not in :bannedItems
      and exists (
        select 1 from KeywordSubscription k
        where k.id = n.subscriptionId
          and k.userId = :userId
          and k.isActive = true
          and k.keywordIdx in :keywordIdxes
      )
  """)
  fun findItemIdsByActiveSubscriptions(
    userId: String,
    typeIn: List<NotificationType>,
    keywordIdxes: List<Long>,
    bannedItems: List<String>,
  ): List<String>
}

class NotificationService(
  private val notificationRepository: NotificationRepository,
  private val subscriptionPort: SubscriptionPort,
  private val itemPort: ItemPort,
) {

  fun listKeywordNotifications(
    userId: String,
    keywords: List<String>,
  ): List<Item> {
    // 1) 입력 파라미터 수집 단계에서 .distinct()
    val keywordIdxes =
      (if (keywords.isNotEmpty()) subscriptionPort.list(keywords)
       else subscriptionPort.list(userId))
        .mapNotNull { it.keywordIdx }
        .distinct()

    val bannedItems = itemPort
      .listBySellerInAndStatusIn(loadBannedUsers(userId), ...)
      .mapNotNull { it.id }
      .distinct()

    // 2) 단일 컬럼 projection + EXISTS semi-join
    val itemIds = notificationRepository.findItemIdsByActiveSubscriptions(
      userId, NOTIFICATION_TYPES, keywordIdxes, bannedItems,
    )

    // 3) 최종 정렬·페이징은 item 쪽에서 수행
    return itemPort.listByIdInAndStatusesInWithOffset(
      itemIds, ACTIVE_STATUSES, offset, limitSize,
    )
  }
}
```

핵심 변경을 한 줄로 요약하면 네 가지입니다.

- **Repository**: `select n` → `select distinct n.itemId` + `EXISTS` 서브쿼리 + `ORDER BY` 제거
- **Service**: 선행 `subscription.list` 호출 제거 (`EXISTS` 로 흡수됨)
- **Service**: `IN` 절에 들어가는 모든 리스트에 `.distinct()` 적용
- **Repository**: 반환 타입 `List<Notification>` → `List<String>`

## 결과

| 항목 | Before | After |
|------|--------|-------|
| SELECT 컬럼 수 | 34 | 1 |
| 엔티티 hydration | 행 수만큼 | 0 |
| `IN` 절 크기 (고유/실제) | 75 / 100+ | 75 / 75 |
| DB 왕복 | 2회 | 1회 |
| `ORDER BY` (본 쿼리) | `idx DESC` (버려짐) | 없음 |
| 인덱스 변경 | — | 없음 |
| 스키마 변경 | — | 없음 |

낙관적 시나리오에서 P95 10초 → 1~3초 범위를 목표로 했고, 실측도 그 범위 안에 들어왔습니다. 비관적 시나리오(문제의 유저 매칭 행 수가 수만 건일 때)에서도 **엔티티 hydration 제거와 왕복 감소**의 효과는 상수로 보장됩니다.

## 배포 전 점검

같은 종류의 쿼리 최적화를 할 때 권장하는 검증 순서입니다.

1. **스테이징에서 `EXPLAIN` 비교** — 변경 전/후 실행 계획 확인
    - 서브쿼리가 기존 인덱스를 타는지
    - `filesort` 가 사라졌는지
    - `type` 이 `ref`/`range`/`eq_ref` 등 의도한 접근인지
2. **실제 응답시간 측정** — 문제 유저·파라미터로 before/after P50/P95 비교
3. **결과 동일성 회귀 테스트** — 동일 입력에 대해 기존 구현과 새 구현의 응답을 diff. 최종 아이템 리스트(순서 포함)가 일치하는지 확인

특히 3번은 "동작 동일성을 깨지 않겠다"는 제약을 실제로 보증하는 유일한 방법입니다.

## 교훈

이번 개선에서 일반화할 수 있는 점 다섯 가지.

1. **"SELECT n" 은 모든 컬럼 fetch + 엔티티 hydration** — 필요한 컬럼이 한두 개뿐이면 projection으로 바꾸는 것이 거의 항상 이득입니다. JPQL의 `select distinct n.column` 형태를 적극 활용
2. **`IN` 절에 들어가는 컬렉션은 수집 직후 `.distinct()`** — 쿼리 파서·옵티마이저·네트워크 세 군데 모두에서 비용을 만드는 중복은, 한 줄로 막을 수 있는 흔한 실수
3. **두 번 왕복하는 흐름은 `EXISTS` 또는 JOIN으로 한 번에** — 같은 DB의 두 테이블을 앱에서 왕복 합칠 이유가 없다면 쿼리 레벨 semi-join으로 합치는 것이 자연스러운 정답
4. **호출자가 재정렬하는 쿼리의 `ORDER BY` 는 지울 수 있습니다** — filesort는 공짜가 아닙니다. "어차피 버려지는 정렬"인지 호출 체인을 한번 따라가 보면 간단히 드러납니다
5. **성능 개선 옵션을 평가할 때 correctness cost를 가장 먼저 본다** — 캐시·병렬화·앱 차집합처럼 매력적인 옵션일수록 "관측 가능한 동작 변경" 이 숨어 있는지 먼저 점검. 성능은 correctness 위에서만 의미가 있습니다

마지막 교훈을 한 문장으로 줄이면 이렇게 됩니다.

> **"빠르지만 미묘하게 다르게 동작하는" 코드는 언젠가 더 비싼 버그가 됩니다. 동작 동일성이 가장 값싼 최적화입니다.**

---
title: "N+1 쿼리와 캐시 미스 — 커뮤니티 모듈 성능 개선기"
date: "2026-04-06"
category: "troubleshooting"
tags: ["Kotlin", "JPA", "Redis", "N+1", "Spring Boot"]
excerpt: "리뷰 목록 40번 쿼리, 해시태그 N+1, 캐시 적중률 0%에 가까운 등급 뱃지 — 세 가지 성능 문제를 해결한 과정을 공유합니다."
---

## 이런 증상을 겪고 계신가요?

커뮤니티 모듈의 API 응답 시간이 점점 느려지고 있었습니다. 로그를 열어보니 원인은 명확했습니다.

- 리뷰 목록 조회 시 **리뷰 20건에 쿼리 40번**
- 게시글 검색 시 **게시글마다 해시태그 개별 조회**
- 등급 뱃지 캐시를 적용했는데 **적중률이 거의 0%**

이 글에서는 이 세 가지 문제를 각각 진단하고 해결한 과정을 정리합니다.

---

## Phase 1. 리뷰 목록 N+1 — 루프 안의 개별 쿼리 제거

### 문제: 리뷰 20건에 쿼리가 40번?

리뷰 목록을 조회할 때, 각 리뷰에 포함된 상품의 판매자 정보와 이미지를 **건별로 개별 조회**하고 있었습니다.

```kotlin
// Before: 리뷰마다 2번의 추가 쿼리
val itemDtos: List<ItemDto> = items.mapNotNull { item ->
    val seller = sellerPort.getSellerDto(item)        // N번 실행
    val image = imagePort.getImage(item)?.let { ... }  // N번 실행
    ItemDto(seller = seller, image = image, ...)
}
// 리뷰 20개 → 40번의 추가 쿼리
```

### 해결: 배치 조회 + Map 매핑

ID 목록을 미리 수집하고, 한 번의 배치 쿼리로 필요한 데이터를 모두 가져온 뒤 `Map`으로 변환하는 패턴을 적용했습니다.

```kotlin
// After: 배치 조회 + Map 매핑
val sellerMap = sellerPort.getSellerDtoMap(items)
val imageMap = imagePort.list(
    items.mapNotNull { it.id }
).associateBy { it.targetId }

val itemDtos: List<ItemDto> = items.mapNotNull { item ->
    val seller = sellerMap[item.id]     // O(1) Map 조회
    val image = imageMap[item.id]?.let { ... }  // O(1) Map 조회
    ItemDto(seller = seller, image = image, ...)
}
// 리뷰 20개 → 2번의 배치 쿼리
```

이 패턴을 정리하면 다음과 같습니다.

```
1. 필요한 ID 목록 수집
2. ID 목록으로 배치 조회 (1회 쿼리)
3. 결과를 Map<ID, Entity>로 변환
4. 원본 목록을 순회하며 Map에서 O(1) 조회
```

---

## Phase 2. 해시태그 조회 N+1 — 배치 JPQL과 트랜잭션 경계

### 문제: 게시글마다 해시태그를 따로 조회한다고?

게시글 검색 결과에 해시태그를 표시할 때, 게시글별로 해시태그를 개별 조회하고 있었습니다. 게시글이 10건이면 해시태그 쿼리도 10번 나가는 구조였습니다.

### 해결: 배치 JPQL + 메모리 그룹핑

`join fetch`로 한 번에 가져온 뒤, 메모리에서 게시글 ID 기준으로 그룹핑했습니다.

```kotlin
// Repository: 배치 조회 쿼리
@Query(
    "select atag from ArticleTag atag " +
        "join fetch atag.tag " +
        "where atag.article.id in (:articleIds)"
)
fun findAllByArticleIdIn(articleIds: Collection<String>): List<ArticleTag>
```

```kotlin
// Service: 메모리에서 그룹핑
val tagsByArticleId = articleTagRepository
    .findAllByArticleIdIn(articles.map { it.id })
    .groupBy { it.article.id }

articles.associate { article ->
    article.id to tagsByArticleId[article.id]
        .orEmpty()
        .map(::toView)
}
```

### 트랜잭션 경계도 함께 명시화

해시태그 조회가 Lazy Loading에 의존하지 않도록, `TransactionTemplate`으로 트랜잭션 경계를 명시했습니다.

```kotlin
TransactionTemplate(transactionManager).apply {
    isReadOnly = true
}.execute {
    val articles = articleRepository.listByIds(ids)
    val tags = articleTagRepository.findAllByArticleIdIn(articles.map { it.id })
    // 동일 트랜잭션 내에서 모든 데이터 로드 완료
    assembleResult(articles, tags)
}
```

> **참고:** `@Transactional`은 프록시 기반이라 같은 클래스 내부 호출에서 동작하지 않을 수 있습니다. `TransactionTemplate`을 사용하면 트랜잭션 범위를 코드 레벨에서 명확하게 제어할 수 있고, `isReadOnly = true`로 Hibernate의 dirty checking 비용도 제거할 수 있습니다.

---

## Phase 3. 등급 뱃지 캐시 적중률 — 캐시 키가 원인이었다

### 문제: 캐시를 걸었는데 왜 매번 계산하지?

등급 뱃지 계산은 비용이 큰 작업입니다. 한 달간의 전체 구매 데이터를 집계해 상위 구매자를 추출하는 로직이라, 특정 사용자가 아닌 **월 단위 글로벌 계산**입니다. Redis 캐시를 적용했지만, **캐시 적중률이 거의 0%에 가까웠습니다.**

원인은 캐시 키에 있었습니다.

```kotlin
// Before: Request 객체 전체가 캐시 키
@Cacheable(cacheNames = ["CALCULATE_GRADE_BADGE"], key = "#request")
fun calculate(request: GradeBadgeRequest) { ... }
```

`GradeBadgeRequest`에는 타임스탬프가 포함되어 있었습니다. **같은 월이라도 요청 시각이 다르면 캐시 미스**가 발생했습니다.

```
요청 1: { at: 1772377200000 }  → 캐시 MISS, 계산 실행
요청 2: { at: 1772377201000 }  → 캐시 MISS, 다시 계산 (1초 차이)
요청 3: { at: 1772377202000 }  → 캐시 MISS, 또 계산...
```

### 해결: 월 단위 캐시 키

등급 뱃지는 월별 구매 이력을 기반으로 계산하므로, **같은 월의 모든 요청은 동일한 결과**를 반환합니다. 이 도메인 특성을 캐시 키에 반영했습니다.

```kotlin
companion object {
    const val CACHE_NAME = "CALCULATE_GRADE_BADGE"
    private val KOREA_ZONE_ID = ZoneId.of("Asia/Seoul")
    private val MONTH_KEY_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM")
}

@Cacheable(cacheNames = [CACHE_NAME], key = "#root.target.toMonthKey(#request)")
fun calculate(request: GradeBadgeRequest) { ... }

fun toMonthKey(request: GradeBadgeRequest): String =
    Instant.ofEpochMilli(request.at)
        .atZone(KOREA_ZONE_ID)
        .format(MONTH_KEY_FORMATTER)  // "2026-03"
```

```
요청 1: { at: 1772377200000 } → 키: "2026-03" → 캐시 MISS, 계산
요청 2: { at: 1772377201000 } → 키: "2026-03" → 캐시 HIT!
요청 3: { at: 1772463600000 } → 키: "2026-03" → 캐시 HIT!
요청 4: { at: 1777647600000 } → 키: "2026-05" → 캐시 MISS, 새 월 계산
```

TTL도 함께 조정했습니다.

```
Before: 15일 (월 중간에 캐시 만료 → 불필요한 재계산)
After:  40일 (한 달 + 여유분, 월이 바뀌면 새 키로 자동 전환)
```

> **참고:** 한국 서비스이므로 `Asia/Seoul` 타임존으로 정규화합니다. UTC 기준으로 하면 한국 시간 자정~오전 9시 사이에 월이 다르게 계산될 수 있습니다.

---

## 개선 결과

| 영역 | 개선 전 | 개선 후 | 응답 시간 (추정) |
|------|--------|--------|----------------|
| 리뷰 목록 (20건) | 40번 개별 쿼리 | 2번 배치 쿼리 | ~120ms → ~15ms |
| 해시태그 조회 (10건) | 10번 개별 쿼리 | 1번 배치 쿼리 (`join fetch`) | ~60ms → ~8ms |
| 등급 뱃지 캐시 | 거의 매번 MISS | 월 1회만 계산 | ~200ms → ~3ms (캐시 HIT 시) |
| 트랜잭션 관리 | 암시적 (Lazy Loading 의존) | 명시적 (`TransactionTemplate`) | — |

---

## 교훈

1. **"루프 안에서 쿼리를 실행하는가?"** — 이 한 가지 질문만으로 대부분의 N+1을 잡을 수 있습니다. 코드 리뷰에서 가장 먼저 확인해야 할 체크리스트입니다.
2. **배치 조회 + Map 매핑은 N+1의 정석 패턴입니다.** — ID 목록 수집 → 배치 쿼리 → `Map` 변환 → O(1) 조회. 이 흐름을 기계적으로 적용할 수 있습니다.
3. **캐시 키 설계는 기술적 판단이 아니라 도메인 판단입니다.** — "이 데이터가 실제로 언제 바뀌는가?"를 기준으로 키의 차원과 TTL을 결정해야 합니다. 불필요한 차원(타임스탬프, 디바이스 타입 등)은 적중률을 떨어뜨릴 뿐입니다.
4. **트랜잭션 경계는 명시적으로 관리하는 것이 안전합니다.** — Lazy Loading에 의존하면 트랜잭션 밖에서 프록시 접근 에러가 발생할 수 있고, `TransactionTemplate`은 이 문제를 코드 레벨에서 방지해줍니다.

---
title: "Discovery 모듈 성능 개선기 — Protobuf 제거, 캐시 도입, 검색 정확도 향상"
date: "2026-04-06"
category: "troubleshooting"
tags: ["Kotlin", "Redis", "OpenSearch", "Spring Boot"]
excerpt: "Service에 침투한 Protobuf, 상품 목록 N+1, 매 요청마다 DB 조회, 공백 검색 불일치 — 네 가지 문제를 해결한 과정을 공유합니다."
---

## 이런 증상을 겪고 계신가요?

이커머스 홈 화면(Discovery) 모듈의 성능과 유지보수성이 동시에 문제가 되고 있었습니다.

- Service 계층에 **Protobuf 객체가 직접 침투**해 있어 변경 영향 범위가 넓음
- 상품 목록 조회 시 **상품마다 3번의 추가 쿼리** (N+1)
- 홈 화면 큐레이션 블록이 **매 요청마다 DB를 조회**
- "원피스" 검색 시 **"여름원피스" 등 공백 없는 결과가 누락**

이 글에서는 이 문제들을 Protobuf 제거, 캐시 전략 도입, 검색 분석기 개선으로 해결한 과정을 정리합니다.

---

## Phase 1. Protobuf → View 객체 전환

### 문제: Service가 Protobuf를 알아야 해?

Discovery 모듈의 비즈니스 로직 전반에 gRPC Protobuf 객체가 침투해 있었습니다.

```kotlin
// Before: Service 계층에 Protobuf 의존성
data class ListCatalogCommand(
    val usageType: HomeCatalogRequest.UsageType,  // Protobuf enum
    val brandIds: List<String>,
)

data class ListSectionCommand(
    val userId: String?,
    val request: HomeListSectionsRequest,  // Protobuf 객체 통째로
)
```

이로 인해 외부 프로토콜 변경이 내부 비즈니스 로직에 직접 영향을 주고, Protobuf 객체는 Redis 캐싱 시 직렬화 오버헤드가 크며, 테스트에서 Builder 패턴으로 Mock 데이터를 생성하기 번거로웠습니다.

### 해결: API 경계에서만 변환

Protobuf는 Web Mapper에서만 사용하고, 내부는 순수 Kotlin View 객체로 통일했습니다.

```kotlin
// After: 순수 Kotlin 모델
data class ListCatalogCommand(
    val usageType: String,  // "ITEM_SEARCH_FILTER"
    val brandIds: List<String>,
)

// View 객체 도입
data class BrandPriceView(
    val brandId: String,
    val name: String,
    val image: ImageView,
    val catalogPrices: List<CatalogPriceView>,
)

data class ListBrandPricesResult(
    val brandPrices: List<BrandPriceView>,
    val calculatedAt: Long,
)
```

```kotlin
// Web Mapper: API 경계에서만 Protobuf 변환
fun toProtobuf(result: ListBrandPricesResult): HomeListBrandPricesResult =
    HomeListBrandPricesResult.newBuilder()
        .addAllBrandPrices(result.brandPrices.map(::toDto))
        .setCalculatedAt(result.calculatedAt)
        .build()
```

### ViewAssembler 분산

기존에 하나의 거대한 Mapper에 모든 변환 로직이 집중되어 있었습니다. 이를 도메인별 Assembler로 분산했습니다.

```
// Before: 단일 거대 Mapper
HomeViewMapper
├── toView(HomeImage)
├── toView(HomeBrand)
├── toView(HomeCategory)
├── toView(HomeCatalog)
└── ... 수십 개의 메서드

// After: 도메인별 Assembler
ImageViewAssembler      → 이미지 변환
BrandViewAssembler      → 브랜드 변환
CategoryViewAssembler   → 카테고리 변환
CatalogViewAssembler    → 카탈로그 변환
ProductViewAssembler    → 상품 변환 (Context 패턴)
```

도메인별 Assembler 분리로 코드량이 줄고, 각 Assembler를 독립적으로 테스트할 수 있게 되었습니다.

---

## Phase 2. Redis 캐시 전략 도입

### 문제: 상품 20개에 쿼리가 60번?

상품 목록을 조회할 때, 각 상품마다 썸네일, 브랜드, 카테고리를 개별 조회하는 N+1 문제가 있었습니다. 개별 상품 단위로 `@Cacheable`이 적용되어 있었지만, **캐시 미스 시 N+1이 그대로 발생**하고, 캐시 히트여도 **Redis 조회 자체가 N번** 일어나는 구조였습니다.

```kotlin
// Before: 상품 단위 개별 캐시 (N+1 구조)
@Cacheable(cacheNames = ["TO_PRODUCT_DTO"], key = "#productId")
fun toProductDto(productId: String): ProductDto {
    val thumbnail = loadThumbnail(productId)  // 캐시 미스 시 DB 조회
    val brand = loadBrand(productId)          // 캐시 미스 시 DB 조회
    val category = loadCategory(productId)    // 캐시 미스 시 DB 조회
    return ProductDto(thumbnail, brand, category)
}
// 상품 20개 → 캐시 미스 시 60번 DB 조회, 히트 시에도 20번 Redis 조회
```

### 해결: Context Resolver 패턴으로 배치 조회

```kotlin
// After: 배치 조회 + 메모리 매핑
class ProductViewContextResolver {
    fun resolve(products: List<HomeProduct>): ProductViewContext =
        ProductViewContext(
            thumbnailsByProductId = loadThumbnails(products).associateBy { it.targetId },
            brandsByProductId = loadBrands(products).associateBy { it.id },
            categoriesByProductId = loadCategories(products).associateBy { it.id },
        )
}

class ProductViewAssembler {
    fun assemble(products: List<HomeProduct>, context: ProductViewContext): List<ProductView> =
        products.map { product ->
            ProductView(
                thumbnail = context.thumbnailsByProductId[product.id],
                brand = context.brandsByProductId[product.brandId],
                // O(1) 메모리 조회
            )
        }
}
// 상품 20개 → 3번의 배치 조회
```

> **참고:** 개별 캐시(`@Cacheable` per item) 대신 배치 조회를 선택한 이유는 세 가지입니다. (1) cold start 시 N+1이 그대로 발생, (2) TTL 관리 포인트가 N배 증가, (3) 개별 캐시는 각기 다른 시점의 데이터가 반환될 수 있어 일관성이 깨집니다.

### 큐레이션 블록 캐시 도입

홈 화면의 핵심인 큐레이션 블록 데이터에 Redis 캐시를 적용했습니다.

```kotlin
@Service
class ResolveCurationBlockViewService(
    private val loadCurationBlockPort: LoadCurationBlockPort,
    private val curationBlockViewAssembler: CurationBlockViewAssembler,
) {
    @Cacheable(cacheNames = ["CURATION_BLOCK_VIEW"], key = "#blockId")
    fun getBlockView(section: SectionView?, blockId: String): CurationBlockView {
        val (block, banners) = loadCurationBlockPort.getBlockWithBanners(blockId)
        return curationBlockViewAssembler.assemble(block, section, banners)
    }
}
```

### 캐시 무효화: 메시지 이벤트 기반

관리자가 블록을 수정하면 메시지 이벤트를 발행하고, 핸들러가 캐시를 선택적으로 무효화합니다.

```kotlin
@Service
class HomeCacheEvictHandler {
    fun handle(request: CacheEvictBlockBannerRequest) {
        homeCacheEvictSupport.evictBlockView(request.blockId)
        homeCacheEvictSupport.evictBlockIdList(request.sectionId)
    }
}

@Service
class HomeCacheEvictSupport {
    @CacheEvict(cacheNames = ["CURATION_BLOCK_VIEW"], key = "#blockId")
    fun evictBlockView(blockId: String) {}

    @CacheEvict(cacheNames = ["LIST_BLOCK_IDS"], key = "#sectionId")
    fun evictBlockIdList(sectionId: String) {}
}
```

```
Admin UI (수정) → 메시지 이벤트 → CacheEvictHandler → Redis 캐시 삭제
                                                     → 다음 요청 시 DB에서 재로드
```

> **참고:** `@CacheEvict`를 직접 호출하지 않고 메시지 큐를 경유하면, Admin 모듈과 홈 화면 모듈의 직접 의존을 제거할 수 있고, 관리자 작업의 응답 시간에도 영향을 주지 않습니다.

---

## Phase 3. OpenSearch 검색 분석기 개선

### 문제: "원피스"를 검색하면 "여름원피스"가 안 나온다

사용자가 "원피스"를 검색할 때 "썸머 원피스", "여름원피스" 등의 결과가 누락되는 문제가 있었습니다. 특히 **공백 유무에 따른 검색 불일치**가 심각했습니다.

### 해결: 다중 필드 + Compact 분석기

```kotlin
mm.fields(
    "name^2",                  // 상품명 (가중치 2)
    "name.compact^5",          // 상품명 공백제거 (가중치 5, 최우선)
    "name.ngram^1",            // N-gram 부분 매칭

    "subName^2",               // 부제목 (새로 추가)
    "subName.compact^5",       // 부제목 공백제거
    "subName.ngram",           // 부제목 N-gram

    "brandNames^2",            // 브랜드명
    "brandNames.compact^4",    // 브랜드명 공백제거
    "brandNames.ngram",        // 브랜드명 N-gram

    "categoryName^2",          // 카테고리명
    "categoryName.compact^4",
    "categoryName.ngram",
)
```

**가중치 전략:**

| 필드 타입 | 가중치 | 용도 |
|-----------|--------|------|
| `.compact` | 4~5 | 공백 제거 후 매칭 (정확도 최우선) |
| 원본 필드 | 2 | 띄어쓰기 포함 정확 매칭 |
| `.ngram` | 1 | 부분 문자열 매칭 (recall 확보) |

**검색 연산자:**
- `TextQueryType.CrossFields`: 검색어 토큰을 여러 필드에 걸쳐 매칭. 단, analyzer가 서로 다른 필드는 별도 그룹으로 나뉘어 처리됩니다
- `Operator.And`: 모든 토큰이 매칭되어야 결과에 포함

예시: "마르디 원피스" 검색 시
- "마르디"는 `brandNames`에서, "원피스"는 `name`에서 매칭 → 결과 포함
- "마르디"만 매칭되고 "원피스"가 없으면 → 결과 제외

---

## 개선 결과

| 영역 | 개선 전 | 개선 후 |
|------|--------|--------|
| 모듈 결합도 | Protobuf가 Service까지 침투 | API 경계에서만 변환 |
| 상품 목록 조회 | N+1 (상품 수 x 3 쿼리) | 배치 3회 조회 |
| 큐레이션 블록 응답 | 매 요청마다 DB 조회 | Redis 캐시 + 메시지 기반 무효화 |
| 검색 필드 | 5개 필드 | 12개 필드 (부제목, compact 추가) |
| 공백 검색 | 매칭 실패 | compact 분석기로 해결 |

---

## 교훈

1. **캐싱 대상 객체를 먼저 경량화하고, 그 위에 캐시를 얹어야 합니다.** — Protobuf 같은 무거운 객체를 캐싱하면 직렬화 오버헤드가 크고, View 객체로 전환한 뒤 캐시를 적용하는 순서가 효과적입니다.

2. **Context Resolver 패턴은 목록 조회의 N+1을 구조적으로 방지합니다.** — 배치 조회 + Map 매핑을 Context 객체로 캡슐화하면, Assembler에서 O(1) 조회만으로 뷰를 조립할 수 있습니다.

3. **캐시 무효화는 모듈 경계를 넘지 않아야 합니다.** — 메시지 큐 기반 무효화를 사용하면 Admin과 홈 화면 모듈 간 직접 의존 없이 캐시를 관리할 수 있습니다.

4. **한국어 검색에서 공백은 반드시 별도 분석기로 처리해야 합니다.** — compact 분석기로 공백을 제거한 필드를 높은 가중치로 매칭하면, "원피스"와 "여름원피스"를 동시에 잡을 수 있습니다.

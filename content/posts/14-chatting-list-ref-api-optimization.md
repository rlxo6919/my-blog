---
title: "채팅방 목록 요약 API 성능 개선기 - 응답 경량화와 N+1 제거"
date: "2026-04-08"
category: "troubleshooting"
tags: ["Kotlin", "JPA", "Protobuf", "Spring Boot"]
excerpt: "채팅 목록 전용 요약 API가 이름만 가벼웠던 이유를 추적하고, 응답 필드 최적화와 배치 조회로 DB 쿼리를 약 80% 줄인 과정을 정리합니다."
---

## 이런 증상을 겪고 계신가요?

채팅 목록 화면을 위해 별도의 요약 API를 만들었는데도, 실제 체감 성능은 크게 좋아지지 않는 경우가 있습니다.

- 목록 화면에서는 일부 필드만 쓰는데도 **상세 화면 수준의 데이터를 그대로 조회**
- 요약 API로 분리했는데도 **DB 쿼리 횟수는 기존 API와 거의 동일**
- 채팅방 수가 늘수록 **거래, 이미지, 제한 정보 조회가 N+1로 증가**
- Protobuf 응답에서 기본값 필드까지 채워 **불필요한 페이로드가 계속 전송**

이번 글에서는 "목록 전용 요약 API"가 왜 실제로는 가볍지 않았는지, 그리고 어떤 기준으로 조회와 응답을 분리했는지 정리합니다.

## Phase 1. 응답 필드부터 줄였다 - 목록에서 안 쓰는 값 제거

### 문제: 안 쓰는 필드도 다 채우고 있었다

겉으로 보면 이 API는 목록 전용 요약 API처럼 보였습니다. 하지만 내부 구현은 기존 채팅방 목록 API와 같은 조회 파이프라인을 공유하고 있었습니다.

즉, **응답 DTO의 겉모양만 조금 달랐을 뿐**, 실제로는 목록 화면에서 전혀 쓰지 않는 데이터까지 모두 조회하고 있었습니다.

목록 화면에서 실제로 필요한 값은 아래 정도였습니다.

```text
ChatRoomListItem {
  idx
  isAllRead
  availabilityStatus

  participants[] { userId, profileImageUrl, nickname, role }
  lastMessagePreview { sentAt, chatType, content }
  item { status, image { thumbnail, original } }
  orderSummary { buyerId, status }
}
```

문제는 이보다 훨씬 많은 데이터를 조회하고, Assembler에서도 대부분의 필드를 일단 채운 뒤 내려보내고 있었다는 점입니다.

아래 코드는 외부 공개용으로 일반화한 의사 코드입니다. 실제 내부 식별자와 모델명은 제거했습니다.

기존 변환 로직은 요약 API에서도 상세 API와 거의 같은 방식으로 DTO를 조립하고 있었습니다.

```kotlin
// Before: 목록에서도 상세 응답용 DTO를 거의 그대로 구성
fun toDetailResponse(view: ChatRoomDetailData): ChatRoomListItem =
    ChatRoomListItem.newBuilder()
        .setInternalId(view.room.internalId)
        .setIdx(view.room.idx)
        .setTargetRef(view.room.targetRef)
        .setRealtimeSource(view.room.realtimeSource)
        .setLastMessagePreview(messagePreviewMapper.toDetailResponse(view.lastMessage))
        .setItem(itemSummaryMapper.toDetailResponse(view.item))
        .setOrderSummary(orderSummaryMapper.toDetailResponse(view.order))
        .setModerationInfo(moderationInfoMapper.toDetailResponse(view.moderationInfo))
        .setHasOutgoingMessage(view.hasOutgoingMessage)
        .build()
```

목록에서 쓰지 않는 필드까지 모두 세팅하면 두 가지 문제가 생깁니다.

- 불필요한 데이터 조회를 계속 유지하게 됨
- Protobuf 응답에 채워진 필드가 늘어나면서 페이로드도 커짐

### 해결: 요약 응답 전용 Assembler 분리

목록 전용 `toListItem()`을 따로 두고, 실제 사용 필드만 세팅하도록 분리했습니다.

```kotlin
// After: 목록 화면에서 쓰는 필드만 구성
fun toListItem(view: ChatRoomDetailData): ChatRoomListItem =
    ChatRoomListItem.newBuilder()
        .setIdx(view.room.idx)
        .setIsAllRead(view.room.isAllRead)
        .setAvailabilityStatus(view.availabilityStatus)
        .addAllParticipants(view.participants.map(participantMapper::toDto))
        .setLastMessagePreview(messagePreviewMapper.toListItem(view.lastMessage))
        .setItem(itemSummaryMapper.toListItem(view.item))
        .setOrderSummary(orderSummaryMapper.toListItem(view.order))
        .build()
```

제거한 대표 필드는 다음과 같습니다.

| 제거한 필드 | 이유 |
|-------------|------|
| 내부 식별자, 타깃 참조값, 실시간 동기화 소스 ID | 목록 화면에서 미사용 |
| `lastSentChat.idx`, `senderId`, `jsonContent` 등 | 미리보기에는 불필요 |
| `item.id`, `item.name`, `item.designer` | 목록에서는 상태와 썸네일만 필요 |
| `orderSummary.id`, `orderSummary.itemId` | `buyerId`, `status`만 필요 |
| 부가 안내 정보, 송신 여부 플래그 | 목록 화면에서 사용하지 않음 |

> Protobuf는 기본값인 `0`, `""`, `false`를 와이어 포맷에서 생략할 수 있으므로, 아예 세팅하지 않는 것 자체가 응답 크기 감소로 이어집니다.

---

## Phase 2. 요약 API인데 값이 비어 있던 필드를 바로잡았다

### 문제: 필요한 필드도 제대로 안 내려가고 있었다

요약 API를 쓰는 클라이언트가 실제로 필요로 하던 값 중 일부는 비어 있거나 기본값으로 내려가고 있었습니다.

- `orderSummary.buyerId`가 빈 문자열
- `orderSummary.status`가 기본값
- `item.status`가 기본값

이 상태에서는 클라이언트가 목록 화면에서 거래 상태를 정확히 분기할 수 없었습니다.

### 해결: View와 Assembler에 누락 필드 추가

`OrderSummary`, `ItemSummary`에 `status`를 포함시키고, 요약 변환 로직에서도 실제 값을 채우도록 수정했습니다.

```kotlin
data class OrderSummary(
    val buyerId: String?,
    val status: OrderStatus?,
)

data class ItemSummary(
    val status: ItemStatus?,
    val image: ItemImageSummary?,
)
```

이렇게 정리하니 요약 API는 "필드는 적지만, 필요한 값은 정확히 있는" 상태가 됐습니다. 경량화는 단순히 필드를 삭제하는 것이 아니라, **필요한 정보만 정확하게 남기는 작업**이어야 합니다.

---

## Phase 3. 필요 없는 외부 조회를 끊었다

### 문제: 응답에서 안 쓰는데 조회는 계속 하고 있었다

요약 API는 목록 전용인데도 아래 데이터를 계속 조회하고 있었습니다.

- 상품 부가 정보
- 추가 검증 정보

이 값들은 상세 화면이나 추가 안내 정보를 만들 때는 필요할 수 있지만, 채팅 목록 카드에서는 사용하지 않았습니다.

```text
Before
목록 조회
  -> Item 조회
  -> 상품 이미지 조회
  -> 상품 부가 정보 조회
  -> 추가 검증 정보 조회
  -> 주문 요약 정보 조회
  -> 제한 정보 조회
  -> DTO 조립
```

### 해결: 요약 여부에 따라 조회 자체를 스킵

목록 컨텍스트를 만드는 팩토리와 상세 데이터 리졸버에서, 요약 흐름일 때는 불필요한 조회를 아예 하지 않도록 분기했습니다.

```kotlin
if (!isSummaryRequest) {
    val extraMetadata = extraMetadataStore.listByIds(metadataIds)
    val verifications = verificationStore.listByOwnerIds(ownerIds)
}
```

이 변경의 핵심은 "응답에서 빼는 것"이 아니라 **조회 단계에서부터 비용을 만들지 않는 것**입니다.

---

## Phase 4. N+1 쿼리를 IN 쿼리로 바꿨다

### 문제: 채팅방 25개면 같은 쿼리가 25번 반복됐다

가장 큰 병목은 N+1 패턴이었습니다. 채팅방 목록 한 페이지가 25개일 때, 채팅방마다 아래 조회가 반복되고 있었습니다.

```kotlin
// Before
rooms.map { room ->
    val order = orderStore.findById(room.orderId)
    val images = imageStore.findAllByTargetIdAndType(room.itemId, ITEM)
    val restriction = restrictionStore.findTopByTargetTypeAndTargetId(ORDER, room.orderId)
}
```

이 구조는 데이터 건수가 늘어날수록 선형적으로 느려집니다. 특히 목록 API처럼 여러 개를 한 번에 조회하는 화면에서는 바로 한계가 드러납니다.

### 해결: 배치 조회 포트 추가 후 한 번에 조회

배치 조회 메서드를 추가하고, 메모리에서 `associateBy` 형태로 재조립하도록 변경했습니다.

```kotlin
// After
val ordersById = orderStore.listByIds(orderIds)
    .associateBy { it.id }

val imagesByItemId = imageStore
    .listByTargetIdsAndTargetType(itemIds, ITEM)
    .groupBy { it.targetId }

val restrictedOrderIds = restrictionStore
    .findOrderIdsWithRestriction(orderIds)
    .toSet()
```

변경 대상은 다음과 같았습니다.

| 조회 대상 | 변경 전 | 변경 후 |
|-----------|---------|---------|
| 주문 요약 정보 | `findById()` x N | `findAllById(ids)` 1회 |
| 상품 이미지 | `findAllByTargetIdAndType()` x N | `findAllByTargetIdInAndType(ids)` 1회 |
| 제한 정보 | `findTopBy...()` x N | `findAllByTargetTypeAndTargetIdIn(ids)` 1회 |

이 개선은 요약 API만의 이득이 아니었습니다. 기존 채팅방 목록 API에도 같은 배치 조회를 적용할 수 있어서, 공통 병목을 한 번에 제거할 수 있었습니다.

---

## 개선 결과

1페이지 25개 채팅방 조회 기준으로 비교하면 차이가 분명했습니다.

| 조회 대상 | 개선 전 | 개선 후 |
|-----------|---------|---------|
| 사용자 기본 정보 | 1 | 1 |
| 주문 요약 정보 | 25 | 1 |
| 상품 기본 정보 | 1 | 1 |
| 상품 이미지 | 25 | 1 |
| 상품 부가 정보 | 25 | 0 |
| 추가 검증 정보 | 25 | 0 |
| 제한 정보 | 25 | 1 |
| 사용자 상태 확인 | 25 | 25 |
| 프로필 이미지 조회 | 26 | 26 |
| 합계 | 약 152회 | 약 30회 |

결과적으로 **약 122회의 쿼리를 줄였고, 전체 조회 비용은 약 80% 감소**했습니다.

응답 측면에서도 변화가 있었습니다.

- `ChatRoomListItem`은 12개 필드 대신 6개만 세팅
- `LastMessagePreview`는 9개 대신 3개만 세팅
- `ItemSummary`는 상태와 이미지 중심으로 축소
- `OrderSummary`는 `buyerId`, `status`만 유지

즉, 이번 개선은 단순한 "쿼리 튜닝"이 아니라 **조회 범위, 응답 모델, 레이어 책임을 함께 줄이는 작업**이었습니다.

---

## 교훈

1. **목록 화면은 상세 화면과 다르게 설계해야 합니다.** — 같은 채팅방 데이터라도 목록과 상세의 요구사항은 다르므로, 조회 파이프라인까지 분리하지 않으면 단순한 화면이 더 복잡한 화면의 비용을 함께 떠안게 됩니다.

2. **응답 필드 최적화만으로는 충분하지 않습니다.** — DTO에서 필드를 몇 개 빼는 것보다 중요한 건, 그 필드를 만들기 위해 실행되던 조회까지 같이 제거하는 것입니다.

3. **N+1은 화면 단위로 봐야 합니다.** — 개별 채팅방 하나만 보면 문제 없어 보여도, 목록 화면은 항상 여러 개를 한 번에 그리므로 쿼리 수 역시 한 페이지 단위로 봐야 합니다.

이번 개선의 출발점은 "요약 API를 따로 만들었는데 왜 여전히 느리지?"라는 질문이었습니다. 원인은 단순했습니다. 이름만 요약이었고, 실제 구현은 여전히 상세 조회에 가까웠기 때문입니다. 비슷한 구조의 API를 운영하고 있다면, "응답이 가벼운가?"보다 먼저 "조회도 정말 가벼운가?"를 점검해 볼 가치가 큽니다.

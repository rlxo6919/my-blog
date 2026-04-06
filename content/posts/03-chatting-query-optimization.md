---
title: "채팅 모듈 조회 성능 개선기 — 배치 페칭과 구조 정리"
date: "2026-04-06"
category: "troubleshooting"
tags: ["Kotlin", "JPA", "QueryDSL", "Spring Boot"]
excerpt: "innerJoin 누락, 불필요한 Redis 캐싱, 중복 모델 4개 — 쿼리 최적화와 레이어 정리로 해결한 과정을 공유합니다."
---

## 이런 증상을 겪고 계신가요?

채팅 모듈의 API 응답이 점점 느려지고 있었습니다. 원인을 추적해보니 여러 문제가 겹쳐 있었습니다.

- 채팅방 목록 조회 시 **`innerJoin`으로 참여자 없는 방이 누락**
- 사용하지 않는 **Redis 캐시가 매 요청마다 I/O를 발생**
- 같은 **매핑 로직이 여러 Mapper에 중복** 존재
- 거의 동일한 **결과 모델이 4개나 중복** 존재

이 글에서는 이 문제들을 쿼리 최적화, 캐시 제거, 모델 통합, 레이어 정리로 해결한 과정을 정리합니다.

---

## Phase 1. 채팅방 조회 최적화 — Join 타입 수정과 배치 페칭

### 문제: innerJoin이 데이터를 누락시키고, 반환 흐름이 불명확하다

채팅방 목록을 조회할 때 두 가지 성능 이슈가 있었습니다.

1. **Join 타입 문제**: `innerJoin`으로 인해 참여자가 없는 채팅방이 결과에서 누락
2. **코드 가독성**: 배치 페칭 결과를 별도 변수 없이 버리고 있어 의도가 불명확하고, 반환 흐름이 분산됨

```kotlin
// Before: innerJoin으로 참여자 없는 방 누락 + 반환 흐름이 분산됨
val rooms = queryFactory
    .selectFrom(room)
    .where(/* 조건 */)
    .fetch()

// 참여자를 배치 페칭으로 로드 (영속성 컨텍스트에 반영되지만, innerJoin이라 참여자 없는 방 누락)
if (rooms.isNotEmpty()) {
    queryFactory
        .selectFrom(room)
        .innerJoin(room.members, member)  // 참여자 없는 방 누락
        .fetchJoin()
        .where(room.`in`(rooms))
        .fetch()
}
```

### 해결: leftJoin + 영속성 컨텍스트 활용

`innerJoin`을 `leftJoin`으로 변경하고, `.also` 블록을 사용해 영속성 컨텍스트의 1차 캐시를 활용하도록 개선했습니다.

```kotlin
// After: leftJoin + .also로 영속성 컨텍스트 활용
return queryFactory
    .selectFrom(room)
    .where(/* 조건 */)
    .fetch()
    .also { rooms ->
        if (rooms.isNotEmpty()) {
            // 동일 영속성 컨텍스트에서 fetchJoin으로 참여자 로드
            queryFactory
                .selectFrom(room)
                .leftJoin(room.members, member)  // 참여자 없는 방도 포함
                .fetchJoin()
                .where(room.`in`(rooms))
                .fetch()
        }
    }
```

**핵심 변경 포인트:**

| 변경 | 이유 |
|------|------|
| `innerJoin` → `leftJoin` | 참여자가 없는 채팅방도 결과에 포함 |
| `.also {}` 블록으로 반환 흐름 정리 | 배치 페칭 의도를 명확히 하고, 첫 번째 쿼리 결과를 그대로 반환 |

> **참고:** JPA의 영속성 컨텍스트를 활용한 배치 페칭 패턴입니다. 첫 번째 쿼리로 엔티티가 1차 캐시에 올라가고, `.also` 블록의 `fetchJoin` 쿼리가 같은 엔티티의 연관 관계를 채워줍니다. `.also`는 원본 리스트를 그대로 반환하므로, 이후 코드에서 추가 쿼리 없이 참여자 정보에 접근할 수 있습니다.

---

## Phase 2. 불필요한 Redis 캐싱 제거

### 문제: 아무도 안 쓰는 캐시가 매번 I/O를 만든다

채팅 메시지 발송 시 중간 결과를 Redis에 캐싱하고 있었습니다. 하지만 이 캐시는 실질적으로 활용되지 않았고, 오히려 매 요청마다 불필요한 I/O만 발생시키고 있었습니다.

```
// Before: 메시지 발송 흐름
메시지 발송 → Redis에 중간 결과 저장 (WRITE) → 응답 생성 시 Redis 조회 (READ) → 응답

// After: Redis 캐싱 제거
메시지 발송 → 응답 생성 → 응답
```

### 해결

불필요한 Redis 엔티티와 리포지토리를 삭제하여 매 요청당 Redis WRITE + READ 2회의 I/O를 제거했습니다.

---

## Phase 3. 중복 매핑 로직 통합

### 문제: 같은 변환 코드가 여러 Mapper에 흩어져 있다

참여자 DTO 매핑 로직이 여러 Mapper에 중복 구현되어 있었습니다.

```kotlin
// Before: 각 Mapper에서 중복 구현
// GetRoomMapper.kt
private fun toMemberDto(member: Member) =
    RoomDto.Member.newBuilder()
        .setUserId(member.userId)
        .setRole(RoomDto.Role.valueOf(member.role.name))
        .build()

// ListRoomsMapper.kt (동일한 코드 중복)
private fun toMemberDto(member: Member) = ...
```

### 해결: Assembler로 중앙화

```kotlin
@Component
class MemberDtoAssembler {
    fun toDto(member: Member): RoomDto.Member =
        RoomDto.Member.newBuilder()
            .setUserId(member.userId)
            .setRole(member.role.toDto())
            .build()
}
```

---

## Phase 4. View 모델 통합 — 4개를 1개로

### 문제: 거의 같은 모델이 왜 4개나 있지?

채팅방 관련 결과 모델이 여러 개 존재하면서 중복 데이터와 변환 오버헤드가 발생했습니다.

```
CreateRoomResult  ─┐
GetRoomResult     ─┼─ 거의 동일한 데이터 구조
ListRoomsResult   ─┘
RoomWithMetadata  ── 또 다른 중복 모델
```

### 해결: 단일 통합 뷰 모델

```kotlin
data class RoomDetailView(
    val room: RoomCoreView,                // 채팅방 기본 정보
    val userState: RoomUserStateView,      // 사용자별 상태 (읽음 위치 등)
    val members: List<Member>,             // 참여자 목록
    val order: OrderView?,                 // 주문 정보
    val product: ProductView?,             // 상품 정보
)
```

**4개의 결과 모델 → 1개의 통합 뷰 모델**로 정리하면서 약 140줄을 삭제했습니다.

### Context Factory로 배치 로드

```kotlin
class RoomDetailListContextFactory {
    fun create(rooms: List<Room>): RoomDetailListContext {
        val memberUserIds = rooms.flatMap { it.memberIds }.toSet()
        val productIds = rooms.mapNotNull { it.productId }.toSet()

        // 관련 데이터를 한 번에 배치 조회
        val users = userRepository.listByIds(memberUserIds)
            .associateBy { it.id!! }
        val products = productRepository.listByIds(productIds)
            .associateBy { it.id!! }
        val imageUrls = loadImageUrls(productIds)

        return RoomDetailListContext(users, products, imageUrls)
    }
}
```

---

## Phase 5. 레이어 책임 정리 — Protobuf 매핑은 어디에?

### 문제: Service가 직렬화까지 알아야 해?

Service 계층에 Protobuf 매핑 로직이 섞여 있어서, 비즈니스 로직과 직렬화 관심사가 분리되지 않았습니다.

### 해결: Web Mapper로 이동 + UseCase 패턴 도입

```
// Before
Controller → WebMapper → Service(Protobuf 매핑 + 비즈니스 로직) → Port

// After
Controller → WebMapper(Protobuf ↔ View 변환) → Service(비즈니스 로직만) → Port
```

Port 기반으로 혼재되어 있던 아키텍처도 UseCase/Service 패턴으로 정리했습니다.

```kotlin
// Before: Port 인터페이스
interface GetTotalUnreadCountPort {
    fun getTotalUnreadCount(userId: String): Int
}

// After: UseCase 인터페이스
interface GetTotalUnreadCountUseCase {
    fun execute(userId: String): Int
}

@Service
class GetTotalUnreadCountService(
    private val roomRepository: RoomRepository,
) : GetTotalUnreadCountUseCase {
    override fun execute(userId: String): Int =
        roomRepository.countUnreadByUserId(userId)
}
```

---

## 개선 결과

| 영역 | 개선 전 | 개선 후 |
|------|--------|--------|
| 채팅방 목록 쿼리 | `innerJoin` (참여자 없는 방 누락) | `leftJoin` + 영속성 컨텍스트 배치 페칭 |
| Redis 캐싱 | 불필요한 중간 결과 캐싱 | 제거 (I/O 감소) |
| 결과 모델 | 4개 중복 모델 | 1개 통합 뷰 모델 |
| Protobuf 매핑 | Service에 산재 | WebMapper로 집중 |
| 관련 데이터 로드 | 개별 조회 | Context Factory 배치 로드 |

---

## 교훈

1. **JPA 영속성 컨텍스트를 활용한 배치 페칭은 `fetchJoin`과 `.also` 블록으로 깔끔하게 구현할 수 있습니다.** — 같은 트랜잭션 내에서 1차 캐시에 올라간 엔티티의 연관 관계를 채워주는 방식입니다.
2. **사용되지 않는 캐시는 성능을 오히려 악화시킵니다.** — 캐시 적중률을 모니터링하고, 활용되지 않는 캐시는 과감히 제거해야 합니다.
3. **중복 모델은 변환 오버헤드와 버그의 원인입니다.** — 하나의 통합 뷰 모델로 정리하면 코드량 감소와 일관성을 동시에 얻을 수 있습니다.
4. **직렬화 매핑은 API 경계에서만 처리해야 합니다.** — Service가 Protobuf 같은 직렬화 프로토콜을 알 필요가 없습니다.

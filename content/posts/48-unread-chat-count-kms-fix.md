---
title: "미독 채팅 개수 API 성능 개선기 — `SELECT *` + 앱 레벨 카운트가 KMS를 두드린 이야기"
date: "2026-04-23"
category: "troubleshooting"
tags: ["쿼리 최적화", "커넥션 풀"]
excerpt: "미독 채팅 개수를 구하는 단순한 API가 커넥션 풀을 고갈시키던 원인을 추적해, `SELECT *` + 앱 레벨 `count`와 `@Convert(KmsStringConverter)` 조합이 만든 KMS Decrypt 호출 폭주를 드러내고, 단일 `COUNT(*)` 집계 쿼리로 전환해 해결한 과정을 정리합니다."
---

## 이런 증상을 겪고 계신가요?

"미독 채팅 개수"처럼 단순해 보이는 API 하나가 시스템 전체를 흔들던 증상입니다.

- 채팅 전용 **Hikari 커넥션 풀이 `active=15/15, waiting=111`** 로 장시간 고정됩니다
- **같은 DB를 쓰는 다른 채팅 API까지 응답이 밀리고** 타임아웃이 연쇄적으로 발생합니다
- AWS **KMS Decrypt 호출량**이 특정 시간대에 급격히 튑니다
- 정작 API가 반환하는 건 **정수 하나(`unreadCount`)** 입니다

이 글은 "개수 하나만 달라"는 API가 어떻게 수천 번의 KMS 호출과 커넥션 풀 고갈을 만들어 냈는지 추적하고, **DB 쿼리 3회 → 1회, KMS 호출 N회 → 0회** 로 줄인 과정을 기록합니다.

> **기준:** 이 글은 **Kotlin + Spring Boot + QueryDSL + JPA(Hibernate 6) + MySQL 8.4 InnoDB** 환경을 가정합니다. 암호화 컨버터는 JPA의 [`AttributeConverter`](https://jakarta.ee/specifications/persistence/3.1/apidocs/jakarta.persistence/jakarta/persistence/attributeconverter) 규격을 사용합니다. N+1·배치 조회·엔티티 hydration의 기본 개념은 [N+1 글](/posts/15-n-plus-1-query-problem)과 [영속성 컨텍스트 글](/posts/38-jpa-persistence-context)에서 다뤘습니다.

## Phase 1. 병목은 한 곳이지만, 징후는 세 곳에서 나타납니다

문제 API는 "특정 유저의 전체 미독 채팅 개수"를 돌려주는 단일 엔드포인트였습니다. 응답 본문은 이런 형태입니다.

```json
{ "unreadCount": 42 }
```

숫자 하나만 돌려주면 되는 API인데, 관측 지표에서는 아래 세 가지가 동시에 올라갑니다.

| # | 관측 지표 | 징후 |
|---|----------|------|
| 1 | DB 커넥션 풀 | `chatReplicaPool` Hikari `active=15/15, waiting=111` |
| 2 | AWS KMS | Decrypt API 호출량이 요청 수와 비례해서 스파이크 |
| 3 | 같은 풀을 쓰는 다른 API | 응답 지연·타임아웃 연쇄 |

세 징후는 **원인이 같은 한 구조적 문제의 서로 다른 투영**입니다. 원인은 다음 Phase에서 한 번에 드러납니다.

## Phase 2. 첫 번째 병목 — 개수를 구하려 전체 미독 메시지를 엔티티로 읽는다

### 문제: `SELECT *` + 앱 레벨 `count`

기존 흐름은 세 단계였습니다.

```text
GetTotalUnreadChatCountService.count()
  ├─ [쿼리 1] User 엔티티 조회
  ├─ [쿼리 2] 해당 유저의 ChatRoomToUser 목록 조회
  ├─ [쿼리 3] 위 채팅방들의 미독 Chat 엔티티 전부 조회
  │           └─ SELECT * FROM chat
  │              WHERE chat_room_id IN (...)
  │                AND idx >= last_unread_chat_idx
  │                AND ...
  └─ 앱 레벨에서 chats.count { ... } 로 집계
```

핵심 문제는 세 번째 쿼리입니다. 단지 **개수를 알고 싶을 뿐인데 모든 Row를 JVM 힙에 materialize** 하고 있었습니다.

```kotlin
// Before — 미독 메시지 전체를 엔티티로 읽음
val chats: List<Chat> = jpaQueryFactory
  .selectFrom(chat)
  .where(
    chat.chatRoom.id.`in`(chatRoomIds)
      .and(chat.idx.goe(minLastUnreadChatIdx))
      .and(chat.chatType.`in`(TEXT_AND_IMAGE_CHAT_TYPES))
      .and(chat.isHidden.eq(false))
  )
  .fetch()

// 이후 앱 레벨에서 개수 집계
val unreadCountMap = chatRoomToUsers.associate { ctu ->
  ctu.chatRoom.id to chats.count { c ->
    c.chatRoom.id == ctu.chatRoom.id && c.idx >= ctu.lastUnreadChatIdx
  }
}
return unreadCountMap.values.sum()
```

반환값은 `Int` 하나인데, 이 구조는 조건에 맞는 **모든 `Chat` 엔티티를 네트워크 너머로 가져와서 힙에 적재** 합니다. 그리고 적재된 리스트를 순회해 개수를 셉니다.

DB가 잘하는 일(집계)을 앱이 대신하고 있었고, 그 대가는 Phase 3에서 드러납니다.

### 해결 방향: DB에게 집계를 맡긴다

결론부터 말하면 답은 단순합니다. **앱으로 행을 가져와 세는 대신 DB에게 `COUNT(*)` 하나만 받는다.** 단순한 원칙인데, 이 리포지토리에서는 여기에 숨어 있던 부작용 하나가 개선 효과를 극단적으로 키웁니다. 다음 Phase에서 이어집니다.

## Phase 3. 두 번째 병목 — 엔티티 로드 한 번이 KMS 호출 한 번

### 문제: `@Convert(KmsStringConverter)` 가 모든 Row에 붙어 있다

이 프로젝트의 `Chat` 엔티티는 본문 컬럼을 앱 레이어에서 투명하게 암·복호화하도록 설계되어 있었습니다.

```kotlin
@Entity
@Table(name = "chat")
class Chat(
  @Id val idx: Long,
  // ...
  @Convert(converter = KmsStringConverter::class)
  @Column(name = "content")
  var content: String,
  // ...
)
```

`AttributeConverter` 는 JPA 스펙상 **엔티티가 materialize 될 때 Row마다 `convertToEntityAttribute` 가 호출** 됩니다. 즉 미독 `Chat` 5,000개를 로드한다면, **5,000번의 KMS Decrypt API 호출** 이 `findBy...` 호출 한 번 안에서 일어납니다.

```text
SELECT * 결과 N rows
  └── N번 엔티티 hydration
      └── 각 Row마다 KmsStringConverter.convertToEntityAttribute(content) 호출
          └── AWS KMS Decrypt API 호출 1회
```

이 한 가지 사실이 Phase 1의 세 징후를 전부 설명합니다.

- **커넥션 풀 고갈** — 한 요청이 수백~수천 번의 외부 API 대기 동안 커넥션을 붙잡고 있으니, 트래픽이 조금만 올라도 `active=15/15` 에 `waiting` 이 쌓임
- **KMS 호출 스파이크** — 요청 수 × 미독 메시지 수만큼 호출이 증폭됨
- **다른 API 연쇄 지연** — `chatReplicaPool` 풀을 공유하는 모든 API가 커넥션을 기다림

### 해결 방향: 엔티티를 로드하지 않는다

커넥션 점유 시간을 `ms` 단위로 되돌릴 수 있는 가장 확실한 방법은 **엔티티를 materialize 하지 않는 것** 입니다. `COUNT(*)` 는 스칼라 값 하나만 반환하므로 `content` 컬럼이 읽히지도 않고, 따라서 `AttributeConverter` 가 호출되지도 않습니다.

Phase 5에서 쿼리를 실제로 고쳐 봅니다.

## Phase 4. 세 번째 병목 — 무제한 쿼리와 다중 왕복

### 문제: 상한 없는 `fetch()` 와 3회 DB 왕복

위 구조에는 부차적인 문제가 두 개 더 있었습니다.

첫째, `selectFrom(chat).fetch()` 에 **`LIMIT` 이 없습니다**. 미독 메시지가 얼마나 많든 조건에 맞는 건 전부 읽습니다. 프로젝트 전반에서 쓰는 **"무제한 쿼리 금지"** 컨벤션에도 맞지 않습니다.

둘째, **같은 DB 안의 세 테이블을 앱에서 세 번에 나눠 조회** 합니다.

```text
Step 1. user  조회 (앱 ↔ DB 왕복 1회)
Step 2. chat_room_to_user 조회 (왕복 2회)
Step 3. chat 조회 (왕복 3회)
```

세 쿼리 중 두 개는 **집계 쿼리의 필터 조건을 만들기 위한 준비 작업** 이고, 마지막 하나가 본질적 조회입니다. 구조를 바꾸면 앞의 두 개는 필요하지 않습니다.

### 해결 방향: 집계 쿼리 하나로 합친다

`chat_room_to_user` 에 필터링 조건(`userId`, `status`, `lastUnreadChatIdx`)이 이미 들어 있습니다. `chat` 과 join 해서 **조건을 만족하는 Row의 개수** 를 `COUNT(*)` 로 바로 집계하면, 중간 단계의 왕복이 전부 사라집니다.

## Phase 5. 해결 — 단일 `COUNT(*)` 집계 쿼리로 전환

### After 쿼리

```kotlin
// LoadChatPort.kt — 포트 인터페이스에 집계 메서드 추가
fun countTotalUnreadChats(userId: String): Int

// ChatPersistenceAdapter.kt — QueryDSL로 theta join + COUNT
override fun countTotalUnreadChats(userId: String): Int {
  return jpaQueryFactory
    .select(chat.count())
    .from(chatRoomToUser, chat)
    .where(
      chat.chatRoom.eq(chatRoomToUser.chatRoom)
        .and(chatRoomToUser.userId.eq(userId))
        .and(chatRoomToUser.status.`in`(ChatRoomStatus.LEFT, ChatRoomStatus.JOINED))
        .and(chatRoomToUser.lastUnreadChatIdx.gt(0))
        .and(chat.idx.goe(chatRoomToUser.lastUnreadChatIdx))
        .and(chat.chatType.`in`(TEXT_AND_IMAGE_CHAT_TYPES))
        .and(chat.isHidden.eq(false))
    )
    .fetchOne()
    ?.toInt() ?: 0
}
```

`from(chatRoomToUser, chat)` 는 두 테이블의 **theta join** 입니다. `where` 절의 `chat.chatRoom.eq(chatRoomToUser.chatRoom)` 이 join 조건 역할을 하고, 그 뒤의 조건들은 유저·상태·미독 마커·메시지 유형 필터입니다.

서비스 레이어도 단순해집니다.

```kotlin
// GetTotalUnreadChatCountService.kt
class GetTotalUnreadChatCountService(
  private val loadChatPort: LoadChatPort,  // 유일한 의존성
) {
  fun count(userId: String): Int =
    loadChatPort.countTotalUnreadChats(userId)
}
```

`LoadUserPort`, `LoadChatRoomToUserPort` 의존성이 통째로 사라집니다.

### 왜 이 방식이 유효한가요?

- **엔티티가 만들어지지 않습니다.** `select(chat.count())` 의 결과는 스칼라 정수 하나입니다. `Chat` 엔티티가 생성되지 않으므로 `@Convert(KmsStringConverter)` 가 호출되지 않습니다. **KMS Decrypt 호출이 0회** 로 수렴합니다
- **DB에서 앱으로 오는 Row가 1개** 입니다. 네트워크 전송량이 상수로 줄어들고, 커넥션 점유 시간이 `ms` 단위로 되돌아옵니다
- **왕복이 1회로 수렴** 합니다. 선행 조회였던 `user`, `chat_room_to_user` 리스트 fetch가 필요 없어집니다
- **기존 인덱스를 그대로 사용합니다.** `chat_room_to_user(user_id, status, ...)` 와 `chat(chat_room_id, idx)` 인덱스 설계를 바꾸지 않습니다

"DB가 잘하는 일은 DB에게" 라는 원칙을 그대로 적용한 결과입니다.

> **참고:** QueryDSL의 `chat.count()` 는 SQL `COUNT(chat.idx)` 로 렌더링되며, 실질적으로 `COUNT(*)` 와 동일하게 동작합니다. `chat.chatRoom.eq(chatRoomToUser.chatRoom)` 는 연관관계를 통한 theta join이므로, MySQL 옵티마이저가 inner join으로 재작성해 처리합니다. 쿼리 플랜이 의도대로 나오는지는 배포 전 `EXPLAIN` 으로 확인해 두는 것이 안전합니다.

## Phase 6. 서비스 레이어 단순화 — 의존성 3개 → 1개

쿼리 하나만 남기면 서비스가 얻는 변화는 쿼리 개수보다 큽니다.

```text
Before
  GetTotalUnreadChatCountService
    ├── LoadUserPort         ← 제거
    ├── LoadChatRoomToUserPort      ← 제거
    └── LoadChatPort                ← 메서드 하나로 집약

After
  GetTotalUnreadChatCountService
    └── LoadChatPort.countTotalUnreadChats(userId)
```

부수 효과도 있습니다.

- **테스트 비용이 줄어듭니다.** Mock 대상이 3개 → 1개. 단위 테스트 시나리오가 "정상 카운트 반환" / "0 반환" 두 가지로 단순화
- **장애 격리 범위가 좁아집니다.** `user` 테이블이나 `chat_room_to_user` 조회에 문제가 생겨도, 이 API는 해당 경로를 타지 않음
- **변경 시 영향 범위가 명확** 해집니다. 개수 집계 로직이 어디에 있는지 질문이 생기지 않음

구조적으로 단순해진다는 건 곧 **이 API가 주변 구성요소에 덜 엮이게 된다** 는 뜻입니다.

## Phase 7. 결과

| 항목 | Before | After |
|------|--------|-------|
| DB 쿼리 수 | 3 (`user` + `chat_room_to_user` + `chat`) | 1 (`COUNT(*)` 집계) |
| DB → 앱 Row 수 | 미독 메시지 전체(N rows) | 1 row |
| JVM 힙에 올라오는 `Chat` 엔티티 | N개 | 0개 |
| `AttributeConverter` (KMS Decrypt) 호출 | N회 | 0회 |
| 커넥션 점유 시간 | 수 초 ~ 수십 초 | ms 단위 |
| 서비스 의존성(Port) | 3개 | 1개 |
| `LIMIT` 없는 무제한 쿼리 | 있음 | 없음 |

정량 지표가 모두 상수로 바뀝니다. 특히 주목할 값은 **KMS 호출 N → 0** 입니다. N이 몇이든 이 API 경로에서는 KMS에 의존하지 않게 되었으므로, KMS 쓰로틀링이나 장애가 이 API를 끌고 내려갈 수 없습니다.

Phase 1의 세 징후에 대해서도 각각 기대 효과가 명확합니다.

- 커넥션 풀 `active=15/15, waiting=111` → 점유 시간이 `ms` 단위로 줄어 대기열 해소
- KMS Decrypt 스파이크 → 이 API에서 발생하던 호출 자체가 사라짐
- 같은 풀을 쓰는 다른 채팅 API → 확보된 커넥션만큼 응답 시간 회복

## 배포 전 점검

같은 유형의 "DB 레벨 집계로 전환" 개선에서 권장하는 검증 순서입니다.

1. **`EXPLAIN` 으로 실행 계획 확인** — `chat_room_to_user` 와 `chat` 의 join 순서, 인덱스 적중(`ref`/`range`), `Using where` · `Using index` 의 의미가 의도와 맞는지
2. **결과 동일성 회귀 테스트** — 동일 유저 id에 대해 `SUM(기존 방식의 맵 값)` 과 `countTotalUnreadChats(userId)` 가 같은지 dual-run으로 확인
3. **응답 시간·커넥션 점유 측정** — P50/P95, Hikari `activeConnections`, `awaitingConnection` 지표를 before/after로 비교
4. **KMS 호출량 모니터링** — CloudWatch 등에서 `KMS Decrypt` 호출량이 이 API 경로에서 0으로 수렴하는지 확인

특히 2번은 실질적으로 이 개선의 correctness 를 보증하는 핵심 절차입니다. 기존 로직의 필터(`status IN (LEFT, JOINED)`, `lastUnreadChatIdx > 0`, `chatType IN (...)`, `isHidden = false`)를 새 쿼리에서 빠짐없이 반영했는지 입력별 카운트로 대조합니다.

## 교훈

이번 사례에서 일반화할 수 있는 점 다섯 가지.

1. **"개수만 필요" 한 API에 `selectFrom(...).fetch()` 가 보이면 의심합니다** — 반환 타입이 `Int` 인데 내부에서 엔티티 리스트를 만들고 있다면, DB 레벨 집계로 바꿀 여지가 큽니다. 앱 레벨 `count` 는 O(N) 메모리·O(N) 네트워크 비용을 숨기고 있습니다
2. **엔티티 로드는 "읽기"가 아니라 "여러 부수 효과의 묶음"** 입니다 — 1차 캐시 등록, 스냅샷 생성, 그리고 이 글의 핵심인 `AttributeConverter` 호출까지. 필요한 컬럼이 없거나 변경할 계획이 없다면, projection이나 집계로 돌아가는 쪽이 대개 더 정직한 선택입니다
3. **외부 API를 호출하는 컨버터는 "Row 수에 비례하는 호출"을 의미합니다** — `@Convert(KmsStringConverter)`, HTTP 기반 lookup 컨버터 같은 구조는 조용히 N배 비용을 만듭니다. 대량 조회 경로에서는 특히 조심해야 합니다
4. **커넥션 풀 고갈은 거의 항상 "점유 시간" 문제** 입니다 — 풀 크기 늘리기보다, 한 요청이 커넥션을 얼마나 오래 붙잡는지를 먼저 봅니다. 풀 확장은 병목을 뒤로 미룰 뿐이지만, 점유 시간 단축은 구조적 해결에 가깝습니다
5. **"DB가 잘하는 일은 DB에게 맡긴다"** — 집계, 필터, 정렬은 인덱스와 옵티마이저가 함께 풀도록 설계된 문제 영역입니다. 애플리케이션 메모리에서 똑같은 일을 다시 하고 있는 코드를 발견했다면, 그 자체가 개선 신호입니다

마지막 교훈을 한 문장으로 줄이면 이렇게 됩니다.

> **숫자 하나를 돌려주는 API가 수천 번의 외부 호출을 만들고 있다면, 문제는 트래픽이 아니라 "정답을 구하는 방법" 쪽에 있습니다.**

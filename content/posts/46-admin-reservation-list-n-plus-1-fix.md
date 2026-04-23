---
title: "관리자 예약 목록 API `Broken pipe` 해결기 — 루프 안 N+1과 공유 DTO 반복 생성"
date: "2026-04-30"
category: "troubleshooting"
tags: ["N+1", "쿼리 최적화"]
excerpt: "관리자용 예약 목록 API가 Broken pipe를 뱉던 원인을 추적해 루프 안 N+1 · 공유 Spot DTO 반복 생성 · 무제한 조회 세 가지를 구조로 풀고, DB 쿼리를 2,500회에서 5회로 줄인 과정을 정리합니다."
---

## 이런 에러를 만나셨나요?

관리자 페이지에서 예약 목록을 조회할 때 응답이 간헐적으로 실패하는 증상입니다.

- 서버 로그에 **`AsyncRequestNotUsableException: ... Broken pipe`** 가 반복적으로 찍힙니다
- 프론트엔드는 **응답을 받지 못하고 타임아웃**으로 끝납니다
- **조회 기간이 넓을수록** 실패율이 높아집니다
- DB 지표를 보면 동일한 패턴의 쿼리가 **한 번의 요청에 수천 번** 나갑니다

이 글에서는 이 증상이 "네트워크 끊김"이 아니라 **응답이 너무 늦게 나가서 생긴 누적 결과**라는 점을 풀어냅니다. 루프 안 단건 조회, 공유 DTO의 반복 생성, 상한 없는 쿼리 — 겹쳐 있던 세 병목을 하나씩 제거해 쿼리 수를 **2,500회 → 5회** 로 줄인 과정을 기록합니다.

## Phase 1. `Broken pipe`는 원인이 아니라 증상입니다

### 문제: 에러 이름에 속지 않기

서버에 이런 예외가 남아 있었습니다.

```text
AsyncRequestNotUsableException: ServletOutputStream failed to write:
  java.io.IOException: Broken pipe
```

`Broken pipe`는 **서버가 응답을 쓰려는 시점에 클라이언트 쪽 소켓이 이미 닫혀 있을 때** 발생합니다. 네트워크 품질 문제처럼 보이지만, 이 시스템에서는 원인이 명확했습니다. 클라이언트는 **HTTP 타임아웃(30초)** 으로 연결을 닫고, 서버는 그 뒤에 응답을 쓰려다 실패한 것입니다.

즉, 핵심 질문은 이렇게 바뀝니다.

> 이 API는 왜 30초 안에 응답을 내보내지 못했는가?

### 해결 방향: 응답이 느려진 진짜 이유를 찾기

느린 API는 원인이 거의 세 축 중 하나입니다.

1. **데이터 조회가 느림** — 쿼리 수, 쿼리 자체 성능
2. **응답 조립이 느림** — 루프마다 외부 호출·반복 계산
3. **응답 크기가 큼** — 직렬화·전송에 오래 걸림

이 API에서는 세 축 모두 조금씩 얽혀 있었습니다. 하나씩 끊어서 확인합니다.

## Phase 2. 첫 번째 병목 — 루프 안에서 N+1이 4번 반복

### 문제: 리스트 변환이 건별로 개별 조회를 유발

컨트롤러에서 조회한 예약들을 DTO로 바꾸는 코드는 단순했습니다.

```kotlin
// Before
val reservations = reservationRepository.list(filter)
return reservations.map { reservationAssembler.toAdminDto(it) }
```

문제는 `toAdminDto(reservation)` 안에 있었습니다. 단건 변환 메서드가 내부에서 **예약 ID 하나마다 네 번의 개별 조회**를 수행하고 있었습니다.

```kotlin
// 기존 단건 변환 내부
fun toAdminDto(reservation: Reservation): AdminReservationDto {
  val sections = sectionPort.list(reservation.id, TargetType.RESERVATION)
  val mappings = targetMappingPort.list(reservation.id)
  val memo = memoPort.get(reservation.id, MemoType.RESERVATION_ITEM_NAME)
  val item = itemPort.get(reservation.itemId)
  // ... 조립
}
```

예약이 500건이면 `500 × 4 = 2,000회` 의 개별 조회가 추가로 나갑니다. 여기에 처음의 목록 쿼리까지 포함하면 한 번의 요청이 **DB를 2,500번 찌르고 있었습니다**.

### 해결: 리스트 전용 변환 메서드로 batch 조회

핵심 원칙은 하나입니다. **"리스트를 변환할 때는 단건 변환을 루프에서 부르지 않는다."** 대신 리스트 전용 메서드를 만들어 필요한 연관 데이터를 **한 번에 몰아서 조회**합니다.

`sectionPort.list(resourceIds, ...)` 와 `itemPort.list(idIn)` 은 이미 batch 조회를 지원하고 있었지만, `targetMappingPort` 와 `memoPort` 는 단건 조회만 있었습니다. Repository에 batch 메서드를 추가하고, Port 계층에 같은 이름의 메서드를 노출합니다.

```kotlin
// Repository
interface TargetMappingRepository {
  fun findAllByTargetIdInOrderByIdxDesc(targetIds: Collection<Long>): List<TargetMapping>
}

interface MemoRepository {
  fun findAllByTargetIdInAndStatusAndTypeOrderByCreatedAtDesc(
    targetIds: Collection<Long>,
    status: MemoStatus,
    type: MemoType,
  ): List<Memo>
}

// Port
interface TargetMappingPort {
  fun list(targetId: Long): List<TargetMapping>
  fun listByTargetIds(targetIds: Collection<Long>): List<TargetMapping>  // 추가
}

interface MemoPort {
  fun get(targetId: Long, type: MemoType): Memo?
  fun listByTargetIds(
    targetIds: Collection<Long>,
    type: MemoType,
  ): List<Memo>  // 추가
}
```

이제 이 batch 메서드들을 사용하는 **리스트 전용 변환 메서드** `toAdminDtos`를 추가합니다.

```kotlin
fun toAdminDtos(reservations: List<Reservation>): List<AdminReservationDto> {
  if (reservations.isEmpty()) return emptyList()

  val reservationIds = reservations.map { it.id }
  val itemIds = reservations.map { it.itemId }.distinct()

  // 한 번에 조회, Map으로 인덱싱
  val sectionsByResId = sectionPort
    .list(reservationIds, TargetType.RESERVATION)
    .groupBy { it.resourceId }

  val mappingsByResId = targetMappingPort
    .listByTargetIds(reservationIds)
    .groupBy { it.targetId }

  val memoByResId = memoPort
    .listByTargetIds(reservationIds, MemoType.RESERVATION_ITEM_NAME)
    .associateBy { it.targetId }

  val itemsById = itemPort.list(itemIds).associateBy { it.id }

  return reservations.map { reservation ->
    val sections = sectionsByResId[reservation.id].orEmpty()
    val mappings = mappingsByResId[reservation.id].orEmpty()
    val memo = memoByResId[reservation.id]
    val item = itemsById[reservation.itemId]

    assembleAdminDto(reservation, sections, mappings, memo, item)
  }
}
```

기존의 단건 `toAdminDto(reservation)` 는 그대로 둡니다. 상세 페이지처럼 예약 1건만 변환하는 경로에서는 여전히 유효하기 때문입니다. **"리스트 변환 전용 경로를 따로 만들고, 단건 경로는 건드리지 않는다"** — 이 원칙은 [이전 채팅 목록 개선기](/posts/14-chatting-list-ref-api-optimization)에서도 동일하게 적용됐던 패턴입니다.

### 왜 이 방식이 유효한가요?

쿼리 수가 선형에서 **상수로 바뀝니다**. N+1 문제의 본질이 "건수에 비례해 쿼리가 늘어난다"인데, batch 조회는 그 비례 관계를 끊습니다. 연관 데이터가 3종류면 쿼리가 `1 + 3 = 4번`, 4종류면 `1 + 4 = 5번` 으로 **연관 종류 수에만 비례**합니다.

N+1 발생 원리와 JPA 환경에서의 해결 도구 비교는 [N+1 해결 도구 글](/posts/40-jpa-n-plus-1-solution-tools)에서 따로 다뤘습니다. 이 글은 **JPA가 아닌 Port/Adapter 구조**에서도 같은 원리가 적용된다는 점을 보여주는 사례입니다.

## Phase 3. 두 번째 병목 — 모든 예약이 같은 Spot인데 DTO를 매번 다시 만듦

### 문제: 공유 엔티티의 변환이 건별로 반복됨

관리자 페이지에서는 **한 업장(Spot) 의 예약 목록**을 조회합니다. 즉 500건의 예약이 모두 같은 Spot에 속합니다. 그런데 응답 DTO에는 각 예약마다 Spot 정보가 중복되어 담기고, 그 Spot DTO를 **건별로 다시 만들고** 있었습니다.

```kotlin
// 건마다 실행되던 변환
fun toAdminSpotDto(reservation: Reservation): AdminSpotDto {
  val firstImage = spot.getFirstImageDto()       // Feign 외부 호출
  val media = spotMediaPort.list(reservation.spot)  // DB 조회
  // ... 조립
}
```

이 안에서 일어나던 일은 두 가지였습니다.

- `getFirstImageDto()` 가 내부적으로 **외부 이미지 서비스에 Feign 호출** — 500번 반복
- `spotMediaPort.list(spot)` 가 **DB 조회** — 500번 반복

Spot이 모두 같으니 결과도 전부 같습니다. **500번의 외부 호출과 DB 조회가 전부 불필요한 반복**이었습니다.

### 해결: `spotId` 단위로 DTO를 캐시

리스트 변환 메서드 안에서 **Spot DTO 캐시**를 두고, 같은 `spotId` 는 한 번만 빌드하게 바꿉니다.

```kotlin
fun toAdminDtos(reservations: List<Reservation>): List<AdminReservationDto> {
  // ... 앞의 batch 조회

  val spotDtoCache = mutableMapOf<Long, AdminSpotDto>()

  return reservations.map { reservation ->
    // ...
    val spotDto = spotDtoCache.getOrPut(reservation.spotId) {
      toAdminSpotDto(reservation)
    }

    assembleAdminDto(reservation, ..., spotDto = spotDto)
  }
}
```

500건이 모두 같은 spotId면, `getOrPut`은 **첫 호출에서만 실제 변환을 실행**하고 이후 499건은 캐시된 인스턴스를 그대로 재사용합니다. Feign 호출과 DB 조회가 500→1 로 줄어듭니다.

> **참고:** 이 캐시는 **요청 하나의 생명 주기 안에서만 유효**한 지역 변수입니다. 애플리케이션 레벨 캐시(Redis 등)를 고민할 필요가 없고, 캐시 무효화 문제도 없습니다. "한 번의 요청에서 같은 데이터를 여러 번 조립하는 경우"에만 쓰는 가벼운 최적화입니다.

### 왜 이 구조가 안전한가요?

`getFirstImageDto()` 나 `spotMediaPort.list(spot)` 의 결과는 **같은 요청 스냅샷 안에서는 변하지 않습니다**. 요청 하나 처리 중에 Spot이 바뀔 일은 없기 때문입니다. 그래서 단순한 Map 캐시가 정합성을 깨지 않습니다.

핵심 원칙을 한 줄로 줄이면 이렇습니다.

> 같은 요청 안에서 **여러 건이 공유하는 엔티티**의 DTO는 **식별자 단위로 반드시 캐시**한다.

## Phase 4. 세 번째 병목 — 상한이 없는 날짜 범위 조회

### 문제: 요청이 조회 범위를 사실상 통제

이 API의 필터는 이렇게 생겼습니다.

```kotlin
data class ReservationFilter(
  val spotId: Long,
  val startDate: LocalDate,
  val endDate: LocalDate,
  val limit: Int = 100,   // 기본 100, 하지만 사용자 지정 가능
)
```

`limit` 이 있지만 상한선이 없어 **클라이언트가 원하는 만큼 가져갈 수 있는 상태**였습니다. 운영 중 한 요청이 `limit = 20000` 같은 값을 보내면, Phase 2·3의 개선이 없었을 때는 단일 요청이 **80,000개 이상의 쿼리를 유발**할 수 있었습니다.

Phase 2와 3을 끝낸 뒤에도 여전히 위험이 남아 있었습니다. 쿼리 수는 일정해졌지만, **응답에 담을 데이터 건수**가 커질수록 응답 직렬화·전송 시간이 선형으로 증가합니다. Broken pipe는 쿼리가 아니라 **응답 크기** 쪽에서 다시 터질 수 있습니다.

### 해결: 서버에서 상한을 강제

API 계층에서 **하드 상한**을 두고, 사용자가 요청한 `limit` 을 이 값으로 클램프합니다.

```kotlin
class AdminReservationListAdapter(
  private val reservationRepository: ReservationRepository,
  private val reservationAssembler: ReservationAssembler,
) {
  companion object {
    private const val MAX_RESERVATION_LIMIT = 3000
  }

  fun list(filter: ReservationFilter): List<AdminReservationDto> {
    val cappedLimit = minOf(filter.limit, MAX_RESERVATION_LIMIT)
    val reservations = reservationRepository.list(
      filter.copy(limit = cappedLimit)
    )
    return reservationAssembler.toAdminDtos(reservations)
  }
}
```

### 왜 이 상한값인가요?

`3,000` 은 이 서비스의 **운영 현실**에서 선택된 값입니다.

- 실무에서 한 업장이 **하루에 처리하는 예약 건수의 상한**을 기준으로 함
- 이 건수 이상은 UI에서 **페이지로 나눠야 하는 범위**이지 "한 번에 로드" 할 영역이 아님
- 응답 크기가 직렬화·전송 한계를 넘지 않는 여유 있는 값

숫자 자체보다 **"한 요청이 응답할 수 있는 최대치를 서버가 보증한다"** 는 원칙이 중요합니다. 클라이언트가 실수로든 의도적으로든 큰 값을 보내더라도, 서버는 정해진 비용 안에서만 응답합니다.

## Phase 5. 변경 후 전체 흐름

세 가지 개선이 합쳐진 최종 코드입니다.

```kotlin
class AdminReservationListAdapter(
  private val reservationRepository: ReservationRepository,
  private val reservationAssembler: ReservationAssembler,
) {
  companion object {
    private const val MAX_RESERVATION_LIMIT = 3000
  }

  fun list(filter: ReservationFilter): List<AdminReservationDto> {
    val cappedLimit = minOf(filter.limit, MAX_RESERVATION_LIMIT)
    val reservations = reservationRepository.list(filter.copy(limit = cappedLimit))
    return reservationAssembler.toAdminDtos(reservations)
  }
}

class ReservationAssembler(
  private val sectionPort: SectionPort,
  private val targetMappingPort: TargetMappingPort,
  private val memoPort: MemoPort,
  private val itemPort: ItemPort,
  private val spotMediaPort: SpotMediaPort,
) {
  /** 단건 변환 — 상세 페이지 등에서 계속 사용 */
  fun toAdminDto(reservation: Reservation): AdminReservationDto { ... }

  /** 리스트 전용 변환 — batch 조회 + Spot DTO 캐시 */
  fun toAdminDtos(reservations: List<Reservation>): List<AdminReservationDto> {
    if (reservations.isEmpty()) return emptyList()

    val reservationIds = reservations.map { it.id }
    val itemIds = reservations.map { it.itemId }.distinct()

    val sectionsByResId = sectionPort
      .list(reservationIds, TargetType.RESERVATION)
      .groupBy { it.resourceId }
    val mappingsByResId = targetMappingPort
      .listByTargetIds(reservationIds)
      .groupBy { it.targetId }
    val memoByResId = memoPort
      .listByTargetIds(reservationIds, MemoType.RESERVATION_ITEM_NAME)
      .associateBy { it.targetId }
    val itemsById = itemPort.list(itemIds).associateBy { it.id }

    val spotDtoCache = mutableMapOf<Long, AdminSpotDto>()

    return reservations.map { reservation ->
      val sections = sectionsByResId[reservation.id].orEmpty()
      val mappings = mappingsByResId[reservation.id].orEmpty()
      val memo = memoByResId[reservation.id]
      val item = itemsById[reservation.itemId]
      val spotDto = spotDtoCache.getOrPut(reservation.spotId) {
        toAdminSpotDto(reservation)
      }

      assembleAdminDto(reservation, sections, mappings, memo, item, spotDto)
    }
  }
}
```

핵심 변경은 네 줄 요약으로 끝납니다.

- 리스트 전용 **`toAdminDtos` 메서드**를 추가
- 필요한 연관 데이터를 **batch 조회 + Map 인덱싱**
- 공유 Spot DTO를 **요청 스코프 캐시**로 한 번만 빌드
- Adapter 계층에서 **limit cap**으로 응답 상한을 보증

## 결과

예약 500건 조회 기준.

| 지표 | Before | After | 변화 |
|------|--------|-------|------|
| DB 쿼리 수 | 약 2,500회 | 5회 | **-99.8%** |
| Spot DTO 빌드 | 500회 | 1회 | **-99.8%** |
| Feign 외부 호출 | 500회 | 1회 | **-99.8%** |
| 응답 시간 (p95, 관측치) | 타임아웃 빈발 | 1초 이하 | — |
| Broken pipe 발생 | 지속적으로 발견 | 관측되지 않음 | — |

요청 규모가 커질수록 격차가 더 벌어집니다. 쿼리와 Feign 호출이 **상수**로 유지되기 때문입니다.

## 교훈

이번 개선에서 일반화할 수 있는 점 네 가지로 정리합니다.

1. **`Broken pipe`는 원인이 아니라 증상** — 네트워크 문제로 의심하기 전에 "이 요청이 왜 30초를 넘겼는지" 부터 따져야 합니다. 에러 이름에 끌려가지 않기.
2. **리스트 변환 경로에서는 단건 메서드를 루프로 돌리지 않기** — 단건 메서드 안에 개별 조회가 숨어 있다면 N+1은 필연입니다. 리스트 전용 변환 메서드를 명시적으로 나눠야 합니다.
3. **여러 건이 공유하는 엔티티의 DTO는 식별자 단위 캐시** — Spot처럼 "같은 요청 안에서 반복 등장"하는 엔티티는, 무겁지 않아 보이는 변환이라도 반드시 한 번만 빌드하도록 바꿔야 합니다.
4. **유연한 파라미터에는 반드시 상한** — 날짜 범위, 페이지 크기, 필터 조합 같은 "사용자 지정" 파라미터는 서버가 상한을 강제하지 않으면 언젠가 한 요청이 시스템을 흔듭니다.

그리고 이 사례의 가장 큰 교훈은 한 문장입니다.

> **한 요청에서 같은 조회가 여러 번 반복되는 구조는, 지금 당장 느리지 않아도 미래의 Broken pipe입니다.**

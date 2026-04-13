---
title: "주문은 한 번 취소됐는데 환불 이력은 왜 두 번 쌓였을까 — MySQL `REPEATABLE READ` 실전 사례"
date: "2026-04-13"
category: "troubleshooting"
tags: ["동시성 제어", "트랜잭션"]
excerpt: "`REPEATABLE READ`에서 일반 `SELECT`를 최신값처럼 믿었다가, 한 주문에 환불 이력이 두 번 쌓인 장애를 재현과 수정안으로 정리합니다."
---

## 이런 증상을 겪고 계신가요?

주문 취소 API가 아주 드물게 이상했습니다.

- `orders.status`는 정상적으로 `CANCELLED`인데 `refund_history`가 2건씩 쌓임
- 두 요청 모두 "주문 상태가 `PAID`라서 취소 가능"이라고 판단
- 첫 번째 요청이 커밋한 뒤에도 두 번째 요청이 다시 조회하면 여전히 `PAID`처럼 보임

이 글에서는 MySQL InnoDB의 기본 격리 수준인 `REPEATABLE READ`에서, 일반 `SELECT`를 최신 상태 확인 용도로 사용했을 때 어떤 문제가 생기는지, 그리고 조건부 `UPDATE`와 `UNIQUE` 제약으로 어떻게 정리했는지 설명합니다.

---

## Phase 1. 장애 범위를 다시 잡았다 — 주문 상태보다 환불 이력이 먼저 꼬였다

### 문제: 메인 테이블만 보면 정상처럼 보인다

문제가 된 흐름은 단순했습니다.

1. 주문 상태 조회
2. `PAID`면 취소 가능하다고 판단
3. 환불 이력 저장
4. 주문 상태를 `CANCELLED`로 변경

```kotlin
// Before: 읽기 결과를 믿고 이력 저장 후 상태 변경
@Transactional
fun cancel(orderId: Long) {
    val order = orderRepository.findById(orderId)
        ?: throw IllegalArgumentException("주문이 없습니다.")

    require(order.status == OrderStatus.PAID) {
        "이미 취소되었거나 취소할 수 없는 주문입니다."
    }

    refundHistoryRepository.save(
        RefundHistory(
            orderId = orderId,
            reason = "USER_CANCEL",
        )
    )

    order.cancel()
}
```

이 구조는 `SELECT -> 판단 -> 부작용 -> UPDATE` 순서라서, 처음 읽은 값이 오래되면 부가 데이터부터 꼬일 수 있습니다.

장애 당시 실제 상태는 이랬습니다.

```sql
SELECT id, status
FROM orders
WHERE id = 1001;

-- 1001 | CANCELLED
```

```sql
SELECT order_id, COUNT(*)
FROM refund_history
WHERE order_id = 1001
GROUP BY order_id;

-- 1001 | 2
```

즉, `orders`만 보면 정상인데 `refund_history`는 이미 중복되어 있었습니다.

### 해결: 분석 축을 `orders`에서 `orders + refund_history`로 넓혔다

원인 추적 기준을 주문 상태 하나에서 끝내지 않고, 아래 세 축으로 같이 보기 시작했습니다.

| 확인 대상 | 왜 같이 봐야 했나 |
|------|------|
| `orders.status` | 최종 상태 전이가 실제로 어떻게 끝났는지 확인 |
| `refund_history` | 상태는 같아도 부작용이 중복됐는지 확인 |
| 요청 타임라인 | 어느 시점에 어떤 판단이 내려졌는지 확인 |

이렇게 보니 문제가 "취소가 두 번 됐다"가 아니라, **과거 상태를 보고 취소 가능하다고 판단한 요청이 부가 이력을 한 번 더 만든 것**이라는 점이 드러났습니다.

---

## Phase 2. `REPEATABLE READ`를 재현했다 — 두 번째 요청이 왜 계속 `PAID`를 봤는지 확인

### 문제: 첫 번째 요청이 커밋한 뒤에도 두 번째 요청이 `PAID`라고 판단한다

애플리케이션 로그를 정리하니 타임라인은 아래와 같았습니다.

```text
10:00:00.100  TX-A  orderId=1001 조회 -> status=PAID
10:00:00.120  TX-B  orderId=1001 조회 -> status=PAID

10:00:00.180  TX-A  refund_history insert
10:00:00.190  TX-A  orders.status = CANCELLED update
10:00:00.200  TX-A  COMMIT

10:00:00.240  TX-B  취소 가능 여부 재확인 -> status=PAID
10:00:00.250  TX-B  refund_history insert
10:00:00.260  TX-B  orders.status = CANCELLED update
10:00:00.270  TX-B  COMMIT
```

겉보기에는 이상합니다. `TX-A`가 `10:00:00.200`에 커밋했다면, `TX-B`는 다시 읽을 때 `CANCELLED`를 봐야 할 것처럼 느껴지기 때문입니다.

### 해결: 세션 두 개로 `REPEATABLE READ`의 스냅샷 읽기를 직접 확인했다

MySQL 세션 두 개로 같은 상황을 재현했습니다.

```sql
INSERT INTO orders (id, status)
VALUES (1001, 'PAID');
```

```sql
-- 세션 A
SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;
START TRANSACTION;

SELECT status
FROM orders
WHERE id = 1001;

-- PAID
```

```sql
-- 세션 B
SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;
START TRANSACTION;

SELECT status
FROM orders
WHERE id = 1001;

-- PAID
```

```sql
-- 세션 A
INSERT INTO refund_history(order_id, reason)
VALUES (1001, 'USER_CANCEL');

UPDATE orders
SET status = 'CANCELLED'
WHERE id = 1001;

COMMIT;
```

```sql
-- 세션 B
SELECT status
FROM orders
WHERE id = 1001;

-- 여전히 PAID

INSERT INTO refund_history(order_id, reason)
VALUES (1001, 'USER_CANCEL');

UPDATE orders
SET status = 'CANCELLED'
WHERE id = 1001;

COMMIT;
```

최종 결과는 운영과 같았습니다.

```sql
SELECT status
FROM orders
WHERE id = 1001;

-- CANCELLED

SELECT COUNT(*)
FROM refund_history
WHERE order_id = 1001;

-- 2
```

핵심은 여기였습니다.

- 일반 `SELECT`는 **MVCC 스냅샷**을 읽습니다
- `UPDATE`는 **최신 버전의 실제 행**에 적용됩니다

즉, 두 번째 트랜잭션은 읽을 때는 과거를 보고 "`PAID`니까 취소 가능"이라고 판단했지만, 쓰기는 이미 `CANCELLED`가 된 최신 행에 수행했습니다. **읽기 기준과 쓰기 기준이 어긋난 상태에서 비즈니스 판단만 stale해진 것**입니다.

> **참고:** 이 글의 기준은 MySQL InnoDB의 기본 격리 수준인 `REPEATABLE READ`입니다. 다른 엔진이나 격리 수준에서는 같은 코드라도 관찰 결과가 달라질 수 있습니다.

---

## Phase 3. 해결 방향을 바꿨다 — 격리 수준이 아니라 불변식 위치가 문제였다

### 문제: `READ COMMITTED`나 `SERIALIZABLE`로 바꿔도 핵심 문제는 남는다

처음엔 두 가지 선택지가 먼저 떠올랐습니다.

- `READ COMMITTED`로 낮춰서 두 번째 조회가 최신값을 보게 할까
- `SERIALIZABLE`로 올려서 아예 충돌을 강하게 막을까

하지만 둘 다 이 사례의 핵심을 직접 해결하지는 못했습니다.

- `READ COMMITTED`는 다시 읽으면 최신값을 볼 가능성이 커지지만, **처음 읽은 값을 오래 들고 가는 구조** 자체를 없애주지는 않습니다
- `SERIALIZABLE`은 문제를 막을 수 있지만, **일반 조회까지 강하게 제어**하게 되어 이 취소 API 하나를 위해 동시성 비용이 너무 커집니다

### 해결: 취소 가능 여부 판단을 읽기에서 쓰기 시점으로 옮겼다

결국 필요한 것은 더 강한 격리 수준이 아니라, **취소 가능 여부라는 불변식을 어디서 강제할 것인가**였습니다.

이 사례에서 안전한 기준은 명확했습니다.

- "`PAID`일 때만 `CANCELLED`로 바꿀 수 있다"
- 이 규칙은 읽기 결과가 아니라 **쓰기 쿼리 자체**에 들어가야 한다

즉, 방향은 `SELECT`를 더 믿는 쪽이 아니라, **상태 전이를 SQL 한 문장으로 원자화하는 쪽**이어야 했습니다.

---

## Phase 4. 상태 전이를 원자화했다 — 조건부 `UPDATE`로 취소 가능 여부를 함께 묶었다

### 문제: `SELECT -> if -> INSERT -> UPDATE` 구조가 stale decision을 만든다

기존 코드는 먼저 읽고, 애플리케이션에서 취소 가능 여부를 판단한 뒤, 이력을 저장하고 상태를 바꾸는 구조였습니다.

```kotlin
// Before: 읽기 결과를 애플리케이션에서 해석
@Transactional
fun cancel(orderId: Long) {
    val order = orderRepository.findById(orderId)
        ?: throw IllegalArgumentException("주문이 없습니다.")

    require(order.status == OrderStatus.PAID) {
        "이미 취소되었거나 취소할 수 없는 주문입니다."
    }

    refundHistoryRepository.save(
        RefundHistory(
            orderId = orderId,
            reason = "USER_CANCEL",
        )
    )

    order.cancel()
}
```

이 구조에서는 처음 읽은 `order.status`가 stale해도, 그 값을 기준으로 `refund_history`가 먼저 저장될 수 있습니다.

### 해결: `UPDATE ... WHERE status = 'PAID'`로 상태 전이를 한 문장으로 바꿨다

최종적으로는 상태 확인과 상태 변경을 한 쿼리로 묶었습니다.

```sql
UPDATE orders
SET status = 'CANCELLED',
    cancelled_at = NOW()
WHERE id = ?
  AND status = 'PAID';
```

애플리케이션 코드는 이렇게 바뀌었습니다.

```kotlin
// After: 상태 전이 성공 여부를 영향 행 수로 판단
@Transactional
fun cancel(orderId: Long) {
    val updatedRows = orderRepository.cancelIfPaid(orderId)

    if (updatedRows == 0) {
        throw IllegalStateException("이미 취소되었거나 취소할 수 없는 주문입니다.")
    }

    refundHistoryRepository.save(
        RefundHistory(
            orderId = orderId,
            reason = "USER_CANCEL",
        )
    )
}
```

**핵심 변경 포인트:**

| 변경 | 이유 |
|------|------|
| 일반 `SELECT` 제거 | 스냅샷 읽기를 최신 상태 확인처럼 사용하는 문제 제거 |
| 조건부 `UPDATE` 도입 | 취소 가능 여부 판단과 상태 변경을 분리하지 않음 |
| `updatedRows`로 분기 | 동시 요청 중 실제 성공/실패를 명확하게 구분 |

이 방식의 장점은 읽기 시점이 아니라 **쓰기 시점의 최신 상태**를 기준으로 비즈니스 불변식을 강제한다는 점입니다.

---

## Phase 5. 부가 데이터도 막았다 — `refund_history`에 `UNIQUE` 제약을 추가했다

### 문제: 상태 전이만 막아도 부가 이력은 다른 경로에서 다시 중복될 수 있다

조건부 `UPDATE`로 상태 전이를 안전하게 바꾼 뒤에도 한 가지 리스크가 남았습니다.

- 누군가 나중에 저장 순서를 다시 바꿀 수 있고
- 배치나 운영 스크립트가 직접 이력을 넣을 수 있고
- 다른 API가 같은 이력 테이블을 재사용할 수 있습니다

즉, 애플리케이션 로직 하나만 믿으면 나중에 다시 비슷한 문제가 생길 수 있었습니다.

### 해결: 이 사례에 맞는 중복 방지 제약을 이력 테이블에도 걸었다

이 사례에서는 한 주문에 대해 같은 취소 사유의 환불 이력이 두 번 생기면 안 됐기 때문에, `refund_history`에 그 규칙을 직접 반영했습니다.

```sql
ALTER TABLE refund_history
ADD CONSTRAINT uk_refund_history_order_reason
UNIQUE (order_id, reason);
```

이후 구조는 아래처럼 정리됐습니다.

```text
조건부 UPDATE 성공
  -> 환불 이력 저장 시도
  -> 동일 주문/사유 이력이 이미 있으면 DB가 차단
```

즉, **애플리케이션에서 한 번 막고, 스키마에서 한 번 더 막는 이중 방어**로 바뀌었습니다.

> **참고:** 이 제약은 상태 전이와 역할이 다릅니다. 조건부 `UPDATE`는 "누가 취소를 성공시켰는가"를 제어하고, `UNIQUE` 제약은 "부가 이력이 몇 번 쌓일 수 있는가"를 제어합니다. 다만 실제 유니크 키는 도메인에 따라 달라질 수 있으므로, 모든 환불 시스템에 `UNIQUE (order_id, reason)`가 그대로 정답이라는 뜻은 아닙니다.

---

## 개선 결과

동시 취소 요청이 겹치는 상황을 기준으로 비교하면 차이는 분명했습니다.

| 문제 축 | 개선 전 | 개선 후 |
|------|------|------|
| 취소 가능 여부 판단 | 일반 `SELECT` 결과를 애플리케이션이 해석 | 조건부 `UPDATE` 영향 행 수로 판단 |
| 읽기 기준 | `REPEATABLE READ` 스냅샷 | 최신 행에 대한 조건부 쓰기 |
| 환불 이력 중복 방지 | 애플리케이션 로직에만 의존 | 조건부 `UPDATE` + `UNIQUE` 제약 |
| 동시 취소 요청 2건 | 두 요청 모두 이력 저장 가능 | 1건만 성공, 나머지는 `updatedRows = 0` |
| 장애 분석 기준 | `orders.status`만 보면 정상처럼 보임 | 상태, 이력, 영향 행 수를 함께 확인 |

결과적으로 이 수정은 격리 수준을 바꾼 작업이 아니라, **취소 가능 여부 판단을 스냅샷 읽기에서 최신 쓰기 기준으로 옮긴 작업**이었습니다.

---

## 교훈

1. **MySQL InnoDB의 `REPEATABLE READ`에서 일반 `SELECT`는 최신 조회가 아닙니다.** — 같은 트랜잭션 안에서는 첫 읽기 시점의 스냅샷을 계속 볼 수 있습니다.

2. **"한 번 더 조회해 봤는데 값이 그대로였다"는 사실만으로 안전하다고 볼 수 없습니다.** — 스냅샷 읽기를 반복하고 있다는 뜻일 수도 있습니다.

3. **상태 전이 규칙은 가능하면 쓰기 쿼리 자체에 넣는 편이 낫습니다.** — `WHERE status = 'PAID'` 같은 조건부 `UPDATE`가 읽기-판단-쓰기 분리를 없애줍니다.

4. **메인 테이블만 보면 정상인 장애가 더 위험합니다.** — 상태는 하나로 수렴해도, 이력·정산·알림 같은 부가 데이터는 중복될 수 있습니다.

5. **격리 수준은 불변식의 대체재가 아닙니다.** — 이 사례에서 중요한 것은 더 강한 격리 수준이 아니라, 취소 가능 여부를 어디서 강제할지에 대한 명확한 설계였습니다.

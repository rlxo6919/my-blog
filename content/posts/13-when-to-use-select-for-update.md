---
title: "SELECT ... FOR UPDATE는 언제 써야 할까 — 비관적 락이 필요한 순간"
date: "2026-04-08"
category: "study"
tags: ["동시성 제어", "트랜잭션", "락"]
excerpt: "SELECT ... FOR UPDATE가 정확히 무엇을 잠그는지, 어떤 상황에서 필요하고 어떤 상황에서는 과한지, 인덱스와 트랜잭션 범위까지 실무 기준으로 정리합니다."
---

## `SELECT ... FOR UPDATE`, 왜 따로 알아야 하나요?

[트랜잭션 격리 수준](/posts/07-transaction-isolation-levels)과 [데이터베이스 락](/posts/08-database-lock-fundamentals) 글에서 락의 개념은 이미 다뤘습니다. 하지만 실무에서는 개념보다 더 자주 이런 질문을 하게 됩니다.

- 재고 차감에는 `FOR UPDATE`가 꼭 필요할까요?
- 그냥 `UPDATE stock = stock - 1`만 해도 되는 것 아닐까요?
- 읽고 계산한 뒤 저장하는 로직에서는 언제 락을 걸어야 할까요?
- `FOR UPDATE`를 붙였는데 왜 성능이 갑자기 떨어질까요?

`SELECT ... FOR UPDATE`는 단순히 "안전하게 만드는 마법 문장"이 아닙니다. **읽는 순간 락을 잡아서 이후 쓰기까지 그 상태를 보호**하고 싶을 때 쓰는 도구입니다. 정확히는 **읽기-판단-쓰기** 사이에 다른 트랜잭션이 끼어들면 안 되는 경우에 의미가 있습니다.

이 글에서는 MySQL InnoDB 기준으로 `SELECT ... FOR UPDATE`가 언제 필요한지, 언제는 오히려 과한지, 그리고 실무에서 어떤 점을 조심해야 하는지 정리합니다.

`FOR UPDATE` 자체보다 더 큰 선택, 즉 **언제 비관적 락을 쓰고 언제 `@Version` 같은 낙관적 락을 택할지**까지 비교하고 싶다면 [낙관적 락 vs 비관적 락 — `@Version`과 `FOR UPDATE`를 고르는 실무 기준](/posts/19-optimistic-vs-pessimistic-lock) 글을 이어서 보면 자연스럽습니다.

## Phase 1. `SELECT ... FOR UPDATE`는 정확히 무엇을 하는가?

가장 단순한 예시는 다음과 같습니다.

```sql
START TRANSACTION;

SELECT *
FROM products
WHERE id = 1
FOR UPDATE;

UPDATE products
SET stock = stock - 1
WHERE id = 1;

COMMIT;
```

이 쿼리는 `id = 1` 행을 읽으면서 **배타 락(X Lock)** 을 획득합니다. 그 결과 다른 트랜잭션은 이 행에 대해:

- `UPDATE`, `DELETE`를 바로 수행할 수 없고
- `SELECT ... FOR UPDATE`, `SELECT ... FOR SHARE` 같은 잠금 읽기도 대기하게 됩니다

즉, 핵심은 **지금 읽은 행을 내가 트랜잭션 끝날 때까지 보호하겠다**는 선언입니다.

### 일반 `SELECT`와의 차이

```sql
-- 일반 SELECT
SELECT * FROM products WHERE id = 1;

-- 잠금 읽기
SELECT * FROM products WHERE id = 1 FOR UPDATE;
```

일반 `SELECT`는 MVCC 스냅샷 읽기이므로 다른 트랜잭션의 쓰기를 막지 않습니다. 반면 `FOR UPDATE`는 **현재 버전에 락을 걸기 때문에**, 이후 수정 경쟁을 직접 제어할 수 있습니다.

## Phase 2. 언제 꼭 필요할까?

`FOR UPDATE`가 빛나는 순간은 대부분 비슷합니다. **읽은 값을 기준으로 애플리케이션이 판단을 내린 뒤, 그 결과를 다시 쓰는 경우**입니다.

### 1. 재고 차감

가장 대표적인 예시입니다.

```sql
START TRANSACTION;

SELECT stock
FROM products
WHERE id = 1
FOR UPDATE;

-- 애플리케이션 로직
-- stock > 0 이면 주문 가능

UPDATE products
SET stock = stock - 1
WHERE id = 1;

COMMIT;
```

여기서 락이 없으면 두 요청이 동시에 `stock = 1`을 읽고 둘 다 주문 가능하다고 판단할 수 있습니다. 그 결과 **재고가 음수로 내려가거나, 실제보다 많이 판매되는 문제**가 생깁니다.

실무에서는 이 로직이 보통 이런 형태로 들어갑니다.

```kotlin
@Transactional
fun decreaseStock(productId: Long, quantity: Int) {
    val product = productRepository.findByIdForUpdate(productId)

    require(product.stock >= quantity) {
        "재고가 부족합니다."
    }

    product.stock -= quantity
}
```

핵심은 `재고 확인`과 `재고 차감`이 하나의 트랜잭션 안에서, 같은 행에 대한 락을 잡은 상태로 이어져야 한다는 점입니다.

### 2. 중복 처리 방지

예를 들어 같은 쿠폰을 두 번 사용하면 안 되는 상황을 생각해 보겠습니다.

```sql
START TRANSACTION;

SELECT used
FROM coupons
WHERE coupon_id = 100
FOR UPDATE;

-- used = false 인지 확인

UPDATE coupons
SET used = true
WHERE coupon_id = 100;

COMMIT;
```

락이 없으면 두 요청이 동시에 `used = false`를 보고 둘 다 성공 처리할 수 있습니다.

### 3. 상태 전이(state transition) 보호

주문 상태가 `READY -> PAID -> SHIPPED` 순서로만 바뀌어야 한다면, 상태를 읽고 검증한 뒤 변경하는 과정도 보호가 필요할 수 있습니다.

```sql
START TRANSACTION;

SELECT status
FROM orders
WHERE id = 1
FOR UPDATE;

-- READY 상태인지 확인

UPDATE orders
SET status = 'PAID'
WHERE id = 1;

COMMIT;
```

이 패턴의 핵심은 단순 업데이트가 아니라, **현재 상태를 보고 비즈니스 판단을 한 뒤 다음 상태로 넘긴다**는 점입니다.

다만 상태 전이도 항상 `FOR UPDATE`가 필요한 것은 아닙니다. 조건이 단순하다면 한 문장 `UPDATE`로 표현할 수 있습니다.

```sql
UPDATE orders
SET status = 'PAID'
WHERE id = 1
  AND status = 'READY';
```

이 경우:

- 영향받은 행 수가 1이면 상태 변경 성공
- 0이면 이미 다른 상태로 바뀌었거나, 선행 조건을 만족하지 않은 것

즉, **현재 상태가 특정 값일 때만 변경한다**는 규칙은 원자적 `UPDATE`로 충분한 경우가 많습니다.

## Phase 3. 반대로, 꼭 필요하지 않은 경우도 많습니다

실무에서 흔한 실수는 `FOR UPDATE`를 너무 넓게 쓰는 것입니다.

### 1. 원자적 UPDATE만으로 충분한 경우

잔액 차감 자체만 목적이고, 중간에 별도 비즈니스 판단이 없다면 다음 쿼리는 굳이 먼저 읽을 필요가 없습니다.

```sql
UPDATE accounts
SET balance = balance - 3000
WHERE id = 1;
```

이 쿼리는 DB가 한 문장 안에서 최신 값을 기준으로 계산합니다. 이런 경우는 별도로 `SELECT ... FOR UPDATE`를 하지 않아도 됩니다. 다만 "잔액이 부족하면 실패해야 한다" 같은 조건이 있으면 `WHERE balance >= 3000`처럼 조건까지 함께 넣어야 합니다.

더 안전하게 조건까지 함께 넣을 수도 있습니다.

```sql
UPDATE products
SET stock = stock - 1
WHERE id = 1
  AND stock > 0;
```

이렇게 하면:

- 재고가 있을 때만 차감되고
- 영향받은 행 수가 1이면 성공
- 0이면 품절로 판단할 수 있습니다

즉, **읽고 판단하는 로직을 SQL 한 문장으로 밀어 넣을 수 있다면**, `FOR UPDATE`가 필요 없는 경우가 많습니다.

애플리케이션에서는 보통 이렇게 해석합니다.

```kotlin
val updatedRows = productRepository.decreaseStockIfAvailable(productId)

if (updatedRows == 0) {
    throw IllegalStateException("품절입니다.")
}
```

이 패턴의 장점은 락을 오래 쥐고 있지 않으면서도, 성공/실패를 **영향받은 행 수**로 명확하게 판단할 수 있다는 점입니다.

### 2. 단순 조회만 하는 경우

조회 결과를 화면에 보여 주기만 하고, 그 값을 기준으로 즉시 쓰기 결정을 하지 않는다면 `FOR UPDATE`는 과합니다.

```sql
-- ❌ 단순 상세 조회에 잠금 읽기 사용
SELECT * FROM products WHERE id = 1 FOR UPDATE;
```

이런 코드는 불필요하게 락을 오래 잡아 다른 요청을 막을 수 있습니다.

### 3. 긴 작업과 함께 묶는 경우

```kotlin
@Transactional
fun issueCoupon(userId: Long, couponId: Long) {
    val coupon = couponRepository.findForUpdate(couponId)
    val result = externalApi.call()
    coupon.issueTo(userId)
}
```

여기서 외부 API 호출이 느리면, 락도 그만큼 오래 유지됩니다. `FOR UPDATE`는 짧고 강하게 써야지, 오래 들고 있으면 거의 항상 문제가 됩니다.

## Phase 4. 가장 중요한 판단 기준은 "읽기-판단-쓰기"인가?

`FOR UPDATE`가 필요한지 판단하는 가장 간단한 질문은 이것입니다.

> **내가 읽은 값을 기준으로 애플리케이션이 판단을 내리고, 그 사이 다른 트랜잭션이 값을 바꾸면 안 되는가?**

`YES`라면 `FOR UPDATE`를 검토할 이유가 있습니다.  
`NO`라면 보통 다른 방법이 더 단순합니다.

### 필요한 경우

- 현재 재고를 보고 주문 가능 여부를 판단
- 현재 상태를 보고 상태 전이 가능 여부를 판단
- 현재 사용 여부를 보고 중복 처리 여부를 판단

### 불필요한 경우

- 단순 조회
- 읽지 않고 바로 원자적 `UPDATE`
- 결과가 조금 바뀌어도 비즈니스상 문제 없는 통계성 처리

## Phase 5. 인덱스가 없으면 생각보다 넓게 잠글 수 있습니다

`FOR UPDATE`를 쓸 때 가장 자주 놓치는 것이 인덱스입니다.

```sql
SELECT *
FROM orders
WHERE customer_id = 42
FOR UPDATE;
```

`customer_id`에 인덱스가 없다면 InnoDB는 조건에 맞는 행을 찾기 위해 더 넓은 범위를 스캔해야 합니다. 이 과정에서:

- 잠금 대상이 불필요하게 넓어질 수 있고
- 다른 트랜잭션 충돌이 급격히 늘고
- 데드락 가능성도 높아질 수 있습니다

즉, `FOR UPDATE`는 문장 하나만 보는 것이 아니라 **어떤 인덱스로 어떤 범위를 읽는가**까지 함께 봐야 합니다.

### 실무에서 확인할 것

```sql
EXPLAIN
SELECT *
FROM orders
WHERE customer_id = 42
FOR UPDATE;
```

`EXPLAIN` 결과가 풀 스캔에 가깝다면, 락 범위도 의도보다 커질 가능성을 의심해야 합니다.

## Phase 6. 범위 조건에서는 갭 락과 넥스트 키 락도 같이 생각해야 합니다

[데이터베이스 락](/posts/08-database-lock-fundamentals) 글에서 다뤘듯이, InnoDB는 Repeatable Read에서 범위 잠금 읽기에 **갭 락**과 **넥스트 키 락**을 함께 사용할 수 있습니다.

```sql
SELECT *
FROM reservations
WHERE room_id = 10
  AND reserved_at BETWEEN '2026-04-08 10:00:00' AND '2026-04-08 11:00:00'
FOR UPDATE;
```

이런 쿼리는 단순히 현재 있는 행만 잠그는 것이 아니라, **그 범위에 새 행이 들어오는 것까지 막는 방향**으로 동작할 수 있습니다.

이게 필요한 경우도 있습니다.

- 같은 시간대 예약 중복 방지
- 특정 범위 내 선점 처리

하지만 잘못 쓰면 예상보다 훨씬 넓은 충돌을 만들 수 있습니다. 범위 잠금은 편리하지만, 그만큼 조심해서 써야 합니다.

## Phase 7. `FOR UPDATE`를 쓰면 생기는 부작용

안전성을 높이는 대신 반드시 비용을 치릅니다.

### 1. 대기 시간 증가

한 요청이 락을 잡고 있으면 다음 요청은 기다려야 합니다.

```text
요청 A: SELECT ... FOR UPDATE  → 락 획득
요청 B: SELECT ... FOR UPDATE  → 대기
```

동시 요청이 많은 구간에서는 이 대기 시간이 곧 응답 지연으로 이어집니다.

### 2. 데드락 위험 증가

두 트랜잭션이 서로 다른 순서로 여러 행을 잠그면 데드락이 발생할 수 있습니다.

```text
트랜잭션 A: id=1 잠금 → id=2 잠금 시도
트랜잭션 B: id=2 잠금 → id=1 잠금 시도
```

이 상황에서는 한쪽이 반드시 롤백됩니다.

### 2-1. `lock wait timeout`과 `deadlock`은 다릅니다

둘 다 실패처럼 보이지만 의미는 다릅니다.

- **`lock wait timeout`** — 누군가 잡고 있는 락을 오래 기다렸지만 끝내 얻지 못한 상황
- **`deadlock`** — 서로가 서로를 기다리는 순환 대기가 감지되어 DB가 한쪽을 강제로 중단한 상황

실무에서는 둘 다 재시도 후보가 될 수 있지만, **`deadlock`은 락 획득 순서 문제**, **`lock wait timeout`은 긴 트랜잭션이나 느린 작업 문제**일 가능성이 더 큽니다.

### 3. 커넥션 점유 시간 증가

[DB 커넥션 풀](/posts/12-database-connection-pool-fundamentals) 글과 연결되는 부분입니다. 트랜잭션 안에서 `FOR UPDATE`를 사용하면, 락뿐 아니라 **커넥션도 그 시간 동안 점유**됩니다. 그래서:

- 느린 외부 API 호출
- 긴 서비스 로직
- 사용자 입력 대기

같은 작업과 함께 묶으면 커넥션 풀까지 함께 흔들릴 수 있습니다.

## Phase 8. 실무에서 추천하는 사용 원칙

복잡하게 외우기보다 다음 원칙으로 판단하면 충분합니다.

### 원칙 1. 정말 필요한 행만 잠급니다

조건을 좁게 쓰고, 인덱스를 맞추고, 불필요한 범위 잠금을 피해야 합니다.

### 원칙 2. 트랜잭션은 최대한 짧게 유지합니다

락을 잡은 뒤 외부 API 호출, 파일 I/O, 복잡한 계산을 넣지 않는 것이 기본입니다.

### 원칙 3. 원자적 UPDATE로 대체 가능하면 먼저 그 방법을 봅니다

`FOR UPDATE`는 강력하지만 무겁습니다. 한 문장 `UPDATE`로 해결되면 그쪽이 더 단순하고 안전한 경우가 많습니다.

특히:

- "조건을 만족하면 차감"
- "아직 처리되지 않았으면 처리 완료로 변경"
- "현재 상태가 READY일 때만 PAID로 변경"

같은 로직은 `WHERE` 조건을 잘 설계하면 `FOR UPDATE` 없이 해결할 수 있는 경우가 많습니다.

### 원칙 4. 데드락 재시도 전략을 준비합니다

`FOR UPDATE`를 쓰는 구간은 충돌 가능성이 높은 구간인 경우가 많습니다. 따라서 데드락이나 `lock wait timeout`을 만났을 때 재시도 전략까지 함께 설계하는 편이 현실적입니다.

## 정리

1. **`SELECT ... FOR UPDATE`는 읽는 순간 행을 보호하기 위한 비관적 락입니다** — 읽기-판단-쓰기 사이를 안전하게 만들고 싶을 때 의미가 있습니다
2. **재고 차감, 중복 처리, 상태 전이처럼 현재 값을 보고 결정하는 로직에서 특히 유용합니다**
3. **원자적 `UPDATE`로 해결 가능한 경우에는 굳이 `FOR UPDATE`가 필요하지 않을 수 있습니다**
4. **인덱스 없이 쓰면 잠금 범위가 커질 수 있습니다** — `EXPLAIN`으로 실제 접근 범위를 같이 봐야 합니다
5. **`FOR UPDATE`는 안전성과 맞바꿔 대기, 데드락, 커넥션 점유 비용을 늘립니다** — 짧고 좁게 쓰는 것이 핵심입니다

큰 그림에서 `FOR UPDATE`와 `@Version`을 어떻게 나눠 쓸지까지 보고 싶다면, 다음 글인 [낙관적 락 vs 비관적 락 — `@Version`과 `FOR UPDATE`를 고르는 실무 기준](/posts/19-optimistic-vs-pessimistic-lock)으로 이어서 읽으면 좋습니다.

---
title: "멱등성 완전 정복 — 중복 요청을 한 번처럼 처리하는 법"
date: "2026-04-13"
category: "study"
tags: ["동시성 제어"]
excerpt: "HTTP 메서드의 멱등성과 `idempotency key` 기반 API 멱등성을 구분하고, 중복 결제·중복 주문을 저장과 재시도 관점에서 어떻게 제어할지 정리합니다."
---

## 멱등성, 왜 알아야 하나요?

[낙관적 락 vs 비관적 락](/posts/19-optimistic-vs-pessimistic-lock) 글과 [분산 락은 언제 써야 할까](/posts/20-when-to-use-distributed-lock) 글까지 읽고 나면 이런 질문이 남습니다.

- 결제 요청이 timeout 나서 클라이언트가 다시 보내면, 같은 결제가 두 번 실행되지 않게 하려면 어떻게 해야 할까요?
- 주문 생성 API에 분산 락을 걸기보다 `idempotency key`로 끝낼 수 있는 경우는 언제일까요?
- HTTP에서 `PUT`이 멱등하다는 말과, 결제 API에서 말하는 멱등성은 같은 뜻일까요?
- `UNIQUE` 제약 조건, 락, 멱등성은 각각 무엇을 막는 도구일까요?

핵심은 이것입니다. **멱등성은 "동시에 실행되지 않게 막는 기술"이 아니라, 같은 요청이 여러 번 와도 결과를 한 번처럼 보이게 만드는 계약**입니다.

즉, 락이 충돌을 줄 세우는 도구라면, 멱등성은 **재시도와 중복 요청을 흡수하는 도구**에 가깝습니다.

이 글은 HTTP semantics와 일반적인 API 서버 설계를 기준으로, **멱등성이 무엇을 보장하고 무엇은 보장하지 않는지**, 그리고 `idempotency key`를 실제로 어떻게 저장하고 해석해야 하는지 정리합니다.

## 먼저 선택 기준부터 보면

실무에서는 보통 아래 순서로 판단하면 덜 헷갈립니다.

| 상황 | 먼저 볼 선택지 | 이유 |
|------|----------------|------|
| 같은 DB 행 수정 경쟁 | 조건부 `UPDATE`, `FOR UPDATE` | 핵심 문제는 동시 수정입니다 |
| 중복 삽입 방지 | `UNIQUE` 제약 조건 | 결과 자체를 물리적으로 금지할 수 있습니다 |
| 네트워크 재시도, 중복 클릭, timeout 후 재요청 | `idempotency key` | 같은 요청을 한 번처럼 처리해야 합니다 |
| 외부 API 호출의 중복 실행 방지 | 멱등성 + 필요 시 락 | 중복 요청 흡수와 직렬화는 다른 문제입니다 |
| 배치/스케줄러 단일 실행 | `named lock`, `distributed lock` | 작업 중복 실행 조율이 핵심입니다 |

가장 짧게 줄이면 이렇습니다.

- **동시 수정 문제는 락이나 SQL로 봅니다**
- **재시도와 중복 요청 문제는 멱등성으로 봅니다**
- **중복 결과 자체를 금지해야 하면 `UNIQUE`가 더 직접적입니다**

## Phase 1. HTTP의 멱등성과 API 설계의 멱등성은 다릅니다

여기서 가장 자주 헷갈립니다.

### HTTP 메서드의 멱등성

RFC 9110은 메서드의 `idempotent` 속성과 `safe` 속성을 **별개**로 정의합니다. 이 둘은 비슷해 보이지만 다릅니다.

- **`safe`** (§9.2.1) — 서버 상태를 변경하지 않는 읽기 전용 의미를 가지는 메서드. `GET`, `HEAD`, `OPTIONS`, `TRACE`가 해당됩니다.
- **`idempotent`** (§9.2.2) — 같은 요청을 한 번 보내든 여러 번 보내든 의도된 서버 상태가 같은 메서드. `PUT`, `DELETE`에 더해, `safe` 메서드도 정의상 모두 `idempotent`입니다.

즉 모든 `safe` 메서드는 `idempotent`이지만, `idempotent`라고 해서 모두 `safe`는 아닙니다. `PUT`과 `DELETE`는 **서버 상태를 바꾸는데도 멱등**한 대표 예입니다.

의미는 단순합니다.

> **같은 요청을 여러 번 보내더라도, 의도된 최종 서버 상태는 한 번 보낸 것과 같아야 합니다**

예를 들어:

```http
PUT /users/1
DELETE /posts/10
```

같은 `PUT`을 두 번 보내도 최종 리소스 상태가 같다면 멱등합니다. 같은 `DELETE`를 여러 번 보내도 "결국 삭제된 상태"라면 멱등합니다. 둘 다 서버 상태를 바꾸므로 `safe`는 아니지만, 반복해도 결과가 누적되지 않으므로 `idempotent`입니다.

중요한 점은 **응답이 항상 같아야 한다는 뜻이 아니라, 의도된 효과가 같아야 한다는 뜻**입니다.

### 애플리케이션 레벨 멱등성

반면 결제 API나 주문 생성 API는 보통 `POST`를 사용합니다.

```http
POST /payments
POST /orders
```

이런 요청은 HTTP 메서드 자체로는 멱등하지 않습니다. 하지만 애플리케이션이 `idempotency key`를 도입하면:

- 클라이언트가 같은 요청을 다시 보내더라도
- 서버가 같은 작업으로 인식하고
- 새 결제/새 주문을 다시 만들지 않게 할 수 있습니다

즉:

- **HTTP 멱등성** — 메서드 semantics
- **애플리케이션 멱등성** — 같은 비즈니스 요청을 한 번처럼 처리하는 서버 계약

으로 구분하는 편이 정확합니다.

## Phase 2. `idempotency key`는 무엇을 보장할까?

`idempotency key`의 역할은 대개 다음 한 문장으로 정리됩니다.

> **"이 요청은 같은 작업의 재시도입니다"라는 사실을 서버에 알려 주는 키**

예를 들어 결제 요청에서:

```http
POST /payments
Idempotency-Key: pay:order-123
```

서버는 이 키를 보고 판단합니다.

- 처음 보는 키인가? → 새 작업으로 처리
- 이미 처리한 키인가? → 이전 결과를 재사용하거나 같은 작업 결과로 응답

핵심은 **클라이언트 재시도를 서버가 중복 실행으로 오해하지 않게 만드는 것**입니다.

### 어떤 상황에서 특히 필요할까?

- 결제 버튼을 사용자가 두 번 클릭
- 모바일 네트워크 불안정으로 응답을 못 받고 재요청
- 서버는 처리했지만 클라이언트는 timeout으로 실패로 인식
- API gateway나 client library가 자동 재시도 수행

이런 상황에서 멱등성이 없으면:

- 결제가 두 번 승인되고
- 주문이 두 건 생성되고
- 쿠폰이 두 번 발급되고
- 같은 외부 요청이 반복 실행될 수 있습니다

### 무엇을 보장하지는 않을까?

`idempotency key`는 만능이 아닙니다.

- 동시 수정 경쟁 자체를 자동으로 막아 주지는 않습니다
- 잘못된 비즈니스 로직을 자동으로 바로잡지 않습니다
- key를 늦게 저장하거나, side effect를 먼저 발생시키면 중복 실행을 막지 못할 수 있습니다

즉, 멱등성은 **중복 요청 흡수 계약**이지, 모든 정합성 문제의 대체재는 아닙니다.

## Phase 3. 보통은 이렇게 저장합니다

실무에서는 `idempotency_key` 전용 저장소를 따로 둡니다.

가장 단순한 예시는 이런 테이블입니다.

```sql
CREATE TABLE api_idempotency (
  idempotency_key VARCHAR(255) PRIMARY KEY,
  request_hash    VARCHAR(64)  NOT NULL,
  status          VARCHAR(20)  NOT NULL,
  response_code   INT          NULL,
  response_body   JSON         NULL,
  resource_type   VARCHAR(50)  NULL,
  resource_id      VARCHAR(100) NULL,
  created_at      TIMESTAMP    NOT NULL,
  updated_at      TIMESTAMP    NOT NULL
);
```

핵심 컬럼은 보통 이 정도입니다.

- `idempotency_key` — 같은 작업인지 식별
- `request_hash` — 같은 key에 다른 payload가 들어오는 오용 방지
- `status` — `PROCESSING`, `SUCCEEDED`, `FAILED`
- `response_code`, `response_body` — 재시도 시 같은 응답 재사용
- `resource_type`, `resource_id` — 실제 생성된 리소스 추적

### 왜 `request_hash`가 필요할까?

같은 key를 재사용했는데 payload가 다르면, 서버는 난감해집니다.

```text
요청 A: Idempotency-Key = pay:123, amount = 10000
요청 B: Idempotency-Key = pay:123, amount = 50000
```

이 둘을 같은 작업으로 보면 잘못이고, 다른 작업으로 보면 key 의미가 깨집니다.

그래서 많은 시스템은:

- 같은 key + 같은 payload → 재시도
- 같은 key + 다른 payload → 오류

로 처리합니다.

Stripe 문서도 같은 key를 재사용하면서 파라미터가 다르면 오류를 반환하는 방향을 설명합니다.

## Phase 4. 보통의 처리 흐름은 이렇습니다

예를 들어 결제 생성 API를 생각해 보겠습니다.

```text
1. 클라이언트가 `Idempotency-Key`와 함께 요청 전송
2. 서버가 key 존재 여부 확인
3. 없으면 `PROCESSING` 상태로 먼저 기록
4. 실제 비즈니스 로직 수행
5. 성공/실패 결과를 key 레코드에 저장
6. 이후 같은 key 요청이 오면 저장된 결과 재사용
```

이를 아주 단순화하면 이런 흐름입니다.

```kotlin
fun createPayment(command: CreatePaymentCommand, key: String): PaymentResponse {
    val existing = idempotencyRepository.find(key)
    if (existing != null) {
        return existing.toResponse()
    }

    idempotencyRepository.insertProcessing(key, hash(command))

    val payment = paymentService.create(command)
    val response = PaymentResponse.from(payment)

    idempotencyRepository.markSucceeded(key, response)
    return response
}
```

물론 실제 구현에서는 여기서 더 조심해야 합니다.

### 1. "존재 확인 후 insert"만 하면 race가 날 수 있습니다

두 요청이 동시에 들어오면:

```text
A: key 없음 확인
B: key 없음 확인
A: insert
B: insert
```

가 될 수 있습니다.

그래서 보통은:

- `idempotency_key`에 `PRIMARY KEY` 또는 `UNIQUE`를 두고
- `INSERT` 자체를 원자적으로 시도한 뒤
- 중복 키 충돌 시 기존 레코드를 읽는 방식

으로 갑니다.

즉, 멱등성 저장소 자체도 **DB 제약 조건 위에** 세우는 편이 안전합니다.

### 2. `PROCESSING` 상태가 왜 필요할까?

첫 요청이 아직 끝나지 않았는데 같은 key가 다시 들어올 수 있습니다.

예를 들어:

1. 요청 A 시작
2. `idempotency_key` 저장
3. 외부 결제사 호출 중 timeout
4. 클라이언트 재시도

이때 같은 key가 이미 `PROCESSING`이면 서버는 선택해야 합니다.

- 아직 처리 중이라고 `409 Conflict`나 `202 Accepted` 계열로 안내
- 짧게 poll 하거나 대기 후 최종 결과 반환
- 내부 정책상 같은 작업의 완료를 기다림

핵심은 **"아직 끝나지 않은 같은 작업"** 도 별도 상태로 취급해야 한다는 점입니다.

### 3. 성공만 저장할지, 실패도 저장할지 정책이 필요합니다

여기서 자주 헷갈립니다.

- validation error처럼 "아예 실행이 시작되지 않은 실패"
- 외부 호출 후 일부 작업이 끝난 뒤 난 실패
- 확정적인 비즈니스 실패와 일시적 인프라 실패

는 성격이 다릅니다.

Stripe 문서는 "실행이 시작된 뒤의 첫 결과"를 저장하고 재사용하는 방향을 설명합니다. 하지만 여러분의 API는:

- 확정적 실패는 저장하고
- 재시도 가능한 일시 오류는 저장하지 않거나
- 별도 상태로 두고 다시 시도 가능하게

설계할 수도 있습니다.

즉, **멱등성 저장 전략은 실패 모델과 함께 설계해야 합니다.**

## Phase 5. 결제, 주문, 쿠폰에서는 어떻게 다를까?

### 1. 결제 생성

결제는 멱등성이 가장 자주 필요한 예시입니다.

```text
POST /payments
Idempotency-Key: pay:order-123
```

클라이언트가 timeout 후 재시도하더라도:

- 같은 `payment`를 재생성하지 않고
- 같은 결제 결과를 돌려주거나
- 이미 생성된 결제 리소스를 가리켜야 합니다

결제는 외부 시스템까지 얽히는 경우가 많기 때문에, **락보다 멱등성이 먼저**인 경우가 많습니다.

### 2. 주문 생성

주문도 비슷합니다.

- 장바구니에서 주문 생성 버튼을 두 번 누름
- 프론트엔드가 재시도
- API gateway가 재전송

이 상황에서 주문이 두 건 만들어지면 안 됩니다.

이때는 `order:create:{cartId}` 같은 key를 둘 수 있습니다. 다만 여기서 중요한 것은:

- 같은 cart에서 여러 주문이 정말 불가능한가?
- key 스코프를 user 기준으로 잡을지, cart 기준으로 잡을지

를 먼저 정해야 한다는 점입니다.

### 3. 쿠폰 발급

쿠폰 발급은 멱등성만으로 끝나지 않는 경우가 많습니다.

예를 들어 "사용자당 1회 발급"이라면:

- 중복 요청 흡수는 `idempotency key`
- 결과 자체의 중복 방지는 `UNIQUE (coupon_id, user_id)`

처럼 두 층이 함께 필요할 수 있습니다.

즉:

- 멱등성은 **같은 요청의 재시도**를 다루고
- `UNIQUE`는 **비즈니스 결과의 중복 자체**를 막습니다

## Phase 6. 락, `UNIQUE`, 멱등성은 역할이 다릅니다

이 셋은 대체 관계라기보다 서로 다른 층에서 문제를 푸는 도구입니다.

### 락

- 같은 자원을 동시에 수정하지 않게 조율
- 읽기-판단-쓰기 경쟁 제어
- 예: 재고 차감, 상태 전이

### `UNIQUE`

- 중복 결과 자체를 DB에서 금지
- 예: 같은 쿠폰의 중복 발급, 같은 외부 주문 ID의 중복 저장

### 멱등성

- 같은 요청의 재시도와 중복 제출 흡수
- 예: timeout 후 결제 재요청, 버튼 연타, 네트워크 재전송

예를 들어 결제 API는 이렇게 조합될 수 있습니다.

- 클라이언트 재시도 흡수 → `idempotency key`
- DB 중복 저장 방지 → `UNIQUE (external_payment_id)`
- 특정 상태 전이 보호 → 조건부 `UPDATE` 또는 락

즉, **멱등성이 락을 없애는 것이 아니라, 다른 종류의 문제를 앞단에서 흡수하는 것**입니다.

## Phase 7. 자주 하는 실수

### 1. key만 받고 서버에 저장하지 않는다

클라이언트가 `Idempotency-Key`를 보내더라도, 서버가 그 key와 결과를 저장하지 않으면 아무 의미가 없습니다.

### 2. key 스코프를 너무 넓거나 너무 좁게 잡는다

예를 들어:

- 너무 넓음: `user:123`
- 너무 좁음: 매 요청마다 무작위 key 생성

이 둘 다 문제입니다. key는 **"같은 작업"을 안정적으로 식별할 정도로만** 잡아야 합니다.

### 3. payload가 다른데 같은 key를 허용한다

이 경우는 재시도와 새 요청이 구분되지 않습니다. 같은 key에 대해 입력이 달라지면 보통 오류로 처리하는 편이 낫습니다.

### 4. side effect보다 늦게 key를 저장한다

외부 결제 호출을 먼저 하고, 그 다음 key를 저장하면 이미 중복 실행을 막을 기회를 놓친 것입니다.

### 5. "멱등성 = 정확히 한 번"이라고 생각한다

멱등성은 보통 **중복 요청을 한 번처럼 처리하는 계약**이지, 분산 시스템 전체에서 철저한 `exactly once`를 공짜로 보장하는 마법은 아닙니다.

특히 외부 시스템과 webhooks까지 얽히면:

- 요청 측 멱등성
- 저장 측 `UNIQUE`
- 소비 측 중복 이벤트 처리

를 함께 설계해야 합니다.

## 한눈에 보는 선택 기준

| 문제 유형 | 더 먼저 볼 수단 | 이유 |
|----------|----------------|------|
| 같은 행 수정 경쟁 | 조건부 `UPDATE`, `FOR UPDATE` | 핵심은 동시 수정입니다 |
| 중복 결과 자체 금지 | `UNIQUE` 제약 | 결과를 DB에서 직접 막습니다 |
| timeout 후 재요청, 버튼 연타 | `idempotency key` | 같은 요청 재시도를 흡수해야 합니다 |
| 외부 API 중복 호출 방지 | 멱등성 우선, 필요 시 락 보조 | 재시도 흡수와 직렬화는 다른 문제입니다 |
| 스케줄러 단일 실행 | `named lock`, `distributed lock` | 작업 중복 실행 조율이 핵심입니다 |

## 정리

1. **HTTP 메서드의 멱등성과 API 설계의 멱등성은 다릅니다** — 하나는 HTTP semantics이고, 다른 하나는 같은 비즈니스 요청을 한 번처럼 처리하는 서버 계약입니다
2. **`idempotency key`는 중복 요청 흡수 도구입니다** — timeout, 재시도, 버튼 연타 같은 상황에서 특히 중요합니다
3. **멱등성 저장소는 보통 key, payload hash, 처리 상태, 응답을 함께 관리합니다** — 같은 key 재사용과 `PROCESSING` 상태를 구분해야 합니다
4. **멱등성만으로 모든 정합성 문제가 끝나지는 않습니다** — `UNIQUE`, 조건부 `UPDATE`, 락과 각자 역할이 다릅니다
5. **가장 흔한 실수는 key를 너무 늦게 저장하거나, 같은 key에 다른 payload를 허용하는 것입니다**

핵심을 한 문장으로 줄이면 이렇습니다.

> **락이 충돌을 줄 세우는 도구라면, 멱등성은 재시도와 중복 요청을 한 번처럼 흡수하는 도구입니다**

---
title: "Spring `@Transactional` 완전 정복 — 전파 속성과 롤백 규칙은 어떻게 동작하나요?"
date: "2026-04-25"
category: "study"
tags: ["트랜잭션"]
excerpt: "Spring의 @Transactional이 제공하는 7가지 전파 속성, 기본 롤백 규칙, readOnly와 timeout 힌트, 그리고 실무에서 자주 오해되는 REQUIRES_NEW와 NESTED의 동작을 Spring 레퍼런스 기준으로 정리합니다."
---

## `@Transactional`, 왜 전파 속성까지 알아야 하나요?

대부분의 코드는 `@Transactional`을 기본 설정 그대로 씁니다. 그러다 보니 다음 상황에서 결과가 의아해집니다.

- `@Transactional`이 걸린 메서드가 다른 `@Transactional` 메서드를 호출했는데 **트랜잭션이 하나로 합쳐졌습니다**
- 안쪽 트랜잭션에서 `RuntimeException`이 터졌는데 **바깥 트랜잭션까지 통째로 롤백**됐습니다
- `try-catch`로 예외를 잡았는데도 **커밋 시점에 `UnexpectedRollbackException`** 이 나옵니다
- `REQUIRES_NEW`로 바꿨더니 **커넥션 풀이 고갈**되기 시작했습니다

이 모든 동작의 중심에 **전파 속성(`Propagation`)** 이 있습니다. 전파 속성은 "호출 시점에 이미 실행 중인 트랜잭션이 있을 때 어떻게 동작할지"를 정의하는 규칙입니다. 기본값인 `REQUIRED` 하나로도 대부분의 코드가 돌아가지만, 조금만 복잡한 비즈니스 로직이 되면 **전파와 롤백 규칙을 모르고는 구조적 버그를 피하기 어렵습니다**.

> **기준:** 이 글은 **Spring Framework 6 / Spring Boot 3.x** 기준으로 작성합니다. 전파 속성과 롤백 규칙 정의는 [Spring Framework Reference — Transaction Management](https://docs.spring.io/spring-framework/reference/data-access/transaction.html)와 [`org.springframework.transaction.annotation.Propagation`](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/transaction/annotation/Propagation.html) JavaDoc을 참조합니다. 격리 수준은 [트랜잭션 격리 수준 글](/posts/07-transaction-isolation-levels), ACID는 [ACID 글](/posts/34-transaction-acid-principles), 영속성 컨텍스트와의 관계는 [영속성 컨텍스트 글](/posts/38-jpa-persistence-context)에서 이미 다뤘습니다. 코드 예시는 Kotlin + Spring Boot입니다. AOP 프록시 동작과 `self-invocation` 문제는 다음 글에서 따로 다룹니다.

## 먼저 가장 짧은 답부터 보면

- 전파 속성은 **"이미 트랜잭션이 있을 때"의 동작**을 정합니다. 없으면 대부분 새로 시작합니다
- 기본값 **`REQUIRED`** — 있으면 참여, 없으면 새로 시작
- **`REQUIRES_NEW`** — 항상 새 물리 트랜잭션. 바깥 트랜잭션은 일시 정지
- **`NESTED`** — 같은 트랜잭션 안의 **세이브포인트**. 부분 롤백만
- 기본 롤백은 **`RuntimeException`과 `Error`** 에서만 일어납니다. **`Checked Exception`은 기본적으로 롤백하지 않습니다**
- `readOnly = true`는 **힌트**이지 강제가 아닙니다. Hibernate는 이걸 flush 모드 최적화에 사용합니다

## Phase 1. 전파 속성이 결정하는 것

### 핵심: "이미 트랜잭션이 진행 중인가?"에 따라 분기합니다

`@Transactional`이 붙은 메서드가 호출되면, Spring의 트랜잭션 인터셉터는 **먼저 현재 스레드에 이미 열려 있는 트랜잭션이 있는지** 확인합니다. 이 판단 후의 동작을 결정하는 것이 **전파 속성**입니다.

```text
호출 시점
  │
  ▼
현재 트랜잭션이 있는가?
  ├─ 없음 → Propagation 설정에 따라 "새로 시작" or "에러" or "비트랜잭션 실행"
  └─ 있음 → Propagation 설정에 따라 "참여" or "새 물리 트랜잭션" or "세이브포인트" or ...
```

Spring의 `Propagation` enum은 **7가지 값**을 제공합니다.

## Phase 2. 7가지 전파 속성 한 번에 보기

| 속성 | 현재 트랜잭션이 있을 때 | 현재 트랜잭션이 없을 때 |
|------|----------------------|----------------------|
| `REQUIRED` (기본값) | 참여 | 새로 시작 |
| `REQUIRES_NEW` | 바깥을 **일시 정지**하고 새로 시작 | 새로 시작 |
| `SUPPORTS` | 참여 | 비트랜잭션으로 실행 |
| `NOT_SUPPORTED` | 바깥을 **일시 정지**하고 비트랜잭션으로 실행 | 비트랜잭션으로 실행 |
| `MANDATORY` | 참여 | 예외 (`IllegalTransactionStateException`) |
| `NEVER` | 예외 | 비트랜잭션으로 실행 |
| `NESTED` | **세이브포인트** 생성 후 실행 | 새로 시작 (`REQUIRED`처럼) |

이 중 실무에서 자주 보는 것은 **`REQUIRED`, `REQUIRES_NEW`, `NESTED`** 세 가지입니다. 나머지는 개념 확인용으로 한 번 훑어두면 됩니다.

## Phase 3. `REQUIRED` — 논리 트랜잭션과 `UnexpectedRollbackException`

### 동작

`REQUIRED`는 "트랜잭션이 있으면 참여하고, 없으면 새로 시작한다"입니다. **가장 흔한 기본값**이며, 대부분의 서비스 메서드가 이 설정으로 동작합니다.

```kotlin
@Service
class OrderService(
  private val paymentService: PaymentService
) {
  @Transactional  // REQUIRED
  fun placeOrder() {
    paymentService.charge()  // 같은 트랜잭션에 참여
  }
}

@Service
class PaymentService {
  @Transactional  // REQUIRED
  fun charge() {
    // 바깥 트랜잭션에 그대로 참여
  }
}
```

### 물리 트랜잭션과 논리 트랜잭션

`REQUIRED`로 참여한 내부 메서드는 **자기만의 트랜잭션을 갖는 것이 아닙니다**. Spring은 이런 상황을 **물리 트랜잭션(physical transaction) = 1개**, **논리 트랜잭션(logical transaction) = 2개**로 설명합니다.

- **물리 트랜잭션**: 실제 DB 커넥션 수준의 트랜잭션. 커밋/롤백의 단위
- **논리 트랜잭션**: Spring이 참여 여부를 추적하기 위한 논리적 경계

여기서 생기는 중요한 규칙이 하나 있습니다. **어떤 논리 트랜잭션이 한 번이라도 "롤백 전용(rollback-only)"으로 마킹되면, 전체 물리 트랜잭션이 롤백됩니다**.

### 왜 `try-catch`로 잡았는데도 롤백되나요?

바깥 서비스에서 내부 서비스의 예외를 잡으면 로직은 이어지지만, **내부 메서드가 빠져나오는 순간 Spring은 현재 트랜잭션에 "rollback-only" 플래그를 찍어둡니다**. 그래서 바깥이 아무 문제 없이 끝나도, 커밋 시점에 `UnexpectedRollbackException`이 발생합니다.

```kotlin
@Transactional
fun placeOrder() {
  try {
    paymentService.charge()  // 내부에서 예외, rollback-only 마킹
  } catch (e: Exception) {
    // 예외는 잡았지만 이미 rollback-only 상태
  }
  // 커밋 시점: UnexpectedRollbackException
}
```

이 동작을 피하려면 내부 메서드를 **`REQUIRES_NEW`로 분리**해 독립된 물리 트랜잭션으로 만들거나, 예외가 나지 않게 구조를 바꿉니다.

## Phase 4. `REQUIRES_NEW` — 독립된 물리 트랜잭션

### 동작

`REQUIRES_NEW`는 **항상 새로운 물리 트랜잭션**을 시작합니다. 바깥에 트랜잭션이 있으면 **일시 정지(`suspend`)** 시킨 다음, 내부 메서드가 끝나면 다시 이어갑니다.

```kotlin
@Service
class OrderService(
  private val auditService: AuditService
) {
  @Transactional
  fun placeOrder() {
    // 주문 처리 ...
    try {
      auditService.logOrderEvent()
    } catch (e: Exception) {
      // 감사 로그 실패는 주문 실패로 이어지면 안 됨
    }
    // 주문 트랜잭션은 그대로 이어짐
  }
}

@Service
class AuditService {
  @Transactional(propagation = REQUIRES_NEW)
  fun logOrderEvent() { ... }
}
```

위 구조는 **바깥(주문)과 안쪽(감사 로그)이 독립된 커밋 단위**로 동작합니다. 감사 로그가 실패해도 주문 커밋에 영향이 없습니다.

### 함정 1 — 커넥션 두 개를 동시에 씁니다

바깥 트랜잭션을 **일시 정지**한다고 해서 커넥션을 반납하는 것은 아닙니다. Spring은 바깥의 커넥션을 **그대로 물고 있는 상태**에서 내부 메서드에 **새 커넥션**을 추가로 할당합니다. 즉 **`REQUIRES_NEW` 호출 한 번당 커넥션 두 개**를 동시에 사용합니다.

이 점이 [커넥션 풀 글](/posts/12-database-connection-pool-fundamentals)에서 다룬 커넥션 고갈과 연결됩니다. 목록 API 안에서 루프를 돌며 `REQUIRES_NEW`를 부르면, 동시 요청 수에 비례해 커넥션 수요가 **2배 이상**으로 불어납니다.

### 함정 2 — 바깥에서 공유했던 1차 캐시가 사라집니다

영속성 컨텍스트는 물리 트랜잭션과 수명이 같습니다. `REQUIRES_NEW`로 새 트랜잭션이 열리면 **그 안에서는 전혀 다른 영속성 컨텍스트**가 동작합니다. 바깥에서 로딩했던 엔티티는 내부 메서드에서 보면 **서로 다른 인스턴스**이거나 아예 안 보입니다. 영속성 컨텍스트의 동일성 보장이 `REQUIRES_NEW` 경계에서 끊어진다는 것을 염두에 둬야 합니다.

### 언제 쓰기 좋은가요?

- **감사 로그, 통계 기록처럼 실패해도 본 업무가 계속돼야 하는 경우**
- **외부 시스템 호출이 끼어 있어 바깥과 커밋 시점을 분리하고 싶을 때**
- **일부 작업이 성공해야 하는 batch 처리에서 실패 건만 스킵하고 싶을 때**

## Phase 5. `NESTED` — 세이브포인트로 부분 롤백

### 동작

`NESTED`는 **같은 물리 트랜잭션 안에서 세이브포인트(`SAVEPOINT`)** 를 만들고 실행합니다. 내부에서 예외가 나면 그 세이브포인트까지만 롤백되고, 바깥 트랜잭션은 계속 진행합니다.

```text
BEGIN
  ├─ SAVEPOINT sp1
  │    └─ inner method 작업
  │        예외 시: ROLLBACK TO SAVEPOINT sp1
  ├─ 바깥 메서드 작업 계속
COMMIT
```

### `REQUIRES_NEW`와 무엇이 다른가요?

| 관점 | `REQUIRES_NEW` | `NESTED` |
|------|---------------|----------|
| 물리 트랜잭션 | 새로 생성 | **같은 트랜잭션** |
| 커넥션 | 두 개 동시 사용 | 하나 공유 |
| 내부 커밋/롤백 | 독립 | **세이브포인트만** 롤백 |
| 바깥이 롤백되면 | 내부는 영향 없음 | 내부도 같이 롤백 |

### 전제 조건

`NESTED`는 **JDBC 드라이버가 세이브포인트를 지원**해야 동작합니다. 대부분의 관계형 DB는 지원합니다.

`JpaTransactionManager`도 `NESTED` 자체는 지원하지만, 기본값이 **`nestedTransactionAllowed=false`** 로 꺼져 있습니다. 켜더라도 **세이브포인트는 JDBC 커넥션 수준에서만 동작**하기 때문에, 롤백 시점에 **`EntityManager`의 1차 캐시 상태는 되돌아가지 않습니다**. 영속성 컨텍스트 관점에서는 부분 롤백이 깔끔하게 이루어지지 않으므로, JPA 환경에서는 `NESTED`보다 **`REQUIRES_NEW`로 트랜잭션을 분리**하는 편이 안전합니다. 실무에서 `NESTED`는 **JDBC 기반 반복 처리 중 일부만 스킵**하는 batch job에서 가끔 쓰입니다.

## Phase 6. 롤백 규칙 — 기본은 `RuntimeException`만

### 기본 동작

Spring은 `@Transactional`의 기본 롤백 규칙을 다음처럼 정합니다.

- **`RuntimeException`과 `Error`** — 롤백
- **`Checked Exception` (Java의 `IOException` 등)** — **롤백하지 않음**

이 규칙은 EJB 시대부터 이어진 관례로, Spring도 그대로 유지합니다.

### 왜 Checked Exception은 커밋되나요?

Spring 레퍼런스의 설명을 요약하면, Checked Exception은 **비즈니스 로직이 예측한 예외**로 간주하기 때문입니다. "환불 가능 금액 초과"처럼 의도된 예외까지 롤백하지 않도록 기본값을 잡은 것입니다. 실무에서는 이 기본값이 낯설게 느껴질 때가 많아 주의가 필요합니다.

### `rollbackFor` / `noRollbackFor`로 규칙 확장

기본 규칙을 바꾸려면 애너테이션에 명시합니다.

```kotlin
@Transactional(rollbackFor = [Exception::class])
fun transfer() { ... }

@Transactional(noRollbackFor = [NotificationException::class])
fun placeOrder() { ... }
```

Kotlin에서는 **예외를 명시적으로 `throw`해도 컴파일러가 Checked/Unchecked를 구분하지 않습니다**. 그래서 Kotlin 코드가 Java 라이브러리의 Checked Exception을 재던지면 런타임에 롤백이 안 되는 경우가 생깁니다. Kotlin 프로젝트에서 **`rollbackFor = Exception::class` 를 기본값처럼 쓰는 관습**이 있는 이유가 이 때문입니다.

### 예외를 잡고 삼키면?

예외가 `@Transactional` 메서드 **밖으로 빠져나오지 않으면** Spring은 예외 자체를 인식하지 못합니다. 이 경우 롤백되지 않고 그대로 커밋됩니다. 그러나 Phase 3에서 본 것처럼 **내부 `REQUIRED` 메서드가 rollback-only를 이미 찍어뒀다면**, 바깥에서 예외를 삼켜도 커밋 시점에 `UnexpectedRollbackException`이 납니다.

## Phase 7. `readOnly`와 `timeout` — 힌트와 실제 동작

### `readOnly = true`

`@Transactional(readOnly = true)`는 "이 트랜잭션은 데이터를 바꾸지 않습니다"라는 **힌트**입니다. Spring이 강제로 막지는 않지만 여러 계층에서 최적화에 사용됩니다.

- **Hibernate**: `FlushMode`를 `MANUAL`로 바꿔 flush를 건너뜁니다. 변경 감지를 생략해 성능에 유리합니다
- **JDBC 드라이버**: 커넥션에 `setReadOnly(true)` 를 호출합니다. DB별로 내부 최적화가 다릅니다
- **DB 라우팅**: `AbstractRoutingDataSource`로 읽기 전용 트랜잭션을 **리드 레플리카로 분기**하는 패턴의 훅으로 자주 쓰입니다

### `timeout`

```kotlin
@Transactional(timeout = 5)  // 5초
```

트랜잭션이 이 시간을 넘으면 `TransactionTimedOutException`이 발생하며 롤백됩니다. 이 값은 **트랜잭션 매니저의 모니터링 쪽에서 검사**되는 것이라, **DB의 `lock wait timeout`** 과는 다른 레이어입니다. 둘 다 타임아웃이 될 수 있으니, 장시간 대기가 의심되면 두 설정을 함께 봐야 합니다.

### `isolation`

Spring의 `@Transactional(isolation = ...)`은 격리 수준을 트랜잭션 시작 시점에 설정합니다. DB에 따라 지원 여부가 다릅니다. 격리 수준 자체의 동작은 [격리 수준 글](/posts/07-transaction-isolation-levels)에서 자세히 다뤘습니다.

## Phase 8. 실무에서 자주 만나는 함정

### 1. 전파 속성은 **프록시를 거칠 때만** 동작합니다

`@Transactional`은 Spring AOP 프록시 기반이라 **같은 클래스 안에서 메서드를 직접 호출하면 프록시를 거치지 않습니다**. 즉 `REQUIRES_NEW`로 바꿨어도 같은 클래스 내 `self-invocation`이면 **그냥 `REQUIRED`처럼 동작**합니다. 이 주제는 다음 글에서 깊게 다룹니다.

### 2. `REQUIRES_NEW`를 루프 안에서 쓰기

```kotlin
@Transactional
fun processBatch(orders: List<Order>) {
  orders.forEach { o ->
    try {
      innerService.handle(o)  // @Transactional(propagation = REQUIRES_NEW)
    } catch (e: Exception) { ... }
  }
}
```

이 구조는 주문 N건마다 **새 트랜잭션과 새 커넥션**을 쓰고, 바깥 커넥션까지 동시에 물고 있습니다. 동시 요청 수에 따라 커넥션 풀이 금방 고갈됩니다. batch 처리는 **트랜잭션 경계를 batch 단위**로 잡거나, 실패 허용 건만 별도 DB 연결로 분리하는 편이 안전합니다.

### 3. 외부 API 호출을 트랜잭션 안에서 하기

외부 HTTP 호출은 응답이 느리거나 멈출 수 있습니다. 그 동안 **DB 커넥션은 그대로 점유**됩니다. 외부 호출은 **가능하면 트랜잭션 밖**에서 하고, 내부 상태 변경만 트랜잭션 안에서 처리합니다. OSIV가 기본값이라면 이 문제가 컨트롤러 레이어까지 번진다는 점도 기억해야 합니다.

### 4. `noRollbackFor` 남용

"로그성 예외는 롤백 안 하게 해두자"라는 의도로 `noRollbackFor`를 넓게 잡으면, **데이터 일관성 문제가 생겨도 커밋**됩니다. 롤백을 막고 싶은 예외 타입은 **명확한 비즈니스 예외로 한정**하고, 시스템 예외까지 삼키지 않도록 주의합니다.

## 정리

`@Transactional`은 애너테이션 하나처럼 보이지만, **전파 속성 + 롤백 규칙 + 격리 수준 + readOnly/timeout** 이 함께 맞물려 동작합니다. 각 축의 핵심은 이렇게 줄일 수 있습니다.

| 축 | 기본값 | 기억할 점 |
|----|-------|----------|
| 전파 | `REQUIRED` | 참여 시 **rollback-only** 전파 문제 주의 |
| 새 트랜잭션 | `REQUIRES_NEW` | 커넥션 두 개, 영속성 컨텍스트 분리 |
| 세이브포인트 | `NESTED` | 드라이버/매니저 지원 필요, JPA 환경에서는 제약 많음 |
| 롤백 규칙 | `RuntimeException/Error`만 | Kotlin은 `rollbackFor = Exception::class` 관습 |
| 읽기 힌트 | `readOnly = false` | Hibernate flush 생략·리드 레플리카 라우팅 훅 |
| 타임아웃 | `-1` (무제한) | DB `lock wait timeout`과 층이 다름 |

중요한 것은 기본값 `REQUIRED` + `RuntimeException 롤백` 조합이 **대부분의 코드에서 그대로 맞다**는 것입니다. 조합을 일부러 바꿔야 하는 상황을 만났을 때, 각 옵션이 **어떤 구조적 비용을 지불하는지** 를 알면 기본값을 벗어나는 결정이 훨씬 명확해집니다.

다음 글은 이 전파 속성이 **AOP 프록시를 거치지 않으면 전부 무의미해지는 이유** — `self-invocation` 함정과 Spring의 프록시 생성 방식을 파헤칩니다.

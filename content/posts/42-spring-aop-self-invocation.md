---
title: "Spring AOP 프록시와 `self-invocation` 함정 — `@Transactional`이 왜 안 먹나요?"
date: "2026-04-26"
category: "study"
tags: ["AOP"]
excerpt: "Spring AOP가 프록시 기반으로 동작한다는 사실이 @Transactional, @Async, @Cacheable이 같은 클래스 내부 호출에서 무력화되는 원인입니다. JDK 동적 프록시와 CGLIB의 차이, self-invocation이 프록시를 우회하는 이유, 네 가지 해결책을 정리합니다."
---

## Spring AOP 프록시, 왜 알아야 하나요?

`@Transactional`을 분명히 달았는데 트랜잭션이 안 걸리는 상황을 한 번쯤 만나 봤을 겁니다.

- 같은 클래스의 `public` 메서드를 불렀는데 `@Transactional`이 **무시**됐습니다
- `@Async`를 붙인 메서드를 불렀는데 **비동기로 실행되지 않습니다**
- `@Cacheable`을 붙였는데 캐시가 **적용되지 않습니다**
- `private` 메서드에 `@Transactional`을 붙였는데 **경고도 없이 무시**됐습니다

이 네 가지 증상의 원인은 전부 하나입니다. **Spring AOP가 프록시 기반이기 때문**입니다. 프록시는 호출이 "**밖에서 들어올 때만**" 가로챌 수 있는 구조라서, 같은 객체 내부에서 메서드를 직접 호출하면 프록시를 거치지 않고 AOP가 전부 우회됩니다. 이걸 **`self-invocation` 문제**라고 부르고, `@Transactional`을 비롯한 모든 Spring AOP 기반 애너테이션이 공통으로 겪는 함정입니다.

> **기준:** 이 글은 **Spring Framework 6 / Spring Boot 3.x** 기준으로 작성합니다. AOP 프록시 동작과 self-invocation 한계는 [Spring Framework Reference — Understanding AOP Proxies](https://docs.spring.io/spring-framework/reference/core/aop/proxying.html)와 [Spring AOP](https://docs.spring.io/spring-framework/reference/core/aop.html)를 참조합니다. 트랜잭션 전파 속성은 [앞 글](/posts/41-spring-transactional-propagation)에서 다뤘고, 이 글은 그 전파 속성이 프록시를 거치지 않으면 왜 전부 무력화되는지에 초점을 맞춥니다. 코드 예시는 Kotlin + Spring Boot입니다.

## 먼저 가장 짧은 답부터 보면

- Spring AOP는 **프록시 객체**를 만들어 빈을 감쌉니다. 외부 호출은 프록시를 거치지만, **같은 객체 내부 호출은 프록시를 거치지 않습니다**
- 프록시가 없으면 `@Transactional`, `@Async`, `@Cacheable`, `@Retryable`, `@Validated` 등 **모든 AOP 기반 애너테이션이 동작하지 않습니다**
- **가장 단순한 해결책은 메서드를 다른 빈으로 분리**하는 것입니다. 한 빈 안에서 풀고 싶다면 `self` 주입, `ApplicationContext`, AspectJ 세 가지 선택지가 있지만 대부분 분리가 먼저입니다
- `private` / `final` 메서드, `static` 메서드에는 프록시가 적용되지 않습니다

## Phase 1. Spring AOP는 실제로 무엇을 만들까요?

### 핵심: 빈을 직접 쓰지 않고, 빈을 감싼 "대리 객체"를 씁니다

Spring 컨테이너가 `@Transactional`이 붙은 빈을 발견하면, **그 빈을 감싸는 프록시 객체를 대신 생성**해 컨테이너에 등록합니다. 주입 시점에 다른 빈이 받는 것은 원본이 아니라 **프록시**입니다.

```text
컨테이너 등록
  ├─ OrderService (원본 빈) — 내부 구현만 보유
  └─ OrderService$$SpringCGLIB$$0 (프록시) ← 다른 빈에 주입되는 것

프록시.placeOrder() 호출
  ├─ 트랜잭션 시작 (TransactionInterceptor)
  ├─ 원본.placeOrder() 호출
  └─ 예외 여부 확인 후 커밋/롤백
```

이 프록시가 하는 일은 두 가지입니다.

- 메서드 호출 전에 **AOP 어드바이스(advice)** 를 먼저 실행
- 그다음에 **원본 메서드**로 위임

`@Transactional`의 "트랜잭션 시작 → 원본 실행 → 커밋/롤백" 흐름은 이 어드바이스가 하는 일입니다. 프록시를 안 거치면 이 어드바이스가 **아예 실행되지 않습니다**.

### 컨테이너 관점에서 벌어지는 일

```kotlin
@Service
class OrderService {
  @Transactional
  fun placeOrder() { ... }
}

@Service
class CheckoutService(
  private val orderService: OrderService  // ← 실제로는 프록시
) {
  fun checkout() {
    orderService.placeOrder()  // 프록시 호출 → 트랜잭션 동작
  }
}
```

`CheckoutService`의 필드 타입은 `OrderService`이지만, 주입되는 인스턴스는 `OrderService$$SpringCGLIB$$0` 같은 프록시 서브클래스입니다. 그래서 `orderService.placeOrder()`는 프록시를 거쳐 트랜잭션 어드바이스를 발동시킵니다.

## Phase 2. 프록시 두 종류 — `JDK Dynamic Proxy` vs `CGLIB`

### JDK Dynamic Proxy

- **인터페이스 기반**입니다
- 빈이 인터페이스를 구현하고 있으면 기본적으로 `java.lang.reflect.Proxy`로 프록시를 만듭니다
- 프록시는 **인터페이스 타입**으로만 캐스팅 가능합니다. 구체 클래스로 캐스팅하면 `ClassCastException`이 납니다

### CGLIB (Spring이 repackage한 fork)

- **서브클래스 기반**입니다. 원본 클래스를 상속한 서브클래스를 런타임에 생성합니다
- 인터페이스가 없어도 프록시를 만들 수 있습니다
- 서브클래싱이라 **`final` 클래스와 `final` 메서드는 프록시를 만들 수 없습니다**
- Spring Framework 6은 **CGLIB을 직접 fork하여 `spring-core` 안에 repackage**해서 씁니다 (`org.springframework.cglib.*`)

### Spring Boot의 기본값

Spring Boot 2.0부터 기본값은 **CGLIB(서브클래스 방식)** 입니다. `@EnableAspectJAutoProxy(proxyTargetClass = true)` 와 같은 의미가 기본값으로 설정되어 있습니다. 인터페이스 없이 구현 클래스만 있어도 프록시가 만들어지기 때문에 대부분의 실무 환경에서 이 설정이 편합니다.

```yaml
spring:
  aop:
    proxy-target-class: true  # 기본값
```

### Kotlin에서 특히 중요한 주의점

Kotlin의 클래스는 **기본이 `final`** 입니다. 이 상태로는 CGLIB이 서브클래스를 만들 수 없어 프록시 생성이 실패합니다. Spring Boot는 이를 돕기 위해 `kotlin-spring` 플러그인을 제공합니다.

```kotlin
// build.gradle.kts
plugins {
  kotlin("plugin.spring") version "..."
}
```

이 플러그인은 `@Component`, `@Service`, `@Repository`, `@Transactional` 등이 붙은 클래스를 자동으로 `open` 으로 바꿔 줍니다. 플러그인을 빠뜨리면 트랜잭션이 "조용히" 동작하지 않는 상황을 만나게 됩니다.

## Phase 3. `self-invocation`이 왜 AOP를 건너뛸까요?

### 핵심: 프록시는 "외부에서 들어오는 호출"만 가로챌 수 있습니다

같은 객체 안에서 다른 메서드를 직접 호출하면, 그 호출은 **프록시의 메서드 테이블을 통하지 않고 JVM 레벨에서 바로 원본 객체의 메서드 포인터로 점프**합니다. 프록시가 감쌌어도 이 점프는 감쌀 방법이 없습니다.

```kotlin
@Service
class OrderService {

  fun placeOrder() {
    updateStock()  // ← self-invocation: 프록시 거치지 않음
  }

  @Transactional
  fun updateStock() {
    // 프록시를 거치지 않았기 때문에 @Transactional이 동작하지 않음
  }
}
```

`placeOrder()` 안의 `updateStock()` 호출은 **`this.updateStock()`** 과 동일합니다. 이 `this`는 프록시가 아니라 **원본 객체**입니다. 그래서 `@Transactional`이 무시됩니다.

### 그림으로 본 호출 경로

```text
외부 호출 (정상)
[외부] → [프록시] → 어드바이스 발동 → [원본.메서드]

같은 객체 내부 호출 (self-invocation)
[외부] → [프록시] → 어드바이스 발동 → [원본.placeOrder]
                                       └→ this.updateStock  ← 프록시 우회
```

두 번째 그림에서 `updateStock`에 붙은 AOP 어드바이스(`@Transactional`, `@Async` 등)는 **발동되지 않습니다**.

### 이 구조는 왜 바뀌지 않나요?

JDK 동적 프록시도 CGLIB도 **원본 객체의 메서드 포인터를 바꾸지는 않습니다**. 메서드 호출을 가로채는 장치는 **프록시 객체 위에서만** 존재합니다. 원본 객체에서 `this.메서드()`를 호출하는 것은 JVM이 프록시와 무관하게 처리하기 때문에, Spring이 개입할 틈이 없습니다.

이 한계를 원천적으로 없애려면 **AspectJ** 처럼 바이트코드를 직접 조작하는 방식이 필요합니다. 이건 Phase 4의 네 번째 해결책에서 다룹니다.

## Phase 4. 해결책 네 가지

### 1. 메서드를 다른 빈으로 분리 (거의 항상 1순위)

가장 간단하고 안전한 방법입니다. `self-invocation`이 일어나는 메서드를 **다른 빈으로 이동**시키면, 호출이 자연스럽게 프록시를 거치게 됩니다.

```kotlin
@Service
class OrderService(
  private val stockService: StockService
) {
  fun placeOrder() {
    stockService.updateStock()  // 다른 빈 호출 → 프록시 거침
  }
}

@Service
class StockService {
  @Transactional
  fun updateStock() { ... }
}
```

이 방법의 장점은 **추가 설정이 없다**는 것입니다. 단점은 "이 정도로 빈을 나눠야 하나" 하는 저항감이 생길 수 있다는 점입니다. 다만 **트랜잭션 경계가 다른 메서드를 같은 빈에 두는 것 자체가 책임 분리가 애매해진 신호**일 때가 많습니다. 분리가 구조적으로 나쁜 선택이 아닐 가능성이 큽니다.

### 2. `self` 주입 — 자기 자신을 프록시로 주입

자기 자신을 주입받아 프록시를 통해 호출합니다.

```kotlin
@Service
class OrderService(
  private val self: OrderService
) {
  fun placeOrder() {
    self.updateStock()  // self는 프록시 → 어드바이스 발동
  }

  @Transactional
  fun updateStock() { ... }
}
```

Spring 4.3부터는 이 순환 참조를 컨테이너가 자연스럽게 처리합니다. 다만 **읽는 사람을 혼란스럽게 만드는 패턴**입니다. "이 서비스가 자기 자신을 주입받는 이유가 뭐지?" 하는 질문이 반복되면, 구조를 나누는 편이 낫다는 신호입니다.

### 3. `ApplicationContext`로 프록시 빈 꺼내기

```kotlin
@Service
class OrderService(
  private val context: ApplicationContext
) {
  fun placeOrder() {
    val proxy = context.getBean(OrderService::class.java)
    proxy.updateStock()
  }

  @Transactional
  fun updateStock() { ... }
}
```

테스트 용도라면 몰라도, 애플리케이션 코드에 넣기에는 컨테이너 API가 도메인 레이어에 섞여 좋지 않습니다. 실무에서 이걸 쓰는 일은 거의 없습니다.

### 4. `AspectJ` 위빙 — 프록시 없이 바이트코드에 직접 심기

AspectJ는 **컴파일 타임** 또는 **클래스 로딩 타임**에 바이트코드를 직접 수정해 어드바이스를 심습니다. 그래서 `this.method()` 같은 내부 호출에도 어드바이스가 동작합니다.

```kotlin
@EnableTransactionManagement(mode = AdviceMode.ASPECTJ)
@EnableLoadTimeWeaving
@Configuration
class AppConfig
```

위빙 방식의 장점은 self-invocation을 비롯한 모든 제약이 사라진다는 것입니다. 단점은 **설정이 복잡하고, 빌드 시스템(`maven`/`gradle`)과 JVM 옵션에 변경**이 필요하다는 것입니다. 대부분의 프로젝트는 1번(빈 분리)으로 충분하기 때문에, AspectJ까지 도입하는 일은 드뭅니다.

## Phase 5. 같은 함정을 공유하는 다른 애너테이션

`self-invocation` 문제는 `@Transactional`만의 문제가 아닙니다. **Spring AOP 기반의 모든 애너테이션**이 같은 구조를 공유합니다.

| 애너테이션 | 역할 | self-invocation 시 증상 |
|-----------|------|------------------------|
| `@Transactional` | 트랜잭션 경계 | 트랜잭션이 아예 시작되지 않음 |
| `@Async` | 비동기 실행 | 호출 스레드에서 **동기 실행** |
| `@Cacheable` / `@CacheEvict` | 캐시 | 캐시가 적용되지 않음 |
| `@Retryable` | 재시도 | 재시도 없이 예외가 그대로 전파 |
| `@Validated` | 메서드 인자 검증 | 검증이 실행되지 않음 |
| `@PreAuthorize` / `@Secured` | 메서드 수준 보안 | 권한 체크가 걸리지 않음 |

애너테이션이 달려 있는데 **아무 동작도 하지 않는 것처럼 보일 때**는 가장 먼저 self-invocation을 의심합니다. 로그에 에러도 경고도 찍히지 않고 "조용히" 무력화되는 것이 이 문제의 특징입니다.

## Phase 6. 프록시가 아예 적용되지 않는 경우

### `private` 메서드

JDK 동적 프록시도 CGLIB도 **`private` 메서드를 가로채지 못합니다**. 서브클래스에서 접근할 수 없거나(CGLIB), 인터페이스에 존재하지 않기 때문(JDK)입니다. `private` 메서드에 `@Transactional`을 붙이면 **경고 없이 무시**됩니다.

### `final` 메서드 / `final` 클래스

CGLIB은 서브클래싱으로 동작하기 때문에 `final` 메서드와 `final` 클래스는 오버라이드할 수 없습니다. Spring Boot는 프록시 생성 실패 시 런타임 에러를 냅니다.

```text
Cannot subclass final class ...
```

Kotlin에서는 앞서 언급한 `kotlin-spring` 플러그인이 해결해 줍니다. Java에서는 클래스와 메서드에 직접 `final`을 빼야 합니다.

### `static` 메서드

Spring AOP는 **인스턴스 메서드**만 가로챕니다. `static` 메서드는 애너테이션이 붙어 있어도 프록시가 동작하지 않습니다. `static` 컨텍스트에서 트랜잭션/캐시가 필요하면 **인스턴스 메서드로 옮기거나**, 필요하면 AspectJ 위빙을 검토합니다.

### 프록시 내부에서 `this`로 호출

이 글의 핵심 주제인 self-invocation입니다. 반복하면 — **프록시가 감싸는 것은 외부에서 들어오는 호출뿐**입니다. 원본 객체 안에서 `this`로 호출하면 전부 우회합니다.

## 정리

Spring AOP 기반의 애너테이션들은 **프록시가 호출을 가로채는 구조 위에서 동작**합니다. 이 구조는 외부 호출에는 자연스럽게 들어맞지만, 같은 객체 안에서의 내부 호출에는 개입할 수 없습니다. 결과적으로 `@Transactional`, `@Async`, `@Cacheable`, `@Retryable` 같은 애너테이션이 self-invocation에서는 전부 조용히 무력화됩니다.

실무에서 가장 먼저 꺼낼 답은 **메서드를 다른 빈으로 분리**하는 것입니다. `self` 주입, `ApplicationContext`, AspectJ 위빙도 가능하지만 대부분 빈 분리보다 복잡도가 높습니다. 그리고 Kotlin 프로젝트라면 **`kotlin-spring` 플러그인**을 빠뜨리지 않도록 빌드 설정부터 확인하는 것이 안전합니다.

"분명히 애너테이션을 달았는데 아무 일도 일어나지 않는다"라는 증상을 만났을 때, 점검 순서는 거의 정해져 있습니다.

1. 프록시가 생성되어 외부에서 호출되고 있는가 (self-invocation 여부)
2. 메서드가 `public`인가, 클래스/메서드가 `final`이 아닌가
3. Kotlin이면 `kotlin-spring` 플러그인이 켜져 있는가
4. 주입되는 필드 타입이 실제 프록시를 받고 있는가 (디버거로 확인 가능)

이 네 가지만 순서대로 봐도 대부분의 "조용한 무력화"를 빠르게 찾을 수 있습니다. 다음 글은 시리즈를 JPA 쪽으로 다시 돌려서, **영속성 컨텍스트의 `flush`와 `OSIV`가 실제로 어디까지 열려 있는지**를 상세히 다룹니다.

---
title: "SOLID 원칙 완전 정복 — `SRP`, `OCP`, `LSP`, `ISP`, `DIP`를 변경 비용으로 이해하기"
date: "2026-04-20"
category: "study"
tags: ["SOLID"]
excerpt: "SOLID 다섯 원칙을 암기식 정의가 아니라 변경 비용 관점에서 풀고, Java 예제와 JDK 사례로 어디에 적용할지 정리합니다."
---

## SOLID, 왜 알아야 하나요?

객체지향 코드가 어려운 이유는 클래스 문법이 아니라 **변경이 들어왔을 때 수정 범위를 예측하기 어렵기 때문**입니다.

다음 같은 상황이 반복된다면 SOLID를 한 번 정리할 가치가 큽니다.

- 결제 수단 하나를 추가했는데 기존 `switch` 문과 테스트를 전부 다시 열어야 합니다
- 알림 방식이 바뀔 때마다 주문 서비스, 결제 서비스, 배치 코드가 함께 수정됩니다
- 부모 타입을 받는 메서드에 자식 객체를 넣었더니 `instanceof`, 예외, 우회 코드가 늘어납니다
- 테스트를 하려는데 서비스가 직접 `new` 한 DB, 메일, 외부 API 클라이언트 때문에 단위 테스트가 어려워집니다

SOLID는 코드를 보기 좋게 쪼개는 규칙이 아닙니다. **변경 축을 분리하고**, **대체 가능한 계약을 만들고**, **상위 정책이 하위 구현 세부사항에 덜 묶이게 해서 변경이 퍼지는 범위를 줄이는 설계 원칙**입니다.

> **기준:** 이 글은 SOLID를 특정 프레임워크 규칙이 아니라 **객체지향 설계 원칙**으로 설명합니다. 예시 코드는 `Java SE 23` 문법을 기준으로 작성했고, `interface`와 메서드 재정의 규칙은 [`Java Language Specification SE 23`](https://docs.oracle.com/javase/specs/jls/se23/html/), 인터페이스와 추상 클래스의 역할은 [Dev.java `Interfaces`](https://dev.java/learn/interfaces/defining-interfaces/) 및 [Oracle `Abstract Methods and Classes`](https://docs.oracle.com/javase/tutorial/java/IandI/abstract.html), 인터페이스를 타입으로 사용하는 방식은 [Dev.java `Using an Interface as a Type`](https://dev.java/learn/interfaces/interfaces-as-a-type/), 확장에 열려 있는 설계 예시는 [Dev.java `Decorating IO Streams`](https://dev.java/learn/java-io/reading-writing/decorating/) 문서를 참고했습니다.

## 먼저 가장 짧은 답부터 보면

- `SRP` — 클래스는 **한 가지 이유로만 변경**되도록 책임을 정리합니다
- `OCP` — 기존 안정 코드를 크게 흔들지 않고 **새 동작을 추가**할 수 있게 설계합니다
- `LSP` — 자식 타입은 부모 타입이 약속한 **행동 계약을 깨지 않아야** 합니다
- `ISP` — 클라이언트는 자신이 쓰지 않는 메서드에 **의존하지 않아야** 합니다
- `DIP` — 상위 정책과 하위 구현 모두 **추상화에 의존**하도록 만듭니다

중요한 점은 다섯 원칙이 따로 노는 것이 아니라는 점입니다. `SRP`로 변경 이유를 나누고, `OCP`와 `DIP`로 확장 지점을 만들고, 그 추상화가 `LSP`와 `ISP`를 만족해야 실제로 안전하게 대체할 수 있습니다.

## Phase 1. `SRP` — 한 클래스에 왜 여러 규칙이 몰리면 안 될까요?

### 핵심: 변경 이유를 하나로 묶습니다

`SRP`는 **Single Responsibility Principle**, 즉 **단일 책임 원칙**입니다. 흔히 "클래스는 한 가지 일만 해야 한다"라고 외우지만, 더 정확한 표현은 이것입니다.

> **클래스는 하나의 변경 이유만 가져야 합니다**

메서드 수가 적다고 `SRP`를 만족하는 것은 아닙니다. 반대로 메서드가 조금 많더라도 모두 같은 변경 축에 묶여 있다면 괜찮을 수 있습니다.

### 문제: 주문 서비스가 너무 많은 이유로 바뀝니다

```java
public class OrderService {

    private final OrderRepository orderRepository;
    private final PaymentClient paymentClient;
    private final MailClient mailClient;

    public OrderService(
            OrderRepository orderRepository,
            PaymentClient paymentClient,
            MailClient mailClient
    ) {
        this.orderRepository = orderRepository;
        this.paymentClient = paymentClient;
        this.mailClient = mailClient;
    }

    public void place(OrderCommand command) {
        validate(command);

        Order order = new Order(command.productId(), command.quantity(), command.price());
        order.applyDiscount(calculateDiscount(command.memberGrade()));

        orderRepository.save(order);
        paymentClient.approve(order.getId(), order.getFinalPrice());
        mailClient.sendReceipt(order.getId(), command.email());
    }

    private void validate(OrderCommand command) {
        // 입력 검증
    }

    private int calculateDiscount(MemberGrade memberGrade) {
        // 할인 정책
        return 0;
    }
}
```

겉으로 보면 "주문을 처리하는 서비스"라서 자연스러워 보입니다. 하지만 이 코드 안의 변경 이유를 보면 다릅니다.

- 주문 입력 규칙이 바뀌면 수정됩니다
- 할인 정책이 바뀌면 수정됩니다
- 결제 호출 조건이나 순서가 바뀌면 수정됩니다
- 영수증 발송 조건이 바뀌면 수정됩니다

즉, 이 클래스는 **주문이라는 하나의 유스케이스**를 수행하는 것처럼 보여도, 내부에는 검증 정책, 할인 정책, 처리 절차 같은 서로 다른 변경 이유가 한데 섞여 있습니다.

### 해결: 절차는 조합하고, 책임은 분리합니다

```java
public class PlaceOrderUseCase {

    private final OrderValidator orderValidator;
    private final DiscountPolicy discountPolicy;
    private final OrderRepository orderRepository;
    private final PaymentProcessor paymentProcessor;
    private final ReceiptSender receiptSender;

    public PlaceOrderUseCase(
            OrderValidator orderValidator,
            DiscountPolicy discountPolicy,
            OrderRepository orderRepository,
            PaymentProcessor paymentProcessor,
            ReceiptSender receiptSender
    ) {
        this.orderValidator = orderValidator;
        this.discountPolicy = discountPolicy;
        this.orderRepository = orderRepository;
        this.paymentProcessor = paymentProcessor;
        this.receiptSender = receiptSender;
    }

    public void place(OrderCommand command) {
        orderValidator.validate(command);

        Order order = new Order(command.productId(), command.quantity(), command.price());
        order.applyDiscount(discountPolicy.discount(command.memberGrade(), order));

        orderRepository.save(order);
        paymentProcessor.approve(order.getId(), order.getFinalPrice());
        receiptSender.send(order.getId(), command.email());
    }
}
```

이제 주문 흐름 자체는 `PlaceOrderUseCase`가 조합하고, 검증 규칙은 `OrderValidator`, 할인 정책은 `DiscountPolicy`, 발송 책임은 `ReceiptSender`가 맡습니다.

이 구조의 핵심은 **분업 자체가 아니라 변경 격리**입니다. 협력 객체를 주입받고 있더라도, 검증 규칙과 할인 정책, 주문 처리 절차가 한 클래스에 같이 들어 있으면 변경 이유는 여전히 섞일 수 있습니다. 이를 분리하면 할인 규칙이 바뀌어도 주문 처리 흐름 전체를 다시 열 가능성이 줄어듭니다.

> **참고:** `SRP`는 클래스를 무조건 잘게 나누라는 뜻이 아닙니다. 변경 이유가 같은 코드를 지나치게 쪼개면 오히려 읽기 어려워질 수 있습니다. 핵심 질문은 "이 코드가 왜 수정되는가?"입니다.

## Phase 2. `OCP` — 새 기능이 왜 기존 분기 코드를 계속 열게 만들면 안 될까요?

### 핵심: 확장은 추가로 하고, 핵심 흐름은 덜 건드립니다

`OCP`는 **Open-Closed Principle**, 즉 **개방-폐쇄 원칙**입니다.

- **확장에는 열려 있고**
- **수정에는 닫혀 있어야 한다**

라는 뜻입니다.

여기서 "수정 금지"를 문자 그대로 받아들이면 안 됩니다. 현실에서는 버그 수정도 하고 리팩터링도 합니다. 진짜 의미는 **새 요구사항이 들어올 때 이미 안정화된 분기 코드를 계속 뜯지 않도록 설계하자**에 가깝습니다.

### 문제: 새 결제 수단이 생길 때마다 `switch` 를 수정합니다

```java
public class PaymentService {

    public void pay(PaymentMethod method, Money amount) {
        switch (method) {
            case CARD -> requestCard(amount);
            case BANK_TRANSFER -> requestBankTransfer(amount);
            case POINT -> usePoint(amount);
        }
    }

    private void requestCard(Money amount) {
    }

    private void requestBankTransfer(Money amount) {
    }

    private void usePoint(Money amount) {
    }
}
```

처음에는 단순합니다. 하지만 `APPLE_PAY`, `GIFT_CARD`, `MOBILE_CARRIER`가 추가되기 시작하면 어떻게 될까요?

- 기존 `switch` 를 계속 수정해야 합니다
- 실수로 기존 분기를 깨뜨릴 수 있습니다
- 결제 수단별 테스트가 한 클래스에 몰립니다
- 결제 수단별 의존성도 한 클래스에 섞입니다

### 해결: 안정된 흐름과 확장되는 구현을 분리합니다

```java
public interface PaymentProcessor {
    boolean supports(PaymentMethod method);
    void pay(Money amount);
}

public final class CardPaymentProcessor implements PaymentProcessor {
    @Override
    public boolean supports(PaymentMethod method) {
        return method == PaymentMethod.CARD;
    }

    @Override
    public void pay(Money amount) {
        // 카드 결제
    }
}

public final class PointPaymentProcessor implements PaymentProcessor {
    @Override
    public boolean supports(PaymentMethod method) {
        return method == PaymentMethod.POINT;
    }

    @Override
    public void pay(Money amount) {
        // 포인트 결제
    }
}

public class CheckoutService {

    private final List<PaymentProcessor> processors;

    public CheckoutService(List<PaymentProcessor> processors) {
        this.processors = processors;
    }

    public void pay(PaymentMethod method, Money amount) {
        PaymentProcessor processor = processors.stream()
                .filter(candidate -> candidate.supports(method))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("지원하지 않는 결제 수단입니다."));

        processor.pay(amount);
    }
}
```

이제 새 결제 수단을 추가할 때 기존 `CheckoutService` 같은 핵심 흐름 코드는 거의 건드리지 않고 `PaymentProcessor` 구현을 추가하는 방향으로 갈 수 있습니다. 실제 시스템에서는 `enum`, 등록 코드, 조립 지점이 함께 바뀔 수 있지만, 변경이 한곳에 덜 퍼지게 만드는 것이 핵심입니다.

`OCP`의 핵심은 **모든 곳을 확장 가능하게 만들자**가 아닙니다. 자주 바뀌는 지점만 골라서 **계약 뒤로 밀어 넣는 것**이 중요합니다.

### JDK 예시: `Reader` 계층도 같은 방향으로 설계됩니다

Dev.java의 `Decorating IO Streams` 문서는 `Reader` 계층에서 `BufferedReader`, `LineNumberReader`가 기존 읽기 동작을 감싸서 기능을 확장하는 방식을 보여 줍니다. 즉, 기반 계약은 유지하고 새 동작을 **장식(Decorator)** 으로 추가합니다.

`OCP`는 이렇게 **안정된 추상화 + 새로운 구현 추가**라는 형태로 자주 나타납니다.

> **참고:** 확장 포인트를 너무 많이 만들면 코드가 추상화 투성이가 됩니다. 변경 가능성이 낮은 곳까지 무리하게 일반화하면 `OCP`가 아니라 과설계가 됩니다.

## Phase 3. `LSP` — 상속은 되는데 왜 대체는 안 될 수 있을까요?

### 핵심: 자식 타입은 부모 계약을 깨면 안 됩니다

`LSP`는 **Liskov Substitution Principle**, 즉 **리스코프 치환 원칙**입니다.

핵심은 간단합니다.

> **부모 타입을 쓰는 곳에 자식 타입을 넣어도 프로그램 의미가 깨지지 않아야 합니다**

여기서 중요한 것은 **문법적 대입 가능성**이 아니라 **행동의 일관성**입니다. 컴파일이 된다고 끝이 아닙니다.

### 문제: 같은 타입처럼 보이는데, 일부 구현은 계약을 더 좁힙니다

```java
public interface PaymentGateway {
    CancelResult cancel(String paymentId, Money amount);
}

public final class CardPaymentGateway implements PaymentGateway {
    @Override
    public CancelResult cancel(String paymentId, Money amount) {
        // 부분 취소 지원
        return CancelResult.success();
    }
}

public final class FullCancelOnlyGateway implements PaymentGateway {
    @Override
    public CancelResult cancel(String paymentId, Money amount) {
        throw new UnsupportedOperationException("부분 취소를 지원하지 않습니다.");
    }
}

public class RefundService {

    private final PaymentGateway paymentGateway;

    public RefundService(PaymentGateway paymentGateway) {
        this.paymentGateway = paymentGateway;
    }

    public void refundDeliveryFee(String paymentId) {
        paymentGateway.cancel(paymentId, Money.wons(3000));
    }
}
```

`RefundService`는 `PaymentGateway` 계약을 보고 "원하는 금액만큼 취소할 수 있다"라고 기대합니다.

하지만 `FullCancelOnlyGateway`를 넣으면 같은 `PaymentGateway` 타입인데도 **부분 취소라는 기존 계약을 깨고 예외를 던집니다**.

즉, 타입 시스템상으로는 대입 가능해도, 실제 행동은 부모 계약보다 더 좁아졌습니다. 이것은 하위 타입이 **더 강한 입력 조건**을 요구하는 전형적인 `LSP` 위반입니다.

### 왜 위험할까요?

상위 타입을 쓰는 코드는 보통 아래를 전제로 합니다.

- 메서드의 의미가 유지될 것
- 더 강한 입력 제한을 요구하지 않을 것
- 더 약한 결과를 돌려주지 않을 것
- 호출자가 몰랐던 예외나 특수 규칙을 갑자기 추가하지 않을 것

이 약속이 깨지면 호출부는 `instanceof`로 분기하거나, 특정 하위 타입만 따로 예외 처리하게 됩니다. 그러면 다형성의 이점이 사라집니다.

### 해결: "is-a"보다 "같은 계약을 지키는가"를 먼저 봅니다

이 문제는 보통 두 방향으로 해결합니다.

- 상위 계약을 다시 정의해서, "부분 취소 지원"과 "전체 취소만 지원"을 같은 타입으로 묶지 않습니다
- 공통점이 적다면 상속이나 단일 인터페이스를 포기하고 더 좁은 역할 계약으로 나눕니다

중요한 점은 **메서드 시그니처가 같다고 같은 계약은 아니라는 것**입니다. 상속이나 인터페이스 구현은 코드 재사용 수단이 아니라 **행동 계약을 공유하는 선언**에 가깝습니다.

> **참고:** `Java Language Specification`은 메서드 재정의 규칙을 정의하지만, `LSP`는 그 위에서 "행동이 치환 가능한가?"를 묻는 설계 원칙입니다. 즉, 문법적으로 override가 가능하다고 해서 설계적으로 안전한 것은 아닙니다.

## Phase 4. `ISP` — 왜 큰 인터페이스 하나가 오히려 재사용성을 망칠까요?

### 핵심: 쓰지 않는 메서드까지 한 계약에 묶지 않습니다

`ISP`는 **Interface Segregation Principle**, 즉 **인터페이스 분리 원칙**입니다.

핵심은 이것입니다.

> **클라이언트는 자신이 사용하지 않는 메서드에 의존하지 않아야 합니다**

인터페이스를 크게 하나만 만들면 얼핏 단순해 보입니다. 하지만 시간이 지나면 구현체마다 "이 기능은 지원 안 함"이 쌓이기 시작합니다.

### 문제: 한 인터페이스에 서로 다른 역할을 다 넣었습니다

```java
public interface NotificationChannel {
    void sendEmail(Message message);
    void sendSms(Message message);
    void sendPush(Message message);
    void sendSlack(Message message);
}

public class SlackNotificationChannel implements NotificationChannel {
    @Override
    public void sendEmail(Message message) {
        throw new UnsupportedOperationException();
    }

    @Override
    public void sendSms(Message message) {
        throw new UnsupportedOperationException();
    }

    @Override
    public void sendPush(Message message) {
        throw new UnsupportedOperationException();
    }

    @Override
    public void sendSlack(Message message) {
        // 슬랙 발송
    }
}
```

이 구조에서는 슬랙만 보내는 구현체조차 이메일, SMS, 푸시 메서드를 전부 알아야 합니다. 지원하지 않는 기능은 예외를 던지거나 빈 구현으로 버티게 됩니다.

이 순간 인터페이스는 "공통 계약"이 아니라 **억지로 묶은 메서드 묶음**이 됩니다.

### 해결: 역할 단위로 계약을 나눕니다

```java
public interface EmailSender {
    void sendEmail(Message message);
}

public interface SmsSender {
    void sendSms(Message message);
}

public interface PushSender {
    void sendPush(Message message);
}

public interface SlackSender {
    void sendSlack(Message message);
}
```

이제 이메일만 필요한 코드라면 `EmailSender`만 의존하면 됩니다. 슬랙만 보내는 구현체는 `SlackSender`만 구현하면 됩니다.

`ISP`의 핵심은 "인터페이스를 잘게 쪼개라"가 아니라 **클라이언트 관점으로 계약을 나누라**는 점입니다.

### JDK 예시: 컬렉션 계층도 역할별 인터페이스를 나눕니다

Oracle 컬렉션 문서는 `Collection`을 "최대한 일반적으로 전달할 때 쓰는 루트 계약"이라고 설명합니다. 그리고 순서/인덱스가 필요하면 `List`, 큐 연산이 필요하면 `Queue`, 양쪽 끝 연산이 필요하면 `Deque`처럼 역할별 인터페이스가 이어집니다.

즉, JDK도 모든 컬렉션 동작을 하나의 거대한 인터페이스에 몰아넣지 않습니다. **공통 분모는 얇게 두고, 추가 능력은 별도 계약으로 분리**합니다.

## Phase 5. `DIP` — 서비스가 구현체 이름을 직접 알면 왜 결합이 커질까요?

### 핵심: 정책은 구현보다 추상화에 의존합니다

`DIP`는 **Dependency Inversion Principle**, 즉 **의존성 역전 원칙**입니다.

보통 이렇게 정리합니다.

- **상위 모듈은 하위 모듈에 의존하면 안 됩니다**
- **둘 다 추상화에 의존해야 합니다**
- **추상화가 구현 세부사항에 의존하면 안 됩니다**

쉽게 말하면, "업무 흐름을 담당하는 코드"가 DB, 메일, 외부 API 구현체 이름을 직접 알지 않도록 하자는 뜻입니다.

### 문제: 서비스가 구체 구현을 직접 생성합니다

```java
public class SignupService {

    private final MysqlUserRepository userRepository = new MysqlUserRepository();
    private final SmtpWelcomeSender welcomeSender = new SmtpWelcomeSender();

    public void signup(SignupCommand command) {
        User user = new User(command.email(), command.name());
        userRepository.save(user);
        welcomeSender.send(user.getEmail());
    }
}
```

이 구조는 읽기에는 단순하지만 문제가 많습니다.

- 저장소를 바꾸면 상위 서비스가 수정됩니다
- 테스트에서 가짜 구현을 넣기 어렵습니다
- 메일 발송 실패, 재시도, 비동기 전환 같은 변화가 모두 상위 서비스에 파급됩니다

### 해결: 상위 정책은 추상 계약만 알고, 구현 선택은 바깥으로 미룹니다

```java
public interface UserRepository {
    void save(User user);
}

public interface WelcomeSender {
    void send(String email);
}

public class SignupService {

    private final UserRepository userRepository;
    private final WelcomeSender welcomeSender;

    public SignupService(UserRepository userRepository, WelcomeSender welcomeSender) {
        this.userRepository = userRepository;
        this.welcomeSender = welcomeSender;
    }

    public void signup(SignupCommand command) {
        User user = new User(command.email(), command.name());
        userRepository.save(user);
        welcomeSender.send(user.getEmail());
    }
}
```

이제 `SignupService`는 "저장한다", "환영 메시지를 보낸다"라는 **정책**만 압니다. 실제로 MySQL을 쓰는지, 메모리 저장소를 쓰는지, SMTP를 쓰는지는 바깥에서 조립합니다.

Dev.java의 `Using an Interface as a Type` 문서가 말하듯, 인터페이스는 "구현체를 숨긴 참조 타입"으로 사용할 수 있습니다. `DIP`는 이 특성을 설계 레벨로 끌어올린 것입니다.

### 조립 지점은 보통 애플리케이션 바깥쪽에 둡니다

```java
UserRepository userRepository = new MysqlUserRepository(dataSource);
WelcomeSender welcomeSender = new SmtpWelcomeSender(mailClient);

SignupService signupService = new SignupService(userRepository, welcomeSender);
```

중요한 것은 구현체가 사라지는 것이 아니라, **구현체 선택 책임이 `SignupService` 밖으로 이동한다**는 점입니다. 프레임워크를 쓴다면 이 역할을 `Spring` 같은 컨테이너가 대신할 수 있지만, 원칙 자체는 프레임워크 없이도 같습니다.

### `DIP`를 오해하면 생기는 문제

`DIP`를 "모든 클래스 앞에 무조건 인터페이스 붙이기"로 이해하면 실패합니다.

- 구현이 하나뿐이고 바뀔 가능성도 낮은데 인터페이스만 늘어납니다
- 테스트 편의만 보고 추상화했지만 실제 계약 의미는 비어 있습니다
- 구현체 이름만 숨겼을 뿐, 메서드 설계는 여전히 인프라 세부사항에 묶여 있습니다

추상화는 **변경 가능성이 있는 경계**에 둘 때 효과가 큽니다. 저장소, 외부 API, 메시지 발송, 정책 선택 같은 곳이 대표적입니다.

> **참고:** `DIP`는 `DI` 컨테이너와 같은 뜻이 아닙니다. `DI`는 의존성을 주입하는 기법이고, `DIP`는 왜 그렇게 분리해야 하는지에 대한 설계 원칙입니다.

## Phase 6. SOLID는 왜 한 세트로 같이 봐야 할까요?

SOLID는 다섯 개의 체크박스가 아니라 서로 연결된 질문들입니다.

- `SRP`가 없으면 변경 이유가 섞여서 어떤 추상화를 만들어도 경계가 흐려집니다
- `OCP`를 적용하려면 안정된 계약이 필요하고, 그 계약이 `LSP`를 만족해야 안전하게 구현을 교체할 수 있습니다
- `ISP`가 깨지면 인터페이스가 비대해져서 `DIP`로 추상화해도 쓸모 없는 메서드 의존이 남습니다
- `DIP`가 없으면 상위 정책이 하위 구현에 묶여 `OCP`가 작동하기 어려워집니다

즉, 다섯 원칙은 서로를 보완합니다. 보통 실무에서는 아래 순서로 체감됩니다.

1. 변경 이유가 섞여 보이기 시작합니다
2. 확장할 때 기존 코드를 계속 수정하게 됩니다
3. 구현을 바꾸려니 대체가 안전하지 않습니다
4. 인터페이스를 세웠더니 너무 커서 다시 분리가 필요합니다
5. 결국 정책과 구현의 의존 방향을 뒤집게 됩니다

## 한눈에 보는 SOLID 비교

SOLID를 외우는 것보다, 어떤 질문을 던져야 하는지 기억하는 편이 더 실용적입니다.

| 원칙 | 핵심 질문 | 깨질 때 보이는 신호 | 우선 검토할 해법 |
|------|-----------|--------------------|------------------|
| `SRP` | 이 클래스는 왜 수정되는가? | 하나의 클래스가 정책, 검증, 저장, 알림을 함께 가짐 | 변경 이유별 분리, 조합으로 연결 |
| `OCP` | 새 기능이 들어올 때 기존 분기 코드를 계속 수정하는가? | `switch`, `if-else`, 타입 코드 분기 반복 | 공통 계약 도입, 구현 추가로 확장 |
| `LSP` | 자식 객체를 넣어도 호출부 의미가 유지되는가? | `instanceof`, 특수 예외, 계약 깨짐 | 상속 재검토, 더 좁은 추상화 또는 조합 |
| `ISP` | 이 클라이언트가 쓰지 않는 메서드까지 알아야 하는가? | `UnsupportedOperationException`, 빈 구현 | 역할별 인터페이스 분리 |
| `DIP` | 상위 정책이 구체 구현 이름을 직접 알고 있는가? | 서비스 내부 `new`, 테스트 어려움, 구현 교체 비용 증가 | 추상 계약 의존, 외부 조립 |

## 실무에서는 이렇게 점검하면 됩니다

새 기능을 넣거나 리팩터링할 때 아래 질문만 던져도 SOLID를 꽤 실용적으로 쓸 수 있습니다.

1. **이 변경은 어느 클래스를 동시에 흔드나요?** 함께 자주 바뀌면 책임 경계를 다시 볼 때입니다.
2. **새 구현을 추가하는데 기존 안정 코드를 고쳐야 하나요?** 그렇다면 `OCP` 후보입니다.
3. **부모 타입 자리에 넣었을 때 특별 취급이 필요한가요?** 그렇다면 `LSP` 위반을 의심해야 합니다.
4. **구현체가 지원하지 않는 메서드를 억지로 들고 있나요?** 그렇다면 `ISP` 후보입니다.
5. **업무 흐름 코드가 저장소, 외부 API, 메시지 구현체 이름을 직접 아나요?** 그렇다면 `DIP` 후보입니다.

## 정리

1. **`SRP`는 클래스 크기가 아니라 변경 이유를 기준으로 봐야 합니다.**
2. **`OCP`는 모든 것을 확장 가능하게 만들라는 뜻이 아니라, 자주 바뀌는 지점을 안정된 계약 뒤로 보내자는 원칙입니다.**
3. **`LSP`는 상속 가능 여부보다 행동 계약의 유지가 핵심입니다.** 컴파일이 된다고 치환 가능한 것은 아닙니다.
4. **`ISP`는 구현체보다 클라이언트 관점에서 인터페이스를 나누자는 원칙입니다.**
5. **`DIP`는 상위 정책이 하위 구현에 끌려가지 않게 만드는 원칙입니다.** `DI`는 그 원칙을 실현하는 한 가지 수단입니다.
6. **SOLID는 다섯 개를 따로 외우기보다, "변경을 어디에 가둘 것인가"라는 하나의 질문으로 묶어 이해하는 편이 더 실용적입니다.**

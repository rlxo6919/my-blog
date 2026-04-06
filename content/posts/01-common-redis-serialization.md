---
title: "Kotlin에서 Redis 캐시가 깨지는 이유 — Jackson DefaultTyping의 함정"
date: "2026-04-06"
tags: ["Redis", "Kotlin", "Spring Boot", "Jackson"]
excerpt: "LinkedHashMap으로 역직렬화되는 문제, START_OBJECT vs START_ARRAY 에러를 만났다면 이 글이 도움이 됩니다."
---

## 이런 에러를 만나셨나요?

Spring Boot + Kotlin 환경에서 Redis 캐시를 쓰다가 이런 경험, 한 번쯤 있지 않으신가요?

- 캐싱한 객체가 `LinkedHashMap`으로 돌아온다
- `ClassCastException: LinkedHashMap cannot be cast to ...`
- `START_OBJECT` vs `START_ARRAY` 불일치 에러

이커머스 백엔드에서 수십 개의 캐시를 운영하며 이 문제들을 모두 겪었습니다. 기본 JDK 직렬화는 데이터를 눈으로 확인할 수 없고, 클래스 버전이 바뀌면 역직렬화가 깨지기 쉽습니다. 이 글에서는 **기본 Java 직렬화 → JSON 기반 다형성 직렬화**로 단계적으로 개선한 과정과, Kotlin의 `final` 클래스 특성 때문에 `DefaultTyping.NON_FINAL`이 동작하지 않는 문제를 어떻게 해결했는지 공유합니다.

---

## Phase 1: JSON 직렬화 도입

### 문제: Redis에 뭐가 들어있는지 모르겠다

기본 JDK 직렬화는 바이너리 형태로 저장되어 Redis CLI에서 내용을 확인할 수 없었습니다.

```kotlin
// 변경 전 — 값 직렬화 설정 없음 → JDK 기본 직렬화
@Bean
fun defaultRedisCacheConfiguration(): RedisCacheConfiguration =
    RedisCacheConfiguration.defaultCacheConfig(Thread.currentThread().contextClassLoader)
        .serializeKeysWith(
            RedisSerializationContext.SerializationPair.fromSerializer(StringRedisSerializer())
        )
```

### 해결: GenericJackson2JsonRedisSerializer 도입

Spring에서 관리하는 `ObjectMapper`를 그대로 사용하기 위해, 기존 빈을 주입받아 `GenericJackson2JsonRedisSerializer`에 전달했습니다:

```kotlin
@Bean
fun defaultRedisCacheConfiguration(objectMapper: ObjectMapper): RedisCacheConfiguration =
    RedisCacheConfiguration.defaultCacheConfig(Thread.currentThread().contextClassLoader)
        .serializeKeysWith(
            RedisSerializationContext.SerializationPair.fromSerializer(StringRedisSerializer())
        )
        .serializeValuesWith(
            RedisSerializationContext.SerializationPair.fromSerializer(
                GenericJackson2JsonRedisSerializer(objectMapper)
            )
        )
```

이것만으로도 Redis CLI에서 데이터를 JSON으로 직접 확인할 수 있게 되었고, 디버깅이 훨씬 수월해졌습니다.

> **참고:** `GenericJackson2JsonRedisSerializer()`를 인자 없이 사용하면 내부적으로 `DefaultTyping.EVERYTHING`이 활성화된 ObjectMapper를 생성합니다. 하지만 프로젝트의 Jackson 설정(모듈, 날짜 포맷 등)을 유지하려면 기존 ObjectMapper를 주입받아야 하고, 이 경우 default typing이 빠지면서 Phase 2의 문제가 발생합니다.

### 직렬화 전략 분리

모든 캐시가 JSON 직렬화를 사용할 필요는 없었습니다. 단순 문자열 데이터를 저장하는 캐시에는 String 직렬화가 더 효율적이므로, 두 가지 전략으로 분리했습니다:

```kotlin
// 복잡한 객체용 (JSON)
@Bean
fun defaultRedisCacheConfiguration(): RedisCacheConfiguration { ... }

// 단순 데이터용 (String)
@Bean
fun stringSerializationRedisCacheConfiguration(): RedisCacheConfiguration =
    RedisCacheConfiguration.defaultCacheConfig(Thread.currentThread().contextClassLoader)
        .serializeKeysWith(
            RedisSerializationContext.SerializationPair.fromSerializer(StringRedisSerializer())
        )
        .serializeValuesWith(
            RedisSerializationContext.SerializationPair.fromSerializer(StringRedisSerializer())
        )
```

**적용 기준:**

| 직렬화 전략 | 대상 | 예시 |
|------------|------|------|
| JSON (default) | 복잡한 객체 구조 | 중첩된 도메인 객체, 컬렉션 포함 응답 |
| String | 단순 값, ID 목록 | 이미지 URL, 플래그 값 등 |

---

## Phase 2: 다형성 타입 지원 — 그리고 Kotlin의 함정

### 문제: 객체가 LinkedHashMap으로 돌아온다

JSON 직렬화를 도입한 후, 복잡한 객체를 캐싱할 때 **역직렬화 실패** 문제가 발생했습니다.

```json
{"id": "abc123", "title": "Featured Items", "images": ["img1.jpg"]}
```

위처럼 저장된 데이터를 꺼내면, Jackson이 타입 정보를 알 수 없어 모든 필드가 `LinkedHashMap`으로 변환되었습니다.

### 첫 번째 시도: NON_FINAL — 실패

Jackson의 `DefaultTyping`을 활성화해서 타입 정보를 JSON에 포함시키기로 했습니다:

```kotlin
val polymorphicTypeValidator = BasicPolymorphicTypeValidator.builder()
    .allowIfSubType("com.mycompany.product")
    .build()

val typedObjectMapper = objectMapper.copy()
    .activateDefaultTyping(polymorphicTypeValidator, ObjectMapper.DefaultTyping.NON_FINAL)
```

**결과: 또 실패.**

여기서 Kotlin의 특성이 문제가 됩니다. **Kotlin의 모든 클래스는 기본적으로 `final`입니다.** `open` 키워드를 명시하지 않으면 상속이 불가능하며, `data class`도 예외가 아닙니다.

`NON_FINAL`은 이름 그대로 **final이 아닌 클래스에만** 타입 래퍼를 추가합니다. Kotlin data class는 전부 final이므로, 타입 정보가 JSON에 포함되지 않았습니다.

```
// 기대한 것
["com.mycompany.product.CachedProduct", {"id": "abc123", ...}]

// 실제 결과 (NON_FINAL)
{"id": "abc123", ...}  // 타입 정보 없음!
```

역직렬화 시 `START_OBJECT` vs `START_ARRAY` 불일치 에러가 발생했습니다.

### 해결: EVERYTHING

```kotlin
val typedObjectMapper = objectMapper.copy()
    .activateDefaultTyping(
        polymorphicTypeValidator,
        ObjectMapper.DefaultTyping.EVERYTHING  // NON_FINAL → EVERYTHING
    )
```

`EVERYTHING`은 final 클래스를 포함한 **모든 타입**에 타입 래퍼를 추가합니다:

```json
["com.mycompany.product.CachedProduct", {"id": "abc123", "title": "Featured Items"}]
```

---

## Phase 3: PolymorphicTypeValidator 확장

### 문제: 이번엔 Java 표준 타입이 터진다

`EVERYTHING` 타이핑을 적용하자 이번에는 **표준 Java 타입**의 역직렬화가 실패했습니다.

```
com.fasterxml.jackson.databind.exc.InvalidTypeIdException:
Could not resolve type id 'java.util.Collections$SingletonList'
```

`BasicPolymorphicTypeValidator`가 프로젝트 패키지만 허용하고 있었기 때문입니다. 단계적으로 허용 범위를 확장하여 최종적으로 다음과 같은 구성이 되었습니다:

```kotlin
@Bean
fun defaultRedisCacheConfiguration(objectMapper: ObjectMapper): RedisCacheConfiguration {
    val polymorphicTypeValidator = BasicPolymorphicTypeValidator.builder()
        .allowIfSubType("com.mycompany.product") // 프로젝트 도메인 객체
        .allowIfSubType("java.util")             // ArrayList, HashMap 등 컬렉션
        .allowIfSubType("java.time")             // LocalDateTime, Instant 등
        .allowIfSubType("java.math")             // BigDecimal (가격 데이터)
        .allowIfSubType("java.lang")             // String, Integer 등 기본 타입
        .allowIfSubType("kotlin")                // Kotlin 표준 라이브러리
        .build()

    val typedObjectMapper = objectMapper.copy()
        .activateDefaultTyping(polymorphicTypeValidator, ObjectMapper.DefaultTyping.EVERYTHING)

    return RedisCacheConfiguration
        .defaultCacheConfig(Thread.currentThread().contextClassLoader)
        .serializeKeysWith(
            RedisSerializationContext.SerializationPair.fromSerializer(StringRedisSerializer())
        )
        .serializeValuesWith(
            RedisSerializationContext.SerializationPair.fromSerializer(
                GenericJackson2JsonRedisSerializer(typedObjectMapper)
            )
        )
}
```

**각 타입이 필요한 이유:**
- `java.util`: `Collections.singletonList()`, `Collections.unmodifiableList()` 등 내부 구현체
- `java.time`: 날짜/시간 필드 (주문일, 생성일 등)
- `java.math`: `BigDecimal` (가격 데이터)
- `java.lang`: `String`, `Long` 등 프리미티브 래퍼
- `kotlin`: Kotlin 전용 타입들

---

## 개선 결과

| 항목 | 개선 전 | 개선 후 |
|------|--------|--------|
| 직렬화 방식 | JDK 기본 직렬화 | JSON (타입 정보 포함) |
| 디버깅 | Redis CLI로 확인 불가 | JSON으로 바로 확인 가능 |
| 타입 안전성 | 역직렬화 시 Object 타입 | 정확한 타입 복원 |
| Kotlin 호환성 | data class 문제 발생 | EVERYTHING으로 완전 지원 |
| 캐시 전략 | 일률적 직렬화 | JSON / String 이원화 |

---

## 교훈

1. **Kotlin + Jackson의 DefaultTyping은 반드시 `EVERYTHING`을 사용하라.** `NON_FINAL`은 Kotlin의 기본 final 특성과 충돌한다.

2. **PolymorphicTypeValidator는 점진적으로 확장하라.** 필요한 패키지만 허용하면서 보안성을 유지할 수 있다.

3. **캐시 직렬화 전략은 데이터 특성에 따라 분리하라.** 복잡한 객체는 JSON, 단순 값은 String으로 이원화하면 성능과 관리 효율성 모두 잡을 수 있다.

4. **ObjectMapper는 Spring에서 주입받아 사용하라.** `copy()`로 복제하면 기존 Jackson 설정(모듈, 시간 포맷 등)을 유지하면서 추가 설정만 적용할 수 있다.


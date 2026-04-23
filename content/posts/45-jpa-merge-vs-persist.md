---
title: "JPA `merge` vs `persist` 완전 정복 — `detached` 엔티티를 어떻게 다뤄야 하나요?"
date: "2026-04-29"
category: "study"
tags: ["영속성 컨텍스트"]
excerpt: "persist와 merge가 실제로 하는 일, Spring Data JPA의 save가 왜 둘을 섞어 쓰는지, detached 엔티티를 save로 저장할 때 생기는 구조적 위험, 그리고 find + modify 패턴이 왜 권장되는지를 정리합니다."
---

## `merge`와 `persist`, 왜 정확히 알아야 하나요?

Spring Data JPA의 `save()` 한 줄로 저장을 끝내는 코드는 많습니다. 그런데 조금만 상황이 복잡해지면 이런 증상이 나타납니다.

- 수정하려고 `save()`를 불렀는데 `UPDATE`가 아니라 **`INSERT`가 튀어나옵니다**
- 일부 필드만 바꿨는데 `UPDATE`에 **모든 컬럼**이 포함됩니다
- `save()`가 건별로 `SELECT` 를 먼저 내보내 **쿼리 수가 예상의 두 배**가 됩니다
- DTO로 받은 요청을 `User` 엔티티로 바꿔 `save()`했더니 **기존 컬럼 값이 `null`로 덮여버렸습니다**

이 모든 증상의 뿌리는 하나입니다. **`persist`와 `merge`가 무엇을 하는지 다르고, `save()`가 내부에서 이 두 가지를 상황에 따라 섞어 쓴다**는 것입니다. 그리고 그 안에서 `detached` 엔티티를 부주의하게 다루면 **데이터가 덮이거나 사라집니다**.

이 글은 시리즈의 마지막으로, 지금까지 쌓아온 영속성 컨텍스트·변경 감지·flush 개념을 **엔티티 상태 다루기** 관점으로 정리합니다.

> **기준:** 이 글은 **Jakarta Persistence 3.1 (JPA 3.1) 명세**와 **Hibernate 6.x**, **Spring Data JPA 3.x** 기준으로 작성합니다. `persist`/`merge` 정의는 [Jakarta Persistence 3.1 — §3.2 Entity Instance Life Cycle](https://jakarta.ee/specifications/persistence/3.1/jakarta-persistence-spec-3.1.html), Spring Data의 `save()` 구현은 [`SimpleJpaRepository.save`](https://docs.spring.io/spring-data/jpa/docs/current/api/org/springframework/data/jpa/repository/support/SimpleJpaRepository.html#save-S-) JavaDoc과 소스를 참조합니다. 영속성 컨텍스트와 엔티티 상태 전이는 [앞 글](/posts/38-jpa-persistence-context)을 전제로 합니다. 코드 예시는 Kotlin + Spring Data JPA입니다.

## 먼저 가장 짧은 답부터 보면

- **`persist(entity)`** — `new` 엔티티를 `managed`로 바꿉니다. `detached`에는 쓸 수 없습니다
- **`merge(entity)`** — `detached` 엔티티의 **내용을 새 `managed` 인스턴스에 복사**합니다. 반환값이 managed고 원본은 그대로 detached
- **Spring Data JPA의 `save()`** — 엔티티가 **새로 만든 것**이면 `persist`, 아니면 `merge`로 **분기**합니다
- `save()`로 기존 엔티티를 수정하려고 DTO → 엔티티 변환을 쓰면 **의도하지 않은 필드가 `null`로 덮일 수 있습니다**
- 실무 권장은 **`find` 로 `managed` 엔티티를 가져와 필드를 바꾸는 패턴** 입니다. `merge`는 대부분 필요 없습니다

## Phase 1. `persist`는 무엇을 하나요?

### 핵심: `new` 상태의 엔티티를 `managed`로 올립니다

```kotlin
val user = User(name = "Alice")  // new 상태, id 아직 없음
em.persist(user)                  // managed로 전이
// user.id가 채워짐 (ID 전략에 따라 INSERT 타이밍은 다름)
```

JPA 명세는 `persist`의 역할을 이렇게 정의합니다.

- 인자 엔티티를 **managed** 상태로 만듭니다
- 영속성 컨텍스트에 **같은 식별자를 가진 엔티티가 이미 있으면 `EntityExistsException`**
- **detached 엔티티에 `persist`를 호출하면** `EntityExistsException` 또는 `PersistenceException`

### 핵심 제약: `persist`는 `new`만 받는 연산

`persist`는 **아직 식별자를 가지지 않은 새 인스턴스**를 위한 API입니다. 이미 DB에 존재하는 엔티티를 "다시 persist"한다는 개념은 JPA에 없습니다. 이 제약이 뒤에서 `merge`와 역할이 갈리는 원인이 됩니다.

## Phase 2. `merge`는 무엇을 하나요?

### 핵심: `detached` 엔티티의 내용을 새 `managed` 인스턴스에 복사합니다

```kotlin
val detached = User(id = 1, name = "after")  // detached (ID만 가짐)

val managed = em.merge(detached)

detached.name = "changed"  // 반영 안 됨 (여전히 detached)
managed.name = "changed"   // 반영됨 (managed)
```

`merge`의 동작은 정확히 이렇습니다.

1. 같은 식별자의 `managed` 엔티티가 영속성 컨텍스트에 있는지 확인
2. 있으면 그 엔티티의 **필드 값들을 인자 엔티티의 값으로 덮어씀**
3. 없으면 **DB에서 `SELECT`** 해서 `managed` 상태로 로딩한 뒤, 같은 방식으로 덮어씀
4. 작업이 끝난 `managed` 인스턴스를 **반환**

### `merge`가 만드는 숨은 `SELECT`

영속성 컨텍스트에 없는 엔티티를 `merge`하면 Hibernate는 **DB에서 먼저 `SELECT`** 해서 현재 상태를 가져옵니다. 그 다음에 `UPDATE`를 판단합니다. 그래서 `merge` 한 번은 **`SELECT` + (필요 시) `UPDATE`** 두 쿼리를 만들 수 있습니다.

대량 업데이트 경로에서 `merge`를 반복하면, 의도하지 않은 `SELECT` 가 건별로 따라 붙어 성능이 선형으로 나빠집니다.

### 반환값을 꼭 써야 합니다

`merge`가 처리한 **`managed` 인스턴스는 반환값**입니다. 인자로 넘긴 엔티티는 여전히 `detached` 상태입니다. 인자를 그대로 쓰면 이후 변경이 반영되지 않습니다.

```kotlin
// ❌ 자주 하는 실수
em.merge(detached)
detached.name = "x"    // 반영 안 됨

// ✅ 올바른 사용
val managed = em.merge(detached)
managed.name = "x"
```

## Phase 3. Spring Data JPA의 `save()`는 무엇을 할까요?

### `SimpleJpaRepository.save`의 실제 로직

Spring Data JPA의 `save()`는 한 줄로 보이지만, 내부에서 **`persist`와 `merge`를 상황에 따라 분기**합니다.

```kotlin
@Transactional
override fun <S : T> save(entity: S): S {
  return if (entityInformation.isNew(entity)) {
    entityManager.persist(entity)
    entity
  } else {
    entityManager.merge(entity)  // 반환값이 managed
  }
}
```

즉 `save()`는 엔티티가 "새것"이냐 아니냐에 따라 완전히 다른 연산입니다.

### "새것"을 어떻게 판별하나요?

Spring Data JPA는 `isNew()` 판단에 다음 우선순위를 씁니다.

1. 엔티티가 **`Persistable` 인터페이스**를 구현하면 그 `isNew()`를 사용
2. 그렇지 않으면 **`@Id` 필드의 값이 `null` 또는 원시 타입의 기본값(0)** 인지 확인

이 기본 판별이 맞는 경우가 대부분입니다. 그러나 다음 상황에서는 **판단이 잘못되기 쉽습니다**.

- **`@Id` 가 `Long` 원시 타입**으로 선언된 엔티티: 0이 기본값이라 **ID를 직접 할당한 엔티티가 "새것"으로 잘못 판단**될 수 있습니다
- **애플리케이션에서 생성한 UUID/ID**로 저장하는 경우: 이미 ID가 있는데 `save()`가 `merge`로 동작해 불필요한 `SELECT` 를 내보냅니다

ID를 애플리케이션이 관리하는 패턴(이전 글의 `UUIDv7`/`Snowflake`)을 쓸 때는 `Persistable` 인터페이스를 구현해 `isNew()`를 명시적으로 지정하는 편이 안전합니다.

### `save()` 한 번에 `SELECT`가 붙는 이유

`save()`가 `merge`로 분기되면 앞서 본 대로 **`SELECT` + (변경 시) `UPDATE`** 를 수행합니다. DB에서 현재 상태를 먼저 읽는 것이 필연적입니다.

이 때문에 **"저장만 하면 된다"고 생각한 코드가 예상의 두 배 쿼리를 냅니다**. 대량 업데이트 루프에서 `save()`를 반복하면 이 비용이 선형으로 쌓입니다. 변경 감지로 충분한 경로에서는 `save()`를 부르지 않는 편이 오히려 저렴합니다.

## Phase 4. `detached` 엔티티 + `save()`의 구조적 위험

### 요청을 엔티티로 바꿔 `save()`하면?

가장 자주 하는 실수는 이 패턴입니다.

```kotlin
// 요청 DTO
data class UpdateUserRequest(val id: Long, val name: String)

// ❌ 위험한 코드
@PutMapping("/users/{id}")
fun update(@PathVariable id: Long, @RequestBody req: UpdateUserRequest) {
  val user = User(id = req.id, name = req.name)  // detached, 일부 필드만 세팅
  userRepository.save(user)                      // merge → 모든 필드를 이 값으로 덮음
}
```

`merge`는 인자 엔티티의 **모든 필드를 그대로 복사**합니다. `req.name`만 세팅하고 다른 필드는 세팅하지 않은 `detached` 엔티티를 넘기면, `merge`는 다음과 같이 동작합니다.

- `name = req.name`
- **그 외 필드 = `null` 또는 기본값**

결과적으로 **이메일, 가입일, 프로필 등 세팅하지 않은 필드가 전부 `null`로 덮입니다**. 이 버그는 테스트에서 보이지 않다가 운영에서 데이터를 망치는 전형적인 패턴입니다.

### Hibernate의 `@DynamicUpdate`가 해결해 주지 않습니다

`@DynamicUpdate`는 **변경 감지 결과에서 바뀐 컬럼만 `UPDATE`에 포함**시키는 옵션입니다. 그러나 `merge`는 **변경 감지와 무관하게 인자 엔티티의 필드 값을 전부 복사**합니다. `@DynamicUpdate`가 켜져 있어도 `merge` 경로에서는 **모든 필드가 복사된 이후의 상태**가 "현재 값"이 됩니다.

즉 `@DynamicUpdate`가 `null` 덮어씀을 막아주지 않습니다.

## Phase 5. 권장 패턴 — `find` + modify

### 구조

```kotlin
@PutMapping("/users/{id}")
@Transactional
fun update(@PathVariable id: Long, @RequestBody req: UpdateUserRequest) {
  val user = userRepository.findById(id).orElseThrow { NotFoundException() }
  user.name = req.name       // 필요한 필드만 변경
  // save() 호출 불필요: 변경 감지가 커밋 시점에 UPDATE 생성
}
```

이 패턴의 장점은 명확합니다.

- `find`로 **`managed` 엔티티**를 가져왔기 때문에 이후 변경은 **변경 감지**로 자동 반영
- **바뀐 필드만** `UPDATE` 에 포함 (`@DynamicUpdate`와 결합 시)
- `merge`가 내부에서 **덮어쓰는 위험이 원천적으로 없음**
- `SELECT` 1번 + 커밋 시점 `UPDATE` 1번으로 끝남 (`save()`의 `SELECT`+`UPDATE`와 동일하거나 적음)

### 엔티티 내부에 update 메서드

도메인 관점에서는 필드를 직접 바꾸기보다 엔티티에 update 메서드를 두는 편이 더 안전합니다.

```kotlin
@Entity
class User(
  @Id val id: Long,
  var name: String,
  var email: String
) {
  fun changeName(newName: String) {
    require(newName.isNotBlank())
    this.name = newName
  }
}

@Transactional
fun update(id: Long, req: UpdateUserRequest) {
  val user = userRepository.findById(id).orElseThrow()
  user.changeName(req.name)
}
```

이 패턴은 **어떤 필드가 어떤 조건에서만 바뀌어야 하는지**를 엔티티가 책임지게 합니다. `merge`로 외부에서 필드를 통째로 덮는 방식보다 버그 위험이 훨씬 낮습니다.

## Phase 6. 언제 `merge`가 필요한가요?

`merge`가 꼭 필요한 경우는 실무에서 제한적입니다.

### 1. 외부에서 받은 `detached` 엔티티를 그대로 써야 하는 경우

**`HttpSession`, 캐시, 또는 외부 프로세스에서 온 엔티티**를 다시 영속성 컨텍스트에 붙여야 하는 경우입니다. 대부분의 현대 API 서버는 DTO-Entity 경계를 유지하기 때문에 이 상황은 드뭅니다.

### 2. 파일 / 배치에서 읽어온 엔티티 스냅샷을 한 번에 반영

외부 파일이나 다른 DB의 스냅샷을 그대로 한 번에 반영할 때, "모든 필드를 통째로 덮는 것"이 의도일 수 있습니다. 이 경우 `merge`가 의미를 가집니다. 다만 **전체 필드를 스냅샷에 맞게 완전하게 채웠는지** 확인해야 합니다.

### 3. 그 외에는 거의 `find + modify`

앞서 본 대로 대부분의 수정 API는 **`find + modify`** 가 더 안전하고 단순합니다. "일단 save로 해보자"가 일으키는 버그의 많은 수가 이 지점에서 생깁니다.

## Phase 7. 엔티티 수명과 `equals` / `hashCode`

`detached` 엔티티와 `managed` 엔티티를 섞어 쓰다 보면 `Set`, `Map`, `HashSet` 에서 **같은 엔티티인데 `contains()`가 false**를 반환하는 상황을 만납니다. 원인은 `equals`/`hashCode` 구현 때문입니다.

### 기본값의 문제

- **`equals` 기본 구현** — 참조 동일성(`===`). `detached` 후 같은 ID로 다시 조회된 인스턴스와 같다고 보지 않습니다
- **`hashCode` 기본 구현** — 객체 헤더 기반이라 엔티티의 `identity` 와 무관

### 많이 권장되는 패턴

- `equals`와 `hashCode`를 **식별자 기반으로 구현**하되, **`id`가 아직 없을 때(`new` 상태)** 도 일관되도록 유의
- 일반적인 실무 조언은 **`id`가 있으면 id 기반으로, 없으면 `System.identityHashCode`** 로 fallback
- Lombok의 `@EqualsAndHashCode(onlyExplicitlyIncluded = true)`로 id만 포함시키는 방법이 자주 쓰임

Kotlin `data class`는 모든 필드를 `equals`/`hashCode`에 포함시키므로 **엔티티 전용으로는 권장되지 않습니다**. 엔티티는 일반 클래스로 선언하고 `equals`/`hashCode`를 식별자 기준으로 명시적으로 정의하는 편이 안전합니다.

## 정리

`persist`와 `merge`는 겹쳐 보이지만 역할이 다릅니다.

| 연산 | 받는 상태 | 하는 일 |
|------|----------|---------|
| `persist` | `new` | `managed`로 전이. `detached`에는 쓸 수 없음 |
| `merge` | `detached` / `new` | 새 `managed` 인스턴스에 **필드 전체 복사**. 기존 엔티티는 그대로 detached |
| `save()` (Spring Data) | 자동 판별 | `isNew()`면 `persist`, 아니면 `merge` |

`merge`가 갖는 본질적 위험은 **"모든 필드를 덮는다"** 는 데 있습니다. 요청 DTO를 엔티티로 변환해 `save()`하는 패턴이 이 위험의 정면에 서 있습니다. 그래서 실무 원칙은 단순합니다.

- **수정은 `find + modify`**
- **생성은 새 인스턴스 + `persist` 또는 `save`**
- **`merge`는 구조가 그것을 요구할 때만**

이 시리즈에서 정리한 여덟 편이 맞물리면, JPA가 "마법"처럼 느껴지던 부분들이 **영속성 컨텍스트라는 단일 구조에서 파생된 일관된 동작**으로 읽힙니다. 이후 실무에서 만나는 대부분의 증상은 다음 네 질문 안에서 답이 나옵니다.

1. **엔티티가 지금 어떤 상태인가?** (`new` / `managed` / `detached` / `removed`)
2. **영속성 컨텍스트가 열려 있는가?** (트랜잭션 경계, OSIV, self-invocation)
3. **Fetch와 배치 전략이 이 쿼리에 맞는가?**
4. **필드를 `find + modify` 로 바꾸고 있는가, 아니면 `merge` 로 덮고 있는가?**

이 네 질문을 쓸 수 있게 된 지점이 Spring/JPA를 **튜토리얼이 아닌 구조로** 이해하는 출발점입니다.

---
title: "Dirty Read와 Phantom Read는 실제로 언제 발생할까 — 교과서와 실무 사이의 간격"
date: "2026-04-14"
category: "study"
tags: ["동시성 제어", "트랜잭션"]
excerpt: "`Dirty Read`가 왜 실무에서 거의 안 보이는지, `Phantom Read`가 왜 MySQL InnoDB에서는 다른 문제처럼 관찰되는지 실제 발생 조건 중심으로 정리합니다."
---

## Dirty Read와 Phantom Read, 왜 헷갈릴까요?

[트랜잭션 격리 수준](/posts/07-transaction-isolation-levels), [MVCC](/posts/09-mvcc-fundamentals), [REPEATABLE READ 실전 사례](/posts/22-repeatable-read-refund-troubleshooting) 글까지 읽고 나면 이런 질문이 남습니다.

- `Dirty Read`는 교과서에서 꼭 나오는데, 왜 실무에서는 거의 못 볼까요?
- `Phantom Read`는 분명 배웠는데, MySQL InnoDB에서는 왜 "행이 갑자기 늘어났다"보다 다른 형태로 체감될까요?
- 내가 겪은 문제는 정말 `Dirty Read`나 `Phantom Read`였을까요, 아니면 다른 동시성 문제였을까요?

핵심은 **이상 현상 이름과 실무에서 관찰되는 증상이 꼭 같은 모습으로 나타나지 않는다**는 점입니다.

- `Dirty Read`는 **발생 조건 자체가 꽤 제한적**입니다
- `Phantom Read`는 **같은 트랜잭션 안에서 같은 범위 조건을 반복 조회**해야 의미가 있습니다
- MySQL InnoDB의 기본 격리 수준인 `REPEATABLE READ`에서는, 고전적인 `Phantom Read`보다 **스냅샷 읽기, 범위 락 대기, 데드락**처럼 보이는 경우가 더 많습니다

이 글은 MySQL InnoDB를 기준으로, `Dirty Read`와 `Phantom Read`가 **실제로 언제 발생하고**, 왜 **실무에서는 다른 문제처럼 보이는지**를 정리합니다.

## 먼저 가장 짧은 답부터 보면

| 현상 | 실제 발생 조건 | 실무에서 잘 안 보이거나 다르게 보이는 이유 |
|------|----------------|-------------------------------------------|
| `Dirty Read` | 다른 트랜잭션이 아직 커밋하지 않은 값을 읽음 | 보통 `READ UNCOMMITTED`가 필요하고, 운영 기본값은 대개 그보다 높습니다 |
| `Phantom Read` | 같은 트랜잭션이 같은 조건 범위 조회를 두 번 했는데, 중간에 다른 트랜잭션이 조건에 맞는 행을 추가/삭제/변경해 결과 집합이 바뀜 | MySQL InnoDB의 `REPEATABLE READ`에서는 일반 `SELECT`는 스냅샷을 보고, 범위 잠금 읽기는 새 행 진입을 막는 쪽으로 동작합니다 |
| 실무에서 더 자주 보는 모습 | `stale snapshot`, 범위 락 대기, 데드락, 중복 부작용 | 이상 현상 이름보다 DB 엔진의 구현 방식이 운영 증상에 더 직접적으로 드러납니다 |

가장 짧게 줄이면 이렇습니다.

- **`Dirty Read`는 낮은 격리 수준을 일부러 열어둬야 잘 발생합니다**
- **`Phantom Read`는 같은 트랜잭션 안에서 범위 조회를 반복해야 의미가 있습니다**
- **MySQL InnoDB에서는 팬텀보다 "왜 나는 예전 결과를 계속 보지?" 또는 "왜 저 `INSERT`가 대기하지?"로 만나는 경우가 더 많습니다**

## Phase 1. `Dirty Read`는 정확히 언제 발생할까?

### 문제: "값이 달라졌다"와 `Dirty Read`를 같은 말로 쓰기 쉽다

실무에서 이런 표현을 자주 봅니다.

- "방금 다른 요청이 값을 바꿔서 결과가 달라졌어요"
- "캐시와 DB가 잠깐 달라 보여요"
- "`read replica`에서 예전 값이 보여요"

하지만 이 셋은 `Dirty Read`가 아닐 수 있습니다. `Dirty Read`는 정의가 더 엄격합니다.

> **다른 트랜잭션이 아직 커밋하지 않은 값을 읽었고, 그 값이 나중에 롤백될 수도 있는 상태**

즉, **세상에 최종적으로 존재하지 않을 수도 있는 값을 읽어야** `Dirty Read`입니다.

### 예시: 커밋 전 잔액을 읽어버리는 경우

```text
트랜잭션 A                          트랜잭션 B
─────────────────────────────────────────────────
UPDATE accounts
SET balance = 0
WHERE id = 1;
                                    SELECT balance
                                    FROM accounts
                                    WHERE id = 1;
                                    → 0
ROLLBACK;
                                    → 실제로는 존재하지 않을 값 기준으로 처리
```

여기서 `트랜잭션 B`가 읽은 `0`은 커밋된 적이 없습니다. 이것이 `Dirty Read`입니다.

### 실무에서 언제 진짜로 보일까?

실무에서 `Dirty Read`가 보이려면 보통 아래 조건이 필요합니다.

1. **격리 수준이 `READ UNCOMMITTED`여야 합니다**
2. 또는 그와 비슷하게 **커밋 전 데이터를 읽게 만드는 설정/힌트**가 있어야 합니다
3. 그리고 읽은 쪽이 **정말로 커밋 전 값을 봐야** 합니다

MySQL InnoDB 기본값은 `REPEATABLE READ`입니다. 그래서 별도 설정 없이 운영하면 `Dirty Read`는 거의 나오지 않습니다.

실제로는 이런 경우에 가끔 후보가 됩니다.

- 정확도보다 대기 회피를 우선해서 **낮은 격리 수준으로 돌린 운영성 조회**
- 통계성 배치에서 **대략적인 값만 보겠다**고 `READ UNCOMMITTED`를 쓴 경우
- 팀이 의도를 잘 모른 채 **세션 격리 수준을 낮춘 뒤 그대로 유지**한 경우

반대로 아래는 `Dirty Read`가 아닙니다.

- 다른 요청이 먼저 커밋해서 값이 달라진 것
- 읽기 복제본 지연 때문에 예전 값이 보이는 것
- 캐시가 늦게 갱신되어 DB와 잠시 어긋나는 것

판단 기준은 간단합니다.

- **내가 읽은 값이 커밋 전 값이었는가**
- **그 값이 나중에 롤백될 수 있었는가**

이 둘이 아니면 보통 `Dirty Read`가 아닙니다.

## Phase 2. `Phantom Read`는 정확히 언제 발생할까?

### 문제: 결과가 달라졌다고 다 `Phantom Read`는 아니다

`Phantom Read`도 실무에서 자주 과하게 넓게 쓰입니다.

- 첫 번째 API 요청에서는 목록이 10건이었는데, 두 번째 요청에서는 11건입니다
- 페이지 1을 보고 페이지 2로 갔더니 중간에 새 글이 끼어들었습니다
- 다른 사용자가 주문을 추가해서 카운트가 달라졌습니다

이 중 많은 경우는 **고전적인 `Phantom Read`가 아닙니다**. 왜냐하면 `Phantom Read`는 보통 **같은 트랜잭션 안에서 같은 조건 조회를 반복**해야 하기 때문입니다.

정의는 이렇습니다.

> **같은 트랜잭션이 같은 조건으로 두 번 조회했는데, 그 사이에 다른 트랜잭션이 조건에 맞는 행을 추가/삭제/변경해서 결과 집합이 달라지는 현상**

즉, 핵심은 **같은 트랜잭션**, **같은 조건**, **행 집합 변화**입니다.

### 예시: `READ COMMITTED`에서 범위 결과가 늘어나는 경우

```sql
-- 세션 A
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
START TRANSACTION;

SELECT COUNT(*)
FROM coupons
WHERE user_id = 1
  AND status = 'ACTIVE';

-- 0
```

```sql
-- 세션 B
INSERT INTO coupons(user_id, status)
VALUES (1, 'ACTIVE');

COMMIT;
```

```sql
-- 세션 A
SELECT COUNT(*)
FROM coupons
WHERE user_id = 1
  AND status = 'ACTIVE';

-- 1
COMMIT;
```

세션 A 입장에서는 같은 조건으로 두 번 조회했는데 결과 집합이 바뀌었습니다. 이것이 전형적인 `Phantom Read`입니다.

### 실무에서 특히 의미가 커지는 순간

`Phantom Read`는 **범위 조건을 믿고 비즈니스 판단을 할 때** 문제가 됩니다. 예를 들면:

- "현재 활성 쿠폰이 0건이면 발급 가능" 같은 **존재 여부 판단**
- "`status = 'WAITING'`인 작업 개수를 보고 배치 크기를 정하는" **범위 카운트 기반 판단**
- "`scheduled_at <= NOW()` 조건을 만족하는 작업만 집계" 같은 **시점 기반 스캔**

즉, 단순히 목록이 달라졌다는 것보다, **그 달라진 결과를 기준으로 로직을 이어가는 순간** 문제가 됩니다.

## Phase 3. 그런데 왜 MySQL InnoDB에서는 팬텀이 잘 안 보일까?

### 문제: 교과서대로 재현하려고 하면 MySQL에서는 다른 결과가 나온다

[트랜잭션 격리 수준](/posts/07-transaction-isolation-levels) 글에서 봤듯이, SQL 표준 관점에서는 `REPEATABLE READ`에서도 `Phantom Read`가 발생할 수 있습니다.

하지만 MySQL InnoDB에서는 실제로 체감이 다릅니다. 이유는 두 갈래입니다.

- 일반 `SELECT`는 **MVCC 스냅샷 읽기**를 합니다
- 범위를 보호하는 잠금 읽기와 쓰기에서는 **갭 락 / 넥스트 키 락**이 개입할 수 있습니다

즉, "행이 갑자기 나타났다"보다 아래 두 형태로 더 자주 보입니다.

- **같은 트랜잭션인데도 나는 예전 범위 결과를 계속 본다**
- **새 행을 넣으려는 쪽이 대기하거나 데드락 난다**

### 경우 1. 일반 `SELECT`에서는 팬텀 대신 스냅샷이 유지된다

```sql
-- 세션 A
SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;
START TRANSACTION;

SELECT COUNT(*)
FROM coupons
WHERE user_id = 1
  AND status = 'ACTIVE';

-- 0
```

```sql
-- 세션 B
INSERT INTO coupons(user_id, status)
VALUES (1, 'ACTIVE');

COMMIT;
```

```sql
-- 세션 A
SELECT COUNT(*)
FROM coupons
WHERE user_id = 1
  AND status = 'ACTIVE';

-- 여전히 0
COMMIT;
```

이 경우 세션 A는 같은 트랜잭션 안에서 **첫 스냅샷 기준의 결과**를 계속 봅니다. 그래서 고전적인 `Phantom Read`는 잘 드러나지 않습니다.

이 현상은 많은 개발자가 처음엔 버그처럼 느끼는 부분입니다. 하지만 InnoDB 기준으로는 **정상적인 스냅샷 읽기 동작**입니다.

### 경우 2. 잠금 읽기에서는 새 행이 못 들어오게 막는다

이번에는 잠금 읽기로 범위를 읽는다고 가정해 보겠습니다.

```sql
-- 세션 A
SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;
START TRANSACTION;

SELECT id
FROM coupons
WHERE user_id = 1
  AND status = 'ACTIVE'
FOR UPDATE;
```

이후 세션 B가 같은 범위에 해당하는 행을 넣으려 하면, InnoDB는 **적절한 인덱스를 타는 범위 잠금 읽기**라는 전제에서 인덱스 탐색과 락 범위에 따라 **대기**시키거나 상황에 따라 **데드락**으로 정리할 수 있습니다.

```sql
-- 세션 B
INSERT INTO coupons(user_id, status)
VALUES (1, 'ACTIVE');

-- 세션 A가 끝날 때까지 대기할 수 있음
```

즉, 교과서에서 "팬텀이 나타난다"로 설명되던 경쟁이, MySQL InnoDB에서는 실무상 이렇게 보일 수 있습니다.

- `INSERT`가 갑자기 오래 대기한다
- 범위 조회 뒤 쓰기에서 데드락이 발생한다
- 팬텀이 보이기보다, 아예 그 범위로 새 행이 못 들어간다

그래서 InnoDB에서는 `Phantom Read`를 **결과가 달라지는 현상**으로만 기억하면 운영 증상을 놓치기 쉽습니다. **범위 경쟁이 락으로 흡수된 결과**까지 같이 봐야 합니다.

## Phase 4. 실무에서는 무엇으로 관찰될까?

`Dirty Read`와 `Phantom Read`를 교과서 이름 그대로 만나는 경우보다, 아래 증상으로 만나는 경우가 더 많습니다.

| 관찰된 증상 | 실제로 먼저 의심할 것 |
|-------------|------------------------|
| 어떤 값이 잠깐 보였다가 나중에 사라짐 | 정말 `READ UNCOMMITTED`였는지, 읽은 값이 커밋 전 값이었는지 |
| 같은 트랜잭션에서 범위 카운트가 바뀜 | `READ COMMITTED`인지, 범위 조건을 두 번 읽었는지 |
| 같은 트랜잭션인데도 최신 삽입이 안 보임 | `REPEATABLE READ`의 스냅샷 읽기인지 |
| 범위 조건 뒤 `INSERT`가 대기함 | 갭 락 / 넥스트 키 락 같은 범위 락 경쟁인지 |
| 읽기 결과를 믿고 부작용을 실행했더니 뒤에서 꼬임 | 스냅샷 `stale decision`인지, 불변식을 읽기 대신 쓰기에서 강제해야 하는지 |

특히 마지막 줄은 실무에서 매우 중요합니다.

[REPEATABLE READ 실전 사례](/posts/22-repeatable-read-refund-troubleshooting) 글에서 본 것처럼, 실제 장애는 꼭 "`Phantom Read`가 났다"의 모습으로 오지 않습니다. 오히려:

- 읽을 때는 과거 스냅샷을 보고
- 애플리케이션은 그것을 최신 상태라고 믿고
- 쓰기는 최신 행에 적용되면서
- 부가 이력이나 외부 부작용이 중복되는

형태로 더 자주 나타납니다.

즉, 실무에서는 이상 현상 이름 자체보다 **읽기 기준과 쓰기 기준이 어긋났는가**를 먼저 보는 편이 더 유용합니다.

## Phase 5. 그래서 어떻게 판단하고 대응할까?

### 1. `Dirty Read`가 의심되면 먼저 격리 수준부터 확인합니다

`Dirty Read`는 보통 엔진 기본 동작이 아니라 **설정이 열려 있어야** 발생합니다.

- 세션 격리 수준이 `READ UNCOMMITTED`인지
- 특정 조회만 낮은 격리 수준으로 돌리고 있는지
- 운영성/통계성 쿼리가 정확도를 포기한 설정인지

이걸 먼저 확인하는 편이 맞습니다.

### 2. `Phantom Read`가 의심되면 "같은 트랜잭션, 같은 조건"인지부터 봅니다

많은 경우는 사실 `Phantom Read`가 아니라:

- 서로 다른 HTTP 요청 사이의 자연스러운 결과 변화
- `OFFSET` 페이지네이션의 구조적 흔들림
- `REPEATABLE READ`의 스냅샷 읽기

인 경우가 더 많습니다.

즉, 먼저 이 질문을 해야 합니다.

- 정말 **같은 트랜잭션** 안에서 벌어진 일인가?
- 정말 **같은 조건 범위 조회**를 반복했는가?
- 그 결과 집합 변화가 **비즈니스 판단에 직접 사용되었는가?**

### 3. 해결은 격리 수준 하나로 끝나지 않는 경우가 많습니다

범위 판단을 더 안전하게 만들고 싶다면, 실무에서는 보통 아래 선택지를 같이 봅니다.

- 조건부 `UPDATE`
- `UNIQUE` 제약 조건
- `SELECT ... FOR UPDATE` 같은 잠금 읽기
- 작업 중복이라면 `named lock` 또는 `distributed lock`

즉, 문제를 "`Phantom Read`니까 무조건 `SERIALIZABLE`"로 가는 것이 아니라, **무엇을 불변식으로 지켜야 하는가**로 다시 번역해야 합니다.

[분산 락은 언제 써야 할까](/posts/20-when-to-use-distributed-lock), [멱등성 완전 정복](/posts/21-idempotency-fundamentals) 글과도 연결되는 지점입니다.

## 정리

1. **`Dirty Read`는 커밋 전 값을 읽어야만 성립합니다** — 그래서 기본 운영 설정에서는 의외로 보기 어렵습니다
2. **`Phantom Read`는 같은 트랜잭션 안의 같은 범위 조회가 다시 달라질 때 성립합니다** — 단순히 요청 간 결과가 달라지는 것과는 다릅니다
3. **MySQL InnoDB의 `REPEATABLE READ`에서는 고전적인 팬텀보다 스냅샷 읽기와 범위 락 경쟁으로 더 자주 체감됩니다**
4. **실무에서는 이상 현상 이름보다 관찰 증상을 먼저 해석해야 합니다** — `stale snapshot`인지, 범위 락 대기인지, 정말 낮은 격리 수준 문제인지 구분해야 합니다
5. **대응은 격리 수준 조정보다 불변식을 어디서 강제할지에 더 가까운 경우가 많습니다** — 조건부 `UPDATE`, `UNIQUE`, 잠금 읽기, 멱등성, 분산 락까지 함께 검토해야 합니다

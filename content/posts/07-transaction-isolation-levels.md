---
title: "트랜잭션 격리 수준 완전 정복 — Read Uncommitted부터 Serializable까지"
date: "2026-04-06"
category: "study"
tags: ["Database", "SQL", "Transaction"]
excerpt: "트랜잭션 격리 수준이 왜 필요한지, 각 레벨에서 어떤 이상 현상이 발생하는지 예제와 함께 정리합니다."
---

## 트랜잭션 격리, 왜 알아야 하나요?

두 사용자가 동시에 같은 데이터를 읽고 수정한다고 가정합니다. 아무 제어 없이 실행하면 어떤 일이 벌어질까요?

- 커밋되지 않은 데이터를 다른 트랜잭션이 읽어버립니다
- 같은 쿼리를 두 번 실행했는데 결과가 다릅니다
- 조건에 맞는 행 수가 쿼리할 때마다 바뀝니다

이런 문제들을 **이상 현상(Anomaly)** 이라 부르고, 트랜잭션 격리 수준은 이 이상 현상을 어디까지 허용할지 결정하는 설정입니다. 격리 수준이 높을수록 안전하지만 동시성이 떨어지고, 낮을수록 빠르지만 위험합니다.

이 글에서는 먼저 이상 현상 세 가지를 살펴보고, 네 가지 격리 수준이 각각 어떤 이상 현상을 방지하는지 예제와 함께 정리합니다.

## Phase 1. 이상 현상 이해하기

격리 수준을 이해하려면 먼저 어떤 문제가 발생할 수 있는지 알아야 합니다. SQL 표준에서 정의하는 세 가지 이상 현상을 살펴보겠습니다.

### Dirty Read — 커밋되지 않은 데이터를 읽는 문제

```
트랜잭션 A                          트랜잭션 B
─────────────────────────────────────────────────
UPDATE accounts
SET balance = 0
WHERE id = 1;
                                    SELECT balance
                                    FROM accounts
                                    WHERE id = 1;
                                    → 0 (커밋 안 된 값을 읽음)
ROLLBACK;
                                    → 0을 기반으로 로직 수행 (잘못된 데이터!)
```

트랜잭션 A가 잔액을 0원으로 변경했지만 아직 커밋하지 않았습니다. 이 상태에서 트랜잭션 B가 0원을 읽고 로직을 수행합니다. 이후 A가 롤백하면 실제 잔액은 원래 값인데, B는 이미 0원을 기준으로 처리를 끝낸 상태입니다. 존재한 적 없는 데이터를 읽은 것이므로 **Dirty Read**라고 합니다.

### Non-Repeatable Read — 같은 행을 두 번 읽었는데 값이 달라지는 문제

```
트랜잭션 A                          트랜잭션 B
─────────────────────────────────────────────────
SELECT balance
FROM accounts
WHERE id = 1;
→ 10000
                                    UPDATE accounts
                                    SET balance = 0
                                    WHERE id = 1;
                                    COMMIT;
SELECT balance
FROM accounts
WHERE id = 1;
→ 0 (같은 쿼리인데 결과가 다름!)
```

트랜잭션 A가 같은 `SELECT`를 두 번 실행했는데, 그 사이에 트랜잭션 B가 해당 행을 수정하고 커밋했습니다. 결과적으로 A는 같은 행을 읽었지만 값이 달라집니다. **반복 읽기가 보장되지 않는다**는 의미에서 Non-Repeatable Read라고 합니다.

### Phantom Read — 같은 조건으로 조회했는데 행 수가 달라지는 문제

```
트랜잭션 A                          트랜잭션 B
─────────────────────────────────────────────────
SELECT COUNT(*)
FROM orders
WHERE status = 'PAID';
→ 5
                                    INSERT INTO orders (status)
                                    VALUES ('PAID');
                                    COMMIT;
SELECT COUNT(*)
FROM orders
WHERE status = 'PAID';
→ 6 (유령 행이 나타남!)
```

트랜잭션 A가 같은 조건으로 두 번 조회했는데, 그 사이에 트랜잭션 B가 조건에 맞는 새 행을 삽입하고 커밋했습니다. 갑자기 나타난 행을 **팬텀(Phantom)** 이라 부릅니다. Non-Repeatable Read가 **기존 행의 값 변경** 문제라면, Phantom Read는 **행 자체가 추가/삭제**되는 문제입니다.

> **참고:** Non-Repeatable Read와 Phantom Read의 차이를 혼동하기 쉽습니다. 핵심은 **대상**입니다. Non-Repeatable Read는 이미 읽은 **특정 행의 값**이 바뀌는 것이고, Phantom Read는 조건에 맞는 **행의 집합(결과 셋)**이 바뀌는 것입니다.

## Phase 2. 네 가지 격리 수준

SQL 표준(SQL-92)은 네 가지 격리 수준을 정의합니다. 아래로 갈수록 격리가 강해집니다.

### Read Uncommitted — 격리 없음

가장 낮은 격리 수준입니다. 다른 트랜잭션이 커밋하지 않은 변경 사항까지 읽을 수 있습니다.

```sql
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
```

- **Dirty Read** 발생 가능
- **Non-Repeatable Read** 발생 가능
- **Phantom Read** 발생 가능

사실상 격리가 없는 것과 같습니다. **실무에서 거의 사용하지 않습니다.** 굳이 쓴다면 정확한 데이터가 필요 없는 대략적인 통계 조회 정도에 한정됩니다.

### Read Committed — 커밋된 데이터만 읽기

다른 트랜잭션이 **커밋한 데이터만** 읽을 수 있습니다.

```sql
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
```

- **Dirty Read** 방지
- **Non-Repeatable Read** 발생 가능
- **Phantom Read** 발생 가능

**PostgreSQL, Oracle의 기본 격리 수준**입니다. Dirty Read는 막아주지만, 같은 쿼리를 반복 실행하면 그 사이에 다른 트랜잭션이 커밋한 변경 사항이 보일 수 있습니다.

```
트랜잭션 A                          트랜잭션 B
─────────────────────────────────────────────────
SELECT balance FROM accounts
WHERE id = 1;
→ 10000
                                    UPDATE accounts
                                    SET balance = 5000
                                    WHERE id = 1;
                                    COMMIT;
SELECT balance FROM accounts
WHERE id = 1;
→ 5000 (커밋된 값이므로 읽기 허용)
```

트랜잭션 A 입장에서는 같은 쿼리를 두 번 실행했는데 결과가 달라졌지만, Read Committed에서는 이것이 정상 동작입니다.

### Repeatable Read — 반복 읽기 보장

트랜잭션 내 **첫 번째 읽기 시점의 스냅샷을 기준으로** 데이터를 읽습니다. 같은 행에 대한 일반 `SELECT`를 여러 번 실행하면 같은 값을 반환합니다.

```sql
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
```

- **Dirty Read** 방지
- **Non-Repeatable Read** 방지
- **Phantom Read** SQL 표준에서는 발생 가능

**MySQL(InnoDB)의 기본 격리 수준**입니다. InnoDB는 MVCC(Multi-Version Concurrency Control)와 갭 락(Gap Lock)을 조합하여 Repeatable Read에서도 **대부분의 Phantom Read를 방지**합니다.

```
트랜잭션 A                          트랜잭션 B
─────────────────────────────────────────────────
START TRANSACTION;
SELECT balance FROM accounts
WHERE id = 1;
→ 10000
                                    UPDATE accounts
                                    SET balance = 5000
                                    WHERE id = 1;
                                    COMMIT;
SELECT balance FROM accounts
WHERE id = 1;
→ 10000 (첫 번째 SELECT 시점의 스냅샷)
COMMIT;
```

트랜잭션 A는 첫 번째 SELECT 시점의 스냅샷을 계속 읽으므로, B가 중간에 값을 바꾸고 커밋해도 A에게는 보이지 않습니다.

> **참고:** MySQL InnoDB의 Repeatable Read는 SQL 표준보다 강력합니다. **일관된 읽기(Consistent Read)** 는 MVCC 스냅샷으로, **잠금 읽기(`SELECT ... FOR UPDATE`)와 쓰기**는 갭 락과 넥스트 키 락으로 Phantom을 방지합니다. 다만 완벽하지는 않아서, 특정 순서의 `SELECT` → `UPDATE` → `SELECT` 조합에서 팬텀이 발생할 수 있습니다.

### Serializable — 완전한 격리

가장 높은 격리 수준입니다. 트랜잭션들이 마치 **하나씩 순서대로 실행되는 것처럼** 동작합니다.

```sql
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
```

- **Dirty Read** 방지
- **Non-Repeatable Read** 방지
- **Phantom Read** 방지

모든 이상 현상을 차단하지만, 그만큼 **동시성이 크게 떨어집니다.** MySQL InnoDB에서는 `autocommit`이 꺼진 `SERIALIZABLE` 트랜잭션에서 일반 `SELECT`도 사실상 `SELECT ... FOR SHARE`처럼 동작하여 읽기에도 공유 락이 걸립니다.

```
트랜잭션 A                          트랜잭션 B
─────────────────────────────────────────────────
SELECT COUNT(*)
FROM orders
WHERE status = 'PAID';
→ 5 (공유 락 설정)
                                    INSERT INTO orders (status)
                                    VALUES ('PAID');
                                    → 대기 (A의 락이 해제될 때까지 블로킹)
COMMIT;
                                    → INSERT 실행
```

트랜잭션 A가 읽은 범위에 락이 걸리므로, B는 A가 커밋할 때까지 해당 범위에 쓰기를 할 수 없습니다. 안전하지만 **데드락 발생 확률이 높아지고 처리량이 급격히 감소**합니다.

## Phase 3. 격리 수준의 구현 — 락과 MVCC

격리 수준을 공부하다 보면 락(Lock)과 헷갈리기 쉽습니다. 이 둘은 **레이어가 다릅니다.**

- **격리 수준** — 다른 트랜잭션의 변경이 **보이느냐 안 보이느냐**를 결정하는 **정책**입니다
- **락** — 다른 트랜잭션이 해당 데이터에 **접근 자체를 못하게 차단**하는 **메커니즘**입니다

상품 재고가 1개 남은 상황에서 두 사용자가 동시에 주문하는 경우로 비교하면 명확합니다.

```
-- 격리 수준이 하는 일: "뭘 보여줄지" 결정
-- A가 재고를 읽은 뒤, B가 재고를 0으로 변경하고 커밋
-- → Read Committed: A의 다음 SELECT에서 0이 보임
-- → Repeatable Read: A의 다음 SELECT에서 여전히 1이 보임
-- → 어느 쪽이든 B의 UPDATE 자체를 막지는 않음

-- 락이 하는 일: "접근 자체를 차단"
SELECT stock FROM products WHERE id = 1 FOR UPDATE;  -- A가 배타 락 획득
-- → B의 잠금 읽기(FOR UPDATE, FOR SHARE)와 쓰기는 A가 커밋할 때까지 대기
-- → 단, 일반 SELECT(스냅샷 읽기)는 락과 무관하게 동작
```

격리 수준은 **"창문 유리"** 로, 밖이 보이느냐 안 보이느냐를 결정합니다. 락은 **"문 잠금"** 으로, 아예 들어오지 못하게 막습니다. DB는 내부적으로 **락과 MVCC를 조합**하여 각 격리 수준의 정책을 구현합니다.

### 락 기반 (Lock-Based)

가장 직관적인 방법입니다. 데이터를 읽거나 쓸 때 **락(Lock)을 획득**하고, 다른 트랜잭션이 접근하지 못하게 막습니다.

| 락 종류        | 설명                                  |
|---------------|---------------------------------------|
| 공유 락 (S)    | 읽기 락. 여러 트랜잭션이 동시에 획득 가능   |
| 배타 락 (X)    | 쓰기 락. 하나의 트랜잭션만 획득 가능       |
| 갭 락 (Gap)   | 인덱스 레코드 사이의 간격을 잠금           |
| 넥스트 키 락   | 레코드 락 + 갭 락의 조합                 |

격리 수준이 높아질수록 락의 범위가 넓어지고 보유 시간이 길어집니다.

### MVCC (Multi-Version Concurrency Control)

**락 없이 읽기 일관성을 제공**하는 방법입니다. 데이터를 변경하면 이전 버전을 별도로 보관하고, 각 트랜잭션은 격리 수준에 따라 자신에게 보여야 할 버전을 읽습니다.

```
행 id=1의 버전 히스토리 (트랜잭션 A는 txn_100 시점에 시작):

[balance=10000, modified_by=txn_50]   ← 이전 버전 (Undo 로그에 보관)
          ↓
[balance=5000, modified_by=txn_105]   ← 최신 버전 (데이터 페이지)
```

MySQL InnoDB에서는 **Undo 로그**에 이전 버전을 보관합니다. 예를 들어 Repeatable Read에서 트랜잭션 A(txn_100)는 자신의 스냅샷 이후에 커밋된 txn_105의 변경을 무시하고, txn_50이 남긴 이전 버전(balance=10000)을 읽습니다. 반면 Read Committed에서는 다음 쿼리 시점에 txn_105가 이미 커밋되었다면 최신 버전(balance=5000)이 보입니다.

- **Read Committed** — 매 쿼리마다 새로운 스냅샷을 생성합니다
- **Repeatable Read** — 트랜잭션 내 첫 번째 읽기 시점에 스냅샷을 생성하고 끝까지 유지합니다

이 차이가 Non-Repeatable Read 발생 여부를 결정합니다.

> **참고:** MVCC 덕분에 읽기와 쓰기가 서로를 블로킹하지 않습니다. Repeatable Read에서도 `SELECT`에 락을 걸지 않고 스냅샷을 읽으므로 높은 동시성을 유지할 수 있습니다. 이것이 MySQL이 Repeatable Read를 기본값으로 선택할 수 있는 이유입니다.

## Phase 4. 실무에서 주의할 점

### 현재 격리 수준 확인하기

```sql
-- MySQL
SELECT @@transaction_isolation;

-- PostgreSQL
SHOW transaction_isolation;
```

사용 중인 DB의 기본 격리 수준을 반드시 파악하고 있어야 합니다. MySQL은 `REPEATABLE-READ`, PostgreSQL은 `read committed`가 기본값입니다.

### Lost Update 문제

읽기-계산-쓰기 패턴에서 발생하는 대표적인 동시성 문제입니다.

```
트랜잭션 A                          트랜잭션 B
─────────────────────────────────────────────────
SELECT balance FROM accounts
WHERE id = 1;
→ 10000
                                    SELECT balance FROM accounts
                                    WHERE id = 1;
                                    → 10000
UPDATE accounts
SET balance = 10000 - 3000
WHERE id = 1;
COMMIT;
                                    UPDATE accounts
                                    SET balance = 10000 - 5000
                                    WHERE id = 1;
                                    COMMIT;
→ 최종 잔액: 5000 (A의 출금 3000이 사라짐!)
```

두 트랜잭션이 같은 값을 읽고 각자 계산한 결과를 상수로 덮어쓰면서 A의 변경이 유실됩니다. **MySQL InnoDB의 Repeatable Read는 이런 read-modify-write 패턴의 Lost Update를 자동으로 감지하지 못할 수 있습니다.** 반면 PostgreSQL의 Repeatable Read는 "내가 읽은 이후 다른 트랜잭션이 이 행을 수정했다"는 것을 감지하고, 뒤늦게 쓰려는 트랜잭션을 `ERROR: could not serialize access due to concurrent update`로 중단시킵니다.

### 해결: 비관적 락 또는 원자적 연산

```sql
-- 방법 1: SELECT ... FOR UPDATE (비관적 락)
SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;
-- 이 행에 배타 락이 걸려 다른 트랜잭션의 잠금 읽기와 쓰기가 대기

-- 방법 2: 원자적 UPDATE (읽기 없이 한 번에 처리)
UPDATE accounts SET balance = balance - 3000 WHERE id = 1;
```

`SELECT ... FOR UPDATE`는 해당 행에 배타 락을 걸어 다른 트랜잭션의 **잠금 읽기(`FOR UPDATE`, `FOR SHARE`)와 쓰기를 블로킹**합니다. 단, 일반 `SELECT`(MVCC 스냅샷 읽기)는 락과 무관하게 동작하므로 차단되지 않습니다. 원자적 `UPDATE`는 DB가 최신 값을 기준으로 한 문장에서 계산하므로, 예시처럼 애플리케이션이 읽은 값을 상수로 다시 덮어쓰는 패턴보다 안전합니다.

### 데드락에 대비하기

격리 수준이 높을수록 락 범위가 넓어지고 데드락 발생 확률이 올라갑니다.

```
트랜잭션 A                          트랜잭션 B
─────────────────────────────────────────────────
UPDATE accounts
SET balance = balance - 1000
WHERE id = 1;  (행 1에 X락)
                                    UPDATE accounts
                                    SET balance = balance - 1000
                                    WHERE id = 2;  (행 2에 X락)
UPDATE accounts
SET balance = balance + 1000
WHERE id = 2;  → 대기 (B가 행 2 보유)
                                    UPDATE accounts
                                    SET balance = balance + 1000
                                    WHERE id = 1;  → 대기 (A가 행 1 보유)
→ 데드락!
```

실무에서의 대응 방법입니다.

- **락 획득 순서를 통일** — 항상 `id` 오름차순으로 락을 획득하면 순환 대기가 발생하지 않습니다
- **트랜잭션을 짧게 유지** — 락 보유 시간이 줄어들어 충돌 확률이 낮아집니다
- **데드락 감지에 의존** — MySQL InnoDB는 데드락을 자동 감지하고 한쪽 트랜잭션을 롤백합니다. 애플리케이션에서 재시도 로직을 구현합니다

> **참고:** Spring에서 `@Transactional`을 사용할 때 격리 수준을 지정할 수 있습니다. `@Transactional(isolation = Isolation.REPEATABLE_READ)`처럼 선언하면 해당 메서드의 트랜잭션에만 격리 수준이 적용됩니다.

## 한눈에 보는 격리 수준 비교

| 격리 수준          | Dirty Read | Non-Repeatable Read | Phantom Read | 성능    |
|-------------------|------------|---------------------|--------------|--------|
| Read Uncommitted  | 발생       | 발생                 | 발생          | 가장 빠름 |
| Read Committed    | 방지       | 발생                 | 발생          | 빠름    |
| Repeatable Read   | 방지       | 방지                 | 발생 가능*    | 보통    |
| Serializable      | 방지       | 방지                 | 방지          | 느림    |

\* MySQL InnoDB에서는 MVCC + 갭 락으로 대부분의 Phantom Read도 방지됩니다.

## 정리

1. **Dirty Read** — 커밋되지 않은 데이터를 읽는 문제입니다. Read Committed 이상이면 방지됩니다
2. **Non-Repeatable Read** — 같은 행을 두 번 읽었을 때 값이 달라지는 문제입니다. Repeatable Read 이상이면 방지됩니다
3. **Phantom Read** — 같은 조건 조회 시 행의 수가 달라지는 문제입니다. Serializable에서 완전히 방지됩니다
4. **MVCC** — 락 없이 읽기 일관성을 제공하는 핵심 메커니즘입니다. 격리 수준에 따라 스냅샷 생성 시점이 달라집니다
5. **Lost Update** — 특히 애플리케이션이 읽은 값을 계산한 뒤 상수로 덮어쓰는 read-modify-write 패턴에서 문제 됩니다. PostgreSQL RR은 이를 감지하지만, MySQL InnoDB RR은 자동 감지하지 못할 수 있으므로 `SELECT ... FOR UPDATE` 또는 원자적 연산으로 방지합니다
6. **실무 판단** — 많은 서비스는 DB 기본값(MySQL: Repeatable Read, PostgreSQL: Read Committed)으로도 시작할 수 있으며, 특별한 요구사항이 있는 트랜잭션에만 격리 수준을 개별 조정합니다

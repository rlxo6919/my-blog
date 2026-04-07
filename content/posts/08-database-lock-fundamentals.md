---
title: "데이터베이스 락 완전 정복 — 공유 락부터 데드락까지"
date: "2026-04-07"
category: "study"
tags: ["Database", "SQL", "Lock", "MySQL", "PostgreSQL"]
excerpt: "데이터베이스 락의 종류와 동작 원리, 낙관적·비관적 락 전략, 데드락 원인과 대처법을 예제와 함께 정리합니다."
---

## 락, 왜 알아야 하나요?

[트랜잭션 격리 수준](/posts/07-transaction-isolation-levels) 글에서 격리 수준은 **"무엇을 보여줄지"** 를 결정하는 정책이고, 락은 **"접근 자체를 차단"** 하는 메커니즘이라고 정리했습니다. MVCC 덕분에 일반적인 읽기는 락 없이도 동작하지만, 다음과 같은 상황에서는 락이 반드시 필요합니다.

- 재고가 1개 남았는데 두 사용자가 동시에 주문합니다
- 같은 좌석을 두 명이 동시에 예약합니다
- 한 사용자가 잔액을 읽는 사이에 다른 사용자가 잔액을 변경합니다

이 글에서는 락의 종류와 범위를 먼저 살펴보고, 비관적 락과 낙관적 락의 차이, 그리고 데드락의 원인과 대처법까지 단계적으로 정리합니다.

## Phase 1. 락의 기본 — 공유 락과 배타 락

모든 락의 기초가 되는 두 가지 유형입니다.

### 공유 락 (Shared Lock, S Lock)

**읽기를 위한 락**입니다. 여러 트랜잭션이 같은 데이터에 대해 동시에 공유 락을 획득할 수 있습니다.

```sql
-- MySQL 8.0+
SELECT * FROM accounts WHERE id = 1 FOR SHARE;

-- PostgreSQL
SELECT * FROM accounts WHERE id = 1 FOR SHARE;
```

공유 락이 걸린 데이터는 **다른 트랜잭션도 읽을 수 있지만, 쓸 수는 없습니다.** 도서관에서 같은 책을 여러 사람이 열람할 수 있지만, 누군가 열람 중이면 책에 밑줄을 그을 수 없는 것과 비슷합니다.

> **참고:** 엔진마다 잠금 문법과 세부 동작은 다를 수 있습니다. 예를 들어 MySQL은 버전에 따라 `LOCK IN SHARE MODE` 문법도 사용합니다.

### 배타 락 (Exclusive Lock, X Lock)

**쓰기를 위한 락**입니다. 하나의 트랜잭션만 획득할 수 있으며, 배타 락이 걸린 데이터에는 다른 트랜잭션이 공유 락도 배타 락도 걸 수 없습니다.

```sql
-- 명시적으로 배타 락 획득
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;

-- UPDATE, DELETE 문은 자동으로 배타 락 획득
UPDATE accounts SET balance = balance - 1000 WHERE id = 1;
```

### 호환성 정리

|              | 공유 락 (S) 요청 | 배타 락 (X) 요청 |
|:------------:|:----------------:|:----------------:|
| 공유 락 보유  | 허용             | **대기**          |
| 배타 락 보유  | **대기**          | **대기**          |

- S + S: 여러 트랜잭션이 동시에 읽기 가능
- S + X: 읽기 중에는 쓰기 대기
- X + X: 쓰기 중에는 다른 쓰기도 대기

> **참고:** 일반 `SELECT`(스냅샷 읽기)는 MVCC를 통해 동작하므로, **InnoDB에서는 잠금 읽기와 별개로 실행됩니다.** 예를 들어 배타 락이 걸린 행이라도 일반 `SELECT`는 이전 버전을 읽어 블로킹되지 않습니다. 위 호환성 표에서 말하는 "공유 락 요청"은 `SELECT ... FOR SHARE` 같은 **잠금 읽기**를 의미합니다.

## Phase 2. 락의 범위 — 공통 개념과 InnoDB 기준

락은 **무엇을 잠그느냐(잠금 대상)** 에 따라 성격이 크게 달라집니다. 이 중 **행 수준 락, 테이블 수준 락, 의도 락**은 큰 개념에서 공통적으로 이해할 수 있고, **갭 락과 넥스트 키 락**은 MySQL InnoDB 기준으로 보는 것이 안전합니다.

### 행 수준 락 (Row-Level Lock)

InnoDB의 기본 잠금 단위입니다. **특정 인덱스 레코드**에 락을 겁니다.

```sql
-- id=1 행에만 배타 락
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;
```

잠금 범위가 좁아서 동시성이 높지만, 잠금 대상이 많아지면 오버헤드가 커질 수 있습니다.

### 갭 락 (Gap Lock, InnoDB)

인덱스 레코드 **사이의 간격**을 잠급니다. 해당 간격에 새로운 행이 삽입되는 것을 방지합니다.

```sql
-- age 컬럼에 인덱스가 있고, 현재 age 값이 10, 20, 30인 행이 존재한다고 가정
SELECT * FROM users WHERE age BETWEEN 15 AND 25 FOR UPDATE;
```

이 쿼리는 age가 10인 레코드와 20인 레코드 사이, 그리고 20인 레코드와 30인 레코드 사이의 **간격**을 잠급니다. 다른 트랜잭션이 `age = 12`나 `age = 22` 같은 행을 삽입하려고 하면 대기합니다.

```
인덱스:    10 ──── 20 ──── 30
갭 락:        (10,20)  (20,30)
              ↑ INSERT age=12 대기
                        ↑ INSERT age=22 대기
```

갭 락은 **Phantom Read를 방지하기 위한 메커니즘**입니다. MySQL InnoDB의 Repeatable Read에서 사용됩니다.

> **참고:** 갭 락은 `INSERT`만 차단합니다. 갭 범위 내의 기존 행에 대한 `SELECT`나 `UPDATE`는 갭 락이 아닌 레코드 락의 영향을 받습니다.

### 넥스트 키 락 (Next-Key Lock, InnoDB)

**레코드 락 + 갭 락**의 조합입니다. 특정 인덱스 레코드와 그 앞의 간격을 함께 잠급니다. InnoDB의 Repeatable Read에서 잠금 읽기와 쓰기의 기본 잠금 방식입니다.

```
인덱스:    10 ──── 20 ──── 30
넥스트 키 락: (10,20]  (20,30]
              레코드 20 + 앞 간격  레코드 30 + 앞 간격
```

넥스트 키 락 덕분에 InnoDB는 Repeatable Read에서도 **대부분의 Phantom Read를 방지**합니다.

### 테이블 수준 락 (Table-Level Lock)

테이블 전체를 잠급니다. DDL(`ALTER TABLE` 등) 실행 시 **메타데이터 락(MDL)** 이 자동으로 걸리며, 명시적으로 테이블 락을 획득할 수도 있습니다.

```sql
-- 명시적 테이블 락 (실무에서 거의 사용하지 않음)
LOCK TABLES accounts WRITE;
-- ... 작업 ...
UNLOCK TABLES;
```

InnoDB는 행 수준 락을 사용하므로 테이블 락을 직접 사용하는 경우는 드뭅니다. 다만 `ALTER TABLE` 같은 DDL은 내부적으로 메타데이터 락을 획득하므로, **운영 중에 실행하면 해당 테이블의 읽기/쓰기 쿼리가 대기할 수 있습니다.**

### 의도 락 (Intention Lock)

행 수준 락과 테이블 수준 락이 공존할 때 **충돌을 빠르게 감지**하기 위한 테이블 레벨 락입니다.

트랜잭션이 행에 공유 락을 걸기 전에 테이블에 **의도 공유 락(IS)** 을, 배타 락을 걸기 전에 **의도 배타 락(IX)** 을 먼저 획득합니다.

```
트랜잭션 A: SELECT * FROM accounts WHERE id = 1 FOR UPDATE;
  1) accounts 테이블에 IX 락 획득
  2) id=1 행에 X 락 획득

트랜잭션 B: LOCK TABLES accounts WRITE;
  → accounts 테이블에 이미 IX 락이 있으므로, 테이블 X 락 획득 불가 → 대기
```

의도 락이 없다면, 테이블 락을 걸려는 트랜잭션은 **모든 행을 순회하며 기존 행 락이 있는지 확인**해야 합니다. 의도 락 덕분에 테이블 레벨에서 바로 충돌 여부를 판단할 수 있습니다.

## Phase 3. 비관적 락 vs 낙관적 락

지금까지 살펴본 공유 락, 배타 락 등은 모두 **데이터베이스가 제공하는 락 메커니즘**입니다. 실무에서는 이 메커니즘을 어떻게 활용할지에 대한 **전략**이 필요합니다. 크게 비관적 락과 낙관적 락, 두 가지 접근법이 있습니다.

### 비관적 락 (Pessimistic Lock)

**"충돌이 발생할 것이다"** 라고 가정하고, 데이터를 읽는 시점에 미리 락을 거는 전략입니다.

```sql
START TRANSACTION;

-- 1. 읽으면서 배타 락 획득
SELECT stock FROM products WHERE id = 1 FOR UPDATE;
-- → stock = 1

-- 2. 재고 차감
UPDATE products SET stock = stock - 1 WHERE id = 1;

COMMIT;
```

다른 트랜잭션이 같은 행을 `FOR UPDATE`나 `UPDATE`로 접근하려 하면 **현재 트랜잭션이 커밋될 때까지 대기**합니다. 데이터 정합성이 확실히 보장되지만, 대기 시간이 길어질 수 있습니다.

**적합한 경우:**
- 충돌 빈도가 높은 경우 (인기 상품 재고 차감 등)
- 데이터 정합성이 절대적으로 중요한 경우 (결제, 송금 등)
- 충돌 시 재시도 비용이 큰 경우

### 낙관적 락 (Optimistic Lock)

**"충돌이 거의 없을 것이다"** 라고 가정하고, 락 없이 진행한 뒤 **업데이트 시점(예: flush 시점)에 충돌을 감지**하는 전략입니다. 데이터베이스 락을 사용하지 않고, 애플리케이션 레벨에서 **버전 번호** 또는 **타임스탬프** 컬럼으로 구현합니다.

```sql
-- 1. 버전과 함께 읽기 (일반 SELECT, 락 없음)
SELECT stock, version FROM products WHERE id = 1;
-- → stock = 1, version = 3

-- 2. 업데이트 시 버전 확인
UPDATE products
SET stock = stock - 1, version = version + 1
WHERE id = 1 AND version = 3;
-- → 영향받은 행: 1이면 성공, 0이면 다른 트랜잭션이 먼저 수정한 것
```

버전이 일치하지 않으면 `UPDATE`의 영향받은 행 수가 0이 됩니다. 애플리케이션은 이를 감지하여 **재시도하거나 사용자에게 알림**을 보냅니다.

**JPA에서의 낙관적 락:**

```kotlin
@Entity
class Product(
    @Id val id: Long,
    var stock: Int,

    @Version
    var version: Long = 0  // JPA가 자동으로 버전 관리
)
```

JPA의 `@Version` 애노테이션을 사용하면 업데이트 시 자동으로 버전을 비교하고, 충돌이 감지되면 `OptimisticLockException`을 던집니다.

**적합한 경우:**
- 충돌 빈도가 낮은 경우 (사용자 프로필 수정 등)
- 읽기가 많고 쓰기가 적은 경우
- 대기 시간보다 처리량이 중요한 경우

### 비교 정리

| 기준         | 비관적 락                    | 낙관적 락                      |
|:------------:|:---------------------------:|:-----------------------------:|
| 충돌 가정     | 충돌이 잦다고 가정            | 충돌이 드물다고 가정             |
| 락 시점       | 읽기 시점에 DB 락 획득        | 락 없이 진행, 업데이트 시 충돌 감지 |
| 구현 위치     | 데이터베이스 (FOR UPDATE)     | 애플리케이션 (version 컬럼)      |
| 대기          | 락 획득까지 블로킹            | 대기 없음 (충돌 시 재시도)       |
| 데드락 위험   | 있음                        | 없음                           |
| 적합한 상황   | 높은 충돌률, 정합성 최우선     | 낮은 충돌률, 처리량 최우선       |

> **참고:** 두 전략은 양자택일이 아닙니다. 하나의 서비스에서도 기능별로 다른 전략을 사용할 수 있습니다. 예를 들어 **결제 처리는 비관적 락**, **사용자 프로필 수정은 낙관적 락**을 적용하는 식입니다.

## MySQL vs PostgreSQL 한눈에 보기

이 글의 기본 개념은 두 DB에 공통으로 적용되지만, **락의 세부 구현은 다릅니다.** 특히 갭 락, 넥스트 키 락처럼 잠금 범위에 대한 설명은 **MySQL InnoDB 기준**입니다.

| 항목 | MySQL InnoDB | PostgreSQL |
|:----:|:------------:|:----------:|
| 일반 `SELECT` | MVCC 스냅샷 읽기. 잠금 읽기와 별개로 동작 | MVCC 스냅샷 읽기. 행 락과 별개로 동작 |
| 잠금 읽기 | `FOR SHARE`, `FOR UPDATE` 등 | `FOR SHARE`, `FOR UPDATE`, `FOR NO KEY UPDATE`, `FOR KEY SHARE` 등 |
| 기본 행 잠금 단위 | 인덱스 레코드 중심 | 튜플(행) 중심 |
| 팬텀 대응 방식 | Repeatable Read에서 갭 락/넥스트 키 락 활용 | 직렬화 수준에서 predicate locking 기반으로 처리 |
| 갭 락 개념 | 명시적으로 존재 | InnoDB의 갭 락과 동일한 개념으로 보지는 않음 |
| 데드락 진단 | `SHOW ENGINE INNODB STATUS` | `pg_locks`, `pg_stat_activity`, 서버 로그 |

실무에서는 `FOR UPDATE`, 데드락, 재시도 같은 **큰 원칙은 공통**으로 가져가되, 잠금 범위와 팬텀 처리처럼 엔진 의존적인 부분은 공식 문서를 함께 보는 편이 좋습니다.

## Phase 4. 데드락 — 원인과 대처

### 데드락이란

두 개 이상의 트랜잭션이 **서로가 보유한 락을 기다리며 영원히 진행하지 못하는 상태**입니다.

```
트랜잭션 A                          트랜잭션 B
─────────────────────────────────────────────────
UPDATE accounts
SET balance = balance - 1000
WHERE id = 1;  (행 1에 X 락)
                                    UPDATE accounts
                                    SET balance = balance - 500
                                    WHERE id = 2;  (행 2에 X 락)
UPDATE accounts
SET balance = balance + 1000
WHERE id = 2;  → 대기 (B가 행 2 보유)
                                    UPDATE accounts
                                    SET balance = balance + 500
                                    WHERE id = 1;  → 대기 (A가 행 1 보유)
→ 데드락! (A→B 대기, B→A 대기 = 순환 대기)
```

### 데드락 발생 조건

데드락은 다음 네 가지 조건이 **모두** 충족될 때 발생합니다.

1. **상호 배제** — 락은 한 번에 하나의 트랜잭션만 보유할 수 있습니다
2. **점유 대기** — 락을 보유한 채로 다른 락을 기다립니다
3. **비선점** — 다른 트랜잭션이 보유한 락을 강제로 빼앗을 수 없습니다
4. **순환 대기** — 트랜잭션 간 대기 관계가 원형을 이룹니다

이 중 하나라도 깨뜨리면 데드락은 발생하지 않습니다. 실무에서 가장 깨뜨리기 쉬운 조건은 **순환 대기**입니다.

### DB 엔진의 데드락 처리

**MySQL InnoDB:**
- **대기 그래프(Wait-for Graph)** 를 주기적으로 검사하여 순환이 감지되면, Undo 로그 양이 가장 적은(롤백 비용이 가장 낮은) 트랜잭션을 선택하여 롤백합니다
- 롤백된 트랜잭션은 `ERROR 1213 (40001): Deadlock found when trying to get lock` 에러를 받습니다
- `SHOW ENGINE INNODB STATUS`로 마지막 데드락 정보를 확인할 수 있습니다

**PostgreSQL:**
- 락 대기가 `deadlock_timeout`(기본 1초)을 초과하면 데드락 검사를 시작합니다
- 순환이 감지되면 한쪽 트랜잭션을 `ERROR: deadlock detected`로 중단합니다
- `pg_locks` 뷰와 로그로 데드락 정보를 확인할 수 있습니다

### 데드락 확인 방법

```sql
-- MySQL: 마지막 데드락 정보 확인
SHOW ENGINE INNODB STATUS\G
-- LATEST DETECTED DEADLOCK 섹션을 확인

-- PostgreSQL: 현재 락 대기 상태 확인
SELECT blocked.pid AS blocked_pid,
       blocked_activity.query AS blocked_query,
       blocking.pid AS blocking_pid,
       blocking_activity.query AS blocking_query
FROM pg_catalog.pg_locks blocked
JOIN pg_catalog.pg_locks blocking
    ON blocking.locktype = blocked.locktype
    AND blocking.relation = blocked.relation
    AND blocking.pid != blocked.pid
JOIN pg_catalog.pg_stat_activity blocked_activity
    ON blocked_activity.pid = blocked.pid
JOIN pg_catalog.pg_stat_activity blocking_activity
    ON blocking_activity.pid = blocking.pid
WHERE NOT blocked.granted;
```

MySQL의 `SHOW ENGINE INNODB STATUS`는 **마지막으로 감지된 데드락 정보**를 보여 주고, PostgreSQL의 쿼리는 **현재 어떤 세션이 누구를 기다리는지** 확인하는 용도입니다. PostgreSQL에서 실제 데드락 상세 정보는 서버 로그와 에러 메시지에서 확인합니다.

### 실무에서 데드락 줄이기

**1. 락 획득 순서를 통일합니다**

데드락의 가장 흔한 원인은 트랜잭션마다 **다른 순서로 락을 획득**하는 것입니다.

```sql
-- 나쁜 예: A는 1→2, B는 2→1 순서로 접근
-- 트랜잭션 A                     트랜잭션 B
-- UPDATE ... WHERE id = 1;     UPDATE ... WHERE id = 2;
-- UPDATE ... WHERE id = 2;     UPDATE ... WHERE id = 1;

-- 좋은 예: 항상 id 오름차순으로 접근
-- 트랜잭션 A                     트랜잭션 B
-- UPDATE ... WHERE id = 1;     UPDATE ... WHERE id = 1;  → 대기
-- UPDATE ... WHERE id = 2;     UPDATE ... WHERE id = 2;
```

순서를 통일하면 **순환 대기가 원천적으로 발생하지 않습니다.**

**2. 트랜잭션을 짧게 유지합니다**

```kotlin
// 나쁜 예: 트랜잭션 안에서 외부 API 호출
@Transactional
fun processOrder(orderId: Long) {
    val order = orderRepository.findByIdForUpdate(orderId)  // 락 획득
    val result = externalPaymentApi.charge(order.amount)     // 수백 ms 소요
    order.complete(result)                                   // 락 해제는 커밋 시점
}

// 좋은 예: 외부 호출을 트랜잭션 밖으로 분리
fun processOrder(orderId: Long) {
    val order = orderRepository.findById(orderId)
    val result = externalPaymentApi.charge(order.amount)     // 락 없이 실행

    completeOrder(orderId, result)                           // 짧은 트랜잭션
}

@Transactional
fun completeOrder(orderId: Long, paymentResult: PaymentResult) {
    val order = orderRepository.findByIdForUpdate(orderId)   // 락 획득
    order.complete(paymentResult)                             // 바로 커밋
}
```

락 보유 시간이 짧을수록 다른 트랜잭션과 충돌할 확률이 줄어듭니다. **트랜잭션 내에서 외부 API 호출, 파일 I/O 등 시간이 오래 걸리는 작업은 피해야 합니다.**

**3. 적절한 인덱스를 사용합니다**

```sql
-- 인덱스 없는 경우: 풀 테이블 스캔으로 더 넓은 범위를 검사
UPDATE orders SET status = 'SHIPPED' WHERE customer_id = 42;
-- customer_id에 인덱스가 없으면 많은 레코드를 검사하며 잠금 범위가 넓어질 수 있다

-- 인덱스 있는 경우: 대상 레코드를 더 정확히 찾음
-- CREATE INDEX idx_customer_id ON orders(customer_id);
UPDATE orders SET status = 'SHIPPED' WHERE customer_id = 42;
-- customer_id = 42인 레코드 위주로 잠금이 걸린다
```

인덱스가 없으면 InnoDB는 조건에 맞는 행을 찾기 위해 **더 많은 레코드와 범위를 스캔하면서 잠금 범위가 넓어질 수 있습니다.** 이렇게 잠금 범위가 넓어지면 충돌 확률이 높아지고 데드락 위험도 커집니다.

**4. 재시도 로직을 구현합니다**

데드락을 완전히 제거하는 것은 어렵습니다. DB가 데드락을 감지하고 한쪽 트랜잭션을 롤백하면, 애플리케이션에서 이를 잡아 **재시도**하는 것이 현실적인 대응입니다.

```kotlin
fun executeWithRetry(maxRetries: Int = 3, action: () -> Unit) {
    var attempts = 0
    while (attempts < maxRetries) {
        try {
            action()
            return
        } catch (e: Exception) {
            if (isDeadlockException(e) && attempts < maxRetries - 1) {
                attempts++
                Thread.sleep(50L * attempts)  // 점진적 대기
            } else {
                throw e
            }
        }
    }
}
```

## 한눈에 보는 InnoDB 특화 락 개념

| 락 종류           | 잠금 대상                       | 목적                            |
|:-----------------:|:------------------------------:|:-------------------------------:|
| 레코드 락          | 특정 인덱스 레코드              | 행 단위 읽기/쓰기 제어            |
| 갭 락             | 인덱스 레코드 사이의 간격        | INSERT 차단 (Phantom 방지)       |
| 넥스트 키 락       | 레코드 + 앞 간격               | InnoDB RR의 기본 잠금 방식        |
| 의도 락 (IS/IX)   | 테이블                         | 행 락과 테이블 락 간 빠른 충돌 감지 |
| 테이블 락          | 테이블 전체                    | DDL, 명시적 LOCK TABLES          |

## 정리

1. **공유 락(S)과 배타 락(X)** — 모든 락의 기초입니다. S끼리는 호환되지만 X는 어떤 락과도 호환되지 않습니다
2. **일반 `SELECT`와 잠금 읽기를 구분해야 합니다** — InnoDB의 MVCC 스냅샷 읽기는 블로킹 없이 동작하지만, `FOR SHARE`, `FOR UPDATE`는 별도의 잠금 읽기입니다
3. **갭 락과 넥스트 키 락은 InnoDB 기준으로 이해해야 합니다** — Repeatable Read에서 Phantom Read를 줄이는 핵심 메커니즘이며, 인덱스 구조와 직접 연관되므로 적절한 인덱스 설계가 락 범위에 영향을 줍니다
4. **비관적 락 vs 낙관적 락** — 충돌 빈도와 정합성 요구 수준에 따라 선택합니다. 비관적 락은 DB 락(`FOR UPDATE`)을, 낙관적 락은 애플리케이션 레벨의 버전 관리를 사용합니다
5. **데드락은 완전히 제거하기 어렵습니다** — 락 획득 순서 통일, 트랜잭션 최소화, 적절한 인덱스가 예방의 핵심이며, 재시도 로직으로 대비합니다
6. **실무 판단** — 많은 경우 DB의 행 수준 락과 MVCC만으로도 충분하며, 명시적 락 전략은 동시성 문제가 실제로 발생하거나 발생 가능성이 높은 지점에 선별적으로 적용하는 것이 효과적입니다. 다만 잠금 범위와 팬텀 처리 방식은 엔진마다 다르므로 MySQL과 PostgreSQL을 같은 방식으로 단순화하면 안 됩니다

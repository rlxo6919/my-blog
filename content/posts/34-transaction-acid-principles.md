---
title: "트랜잭션 ACID 원칙 완전 정복 — `Atomicity`, `Consistency`, `Isolation`, `Durability`를 오해 없이 이해하기"
date: "2026-04-20"
category: "study"
tags: ["트랜잭션"]
excerpt: "ACID 네 가지 속성이 각각 무엇을 보장하고 무엇은 보장하지 않는지, MySQL InnoDB 기준 구현 포인트와 함께 정리합니다."
featured: true
---

## ACID, 왜 알아야 하나요?

트랜잭션을 쓴다고 말할 때 정말 중요한 것은 `BEGIN`과 `COMMIT` 문법이 아닙니다. **장애와 동시 요청이 들어왔을 때 무엇이 보장되고, 무엇은 직접 챙겨야 하는지**를 아는 것입니다.

다음 같은 상황에서 ACID를 정확히 이해할 필요가 있습니다.

- 계좌 이체 중 출금은 됐는데 입금 전에 예외가 발생했습니다
- 주문 저장은 성공했는데 재고 차감이나 포인트 적립은 실패했습니다
- `COMMIT` 직후 서버가 죽었는데, 방금 성공한 변경이 남아 있어야 합니다
- 같은 데이터를 여러 요청이 동시에 읽고 수정하는데 결과가 뒤엉키면 안 됩니다

ACID는 이런 상황에서 데이터베이스 트랜잭션이 어떤 신뢰성을 제공해야 하는지 설명하는 네 가지 속성입니다.

> **기준:** 이 글은 ACID의 일반 정의는 [PostgreSQL 18 Glossary](https://www.postgresql.org/docs/current/glossary.html)를 기준으로 설명하고, 구현 예시는 기존 시리즈와 맞춰 **MySQL 8.4 + `InnoDB`** 기준으로 설명합니다. `Atomicity`, `Isolation`, `Durability` 구현 포인트는 [MySQL 8.4 `InnoDB and the ACID Model`](https://dev.mysql.com/doc/refman/8.4/en/mysql-acid.html), [Transaction Isolation Levels](https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html), [Consistent Nonlocking Reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-consistent-read.html), [Optimizing InnoDB Transaction Management](https://dev.mysql.com/doc/refman/8.4/en/optimizing-innodb-transaction-management.html)를 참고했습니다. `Consistency`는 관계형 데이터베이스 일반 의미인 "**커밋 시점에 유효한 상태를 만족하는가**"를 중심으로 설명하되, MySQL 문서가 `doublewrite buffer`와 crash recovery 같은 내부 보호 메커니즘도 함께 언급한다는 점을 같이 짚습니다.

## 먼저 가장 짧은 답부터 보면

- `Atomicity` — **전부 성공하거나 전부 실패**해야 합니다
- `Consistency` — **커밋 결과**는 무결성 규칙을 만족하는 유효한 상태여야 합니다
- `Isolation` — 동시에 실행되는 트랜잭션이 서로를 **위험하게 끼어들지 못하게** 해야 합니다
- `Durability` — 한 번 `COMMIT`된 결과는 **장애 후에도 남아 있어야** 합니다

중요한 점은 네 속성이 따로 노는 체크박스가 아니라는 점입니다. 출금과 입금을 한 덩어리로 묶는 것은 `Atomicity`, 그 결과가 음수 잔액이나 깨진 참조를 남기지 않아야 하는 것은 `Consistency`, 동시에 다른 요청이 끼어들어 중간값을 보지 않게 하는 것은 `Isolation`, 성공 응답 뒤 장애가 나도 결과가 사라지지 않아야 하는 것은 `Durability`입니다.

계좌 이체 하나만 놓고 봐도 이렇게 나눠 볼 수 있습니다.

| 속성 | 계좌 이체에서의 의미 |
|------|----------------------|
| `Atomicity` | 출금과 입금이 함께 성공하거나 함께 실패해야 합니다 |
| `Consistency` | 총액 보존, 음수 잔액 금지 같은 규칙이 깨지면 안 됩니다 |
| `Isolation` | 동시에 다른 이체가 끼어들어 중간 잔액을 보고 잘못 계산하면 안 됩니다 |
| `Durability` | 이체 완료 응답 뒤 장애가 나도 결과가 사라지면 안 됩니다 |

## Phase 1. `Atomicity` — 왜 중간 성공 상태가 남으면 안 될까요?

### 핵심: 한 트랜잭션은 전부 반영되거나 전부 취소되어야 합니다

PostgreSQL glossary는 원자성(`Atomicity`)을 "**모든 작업이 하나의 단위로 완료되거나 하나도 완료되지 않는 성질**"로 설명합니다. MySQL 문서도 `Atomicity`를 주로 `InnoDB` 트랜잭션과 `COMMIT`/`ROLLBACK`, `autocommit`과 연결해서 설명합니다.

### 문제: 출금은 됐는데 입금 전에 실패하면 데이터가 깨집니다

계좌 이체를 예로 들어 보겠습니다.

```sql
UPDATE account
SET balance = balance - 10000
WHERE id = 1;

-- 여기서 애플리케이션 예외 발생

UPDATE account
SET balance = balance + 10000
WHERE id = 2;
```

트랜잭션 없이 이렇게 실행하면 첫 번째 `UPDATE`는 이미 반영됐는데, 두 번째 `UPDATE`는 실행되지 않을 수 있습니다. 그러면 돈은 한쪽 계좌에서만 빠져나간 상태가 됩니다.

### 해결: 하나의 업무 단위를 한 트랜잭션으로 묶습니다

```sql
START TRANSACTION;

UPDATE account
SET balance = balance - 10000
WHERE id = 1;

UPDATE account
SET balance = balance + 10000
WHERE id = 2;

COMMIT;
```

이제 중간에 오류가 나면 `ROLLBACK`되어 둘 다 반영되지 않습니다.

```sql
START TRANSACTION;

UPDATE account
SET balance = balance - 10000
WHERE id = 1;

-- 예외 발생
ROLLBACK;
```

핵심은 이것입니다.

- **업무적으로 하나여야 하는 작업은 DB에서도 하나의 단위로 커밋해야 합니다**
- 중간 단계가 밖으로 새면, 그 순간 `Atomicity`가 깨집니다

> **참고:** MySQL 기본값 `AUTOCOMMIT=1`에서는 각 SQL 문장이 자동으로 하나의 트랜잭션이 됩니다. 즉, 여러 SQL이 함께 성공하거나 함께 실패해야 하는 경우에는 **명시적으로 하나의 트랜잭션으로 묶어야** 합니다.

## Phase 2. `Consistency` — 일관성은 "내가 기대한 결과"와 같은 말일까요?

### 핵심: 커밋 시점의 데이터는 유효한 상태를 만족해야 합니다

PostgreSQL glossary는 `Consistency`를 "**데이터가 항상 integrity constraints를 만족하는 성질**"로 설명합니다. 이 정의가 ACID를 이해할 때 가장 직관적입니다.

즉, 트랜잭션은 잠깐 중간 상태를 거칠 수 있어도, **커밋되는 최종 상태는 유효해야** 합니다.

### 문제: 부분 성공이 아니라, 잘못된 상태 자체가 커밋될 수 있습니다

예를 들어 잔액이 음수가 되면 안 된다고 가정하겠습니다.

```sql
CREATE TABLE account (
    id BIGINT PRIMARY KEY,
    balance INT NOT NULL CHECK (balance >= 0)
);
```

이 상태에서 아래 트랜잭션이 실행되면:

```sql
START TRANSACTION;

UPDATE account
SET balance = balance - 10000
WHERE id = 1;

COMMIT;
```

잔액이 `-1000`이 된다면 `CHECK (balance >= 0)`를 위반하므로, 유효하지 않은 상태를 커밋할 수 없습니다.

여기서 중요한 점은 **"언제 검사하느냐"보다 "유효하지 않은 최종 상태를 남기지 않느냐"** 입니다. 실제로는 제약 종류와 DBMS에 따라 오류가 `UPDATE` 시점에 나기도 하고, `COMMIT` 시점에 나기도 합니다. ACID 관점의 핵심은 **잘못된 상태가 성공적으로 확정되지 않는 것**입니다.

### 무엇이 일관성을 만들까요?

일관성은 보통 아래 규칙들이 함께 만듭니다.

- `PRIMARY KEY`, `UNIQUE`
- `NOT NULL`
- `FOREIGN KEY`
- `CHECK`
- 트랜잭션 안에서 유지해야 하는 도메인 규칙

예를 들어 주문 헤더 없이 주문 항목만 들어가면 안 된다는 규칙은 `FOREIGN KEY`가 지켜 줍니다. 같은 쿠폰을 두 번 발급하면 안 된다는 규칙은 `UNIQUE`가 도와줄 수 있습니다.

### 여기서 많이 하는 오해

`Consistency`는 "**결과가 내가 원한 비즈니스 결과다**"와 같은 말이 아닙니다.

예를 들어 실수로 잘못된 사용자에게 포인트를 적립했는데:

- 참조 무결성은 맞고
- 음수 값도 없고
- `UNIQUE` 위반도 없고
- 모든 SQL이 정상 커밋됐다면

이 트랜잭션은 **ACID 관점에서는 consistent할 수 있습니다.** 하지만 비즈니스는 틀렸습니다.

즉:

- **ACID의 `Consistency`** — DB가 유효한 상태를 유지하는가
- **업무적 정합성** — 애플리케이션 로직이 진짜로 올바른 대상을 처리했는가

는 겹치지만 완전히 같은 말은 아닙니다.

> **참고:** MySQL의 `InnoDB and the ACID Model` 문서는 `Consistency`를 설명할 때 `doublewrite buffer`와 crash recovery 같은 내부 보호 메커니즘을 함께 언급합니다. 이것은 "유효한 상태가 장애 후에도 깨지지 않도록 엔진이 내부적으로 보호한다"는 관점입니다. 이 글에서는 독자가 가장 많이 헷갈리는 지점인 **무결성 규칙을 만족하는 상태**를 먼저 기준으로 잡고 읽는 편이 이해가 쉽습니다.

## Phase 3. `Isolation` — 동시에 실행되는데 왜 서로를 못 본다고 말할까요?

### 핵심: 동시에 실행되는 트랜잭션 사이의 간섭을 제어합니다

`Isolation`은 ACID의 네 속성 중 **동시성**과 가장 직접적으로 연결됩니다. MySQL 문서는 `Isolation`을 트랜잭션 격리 수준과 락, 그리고 `InnoDB`의 읽기 방식과 연결해 설명합니다.

문제는 트랜잭션이 동시에 실행될 수 있다는 점입니다.

```text
트랜잭션 A                  트랜잭션 B
────────────────────────────────────────────
SELECT balance = 10000
                            UPDATE balance = 5000
                            COMMIT
SELECT balance = ?
```

두 번째 `SELECT`가 무엇을 봐야 할까요?

- 항상 최신 커밋값을 볼 수도 있고
- 처음 읽은 시점의 스냅샷을 계속 볼 수도 있고
- 경우에 따라 대기하거나 락을 잡아야 할 수도 있습니다

이 선택을 구체화한 것이 **격리 수준**입니다.

### MySQL InnoDB는 어떻게 구현할까요?

MySQL 문서에 따르면 `InnoDB` 트랜잭션 모델은 **multi-versioning**과 **traditional two-phase locking**을 결합합니다.

- 일반 `SELECT`는 기본적으로 **nonlocking consistent read**로 동작합니다
- `REPEATABLE READ`에서는 트랜잭션 안의 일반 `SELECT`가 첫 읽기 시점의 스냅샷을 계속 봅니다
- `READ COMMITTED`에서는 각 읽기마다 더 새로운 스냅샷을 볼 수 있습니다
- `FOR UPDATE`, `FOR SHARE`, `UPDATE`, `DELETE`는 잠금 전략이 같이 개입합니다

즉, `Isolation`은 "무조건 락으로 다 막는다"가 아니라 **MVCC 스냅샷과 락을 조합해서 간섭을 제어하는 정책**에 가깝습니다.

### 그래서 실무에서는 어떻게 읽어야 할까요?

- `Isolation`은 **동시에 실행되는 트랜잭션끼리 무엇을 볼 수 있는지**의 문제입니다
- `Atomicity`가 한 트랜잭션 내부의 묶음이라면, `Isolation`은 여러 트랜잭션 사이의 경계입니다
- 격리 수준을 낮추면 동시성은 좋아질 수 있지만, `Dirty Read`, `Non-Repeatable Read`, `Phantom Read` 같은 이상 현상 가능성이 올라갑니다

격리 수준 자체는 이미 별도 글에서 자세히 다뤘으니, 여기서는 **ACID의 `I`가 바로 그 이야기**라고 연결해서 이해하면 됩니다.

> **참고:** 자세한 이상 현상과 격리 수준 차이는 [트랜잭션 격리 수준 완전 정복](/posts/07-transaction-isolation-levels), [Dirty Read와 Phantom Read는 실제로 언제 발생할까](/posts/23-when-dirty-read-and-phantom-read-actually-happen), [MVCC 완전 정복](/posts/09-mvcc-fundamentals) 글을 함께 보면 흐름이 이어집니다.

## Phase 4. `Durability` — `COMMIT` 성공 뒤 장애가 나도 왜 결과가 남아야 할까요?

### 핵심: 커밋된 변경은 장애 후에도 살아남아야 합니다

PostgreSQL glossary는 `Durability`를 "**한 번 커밋된 트랜잭션의 변경이 시스템 장애 후에도 남아 있는 성질**"로 설명합니다.

예를 들어 이 상황을 생각해 보겠습니다.

```sql
START TRANSACTION;

UPDATE account
SET balance = balance - 10000
WHERE id = 1;

COMMIT;
```

애플리케이션은 `COMMIT` 성공 응답을 받았습니다. 그런데 바로 직후 DB 프로세스가 죽거나 서버 전원이 나갔다면, 방금 성공한 변경은 어떻게 되어야 할까요?

`Durability`가 보장된다면 **재시작 후에도 그 변경은 남아 있어야 합니다.**

### MySQL InnoDB는 무엇에 의존할까요?

MySQL의 `InnoDB and the ACID Model` 문서는 `Durability`가 아래와 강하게 연결된다고 설명합니다.

- `innodb_flush_log_at_trx_commit`
- `sync_binlog` (`binary log`를 사용하는 환경)
- `doublewrite buffer`
- 저장장치의 write buffer
- 배터리 백업 캐시
- 운영체제의 `fsync()` 지원

즉, `Durability`는 단순히 SQL 문법만의 문제가 아니라 **로그 flush 전략, crash recovery, 운영체제, 스토리지 하드웨어까지 걸친 속성**입니다.

### 성능과 맞바꾸는 순간도 있습니다

MySQL 문서는 `Optimizing InnoDB Transaction Management`에서, 예상치 못한 종료 시 일부 최신 커밋 손실을 감수할 수 있다면 `innodb_flush_log_at_trx_commit=0`을 검토할 수 있다고 설명합니다.

이 말은 곧:

- 기본 설정에 가깝게 두면 더 강한 `Durability`
- flush를 느슨하게 하면 더 높은 처리량

사이의 트레이드오프가 있다는 뜻입니다.

### 그래서 실무에서는 이렇게 읽으면 됩니다

- `COMMIT` 성공은 "메모리에 잠깐 반영됨"이 아니라 **장애 후 복구 기준점이 생김**을 의미해야 합니다
- `Durability`는 DB 엔진만이 아니라 **스토리지와 운영체제 설정**에도 영향을 받습니다
- 성능 튜닝으로 flush 정책을 낮췄다면, **최신 커밋 일부 손실 가능성**을 팀이 명시적으로 알고 있어야 합니다

> **참고:** MySQL 문서도 `innodb_flush_log_at_trx_commit=1`이어도 운영체제나 하드웨어가 flush를 거짓 보고하면 완전한 보장을 약화시킬 수 있다고 설명합니다. 즉, `Durability`는 소프트웨어와 하드웨어가 함께 만드는 성질입니다.

## Phase 5. ACID가 있어도 안 막아주는 것들은 무엇일까요?

### 1. 외부 시스템까지 자동으로 하나의 트랜잭션이 되지는 않습니다

DB 트랜잭션 안에서 주문 저장과 재고 차감은 묶을 수 있어도, 같은 흐름에서:

- 이메일 발송
- Kafka 발행
- Redis 갱신
- 다른 서비스 HTTP 호출

까지 자동으로 같은 로컬 트랜잭션으로 묶이진 않습니다.

즉, DB는 `COMMIT`됐는데 메일 발송은 실패할 수 있습니다. 이 문제는 `ACID`만으로 해결되지 않고, `Outbox Pattern`, 재시도, 보상 트랜잭션 같은 별도 설계가 필요합니다.

### 2. 잘못된 비즈니스 로직까지 고쳐주지는 않습니다

트랜잭션이 ACID를 만족해도:

- 잘못된 사용자에게 돈을 보냈거나
- 할인 계산식이 틀렸거나
- 만료 쿠폰을 발급했다면

그건 트랜잭션 속성 문제가 아니라 **업무 로직 문제**입니다.

### 3. 동시성 비용이 사라지지는 않습니다

격리를 높이면 안전해지지만:

- 락 대기
- 데드락
- 긴 트랜잭션으로 인한 purge 지연
- 처리량 감소

같은 비용이 따라옵니다.

즉, ACID는 공짜가 아닙니다. 특히 `Isolation`과 `Durability`는 성능과 자주 맞물립니다.

## 한눈에 보는 ACID 비교

ACID는 글자만 외우기보다, 각 속성이 막는 실패 모드를 구분해서 보는 편이 훨씬 실용적입니다.

| 속성 | 가장 짧은 의미 | 주로 막는 문제 | MySQL InnoDB 기준 대표 수단 |
|------|----------------|----------------|------------------------------|
| `Atomicity` | 전부 성공하거나 전부 실패 | 출금만 되고 입금이 안 되는 부분 반영 | 트랜잭션, `COMMIT`, `ROLLBACK`, `autocommit` |
| `Consistency` | 커밋 결과가 유효한 상태를 만족 | 깨진 참조, 제약 위반, 유효하지 않은 상태 커밋 | 제약 조건, 트랜잭션, crash-safe 복구 |
| `Isolation` | 동시 실행 간섭 제어 | 중간값 노출, 반복 조회 결과 뒤틀림, 팬텀 | 격리 수준, MVCC, consistent read, row lock |
| `Durability` | 커밋 결과가 장애 후에도 유지 | 성공 응답 뒤 데이터 유실 | redo log flush, crash recovery, `innodb_flush_log_at_trx_commit`, 스토리지 flush |

## 실무에서는 이렇게 점검하면 됩니다

ACID를 읽고 나면 아래 질문으로 바로 연결해 보는 것이 좋습니다.

1. **이 작업은 정말 한 트랜잭션으로 묶여야 하나요?** 함께 실패해야 하는 SQL이라면 `Atomicity` 대상입니다.
2. **커밋 시점에 어떤 규칙이 반드시 유지돼야 하나요?** `UNIQUE`, `FOREIGN KEY`, `CHECK`, 애플리케이션 검증 중 어디에 둘지 결정해야 합니다.
3. **동시 요청이 들어오면 무엇을 보게 할 건가요?** 최신값, 스냅샷, 잠금 읽기 중 어떤 선택이 필요한지 봐야 합니다.
4. **`COMMIT` 성공 뒤 장애가 나면 어디까지 잃어도 되나요?** 이 질문이 `Durability` 설정과 인프라 선택을 바꿉니다.
5. **DB 밖의 부작용도 같은 성공/실패 단위로 묶어야 하나요?** 그렇다면 ACID만으로는 부족합니다.

## 정리

1. **`Atomicity`는 한 업무 단위를 중간 성공 없이 묶는 속성입니다.**
2. **`Consistency`는 커밋 시점의 결과가 무결성 규칙을 만족하는가를 묻습니다.** "내가 원하는 비즈니스 결과"와 완전히 같은 말은 아닙니다.
3. **`Isolation`은 동시에 실행되는 트랜잭션끼리 무엇을 보고 어디까지 간섭할 수 있는지 정하는 속성입니다.**
4. **`Durability`는 `COMMIT` 성공 후 장애가 나도 결과가 남아 있어야 한다는 속성입니다.**
5. **ACID는 데이터베이스 트랜잭션의 신뢰성을 설명하지만, 외부 시스템 연동이나 비즈니스 버그까지 자동으로 해결해 주지는 않습니다.**
6. **결국 ACID를 이해한다는 것은 `BEGIN`/`COMMIT` 문법을 아는 것이 아니라, 실패와 동시성 앞에서 무엇을 DB에 맡기고 무엇을 직접 설계해야 하는지 구분할 수 있다는 뜻입니다.**

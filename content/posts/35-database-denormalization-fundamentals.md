---
title: "반정규화 완전 정복 — 언제 쓰고, 무엇을 감수해야 하나요?"
date: "2026-04-21"
category: "study"
tags: ["정규화", "쿼리 최적화"]
excerpt: "반정규화가 무엇인지, 어떤 읽기 병목을 줄이기 위해 쓰는지, 그리고 정합성·갱신 비용을 어떻게 감수해야 하는지 공식 문서 기준으로 정리합니다."
---

## 반정규화, 왜 알아야 하나요?

정규화는 테이블 중복을 줄이고 이상 현상을 막는 데 큰 도움이 됩니다. 하지만 시스템이 커지면 다른 비용이 보이기 시작합니다.

- 주문 상세 화면 하나를 보여주기 위해 `customers`, `orders`, `order_items`, `products`를 계속 `JOIN`합니다
- 서비스가 분리된 뒤 주문 서비스가 고객 서비스 조회 실패 때문에 읽기 화면까지 함께 실패합니다
- 대시보드가 매번 큰 집계 쿼리를 다시 계산하느라 느립니다

이럴 때 검토하는 것이 **반정규화**입니다. 반정규화는 정규화를 부정하는 개념이 아니라, **읽기 비용을 줄이기 위해 중복이나 사전 계산을 의도적으로 도입하는 설계**입니다. 대신 쓰기 비용, 동기화 비용, 정합성 책임이 올라갑니다.

> **기준:** 이 글은 기존 시리즈와 맞춰 **OLTP 예시는 MySQL 8.4 + `InnoDB`**, **OLAP 예시는 BigQuery** 기준으로 설명합니다. 관계 무결성과 조인 계획은 [MySQL 8.4 `FOREIGN KEY` Constraints](https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html), [Optimizing Queries with `EXPLAIN`](https://dev.mysql.com/doc/refman/8.4/en/using-explain.html), [Nested Loop Join Algorithms](https://dev.mysql.com/doc/refman/8.4/en/nested-loop-joins.html), [Hash Join Optimization](https://dev.mysql.com/doc/refman/8.4/en/hash-joins.html)을 참고했습니다. 반정규화의 일반 개념과 마이크로서비스 관점의 중복 전략은 AWS Prescriptive Guidance의 [Denormalization strategy](https://docs.aws.amazon.com/prescriptive-guidance/latest/database-decomposition/joins.html), 분석용 반정규화는 BigQuery의 [Use nested and repeated fields](https://cloud.google.com/bigquery/docs/best-practices-performance-nested)를 함께 인용합니다.

## Phase 1. 반정규화는 무엇이고, 정규화와 무엇이 다른가요?

### 핵심: 중복을 없애는 설계가 정규화라면, 중복을 받아들이는 설계가 반정규화입니다

정규화의 목표는 보통 이렇습니다.

- 한 사실을 한 곳에서만 관리합니다
- `PRIMARY KEY`, `UNIQUE`, `FOREIGN KEY`로 관계와 무결성을 명확히 합니다
- 삽입 이상, 갱신 이상, 삭제 이상을 줄입니다

반정규화의 목표는 다릅니다.

- 여러 곳에서 함께 읽는 값을 **가까운 곳에 미리 둡니다**
- 반복되는 조인이나 집계를 **미리 계산한 결과**로 바꿉니다
- 읽기 지연, 서비스 간 결합, 대시보드 집계 비용을 줄입니다

예를 들어 정규화된 주문 모델은 이렇게 생길 수 있습니다.

```text
customers
  └─ orders
       └─ order_items
            └─ products
```

주문 화면에서 고객 이름, 주문 합계, 상품명 요약까지 보여주려면 여러 테이블을 함께 읽어야 합니다.

반정규화는 이런 식으로 접근합니다.

```text
orders
  - customer_name
  - customer_email
  - item_count
  - total_amount
```

또는 아예 읽기 전용 테이블을 따로 둡니다.

```text
order_summary
  - order_id
  - customer_name
  - customer_email
  - item_count
  - total_amount
  - last_ordered_at
```

핵심 차이는 이것입니다.

| 관점 | 정규화 | 반정규화 |
|------|--------|-----------|
| 중심 목표 | 중복 제거, 무결성 유지 | 읽기 경로 단축, 조회 단순화 |
| 데이터 위치 | 한 사실을 한 곳에 저장 | 같은 사실을 여러 곳에 둘 수 있음 |
| 강점 | 변경 관리가 단순함 | 읽기 성능과 독립성이 좋아질 수 있음 |
| 대가 | 조인과 집계가 늘 수 있음 | 동기화, 갱신 누락, 최신성 문제가 생김 |

## Phase 2. 조인이 있다고 바로 반정규화하면 안 되는 이유

### 문제: 느린 원인이 "정규화"가 아니라 실행 계획과 인덱스일 수 있습니다

실무에서 자주 하는 오해가 하나 있습니다.

`JOIN`이 보이면 곧바로 "정규화가 과해서 느리다"라고 결론 내리는 것입니다. 하지만 MySQL 공식 문서는 조인 계획이 하나가 아니라고 설명합니다. 옵티마이저는 조건 선택도, 인덱스 유무, `join_buffer_size`에 따라 **`Nested Loop`**, **`Hash Join`**, 그리고 인덱스를 활용하는 **`Batched Key Access`(`BKA`)** 같은 서로 다른 전략을 고릅니다.

예를 들어 MySQL의 `Nested Loop Join Algorithms` 문서는 다음 흐름을 설명합니다.

- 바깥쪽에서 소량의 행을 찾고
- 안쪽 테이블은 조인 키 인덱스로 찾는 경우
- `Nested Loop` + `ref`/`eq_ref` 인덱스 접근 조합이 자연스럽게 선택됩니다

반대로 등가 조건(`=`) 기반 조인이고 인덱스가 덜 효과적이라고 판단되면, MySQL 8.0.18 이후에는 옵티마이저가 `Hash Join`을 후보로 함께 두고 비용을 비교해 선택할 수 있습니다. 즉, **문제는 "조인이 존재한다"가 아니라 "현재 쿼리에 어떤 계획이 선택됐는가"** 입니다.

> **참고:** 과거 MySQL은 인덱스를 못 쓰는 조인에서 `Block Nested Loop`(`BNL`)를 썼지만, 8.0.20 이후 등가 조건의 `BNL`은 `Hash Join`으로 대체됐습니다. 따라서 8.4 기준으로는 `BNL`보다는 `Hash Join` 또는 `BKA` 쪽을 먼저 봐야 합니다.

예를 들어 아래 쿼리는 정규화된 모델에서 아주 흔합니다.

```sql
SELECT
    o.order_id,
    c.name,
    COUNT(oi.order_item_id) AS item_count,
    SUM(oi.quantity * oi.unit_price) AS total_amount
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
JOIN order_items oi ON oi.order_id = o.order_id
WHERE o.order_id = 1001
GROUP BY o.order_id, c.name;
```

이 쿼리가 느리다면 먼저 봐야 할 것은 반정규화가 아니라 아래입니다.

1. `EXPLAIN` 또는 `EXPLAIN ANALYZE`에서 어떤 조인 알고리즘이 선택됐는가
2. 조인 키와 필터 키에 인덱스가 있는가
3. 필요한 컬럼만 읽고 있는가
4. 매 요청마다 집계를 다시 계산하고 있는가

MySQL `FOREIGN KEY` 문서는 `FOREIGN KEY`가 **관련 테이블 사이의 참조 무결성**을 유지한다고 설명합니다. 참조 대상 컬럼은 `PRIMARY KEY`나 `UNIQUE` 인덱스가 필요하므로 참조 대상 쪽은 이미 인덱스가 전제되고, 참조하는 자식 테이블 쪽 컬럼에도 `InnoDB`가 인덱스가 없으면 자동으로 생성한다고 문서가 명시합니다. 즉 `FOREIGN KEY`가 걸린 조인 키는 대개 인덱스가 이미 걸려 있고, 나머지는 필터/정렬 키 인덱스 검토의 문제입니다.

즉, 다음 순서가 더 안전합니다.

1. **정규화된 모델을 먼저 유지합니다**
2. **실행 계획과 인덱스를 먼저 점검합니다**
3. **그래도 같은 읽기 비용이 반복 병목이면 반정규화를 검토합니다**

> **참고:** 조인이 느린 이유가 궁금하다면 [인덱스 완전 정복](/posts/06-index-tuning-fundamentals), [실행 계획 해석](/posts/11-explain-query-execution-plan), [정규화 규칙](/posts/05-database-normalization-rules) 글을 함께 보면 흐름이 자연스럽게 이어집니다.

## Phase 3. 반정규화의 진짜 비용은 저장 공간보다 정합성입니다

### 문제: 읽기는 쉬워지지만, 어떤 값을 언제 갱신할지 결정해야 합니다

AWS 문서는 반정규화를 "**의도적으로 중복을 도입하는 전략**"으로 설명하면서, 자주 함께 읽히는 필드만 선택적으로 복제하라고 권장합니다. 이 조언이 중요한 이유는, 중복이 늘수록 문제의 중심이 저장 공간이 아니라 **갱신 책임**으로 옮겨가기 때문입니다.

예를 들어 `orders.customer_email`을 복제했다고 가정해 보겠습니다.

고객이 이메일을 바꾸면 무엇이 정답일까요?

- 과거 주문에는 **주문 당시 이메일**이 남아야 할까요?
- 모든 주문 행이 **최신 이메일**로 바뀌어야 할까요?
- 일부 화면은 최신값, 일부 화면은 과거값을 써야 할까요?

이 질문에 먼저 답하지 않으면 반정규화는 금방 꼬입니다.

같은 "중복 컬럼"이어도 의미는 완전히 다를 수 있습니다.

| 중복 방식 | 의미 | 갱신 전략 |
|-----------|------|-----------|
| 스냅샷 컬럼 | 당시 값을 보존 | 원본 변경 시 갱신하지 않음 |
| 최신값 복제 | 현재 값을 빠르게 조회 | 이벤트, 배치, 트리거 등으로 재동기화 |
| 요약 값 | 집계 결과를 미리 저장 | 배치 또는 재계산 시점 관리 |

특히 MySQL `InnoDB`의 `FOREIGN KEY`가 주는 장점은 **DB가 관계 무결성을 직접 지켜준다**는 점입니다. 그런데 반정규화로 읽기 모델을 따로 만들거나 서비스별 DB로 나누면, 그 무결성 일부는 더 이상 단일 트랜잭션 안에서 보장되지 않습니다.

AWS Prescriptive Guidance도 이 지점을 분명히 말합니다.

- 서비스가 분리되면 데이터는 여러 DB에 흩어집니다
- 실시간 동기화는 종종 비현실적입니다
- 그래서 이벤트 기반 동기화, 버전 스탬핑, 주기적 재정합이 필요합니다

즉, 반정규화는 "중복을 좀 허용하자"가 아니라 **정합성 책임을 DB 밖으로 이동시키는 설계**일 수 있습니다.

## Phase 4. 대표적인 반정규화 방식은 어떻게 나뉘나요?

### 1. 함께 읽는 컬럼을 같은 행에 복제합니다

가장 직관적인 방식입니다. 주문 화면에서 항상 고객 이름과 이메일이 필요하다면 `orders` 또는 읽기 전용 `order_summary`에 함께 저장하는 식입니다.

```sql
CREATE TABLE order_summary (
    order_id BIGINT PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    customer_name VARCHAR(100) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    item_count INT NOT NULL,
    total_amount DECIMAL(18, 2) NOT NULL,
    ordered_at TIMESTAMP NOT NULL
);
```

이 방식이 잘 맞는 경우는 보통 이렇습니다.

- 한 화면에서 늘 같은 필드를 함께 읽습니다
- 원본 테이블 조합이 많아 읽기 SQL이 복잡합니다
- 복제할 필드 수가 적고 의미가 분명합니다

반대로 이런 경우는 위험합니다.

- 변경이 잦은 필드를 많이 복제합니다
- 어떤 값이 스냅샷인지 최신값인지 정하지 않았습니다
- 동기화 실패를 탐지할 방법이 없습니다

### 2. 집계를 요약 테이블로 미리 계산합니다

읽기 병목이 "조인"보다 "반복 집계"라면, 컬럼 복제보다 **요약 구조**가 더 깔끔할 때가 많습니다.

MySQL은 PostgreSQL이나 Oracle과 달리 `CREATE MATERIALIZED VIEW` 같은 네이티브 기능이 없습니다. 일반 `VIEW`는 쿼리 정의만 저장하기 때문에 원본 테이블을 매번 다시 읽습니다. 따라서 MySQL에서는 **요약 결과를 담을 실제 테이블을 만들고, 배치 잡이나 `Event Scheduler`로 주기적으로 재계산하는 패턴**을 사용합니다.

```sql
CREATE TABLE daily_order_summary (
    ordered_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL,
    order_count BIGINT NOT NULL,
    total_amount DECIMAL(18, 2) NOT NULL,
    PRIMARY KEY (ordered_date, status)
) ENGINE=InnoDB;
```

재계산은 같은 범위에 대해 `INSERT ... ON DUPLICATE KEY UPDATE`로 덮어쓰거나, 스케줄러로 일 단위 배치를 돌리는 식이 흔합니다.

```sql
INSERT INTO daily_order_summary (ordered_date, status, order_count, total_amount)
SELECT
    DATE(ordered_at) AS ordered_date,
    status,
    COUNT(*) AS order_count,
    SUM(total_amount) AS total_amount
FROM orders
WHERE ordered_at >= CURDATE() - INTERVAL 1 DAY
GROUP BY DATE(ordered_at), status
ON DUPLICATE KEY UPDATE
    order_count = VALUES(order_count),
    total_amount = VALUES(total_amount);
```

이 방식은 특히 아래 상황에 잘 맞습니다.

- 대시보드나 리포트가 같은 집계를 계속 읽습니다
- 약간의 지연 허용이 가능합니다
- 원본 트랜잭션 테이블 구조는 그대로 유지하고 싶습니다

> **참고:** `TRIGGER`로 요약 테이블을 실시간 갱신하는 방법도 있지만, 쓰기 트랜잭션 지연과 잠금 경합이 커지기 쉽습니다. 실무에서는 `Event Scheduler`나 외부 배치로 주기적 재계산을 두고, 필요한 경우에만 트리거를 좁게 적용하는 편이 안전합니다.

### 3. 분석 시스템에서는 중첩 구조로 반정규화합니다

BigQuery 공식 문서는 반정규화를 "**조인을 줄이기 위해 하나의 테이블에 컬럼을 추가하는 것**"으로 설명하고, 성능 최적화를 위해 `STRUCT`, `ARRAY` 같은 **nested and repeated fields**를 권장합니다.

문서가 강조하는 포인트는 명확합니다.

- 계층형 관계를 자주 함께 조회한다면 중첩 구조가 유리할 수 있습니다
- 반정규화는 데이터를 같은 실행 단위에 더 가깝게 모아 병렬 처리에 유리합니다
- 하지만 **star schema**는 이미 분석용으로 최적화돼 있어 추가 반정규화 이점이 크지 않을 수 있습니다

예를 들어 BigQuery에서는 주문과 주문 항목을 이렇게 표현할 수 있습니다.

```sql
CREATE TABLE orders (
    order_id STRING,
    customer STRUCT<
        customer_id STRING,
        name STRING,
        email STRING
    >,
    items ARRAY<STRUCT<
        product_id STRING,
        product_name STRING,
        quantity INT64,
        unit_price NUMERIC
    >>
);
```

이 모델은 **OLTP 테이블 설계**와는 결이 다릅니다. 트랜잭션 무결성보다, 분석 쿼리의 스캔 패턴과 셔플 비용을 더 중요하게 봅니다.

> **참고:** 그래서 "반정규화가 좋다/나쁘다"를 DB 종류와 워크로드를 빼고 말하면 거의 항상 틀립니다. 같은 반정규화라도 **주문 서비스의 읽기 모델**과 **BigQuery 분석 테이블**은 목표가 다릅니다.

## Phase 5. 언제 반정규화해야 하고, 언제 피해야 하나요?

### 써볼 만한 신호

아래 조건이 함께 보인다면 반정규화를 검토할 가치가 큽니다.

- 같은 읽기 패턴이 아주 자주 반복됩니다
- `EXPLAIN`과 인덱스 점검 뒤에도 조인/집계 비용이 핵심 병목입니다
- 자주 함께 읽는 필드가 소수이고, 의미가 분명합니다
- 최신값 지연 허용 범위가 명확합니다
- 동기화 방식이 이미 정해져 있습니다

### 피해야 할 신호

아래 조건이면 반정규화보다 모델 정리나 쿼리 개선이 먼저입니다.

- "일단 느리니까 붙여 넣자" 수준으로 범위가 불명확합니다
- 쓰기 비중이 높고, 변경 필드가 많습니다
- 어떤 값이 원본인지 애매합니다
- 재동기화, 재빌드, 검증 작업이 준비되지 않았습니다
- 커밋 시점에 강한 참조 무결성이 꼭 필요합니다

판단을 표로 줄이면 이렇습니다.

| 상황 | 먼저 할 일 | 반정규화 후보 |
|------|------------|----------------|
| 한 건 상세 조회가 느림 | `EXPLAIN`, 인덱스, 조회 컬럼 축소 | 필요한 스냅샷 컬럼 일부 복제 |
| 대시보드 집계가 느림 | 집계 범위, 인덱스, 캐시 검토 | 요약 테이블 + 배치/`Event Scheduler` 재계산 |
| 서비스 간 조회 의존이 큼 | API 경계, 캐시, 장애 전파 분석 | 읽기 모델, `CQRS`, 이벤트 복제 |
| BigQuery 분석 쿼리 셔플이 큼 | 쿼리 패턴, 계층 관계 확인 | `STRUCT`, `ARRAY` 기반 중첩 반정규화 |

## 정리

반정규화는 정규화의 반대말처럼 보이지만, 실제로는 **정규화된 기준 모델 위에 읽기 최적화를 덧붙이는 작업**에 가깝습니다. 기본 모델을 무너뜨리는 대신, 병목이 확인된 읽기 경로만 별도로 압축하는 편이 훨씬 안전합니다.

1. **반정규화는 기본값이 아니라 최적화입니다** — 먼저 정규화, 인덱스, 실행 계획 점검으로 문제를 좁혀야 합니다.
2. **조인 수보다 읽기 패턴이 중요합니다** — 늘 함께 읽는 데이터인지, 반복 집계인지가 판단 기준입니다.
3. **중복의 의미를 먼저 정해야 합니다** — 스냅샷인지, 최신값 복제인지, 요약 결과인지가 불분명하면 운영이 꼬입니다.
4. **정합성 책임은 사라지지 않고 이동합니다** — DB가 지키던 관계를 이벤트, 배치, 재정합, 버전 관리가 대신해야 할 수 있습니다.
5. **워크로드에 따라 답이 달라집니다** — OLTP에서는 선택적 복제와 읽기 모델이, OLAP에서는 중첩 구조와 요약 테이블이 더 자연스러울 수 있습니다.

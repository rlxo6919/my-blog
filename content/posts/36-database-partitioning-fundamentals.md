---
title: "MySQL 파티셔닝 완전 정복 — 수직/수평/범위 분할은 어떻게 쓰나요?"
date: "2026-04-21"
category: "study"
tags: ["파티셔닝", "쿼리 최적화"]
excerpt: "수직 분할과 수평 분할의 차이, MySQL 8.4가 지원하는 RANGE/LIST/HASH/KEY 파티셔닝의 쓰임과 제약을 공식 문서 기준으로 정리합니다."
---

## 파티셔닝, 왜 알아야 하나요?

테이블이 점점 커지다 보면 비슷한 증상이 보이기 시작합니다.

- 주문, 로그, 이벤트 테이블이 수억 행이 되어 풀 스캔 한 번에 I/O가 폭증합니다
- 과거 데이터만 지우고 싶은데 `DELETE FROM ... WHERE created_at < ?`가 몇 시간씩 걸립니다
- 월별/지역별로 성격이 다른 데이터인데 하나의 테이블/인덱스로 묶여 있어 캐시 효율이 떨어집니다

이런 상황에서 검토하는 것이 **파티셔닝**입니다. 파티셔닝은 **논리적으로는 하나의 테이블이지만, 물리적으로는 여러 조각(partition)으로 저장하는 구조**입니다. 같은 스키마, 같은 SQL을 유지하면서 저장/삭제/탐색 단위를 쪼개는 것이 핵심입니다.

> **기준:** 이 글은 **MySQL 8.4 + `InnoDB`** 기준으로 설명합니다. 파티셔닝 일반 개념과 제약은 [MySQL 8.4 Partitioning](https://dev.mysql.com/doc/refman/8.4/en/partitioning.html), 파티션 종류는 [Partitioning Types](https://dev.mysql.com/doc/refman/8.4/en/partitioning-types.html), 제약 사항은 [Restrictions and Limitations on Partitioning](https://dev.mysql.com/doc/refman/8.4/en/partitioning-limitations.html), 파티션 프루닝은 [Partition Pruning](https://dev.mysql.com/doc/refman/8.4/en/partitioning-pruning.html)을 참고했습니다. 이 글은 **단일 MySQL 노드 안에서 테이블을 쪼개는 파티셔닝**만 다루고, 여러 DB 노드로 나누는 **샤딩**은 다음 글에서 별도로 정리합니다.

## Phase 1. 수직 분할과 수평 분할은 어떻게 다른가요?

분할을 이야기할 때 가장 먼저 구분해야 하는 것이 **수직 분할**과 **수평 분할**입니다. 같은 "쪼갠다"는 말이지만, 쪼개는 방향이 다릅니다.

### 수직 분할 — 컬럼을 쪼개는 설계

수직 분할(`Vertical Partitioning`)은 **컬럼을 기준으로 테이블을 나누는 것**입니다. 한 테이블이 너무 많은 컬럼을 가지거나, 자주 읽는 컬럼과 거의 읽지 않는 컬럼이 섞여 있을 때 고려합니다.

예를 들어 `users` 테이블이 아래처럼 생겼다고 해 보겠습니다.

```text
users
  - user_id
  - email
  - name
  - signup_at
  - profile_image
  - self_introduction  (가끔만 읽힘, 크기 큼)
  - marketing_prefs    (가끔만 읽힘)
```

대부분의 요청은 `user_id`, `email`, `name`만 필요한데, `self_introduction`처럼 큰 컬럼이 같은 행에 붙어 있으면 매번 읽는 row 크기가 커집니다. 이럴 때 수직 분할은 이렇게 접근합니다.

```text
users
  - user_id (PK)
  - email
  - name
  - signup_at

user_profile_detail
  - user_id (PK, FK)
  - profile_image
  - self_introduction
  - marketing_prefs
```

자주 읽는 컬럼과 가끔 읽는 컬럼을 물리적으로 분리해, **뜨거운 테이블의 평균 행 크기를 줄입니다.** 대신 두 테이블을 함께 읽어야 하는 쿼리는 `JOIN`이 필요해집니다.

> **참고:** `InnoDB`는 이미 큰 `TEXT`/`BLOB`/큰 `VARCHAR` 값을 별도 페이지에 저장(off-page storage)하는 방식으로 내부적으로 비슷한 효과를 냅니다. 따라서 단순히 "행 크기가 크다"는 이유만으로 수직 분할을 강행할 필요는 없습니다. 접근 패턴이 다르거나, 보안/권한 경계가 다른 경우가 더 명확한 근거입니다.

### 수평 분할 — 행을 쪼개는 설계

수평 분할(`Horizontal Partitioning`)은 **행을 기준으로 나누는 것**입니다. 스키마는 동일하게 유지하고, 데이터를 어떤 키 기준으로 여러 조각에 분산시킵니다.

예를 들어 `orders` 테이블을 `ordered_at`의 월 범위로 나누면 이렇게 됩니다.

```text
orders  (논리적으로 하나의 테이블)
├─ p_2026_01  → ordered_at < 2026-02-01
├─ p_2026_02  → ordered_at < 2026-03-01
├─ p_2026_03  → ordered_at < 2026-04-01
└─ p_future   → 그 외 (MAXVALUE)
```

애플리케이션 입장에서는 여전히 `SELECT * FROM orders WHERE ...` 하나지만, MySQL은 조건을 보고 **필요한 파티션만 읽습니다**. 이걸 **partition pruning**이라고 합니다.

두 방식의 차이를 정리하면 이렇습니다.

| 관점 | 수직 분할 | 수평 분할 |
|------|-----------|-----------|
| 쪼개는 단위 | 컬럼 | 행 |
| 목표 | 뜨거운 테이블의 행 크기 축소, 접근 패턴 분리 | 대규모 행을 저장/삭제/탐색 단위로 분산 |
| 애플리케이션 영향 | 테이블 이름이 바뀌고 `JOIN`이 늘어남 | 같은 테이블 이름, SQL 변화 없음 |
| MySQL 네이티브 지원 | 직접 지원 없음 (스키마 설계로 구현) | `PARTITION BY`로 네이티브 지원 |

이 글에서 이후 "파티셔닝"이라고만 쓰면, 주로 **MySQL이 네이티브로 지원하는 수평 분할**을 가리킵니다.

## Phase 2. `PARTITION BY RANGE` — 시간이나 ID 범위로 나누기

수평 분할 중 가장 많이 쓰는 방식입니다. **연속적인 값의 범위**를 기준으로 파티션을 나누기 때문에, 시간 기반 데이터에 특히 잘 맞습니다.

### 기본 문법

```sql
CREATE TABLE orders (
    order_id BIGINT NOT NULL AUTO_INCREMENT,
    customer_id BIGINT NOT NULL,
    total_amount DECIMAL(18, 2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    ordered_at DATETIME NOT NULL,
    PRIMARY KEY (order_id, ordered_at)
) ENGINE=InnoDB
PARTITION BY RANGE (TO_DAYS(ordered_at)) (
    PARTITION p_2026_01 VALUES LESS THAN (TO_DAYS('2026-02-01')),
    PARTITION p_2026_02 VALUES LESS THAN (TO_DAYS('2026-03-01')),
    PARTITION p_2026_03 VALUES LESS THAN (TO_DAYS('2026-04-01')),
    PARTITION p_future  VALUES LESS THAN MAXVALUE
);
```

`PRIMARY KEY`에 `ordered_at`이 포함된 이유는 뒤 Phase 5에서 다시 짚습니다. 지금은 **파티션 키가 모든 유일 키에 포함되어야 한다**고만 알고 넘어가면 됩니다.

### 왜 `RANGE`가 잘 맞나요?

첫째, **partition pruning 효과가 큽니다**. 아래 쿼리를 실행하면 MySQL은 `ordered_at` 조건이 걸린 파티션만 접근합니다.

```sql
SELECT COUNT(*) FROM orders
WHERE ordered_at >= '2026-03-01' AND ordered_at < '2026-04-01';
```

[`EXPLAIN`](/posts/11-explain-query-execution-plan) 결과의 `partitions` 컬럼을 보면 `p_2026_03` 하나만 찍혀 있는 것을 확인할 수 있습니다.

둘째, **과거 데이터 아카이빙이 사실상 상수 시간입니다**. `DELETE FROM orders WHERE ordered_at < '2026-02-01'`은 수억 행을 삭제해야 하지만, 아래는 메타데이터 수준의 연산입니다.

```sql
ALTER TABLE orders DROP PARTITION p_2026_01;
```

이 "오래된 파티션을 `DROP` 해서 지우는 아카이빙 전략"은 `RANGE` 파티셔닝을 쓰는 가장 큰 이유 중 하나입니다.

### `RANGE COLUMNS` — 날짜/문자열을 직접 쓰고 싶을 때

`PARTITION BY RANGE`는 정수 표현식만 받습니다. 그래서 위 예시에서 `TO_DAYS(ordered_at)`처럼 감싸 줘야 했습니다. `RANGE COLUMNS`는 이 제약 없이 `DATE`, `DATETIME`, 문자열 등을 직접 쓸 수 있습니다.

```sql
PARTITION BY RANGE COLUMNS (ordered_at) (
    PARTITION p_2026_01 VALUES LESS THAN ('2026-02-01'),
    PARTITION p_2026_02 VALUES LESS THAN ('2026-03-01'),
    PARTITION p_future  VALUES LESS THAN (MAXVALUE)
);
```

실무에서는 가독성과 DBA 친화성 때문에 `RANGE COLUMNS` 쪽을 선호하는 경우가 많습니다.

## Phase 3. `PARTITION BY HASH` / `KEY` — 균등 분포가 필요할 때

`RANGE`는 값의 분포가 편향되어 있으면 파티션 크기 불균형이 생깁니다. 예를 들어 최근 달 파티션에 트래픽이 몰리면, 그 파티션만 뜨거워집니다.

이럴 때는 `HASH`나 `KEY` 파티셔닝으로 **행을 여러 파티션에 균등하게 분산**시키는 방식을 씁니다.

### `HASH` — 사용자 표현식 기반

```sql
CREATE TABLE user_activities (
    activity_id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    action VARCHAR(50) NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (activity_id, user_id)
) ENGINE=InnoDB
PARTITION BY HASH (user_id)
PARTITIONS 8;
```

MySQL이 `user_id mod 8`로 파티션을 결정합니다. 사용자가 골고루 분포한다면 파티션 크기도 고르게 유지됩니다.

### `KEY` — MySQL 내부 해시 기반

`HASH`는 정수 표현식만 받지만, `KEY`는 MySQL 내부 해시 함수를 사용해 **정수가 아닌 컬럼도 받을 수 있습니다**.

```sql
PARTITION BY KEY (user_uuid) PARTITIONS 8;
```

`user_uuid`가 `CHAR(36)`이어도 문제없이 동작합니다. 파티션 키 컬럼을 생략하면 `PRIMARY KEY`를 기본으로 사용합니다.

### `HASH`/`KEY`의 트레이드오프

- **장점**: 균등 분포, 핫스팟 방지
- **단점**: 값 범위로 pruning이 어렵습니다. `WHERE created_at BETWEEN ...` 같은 조건은 모든 파티션을 읽습니다. pruning은 파티션 키에 대한 등가 조건(`=`)이나 `IN`에서만 기대할 수 있습니다
- **리파티셔닝 비용**: `PARTITIONS 8`에서 `PARTITIONS 16`으로 바꾸면, 대부분의 행이 재배치됩니다. 이 점은 애플리케이션 레벨 샤딩에서도 동일하게 발생합니다

> **참고:** `LINEAR HASH`/`LINEAR KEY`는 표준 `HASH`/`KEY`의 변형으로, 파티션 추가/삭제 시 재배치 비용을 줄여 줍니다. 대신 분포가 일반 `HASH`보다 덜 균등할 수 있습니다. 파티션 수를 자주 바꿔야 하는 환경에서 검토할 수 있습니다.

## Phase 4. `PARTITION BY LIST` — 이산 값으로 나누기

`LIST`는 **정해진 이산 값 집합**으로 나눌 때 씁니다. 지역 코드, 상태값, 국가 코드처럼 범위가 아니라 "목록"에 가까운 경우입니다.

```sql
CREATE TABLE orders (
    order_id BIGINT NOT NULL AUTO_INCREMENT,
    region_code VARCHAR(10) NOT NULL,
    customer_id BIGINT NOT NULL,
    ordered_at DATETIME NOT NULL,
    PRIMARY KEY (order_id, region_code)
) ENGINE=InnoDB
PARTITION BY LIST COLUMNS (region_code) (
    PARTITION p_kr VALUES IN ('KR'),
    PARTITION p_jp VALUES IN ('JP'),
    PARTITION p_us VALUES IN ('US', 'CA'),
    PARTITION p_eu VALUES IN ('DE', 'FR', 'IT', 'ES')
);
```

이 방식은 **지역별 접근이 분리되는 서비스**에 잘 맞습니다. 예를 들어 한국 트래픽은 `p_kr` 파티션만 건드리므로, 다른 지역 데이터의 인덱스/버퍼풀 경쟁이 줄어듭니다.

`RANGE`와 달리 `LIST`는 **정의되지 않은 값이 들어오면 에러**가 납니다. 새 지역이 추가되면 `ALTER TABLE ... ADD PARTITION`으로 파티션을 추가해야 합니다. `DEFAULT` 파티션을 두는 옵션도 있습니다.

```sql
PARTITION p_etc DEFAULT
```

## Phase 5. 파티셔닝의 제약과 함정

파티셔닝은 "마법처럼 빨라지는 기능"이 아닙니다. MySQL 공식 문서가 명시하는 제약이 생각보다 많고, 이걸 먼저 이해해야 설계가 어긋나지 않습니다.

### 1. `PRIMARY KEY`/`UNIQUE`는 파티션 키를 **모두 포함**해야 합니다

MySQL 문서의 제약 중 가장 강한 규칙입니다.

> 모든 유일 키(primary key 포함)는 테이블의 파티셔닝 표현식에 쓰인 **모든 컬럼을 포함**해야 합니다.

그래서 Phase 2 예시에서도 `PRIMARY KEY (order_id, ordered_at)`처럼 `ordered_at`이 PK에 포함됐습니다. 이 규칙 때문에 기존 테이블에 파티셔닝을 적용할 때 PK 구조부터 바꿔야 하는 경우가 많습니다.

### 2. `FOREIGN KEY`를 사용할 수 없습니다

`InnoDB` 파티셔닝 테이블은 `FOREIGN KEY`를 걸 수 없습니다. 양방향 모두 제한됩니다.

- 파티셔닝된 테이블이 다른 테이블을 `FOREIGN KEY`로 참조할 수 없고
- 다른 테이블이 파티셔닝된 테이블을 `FOREIGN KEY`로 참조할 수도 없습니다

참조 무결성이 중요한 도메인에서는 이 제약 때문에 파티셔닝을 포기하거나, 무결성 검증을 애플리케이션/배치 레벨로 옮겨야 합니다. 이때는 [반정규화 글](/posts/35-database-denormalization-fundamentals)에서 다룬 "`FOREIGN KEY`가 지켜주던 무결성이 애플리케이션 책임으로 이동한다"는 이야기가 그대로 재등장합니다.

### 3. 파티션 키가 조건에 없으면 pruning이 동작하지 않습니다

가장 흔한 실수입니다. 아래 쿼리는 `orders`가 `ordered_at`으로 파티셔닝돼 있어도, 모든 파티션을 스캔합니다.

```sql
SELECT * FROM orders WHERE customer_id = 1001;
```

`EXPLAIN`의 `partitions` 컬럼에 모든 파티션이 찍히면, 파티셔닝이 주는 이득이 거의 없다는 신호입니다. 파티션 키는 **실제 주요 쿼리의 `WHERE` 절에 들어가는 컬럼**으로 골라야 합니다.

### 4. 파티션 수가 과하면 메타데이터 비용이 커집니다

MySQL 8.4는 테이블당 최대 **8,192개의 파티션**을 지원하지만, 실무적으로 수백 개 이상이 되면 파일 핸들, 데이터 딕셔너리, `OPEN`/`CLOSE` 비용이 무시하기 어려워집니다. 파티션이 많다고 성능이 좋아지는 것은 아니므로, **삭제/아카이빙 주기에 맞춘 적정 수**를 먼저 정하는 편이 안전합니다.

### 5. 지원되지 않는 기능

파티셔닝된 테이블에서는 다음이 제한됩니다.

- `FULLTEXT` 인덱스
- `SPATIAL` 데이터 타입(`POINT`, `GEOMETRY`)
- 임시 테이블(`TEMPORARY TABLE`)
- `FOREIGN KEY`

이 중 하나라도 핵심이라면 파티셔닝 대신 다른 전략(스키마 분리, 샤딩, 별도 검색 엔진)을 검토해야 합니다.

## Phase 6. 언제 파티셔닝을 써야 하고, 언제 피해야 하나요?

### 써볼 만한 신호

- **시간 기반 데이터**이고, 오래된 데이터를 정기적으로 삭제/아카이빙합니다 → `RANGE` 또는 `RANGE COLUMNS`가 강력합니다
- **명확한 범주**(지역, 상태, 고객 등급)가 있고, 범주별로 접근이 분리됩니다 → `LIST COLUMNS`가 자연스럽습니다
- **단일 키 기반 조회**가 대부분이고, 키 분포가 균등해야 합니다 → `HASH`/`KEY`가 후보입니다
- 실제 주요 쿼리의 `WHERE` 절이 **파티션 키를 포함합니다**

### 피해야 할 신호

- 주요 쿼리가 파티션 키를 거의 쓰지 않아 매번 모든 파티션을 스캔합니다
- `FOREIGN KEY` 기반 무결성이 도메인 모델의 핵심입니다
- 테이블 크기가 커졌다는 것 말고는 뚜렷한 접근 패턴 분리가 없습니다 → 인덱스/쿼리 튜닝이 먼저입니다
- 데이터가 한 노드에 담기 어려울 만큼 크다 → 파티셔닝이 아니라 **[샤딩](/posts/37-database-sharding-fundamentals)** 이 필요한 상황입니다

판단을 표로 줄이면 이렇습니다.

| 상황 | 먼저 할 일 | 파티셔닝 후보 |
|------|------------|----------------|
| 수억 행 로그/주문 테이블, 오래된 데이터 주기적 삭제 | 인덱스 점검, 삭제 주기 정의 | `RANGE(ordered_at)` + `DROP PARTITION` |
| 지역별/상태별로 접근이 명확히 분리됨 | 쿼리 패턴 확인 | `LIST COLUMNS(region_code)` |
| 특정 사용자 행에 트래픽 집중, 범위 조회 드묾 | 핫스팟 확인 | `HASH(user_id)` 또는 `KEY(user_id)` |
| 데이터가 한 서버 디스크에 안 들어감 | 용량/IOPS 한계 분석 | 파티셔닝이 아니라 **[샤딩](/posts/37-database-sharding-fundamentals)** 검토 |

## 정리

파티셔닝은 "테이블이 커졌으니 나눈다"보다, **저장/삭제/탐색 단위를 의도적으로 쪼개는 설계**입니다. 같은 SQL을 유지하면서 I/O 범위를 좁히는 것이 핵심이고, 이 효과는 **파티션 키가 실제 쿼리의 `WHERE` 절과 맞을 때**만 나타납니다.

1. **수직/수평을 먼저 구분합니다** — 컬럼을 쪼개는지 행을 쪼개는지에 따라 문제도 다르고 해법도 다릅니다.
2. **MySQL 네이티브 파티셔닝은 수평 분할입니다** — `RANGE`, `LIST`, `HASH`, `KEY` 그리고 `COLUMNS` 변형이 선택지입니다.
3. **파티션 키는 쿼리 패턴이 결정합니다** — 실제 주요 `WHERE` 조건에 들어가는 컬럼이어야 pruning이 살아납니다.
4. **제약이 먼저입니다** — `PRIMARY KEY`/`UNIQUE`가 파티션 키를 포함해야 하고, `FOREIGN KEY`를 쓸 수 없습니다. 이 두 제약만으로도 적용 가능성이 갈립니다.
5. **파티셔닝과 샤딩은 다른 문제입니다** — 파티셔닝은 한 노드 안에서 테이블을 쪼개는 설계이고, 여러 노드로 데이터를 분산시키는 [샤딩](/posts/37-database-sharding-fundamentals)은 라우팅, 글로벌 `UNIQUE`, 리샤딩 같은 또 다른 주제를 데려옵니다.

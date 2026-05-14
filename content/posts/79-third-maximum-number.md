---
title: "Third Maximum Number — 세 변수로 상위 3개를 추적해 찾기"
date: "2026-05-14"
category: "study"
tags: ["알고리즘", "배열"]
excerpt: "정수 배열에서 세 번째로 큰 서로 다른 값을 찾는 LeetCode 414번, 정렬 풀이부터 세 변수로 상위 3개를 한 번에 추적하는 `O(n)` 풀이까지 정리합니다."
---

## 세 번째 최댓값, 어떤 문제인가요?

LeetCode `414`번 문제는 이렇게 주어집니다.

> 정수 배열 `nums`가 주어질 때, 세 번째로 큰 서로 다른(distinct) 값을 반환하세요. 만약 세 번째 최댓값이 존재하지 않는다면 최댓값을 반환합니다.

예시는 이렇습니다.

- `nums = [3, 2, 1]` → `1`
  - 첫 번째 최대 `3`, 두 번째 `2`, 세 번째 `1`
- `nums = [1, 2]` → `2`
  - 서로 다른 값이 두 개뿐이라 세 번째 최댓값이 없음 → 최댓값 `2` 반환
- `nums = [2, 2, 3, 1]` → `1`
  - 서로 다른 값은 `{3, 2, 1}` → 세 번째 최대는 `1`

제약은 다음과 같습니다.

- `1 <= nums.length <= 10^4`
- `-2^31 <= nums[i] <= 2^31 - 1`

이 문제의 핵심은 두 가지입니다. **서로 다른 값만 센다는 것**과 **값이 부족할 때는 그냥 최댓값을 반환한다는 점**입니다. 입력 범위가 `Int` 전 구간을 덮기 때문에 "비어 있음"을 표시할 보초값 처리도 함께 신경 써야 합니다. 이 글에서는 정렬해서 세 번째를 고르는 풀이부터, 크기 3짜리 정렬 셋을 유지하는 풀이, 마지막으로 세 변수로 상위 3개를 한 번에 추적하는 `O(n)` 풀이까지 정리하겠습니다. 시간·공간 복잡도 표기가 익숙하지 않다면 [시간 복잡도와 공간 복잡도 완전 정복](/posts/52-time-and-space-complexity)을 먼저 읽어 보시는 것을 권합니다.

## 문제를 다시 보기

"세 번째로 큰 서로 다른 값"이라는 표현이 약간 헷갈릴 수 있습니다.

예를 들어 `nums = [2, 2, 3, 1]`이 있다고 합시다. 단순히 정렬하면 이렇게 됩니다.

```text
[1, 2, 2, 3]
```

여기서 "세 번째로 큰 값"이 무엇이냐고 물으면, 위치 기준으로는 `2`입니다. 하지만 문제가 묻는 것은 **서로 다른 값** 기준입니다.

```text
서로 다른 값만 모으기: {3, 2, 1}
큰 순서로 정렬:        [3, 2, 1]
세 번째:               1
```

그래서 정렬했더라도 중복을 한 번 더 걸러내야 합니다.

서로 다른 값이 세 개 미만이라면 정의상 세 번째 최댓값이 없으므로, 그냥 최댓값을 반환합니다.

```text
nums = [1, 2]
서로 다른 값: {1, 2}  → 두 개뿐
→ 최댓값 2 반환
```

## Phase 1. 중복 제거 후 정렬해서 세 번째 고르기

가장 직관적인 풀이는 중복을 제거한 뒤 내림차순으로 정렬해 인덱스 `2`를 꺼내는 방법입니다.

```kotlin
fun thirdMax(nums: IntArray): Int {
    val distinct = nums.distinct().sortedDescending()

    return if (distinct.size < 3) distinct[0] else distinct[2]
}
```

`distinct()`는 중복을 제거한 리스트를 만들고, `sortedDescending()`은 내림차순으로 정렬합니다.

- `nums = [3, 2, 1]` → `distinct = [3, 2, 1]` → `distinct[2]` = `1`
- `nums = [1, 2]` → `distinct = [2, 1]` → 길이 < 3이므로 `distinct[0]` = `2`
- `nums = [2, 2, 3, 1]` → `distinct = [3, 2, 1]` → `distinct[2]` = `1`

흐름은 단순합니다.

1. `distinct()`로 중복 제거
2. `sortedDescending()`으로 내림차순 정렬
3. 서로 다른 값이 `3`개 미만이면 최댓값(`distinct[0]`) 반환
4. 그렇지 않으면 인덱스 `2`(세 번째) 반환

정렬 비용 때문에 시간 복잡도는 `O(n log n)`이고, 중간 리스트 두 개를 만들기 때문에 추가 공간은 `O(n)`입니다.

제약이 `n <= 10^4`이라 이 풀이만으로도 충분히 통과합니다. 하지만 문제 끝에는 "`O(n)` 풀이가 가능한가요?"라는 follow-up이 붙어 있습니다. 정렬은 사실 상위 3개만 알면 되기 때문에, 전체를 정렬하는 비용이 과합니다.

## Phase 2. 크기 3짜리 정렬 셋만 유지하기

`TreeSet`에 값을 넣으면서 **크기가 3을 넘으면 가장 작은 원소를 빼는** 방식으로, 항상 상위 3개의 서로 다른 값만 들고 다닐 수 있습니다.

```kotlin
import java.util.TreeSet

fun thirdMax(nums: IntArray): Int {
    val top3 = TreeSet<Int>()

    for (n in nums) {
        top3.add(n)
        if (top3.size > 3) {
            top3.pollFirst()
        }
    }

    return if (top3.size < 3) top3.last() else top3.first()
}
```

`TreeSet`은 내부적으로 정렬된 상태를 유지하므로 다음 연산이 모두 가능합니다.

- `first()` → 셋 안에서 가장 작은 값
- `last()` → 셋 안에서 가장 큰 값
- `pollFirst()` → 가장 작은 값을 꺼내면서 제거
- `add(n)` → 이미 있는 값이면 아무것도 하지 않음(중복 자동 제거)

`nums = [2, 2, 3, 1]` 처리 과정은 이렇습니다.

```text
초기: top3 = {}
n=2: add → {2}
n=2: add(중복) → {2}
n=3: add → {2, 3}
n=1: add → {1, 2, 3}  ← size == 3
최종: top3 = {1, 2, 3}
```

크기가 정확히 `3`이므로 `first()` = `1`을 반환합니다.

`nums = [5, 2, 4, 1, 3, 6]`이라면 이렇게 흘러갑니다.

```text
초기: top3 = {}
n=5: {5}
n=2: {2, 5}
n=4: {2, 4, 5}
n=1: add → {1, 2, 4, 5} → size=4 → pollFirst → {2, 4, 5}
n=3: add → {2, 3, 4, 5} → size=4 → pollFirst → {3, 4, 5}
n=6: add → {3, 4, 5, 6} → size=4 → pollFirst → {4, 5, 6}
최종: top3 = {4, 5, 6}
```

서로 다른 값은 `{1, 2, 3, 4, 5, 6}`이고 세 번째 최댓값은 `4`입니다. `first()` = `4`와 일치합니다.

`TreeSet`의 `add`와 `pollFirst`는 셋 크기가 `k`일 때 `O(log k)`인데 여기서 `k` 는 최대 `3`이라 사실상 상수입니다. 전체 시간 복잡도는 `O(n)`이고, 추가 공간은 셋의 원소가 최대 `3`개라 `O(1)`입니다.

## Phase 3. 세 변수로 상위 3개 한 번에 추적하기

`TreeSet`을 쓰지 않고도 변수 세 개만으로 같은 일을 할 수 있습니다.

- `first` — 지금까지 본 값 중 가장 큰 서로 다른 값
- `second` — 두 번째로 큰 서로 다른 값
- `third` — 세 번째로 큰 서로 다른 값

각 원소 `n`에 대해 다음 규칙을 적용합니다.

1. 이미 `first`, `second`, `third` 중 하나와 같으면 건너뜀 (서로 다른 값만 필요)
2. `n > first`면 `first`를 밀어내고 갱신 (`third ← second`, `second ← first`, `first ← n`)
3. `n > second`면 `second`만 밀어냄 (`third ← second`, `second ← n`)
4. `n > third`면 `third`만 갱신 (`third ← n`)

문제는 보초값입니다. 입력값이 `Int.MIN_VALUE`까지 나올 수 있어서 `Int.MIN_VALUE`를 "비어 있음" 표시로 쓸 수 없습니다. 한 단계 위인 `Long`을 사용하면 안전합니다.

```kotlin
fun thirdMax(nums: IntArray): Int {
    var first = Long.MIN_VALUE
    var second = Long.MIN_VALUE
    var third = Long.MIN_VALUE

    for (n in nums) {
        val v = n.toLong()
        if (v == first || v == second || v == third) continue

        when {
            v > first -> {
                third = second
                second = first
                first = v
            }
            v > second -> {
                third = second
                second = v
            }
            v > third -> {
                third = v
            }
        }
    }

    return if (third == Long.MIN_VALUE) first.toInt() else third.toInt()
}
```

`nums = [2, 2, 3, 1]` 처리 과정은 이렇습니다.

```text
초기: first=MIN, second=MIN, third=MIN
n=2: v > first  → first=2,  second=MIN, third=MIN
n=2: v == first → 건너뜀
n=3: v > first  → first=3,  second=2,   third=MIN
n=1: v > third  → first=3,  second=2,   third=1
최종: third != MIN → 1 반환
```

`nums = [1, 2]`라면 이렇게 흘러갑니다.

```text
초기: first=MIN, second=MIN, third=MIN
n=1: v > first  → first=1,  second=MIN, third=MIN
n=2: v > first  → first=2,  second=1,   third=MIN
최종: third == MIN → first 반환 = 2
```

서로 다른 값이 세 개 미만일 때 `third`는 그대로 `Long.MIN_VALUE`로 남으므로, 이 값을 "세 번째 최댓값 없음" 신호로 사용해 `first`를 반환합니다.

`nums = [Int.MIN_VALUE, 1, 2]`도 잘 동작합니다.

```text
초기: first=Long.MIN_VALUE, second=Long.MIN_VALUE, third=Long.MIN_VALUE
n=Int.MIN_VALUE: v > first → first=Int.MIN_VALUE, second=Long.MIN_VALUE, third=Long.MIN_VALUE
n=1: v > first → first=1, second=Int.MIN_VALUE, third=Long.MIN_VALUE
n=2: v > first → first=2, second=1, third=Int.MIN_VALUE
최종: third != Long.MIN_VALUE → Int.MIN_VALUE 반환
```

여기서 `Int`와 `Long`을 섞어 쓰는 이유가 분명해집니다. **`Int.MIN_VALUE`도 정상적인 입력값**이기 때문에, "비어 있음"을 표시할 자리가 `Int` 범위 밖에 있어야 합니다. `Long.MIN_VALUE`는 `Int.MIN_VALUE`보다 훨씬 작으므로 실제 입력과 겹치지 않습니다.

시간 복잡도는 한 번 순회라서 `O(n)`이고, 사용한 추가 공간은 변수 세 개라서 `O(1)`입니다.

> **참고:** 굳이 `Long`을 쓰지 않고도 `Long?`(nullable)이나 별도의 `isSet` 플래그로도 같은 효과를 낼 수 있습니다. 다만 비교 분기마다 `null` 체크가 들어가 코드가 길어지므로, `Long.MIN_VALUE`를 보초값으로 두는 쪽이 보통 더 간결합니다.

## 엣지 케이스

자주 확인해 볼 만한 입력은 이렇습니다.

| 입력 | 결과 | 이유 |
| --- | --- | --- |
| `[3, 2, 1]` | `1` | 정확히 세 개의 서로 다른 값 |
| `[1, 2]` | `2` | 서로 다른 값이 두 개 → 최댓값 |
| `[2, 2, 3, 1]` | `1` | 중복 제거 후 `{3, 2, 1}` |
| `[1, 1, 1]` | `1` | 서로 다른 값 하나 → 최댓값 |
| `[1, 2, 2, 5, 3, 5]` | `2` | 서로 다른 값 `{1, 2, 3, 5}` |
| `[Int.MIN_VALUE, 1, 2]` | `Int.MIN_VALUE` | 보초값과 입력이 충돌하지 않아야 함 |

특히 중복이 포함된 입력과 `Int.MIN_VALUE`가 섞인 입력을 반드시 확인해야 합니다. 전자는 "서로 다른 값"이라는 조건을, 후자는 보초값 처리를 검증합니다.

## 세 풀이를 다시 비교

| 풀이 | 시간 | 공간 | 특징 |
| --- | --- | --- | --- |
| 중복 제거 후 정렬 | `O(n log n)` | `O(n)` | 가장 직관적, 한 줄 풀이 |
| 크기 3짜리 `TreeSet` 유지 | `O(n)` | `O(1)` | 상위 3개만 들고 다니는 발상 |
| 세 변수 한 번 순회 | `O(n)` | `O(1)` | 자료구조 없이 변수만으로 추적 |

## 마무리

1. **이 문제는 "서로 다른 값" 기준으로 세 번째 최댓값을 묻습니다** — 단순 정렬 후 인덱스 `n-3`만 보면 중복 때문에 틀릴 수 있습니다
2. **서로 다른 값이 세 개 미만이면 그냥 최댓값을 반환합니다** — 별도 분기로 명시적으로 처리해야 합니다
3. **상위 3개만 알면 되므로 전체 정렬은 과합니다** — 크기 3짜리 정렬 셋이나 변수 세 개로 충분합니다
4. **`Int.MIN_VALUE`도 정상 입력이므로 보초값은 `Long.MIN_VALUE`처럼 한 단계 넓은 범위에서 골라야 합니다** — `Int.MIN_VALUE`를 "비어 있음"으로 쓰면 실제 입력과 충돌합니다

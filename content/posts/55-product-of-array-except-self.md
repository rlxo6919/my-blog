---
title: "Product of Array Except Self — 나눗셈 없이 `O(n)`/`O(1)`로 나머지 곱 구하기"
date: "2026-04-27"
category: "study"
tags: ["알고리즘"]
excerpt: "자기 자신을 제외한 나머지 원소의 곱을 나눗셈 없이 구하는 LeetCode 238번, 브루트포스 `O(n²)`부터 접두사·접미사 곱 배열, 그리고 변수 하나로 `O(n)`/`O(1)`까지 정리합니다."
---

## 나를 제외한 곱, 어떤 문제인가요?

LeetCode `238`번 문제는 이렇게 주어집니다.

> 정수 배열 `nums`가 주어졌을 때, `answer[i]`가 `nums[i]`를 **제외한** 나머지 모든 원소의 곱이 되는 배열 `answer`를 반환하세요. **나눗셈을 사용하지 않고** `O(n)`에 풀어야 합니다.

예시는 이렇습니다.

- `nums = [1, 2, 3, 4]` → `[24, 12, 8, 6]`
- `nums = [-1, 1, 0, -3, 3]` → `[0, 0, 9, 0, 0]`

제약은 다음과 같습니다.

- `2 <= nums.length <= 10^5`
- `-30 <= nums[i] <= 30`
- 곱은 32비트 정수 범위 안에 들어옴

나눗셈(`전체 곱 / nums[i]`)을 쓰면 간단하지만, 문제가 명시적으로 금지합니다. `0`이 포함된 경우 나눗셈 자체가 불가능하기도 합니다. 이 글에서는 이중 반복 브루트포스부터, 접두사·접미사 곱 배열, 그리고 변수 하나로 공간을 줄이는 풀이까지 단계적으로 정리합니다. 시간·공간 복잡도 표기가 익숙하지 않다면 [시간 복잡도와 공간 복잡도 완전 정복](/posts/52-time-and-space-complexity)을 먼저 읽어 보시는 것을 권합니다.

## Phase 1. 브루트포스 — 매번 나머지를 곱하기

가장 직관적인 접근은 **각 인덱스마다 자기를 건너뛰고 나머지를 모두 곱하는 것**입니다.

```kotlin
fun productExceptSelf(nums: IntArray): IntArray {
    val n = nums.size
    val answer = IntArray(n)
    for (i in 0 until n) {
        var product = 1
        for (j in 0 until n) {
            if (j != i) product *= nums[j]
        }
        answer[i] = product
    }
    return answer
}
```

`nums = [1, 2, 3, 4]`를 따라가 봅시다.

- `i = 0`: `2 × 3 × 4 = 24`
- `i = 1`: `1 × 3 × 4 = 12`
- `i = 2`: `1 × 2 × 4 = 8`
- `i = 3`: `1 × 2 × 3 = 6`

정답은 맞지만, 시간 복잡도가 `O(n²)`입니다. `n`이 최대 `10^5`이면 `10^10`번 연산이며, 제한 시간 안에 끝나지 않습니다.

## Phase 2. 접두사 곱과 접미사 곱 — `O(n)` 시간

핵심 관찰: **`answer[i]` = `i` 왼쪽 원소들의 곱 × `i` 오른쪽 원소들의 곱**입니다.

```
nums =    [1,   2,   3,   4]

prefix =  [1,   1,   2,   6]   ← i 왼쪽까지의 곱
suffix =  [24,  12,  4,   1]   ← i 오른쪽까지의 곱

answer =  [1×24, 1×12, 2×4, 6×1] = [24, 12, 8, 6]
```

이 두 배열을 미리 만들면 됩니다.

```kotlin
fun productExceptSelf(nums: IntArray): IntArray {
    val n = nums.size
    val prefix = IntArray(n)
    val suffix = IntArray(n)

    prefix[0] = 1
    for (i in 1 until n) {
        prefix[i] = prefix[i - 1] * nums[i - 1]
    }

    suffix[n - 1] = 1
    for (i in n - 2 downTo 0) {
        suffix[i] = suffix[i + 1] * nums[i + 1]
    }

    val answer = IntArray(n)
    for (i in 0 until n) {
        answer[i] = prefix[i] * suffix[i]
    }
    return answer
}
```

시간 `O(n)`, 공간 `O(n)` (`prefix` + `suffix` 배열)입니다. 나눗셈 없이 `O(n)`을 달성했지만, **보조 배열 두 개**가 필요합니다.

## Phase 3. 출력 배열 하나로 줄이기 — `O(1)` 추가 공간

관찰: `prefix` 배열은 `answer`에 직접 쓸 수 있고, `suffix`는 오른쪽에서 훑으면서 **변수 하나**로 누적하면 됩니다.

```kotlin
fun productExceptSelf(nums: IntArray): IntArray {
    val n = nums.size
    val answer = IntArray(n)

    answer[0] = 1
    for (i in 1 until n) {
        answer[i] = answer[i - 1] * nums[i - 1]
    }

    var suffix = 1
    for (i in n - 1 downTo 0) {
        answer[i] *= suffix
        suffix *= nums[i]
    }
    return answer
}
```

`nums = [1, 2, 3, 4]`를 따라가 봅시다.

**1단계 — 접두사 곱을 `answer`에 기록:**

- `answer[0] = 1`
- `answer[1] = 1 × 1 = 1`
- `answer[2] = 1 × 2 = 2`
- `answer[3] = 2 × 3 = 6`
- `answer = [1, 1, 2, 6]`

**2단계 — 오른쪽에서 접미사 곱을 누적하며 곱하기:**

- `i = 3`: `answer[3] = 6 × 1 = 6`, `suffix = 1 × 4 = 4`
- `i = 2`: `answer[2] = 2 × 4 = 8`, `suffix = 4 × 3 = 12`
- `i = 1`: `answer[1] = 1 × 12 = 12`, `suffix = 12 × 2 = 24`
- `i = 0`: `answer[0] = 1 × 24 = 24`, `suffix = 24 × 1 = 24`
- `answer = [24, 12, 8, 6]` ✓

시간 `O(n)`, 추가 공간 `O(1)`입니다. 출력 배열 `answer`는 문제가 요구하는 결과이므로 보조 공간에 포함하지 않습니다.

### `0`이 포함된 경우도 맞나요?

`nums = [-1, 1, 0, -3, 3]`을 따라가 봅시다.

**1단계 — 접두사 곱:**
- `answer = [1, -1, -1, 0, 0]`

**2단계 — 접미사 곱 누적:**
- `i = 4`: `answer[4] = 0 × 1 = 0`, `suffix = 3`
- `i = 3`: `answer[3] = 0 × 3 = 0`, `suffix = -9`
- `i = 2`: `answer[2] = -1 × -9 = 9`, `suffix = 0`
- `i = 1`: `answer[1] = -1 × 0 = 0`, `suffix = 0`
- `i = 0`: `answer[0] = 1 × 0 = 0`, `suffix = 0`
- `answer = [0, 0, 9, 0, 0]` ✓

`0`이 있는 위치의 접미사(또는 접두사)가 `0`이 되면서 자연스럽게 처리됩니다. `0`을 제외한 위치(`i = 2`)만 양쪽 곱이 `0`이 아닌 값으로 남습니다.

## 세 풀이를 다시 비교

| 풀이 | 시간 | 공간 | 특징 |
| --- | --- | --- | --- |
| 브루트포스 (이중 반복) | `O(n²)` | `O(1)` | 직관적이지만 큰 입력에서 시간 초과 |
| 접두사 + 접미사 배열 | `O(n)` | `O(n)` | 두 방향 스캔, 관찰을 그대로 옮긴 중간 단계 |
| 출력 배열 + 접미사 변수 | `O(n)` | `O(1)` | 접두사를 출력에 직접 기록, 접미사는 변수 하나로 누적 |

## 마무리

1. **"자기를 제외한 곱 = 왼쪽 곱 × 오른쪽 곱"이라는 분할이 이 문제의 핵심** — 나눗셈 없이 곱을 구할 수 있는 이유가 여기에 있습니다
2. **접두사·접미사 배열을 먼저 떠올리면, 출력 배열 재활용 + 변수 하나로 공간을 줄이는 단계가 자연스럽게 따라온다** — Phase 2에서 Phase 3으로의 전환은 "같은 관찰을 더 적은 공간으로 표현하는 것"입니다
3. **`0`이 포함된 입력은 별도 분기 없이 자연스럽게 처리된다** — 접두사나 접미사에 `0`이 곱해지면 해당 방향의 누적 곱이 `0`으로 전파되기 때문입니다
4. **Phase 2 → Phase 3의 공간 압축은 [Increasing Triplet Subsequence](/posts/49-increasing-triplet-subsequence)의 `leftMin`/`rightMax` 배열 → 변수 두 개 압축과 같은 패턴** — "양방향 전처리를 한 방향은 배열에, 다른 방향은 변수에" 담는 기법은 여러 문제에서 반복됩니다

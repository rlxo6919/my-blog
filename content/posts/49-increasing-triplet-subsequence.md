---
title: "Increasing Triplet Subsequence — `O(n)` 시간, `O(1)` 공간으로 푸는 그리디 패턴"
date: "2026-04-24"
category: "study"
tags: ["알고리즘", "그리디"]
excerpt: "삼중 반복 `O(n^3)`부터, `leftMin`/`rightMax` 두 배열을 쓰는 `O(n)`/`O(n)`, 그리고 변수 두 개로 `O(n)`/`O(1)`에 푸는 그리디까지, `first`/`second` 불변식을 기준으로 정리합니다."
---

## 증가하는 삼중 부분 수열, 어떤 문제인가요?

LeetCode `334`번 문제는 이렇게 주어집니다.

> 정수 배열 `nums`가 주어졌을 때, `i < j < k`이면서 `nums[i] < nums[j] < nums[k]`를 만족하는 인덱스 삼조(`triplet`)가 존재하면 `true`를 반환하세요.

예시는 이렇습니다.

- `[1, 2, 3, 4, 5]` → `true` (`1 < 2 < 3`)
- `[5, 4, 3, 2, 1]` → `false`
- `[2, 1, 5, 0, 4, 6]` → `true` (예: `0 < 4 < 6`)

문제 자체는 단순해 보이지만, 제약이 붙습니다.

- **시간 복잡도 `O(n)`**, **공간 복잡도 `O(1)`** 으로 풀 수 있는가

이 제약이 이 문제의 진짜 주제입니다. 이 글에서는 `O(n^3)` 브루트포스부터 시작해서, 배열 두 개를 쓰는 `O(n)`/`O(n)` 풀이를 거쳐, 변수 두 개로 `O(n)`/`O(1)`에 푸는 **그리디 패턴**까지 단계적으로 내려가 보겠습니다.

## 먼저 가장 짧은 답부터

- 변수 두 개 `first`, `second`를 유지합니다
- `first`는 지금까지 본 가장 작은 값
- `second`는 "앞에 자신보다 작은 값이 이미 있었던" 값 중 가장 작은 값
- 이후에 `second`보다 큰 값이 등장하면 삼중 수열이 존재합니다
- 핵심은 **`second`가 갱신되는 순간, 그보다 작은 값이 이미 앞쪽에 있었다는 사실이 불변으로 남는다는 점**입니다

## Phase 1. 브루트포스 — 삼중 반복은 왜 불가능한가

가장 직관적인 접근은 세 인덱스를 모두 시도하는 것입니다.

```kotlin
fun increasingTriplet(nums: IntArray): Boolean {
    val n = nums.size
    for (i in 0 until n) {
        for (j in i + 1 until n) {
            for (k in j + 1 until n) {
                if (nums[i] < nums[j] && nums[j] < nums[k]) return true
            }
        }
    }
    return false
}
```

정답 자체는 맞지만, 시간 복잡도는 `O(n^3)`입니다.

LeetCode 제약에서 `nums.length`는 최대 `5 * 10^5`입니다. `n^3`이면 대략 `1.25 * 10^17`번 연산이며, 초당 `10^8` 수준을 가정해도 현실적으로 끝나지 않습니다.

그래서 방향을 바꿔야 합니다. "각 위치에서 꼭 필요한 정보만 남겨 두고, 배열을 한 번(또는 몇 번)에 훑고 끝내야 합니다."

## Phase 2. 각 위치에서 좌우를 보는 방법 — `O(n)` 공간

첫 번째 개선 아이디어는 이렇습니다. **어떤 인덱스 `j`가 "가운데 값"이 될 수 있으려면, `j`보다 왼쪽에 더 작은 값이 있고, 오른쪽에 더 큰 값이 있어야 합니다.** 이걸 그대로 옮기면 다음 두 배열을 미리 만들면 됩니다.

- `leftMin[j]`: `0..j-1` 구간의 최솟값
- `rightMax[j]`: `j+1..n-1` 구간의 최댓값

그다음 모든 `j`에 대해 `leftMin[j] < nums[j] < rightMax[j]`이면 답입니다.

```kotlin
fun increasingTriplet(nums: IntArray): Boolean {
    val n = nums.size
    if (n < 3) return false

    val leftMin = IntArray(n)
    val rightMax = IntArray(n)

    leftMin[0] = Int.MAX_VALUE
    for (i in 1 until n) {
        leftMin[i] = minOf(leftMin[i - 1], nums[i - 1])
    }

    rightMax[n - 1] = Int.MIN_VALUE
    for (i in n - 2 downTo 0) {
        rightMax[i] = maxOf(rightMax[i + 1], nums[i + 1])
    }

    for (j in 1 until n - 1) {
        if (leftMin[j] < nums[j] && nums[j] < rightMax[j]) return true
    }
    return false
}
```

이 풀이는 `O(n)` 시간에 끝나고, 로직도 읽기 쉽습니다. 다만 **배열 두 개를 만들면서 `O(n)` 공간을 쓰고**, 전체를 **세 번 훑어야** 합니다.

문제에서 요구하는 `O(1)` 공간을 만족하지 못하니, 한 단계 더 줄여 봅니다.

## Phase 3. 변수 두 개로 줄이기 — `O(1)` 공간의 그리디

관찰: Phase 2에서 실제로 필요한 정보는 **"지금까지 본 가장 작은 값"과 "그 작은 값 뒤에 이어서 등장한 가장 작은 값"**, 이 두 가지뿐입니다. 이 둘을 `first`, `second`라고 부르겠습니다.

```kotlin
fun increasingTriplet(nums: IntArray): Boolean {
    var first = Int.MAX_VALUE
    var second = Int.MAX_VALUE

    for (n in nums) {
        when {
            n <= first -> first = n
            n <= second -> second = n
            else -> return true
        }
    }
    return false
}
```

분기는 세 가지입니다.

- `n <= first`: 지금까지 최소 이하이므로, `first`를 갱신
- `n <= second`: `first`보다는 크지만 `second` 이하이므로, `second`를 갱신
- `else`: `n > second` → `first < second < n`이 되는 삼중이 존재 → `true`

시간 `O(n)`, 공간 `O(1)`입니다.

### 그리디가 맞다는 직관이 잘 안 잡힙니다

이 풀이를 처음 보면 대부분 같은 의문을 가집니다.

> `first`를 나중에 더 작은 값으로 덮어쓰면, `second`와의 "앞/뒤 관계"가 깨지지 않나요?

예를 들어 `[2, 5, 1, 4]`를 따라가 봅시다.

- `2`: `first = 2`
- `5`: `5 > first(2)`, `5 <= second(∞)` → `second = 5` (이 시점에 "`first=2 < second=5`"라는 사실이 고정됨)
- `1`: `1 <= first` → `first = 1`
- `4`: `4 > first(1)`, `4 <= second(5)` → `second = 4`
- 끝: `false`

여기서 `first = 1`이 된 뒤의 스냅샷만 보면 "`first=1, second=5`"인데, 배열상 `5`는 `1`보다 **앞에** 있던 값입니다. 즉 현재 상태만 보면 인덱스 순서가 뒤바뀐 것처럼 보입니다. 그래도 풀이가 정답인 이유가 핵심입니다.

### 불변식 — `second`가 갱신된 순간, 그보다 작은 값은 이미 존재했다

다음 두 가지 불변식이 계속 유지됩니다.

1. **`second`가 유한한 값으로 갱신된 적이 있다면**, 그 시점에 배열 앞쪽에 `second`보다 작은 값이 존재했습니다
2. `first`가 나중에 더 작은 값으로 바뀌어도, 1번은 **과거 시점에 대한 사실**이므로 여전히 참입니다

그래서 배열을 계속 훑다가 `n > second`인 원소를 만나는 순간,

- 과거 어느 시점에 "`second`보다 작은 값"이 있었고 (불변식 1)
- 그 뒤에 `second`가 확정됐으며
- 지금 `n > second`이므로, 증가하는 삼중 수열이 존재합니다

다시 말해, `first`가 더 작은 값으로 바뀌는 것은 **"앞으로 더 작게 시작할 기회"를 열어 두는 행위**일 뿐, 이미 확정된 "과거 어딘가에 `second`보다 작은 값이 있었다"는 사실을 훼손하지 않습니다.

> **참고:** 이 알고리즘은 삼중이 존재하는지 `boolean`만 돌려줍니다. 실제 세 인덱스를 복원하려면 `first`가 갱신된 인덱스, `second`가 갱신될 때의 인덱스 등을 별도로 기억해야 합니다. 문제 정의가 `boolean` 반환이면 여기까지로 충분합니다.

### 왜 `<`가 아니라 `<=`로 비교하나요?

분기를 `n < first`, `n < second`가 아니라 `n <= first`, `n <= second`로 쓴 이유는 **중복 값**을 안전하게 처리하기 위해서입니다.

문제는 **엄격히 증가하는(strictly increasing)** 삼중을 요구합니다. `nums[i] < nums[j] < nums[k]`에서 같음(`=`)은 허용되지 않습니다.

예를 들어 `[1, 1, 1, 1, 1]`에서는 `false`가 나와야 합니다. `<=`로 비교하면 모든 `1`이 `n <= first` 분기를 타서 `first = 1` 유지, `second`는 `∞` 그대로로 남고 `false`가 나옵니다.

반대로 `<`로 썼다면 두 번째 `1`이 `n < first(1)`도 `n < second(∞ → 이후 갱신되면 1)`도 만족하지 않으면서 다른 분기로 흘러, 같은 값만 반복되는 입력에서 잘못된 `true`가 나올 여지가 생깁니다. `<=`로 비교하면 **같은 값이 와도 `second`를 섣불리 확정하지 않습니다**.

## 세 풀이를 다시 비교

| 풀이 | 시간 | 공간 | 특징 |
| --- | --- | --- | --- |
| 삼중 반복 | `O(n^3)` | `O(1)` | 구현은 쉽지만 큰 입력에서 사실상 불가능 |
| `leftMin` / `rightMax` 배열 | `O(n)` | `O(n)` | 두 방향 스캔, 관찰을 그대로 옮긴 중간 단계 |
| 그리디 (`first` / `second`) | `O(n)` | `O(1)` | 불변식 기반, 문제 제약을 정확히 만족 |

## 마무리

1. **`O(n)` / `O(1)` 제약을 만족하는 풀이의 핵심은 "한 번 훑으면서 꼭 필요한 상태만 남기는 것"** — 이 문제에서는 `first`와 `second` 두 변수면 충분합니다
2. **그리디가 성립하는 이유는 "`second`가 갱신된 순간, 그보다 작은 값이 이미 앞쪽에 존재했다"는 과거 사실이 불변으로 남기 때문** — 이후 `first`가 더 작은 값으로 바뀌어도 이 사실은 훼손되지 않습니다
3. **`<=`로 비교하는 이유는 중복 값에서 `second`를 섣불리 확정하지 않기 위해** — 엄격히 증가하는 수열 정의를 지키는 장치입니다
4. **중간 단계로 `leftMin` / `rightMax` 풀이를 거치면, 같은 관찰을 상수 공간으로 압축하는 과정을 볼 수 있습니다** — 공간을 줄여 가는 사고 흐름 자체가 이 문제에서 얻어 갈 수 있는 가장 큰 학습 포인트입니다

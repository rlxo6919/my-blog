---
title: "Max Number of K-Sum Pairs — 정렬 `O(n log n)`에서 해시 `O(n)`까지 최대 페어 수 세기"
date: "2026-04-30"
category: "study"
tags: ["알고리즘"]
excerpt: "합이 `k`가 되는 두 수를 한 번씩만 써서 최대 몇 쌍을 만들 수 있는지 구하는 LeetCode 1679번, `O(n²)` 브루트포스부터 정렬 + 투 포인터 `O(n log n)`, 해시 카운팅 `O(n)`까지 정리합니다."
---

## 합이 `k`인 쌍을 최대 몇 번 지울 수 있을까, 어떤 문제인가요?

LeetCode `1679`번 문제는 이렇게 주어집니다.

> 정수 배열 `nums`와 정수 `k`가 주어집니다. 한 번의 연산에서 합이 `k`인 두 수를 골라 배열에서 제거할 수 있습니다. 수행할 수 있는 **최대 연산 횟수**를 반환하세요.

예시는 이렇습니다.

- `nums = [1, 2, 3, 4]`, `k = 5` → `2`
- `nums = [3, 1, 3, 4, 3]`, `k = 6` → `1`

제약은 다음과 같습니다.

- `1 <= nums.length <= 10^5`
- `1 <= nums[i] <= 10^9`
- `1 <= k <= 10^9`

핵심은 **각 수가 만들 수 있는 짝이 오직 `k - x` 하나뿐**이라는 점입니다. 이 글에서는 `O(n²)` 브루트포스부터, 정렬 + 투 포인터 `O(n log n)`, 그리고 해시 카운팅 `O(n)`까지 단계적으로 정리하겠습니다. 시간·공간 복잡도 표기가 익숙하지 않다면 [시간 복잡도와 공간 복잡도 완전 정복](/posts/52-time-and-space-complexity)을 먼저 읽어 보시는 것을 권합니다.

## Phase 1. 브루트포스 — 아직 쓰지 않은 짝을 뒤에서 찾기

가장 직관적인 접근은 **각 원소마다 뒤쪽에서 아직 쓰지 않은 짝을 찾는 것**입니다.

코드는 이렇게 됩니다.

```kotlin
fun maxOperations(nums: IntArray, k: Int): Int {
    val used = BooleanArray(nums.size)
    var answer = 0

    for (i in nums.indices) {
        if (used[i]) continue

        for (j in i + 1 until nums.size) {
            if (used[j]) continue

            if (nums[i] + nums[j] == k) {
                used[i] = true
                used[j] = true
                answer++
                break
            }
        }
    }

    return answer
}
```

`nums = [1, 2, 3, 4]`, `k = 5`를 따라가 봅시다.

- `i = 0`일 때 `1`의 보완값은 `4`입니다. 뒤를 훑다가 `j = 3`에서 찾습니다
- `1`과 `4`를 사용 처리하고 `answer = 1`
- `i = 1`일 때 `2`의 보완값은 `3`입니다. `j = 2`에서 찾습니다
- `2`와 `3`을 사용 처리하고 `answer = 2`

정답은 맞지만, 시간 복잡도가 `O(n²)`입니다. 최악의 경우 거의 모든 `(i, j)` 쌍을 확인하게 되기 때문입니다. `n = 10^5`이면 현실적으로 너무 느립니다. 공간도 `used` 배열 때문에 `O(n)`이 듭니다.

## Phase 2. 정렬 + 투 포인터 — 합이 작으면 왼쪽, 크면 오른쪽 이동

배열을 정렬하면 **현재 합이 너무 작은지, 너무 큰지**를 바로 이용할 수 있습니다.

- `left`는 가장 작은 값
- `right`는 가장 큰 값
- `sum = nums[left] + nums[right]`
- `sum == k`면 한 쌍 완성
- `sum < k`면 `left++`
- `sum > k`면 `right--`

코드는 이렇게 됩니다.

```kotlin
fun maxOperations(nums: IntArray, k: Int): Int {
    nums.sort()

    var left = 0
    var right = nums.lastIndex
    var answer = 0

    while (left < right) {
        val sum = nums[left] + nums[right]

        when {
            sum == k -> {
                answer++
                left++
                right--
            }
            sum < k -> left++
            else -> right--
        }
    }

    return answer
}
```

`nums = [3, 1, 3, 4, 3]`, `k = 6`을 정렬하면 `[1, 3, 3, 3, 4]`입니다.

```
left=0 (1), right=4 (4)
sum = 5 < 6
→ 더 큰 합이 필요하므로 left++

left=1 (3), right=4 (4)
sum = 7 > 6
→ 더 작은 합이 필요하므로 right--

left=1 (3), right=3 (3)
sum = 6
→ 한 쌍 완성, answer++
→ left++, right--
```

이제 `left == right`가 되어 종료됩니다. 답은 `1`입니다.

### 왜 `sum < k`면 `left`를 올려도 되나요?

정렬된 상태에서 `nums[left] + nums[right] < k`라면, 현재 `left`를 그대로 둔 채 `right`보다 왼쪽의 수와 짝지어도 합은 더 작거나 같습니다.

```text
nums[left] + nums[any index <= right] <= nums[left] + nums[right] < k
```

즉 **현재 `nums[left]`는 이 구간 안에서 누구와도 `k`를 만들 수 없습니다.** 그래서 `left`를 버려도 됩니다.

반대로 `sum > k`라면:

```text
nums[any index >= left] + nums[right] >= nums[left] + nums[right] > k
```

가 되므로, 현재 `nums[right]`도 이 구간 안에서 누구와도 `k`를 만들 수 없습니다. 그래서 `right--`가 맞습니다.

이 논리 덕분에 매 단계마다 **한쪽 끝 원소를 안전하게 버릴 수 있습니다.**

> **참고:** [Container With Most Water](/posts/59-container-with-most-water)도 `투 포인터`를 쓰지만, 포인터를 움직이는 근거는 다릅니다. 그 문제는 "더 낮은 높이가 넓이 상한"이어서 낮은 쪽을 움직이고, 이 문제는 "정렬된 합이 너무 작거나 크다"는 비교 결과로 한쪽을 버립니다.

시간 복잡도는 정렬 때문에 `O(n log n)`입니다. 해시 테이블이 필요 없다는 장점이 있지만, 더 줄일 수는 있습니다.

## Phase 3. 해시 카운팅 — 지금 필요한 보완값이 남아 있는지만 보기

각 수 `x`가 필요한 값은 오직 `k - x` 하나뿐입니다. 이 관찰을 그대로 쓰면 정렬도 필요 없습니다.

- 지금까지 봤지만 아직 짝을 못 찾은 수의 개수를 `counts`에 저장합니다
- 새 수 `x`를 볼 때 `need = k - x`를 계산합니다
- `counts[need] > 0`이면 바로 한 쌍을 만들고 `need`를 하나 소비합니다
- 없으면 `x`를 `counts`에 저장합니다

코드는 이렇게 됩니다.

```kotlin
fun maxOperations(nums: IntArray, k: Int): Int {
    val counts = HashMap<Int, Int>()
    var answer = 0

    for (x in nums) {
        val need = k - x
        val available = counts[need] ?: 0

        if (available > 0) {
            if (available == 1) {
                counts.remove(need)
            } else {
                counts[need] = available - 1
            }
            answer++
        } else {
            counts[x] = (counts[x] ?: 0) + 1
        }
    }

    return answer
}
```

같은 예시 `nums = [3, 1, 3, 4, 3]`, `k = 6`을 따라가 봅시다.

- `x = 3`, `need = 3` → 아직 없음 → `counts[3] = 1`
- `x = 1`, `need = 5` → 없음 → `counts[1] = 1`
- `x = 3`, `need = 3` → 있음 → `3`과 `3`을 묶고 `answer = 1`
- `x = 4`, `need = 2` → 없음 → `counts[4] = 1`
- `x = 3`, `need = 3` → 없음 → `counts[3] = 1`

최종 답은 `1`입니다.

### 왜 보완값이 보이면 바로 묶어도 되나요?

이 문제에서 `x`가 만들 수 있는 짝은 오직 `k - x`입니다. 이미 앞에서 등장한 `k - x`가 아직 남아 있다면:

- 지금 `x`와 묶거나
- 나중의 다른 `x`와 묶거나

결국 소비되는 것은 **`x` 하나와 `k - x` 하나**입니다. 미뤄 둔다고 더 좋은 선택지가 생기지 않습니다. 그래서 보완값이 보이면 바로 묶어도 됩니다.

이 관점으로 보면 답은 결국 값별 개수의 문제입니다.

- `x != k - x`이면 `x`와 `k - x`는 최대 `min(count[x], count[k - x])`쌍
- `x == k - x`이면 같은 수 두 개가 필요하므로 `count[x] / 2`쌍

해시 카운팅은 이 계산을 **배열을 한 번 훑으면서** 수행하는 방식입니다.

시간 복잡도는 평균적으로 `O(n)`, 공간 복잡도는 `O(n)`입니다.

## 엣지 케이스

놓치기 쉬운 입력은 이렇습니다.

| 입력 | `k` | 결과 | 이유 |
| --- | --- | --- | --- |
| `[1, 2, 3, 4]` | `5` | `2` | `(1, 4)`, `(2, 3)` 두 쌍 |
| `[3, 1, 3, 4, 3]` | `6` | `1` | `3`이 세 개라 `3 + 3`은 한 번만 가능 |
| `[2, 2, 2, 2]` | `4` | `2` | 같은 값끼리 두 개씩 묶음 |
| `[1, 1, 1, 1]` | `3` | `0` | 보완값 `2`가 아예 없음 |
| `[5]` | `10` | `0` | 원소가 하나면 쌍을 만들 수 없음 |

특히 `x == k - x`인 경우를 꼭 따로 의식해야 합니다. 예를 들어 `k = 4`, `x = 2`라면 `2` 하나로는 부족하고 **항상 두 개가 한 쌍**입니다.

## 세 풀이를 다시 비교

브루트포스는 직관적이고, 정렬 + 투 포인터는 비교 기반으로 줄인 풀이입니다. 최종적으로는 해시 카운팅이 가장 짧고 빠릅니다.

| 풀이 | 시간 | 공간 | 특징 |
| --- | --- | --- | --- |
| `used` + 이중 반복 | `O(n²)` | `O(n)` | 정답은 맞지만 큰 입력에서 너무 느림 |
| 정렬 + 투 포인터 | `O(n log n)` | 정렬 구현에 따라 다름 | 합이 작으면 왼쪽, 크면 오른쪽을 버리는 구조 |
| 해시 카운팅 | 평균 `O(n)` | `O(n)` | 필요한 보완값 개수만 관리하면 됨 |

## 마무리

1. **이 문제의 핵심은 "한 수가 만들 수 있는 짝은 오직 `k - x` 하나뿐"이라는 점** — 그래서 문제를 보완값 관리 문제로 바꿔 볼 수 있습니다
2. **정렬 + 투 포인터는 현재 합이 너무 작거나 크면 한쪽 끝 원소를 바로 버릴 수 있다는 점에서 성립합니다** — 정렬된 순서가 포인터 이동의 근거가 됩니다
3. **해시 카운팅은 아직 짝을 못 찾은 수만 남겨 두는 방식입니다** — 보완값이 보이면 바로 소비해도 최대 개수를 놓치지 않습니다
4. **`x == k - x`인 경우는 항상 같은 수 두 개가 필요합니다** — 그래서 가능한 쌍 수는 결국 `count[x] / 2`입니다

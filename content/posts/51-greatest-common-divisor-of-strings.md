---
title: "Greatest Common Divisor of Strings — `GCD`로 `O(n + m)` 문자열 최대 공약 패턴"
date: "2026-04-27"
category: "study"
tags: ["알고리즘"]
excerpt: "두 문자열의 최대 공약 문자열을 구하는 LeetCode 1071번, 브루트포스부터 GCD 기반 O(n + m) 풀이까지 정리합니다."
---

## 문자열의 최대 공약수, 어떤 문제인가요?

LeetCode `1071`번 문제는 이렇게 주어집니다.

> 두 문자열 `str1`과 `str2`가 주어졌을 때, 두 문자열을 **모두 나누는** 가장 긴 문자열 `x`를 반환하세요. 문자열 `t`가 문자열 `s`를 "나눈다"는 것은 `t`를 한 번 이상 반복해서 `s`를 만들 수 있다는 뜻입니다.

예시는 이렇습니다.

- `str1 = "ABCABC"`, `str2 = "ABC"` → `"ABC"` (`"ABC"` × 2 = `"ABCABC"`, `"ABC"` × 1 = `"ABC"`)
- `str1 = "ABABAB"`, `str2 = "ABAB"` → `"AB"` (`"AB"` × 3 = `"ABABAB"`, `"AB"` × 2 = `"ABAB"`)
- `str1 = "LEET"`, `str2 = "CODE"` → `""` (공통으로 나눌 수 있는 문자열이 없음)

제약은 간단합니다.

- `1 <= str1.length, str2.length <= 1000`
- 두 문자열 모두 대문자 영문으로만 구성

"문자열을 나눈다"는 개념이 정수의 약수와 닮아 있습니다. 정수에서 최대공약수(GCD)를 구하듯, 문자열에서도 **최대 공약 문자열**을 찾는 것이 핵심입니다. 이 글에서는 후보를 하나씩 시도하는 브루트포스부터, `GCD`를 활용한 `O(n + m)` 풀이까지 단계적으로 정리해 보겠습니다.

## Phase 1. 브루트포스 — 가능한 길이를 모두 시도

가장 직관적인 접근은 **가능한 길이를 큰 것부터 하나씩 시도하는 것**입니다. 공약 문자열이 존재한다면 그 길이는 `str1.length`와 `str2.length` **모두의 약수**여야 합니다. 가장 긴 것을 찾아야 하므로, 큰 길이부터 내려갑니다.

```kotlin
fun gcdOfStrings(str1: String, str2: String): String {
    val len1 = str1.length
    val len2 = str2.length

    for (k in minOf(len1, len2) downTo 1) {
        if (len1 % k != 0 || len2 % k != 0) continue

        val candidate = str1.substring(0, k)
        if (candidate.repeat(len1 / k) == str1 &&
            candidate.repeat(len2 / k) == str2) {
            return candidate
        }
    }
    return ""
}
```

동작을 따라가 봅시다. `str1 = "ABABAB"`, `str2 = "ABAB"`인 경우:

- `k = 4`: `len1(6) % 4 != 0` → 건너뜀
- `k = 3`: `len2(4) % 3 != 0` → 건너뜀
- `k = 2`: `"AB".repeat(3) == "ABABAB"` ✓, `"AB".repeat(2) == "ABAB"` ✓ → `"AB"` 반환

정답은 맞지만, 최악의 경우 `minOf(len1, len2)`개의 후보를 시도하고, 각 후보마다 `repeat` + 비교에 `O(n + m)` 비용이 듭니다. 전체 시간 복잡도는 약 `O(min(n, m) * (n + m))`입니다. 후보 수를 줄이는 것이 아니라, **후보를 하나로 확정하는 방법**이 있다면 더 빠를 수 있습니다.

## Phase 2. GCD 기반 풀이 — `O(n + m)`

핵심 관찰은 이렇습니다. **공약 문자열이 존재한다면 그 길이는 `gcd(len1, len2)`입니다.**

왜 그런지 따져 봅시다. 문자열 `t`가 `str1`과 `str2`를 모두 나누면, `t`의 길이는 `len1`과 `len2`의 공약수입니다. 가장 긴 공약 문자열을 찾으므로, 그 길이는 **최대공약수**가 됩니다. 그보다 긴 후보는 두 길이의 공약수가 아니고, 그보다 짧은 공약 문자열은 `gcd` 길이의 약수이므로 `gcd` 길이보다 길 수 없습니다.

그런데 한 가지 더 확인해야 합니다. **길이가 `gcd`라고 해서 반드시 공약 문자열이 존재하는 것은 아닙니다.** `"LEET"`과 `"CODE"`의 길이는 모두 `4`이고 `gcd(4, 4) = 4`이지만, 공약 문자열은 없습니다.

### 존재 여부를 한 번에 판별하는 방법

공약 문자열이 존재하는 **필요충분조건**은 다음과 같습니다.

> `str1 + str2 == str2 + str1`

이유를 짚어 봅시다. 두 문자열이 같은 패턴 `t`의 반복으로 구성된다면, `str1 = t × a`, `str2 = t × b`입니다. 이때:

- `str1 + str2` = `t`를 `a + b`번 반복
- `str2 + str1` = `t`를 `b + a`번 반복

둘은 동일합니다. 반대로, 같은 반복 단위가 아닌 두 문자열을 이어 붙이면 순서에 따라 결과가 달라집니다.

```
"ABCABC" + "ABC" = "ABCABCABC"
"ABC" + "ABCABC" = "ABCABCABC"  ← 같음 → 공약 문자열 존재

"LEET" + "CODE" = "LEETCODE"
"CODE" + "LEET" = "CODELEET"    ← 다름 → 공약 문자열 없음
```

이 두 가지를 합치면 풀이가 됩니다.

```kotlin
fun gcdOfStrings(str1: String, str2: String): String {
    if (str1 + str2 != str2 + str1) return ""

    val gcdLen = gcd(str1.length, str2.length)
    return str1.substring(0, gcdLen)
}

private fun gcd(a: Int, b: Int): Int =
    if (b == 0) a else gcd(b, a % b)
```

같은 입력 `str1 = "ABABAB"`, `str2 = "ABAB"`을 따라가 봅시다.

- `"ABABAB" + "ABAB"` = `"ABABABABAB"`, `"ABAB" + "ABABAB"` = `"ABABABABAB"` → 같음
- `gcd(6, 4)` = `gcd(4, 2)` = `gcd(2, 0)` = `2`
- `str1.substring(0, 2)` = `"AB"` → 정답

### `gcd` 함수의 시간 복잡도

유클리드 호제법의 시간 복잡도는 `O(log(min(a, b)))`입니다. 매 재귀마다 `a % b`가 최소 절반 이하로 줄기 때문입니다. 문자열 비교 `str1 + str2 == str2 + str1`이 `O(n + m)`이므로, 전체 시간 복잡도는 `O(n + m)`입니다.

## 두 풀이를 다시 비교

| 풀이 | 시간 | 공간 | 특징 |
| --- | --- | --- | --- |
| 브루트포스 (모든 약수 길이 시도) | `O(min(n, m) * (n + m))` | `O(n + m)` | 직관적이지만 후보마다 `repeat` + 비교 필요 |
| GCD + 교환 법칙 검증 | `O(n + m)` | `O(n + m)` | 문자열 이어 붙이기 한 번으로 존재 여부 확인 |

두 풀이 모두 공간은 `O(n + m)`입니다. 문자열 이어 붙이기(`str1 + str2`)와 `substring` 결과가 새 문자열을 만들기 때문입니다.

## 마무리

1. **"문자열을 나눈다"는 정의를 정수의 약수 관계로 치환하면, 최대 공약 문자열의 길이는 `gcd(len1, len2)`** — 후보 길이를 하나로 좁혀 줍니다
2. **`str1 + str2 == str2 + str1`은 공약 문자열 존재의 필요충분조건** — 같은 반복 단위로 구성된 두 문자열은 이어 붙이는 순서에 영향을 받지 않습니다
3. **유클리드 호제법은 `O(log(min(a, b)))`이므로 병목은 문자열 비교 `O(n + m)`** — GCD 계산 자체는 거의 무시할 수 있는 비용입니다

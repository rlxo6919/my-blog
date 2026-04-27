---
title: "Reverse Vowels of a String — 투 포인터 `O(n)` 스왑으로 모음만 뒤집기"
date: "2026-04-27"
category: "study"
tags: ["알고리즘"]
excerpt: "문자열에서 모음만 골라 순서를 뒤집는 LeetCode 345번, 별도 리스트 방식과 투 포인터 스왑 방식을 비교하며 정리합니다."
---

## 모음만 뒤집기, 어떤 문제인가요?

LeetCode `345`번 문제는 이렇게 주어집니다.

> 문자열 `s`가 주어졌을 때, **모음(vowel)만** 순서를 뒤집은 문자열을 반환하세요. 모음은 `a`, `e`, `i`, `o`, `u`이며 대문자도 포함합니다.

예시는 이렇습니다.

- `s = "hello"` → `"holle"` (모음 `e`, `o` → 뒤집으면 `o`, `e`)
- `s = "leetcode"` → `"leotcede"` (모음 `e`, `e`, `o`, `e` → 뒤집으면 `e`, `o`, `e`, `e`)

제약은 다음과 같습니다.

- `1 <= s.length <= 3 * 10^5`
- `s`는 ASCII 문자로만 구성

자음은 제자리에 둔 채 모음의 순서만 양쪽 끝에서부터 교환하는 것이 핵심입니다. 이 글에서는 모음을 따로 모아 뒤집는 방식부터, 투 포인터로 제자리 스왑하는 방식까지 비교합니다. 시간·공간 복잡도 표기가 익숙하지 않다면 [시간 복잡도와 공간 복잡도 완전 정복](/posts/52-time-and-space-complexity)을 먼저 읽어 보시는 것을 권합니다.

## Phase 1. 모음을 따로 모아 뒤집기

가장 직관적인 접근은 **모음만 뽑아서 뒤집은 뒤, 원래 자리에 다시 채우는 것**입니다.

```kotlin
fun reverseVowels(s: String): String {
    val vowels = "aeiouAEIOU".toSet()
    val collected = s.filter { it in vowels }.reversed()

    val result = StringBuilder()
    var vi = 0
    for (ch in s) {
        if (ch in vowels) {
            result.append(collected[vi++])
        } else {
            result.append(ch)
        }
    }
    return result.toString()
}
```

`s = "leetcode"`를 따라가 봅시다.

- 모음 수집: `['e', 'e', 'o', 'e']` → 뒤집기: `['e', 'o', 'e', 'e']`
- 원본을 훑으면서 모음 자리에 순서대로 채움 → `"leotcede"`

로직은 명확하지만, 모음을 담는 리스트와 뒤집은 결과에 **`O(n)` 추가 공간**이 필요합니다.

## Phase 2. 투 포인터 스왑 — 추가 공간 없이

모음을 따로 모을 필요 없이, **양쪽 끝에서 모음을 찾아 바로 교환**하면 됩니다.

```kotlin
fun reverseVowels(s: String): String {
    val chars = s.toCharArray()
    val vowels = "aeiouAEIOU".toSet()
    var left = 0
    var right = chars.size - 1

    while (left < right) {
        while (left < right && chars[left] !in vowels) left++
        while (left < right && chars[right] !in vowels) right--
        if (left < right) {
            val temp = chars[left]
            chars[left] = chars[right]
            chars[right] = temp
            left++
            right--
        }
    }
    return String(chars)
}
```

같은 입력 `s = "leetcode"`를 따라가 봅시다.

```
초기: ['l','e','e','t','c','o','d','e']
       L →                         ← R

1회: left=1('e'), right=7('e') → 스왑 → ['l','e','e','t','c','o','d','e']
     (같은 문자끼리 스왑이라 변화 없음)

2회: left=2('e'), right=5('o') → 스왑 → ['l','e','o','t','c','e','d','e']

3회: left=3, right=4 → 둘 다 자음, left와 right가 교차 → 종료
```

결과: `"leotcede"` ✓

`left`와 `right`는 각각 한 방향으로만 이동하므로, 전체 이동 횟수의 합은 `n`을 넘지 않습니다. 시간 `O(n)`, 추가 공간 `O(1)`입니다.

> **참고:** Kotlin(JVM)에서 `String`은 불변이므로 `toCharArray()`로 복사본을 만들어야 합니다. 이 `CharArray`는 결과를 만들기 위한 필수 공간이지, 알고리즘이 추가로 요구하는 보조 공간이 아닙니다. 투 포인터 자체가 쓰는 추가 변수는 `left`, `right`, `temp`뿐이므로 `O(1)`입니다.

## 두 풀이를 다시 비교

| 풀이 | 시간 | 공간 | 특징 |
| --- | --- | --- | --- |
| 모음 수집 + 뒤집기 | `O(n)` | `O(n)` | 모음 리스트와 뒤집은 결과에 추가 공간 필요 |
| 투 포인터 스왑 | `O(n)` | `O(1)` | 양쪽 끝에서 모음을 찾아 바로 교환 |

## 마무리

1. **"모음만 뒤집는다"는 조건은 양쪽 끝에서 모음을 찾아 교환하는 투 포인터로 자연스럽게 변환된다** — 자음은 건너뛰고 모음끼리만 스왑하면 됩니다
2. **투 포인터가 `O(1)` 추가 공간을 달성하는 핵심은 "수집 없이 즉시 교환"** — 모음을 따로 모아 뒤집는 단계를 제거합니다
3. **`left`와 `right`가 각각 한 방향으로만 움직이므로, 총 이동 횟수는 `n`을 넘지 않는다** — 안쪽 `while`이 두 개 있어도 전체 시간은 `O(n)`입니다

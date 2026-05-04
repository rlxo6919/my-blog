---
title: "Ransom Note — 문자 개수로 문자열 구성 가능 여부 판정하기"
date: "2026-05-04"
category: "study"
tags: ["알고리즘", "문자열", "해시"]
excerpt: "`magazine`의 문자들로 `ransomNote`를 만들 수 있는지 판정하는 LeetCode 383번, 느린 문자 제거 방식부터 해시맵 카운팅, 길이 26 배열 `O(n)` 풀이까지 정리합니다."
---

## `magazine`의 문자들로 `ransomNote`를 만들 수 있을까?

LeetCode `383`번 문제는 이렇게 주어집니다.

> 문자열 `ransomNote`와 `magazine`이 주어집니다. `magazine`의 문자들을 사용해 `ransomNote`를 만들 수 있으면 `true`, 아니면 `false`를 반환합니다. 각 문자는 한 번만 사용할 수 있습니다.

예시는 이렇습니다.

- `ransomNote = "a"`, `magazine = "b"` → `false`
- `ransomNote = "aa"`, `magazine = "ab"` → `false`
- `ransomNote = "aa"`, `magazine = "aab"` → `true`

제약은 다음과 같습니다.

- `1 <= ransomNote.length, magazine.length <= 10^5`
- 두 문자열은 소문자 영문으로만 구성

이 문제의 핵심은 단순히 문자가 "있다/없다"가 아니라 **필요한 개수만큼 있는가**입니다. 이 글에서는 문자를 하나씩 소비하는 직관적인 풀이부터, 해시맵 카운팅, 그리고 소문자 영문 제약을 이용한 길이 26 배열 풀이까지 정리하겠습니다. 시간·공간 복잡도 표기가 익숙하지 않다면 [시간 복잡도와 공간 복잡도 완전 정복](/posts/52-time-and-space-complexity)을 먼저 읽어 보시는 것을 권합니다.

## 문제를 다시 해석해 보기

`ransomNote = "aa"`, `magazine = "ab"`를 보겠습니다.

- `magazine` 안에 `'a'`는 있습니다
- 하지만 `'a'`는 1개뿐입니다
- `ransomNote`는 `'a'`를 2개 요구합니다

즉 이 문제는 "`ransomNote`의 모든 문자가 `magazine`에 등장하는가"를 묻는 문제가 아닙니다. 정확한 질문은 이렇습니다.

```text
magazine이 각 문자를 몇 개 가지고 있는가?
ransomNote가 그 개수를 초과해서 요구하는가?
```

반대로 `ransomNote = "aa"`, `magazine = "aab"`라면:

- `'a'` 2개를 모두 공급할 수 있고
- `'b'`는 남아도 상관없습니다

그래서 자연스러운 해법은 **문자별 개수를 세고 비교하는 것**입니다.

## Phase 1. 문자를 하나씩 찾아서 소비하기

가장 먼저 떠올릴 수 있는 방법은 `ransomNote`의 각 문자를 보면서, `magazine`에서 같은 문자를 하나 찾아 지우는 것입니다.

```kotlin
fun canConstruct(ransomNote: String, magazine: String): Boolean {
    val pool = StringBuilder(magazine)

    for (ch in ransomNote) {
        val idx = pool.indexOf(ch.toString())
        if (idx == -1) return false
        pool.deleteCharAt(idx)
    }

    return true
}
```

`ransomNote = "aa"`, `magazine = "aab"`를 따라가면:

- 첫 번째 `'a'`를 찾음 → `pool = "ab"`
- 두 번째 `'a'`를 찾음 → `pool = "b"`
- 끝까지 찾았으므로 `true`

이 풀이는 동작은 맞지만 효율이 좋지 않습니다.

- 매 문자마다 `indexOf`로 검색해야 합니다
- `deleteCharAt`를 하면 뒤 문자를 당겨야 합니다

문자열 길이가 최대 `10^5`이므로, 이런 방식은 최악의 경우 `O(n^2)`까지 커집니다. 이 문제는 큰 입력이 들어올 수 있으므로, 문자를 실제로 지우기보다 **개수만 관리**하는 쪽이 맞습니다.

## Phase 2. 해시맵으로 문자 개수 세기

먼저 `magazine`의 문자 개수를 세고, `ransomNote`를 돌면서 하나씩 차감하면 됩니다.

```kotlin
fun canConstruct(ransomNote: String, magazine: String): Boolean {
    val counts = HashMap<Char, Int>()

    for (ch in magazine) {
        counts[ch] = (counts[ch] ?: 0) + 1
    }

    for (ch in ransomNote) {
        val available = counts[ch] ?: 0
        if (available == 0) return false
        counts[ch] = available - 1
    }

    return true
}
```

`ransomNote = "aa"`, `magazine = "aab"`라면:

```text
magazine counts:
'a' -> 2
'b' -> 1

ransomNote consume:
첫 번째 'a' -> 2 -> 1
두 번째 'a' -> 1 -> 0
```

끝까지 모자라지 않았으므로 `true`입니다.

반대로 `ransomNote = "aa"`, `magazine = "ab"`라면:

```text
'a' -> 1 -> 0
두 번째 'a'에서 available == 0
```

이 시점에 바로 `false`를 반환할 수 있습니다.

시간 복잡도는 `O(r + m)`입니다. 여기서 `r`은 `ransomNote.length`, `m`은 `magazine.length`입니다. 두 문자열을 한 번씩만 훑습니다. 공간 복잡도는 서로 다른 문자 수를 `k`라고 할 때 `O(k)`입니다.

## Phase 3. 길이 26 배열로 더 단순하게

이 문제는 문자열이 **소문자 영문 26개**만 사용된다고 보장합니다. 그래서 해시맵 대신 크기 26의 정수 배열을 쓰는 편이 더 단순합니다.

```kotlin
fun canConstruct(ransomNote: String, magazine: String): Boolean {
    val counts = IntArray(26)

    for (ch in magazine) {
        counts[ch - 'a']++
    }

    for (ch in ransomNote) {
        val idx = ch - 'a'
        counts[idx]--
        if (counts[idx] < 0) return false
    }

    return true
}
```

핵심은 `counts[idx]`를 해당 문자의 **남은 개수**로 보는 것입니다.

- 먼저 `magazine`에 있는 각 문자의 개수를 기록합니다
- `ransomNote`에서 문자를 하나 쓸 때마다 그 개수를 1 줄입니다
- 줄인 결과가 음수가 되면 필요한 수가 공급 수보다 많다는 뜻입니다

`ransomNote = "aa"`, `magazine = "aab"`라면:

```text
초기 counts['a'] = 2
첫 번째 'a' 사용 -> 1
두 번째 'a' 사용 -> 0
```

끝까지 음수가 되지 않았으므로 `true`입니다.

`ransomNote = "aa"`, `magazine = "ab"`라면:

```text
초기 counts['a'] = 1
첫 번째 'a' 사용 -> 0
두 번째 'a' 사용 -> -1
```

이 순간 바로 `false`입니다.

시간 복잡도는 `O(r + m)`이고, 공간 복잡도는 배열 크기가 항상 26으로 고정이므로 `O(1)`입니다.

## 왜 음수가 되는 순간 실패해도 되나요?

`counts[idx]`가 음수라는 것은, 지금까지 사용한 개수가 `magazine`이 가진 개수를 넘어섰다는 뜻입니다.

예를 들어 `'a'`의 남은 개수가 0인데 `ransomNote`가 `'a'`를 하나 더 요구하면:

```text
0 - 1 = -1
```

이 됩니다. 이후에 다른 문자를 더 확인하더라도 부족했던 `'a'`가 갑자기 생기지는 않습니다. 그래서 바로 실패해도 됩니다.

이 조기 종료는 구현도 단순하고, 앞부분에서 이미 불가능한 경우 불필요한 탐색도 줄여 줍니다.

## `magazine`이 더 짧으면 바로 실패할 수 있나요?

그렇습니다. `ransomNote`의 길이가 `magazine`보다 길면, 어떤 경우에도 만들 수 없습니다.

```kotlin
if (ransomNote.length > magazine.length) return false
```

이 검사는 선택 사항입니다. 넣으면 약간 더 빠르게 실패할 수 있지만, 없어도 Phase 2나 Phase 3의 카운팅 풀이가 자연스럽게 `false`를 반환합니다. 저는 코드 길이를 더 늘리지 않기 위해 최종 풀이에서는 생략하는 편입니다.

## 엣지 케이스

자주 확인해 볼 만한 입력은 이렇습니다.

| 입력 | 결과 | 이유 |
| --- | --- | --- |
| `"a"`, `"b"` | `false` | 필요한 문자가 없음 |
| `"aa"`, `"ab"` | `false` | `'a'` 개수가 부족 |
| `"aa"`, `"aab"` | `true` | `'a'` 2개를 공급 가능 |
| `"abc"`, `"cbad"` | `true` | 순서는 상관없고 개수만 맞으면 됨 |
| `"aab"`, `"baa"` | `true` | 같은 문자를 여러 번 써도 개수만 맞으면 됨 |
| `"aaaa"`, `"aaa"` | `false` | 한 개라도 부족하면 실패 |

특히 `"abc"`와 `"cbad"`가 중요합니다. 이 문제는 부분 문자열 문제도 아니고, 순서를 맞추는 문제도 아닙니다. **문자 개수만 맞으면 됩니다.**

## 세 풀이를 다시 비교

| 풀이 | 시간 | 공간 | 특징 |
| --- | --- | --- | --- |
| 문자를 찾아서 직접 제거 | 최악 `O(n^2)` | `O(n)` | 가장 직관적이지만 큰 입력에서 비효율적 |
| 해시맵으로 개수 카운팅 | `O(r + m)` | `O(k)` | 문자 집합이 일반적이어도 그대로 확장 가능 |
| 길이 26 배열 카운팅 | `O(r + m)` | `O(1)` | 이 문제 제약에 가장 잘 맞는 최종 풀이 |

## 마무리

1. **이 문제는 문자의 존재 여부가 아니라 개수 비교 문제입니다** — 같은 문자가 여러 번 필요할 수 있습니다
2. **문자를 실제로 지우는 방식은 느립니다** — 큰 입력에서는 빈도 카운팅으로 바꾸는 것이 맞습니다
3. **해시맵 카운팅은 가장 일반적인 풀이입니다** — 문자 종류가 늘어나도 그대로 적용할 수 있습니다
4. **이 문제는 소문자 영문 26개만 다루므로 `IntArray(26)`가 가장 깔끔합니다** — 공간도 `O(1)`입니다
5. **개수를 차감하다 음수가 되는 순간 바로 실패할 수 있습니다** — 필요한 개수가 공급량을 초과했다는 뜻이기 때문입니다

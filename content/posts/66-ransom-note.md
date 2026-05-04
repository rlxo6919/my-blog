---
title: "Ransom Note — 문자 빈도 카운팅으로 구성 가능 여부 판정하기"
date: "2026-05-04"
category: "study"
tags: ["알고리즘", "문자열", "해시"]
excerpt: "잡지 문자열의 문자를 한 번씩만 써서 ransom note를 만들 수 있는지 판정하는 LeetCode 383번, 문자 제거 브루트포스부터 해시맵 카운팅, 알파벳 26칸 배열 `O(n)` 풀이까지 정리합니다."
---

## 잡지 문자열로 메모를 만들 수 있는가, 어떤 문제인가요?

LeetCode `383`번 문제는 이렇게 주어집니다.

> 문자열 `ransomNote`와 `magazine`이 주어집니다. `magazine`의 문자들을 사용해 `ransomNote`를 만들 수 있으면 `true`, 아니면 `false`를 반환합니다. 각 문자는 한 번만 사용할 수 있습니다.

예시는 이렇습니다.

- `ransomNote = "a"`, `magazine = "b"` → `false`
- `ransomNote = "aa"`, `magazine = "ab"` → `false`
- `ransomNote = "aa"`, `magazine = "aab"` → `true`

제약은 다음과 같습니다.

- `1 <= ransomNote.length, magazine.length <= 10^5`
- 두 문자열은 소문자 영문으로만 구성

핵심은 단순히 "필요한 문자가 magazine 안에 존재하는가"가 아니라, **각 문자가 필요한 개수만큼 존재하는가**입니다. 이 글에서는 문자열에서 문자를 직접 지우는 브루트포스부터, 해시맵 카운팅, 그리고 소문자 영문 제약을 이용한 길이 26 배열 풀이까지 단계적으로 정리하겠습니다. 시간·공간 복잡도 표기가 익숙하지 않다면 [시간 복잡도와 공간 복잡도 완전 정복](/posts/52-time-and-space-complexity)을 먼저 읽어 보시는 것을 권합니다.

## 문제를 "존재"가 아니라 "개수"로 바꾸기

`ransomNote = "aa"`, `magazine = "ab"`를 보겠습니다.

- `'a'`는 `magazine` 안에 있습니다
- 하지만 `'a'`가 **1개뿐**입니다
- `ransomNote`는 `'a'`를 **2개** 요구합니다

즉 이 문제는 membership 문제가 아닙니다. `contains` 수준으로는 부족하고, **문자별 빈도 수 비교**가 필요합니다.

반대로 `ransomNote = "aa"`, `magazine = "aab"`라면:

- 필요한 `'a'` 2개를 모두 공급할 수 있고
- 남는 `'b'`는 무시해도 됩니다

그래서 자연스러운 해법은 "magazine이 각 문자를 몇 개 갖고 있는지 세고, ransomNote가 그 개수를 초과하는지 확인하는 것"입니다.

## Phase 1. 문자를 하나씩 찾아 지우기

가장 직관적인 방법은 `ransomNote`의 각 문자를 보면서 `magazine`에서 같은 문자를 하나 찾아 소비하는 것입니다.

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
- 끝까지 소비했으므로 `true`

정답은 맞지만 효율이 좋지 않습니다. 매번 `indexOf`로 뒤져야 하고, `deleteCharAt` 이후 문자를 당기는 비용도 있습니다. 문자열 길이가 최대 `10^5`이므로 이런 방식은 최악의 경우 `O(n^2)`까지 커질 수 있습니다.

이 문제는 큰 입력이 들어올 수 있으므로, 문자를 실제로 지우는 대신 **개수만 관리**하는 쪽이 맞습니다.

## Phase 2. 해시맵으로 문자 빈도 세기

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

시간 복잡도는 `O(r + m)`입니다. 여기서 `r`은 `ransomNote.length`, `m`은 `magazine.length`입니다. 문자열 둘을 한 번씩만 훑습니다. 공간 복잡도는 서로 다른 문자 수를 `k`라고 할 때 `O(k)`입니다.

## Phase 3. 길이 26 배열로 더 단순하게

문제 제약에서 문자열이 **소문자 영문 26개**만 사용된다고 보장합니다. 그래서 해시맵 대신 크기 26의 정수 배열을 쓰는 편이 더 단순하고 빠릅니다.

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

이 풀이의 핵심은 차감 순서입니다.

- `magazine`에서 얻은 재고를 `counts`에 저장
- `ransomNote`의 문자를 하나 쓸 때마다 `counts[idx]--`
- 감소한 결과가 음수면 필요한 개수가 재고를 초과한 것

`ransomNote = "aa"`, `magazine = "aab"`라면:

```text
초기 counts['a'] = 2, counts['b'] = 1

첫 번째 'a' 사용 -> counts['a'] = 1
두 번째 'a' 사용 -> counts['a'] = 0
```

음수가 되지 않았으므로 `true`입니다.

`ransomNote = "aa"`, `magazine = "ab"`라면:

```text
초기 counts['a'] = 1, counts['b'] = 1

첫 번째 'a' 사용 -> counts['a'] = 0
두 번째 'a' 사용 -> counts['a'] = -1
```

음수가 되는 순간 공급이 부족하다는 뜻이므로 `false`입니다.

시간 복잡도는 역시 `O(r + m)`이고, 공간 복잡도는 배열 크기가 항상 26으로 고정이므로 `O(1)`입니다.

## 왜 음수가 되면 바로 실패인가요?

`counts[idx]`는 해당 문자의 **남은 재고**를 뜻합니다.

예를 들어 `'a'`의 현재 재고가 0인데, `ransomNote`가 `'a'`를 하나 더 요구하면:

```text
0 - 1 = -1
```

이 됩니다. 재고가 음수라는 것은 지금까지 소비한 개수가 공급량을 초과했다는 뜻입니다. 이후에 다른 문자를 더 보더라도 이미 부족했던 `'a'`가 갑자기 생기지는 않으므로, 즉시 `false`를 반환해도 됩니다.

이 조기 종료 덕분에 평균 실행 시간도 좋아집니다. 앞부분에서 이미 불가능한 경우라면 문자열 끝까지 볼 필요가 없습니다.

## `ransomNote`를 먼저 세도 되나요?

됩니다. 반대로 `ransomNote`의 문자 개수를 먼저 세고, `magazine`을 돌며 차감해도 됩니다.

예를 들어:

1. `ransomNote`를 세서 필요한 개수를 기록
2. `magazine`을 돌며 해당 개수를 줄임
3. 마지막에 모든 필요 개수가 0 이하인지 확인

이 방식도 정답입니다. 다만 구현은 보통 현재 글의 방식이 더 짧습니다.

- 공급량을 먼저 기록하고 수요를 차감
- 차감하다 음수가 되면 즉시 실패

문제를 "재고 관리"로 보면 이 방향이 더 자연스럽습니다.

## 엣지 케이스

자주 확인해 볼 만한 입력은 이렇습니다.

| 입력 | 결과 | 이유 |
| --- | --- | --- |
| `"a"`, `"b"` | `false` | 필요한 문자가 아예 없음 |
| `"aa"`, `"ab"` | `false` | `'a'` 개수가 부족 |
| `"aa"`, `"aab"` | `true` | `'a'` 2개를 정확히 공급 가능 |
| `"abc"`, `"cbad"` | `true` | 순서는 상관없고 개수만 맞으면 됨 |
| `"aab"`, `"baa"` | `true` | 같은 문자를 여러 번 써도 재고만 맞으면 됨 |
| `"aaaa"`, `"aaa"` | `false` | 한 글자 차이도 실패 |

특히 `"abc"`와 `"cbad"`가 중요합니다. 이 문제는 부분 문자열이나 순서 문제가 아니라, **멀티셋 비교**에 가깝습니다.

## 세 풀이를 다시 비교

| 풀이 | 시간 | 공간 | 특징 |
| --- | --- | --- | --- |
| 문자열에서 찾아 지우기 | 최악 `O(n^2)` | `O(n)` | 가장 직관적이지만 큰 입력에서 비효율적 |
| 해시맵 카운팅 | `O(r + m)` | `O(k)` | 문자 집합이 일반적일 때도 그대로 확장 가능 |
| 길이 26 배열 카운팅 | `O(r + m)` | `O(1)` | 이 문제의 제약에 가장 잘 맞는 최종 풀이 |

## 마무리

1. **이 문제의 핵심은 문자의 존재 여부가 아니라 개수입니다** — `'a'`가 magazine에 있어도 필요한 개수보다 적으면 실패합니다
2. **문자를 실제로 지우는 방식은 비효율적입니다** — 큰 입력에서는 빈도 카운팅으로 바꿔야 합니다
3. **해시맵 카운팅은 가장 일반적인 풀이입니다** — 문자 종류가 많아져도 그대로 적용할 수 있습니다
4. **이 문제는 소문자 영문 26개만 다루므로 `IntArray(26)`가 가장 깔끔합니다** — 고정 크기라 공간도 `O(1)`입니다
5. **차감 결과가 음수가 되는 순간 바로 실패할 수 있습니다** — 필요한 개수가 공급량을 초과했다는 뜻이기 때문입니다

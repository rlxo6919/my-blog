---
title: "Valid Palindrome — 투 포인터로 영숫자만 비교하는 팰린드롬 판정"
date: "2026-05-18"
category: "study"
tags: ["알고리즘", "문자열", "투 포인터"]
excerpt: "문자열이 유효한 팰린드롬인지 판정하는 LeetCode 125번, 정제 후 뒤집기 풀이부터 원본 문자열을 직접 훑는 투 포인터 `O(n)`/`O(1)` 풀이까지 정리합니다."
---

## 유효한 팰린드롬 판정, 어떤 문제인가요?

LeetCode `125`번 문제는 이렇게 주어집니다.

> 문자열 `s`가 주어졌을 때, 대소문자를 구분하지 않고 영숫자 문자만 고려했을 때 팰린드롬이면 `true`, 아니면 `false`를 반환합니다.

여기서 영숫자는 알파벳과 숫자를 말합니다. 공백, 쉼표, 콜론 같은 문자는 비교 대상에서 제외합니다.

예시는 이렇습니다.

- `s = "A man, a plan, a canal: Panama"` → `true`
- `s = "race a car"` → `false`
- `s = " "` → `true`

제약은 다음과 같습니다.

- `1 <= s.length <= 2 * 10^5`
- `s`는 출력 가능한 ASCII 문자로만 구성

핵심은 문자열 전체를 그대로 비교하는 것이 아니라, **비교 대상이 되는 문자만 골라 대소문자를 통일한 뒤 양끝에서 비교하는 것**입니다. 이 글에서는 정제한 문자열을 뒤집는 방식부터, 정제 문자열을 양끝에서 비교하는 방식, 마지막으로 원본 문자열을 직접 훑는 투 포인터 풀이까지 정리하겠습니다. 시간·공간 복잡도 표기가 익숙하지 않다면 [시간 복잡도와 공간 복잡도 완전 정복](/posts/52-time-and-space-complexity)을 먼저 읽어 보시는 것을 권합니다.

## 먼저 조건을 정확히 바꾸기

문제의 조건은 한 문장으로 줄이면 이렇습니다.

```text
영숫자만 남기고 모두 소문자로 바꾼 문자열이 팰린드롬인가?
```

예를 들어 `"A man, a plan, a canal: Panama"`는 비교 전에 이렇게 바뀝니다.

```text
원본:       "A man, a plan, a canal: Panama"
정제 결과: "amanaplanacanalpanama"
```

정제 결과를 앞에서 읽어도, 뒤에서 읽어도 같습니다.

반면 `"race a car"`는 이렇게 됩니다.

```text
원본:       "race a car"
정제 결과: "raceacar"
뒤집은 값:  "racaecar"
```

둘이 다르므로 팰린드롬이 아닙니다.

`" "`처럼 영숫자가 하나도 없는 경우도 중요합니다. 비교 대상만 남기면 빈 문자열이 되고, 빈 문자열은 앞뒤가 다를 수 없으므로 팰린드롬으로 봅니다.

## Phase 1. 정제한 뒤 뒤집어서 비교하기

가장 직관적인 풀이는 비교할 문자만 모은 뒤, 뒤집은 문자열과 비교하는 것입니다.

```kotlin
fun isPalindrome(s: String): Boolean {
    val normalized = s
        .filter { it.isLetterOrDigit() }
        .lowercase()

    return normalized == normalized.reversed()
}
```

흐름은 문제 설명과 거의 같습니다.

1. `filter { it.isLetterOrDigit() }`로 알파벳과 숫자만 남김
2. `lowercase()`로 대소문자를 통일
3. `reversed()`로 뒤집은 문자열과 비교

`"A man, a plan, a canal: Panama"`라면 `normalized`는 `"amanaplanacanalpanama"`가 되고, 이 문자열을 뒤집어도 같습니다.

코드는 짧고 읽기 쉽습니다. 다만 정제 문자열과 뒤집은 문자열을 새로 만들기 때문에 추가 공간이 `O(n)`입니다. 입력 길이가 최대 `2 * 10^5`이므로 통과 자체는 가능하지만, 이 문제는 투 포인터로 추가 문자열 없이도 풀 수 있습니다.

시간 복잡도는 `O(n)`, 공간 복잡도는 `O(n)`입니다.

## Phase 2. 정제 문자열을 양끝에서 비교하기

뒤집은 문자열을 만들지 않고, 정제된 문자열을 양끝에서 비교할 수도 있습니다.

```kotlin
fun isPalindrome(s: String): Boolean {
    val normalized = StringBuilder()

    for (ch in s) {
        if (ch.isLetterOrDigit()) {
            normalized.append(ch.lowercaseChar())
        }
    }

    var left = 0
    var right = normalized.length - 1

    while (left < right) {
        if (normalized[left] != normalized[right]) {
            return false
        }
        left++
        right--
    }

    return true
}
```

이 방식은 `reversed()` 결과를 만들지 않습니다. 정제된 문자열 하나만 만들어 두고, `left`와 `right`를 양쪽 끝에서 중앙으로 이동시키며 비교합니다.

```text
normalized = "amanaplanacanalpanama"
              L                 R
```

양끝 문자가 같으면 안쪽으로 이동합니다.

```text
a == a → 다음 비교
m == m → 다음 비교
a == a → 다음 비교
...
```

중간까지 모두 통과하면 팰린드롬입니다. 중간에 한 번이라도 다르면 바로 `false`를 반환하면 됩니다.

이 풀이는 뒤집은 문자열을 만들지 않는다는 점에서 Phase 1보다 낫습니다. 하지만 `normalized` 자체는 여전히 필요하므로 공간 복잡도는 `O(n)`입니다. 더 줄이려면 정제 문자열도 만들지 말고, 원본 문자열 위에서 바로 비교해야 합니다.

시간 복잡도는 `O(n)`, 공간 복잡도는 `O(n)`입니다.

## Phase 3. 원본 문자열에서 바로 투 포인터로 비교하기

최종 풀이는 원본 문자열 양끝에 포인터를 두고, 영숫자가 아닌 문자는 건너뛰면서 비교합니다.

```kotlin
fun isPalindrome(s: String): Boolean {
    var left = 0
    var right = s.length - 1

    while (left < right) {
        while (left < right && !s[left].isLetterOrDigit()) {
            left++
        }

        while (left < right && !s[right].isLetterOrDigit()) {
            right--
        }

        if (s[left].lowercaseChar() != s[right].lowercaseChar()) {
            return false
        }

        left++
        right--
    }

    return true
}
```

핵심은 네 단계입니다.

1. 왼쪽 포인터가 영숫자를 만날 때까지 오른쪽으로 이동
2. 오른쪽 포인터가 영숫자를 만날 때까지 왼쪽으로 이동
3. 두 문자를 소문자로 바꿔 비교
4. 같으면 양쪽 포인터를 안쪽으로 이동

`"A man, a plan, a canal: Panama"`를 보면 처음에는 이렇게 시작합니다.

```text
"A man, a plan, a canal: Panama"
 L                              R
```

`A`와 `a`는 대소문자만 다르므로 같은 문자로 봅니다.

```text
lowercase('A') == lowercase('a')
```

그다음 포인터를 안쪽으로 이동합니다.

```text
"A man, a plan, a canal: Panama"
  L                           R
```

왼쪽은 공백을 만나므로 건너뛰고, 오른쪽은 `m`을 가리킵니다.

```text
"A man, a plan, a canal: Panama"
   L                          R
```

이제 `m`과 `m`을 비교합니다. 이런 식으로 영숫자가 아닌 문자는 비교에서 제외하고, 실제 비교 대상만 양끝에서 맞춰 봅니다.

## 왜 안쪽 `while`이 있어도 `O(n)`인가요?

코드 안에 `while`이 세 개 있어서 `O(n^2)`처럼 보일 수 있습니다.

```kotlin
while (left < right) {
    while (left < right && !s[left].isLetterOrDigit()) {
        left++
    }

    while (left < right && !s[right].isLetterOrDigit()) {
        right--
    }

    // ...
}
```

하지만 `left`는 오른쪽으로만 움직이고, `right`는 왼쪽으로만 움직입니다. 한 번 지나간 문자를 다시 검사하지 않습니다.

```text
left:  0 → 1 → 2 → 3 → ...
right: n-1 → n-2 → n-3 → ...
```

따라서 두 포인터가 움직이는 총 횟수는 많아야 `n`번 정도입니다. 안쪽 `while`은 중첩 반복으로 보이지만, 실제로는 각 포인터가 자기 방향으로 한 번씩만 문자열을 훑습니다.

그래서 전체 시간 복잡도는 `O(n)`입니다.

## 왜 비교할 때만 소문자로 바꾸나요?

투 포인터 풀이에서는 전체 문자열을 미리 소문자로 만들 필요가 없습니다. 비교해야 하는 두 문자만 그 순간에 소문자로 바꾸면 충분합니다.

```kotlin
if (s[left].lowercaseChar() != s[right].lowercaseChar()) {
    return false
}
```

이렇게 하면 `lowercase()`로 새 문자열을 만들지 않아도 됩니다. 포인터와 임시 비교값만 쓰므로 추가 공간은 `O(1)`입니다.

Kotlin에서는 `Char.isLetterOrDigit()`로 영숫자인지 확인하고, `Char.lowercaseChar()`로 대소문자를 통일할 수 있습니다. 이 문제의 입력은 ASCII 문자로 제한되어 있으므로, 알파벳 대소문자와 숫자 비교를 처리하기에 충분합니다.

## 엣지 케이스

자주 확인해 볼 만한 입력은 이렇습니다.

| 입력 | 결과 | 이유 |
| --- | --- | --- |
| `"A man, a plan, a canal: Panama"` | `true` | 정제하면 `"amanaplanacanalpanama"` |
| `"race a car"` | `false` | 정제하면 `"raceacar"`이고 앞뒤가 다름 |
| `" "` | `true` | 영숫자가 없으므로 정제 결과는 빈 문자열 |
| `".,"` | `true` | 비교할 영숫자가 없음 |
| `"0P"` | `false` | 숫자 `0`과 문자 `p`는 다름 |
| `"ab_a"` | `true` | `_`를 제외하면 `"aba"` |
| `"No lemon, no melon"` | `true` | 공백을 제외하고 대소문자를 통일하면 팰린드롬 |

특히 `" "`나 `".,"`처럼 영숫자가 아예 없는 경우를 놓치기 쉽습니다. 투 포인터 풀이에서는 양쪽 포인터가 서로 교차할 때까지 문자를 건너뛰다가 자연스럽게 `true`를 반환합니다.

## 세 풀이를 다시 비교

| 풀이 | 시간 | 공간 | 특징 |
| --- | --- | --- | --- |
| 정제 후 뒤집기 | `O(n)` | `O(n)` | 가장 짧고 직관적이지만 문자열을 추가로 만듦 |
| 정제 문자열 양끝 비교 | `O(n)` | `O(n)` | 뒤집은 문자열은 만들지 않지만 정제 문자열은 필요 |
| 원본 문자열 투 포인터 | `O(n)` | `O(1)` | 영숫자가 아닌 문자를 건너뛰며 원본에서 바로 비교 |

실전에서는 Phase 3의 투 포인터 풀이가 가장 적합합니다. 문제의 조건을 그대로 구현하면서도 정제 문자열을 만들지 않아 공간을 줄일 수 있습니다.

## 마무리

1. **이 문제는 원본 문자열 전체가 아니라 영숫자만 비교합니다** — 공백과 문장 부호는 건너뛰어야 합니다
2. **대소문자는 구분하지 않습니다** — 비교 직전에 `lowercaseChar()`로 통일하면 됩니다
3. **정제 후 뒤집기는 쉽지만 `O(n)` 추가 공간이 듭니다** — 학습용 첫 풀이로는 좋지만 최종 풀이로는 아쉽습니다
4. **투 포인터는 원본 문자열 위에서 바로 비교합니다** — 왼쪽과 오른쪽에서 영숫자를 찾아 중앙으로 이동합니다
5. **안쪽 `while`이 있어도 전체 시간은 `O(n)`입니다** — 각 포인터는 한 방향으로만 움직이고, 한 번 지나간 문자를 다시 보지 않습니다

---
title: "Reorder Data in Log Files — 문자 로그만 정렬하고 숫자 로그는 순서 유지하기"
date: "2026-05-18"
category: "study"
tags: ["알고리즘", "문자열", "정렬"]
excerpt: "문자 로그와 숫자 로그를 재정렬하는 LeetCode 937번, 로그를 identifier와 content로 나누고 문자 로그만 content, identifier 순으로 정렬하는 풀이를 정리합니다."
---

## 로그 파일 재정렬, 어떤 문제인가요?

LeetCode `937`번 문제는 이렇게 주어집니다.

> 로그 문자열 배열 `logs`가 주어집니다. 각 로그는 첫 단어가 식별자(identifier)이고, 그 뒤에 내용(content)이 붙습니다. 내용이 알파벳 소문자로만 이루어진 로그는 문자 로그, 숫자로만 이루어진 로그는 숫자 로그입니다. 조건에 맞게 로그를 재정렬해 반환하세요.

재정렬 규칙은 다음과 같습니다.

1. 문자 로그는 숫자 로그보다 앞에 와야 합니다
2. 문자 로그는 내용을 기준으로 사전순 정렬합니다
3. 내용이 같으면 식별자를 기준으로 사전순 정렬합니다
4. 숫자 로그는 입력에서의 상대적 순서를 유지합니다

예시는 이렇습니다.

```text
logs = [
    "dig1 8 1 5 1",
    "let1 art can",
    "dig2 3 6",
    "let2 own kit dig",
    "let3 art zero"
]

결과 = [
    "let1 art can",
    "let3 art zero",
    "let2 own kit dig",
    "dig1 8 1 5 1",
    "dig2 3 6"
]
```

제약은 다음과 같습니다.

- `1 <= logs.length <= 100`
- `3 <= logs[i].length <= 100`
- 각 로그의 토큰은 공백 하나로 구분됨
- 각 로그는 식별자와 그 뒤의 내용을 반드시 가짐

이 문제의 핵심은 전체 문자열을 그대로 정렬하는 것이 아닙니다. **식별자를 제외한 내용(content)을 기준으로 로그 타입과 정렬 순서를 판단해야 합니다.** 이 글에서는 로그를 `identifier`와 `content`로 나누는 방법부터, 전체 comparator 방식의 주의점, 마지막으로 문자 로그만 정렬하고 숫자 로그를 뒤에 붙이는 풀이까지 정리하겠습니다. 시간·공간 복잡도 표기가 익숙하지 않다면 [시간 복잡도와 공간 복잡도 완전 정복](/posts/52-time-and-space-complexity)을 먼저 읽어 보시는 것을 권합니다.

## 로그를 두 부분으로 나누기

로그는 항상 다음 형태입니다.

```text
identifier content
```

예를 들어 `"let1 art can"`은 이렇게 나눌 수 있습니다.

```text
identifier = "let1"
content    = "art can"
```

중요한 점은 내용이 여러 단어일 수 있다는 것입니다. `"let2 own kit dig"`를 공백 기준으로 전부 쪼개면:

```text
["let2", "own", "kit", "dig"]
```

이렇게 되지만, 정렬에 필요한 내용은 `"own kit dig"` 전체입니다. 그래서 가장 간단한 방법은 **첫 번째 공백의 위치만 찾는 것**입니다.

```kotlin
val firstSpace = log.indexOf(' ')
val identifier = log.substring(0, firstSpace)
val content = log.substring(firstSpace + 1)
```

이렇게 하면 첫 단어는 식별자로, 나머지 전체는 내용으로 분리됩니다.

```text
log = "let2 own kit dig"

identifier = "let2"
content    = "own kit dig"
```

로그 타입도 `content`의 첫 글자만 보면 알 수 있습니다. 문제에서 문자 로그는 내용이 모두 알파벳 소문자이고, 숫자 로그는 내용이 모두 숫자라고 보장하기 때문입니다.

```kotlin
if (content[0].isDigit()) {
    // 숫자 로그
} else {
    // 문자 로그
}
```

## Phase 1. 전체 로그를 comparator 하나로 정렬하기

먼저 떠올릴 수 있는 방법은 모든 로그를 한 번에 정렬하는 것입니다. 문자 로그와 숫자 로그의 우선순위를 comparator 안에서 모두 처리합니다.

```kotlin
fun reorderLogFiles(logs: Array<String>): Array<String> {
    fun splitLog(log: String): Pair<String, String> {
        val firstSpace = log.indexOf(' ')
        val identifier = log.substring(0, firstSpace)
        val content = log.substring(firstSpace + 1)
        return identifier to content
    }

    return logs.sortedWith { a, b ->
        val (aIdentifier, aContent) = splitLog(a)
        val (bIdentifier, bContent) = splitLog(b)

        val aIsLetter = !aContent[0].isDigit()
        val bIsLetter = !bContent[0].isDigit()

        when {
            aIsLetter && bIsLetter -> {
                val contentCompare = aContent.compareTo(bContent)
                if (contentCompare != 0) {
                    contentCompare
                } else {
                    aIdentifier.compareTo(bIdentifier)
                }
            }

            aIsLetter -> -1
            bIsLetter -> 1
            else -> 0
        }
    }.toTypedArray()
}
```

비교 규칙은 다음과 같습니다.

- 둘 다 문자 로그이면 `content`를 먼저 비교하고, 같으면 `identifier`를 비교
- 왼쪽만 문자 로그이면 왼쪽이 앞
- 오른쪽만 문자 로그이면 오른쪽이 앞
- 둘 다 숫자 로그이면 순서를 바꾸지 않도록 같은 값으로 취급

이 방식은 문제 조건을 comparator 하나에 모두 담을 수 있다는 장점이 있습니다. 다만 숫자 로그끼리 비교할 때 `0`을 반환하므로, 숫자 로그의 상대적 순서를 유지하려면 정렬 구현이 안정 정렬이어야 합니다.

코딩 테스트에서는 이 가정을 알고 쓰면 되지만, 더 명확한 방법은 숫자 로그를 애초에 정렬 대상에서 제외하는 것입니다.

## Phase 2. 문자 로그와 숫자 로그를 먼저 분리하기

숫자 로그는 정렬하지 않고 입력 순서를 유지해야 합니다. 그렇다면 숫자 로그는 별도 리스트에 순서대로 담아 두고, 문자 로그만 정렬하면 됩니다.

```kotlin
fun reorderLogFiles(logs: Array<String>): Array<String> {
    fun contentOf(log: String): String {
        val firstSpace = log.indexOf(' ')
        return log.substring(firstSpace + 1)
    }

    fun identifierOf(log: String): String {
        val firstSpace = log.indexOf(' ')
        return log.substring(0, firstSpace)
    }

    fun isDigitLog(log: String): Boolean {
        val firstSpace = log.indexOf(' ')
        return log[firstSpace + 1].isDigit()
    }

    val letterLogs = mutableListOf<String>()
    val digitLogs = mutableListOf<String>()

    for (log in logs) {
        if (isDigitLog(log)) {
            digitLogs.add(log)
        } else {
            letterLogs.add(log)
        }
    }

    letterLogs.sortWith(
        compareBy<String> { contentOf(it) }
            .thenBy { identifierOf(it) }
    )

    return (letterLogs + digitLogs).toTypedArray()
}
```

이 풀이에서는 숫자 로그의 순서 유지가 코드 구조로 바로 드러납니다.

```kotlin
for (log in logs) {
    if (isDigitLog(log)) {
        digitLogs.add(log)
    } else {
        letterLogs.add(log)
    }
}
```

`digitLogs`에는 입력에서 만난 순서 그대로 숫자 로그를 추가합니다. 이후 `digitLogs`는 정렬하지 않습니다.

```kotlin
return (letterLogs + digitLogs).toTypedArray()
```

마지막에 정렬된 문자 로그 뒤에 그대로 붙이기 때문에, 숫자 로그의 상대적 순서는 자연스럽게 유지됩니다.

## 문자 로그 정렬 기준 살펴보기

문자 로그는 두 단계로 정렬합니다.

```kotlin
letterLogs.sortWith(
    compareBy<String> { contentOf(it) }
        .thenBy { identifierOf(it) }
)
```

첫 번째 기준은 `content`입니다.

```text
"let1 art can"      → content = "art can"
"let3 art zero"     → content = "art zero"
"let2 own kit dig"  → content = "own kit dig"
```

사전순으로 비교하면 다음 순서가 됩니다.

```text
"art can"
"art zero"
"own kit dig"
```

그래서 문자 로그는 이렇게 정렬됩니다.

```text
"let1 art can"
"let3 art zero"
"let2 own kit dig"
```

만약 내용이 같다면 식별자를 비교합니다.

```text
"let2 art can"
"let1 art can"
```

두 로그의 `content`는 모두 `"art can"`입니다. 이때는 식별자를 비교하므로 `"let1"`이 `"let2"`보다 앞에 옵니다.

```text
"let1 art can"
"let2 art can"
```

즉 문자 로그의 정렬 키는 다음과 같습니다.

```text
(content, identifier)
```

식별자는 첫 번째 기준이 아닙니다. 식별자는 내용이 같은 문자 로그 사이에서만 tie-breaker로 사용됩니다.

## 왜 전체 문자열 정렬은 안 되나요?

단순히 `logs.sorted()`를 하면 식별자부터 비교합니다.

```text
"dig1 8 1 5 1"
"let1 art can"
"dig2 3 6"
"let2 own kit dig"
"let3 art zero"
```

이 경우 `"dig1..."`이 `"let1..."`보다 앞에 올 수 있습니다. 하지만 문제에서는 모든 문자 로그가 숫자 로그보다 앞에 와야 합니다.

또 문자 로그끼리도 식별자 기준으로 먼저 정렬하면 안 됩니다.

```text
"let2 art can"
"let1 art zero"
```

전체 문자열 기준으로는 `"let1 art zero"`가 `"let2 art can"`보다 앞입니다. 하지만 문제의 첫 번째 정렬 기준은 식별자가 아니라 내용입니다.

```text
content 비교:
"art can" < "art zero"

올바른 순서:
"let2 art can"
"let1 art zero"
```

따라서 이 문제는 문자열 배열을 그냥 정렬하는 문제가 아니라, 로그를 파싱한 뒤 문제에서 요구하는 정렬 키를 직접 만들어야 하는 문제입니다.

## 엣지 케이스

자주 확인해 볼 만한 입력은 이렇습니다.

| 입력 | 결과 | 이유 |
| --- | --- | --- |
| `["dig1 8 1", "dig2 3 6"]` | `["dig1 8 1", "dig2 3 6"]` | 숫자 로그만 있으므로 입력 순서 유지 |
| `["let1 art can"]` | `["let1 art can"]` | 문자 로그 하나만 있음 |
| `["let2 art can", "let1 art can"]` | `["let1 art can", "let2 art can"]` | 내용이 같으므로 식별자로 정렬 |
| `["a1 9 2", "g1 act car", "zo4 4 7", "a8 act zoo"]` | `["g1 act car", "a8 act zoo", "a1 9 2", "zo4 4 7"]` | 문자 로그 정렬 후 숫자 로그 원래 순서 유지 |
| `["let1 zoo", "let2 apple", "dig1 3 4"]` | `["let2 apple", "let1 zoo", "dig1 3 4"]` | 문자 로그는 내용 기준 사전순 |

특히 숫자 로그만 있는 경우와, 문자 로그의 내용이 같은 경우를 확인해야 합니다. 숫자 로그는 절대 내부 순서를 바꾸면 안 되고, 문자 로그는 내용이 같을 때만 식별자를 비교해야 합니다.

## 복잡도

로그 개수를 `n`, 문자 로그 개수를 `k`, 로그 하나의 평균 길이를 `L`이라고 하겠습니다.

분리 단계에서는 모든 로그를 한 번씩 보므로 `O(n * L)`로 볼 수 있습니다. 문자 로그 정렬은 `k`개를 정렬하고, 비교할 때 문자열 내용을 비교하므로 `O(k log k * L)`입니다.

따라서 전체 시간 복잡도는 다음과 같습니다.

```text
O(n * L + k log k * L)
```

최악의 경우 모든 로그가 문자 로그라면 `k = n`이므로:

```text
O(n log n * L)
```

공간 복잡도는 문자 로그와 숫자 로그를 담는 리스트 때문에 `O(n)`입니다. Kotlin에서 `substring`으로 만든 임시 문자열까지 포함해 더 엄밀하게 보면 문자열 길이만큼의 추가 비용이 비교 중 발생할 수 있습니다.

## 두 풀이를 다시 비교

| 풀이 | 시간 | 공간 | 특징 |
| --- | --- | --- | --- |
| 전체 로그를 comparator로 정렬 | `O(n log n * L)` | 정렬 구현에 따라 다름 | 코드가 한 곳에 모이지만 숫자 로그 순서 유지에 안정 정렬을 의식해야 함 |
| 문자/숫자 로그 분리 후 문자 로그만 정렬 | `O(n log n * L)` | `O(n)` | 숫자 로그 순서 유지가 코드 구조로 명확히 드러남 |

이 문제는 성능보다 정렬 조건을 정확히 구현하는 것이 더 중요합니다. 숫자 로그를 정렬 대상에서 빼고, 문자 로그에만 `(content, identifier)` 정렬 키를 적용하면 조건을 깔끔하게 만족할 수 있습니다.

## 마무리

1. **로그는 첫 번째 공백을 기준으로 식별자와 내용으로 나눕니다** — 내용은 여러 단어일 수 있으므로 첫 공백만 기준으로 삼는 편이 명확합니다
2. **로그 타입은 내용의 첫 글자로 판단할 수 있습니다** — 문제에서 내용 전체가 문자 또는 숫자로만 이루어진다고 보장합니다
3. **문자 로그는 `(content, identifier)` 순서로 정렬합니다** — 식별자는 tie-breaker입니다
4. **숫자 로그는 정렬하지 않습니다** — 입력에서 만난 순서 그대로 뒤에 붙이면 됩니다
5. **전체 문자열 정렬은 틀립니다** — 문제의 정렬 기준은 원본 문자열이 아니라 파싱된 로그 내용입니다

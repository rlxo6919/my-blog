---
title: "Most Common Word — 금지어를 제외하고 가장 자주 나온 단어 찾기"
date: "2026-05-19"
category: "study"
tags: ["알고리즘", "문자열", "해시"]
excerpt: "문단에서 금지어를 제외하고 가장 많이 등장한 단어를 찾는 LeetCode 819번, 문장 부호 제거와 소문자 정규화, 해시 카운팅 풀이를 정리합니다."
---

## 가장 흔한 단어 찾기, 어떤 문제인가요?

LeetCode `819`번 문제는 이렇게 주어집니다.

> 문자열 `paragraph`와 금지어 배열 `banned`가 주어집니다. 대소문자를 구분하지 않고, 문장 부호를 제외했을 때, 금지어가 아니면서 가장 자주 등장한 단어를 반환하세요.

예시는 이렇습니다.

```text
paragraph = "Bob hit a ball, the hit BALL flew far after it was hit."
banned = ["hit"]

결과 = "ball"
```

`"hit"`은 세 번 등장하지만 금지어입니다. `"ball"`은 `"ball"`과 `"BALL"`이 같은 단어로 처리되어 두 번 등장합니다. 따라서 정답은 `"ball"`입니다.

제약은 다음과 같습니다.

- `1 <= paragraph.length <= 1000`
- `0 <= banned.length <= 100`
- `1 <= banned[i].length <= 10`
- `paragraph`는 영문자, 공백, 문장 부호로 구성
- `banned[i]`는 소문자 영문자로만 구성
- 금지어가 아닌 단어가 적어도 하나 존재하고, 정답은 유일함

이 문제의 핵심은 단어를 세기 전에 **비교 가능한 형태로 정규화**하는 것입니다. 문장 부호를 단어에서 분리하고, 대소문자를 소문자로 통일한 뒤, 금지어를 제외하고 개수를 세면 됩니다. 이 글에서는 단어를 먼저 정제해 리스트로 만드는 풀이부터, 금지어를 집합으로 바꾸는 개선, 마지막으로 문단을 한 번 훑으며 바로 카운팅하는 풀이까지 정리하겠습니다. 시간·공간 복잡도 표기가 익숙하지 않다면 [시간 복잡도와 공간 복잡도 완전 정복](/posts/52-time-and-space-complexity)을 먼저 읽어 보시는 것을 권합니다.

## 먼저 단어를 어떻게 볼지 정하기

원본 문단을 그대로 공백으로만 나누면 안 됩니다.

```text
"ball,"
"hit."
```

이런 단어가 생기기 때문입니다. 문제에서는 문장 부호를 제외해야 하므로 `"ball,"`은 `"ball"`로, `"hit."`은 `"hit"`으로 봐야 합니다.

대소문자도 구분하지 않습니다.

```text
"Bob"  -> "bob"
"BALL" -> "ball"
```

따라서 문제를 풀기 전에 문단은 다음 흐름으로 처리해야 합니다.

```text
1. 대문자를 소문자로 바꿈
2. 영문자가 아닌 문자는 단어 구분자로 봄
3. 빈 문자열은 버림
4. 금지어가 아닌 단어만 카운팅
```

예제 문단은 이렇게 바뀝니다.

```text
"Bob hit a ball, the hit BALL flew far after it was hit."

["bob", "hit", "a", "ball", "the", "hit", "ball", "flew", "far", "after", "it", "was", "hit"]
```

여기서 `"hit"`을 제외하고 개수를 세면 `"ball"`이 가장 많이 등장합니다.

## Phase 1. 정규식으로 단어 리스트를 만든 뒤 세기

가장 직관적인 방법은 문단을 소문자로 바꾸고, 영문자가 아닌 문자를 기준으로 나누는 것입니다.

```kotlin
fun mostCommonWord(paragraph: String, banned: Array<String>): String {
    val words = paragraph
        .lowercase()
        .split(Regex("[^a-z]+"))
        .filter { it.isNotEmpty() }

    val counts = HashMap<String, Int>()

    for (word in words) {
        if (word in banned) continue
        counts[word] = (counts[word] ?: 0) + 1
    }

    var answer = ""
    var maxCount = 0

    for ((word, count) in counts) {
        if (count > maxCount) {
            maxCount = count
            answer = word
        }
    }

    return answer
}
```

`Regex("[^a-z]+")`는 소문자 알파벳이 아닌 문자들이 연속해서 나오면 그 지점을 구분자로 보겠다는 뜻입니다.

```text
"ball, the" -> ["ball", "the"]
"hit."      -> ["hit"]
```

이 풀이는 문제를 이해하기 쉽습니다. 하지만 `word in banned`는 배열을 매번 순회합니다. 금지어 개수를 `b`라고 하면 단어마다 `O(b)` 확인이 필요합니다.

제약이 작아서 통과는 가능하지만, 금지어 조회는 집합으로 바꾸는 편이 더 자연스럽습니다.

## Phase 2. 금지어를 `HashSet`으로 바꾸기

금지어는 "포함되어 있는가"만 빠르게 확인하면 됩니다. 이런 경우에는 `HashSet`이 잘 맞습니다.

```kotlin
fun mostCommonWord(paragraph: String, banned: Array<String>): String {
    val bannedSet = banned.toHashSet()
    val counts = HashMap<String, Int>()

    val words = paragraph
        .lowercase()
        .split(Regex("[^a-z]+"))
        .filter { it.isNotEmpty() }

    var answer = ""
    var maxCount = 0

    for (word in words) {
        if (word in bannedSet) continue

        val count = (counts[word] ?: 0) + 1
        counts[word] = count

        if (count > maxCount) {
            maxCount = count
            answer = word
        }
    }

    return answer
}
```

달라진 점은 두 가지입니다.

첫째, 금지어 배열을 집합으로 바꿉니다.

```kotlin
val bannedSet = banned.toHashSet()
```

이제 `word in bannedSet`은 평균적으로 `O(1)`에 가깝게 동작합니다.

둘째, 개수를 세는 순간 최댓값도 함께 갱신합니다.

```kotlin
val count = (counts[word] ?: 0) + 1
counts[word] = count

if (count > maxCount) {
    maxCount = count
    answer = word
}
```

이렇게 하면 마지막에 `counts`를 다시 순회하지 않아도 됩니다.

시간 복잡도는 문단 길이를 `n`, 단어 수를 `w`, 금지어 수를 `b`라고 할 때 평균적으로 `O(n + w + b)`입니다. 문단에서 단어를 만들고, 금지어 집합을 만들고, 단어를 한 번씩 세기 때문입니다. 공간 복잡도는 단어 리스트, 금지어 집합, 카운트 맵 때문에 `O(w + b)`입니다.

## Phase 3. 문단을 한 번 훑으며 바로 카운팅하기

정규식과 단어 리스트를 써도 충분하지만, 단어 리스트를 따로 만들지 않고 문단을 한 글자씩 읽으며 바로 처리할 수도 있습니다.

```kotlin
fun mostCommonWord(paragraph: String, banned: Array<String>): String {
    val bannedSet = banned.toHashSet()
    val counts = HashMap<String, Int>()
    val current = StringBuilder()

    var answer = ""
    var maxCount = 0

    fun consumeWord() {
        if (current.isEmpty()) return

        val word = current.toString()
        current.setLength(0)

        if (word in bannedSet) return

        val count = (counts[word] ?: 0) + 1
        counts[word] = count

        if (count > maxCount) {
            maxCount = count
            answer = word
        }
    }

    for (ch in paragraph) {
        if (ch.isLetter()) {
            current.append(ch.lowercaseChar())
        } else {
            consumeWord()
        }
    }

    consumeWord()

    return answer
}
```

흐름은 이렇습니다.

- 영문자를 만나면 현재 단어에 추가
- 영문자가 아닌 문자를 만나면 지금까지 만든 단어를 소비
- 소비한 단어가 금지어가 아니면 개수를 증가
- 증가한 개수가 최대라면 정답을 갱신

예를 들어 `"Bob hit a ball,"`을 읽는다고 해 봅시다.

```text
B, o, b  -> current = "bob"
공백      -> "bob" 소비
h, i, t  -> current = "hit"
공백      -> "hit" 소비
a        -> current = "a"
공백      -> "a" 소비
b, a, l, l -> current = "ball"
,          -> "ball" 소비
```

마지막에 `consumeWord()`를 한 번 더 호출하는 이유가 중요합니다.

```kotlin
consumeWord()
```

문단이 알파벳으로 끝나면 마지막 단어 뒤에 문장 부호나 공백이 없을 수 있습니다. 예를 들어 `"Bob hit ball"`은 마지막 `"ball"`을 처리할 구분자가 없습니다. 루프가 끝난 뒤 한 번 더 소비해야 마지막 단어가 빠지지 않습니다.

## 왜 문장 부호를 공백처럼 보면 되나요?

문제에서 단어는 영문자로만 이루어진 덩어리입니다. 따라서 영문자가 아닌 문자는 모두 단어 사이의 경계로 볼 수 있습니다.

```text
"ball," -> "ball" + 경계
"hit."  -> "hit" + 경계
"bob!"  -> "bob" + 경계
```

정규식 풀이에서는 이 경계를 `Regex("[^a-z]+")`로 표현했고, 직접 스캔 풀이에서는 `ch.isLetter()`가 아닌 순간 `consumeWord()`를 호출했습니다.

이 관점으로 보면 쉼표, 마침표, 느낌표를 각각 따로 처리할 필요가 없습니다. "영문자인가, 아닌가"만 보면 됩니다.

## 왜 금지어는 먼저 제외하나요?

금지어는 정답 후보가 될 수 없습니다. 따라서 카운트 맵에 넣지 않는 편이 가장 단순합니다.

```kotlin
if (word in bannedSet) return
```

예제에서 `"hit"`은 세 번 등장하지만 금지어입니다.

```text
hit -> 제외
hit -> 제외
hit -> 제외
```

카운트 맵에는 아예 들어가지 않으므로, 나중에 "최대 빈도이지만 금지어라서 제외해야 한다"는 후처리가 필요 없습니다.

## 엣지 케이스

자주 확인해 볼 만한 입력은 이렇습니다.

| 입력 | 금지어 | 결과 | 이유 |
| --- | --- | --- | --- |
| `"Bob hit a ball, the hit BALL flew far after it was hit."` | `["hit"]` | `"ball"` | `"hit"` 제외 후 `"ball"`이 2회 |
| `"a."` | `[]` | `"a"` | 문장 부호 제거 후 `"a"` |
| `"a, a, a, b,b,b,c"` | `["a"]` | `"b"` | `"a"` 제외 후 `"b"`가 최다 |
| `"Bob. bob? BOB!"` | `[]` | `"bob"` | 대소문자를 모두 소문자로 통일 |
| `"one two two three three three"` | `["three"]` | `"two"` | 최다 단어 `"three"`가 금지어 |
| `"hello"` | `["world"]` | `"hello"` | 금지어가 문단에 없어도 문제 없음 |

특히 대소문자와 문장 부호가 섞인 입력을 확인해야 합니다. `"BALL"`과 `"ball"`을 다른 단어로 세거나, `"ball,"`을 별도 단어로 세면 틀립니다.

## 세 풀이를 다시 비교

| 풀이 | 시간 | 공간 | 특징 |
| --- | --- | --- | --- |
| 정규식 분리 + 배열 금지어 조회 | `O(n + w * b)` | `O(w)` | 가장 직관적이지만 금지어 조회가 매번 선형 |
| 정규식 분리 + `HashSet` 금지어 조회 | `O(n + w + b)` 평균 | `O(w + b)` | 구현이 짧고 충분히 효율적 |
| 직접 스캔 + 즉시 카운팅 | `O(n + b)` 평균 | `O(u + b)` | 단어 리스트를 만들지 않고 한 번 훑으며 처리 |

여기서 `n`은 문단 길이, `w`는 단어 수, `b`는 금지어 수, `u`는 금지어가 아닌 서로 다른 단어 수입니다.

실전에서는 Phase 2처럼 정규식으로 단어를 분리하고 `HashSet`으로 금지어를 확인하는 풀이가 가장 읽기 쉽습니다. 직접 스캔 방식은 정규식 없이 파싱 흐름을 명확히 드러내고 싶을 때 좋은 선택입니다.

## 마무리

1. **먼저 단어를 정규화해야 합니다** — 문장 부호를 제거하고 대소문자를 소문자로 통일합니다
2. **금지어는 `HashSet`으로 관리합니다** — 단어마다 빠르게 제외 여부를 확인할 수 있습니다
3. **단어 개수는 `HashMap`으로 셉니다** — 단어를 키로, 등장 횟수를 값으로 둡니다
4. **카운트하는 순간 최대 빈도를 갱신하면 마지막 순회를 줄일 수 있습니다**
5. **문장 부호는 단어 경계로 보면 됩니다** — 영문자가 아닌 문자를 만나면 현재 단어를 하나 완성하면 됩니다

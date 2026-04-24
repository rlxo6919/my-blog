---
title: "Merge Strings Alternately — 단일 루프로 `O(n + m)` 교차 병합"
date: "2026-04-24"
category: "study"
tags: ["알고리즘"]
excerpt: "두 문자열을 교대로 합치는 LeetCode 1768번, 공통 구간 분리 방식과 단일 루프 방식을 비교하며 정리합니다."
---

## 두 문자열을 교대로 합치기, 어떤 문제인가요?

LeetCode `1768`번 문제는 이렇게 주어집니다.

> 두 문자열 `word1`과 `word2`가 주어졌을 때, `word1`부터 시작하여 글자를 교대로 이어 붙인 문자열을 반환하세요. 한쪽 문자열이 더 길면, 남은 글자를 그대로 뒤에 붙입니다.

예시는 이렇습니다.

- `word1 = "abc"`, `word2 = "pqr"` → `"apbqcr"`
- `word1 = "ab"`, `word2 = "pqrs"` → `"apbqrs"`
- `word1 = "abcd"`, `word2 = "pq"` → `"apbqcd"`

제약은 간단합니다.

- `1 <= word1.length, word2.length <= 100`
- 두 문자열 모두 소문자 영문으로만 구성

문제 자체는 단순하지만, **두 문자열의 길이가 다를 때 나머지를 어떻게 처리할 것인가**가 구현의 분기점입니다. 이 글에서는 공통 구간을 분리하는 방식부터 단일 루프로 통합하는 방식까지 비교해 보겠습니다.

## Phase 1. 공통 구간과 나머지를 분리하는 접근

가장 직관적인 방법은 **두 문자열이 겹치는 구간**까지만 교대로 붙이고, 나머지는 한꺼번에 이어 붙이는 것입니다.

```kotlin
fun mergeAlternately(word1: String, word2: String): String {
    val sb = StringBuilder()
    val minLen = minOf(word1.length, word2.length)

    for (i in 0 until minLen) {
        sb.append(word1[i])
        sb.append(word2[i])
    }

    sb.append(word1.substring(minLen))
    sb.append(word2.substring(minLen))

    return sb.toString()
}
```

동작을 따라가 봅시다. `word1 = "abcd"`, `word2 = "pq"`인 경우:

- `minLen = 2`이므로 인덱스 `0, 1`까지 교대로 붙입니다 → `"apbq"`
- `word1.substring(2)` = `"cd"`, `word2.substring(2)` = `""` → `"apbqcd"`

로직이 읽기 쉽고, "공통 구간"과 "나머지"가 코드 구조에서 명확히 분리됩니다. 다만 루프 하나와 `substring` 두 번으로 구성되어, 하나의 흐름으로 합칠 여지가 있습니다.

## Phase 2. 단일 루프로 통합

공통 구간과 나머지를 나누지 않고, **더 긴 쪽의 길이만큼 루프를 돌면서 범위 안에 있는 쪽만 붙이는** 방식입니다.

```kotlin
fun mergeAlternately(word1: String, word2: String): String {
    val sb = StringBuilder()

    for (i in 0 until maxOf(word1.length, word2.length)) {
        if (i < word1.length) sb.append(word1[i])
        if (i < word2.length) sb.append(word2[i])
    }

    return sb.toString()
}
```

같은 입력 `word1 = "abcd"`, `word2 = "pq"`를 따라가 봅시다.

- `i = 0`: `word1[0]` = `'a'`, `word2[0]` = `'p'` → `"ap"`
- `i = 1`: `word1[1]` = `'b'`, `word2[1]` = `'q'` → `"apbq"`
- `i = 2`: `word1[2]` = `'c'`, `word2`는 범위 밖 → `"apbqc"`
- `i = 3`: `word1[3]` = `'d'`, `word2`는 범위 밖 → `"apbqcd"`

**루프가 하나**이고, 나머지 처리를 별도로 하지 않습니다. 범위 체크(`i < length`)가 공통 구간과 나머지 구간을 자연스럽게 통합합니다.

### 왜 `StringBuilder`를 쓰나요?

Kotlin(JVM)에서 `String`은 불변입니다. `+` 연산으로 문자열을 반복 이어 붙이면, 매번 새로운 `String` 객체가 생성되고 기존 내용을 복사합니다. 길이 `n`짜리 문자열을 한 글자씩 `n`번 이어 붙이면 복사량이 `1 + 2 + ... + n = O(n²)`이 됩니다.

`StringBuilder`는 내부 버퍼를 두고 `append`할 때 버퍼가 충분하면 복사 없이 바로 추가합니다. 전체 `append` 비용이 **`O(n + m)`** 으로 유지됩니다.

이 문제의 제약(`length <= 100`)에서는 차이가 체감되지 않지만, 문자열을 반복 조합하는 패턴에서 `StringBuilder`를 쓰는 것은 기본 습관으로 가져가는 것이 좋습니다.

## 두 풀이를 다시 비교

| 풀이 | 시간 | 공간 | 특징 |
| --- | --- | --- | --- |
| 공통 구간 분리 (`minOf`) | `O(n + m)` | `O(n + m)` | 구간이 명시적으로 나뉘어 읽기 쉬움 |
| 단일 루프 (`maxOf`) | `O(n + m)` | `O(n + m)` | 루프 하나로 통합, 분기가 단순 |

두 풀이 모두 시간·공간 복잡도는 동일합니다. `n`은 `word1.length`, `m`은 `word2.length`이고, 결과 문자열 자체가 `n + m` 길이이므로 공간을 더 줄일 수는 없습니다.

## 마무리

1. **두 문자열의 길이가 다를 때 핵심은 "나머지 처리"** — 공통 구간을 분리하든, 범위 체크로 통합하든 이 부분을 빠뜨리지 않는 것이 중요합니다
2. **단일 루프 + 범위 체크 패턴은 길이가 다른 두 시퀀스를 병합할 때 자주 쓰입니다** — 이 문제에서는 `maxOf(len1, len2)`까지 돌면서 각각 범위 안에 있는지만 확인하면 됩니다
3. **문자열 반복 조합에는 `StringBuilder`** — 불변 `String`의 `+` 연산은 매번 복사가 발생하므로, 루프 안에서 문자열을 조합할 때는 `StringBuilder`를 사용하는 습관이 필요합니다

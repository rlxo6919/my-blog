---
title: "String Compression — 읽기/쓰기 포인터로 `O(n)`/`O(1)` 제자리 압축"
date: "2026-04-27"
category: "study"
tags: ["알고리즘"]
excerpt: "연속된 같은 문자를 '문자 + 개수'로 압축하는 LeetCode 443번, 별도 버퍼 방식과 읽기/쓰기 포인터로 제자리 압축하는 방식을 비교하며 정리합니다."
---

## 문자열 압축, 어떤 문제인가요?

LeetCode `443`번 문제는 이렇게 주어집니다.

> 문자 배열 `chars`가 주어졌을 때, 연속된 같은 문자 그룹을 **'문자 + 개수'** 형식으로 압축하세요. 개수가 `1`이면 문자만 씁니다. 압축 결과를 **`chars` 배열 자체에 덮어쓰고**, 압축된 길이를 반환하세요. **상수 추가 공간만** 사용해야 합니다.

예시는 이렇습니다.

- `['a','a','b','b','c','c','c']` → 길이 `6`, `['a','2','b','2','c','3']`
- `['a']` → 길이 `1`, `['a']`
- `['a','b','b','b','b','b','b','b','b','b','b','b','b']` → 길이 `4`, `['a','b','1','2']`

제약은 다음과 같습니다.

- `1 <= chars.length <= 2000`
- `chars[i]`는 영소문자, 영대문자, 숫자, 기호

세 번째 예시에서 `'b'`가 12번 반복되면 `"12"`를 한 글자씩 `'1'`, `'2'`로 분리해서 써야 합니다. 이 글에서는 별도 버퍼를 쓰는 방식부터, 읽기/쓰기 포인터로 제자리 압축하는 방식까지 정리합니다. 시간·공간 복잡도 표기가 익숙하지 않다면 [시간 복잡도와 공간 복잡도 완전 정복](/posts/52-time-and-space-complexity)을 먼저 읽어 보시는 것을 권합니다.

## Phase 1. 별도 버퍼에 압축 — 가장 직관적인 풀이

먼저 `StringBuilder`에 압축 결과를 쓴 뒤, 원본 배열에 복사하는 방식입니다.

```kotlin
fun compress(chars: CharArray): Int {
    val sb = StringBuilder()
    var i = 0

    while (i < chars.size) {
        val ch = chars[i]
        var count = 0
        while (i < chars.size && chars[i] == ch) {
            count++
            i++
        }
        sb.append(ch)
        if (count > 1) sb.append(count)
    }

    for (j in sb.indices) {
        chars[j] = sb[j]
    }
    return sb.length
}
```

`['a','a','b','b','c','c','c']`를 따라가 봅시다.

- `ch = 'a'`, `count = 2` → `sb = "a2"`
- `ch = 'b'`, `count = 2` → `sb = "a2b2"`
- `ch = 'c'`, `count = 3` → `sb = "a2b2c3"`
- `sb`를 `chars`에 복사 → 길이 `6`

시간 `O(n)`, 공간 `O(n)` (`StringBuilder` 크기)입니다. 로직은 간단하지만, 문제가 요구하는 **상수 추가 공간** 조건을 만족하지 못합니다.

## Phase 2. 읽기/쓰기 포인터 — 제자리 압축

별도 버퍼를 없애려면, **`read`(읽기)와 `write`(쓰기) 포인터 두 개로 같은 배열 위에서 작업**하면 됩니다.

```kotlin
fun compress(chars: CharArray): Int {
    var read = 0
    var write = 0

    while (read < chars.size) {
        val ch = chars[read]
        var count = 0
        while (read < chars.size && chars[read] == ch) {
            count++
            read++
        }

        chars[write++] = ch
        if (count > 1) {
            for (digit in count.toString()) {
                chars[write++] = digit
            }
        }
    }
    return write
}
```

같은 입력 `['a','a','b','b','c','c','c']`를 따라가 봅시다.

```
초기: ['a','a','b','b','c','c','c']
       R                             W=0

그룹 'a' (count=2): read 0→2
  chars[0]='a', chars[1]='2' → write=2
  ['a','2','b','b','c','c','c']
         R=2                   W=2

그룹 'b' (count=2): read 2→4
  chars[2]='b', chars[3]='2' → write=4
  ['a','2','b','2','c','c','c']
               R=4             W=4

그룹 'c' (count=3): read 4→7
  chars[4]='c', chars[5]='3' → write=6
  ['a','2','b','2','c','3','c']
                         R=7   W=6
```

`write = 6` 반환 ✓

### `write`가 `read`를 앞지르지 않는 이유

제자리 알고리즘에서 가장 중요한 안전성 질문입니다. 같은 배열의 앞쪽에 쓰면서 뒤쪽을 읽는데, 아직 읽지 않은 데이터를 덮어쓰지 않을까요?

`k`개의 연속 같은 문자 그룹을 처리할 때:
- `read`는 `k`칸 전진합니다
- `write`는 `1 + (k의 자릿수)` 칸 전진합니다

| `k` | `read` 전진 | `write` 전진 | `write ≤ read`? |
| --- | --- | --- | --- |
| 1 | 1 | 1 | ✓ (같음) |
| 2~9 | 2~9 | 2 | ✓ |
| 10~99 | 10~99 | 3 | ✓ |
| 100~999 | 100~999 | 4 | ✓ |

**`k ≥ 1`이면 항상 `write` 전진 ≤ `read` 전진**입니다. 압축은 원본보다 짧거나 같으므로, `write`가 `read`를 앞지를 수 없습니다.

### 10 이상의 개수는 어떻게 처리하나요?

`['a','b','b','b','b','b','b','b','b','b','b','b','b']`에서 `'b'`가 12번 반복됩니다.

```
그룹 'a' (count=1): chars[0]='a' → write=1
그룹 'b' (count=12):
  chars[1]='b' → write=2
  count.toString() = "12"
  chars[2]='1', chars[3]='2' → write=4
```

`write = 4` 반환, `chars = ['a','b','1','2',...]` ✓

`count.toString()`이 `"12"`를 `'1'`, `'2'` 두 문자로 분리해 주므로, 별도의 자릿수 분해 로직 없이 자연스럽게 처리됩니다.

## 두 풀이를 다시 비교

| 풀이 | 시간 | 공간 | 특징 |
| --- | --- | --- | --- |
| `StringBuilder` 버퍼 | `O(n)` | `O(n)` | 직관적이지만 추가 버퍼 필요 |
| 읽기/쓰기 포인터 | `O(n)` | `O(1)` | 같은 배열에서 제자리 압축, 문제 조건 충족 |

## 마무리

1. **읽기/쓰기 포인터 패턴의 핵심은 "압축 결과가 원본보다 항상 짧거나 같다"는 성질** — 이 성질이 `write`가 `read`를 앞지르지 않음을 보장하고, 제자리 압축을 가능하게 합니다
2. **10 이상의 개수는 `count.toString()`으로 자릿수를 자연스럽게 분리할 수 있다** — `"12"`를 `'1'`, `'2'`로 나누는 별도 로직이 필요 없습니다
3. **개수가 `1`이면 숫자를 쓰지 않는 조건을 빠뜨리기 쉽다** — `if (count > 1)` 분기가 없으면 `['a']`가 `['a','1']`로 잘못 압축됩니다

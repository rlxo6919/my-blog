---
name: build-ebooks
description: Rebuild my-blog ebook PDFs from study posts and sync metadata in src/lib/ebooks.ts. Use when post content changes, when ebook/build_book.py BOOKS is edited (new chapter, new book, reordered parts), when src/lib/ebooks.ts EBOOKS is edited, or when the user asks to rebuild/regenerate/republish ebooks.
---

# build-ebooks

my-blog의 전자책 3권(`concurrency-10`, `query-12`, `network-7`)을 `content/posts/*.md`에서 다시 빌드하고, 웹에 노출되는 메타데이터를 실제 PDF의 페이지 수·파일 크기와 맞춥니다.

## 파이프라인 구조

네 스크립트가 순차적으로 동작합니다. 각각이 다음 단계의 입력을 생성하므로 순서가 고정입니다.

1. `ebook/build_book.py` — 마크다운 → paged.js용 HTML. `ebook/book-<id>.html`, `outline-<id>.json`, `manifest.json` 출력
2. `ebook/render_pdf.js` — HTML → raw PDF. `puppeteer-core`가 Chrome 바이너리로 렌더링. `ebook/raw-<id>.pdf` 출력
3. `ebook/finalize_pdf.py` — raw PDF에 outline(책갈피)과 메타데이터 추가. `ebook/<filename>.pdf` 출력(한글 파일명)
4. `ebook/render_covers.js` — book HTML의 `.cover` 섹션을 paged.js 없이 독립적으로 렌더링해 `public/ebook/cover-<id>.png` 생성. 웹 썸네일과 OG 이미지(`src/app/ebook/**/opengraph-image.tsx`)가 이 PNG를 읽어 씀

책의 ID ↔ 파일명 ↔ public 경로는 `ebook/build_book.py`의 `BOOKS` 배열과 `src/lib/ebooks.ts`의 `EBOOKS` 배열에서 관리됩니다. 둘의 내용이 일치해야 합니다.

## 실행 단계

### Step 1. 파이프라인 실행

```bash
cd /Users/gimgitae/IdeaProjects/my-blog
python3 ebook/build_book.py && node ebook/render_pdf.js && python3 ebook/finalize_pdf.py && node ebook/render_covers.js
```

`render_pdf.js`는 책당 10~60초가 걸릴 수 있으니 `timeout`을 넉넉히(최소 600000ms) 잡으세요. `render_covers.js`는 훨씬 빠릅니다(책당 1~2초).

`finalize_pdf.py` 출력 예:
```
백엔드-DB-쿼리최적화-12강.pdf: 221 pages, 12 chapters, 6,895,673 bytes
```

이 **페이지 수**와 **바이트 수**를 각 책별로 보관합니다. 다음 단계에서 `ebooks.ts` 갱신에 사용합니다.

`render_covers.js`는 `public/ebook/cover-<id>.png`를 직접 덮어씁니다. Step 2 이후 별도 복사가 필요 없습니다.

### Step 2. `public/ebook/`로 PDF 복사

`ebook/` 디렉토리에 생성된 최종 PDF(한글명)를 웹에서 서빙할 수 있는 영문 경로로 복사합니다.

매핑 규칙:
- 소스: `ebook/<BOOKS[i].filename>` (예: `ebook/백엔드-DB-쿼리최적화-12강.pdf`)
- 대상: `public/ebook/backend-cs-<BOOKS[i].id>.pdf` (예: `public/ebook/backend-cs-query-12.pdf`)

각 책에 대해 실행:
```bash
cp "ebook/<filename>" "public/ebook/backend-cs-<id>.pdf"
```

### Step 3. `src/lib/ebooks.ts` 메타데이터 갱신

각 책 엔트리의 `pages`와 `sizeMB`를 실측치로 갱신합니다.

- `pages` ← `finalize_pdf.py` 출력의 `N pages` 정수
- `sizeMB` ← `<bytes> / 1024 / 1024`를 **소수점 1자리**로 반올림 + `"MB"` 접미사 (예: 6,895,673 bytes → `"6.6MB"`)

`Edit` 툴로 해당 라인만 수정합니다.

### Step 4. 파일 검증 및 orphan 정리

`public/ebook/` 디렉토리 내용을 확인:
- `EBOOKS[i].pdf`가 가리키는 PDF가 모두 존재하는가?
- `EBOOKS[i].cover`가 가리키는 PNG가 모두 존재하는가? 없으면 사용자에게 커버 생성 필요를 알림(기존 커버 복사로 임시 대응 가능)
- `EBOOKS` 어느 엔트리도 참조하지 않는 orphan PDF/커버가 있으면 사용자 확인 후 `rm`으로 제거

## 현재 책 구성 (참조용)

`ebook/build_book.py`의 `BOOKS`와 동기화되어야 함. 마지막 갱신 시점의 ID와 파일명:

| ID | 파일명 | 커버 |
|----|--------|------|
| `concurrency-10` | `백엔드-동시성-트랜잭션-10강.pdf` → `backend-cs-concurrency-10.pdf` | `cover-concurrency-10.png` |
| `query-12` | `백엔드-DB-쿼리최적화-12강.pdf` → `backend-cs-query-12.pdf` | `cover-query-12.png` |
| `network-7` | `백엔드-네트워크-7강.pdf` → `backend-cs-network-7.pdf` | `cover-network-7.png` |

책이 추가/삭제되면 이 표와 `EBOOKS` / `BOOKS` 모두 업데이트.

## 의존성

- Python 3 + `markdown`, `pygments`, `pypdf`
- Node.js + `puppeteer-core` (`ebook/node_modules/`에 설치됨)
- Chrome 바이너리: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (`render_pdf.js` 상단 `CHROME` 상수에서 조정)

## 체크리스트

- [ ] 3개 스크립트 모두 exit 0로 종료
- [ ] `finalize_pdf.py` 출력의 "finalized N PDFs" 메시지 확인
- [ ] 모든 `EBOOKS[i].pdf` 경로가 `public/ebook/`에 실제 존재
- [ ] 모든 `EBOOKS[i].cover` 경로가 `public/ebook/`에 실제 존재
- [ ] `src/lib/ebooks.ts`의 `pages`/`sizeMB` 갱신 완료
- [ ] orphan 파일 없음 또는 사용자 확인 후 삭제됨
- [ ] `npm run build`가 성공하는지 확인 (선택, 시간 여유가 있을 때)

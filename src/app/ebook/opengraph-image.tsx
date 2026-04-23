import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { EBOOKS, EBOOK_TOTAL_CHAPTERS, EBOOK_TOTAL_PAGES } from "@/lib/ebooks";

export const alt = "백엔드 면접 핵심 노트 — 무료 PDF";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// 책 제목에서 "N강" 접미사 제거 (예: "동시성·트랜잭션 10강" → "동시성·트랜잭션")
function stripChapterSuffix(title: string): string {
  return title.replace(/\s*\d+강\s*$/, "").trim();
}

export default async function Image() {
  const [bold, semibold] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Pretendard-Bold.otf")),
    readFile(join(process.cwd(), "assets/fonts/Pretendard-SemiBold.otf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          backgroundImage:
            "linear-gradient(135deg, #eff6ff 0%, #eef2ff 45%, #faf5ff 100%)",
          fontFamily: "Pretendard",
          padding: "56px 64px",
        }}
      >
        {/* 배경 블롭 */}
        <div
          style={{
            position: "absolute",
            top: -180,
            right: -160,
            width: 560,
            height: 560,
            borderRadius: 9999,
            background: "rgba(147, 197, 253, 0.32)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -200,
            left: -140,
            width: 540,
            height: 540,
            borderRadius: 9999,
            background: "rgba(196, 181, 253, 0.30)",
            display: "flex",
          }}
        />

        {/* 상단: FREE 배지 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 22px",
            borderRadius: 9999,
            background: "rgba(255,255,255,0.85)",
            border: "2px solid #c7d2fe",
            color: "#4338ca",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "0.18em",
            alignSelf: "flex-start",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 9999,
              background: "#10b981",
              display: "flex",
            }}
          />
          FREE EBOOKS · BACKEND STUDY
        </div>

        {/* 메인 타이틀 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 28,
            fontSize: 92,
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: "-0.03em",
          }}
        >
          <div style={{ display: "flex", color: "#0f172a" }}>백엔드 면접</div>
          <div
            style={{
              display: "flex",
              backgroundImage:
                "linear-gradient(90deg, #2563eb 0%, #6366f1 40%, #a855f7 80%, #ec4899 100%)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            핵심 노트
          </div>
        </div>

        {/* 큰 통계 블록 */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 36,
            marginTop: 26,
            marginBottom: 28,
          }}
        >
          <MegaStat value={`${EBOOKS.length}`} label="권" accent="#2563eb" />
          <Separator />
          <MegaStat
            value={`${EBOOK_TOTAL_CHAPTERS}`}
            label="강"
            accent="#6366f1"
          />
          <Separator />
          <MegaStat
            value={`${EBOOK_TOTAL_PAGES}`}
            label="페이지"
            accent="#a855f7"
          />
          <Separator />
          <MegaStat value="무료" label="PDF" accent="#10b981" />
        </div>

        {/* 책 칩 — 데이터 구동, 책 수에 따라 자동 배치 */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
            marginTop: "auto",
          }}
        >
          {EBOOKS.map((book, i) => (
            <BookChip
              key={book.id}
              index={i + 1}
              topic={stripChapterSuffix(book.title)}
              chapters={book.chapters}
              pages={book.pages}
              accent={book.theme.ogAccent}
            />
          ))}
        </div>

        {/* 하단 워드마크 */}
        <div
          style={{
            position: "absolute",
            bottom: 34,
            right: 64,
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 22,
            fontWeight: 700,
            color: "#1e293b",
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "#0f172a",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            뚝
          </div>
          뚝딱코딩
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Pretendard", data: bold, style: "normal", weight: 700 },
        { name: "Pretendard", data: semibold, style: "normal", weight: 600 },
      ],
    }
  );
}

function MegaStat({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span
        style={{
          fontSize: 68,
          fontWeight: 700,
          color: accent,
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: 22,
          color: "#475569",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function Separator() {
  return (
    <div
      style={{
        width: 2,
        height: 46,
        background: "#e2e8f0",
        borderRadius: 2,
        display: "flex",
        alignSelf: "center",
      }}
    />
  );
}

function BookChip({
  index,
  topic,
  chapters,
  pages,
  accent,
}: {
  index: number;
  topic: string;
  chapters: number;
  pages: number;
  accent: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "14px 20px",
        borderRadius: 16,
        background: "rgba(255,255,255,0.85)",
        border: `2px solid ${accent}`,
        minWidth: 200,
        gap: 4,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.12em",
          color: accent,
        }}
      >
        <span>{String(index).padStart(2, "0")}</span>
        <span style={{ display: "flex", color: "#cbd5e1" }}>·</span>
        <span>{`${chapters}강 · ${pages}p`}</span>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 22,
          fontWeight: 700,
          color: "#0f172a",
          lineHeight: 1.15,
        }}
      >
        {topic}
      </div>
    </div>
  );
}

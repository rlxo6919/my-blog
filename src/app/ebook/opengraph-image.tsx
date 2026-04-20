import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { EBOOKS, EBOOK_TOTAL_CHAPTERS, EBOOK_TOTAL_PAGES } from "@/lib/ebooks";

export const alt = "백엔드 면접 핵심 노트 — 무료 PDF 3권";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function loadCover(relPublicPath: string) {
  const data = await readFile(join(process.cwd(), "public", relPublicPath));
  return `data:image/png;base64,${data.toString("base64")}`;
}

export default async function Image() {
  const [bold, semibold, ...covers] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Pretendard-Bold.otf")),
    readFile(join(process.cwd(), "assets/fonts/Pretendard-SemiBold.otf")),
    ...EBOOKS.map((b) => loadCover(b.cover)),
  ]);

  const [coverA, coverB, coverC] = covers;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundImage:
            "linear-gradient(135deg, #eef2ff 0%, #f5f3ff 50%, #fdf2f8 100%)",
          fontFamily: "Pretendard",
          padding: "68px 72px",
        }}
      >
        {/* accent blobs */}
        <div
          style={{
            position: "absolute",
            top: -140,
            left: -120,
            width: 460,
            height: 460,
            borderRadius: 9999,
            background: "rgba(147, 197, 253, 0.35)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -160,
            right: -120,
            width: 520,
            height: 520,
            borderRadius: 9999,
            background: "rgba(196, 181, 253, 0.35)",
            display: "flex",
          }}
        />

        {/* Left: copy */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            paddingRight: 40,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 18px",
                borderRadius: 9999,
                background: "rgba(255,255,255,0.75)",
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
              FREE EBOOKS
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                marginTop: 32,
                fontSize: 84,
                fontWeight: 700,
                lineHeight: 1.12,
                letterSpacing: "-0.03em",
                color: "#0f172a",
              }}
            >
              <div style={{ display: "flex" }}>백엔드 면접</div>
              <div
                style={{
                  display: "flex",
                  backgroundImage:
                    "linear-gradient(90deg, #2563eb 0%, #6366f1 50%, #a855f7 100%)",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                핵심 노트
              </div>
            </div>

            <div
              style={{
                display: "flex",
                marginTop: 24,
                fontSize: 26,
                fontWeight: 600,
                color: "#475569",
                lineHeight: 1.35,
              }}
            >
              동시성·트랜잭션 / DB·쿼리 최적화 / 네트워크
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              fontSize: 22,
              fontWeight: 600,
              color: "#334155",
            }}
          >
            <Stat label="권" value={`${EBOOKS.length}`} />
            <Dot />
            <Stat label="강의" value={`${EBOOK_TOTAL_CHAPTERS}`} />
            <Dot />
            <Stat label="페이지" value={`${EBOOK_TOTAL_PAGES}`} />
            <Dot />
            <Stat label="무료" value="100%" highlight />
          </div>
        </div>

        {/* Right: stacked covers */}
        <div
          style={{
            width: 520,
            display: "flex",
            position: "relative",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <img
            src={coverA}
            width={230}
            height={326}
            style={{
              position: "absolute",
              left: 10,
              top: 130,
              transform: "rotate(-8deg)",
              borderRadius: 10,
              boxShadow: "0 20px 40px rgba(15,23,42,0.25)",
            }}
          />
          <img
            src={coverC}
            width={230}
            height={326}
            style={{
              position: "absolute",
              right: 10,
              top: 130,
              transform: "rotate(8deg)",
              borderRadius: 10,
              boxShadow: "0 20px 40px rgba(15,23,42,0.25)",
            }}
          />
          <img
            src={coverB}
            width={260}
            height={368}
            style={{
              position: "absolute",
              left: 130,
              top: 100,
              borderRadius: 12,
              boxShadow: "0 28px 56px rgba(15,23,42,0.35)",
            }}
          />
        </div>

        {/* bottom wordmark */}
        <div
          style={{
            position: "absolute",
            bottom: 36,
            right: 72,
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 24,
            fontWeight: 700,
            color: "#1e293b",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "#0f172a",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
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

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: highlight ? "#059669" : "#0f172a",
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 18, color: "#64748b", fontWeight: 600 }}>{label}</span>
    </div>
  );
}

function Dot() {
  return (
    <div
      style={{
        width: 4,
        height: 4,
        borderRadius: 9999,
        background: "#cbd5e1",
        display: "flex",
      }}
    />
  );
}

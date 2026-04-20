import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { EBOOKS, getEbookById } from "@/lib/ebooks";

export const alt = "뚝딱코딩 전자책";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return EBOOKS.map((book) => ({ id: book.id }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const book = getEbookById(id);

  const [bold, semibold, coverData] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Pretendard-Bold.otf")),
    readFile(join(process.cwd(), "assets/fonts/Pretendard-SemiBold.otf")),
    book
      ? readFile(join(process.cwd(), "public", book.cover))
      : Promise.resolve<Buffer | null>(null),
  ]);

  const title = book?.title ?? "뚝딱코딩 전자책";
  const subtitle = book?.subtitle ?? "";
  const description = book?.description ?? "";
  const chapters = book?.chapters ?? 0;
  const pages = book?.pages ?? 0;
  const bg = book?.theme.ogBg ?? "linear-gradient(135deg, #eff6ff 0%, #faf5ff 100%)";
  const accent = book?.theme.ogAccent ?? "#4f46e5";
  const coverSrc = coverData
    ? `data:image/png;base64,${coverData.toString("base64")}`
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundImage: bg,
          fontFamily: "Pretendard",
          padding: "72px 80px",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -140,
            right: -80,
            width: 420,
            height: 420,
            borderRadius: 9999,
            background: "rgba(255,255,255,0.45)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -160,
            left: -100,
            width: 440,
            height: 440,
            borderRadius: 9999,
            background: "rgba(255,255,255,0.35)",
            display: "flex",
          }}
        />

        {/* Left: cover */}
        <div
          style={{
            width: 360,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {coverSrc && (
            <img
              src={coverSrc}
              width={320}
              height={453}
              style={{
                borderRadius: 14,
                boxShadow: "0 30px 60px rgba(15,23,42,0.35)",
              }}
            />
          )}
        </div>

        {/* Right: copy */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            paddingLeft: 56,
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
                background: "rgba(255,255,255,0.8)",
                border: `2px solid ${accent}`,
                color: accent,
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: "0.22em",
                alignSelf: "flex-start",
              }}
            >
              EBOOK · 무료
            </div>

            <div
              style={{
                display: "flex",
                marginTop: 28,
                fontSize: title.length > 14 ? 64 : 76,
                fontWeight: 700,
                lineHeight: 1.15,
                letterSpacing: "-0.02em",
                color: "#0f172a",
              }}
            >
              {title}
            </div>

            {subtitle && (
              <div
                style={{
                  display: "flex",
                  marginTop: 20,
                  fontSize: 26,
                  fontWeight: 600,
                  color: accent,
                  lineHeight: 1.35,
                }}
              >
                {subtitle}
              </div>
            )}

            {description && (
              <div
                style={{
                  display: "flex",
                  marginTop: 22,
                  fontSize: 20,
                  fontWeight: 600,
                  color: "#475569",
                  lineHeight: 1.45,
                  maxWidth: 620,
                }}
              >
                {description.length > 110
                  ? `${description.slice(0, 108)}…`
                  : description}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                fontSize: 22,
                fontWeight: 700,
                color: "#334155",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 30, color: "#0f172a" }}>{chapters}</span>
                <span style={{ fontSize: 18, color: "#64748b" }}>강</span>
              </div>
              <div
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 9999,
                  background: "#cbd5e1",
                  display: "flex",
                }}
              />
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 30, color: "#0f172a" }}>{pages}</span>
                <span style={{ fontSize: 18, color: "#64748b" }}>페이지</span>
              </div>
              <div
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 9999,
                  background: "#cbd5e1",
                  display: "flex",
                }}
              />
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 30, color: "#059669" }}>무료</span>
                <span style={{ fontSize: 18, color: "#64748b" }}>PDF</span>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 22,
                fontWeight: 700,
                color: "#1e293b",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 9,
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

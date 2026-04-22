import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  getAllTags,
  getPostsByTagSlug,
  getTagBySlug,
  tagToSlug,
} from "@/lib/posts";

export const alt = "뚝딱코딩 태그";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return getAllTags().map((tag) => ({ tag: tagToSlug(tag) }));
}

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag: slug } = await params;
  const tag = getTagBySlug(slug) ?? slug;
  const posts = getPostsByTagSlug(slug);

  const [bold, semibold] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Pretendard-Bold.otf")),
    readFile(join(process.cwd(), "assets/fonts/Pretendard-SemiBold.otf")),
  ]);

  const displayTag = `#${tag}`;
  const tagFontSize = displayTag.length > 18 ? 92 : displayTag.length > 12 ? 112 : 128;
  const previews = posts.slice(0, 3).map((p) => p.title);

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
            "linear-gradient(135deg, #eff6ff 0%, #eef2ff 50%, #faf5ff 100%)",
          padding: "72px 80px",
          fontFamily: "Pretendard",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -120,
            right: -80,
            width: 400,
            height: 400,
            borderRadius: 9999,
            background: "rgba(147, 197, 253, 0.35)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -140,
            left: -100,
            width: 440,
            height: 440,
            borderRadius: 9999,
            background: "rgba(196, 181, 253, 0.3)",
            display: "flex",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontSize: 26,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 22px",
              borderRadius: 9999,
              background: "#e0e7ff",
              color: "#4338ca",
              border: "2px solid #c7d2fe",
              fontWeight: 600,
            }}
          >
            <div style={{ display: "flex" }}>TAG</div>
          </div>
          <div style={{ display: "flex", color: "#64748b", fontWeight: 600 }}>
            {`${posts.length}개의 글`}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            marginTop: 32,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: tagFontSize,
              fontWeight: 700,
              color: "#0f172a",
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
            }}
          >
            {displayTag}
          </div>
          {previews.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                marginTop: 28,
                gap: 8,
                fontSize: 22,
                color: "#475569",
                fontWeight: 600,
              }}
            >
              {previews.map((t) => (
                <div
                  key={t}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 9999,
                      background: "#94a3b8",
                      display: "flex",
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      overflow: "hidden",
                      maxWidth: 960,
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {t}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 32,
            fontWeight: 700,
            color: "#1e293b",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "#0f172a",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
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

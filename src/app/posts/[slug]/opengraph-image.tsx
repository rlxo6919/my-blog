import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAllPosts, getPostBySlug } from "@/lib/posts";
import { CATEGORY_LABELS } from "@/lib/categories";

export const alt = "뚝딱코딩";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

const CATEGORY_COLORS = {
  troubleshooting: { dot: "#f59e0b", bg: "#fef3c7", text: "#b45309", border: "#fcd34d" },
  study: { dot: "#10b981", bg: "#d1fae5", text: "#047857", border: "#6ee7b7" },
} as const;

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  const [bold, semibold] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Pretendard-Bold.otf")),
    readFile(join(process.cwd(), "assets/fonts/Pretendard-SemiBold.otf")),
  ]);

  const title = post?.title ?? "뚝딱코딩";
  const category = post?.category ?? "study";
  const categoryLabel = CATEGORY_LABELS[category];
  const date = post?.date ?? "";
  const color = CATEGORY_COLORS[category];

  const titleFontSize = title.length > 50 ? 52 : title.length > 30 ? 64 : 76;

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
        {/* Decorative accent circles */}
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

        {/* Top row: category + date */}
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
              background: color.bg,
              color: color.text,
              border: `2px solid ${color.border}`,
              fontWeight: 600,
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 9999,
                background: color.dot,
                display: "flex",
              }}
            />
            {categoryLabel}
          </div>
          {date && <div style={{ color: "#64748b", fontWeight: 600 }}>{date}</div>}
        </div>

        {/* Title */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            marginTop: 40,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: titleFontSize,
              fontWeight: 700,
              color: "#0f172a",
              letterSpacing: "-0.02em",
              lineHeight: 1.22,
            }}
          >
            {title}
          </div>
        </div>

        {/* Bottom wordmark */}
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

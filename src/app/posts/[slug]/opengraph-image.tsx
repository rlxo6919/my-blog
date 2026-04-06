import { ImageResponse } from "next/og";
import { getPostBySlug, getAllPosts } from "@/lib/posts";

export const alt = "뚝딱코딩";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export default async function Image(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const post = getPostBySlug(slug);
  const title = post?.title ?? "뚝딱코딩";
  const tags = post?.tags ?? [];

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "60px 80px",
          backgroundColor: "#111827",
          color: "#f9fafb",
        }}
      >
        <div style={{ display: "flex", fontSize: 24, color: "#9ca3af" }}>
          뚝딱코딩
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 52,
            fontWeight: 700,
            lineHeight: 1.2,
            marginTop: 16,
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", gap: "8px", marginTop: 24 }}>
          {tags.map((tag) => (
            <div
              key={tag}
              style={{
                display: "flex",
                fontSize: 18,
                padding: "6px 16px",
                backgroundColor: "#374151",
                borderRadius: "8px",
                color: "#d1d5db",
              }}
            >
              #{tag}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}

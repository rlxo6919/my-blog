import type { Metadata } from "next";
import Link from "next/link";
import { getAllTags, getPostsByTag } from "@/lib/posts";
import { CATEGORY_LABELS } from "@/lib/categories";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  const tags = getAllTags();
  return tags.map((tag) => ({ tag }));
}

export async function generateMetadata(
  props: { params: Promise<{ tag: string }> }
): Promise<Metadata> {
  const { tag } = await props.params;
  const decoded = decodeURIComponent(tag);
  return {
    title: `#${decoded}`,
    description: `"${decoded}" 태그가 포함된 글 목록`,
    alternates: {
      canonical: `/tags/${encodeURIComponent(decoded)}`,
    },
    openGraph: {
      title: `#${decoded} | 뚝딱코딩`,
      description: `"${decoded}" 태그가 포함된 글 목록`,
      url: `https://ttukttak-coding.vercel.app/tags/${encodeURIComponent(decoded)}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `#${decoded} | 뚝딱코딩`,
      description: `"${decoded}" 태그가 포함된 글 목록`,
    },
  };
}

export default async function TagPage(props: PageProps<"/tags/[tag]">) {
  const { tag } = await props.params;
  const decodedTag = decodeURIComponent(tag);
  const posts = getPostsByTag(decodedTag);

  if (posts.length === 0) notFound();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">#{decodedTag}</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8">{posts.length}개의 글</p>
      <div className="space-y-1">
        {posts.map((post) => (
          <article
            key={post.slug}
            className="group -mx-4 px-4 py-5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
          >
            <Link href={`/posts/${post.slug}`} className="block">
              <h2 className="text-lg font-semibold group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {post.title}
              </h2>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${
                    post.category === "troubleshooting"
                      ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                      : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      post.category === "troubleshooting" ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                  />
                  {CATEGORY_LABELS[post.category]}
                </span>
                <time>{post.date}</time>
                <span>&middot;</span>
                <span>{post.readingTime}분 읽기</span>
              </div>
              {post.excerpt && (
                <p className="text-gray-600 dark:text-gray-400 mt-2">{post.excerpt}</p>
              )}
            </Link>
          </article>
        ))}
      </div>
      <div className="mt-8">
        <Link
          href="/tags"
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
        >
          &larr; 모든 태그 보기
        </Link>
      </div>
    </div>
  );
}

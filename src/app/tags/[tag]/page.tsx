import type { Metadata } from "next";
import Link from "next/link";
import { getAllTags, getPostsByTag } from "@/lib/posts";
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

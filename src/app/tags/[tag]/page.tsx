import Link from "next/link";
import { getAllTags, getPostsByTag } from "@/lib/posts";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  const tags = getAllTags();
  return tags.map((tag) => ({ tag }));
}

export default async function TagPage(props: PageProps<"/tags/[tag]">) {
  const { tag } = await props.params;
  const decodedTag = decodeURIComponent(tag);
  const posts = getPostsByTag(decodedTag);

  if (posts.length === 0) notFound();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">#{decodedTag}</h1>
      <p className="text-gray-500 mb-8">{posts.length}개의 글</p>
      <div className="space-y-6">
        {posts.map((post) => (
          <article key={post.slug} className="border-b border-gray-100 pb-6">
            <Link href={`/posts/${post.slug}`}>
              <h2 className="text-lg font-semibold hover:text-gray-600">
                {post.title}
              </h2>
            </Link>
            <time className="text-sm text-gray-500 mt-1 block">
              {post.date}
            </time>
            {post.excerpt && (
              <p className="text-gray-600 mt-2">{post.excerpt}</p>
            )}
          </article>
        ))}
      </div>
      <div className="mt-8">
        <Link
          href="/tags"
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          &larr; 모든 태그 보기
        </Link>
      </div>
    </div>
  );
}

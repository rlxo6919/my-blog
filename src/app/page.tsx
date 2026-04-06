import Link from "next/link";
import { getAllPosts } from "@/lib/posts";

export default function Home() {
  const posts = getAllPosts();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">최근 글</h1>
      <div className="space-y-8">
        {posts.map((post) => (
          <article key={post.slug} className="border-b border-gray-100 pb-8">
            <Link href={`/posts/${post.slug}`}>
              <h2 className="text-xl font-semibold hover:text-gray-600">
                {post.title}
              </h2>
            </Link>
            <time className="text-sm text-gray-500 mt-1 block">
              {post.date}
            </time>
            {post.excerpt && (
              <p className="text-gray-600 mt-2">{post.excerpt}</p>
            )}
            {post.tags.length > 0 && (
              <div className="flex gap-2 mt-3">
                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/tags/${tag}`}
                    className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded hover:bg-gray-200"
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

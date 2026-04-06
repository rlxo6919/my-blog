import Link from "next/link";
import {
  getAllPosts,
  getPostBySlug,
  markdownToHtml,
  extractToc,
} from "@/lib/posts";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export default async function PostPage(props: PageProps<"/posts/[slug]">) {
  const { slug } = await props.params;
  const post = getPostBySlug(slug);

  if (!post) notFound();

  const content = await markdownToHtml(post.content);
  const toc = extractToc(post.content);

  return (
    <div className="flex gap-10">
      <article className="flex-1 min-w-0">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">{post.title}</h1>
          <time className="text-sm text-gray-500 mt-2 block">{post.date}</time>
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
        </header>
        <div
          className="prose prose-gray max-w-none"
          dangerouslySetInnerHTML={{ __html: content }}
        />
        <div className="mt-10 pt-6 border-t border-gray-200">
          <Link
            href="/"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            &larr; 목록으로 돌아가기
          </Link>
        </div>
      </article>

      {toc.length > 0 && (
        <aside className="hidden lg:block w-56 shrink-0">
          <nav className="sticky top-10">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">목차</h2>
            <ul className="space-y-2 text-sm">
              {toc.map((item) => (
                <li
                  key={item.id}
                  className={item.level === 3 ? "pl-3" : ""}
                >
                  <a
                    href={`#${item.id}`}
                    className="text-gray-500 hover:text-gray-900"
                  >
                    {item.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      )}
    </div>
  );
}

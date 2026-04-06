import Link from "next/link";
import { getAllPosts, getAllTags, getPostsByTag } from "@/lib/posts";

export default function Home() {
  const posts = getAllPosts();
  const tags = getAllTags();

  return (
    <div>
      {/* 히어로 섹션 */}
      <section className="relative mb-14 py-12 -mx-6 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-950/30 dark:via-indigo-950/30 dark:to-purple-950/30 rounded-3xl" />
        <div className="absolute top-4 right-8 w-24 h-24 bg-blue-200/30 dark:bg-blue-500/10 rounded-full blur-2xl" />
        <div className="absolute bottom-4 left-12 w-32 h-32 bg-purple-200/30 dark:bg-purple-500/10 rounded-full blur-2xl" />
        <div className="relative">
          <div className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-2">
            개발 블로그
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-200 dark:to-gray-400 bg-clip-text text-transparent">
            뚝딱코딩
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-lg">
            뚝딱뚝딱 만들어가는 개발 이야기. 배우고, 만들고, 공유합니다.
          </p>
          <div className="flex gap-3 mt-6">
            <Link
              href="/tags"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors"
            >
              태그 둘러보기
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* 태그 바 */}
      {tags.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {tags.map((tag) => {
              const count = getPostsByTag(tag).length;
              return (
                <Link
                  key={tag}
                  href={`/tags/${tag}`}
                  className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-all"
                >
                  #{tag} ({count})
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* 글 목록 */}
      <section>
        <h2 className="text-lg font-semibold mb-6 text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <span className="w-1 h-5 bg-blue-500 rounded-full" />
          최근 글
        </h2>
        <div className="grid gap-4">
          {posts.map((post, i) => (
            <article
              key={post.slug}
              className="group relative p-5 rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 bg-white dark:bg-gray-900/50 hover:shadow-lg hover:shadow-gray-100/50 dark:hover:shadow-none transition-all duration-300"
            >
              {i === 0 && (
                <span className="absolute -top-2.5 left-4 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-blue-500 text-white rounded-full">
                  Latest
                </span>
              )}
              <Link href={`/posts/${post.slug}`} className="block">
                <h3 className="text-lg font-semibold group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {post.title}
                </h3>
                <div className="flex items-center gap-3 mt-2 text-sm text-gray-500 dark:text-gray-400">
                  <time className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {post.date}
                  </time>
                  <span>&middot;</span>
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {post.readingTime}분
                  </span>
                </div>
                {post.excerpt && (
                  <p className="text-gray-600 dark:text-gray-400 mt-3 line-clamp-2 text-sm leading-relaxed">
                    {post.excerpt}
                  </p>
                )}
              </Link>
              {post.tags.length > 0 && (
                <div className="flex gap-2 mt-4">
                  {post.tags.map((tag) => (
                    <Link
                      key={tag}
                      href={`/tags/${tag}`}
                      className="text-xs font-medium bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2.5 py-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      #{tag}
                    </Link>
                  ))}
                </div>
              )}
              <div className="absolute right-5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 dark:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

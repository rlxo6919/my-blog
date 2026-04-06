import Link from "next/link";
import { getAllPosts, getAllTags, getPostsByTag } from "@/lib/posts";
import PostList from "@/components/PostList";

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
        <PostList
          posts={posts.map(({ slug, title, date, category, tags, excerpt, readingTime }) => ({
            slug, title, date, category, tags, excerpt, readingTime,
          }))}
        />
      </section>
    </div>
  );
}

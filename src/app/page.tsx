import Link from "next/link";
import {
  getAllPosts,
  getAllTagsWithCount,
  getFeaturedPosts,
  getPostsByTag,
  tagToSlug,
} from "@/lib/posts";
import PostList from "@/components/PostList";
import RelatedPosts from "@/components/RelatedPosts";

const SITE_URL = "https://www.ttukttak-coding.dev";

const TOPIC_PILLARS: {
  tag: string;
  title: string;
  description: string;
  accent: string;
}[] = [
  {
    tag: "영속성 컨텍스트",
    title: "JPA 영속성 컨텍스트",
    description: "1차 캐시, 변경 감지, flush — JPA 동작의 모든 기반",
    accent:
      "from-purple-50 to-fuchsia-50 dark:from-purple-950/20 dark:to-fuchsia-950/20 border-purple-200/60 dark:border-purple-900/40",
  },
  {
    tag: "트랜잭션",
    title: "트랜잭션",
    description: "ACID, 격리 수준, @Transactional 전파까지 한 흐름으로",
    accent:
      "from-rose-50 to-pink-50 dark:from-rose-950/20 dark:to-pink-950/20 border-rose-200/60 dark:border-rose-900/40",
  },
  {
    tag: "동시성 제어",
    title: "동시성 제어",
    description: "격리 수준, MVCC, 락까지 — 읽기/쓰기 충돌을 다루는 원리",
    accent:
      "from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border-amber-200/60 dark:border-amber-900/40",
  },
  {
    tag: "쿼리 최적화",
    title: "쿼리 최적화",
    description: "실행 계획, 인덱스, 배치 조회 — 느린 쿼리를 구조로 푸는 법",
    accent:
      "from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200/60 dark:border-blue-900/40",
  },
  {
    tag: "N+1",
    title: "N+1 문제",
    description: "루프 안의 개별 쿼리 · Fetch 전략 · @BatchSize 해결 도구",
    accent:
      "from-cyan-50 to-sky-50 dark:from-cyan-950/20 dark:to-sky-950/20 border-cyan-200/60 dark:border-cyan-900/40",
  },
  {
    tag: "TCP/IP",
    title: "네트워크 기초",
    description: "OSI 계층부터 HTTP/3, TLS 핸드셰이크까지 차근차근",
    accent:
      "from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 border-emerald-200/60 dark:border-emerald-900/40",
  },
];

export default function Home() {
  const posts = getAllPosts();
  const tags = getAllTagsWithCount();
  const featured = getFeaturedPosts(3);

  const pillars = TOPIC_PILLARS.map((pillar) => {
    const tagPosts = getPostsByTag(pillar.tag);
    return {
      ...pillar,
      count: tagPosts.length,
      latest: tagPosts[0],
    };
  }).filter((p) => p.count > 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "뚝딱코딩",
    url: SITE_URL,
    inLanguage: "ko-KR",
    description: "뚝딱뚝딱 만들어가는 개발 블로그",
    blogPost: posts.slice(0, 10).map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: `${SITE_URL}/posts/${post.slug}`,
      datePublished: post.date,
      keywords: post.tags,
    })),
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* 히어로 섹션 */}
      <section className="relative mb-8 sm:mb-14 py-8 sm:py-12 -mx-4 sm:-mx-6 px-4 sm:px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-950/30 dark:via-indigo-950/30 dark:to-purple-950/30 rounded-2xl sm:rounded-3xl" />
        <div className="absolute top-4 right-8 w-24 h-24 bg-blue-200/30 dark:bg-blue-500/10 rounded-full blur-2xl" />
        <div className="absolute bottom-4 left-12 w-32 h-32 bg-purple-200/30 dark:bg-purple-500/10 rounded-full blur-2xl" />
        <div className="relative">
          <div className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-2">
            개발 블로그
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-3 sm:mb-4 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-200 dark:to-gray-400 bg-clip-text text-transparent">
            뚝딱코딩
          </h1>
          <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400 max-w-lg">
            뚝딱뚝딱 만들어가는 개발 이야기. 배우고, 만들고, 공유합니다.
          </p>
          <div className="flex gap-3 mt-5 sm:mt-6">
            <Link
              href="/tags"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors"
            >
              주제별로 보기
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* 추천 글 (featured: true인 글이 있을 때만) */}
      {featured.length > 0 && (
        <RelatedPosts
          title="추천 글"
          withTopBorder={false}
          posts={featured.map(({ slug, title, date, category, readingTime }) => ({
            slug,
            title,
            date,
            category,
            readingTime,
          }))}
        />
      )}

      {/* 주제별 탐색 */}
      {pillars.length > 0 && (
        <section className="mb-10 sm:mb-12 mt-10 sm:mt-12">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <span className="w-1 h-5 bg-blue-500 rounded-full" />
            주제별로 읽기
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {pillars.map((pillar) => (
              <Link
                key={pillar.tag}
                href={`/tags/${tagToSlug(pillar.tag)}`}
                className={`group relative p-4 sm:p-5 rounded-xl sm:rounded-2xl border bg-gradient-to-br ${pillar.accent} hover:shadow-lg hover:shadow-gray-100/50 dark:hover:shadow-none transition-all duration-300`}
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {pillar.title}
                  </h3>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {pillar.count}편
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1.5 leading-relaxed">
                  {pillar.description}
                </p>
                {pillar.latest && (
                  <p className="mt-3 text-xs text-gray-500 dark:text-gray-500 line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    최신: {pillar.latest.title}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 태그 바 */}
      {tags.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {tags.map(({ tag, count }) => {
              return (
                <Link
                  key={tag}
                  href={`/tags/${tagToSlug(tag)}`}
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

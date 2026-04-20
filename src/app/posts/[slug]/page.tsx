import type { Metadata } from "next";
import Link from "next/link";
import {
  getAllPosts,
  getPostBySlug,
  getAdjacentPosts,
  getRelatedPosts,
  markdownToHtml,
  extractToc,
  tagToSlug,
} from "@/lib/posts";
import { CATEGORY_LABELS } from "@/lib/categories";
import { notFound } from "next/navigation";

const SITE_URL = "https://www.ttukttak-coding.dev";
import CodeHighlight from "@/components/CodeHighlight";
import ScrollProgress from "@/components/ScrollProgress";
import MobileToc from "@/components/MobileToc";
import ShareButtons from "@/components/ShareButtons";
import Giscus from "@/components/Giscus";
import RelatedPosts from "@/components/RelatedPosts";
import DesktopToc from "@/components/DesktopToc";

export function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata(
  props: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await props.params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.excerpt || `${post.title} - 뚝딱코딩`,
    alternates: {
      canonical: `/posts/${slug}`,
    },
    openGraph: {
      title: post.title,
      description: post.excerpt || `${post.title} - 뚝딱코딩`,
      url: `${SITE_URL}/posts/${slug}`,
      type: "article",
      publishedTime: post.date,
      tags: post.tags,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt || `${post.title} - 뚝딱코딩`,
    },
  };
}

export default async function PostPage(props: PageProps<"/posts/[slug]">) {
  const { slug } = await props.params;
  const post = getPostBySlug(slug);

  if (!post) notFound();

  const content = await markdownToHtml(post.content);
  const toc = extractToc(post.content);
  const { prev, next } = getAdjacentPosts(slug);
  const related = getRelatedPosts(slug, 3);

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    dateModified: post.date,
    url: `${SITE_URL}/posts/${slug}`,
    mainEntityOfPage: `${SITE_URL}/posts/${slug}`,
    image: `${SITE_URL}/posts/${slug}/opengraph-image`,
    inLanguage: "ko-KR",
    author: {
      "@type": "Person",
      name: "뚝딱코딩",
      url: `${SITE_URL}/about`,
    },
    publisher: {
      "@type": "Organization",
      name: "뚝딱코딩",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/icon.png`,
      },
    },
    keywords: post.tags,
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "홈",
        item: SITE_URL,
      },
      ...(post.tags[0]
        ? [
            {
              "@type": "ListItem",
              position: 2,
              name: `#${post.tags[0]}`,
              item: `${SITE_URL}/tags/${tagToSlug(post.tags[0])}`,
            },
          ]
        : []),
      {
        "@type": "ListItem",
        position: post.tags[0] ? 3 : 2,
        name: post.title,
        item: `${SITE_URL}/posts/${slug}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <ScrollProgress />
      <div className="flex gap-10">
        <article className="flex-1 min-w-0">
          <header className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold">{post.title}</h1>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2 text-sm text-gray-500 dark:text-gray-400">
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
            {post.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-3">
                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/tags/${tagToSlug(tag)}`}
                    className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2.5 py-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            )}
          </header>

          <MobileToc toc={toc} />

          <div
            className="prose prose-gray dark:prose-invert max-w-none prose-sm sm:prose-base"
            dangerouslySetInnerHTML={{ __html: content }}
          />
          <CodeHighlight />

          {/* 공유 + 목록 */}
          <div className="mt-8 sm:mt-10 pt-5 sm:pt-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <Link
              href="/"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              &larr; 목록으로
            </Link>
            <ShareButtons title={post.title} />
          </div>

          {/* 이전/다음 글 */}
          {(prev || next) && (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {prev ? (
                <Link
                  href={`/posts/${prev.slug}`}
                  className="group p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 bg-white dark:bg-gray-900/50 hover:shadow-lg hover:shadow-gray-100/50 dark:hover:shadow-none transition-all duration-300"
                >
                  <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 mb-2">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    이전 글
                  </span>
                  <p className="text-sm font-semibold group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                    {prev.title}
                  </p>
                </Link>
              ) : (
                <div />
              )}
              {next ? (
                <Link
                  href={`/posts/${next.slug}`}
                  className="group p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 bg-white dark:bg-gray-900/50 hover:shadow-lg hover:shadow-gray-100/50 dark:hover:shadow-none transition-all duration-300 text-right"
                >
                  <span className="flex items-center justify-end gap-1 text-xs text-gray-400 dark:text-gray-500 mb-2">
                    다음 글
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                  <p className="text-sm font-semibold group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                    {next.title}
                  </p>
                </Link>
              ) : (
                <div />
              )}
            </div>
          )}

          {/* 관련 글 */}
          <RelatedPosts
            posts={related.map(({ slug, title, date, category, readingTime }) => ({
              slug,
              title,
              date,
              category,
              readingTime,
            }))}
          />

          {/* 댓글 */}
          <Giscus />
        </article>

        {/* 사이드 목차 (데스크탑, 스크롤스파이) */}
        <DesktopToc toc={toc} />
      </div>
    </>
  );
}

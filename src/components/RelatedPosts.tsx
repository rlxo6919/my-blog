import Link from "next/link";
import type { Category } from "@/lib/categories";
import { CATEGORY_LABELS } from "@/lib/categories";

interface RelatedPost {
  slug: string;
  title: string;
  date: string;
  category: Category;
  readingTime: number;
  excerpt?: string;
  matchedTags?: string[];
}

const CATEGORY_STYLES: Record<Category, { badge: string; dot: string }> = {
  troubleshooting: {
    badge:
      "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    dot: "bg-amber-500",
  },
  study: {
    badge:
      "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
    dot: "bg-emerald-500",
  },
};

export default function RelatedPosts({
  posts,
  title = "관련 글",
  withTopBorder = true,
}: {
  posts: RelatedPost[];
  title?: string;
  withTopBorder?: boolean;
}) {
  if (posts.length === 0) return null;

  return (
    <section
      className={
        withTopBorder
          ? "mt-10 sm:mt-12 pt-6 sm:pt-8 border-t border-gray-200 dark:border-gray-800"
          : "mt-6 sm:mt-8"
      }
    >
      <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <span className="w-1 h-5 bg-blue-500 rounded-full" />
        {title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => {
          const style = CATEGORY_STYLES[post.category];
          return (
            <Link
              key={post.slug}
              href={`/posts/${post.slug}`}
              className="group p-4 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-blue-200 dark:hover:border-blue-900 bg-white dark:bg-gray-900/50 hover:shadow-lg hover:shadow-gray-100/50 dark:hover:shadow-none transition-all duration-300 flex flex-col"
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${style.badge}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                  {CATEGORY_LABELS[post.category]}
                </span>
              </div>
              <h3 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {post.title}
              </h3>
              {post.excerpt && (
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-2">
                  {post.excerpt}
                </p>
              )}
              {post.matchedTags && post.matchedTags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {post.matchedTags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-auto pt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <time>{post.date}</time>
                <span>&middot;</span>
                <span>{post.readingTime}분</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

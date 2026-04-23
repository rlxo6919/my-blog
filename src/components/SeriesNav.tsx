import Link from "next/link";
import { tagToSlug } from "@/lib/tags";

interface SeriesPost {
  slug: string;
  title: string;
}

interface Props {
  tag: string;
  posts: SeriesPost[];
  currentSlug: string;
}

export default function SeriesNav({ tag, posts, currentSlug }: Props) {
  const position = posts.findIndex((p) => p.slug === currentSlug);
  if (position === -1) return null;

  // 4편 이하는 펼친 상태로 시작, 그 이상은 접힌 상태
  const expandedByDefault = posts.length <= 4;

  return (
    <section className="mb-5 sm:mb-7">
      <details
        className="group rounded-xl sm:rounded-2xl border border-blue-200/60 dark:border-blue-900/40 bg-gradient-to-br from-blue-50/70 to-indigo-50/70 dark:from-blue-950/20 dark:to-indigo-950/20 overflow-hidden"
        {...(expandedByDefault ? { open: true } : {})}
      >
        <summary className="list-none cursor-pointer px-4 sm:px-5 py-3 sm:py-3.5 flex items-center justify-between gap-3 hover:bg-blue-100/40 dark:hover:bg-blue-950/30 transition-colors">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.14em] uppercase text-blue-700 dark:text-blue-300">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              시리즈
            </span>
            <Link
              href={`/tags/${tagToSlug(tag)}`}
              className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate"
            >
              #{tag}
            </Link>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">
              · {position + 1}/{posts.length}편
            </span>
          </div>
          <span className="text-xs font-medium text-blue-600 dark:text-blue-400 shrink-0 flex items-center gap-1">
            <span className="group-open:hidden">전체 보기</span>
            <span className="hidden group-open:inline">접기</span>
            <svg
              className="w-3.5 h-3.5 transition-transform group-open:rotate-180"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </summary>
        <ol className="px-4 sm:px-5 pb-3 sm:pb-4 pt-1 border-t border-blue-200/50 dark:border-blue-900/30 space-y-0.5">
          {posts.map((post, i) => {
            const isCurrent = post.slug === currentSlug;
            return (
              <li key={post.slug}>
                {isCurrent ? (
                  <div className="flex items-center gap-3 py-2 text-sm font-semibold text-blue-700 dark:text-blue-300">
                    <span className="w-6 shrink-0 text-xs font-mono text-blue-500 dark:text-blue-400 text-right">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 min-w-0 truncate">{post.title}</span>
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500 text-white">
                      읽는 중
                    </span>
                  </div>
                ) : (
                  <Link
                    href={`/posts/${post.slug}`}
                    className="group/item flex items-center gap-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    <span className="w-6 shrink-0 text-xs font-mono text-gray-400 dark:text-gray-500 text-right group-hover/item:text-blue-500 dark:group-hover/item:text-blue-400 transition-colors">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 min-w-0 truncate">{post.title}</span>
                    <svg
                      className="w-3.5 h-3.5 shrink-0 text-gray-300 dark:text-gray-700 group-hover/item:text-blue-500 dark:group-hover/item:text-blue-400 group-hover/item:translate-x-0.5 transition-all"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </details>
    </section>
  );
}

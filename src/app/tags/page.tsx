import Link from "next/link";
import { getAllTags, getPostsByTag } from "@/lib/posts";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "태그",
  description: "뚝딱코딩의 모든 태그 목록",
  alternates: {
    canonical: "/tags",
  },
  openGraph: {
    title: "태그 | 뚝딱코딩",
    description: "뚝딱코딩의 모든 태그 목록",
    url: "https://www.ttukttak-coding.dev/tags",
    type: "website",
    images: [{ url: "/opengraph-image.webp", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "태그 | 뚝딱코딩",
    description: "뚝딱코딩의 모든 태그 목록",
    images: ["/opengraph-image.webp"],
  },
};

const TAG_COLORS = [
  "from-blue-500 to-cyan-500",
  "from-purple-500 to-pink-500",
  "from-orange-500 to-red-500",
  "from-green-500 to-emerald-500",
  "from-indigo-500 to-violet-500",
  "from-amber-500 to-yellow-500",
];

export default function TagsPage() {
  const tags = getAllTags();

  return (
    <div>
      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-2">태그</h1>
        <p className="text-gray-500 dark:text-gray-400">주제별로 글을 찾아보세요</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {tags.map((tag, i) => {
          const count = getPostsByTag(tag).length;
          const gradient = TAG_COLORS[i % TAG_COLORS.length];
          return (
            <Link
              key={tag}
              href={`/tags/${tag}`}
              className="group relative p-5 rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-transparent bg-white dark:bg-gray-900/50 hover:shadow-lg transition-all duration-300 overflow-hidden"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-5 dark:group-hover:opacity-10 transition-opacity`} />
              <div className="relative">
                <span className="text-lg font-semibold text-gray-900 dark:text-gray-100 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:bg-clip-text group-hover:${gradient}">
                  #{tag}
                </span>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {count}개의 글
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

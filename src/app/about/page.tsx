import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "소개",
  description: "뚝딱코딩 블로그와 운영자를 소개합니다.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "소개 | 뚝딱코딩",
    description: "뚝딱코딩 블로그와 운영자를 소개합니다.",
    url: "https://www.ttukttak-coding.dev/about",
    type: "profile",
    images: [{ url: "/opengraph-image.webp", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "소개 | 뚝딱코딩",
    description: "뚝딱코딩 블로그와 운영자를 소개합니다.",
    images: ["/opengraph-image.webp"],
  },
};

export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto">
      {/* 프로필 */}
      <section className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-12">
        <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 flex items-center justify-center shrink-0">
          <Image src="/icon.png" alt="뚝딱코딩" width={48} height={48} />
        </div>
        <div className="text-center sm:text-left">
          <h1 className="text-3xl font-bold mb-2">뚝딱코딩</h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            뚝딱뚝딱 만들어가는 개발 블로그
          </p>
        </div>
      </section>

      {/* 소개 */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-blue-500 rounded-full" />
          블로그 소개
        </h2>
        <div className="space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
          <p>
            안녕하세요! <strong>뚝딱코딩</strong>에 오신 것을 환영합니다.
          </p>
          <p>
            이 블로그는 개발하면서 배우고 경험한 것들을 기록하고 공유하는 공간입니다.
            웹 개발, 프로그래밍, 그리고 개발자로서의 성장 과정을 담고 있습니다.
          </p>
          <p>
            직접 부딪히며 배운 내용을 정리해서, 같은 고민을 하고 있는 분들에게
            조금이라도 도움이 되었으면 좋겠습니다.
          </p>
        </div>
      </section>

      {/* 기술 스택 */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-green-500 rounded-full" />
          이 블로그의 기술 스택
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {["Next.js", "React", "TypeScript", "Tailwind CSS", "Markdown", "Vercel"].map(
            (tech) => (
              <div
                key={tech}
                className="px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 text-sm font-medium text-gray-700 dark:text-gray-300 text-center"
              >
                {tech}
              </div>
            )
          )}
        </div>
      </section>

      {/* 연락처 */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-purple-500 rounded-full" />
          연락처
        </h2>
        <div className="space-y-3">
          <a
            href="https://github.com/rlxo6919"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 hover:shadow-md transition-all group"
          >
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              GitHub
            </span>
            <svg className="w-4 h-4 text-gray-300 dark:text-gray-600 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </section>

      <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
        <Link
          href="/"
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
        >
          &larr; 홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}

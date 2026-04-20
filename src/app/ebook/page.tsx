import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

const SITE_URL = "https://www.ttukttak-coding.dev";

export const metadata: Metadata = {
  title: "전자책 — 백엔드 면접 시리즈",
  description:
    "동시성·트랜잭션, DB·쿼리 최적화, 네트워크 — 주제별 3권을 무료 PDF로 받으실 수 있습니다.",
  alternates: { canonical: "/ebook" },
  openGraph: {
    title: "백엔드 면접 시리즈 — 무료 PDF",
    description:
      "동시성·트랜잭션, DB·쿼리 최적화, 네트워크 — 주제별 3권을 무료 PDF로 받으실 수 있습니다.",
    url: `${SITE_URL}/ebook`,
    type: "article",
    images: [{ url: "/ebook/cover-concurrency-10.png", width: 1050, height: 1488 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "백엔드 면접 시리즈 — 무료 PDF",
    description: "동시성·트랜잭션, DB·쿼리 최적화, 네트워크 — 주제별 3권 무료.",
    images: ["/ebook/cover-concurrency-10.png"],
  },
};

type Book = {
  id: string;
  title: string;
  subtitle: string;
  cover: string;
  pdf: string;
  downloadName: string;
  pages: number;
  chapters: number;
  badge?: string;
  badgeColor?: string;
  description: string;
  toc: { part: string; chapters: string[] }[];
};

const BOOKS: Book[] = [
  {
    id: "concurrency-10",
    title: "동시성·트랜잭션 10강",
    subtitle: "ACID · 격리 수준 · MVCC · 락 · 멱등성",
    cover: "/ebook/cover-concurrency-10.png",
    pdf: "/ebook/backend-cs-concurrency-10.pdf",
    downloadName: "백엔드-동시성-트랜잭션-10강.pdf",
    pages: 175,
    chapters: 10,
    badge: "주제별",
    badgeColor:
      "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
    description:
      "트랜잭션과 동시성 제어를 한 권에 모은 학습서입니다. 락 경합·팬텀 리드·중복 결제 같은 실무 사고의 원인과 도구를 정리합니다.",
    toc: [
      {
        part: "1부. 트랜잭션 기초",
        chapters: ["ACID", "격리 수준", "Dirty/Phantom Read"],
      },
      {
        part: "2부. 동시성 제어 메커니즘",
        chapters: ["MVCC", "락 기본", "2PL"],
      },
      {
        part: "3부. 락과 멱등성 실무",
        chapters: ["FOR UPDATE", "낙관 vs 비관", "분산 락", "멱등성"],
      },
    ],
  },
  {
    id: "query-9",
    title: "DB·쿼리 최적화 9강",
    subtitle: "정규화 · 인덱스 · 실행 계획 · 캐시 · 페이지네이션",
    cover: "/ebook/cover-query-9.png",
    pdf: "/ebook/backend-cs-query-9.pdf",
    downloadName: "백엔드-DB-쿼리최적화-9강.pdf",
    pages: 172,
    chapters: 9,
    badge: "주제별",
    badgeColor:
      "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
    description:
      "조회를 느리게 만드는 원인과 구조적 해결책을 모았습니다. 쿼리 한 줄 튜닝이 아니라 같은 패턴이 반복될 때 적용 가능한 사고 틀을 만드는 데 목표가 있습니다.",
    toc: [
      {
        part: "1부. 데이터베이스 설계 기초",
        chapters: ["정규화"],
      },
      {
        part: "2부. 인덱스와 실행 계획",
        chapters: ["인덱스 튜닝", "인덱스가 안 타는 이유", "EXPLAIN"],
      },
      {
        part: "3부. 조회 성능",
        chapters: [
          "커넥션 풀",
          "N+1",
          "캐시 전략",
          "캐시 스탬피드",
          "페이지네이션",
        ],
      },
    ],
  },
  {
    id: "network-7",
    title: "네트워크 7강",
    subtitle: "OSI · TCP/UDP · HTTP · TLS · DNS",
    cover: "/ebook/cover-network-7.png",
    pdf: "/ebook/backend-cs-network-7.pdf",
    downloadName: "백엔드-네트워크-7강.pdf",
    pages: 133,
    chapters: 7,
    badge: "주제별",
    badgeColor:
      "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
    description:
      "백엔드 개발자가 알아야 할 네트워크 기초 7개 주제. OSI에서 시작해 TCP·HTTP·TLS·DNS까지 요청 한 번이 어떻게 흘러가는지 그릴 수 있게 만드는 게 목표입니다.",
    toc: [
      {
        part: "1부. 네트워크 기초 — OSI에서 TCP까지",
        chapters: ["OSI / TCP/IP", "IPv4 vs IPv6", "TCP vs UDP", "TCP 4-way"],
      },
      {
        part: "2부. HTTP와 보안",
        chapters: ["HTTP/1·2·3", "HTTPS · TLS", "DNS"],
      },
    ],
  },
];

function fileSizeMB(pages: number): string {
  const approxMB = Math.round((pages / 523) * 12 * 10) / 10;
  return `${approxMB}MB`;
}

export default function EbookPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-10 sm:mb-12">
        <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 tracking-wider mb-2">
          FREE EBOOKS
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold mb-3 leading-tight">
          백엔드 면접 시리즈
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          주제별 3권. 모두 무료 PDF — 계정 가입·결제 없이 바로 받으실 수 있습니다.
        </p>
      </header>

      <div className="space-y-6">
        {BOOKS.map((book) => (
          <article
            key={book.id}
            className="grid sm:grid-cols-[160px_1fr] gap-5 sm:gap-7 p-5 sm:p-6 rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md transition-all bg-white dark:bg-gray-900/40"
          >
            <div className="mx-auto sm:mx-0">
              <Image
                src={book.cover}
                alt={`${book.title} 표지`}
                width={160}
                height={227}
                className="rounded-md shadow-lg ring-1 ring-gray-200 dark:ring-gray-800"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {book.badge && (
                  <span
                    className={`text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-full ${book.badgeColor}`}
                  >
                    {book.badge}
                  </span>
                )}
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {book.chapters}강 · {book.pages}p · A5 · {fileSizeMB(book.pages)}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold mb-1 leading-tight">
                {book.title}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {book.subtitle}
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
                {book.description}
              </p>
              <details className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                <summary className="cursor-pointer font-medium hover:text-gray-900 dark:hover:text-gray-100 select-none">
                  목차 보기
                </summary>
                <div className="mt-3 space-y-3 pl-1">
                  {book.toc.map((part) => (
                    <div key={part.part}>
                      <p className="font-semibold text-gray-700 dark:text-gray-300 text-xs mb-1">
                        {part.part}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                        {part.chapters.join(" · ")}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
              <a
                href={book.pdf}
                download={book.downloadName}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
                  />
                </svg>
                PDF 다운로드
              </a>
            </div>
          </article>
        ))}
      </div>

      <section className="mt-12 p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
        <h2 className="text-base font-semibold mb-3">읽고 좋으셨다면</h2>
        <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <li>· 블로그를 북마크해 주세요. 새 글이 꾸준히 올라갑니다.</li>
          <li>
            · 이상한 부분이나 오타를 발견하시면 <Link href="/about" className="text-blue-600 dark:text-blue-400 hover:underline">소개 페이지</Link>의 GitHub로 알려 주세요.
          </li>
          <li>· 도움이 되었다면 동료에게 이 페이지 링크를 공유해 주세요.</li>
        </ul>
      </section>

      <div className="pt-6 mt-8 border-t border-gray-200 dark:border-gray-700">
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

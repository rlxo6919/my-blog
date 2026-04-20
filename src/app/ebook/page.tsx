import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

const SITE_URL = "https://www.ttukttak-coding.dev";

export const metadata: Metadata = {
  title: "전자책 — 백엔드 면접 핵심 노트",
  description:
    "동시성·트랜잭션, DB·쿼리 최적화, 네트워크 — 주제별 3권을 무료 PDF로 받으실 수 있습니다.",
  alternates: { canonical: "/ebook" },
  openGraph: {
    title: "백엔드 면접 핵심 노트 — 무료 PDF",
    description:
      "동시성·트랜잭션, DB·쿼리 최적화, 네트워크 — 주제별 3권을 무료 PDF로 받으실 수 있습니다.",
    url: `${SITE_URL}/ebook`,
    type: "article",
    images: [{ url: "/ebook/cover-concurrency-10.png", width: 1050, height: 1488 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "백엔드 면접 핵심 노트 — 무료 PDF",
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
  sizeMB: string;
  theme: {
    accent: string;
    coverGlow: string;
    badgeBg: string;
    badgeText: string;
    chipBg: string;
    chipText: string;
    button: string;
  };
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
    sizeMB: "5.4MB",
    theme: {
      accent: "amber",
      coverGlow: "from-amber-300/40 to-orange-500/40",
      badgeBg: "bg-amber-100/80 dark:bg-amber-900/40 backdrop-blur",
      badgeText: "text-amber-700 dark:text-amber-300",
      chipBg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200/60 dark:border-amber-800/40",
      chipText: "text-amber-800 dark:text-amber-200",
      button:
        "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-amber-500/30",
    },
    description:
      "트랜잭션과 동시성 제어를 한 권에 모았습니다. 락 경합·팬텀 리드·중복 결제 같은 실무 사고의 원인과 도구를 정리합니다.",
    toc: [
      { part: "트랜잭션 기초", chapters: ["ACID", "격리 수준", "Dirty / Phantom Read"] },
      { part: "동시성 제어 메커니즘", chapters: ["MVCC", "락 기본", "2PL"] },
      { part: "락과 멱등성 실무", chapters: ["FOR UPDATE", "낙관 vs 비관", "분산 락", "멱등성"] },
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
    sizeMB: "5.6MB",
    theme: {
      accent: "blue",
      coverGlow: "from-blue-400/40 to-indigo-500/40",
      badgeBg: "bg-blue-100/80 dark:bg-blue-900/40 backdrop-blur",
      badgeText: "text-blue-700 dark:text-blue-300",
      chipBg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200/60 dark:border-blue-800/40",
      chipText: "text-blue-800 dark:text-blue-200",
      button:
        "bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 shadow-blue-500/30",
    },
    description:
      "조회를 느리게 만드는 원인과 구조적 해결책. 쿼리 한 줄 튜닝이 아니라 패턴이 반복될 때 적용 가능한 사고 틀을 만듭니다.",
    toc: [
      { part: "데이터베이스 설계 기초", chapters: ["정규화"] },
      { part: "인덱스와 실행 계획", chapters: ["인덱스 튜닝", "인덱스가 안 타는 이유", "EXPLAIN"] },
      {
        part: "조회 성능",
        chapters: ["커넥션 풀", "N+1", "캐시 전략", "캐시 스탬피드", "페이지네이션"],
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
    sizeMB: "4.7MB",
    theme: {
      accent: "emerald",
      coverGlow: "from-emerald-300/40 to-teal-500/40",
      badgeBg: "bg-emerald-100/80 dark:bg-emerald-900/40 backdrop-blur",
      badgeText: "text-emerald-700 dark:text-emerald-300",
      chipBg:
        "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-800/40",
      chipText: "text-emerald-800 dark:text-emerald-200",
      button:
        "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-emerald-500/30",
    },
    description:
      "백엔드 개발자가 알아야 할 네트워크 기초. OSI에서 시작해 TCP·HTTP·TLS·DNS까지, 요청 한 번이 흘러가는 길을 그릴 수 있게 만드는 게 목표입니다.",
    toc: [
      {
        part: "네트워크 기초",
        chapters: ["OSI / TCP/IP", "IPv4 vs IPv6", "TCP vs UDP", "TCP 4-way"],
      },
      { part: "HTTP와 보안", chapters: ["HTTP/1·2·3", "HTTPS · TLS", "DNS"] },
    ],
  },
];

const TOTAL_CHAPTERS = BOOKS.reduce((s, b) => s + b.chapters, 0);
const TOTAL_PAGES = BOOKS.reduce((s, b) => s + b.pages, 0);

export default function EbookPage() {
  return (
    <div className="relative overflow-x-clip">
      {/* 백그라운드 블롭 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 overflow-hidden h-[600px]"
      >
        <div className="absolute -top-32 -left-20 w-[400px] h-[400px] bg-blue-300/20 dark:bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute -top-40 right-0 w-[450px] h-[450px] bg-purple-300/20 dark:bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute top-40 left-1/3 w-[350px] h-[350px] bg-amber-300/15 dark:bg-amber-500/10 rounded-full blur-3xl" />
      </div>

      {/* HERO */}
      <section className="relative pt-4 pb-12 sm:pb-24 px-0 sm:px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full bg-white/70 dark:bg-gray-900/70 backdrop-blur border border-gray-200 dark:border-gray-800 text-xs font-semibold tracking-widest text-gray-600 dark:text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            FREE EBOOKS
          </div>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black mb-5 leading-[1.15] tracking-tight">
            <span className="bg-gradient-to-br from-gray-900 via-gray-700 to-gray-500 dark:from-white dark:via-gray-200 dark:to-gray-400 bg-clip-text text-transparent">
              백엔드 면접
            </span>
            <br />
            <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-500 bg-clip-text text-transparent">
              핵심 노트
            </span>
          </h1>
          <p className="text-sm sm:text-lg text-gray-600 dark:text-gray-400 max-w-xl mx-auto mb-8 leading-relaxed">
            동시성·트랜잭션 / DB·쿼리 최적화 / 네트워크 —<br className="hidden sm:inline" />
            주제별 3권을 무료 PDF로 받으세요.
          </p>

          {/* 통계 바 */}
          <div className="inline-flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-8 gap-y-3 px-4 sm:px-6 py-3 sm:py-4 rounded-2xl bg-white/60 dark:bg-gray-900/60 backdrop-blur border border-gray-200 dark:border-gray-800 mb-12">
            <Stat value={`${BOOKS.length}`} label="권" />
            <Divider />
            <Stat value={`${TOTAL_CHAPTERS}`} label="강의" />
            <Divider />
            <Stat value={`${TOTAL_PAGES}`} label="페이지" />
            <Divider />
            <Stat value="100%" label="무료" highlight />
          </div>

          {/* 책 표지 스택 비주얼 */}
          <div className="relative h-[180px] sm:h-[320px] mx-auto max-w-md mb-2 overflow-visible">
            {BOOKS.map((book, i) => {
              const positions = [
                "-translate-x-[90%] sm:-translate-x-[110%] -rotate-[8deg] sm:-rotate-[10deg] z-10",
                "-translate-x-1/2 scale-105 sm:scale-110 z-30",
                "-translate-x-[10%] sm:translate-x-[10%] rotate-[8deg] sm:rotate-[10deg] z-20",
              ];
              return (
                <a
                  key={book.id}
                  href={`#${book.id}`}
                  className={`group absolute top-0 left-1/2 ${positions[i]} transition-all duration-500 ease-out hover:z-40 hover:-translate-y-6 hover:scale-[1.28] hover:rotate-0`}
                  aria-label={`${book.title}로 이동`}
                >
                  <div className="relative">
                    <div
                      className={`absolute -inset-2 sm:-inset-3 bg-gradient-to-br ${book.theme.coverGlow} rounded-2xl blur-2xl opacity-70 group-hover:opacity-100 group-hover:-inset-5 transition-all duration-500`}
                    />
                    <Image
                      src={book.cover}
                      alt={`${book.title} 표지`}
                      width={170}
                      height={241}
                      className="relative rounded-lg shadow-2xl ring-1 ring-black/10 group-hover:ring-white/30 group-hover:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.35)] transition-all duration-500 w-[100px] sm:w-[170px] h-auto"
                      priority={i === 1}
                    />
                  </div>
                </a>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-500">표지를 클릭하면 해당 책으로 이동합니다</p>
        </div>
      </section>

      {/* BOOKS */}
      <section className="space-y-12 sm:space-y-16">
        {BOOKS.map((book, i) => (
          <BookCard key={book.id} book={book} reversed={i % 2 === 1} />
        ))}
      </section>

      {/* FOOTER NOTE */}
      <section className="mt-14 sm:mt-20 mb-12">
        <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl p-5 sm:p-10 bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-950 border border-gray-200 dark:border-gray-800">
          <div className="relative">
            <h2 className="text-xl sm:text-2xl font-bold mb-4">읽고 좋으셨다면</h2>
            <ul className="space-y-3 text-gray-700 dark:text-gray-300">
              <li className="flex items-start gap-3">
                <span className="mt-1 w-5 h-5 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 inline-flex items-center justify-center text-xs">★</span>
                <span>블로그를 북마크해 주세요. 새 글이 꾸준히 올라갑니다.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 w-5 h-5 shrink-0 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 inline-flex items-center justify-center text-xs">✎</span>
                <span>
                  오타나 잘못된 내용을 발견하시면{" "}
                  <Link href="/about" className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300">
                    소개 페이지
                  </Link>
                  의 GitHub로 알려 주세요.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 w-5 h-5 shrink-0 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 inline-flex items-center justify-center text-xs">↗</span>
                <span>도움이 되었다면 동료에게 이 페이지 링크를 공유해 주세요.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
        <Link
          href="/"
          className="inline-flex items-center gap-2 mt-6 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
        >
          <span>←</span> 홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  highlight,
}: {
  value: string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1">
      <span
        className={`text-xl sm:text-2xl font-bold ${
          highlight
            ? "bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent"
            : "text-gray-900 dark:text-white"
        }`}
      >
        {value}
      </span>
      <span className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</span>
    </div>
  );
}

function Divider() {
  return <span className="hidden sm:inline w-px h-5 bg-gray-300 dark:bg-gray-700" />;
}

function BookCard({ book, reversed }: { book: Book; reversed: boolean }) {
  return (
    <article
      id={book.id}
      className="group relative scroll-mt-20"
    >
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/40 backdrop-blur-sm shadow-sm hover:shadow-xl transition-shadow duration-500">
        {/* 컬러 글로우 */}
        <div
          aria-hidden
          className={`absolute -top-20 ${
            reversed ? "-left-20" : "-right-20"
          } w-72 h-72 bg-gradient-to-br ${book.theme.coverGlow} rounded-full blur-3xl opacity-60`}
        />

        <div
          className={`relative grid sm:grid-cols-12 gap-5 sm:gap-10 p-4 sm:p-10`}
        >
          {/* 표지 */}
          <div
            className={`sm:col-span-4 flex justify-center ${
              reversed ? "sm:order-2" : ""
            }`}
          >
            <div className="relative group/cover">
              <div
                className={`absolute -inset-4 bg-gradient-to-br ${book.theme.coverGlow} rounded-2xl blur-2xl opacity-50 group-hover/cover:opacity-80 transition-opacity`}
              />
              <Image
                src={book.cover}
                alt={`${book.title} 표지`}
                width={220}
                height={312}
                className="relative rounded-lg shadow-2xl ring-1 ring-black/10 transform group-hover/cover:-translate-y-1 transition-transform duration-300 w-[160px] sm:w-[220px] h-auto"
              />
            </div>
          </div>

          {/* 본문 */}
          <div className={`sm:col-span-8 flex flex-col ${reversed ? "sm:order-1" : ""}`}>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span
                className={`text-[10px] font-bold tracking-[0.2em] px-2.5 py-1 rounded-full ${book.theme.badgeBg} ${book.theme.badgeText}`}
              >
                EBOOK
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                {book.chapters}강 · {book.pages}p · A5 · {book.sizeMB}
              </span>
            </div>
            <h2 className="text-xl sm:text-3xl font-black leading-tight mb-2 tracking-tight">
              {book.title}
            </h2>
            <p className={`text-sm sm:text-base font-medium mb-3 sm:mb-4 ${book.theme.chipText}`}>
              {book.subtitle}
            </p>
            <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 leading-relaxed mb-4 sm:mb-5">
              {book.description}
            </p>

            {/* TOC chips */}
            <div className="space-y-2.5 sm:space-y-3 mb-5 sm:mb-7">
              {book.toc.map((part) => (
                <div key={part.part}>
                  <p className="text-[11px] font-semibold tracking-wider uppercase text-gray-500 dark:text-gray-400 mb-1.5">
                    {part.part}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {part.chapters.map((ch) => (
                      <span
                        key={ch}
                        className={`text-xs font-medium px-2 sm:px-2.5 py-1 rounded-md border ${book.theme.chipBg} ${book.theme.chipText}`}
                      >
                        {ch}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 mt-auto">
              <a
                href={book.pdf}
                download={book.downloadName}
                className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-white font-semibold text-sm shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl ${book.theme.button}`}
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
                  />
                </svg>
                PDF 다운로드
              </a>
              <span className="text-xs text-gray-500 dark:text-gray-500 text-center sm:text-left">
                계정·결제 없이 바로
              </span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

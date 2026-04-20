import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EBOOKS, getEbookById } from "@/lib/ebooks";

const SITE_URL = "https://www.ttukttak-coding.dev";

export function generateStaticParams() {
  return EBOOKS.map((book) => ({ id: book.id }));
}

export async function generateMetadata(
  props: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await props.params;
  const book = getEbookById(id);
  if (!book) return {};

  const description = `${book.subtitle} — ${book.chapters}강 ${book.pages}페이지, 무료 PDF로 받으실 수 있습니다.`;

  return {
    title: `${book.title} — 무료 PDF`,
    description,
    alternates: { canonical: `/ebook/${book.id}` },
    openGraph: {
      title: `${book.title} — 무료 PDF`,
      description,
      url: `${SITE_URL}/ebook/${book.id}`,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: `${book.title} — 무료 PDF`,
      description,
    },
  };
}

export default async function EbookDetailPage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const book = getEbookById(id);
  if (!book) notFound();

  const others = EBOOKS.filter((b) => b.id !== book.id);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    description: book.description,
    inLanguage: "ko-KR",
    url: `${SITE_URL}/ebook/${book.id}`,
    image: `${SITE_URL}/ebook/${book.id}/opengraph-image`,
    numberOfPages: book.pages,
    author: { "@type": "Person", name: "뚝딱코딩", url: `${SITE_URL}/about` },
    publisher: {
      "@type": "Organization",
      name: "뚝딱코딩",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/icon.png` },
    },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "KRW",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}${book.pdf}`,
    },
  };

  return (
    <div className="relative overflow-x-clip">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 overflow-hidden h-[500px]"
      >
        <div
          className={`absolute -top-32 -left-20 w-[420px] h-[420px] bg-gradient-to-br ${book.theme.coverGlow} rounded-full blur-3xl opacity-60`}
        />
        <div
          className={`absolute -top-20 right-0 w-[360px] h-[360px] bg-gradient-to-br ${book.theme.coverGlow} rounded-full blur-3xl opacity-40`}
        />
      </div>

      <div className="max-w-4xl mx-auto pt-4 pb-2">
        <Link
          href="/ebook"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
        >
          <span>←</span> 전자책 전체 보기
        </Link>
      </div>

      <article className="relative max-w-4xl mx-auto">
        <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/40 backdrop-blur-sm shadow-sm">
          <div
            aria-hidden
            className={`absolute -top-20 -right-20 w-72 h-72 bg-gradient-to-br ${book.theme.coverGlow} rounded-full blur-3xl opacity-60`}
          />

          <div className="relative grid sm:grid-cols-12 gap-6 sm:gap-10 p-5 sm:p-10">
            <div className="sm:col-span-5 flex justify-center">
              <div className="relative">
                <div
                  className={`absolute -inset-4 bg-gradient-to-br ${book.theme.coverGlow} rounded-2xl blur-2xl opacity-60`}
                />
                <Image
                  src={book.cover}
                  alt={`${book.title} 표지`}
                  width={280}
                  height={397}
                  className="relative rounded-lg shadow-2xl ring-1 ring-black/10 w-[220px] sm:w-[280px] h-auto"
                  priority
                />
              </div>
            </div>

            <div className="sm:col-span-7 flex flex-col">
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

              <h1 className="text-2xl sm:text-4xl font-black leading-tight mb-2 tracking-tight">
                {book.title}
              </h1>
              <p className={`text-sm sm:text-lg font-medium mb-3 sm:mb-4 ${book.theme.chipText}`}>
                {book.subtitle}
              </p>
              <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 leading-relaxed mb-5">
                {book.description}
              </p>

              <div className="space-y-3 mb-6">
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

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-auto">
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
                <span className="text-xs text-gray-500 dark:text-gray-500">
                  계정·결제 없이 바로
                </span>
              </div>
            </div>
          </div>
        </div>
      </article>

      {others.length > 0 && (
        <section className="max-w-4xl mx-auto mt-12 sm:mt-16">
          <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-5">다른 전자책</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {others.map((other) => (
              <Link
                key={other.id}
                href={`/ebook/${other.id}`}
                className="group relative overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/40 p-4 sm:p-5 flex gap-4 hover:shadow-lg transition-shadow"
              >
                <div
                  aria-hidden
                  className={`absolute -top-10 -right-10 w-40 h-40 bg-gradient-to-br ${other.theme.coverGlow} rounded-full blur-3xl opacity-60`}
                />
                <Image
                  src={other.cover}
                  alt={`${other.title} 표지`}
                  width={80}
                  height={113}
                  className="relative rounded shadow-lg ring-1 ring-black/10 shrink-0 h-auto w-[72px] sm:w-[80px]"
                />
                <div className="relative min-w-0">
                  <p className={`text-[10px] font-bold tracking-[0.2em] ${other.theme.badgeText} mb-1`}>
                    EBOOK
                  </p>
                  <p className="text-sm sm:text-base font-bold leading-tight mb-1 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {other.title}
                  </p>
                  <p className={`text-xs ${other.theme.chipText} line-clamp-2`}>
                    {other.subtitle}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="max-w-4xl mx-auto pt-8 mt-10 border-t border-gray-200 dark:border-gray-800">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
        >
          <span>←</span> 홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}

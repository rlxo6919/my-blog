import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import Image from "next/image";
import ThemeToggle from "@/components/ThemeToggle";
import Search from "@/components/Search";
import { getAllPosts } from "@/lib/posts";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://www.ttukttak-coding.dev";
const GOOGLE_SITE_VERIFICATION = process.env.GOOGLE_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "뚝딱코딩", template: "%s | 뚝딱코딩" },
  description: "뚝딱뚝딱 만들어가는 개발 블로그",
  openGraph: {
    title: "뚝딱코딩",
    description: "뚝딱뚝딱 만들어가는 개발 블로그",
    url: SITE_URL,
    siteName: "뚝딱코딩",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "뚝딱코딩",
    description: "뚝딱뚝딱 만들어가는 개발 블로그",
  },
  alternates: {
    types: { "application/rss+xml": "/feed.xml" },
  },
  verification: GOOGLE_SITE_VERIFICATION
    ? {
        google: GOOGLE_SITE_VERIFICATION,
      }
    : undefined,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const posts = getAllPosts().map(({ slug, title, excerpt, tags }) => ({
    slug,
    title,
    excerpt,
    tags,
  }));

  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme:dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors">
        <header className="border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm z-40">
          <nav className="mx-auto max-w-5xl px-6 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 hover:opacity-70 transition-opacity">
              <Image src="/icon.png" alt="뚝딱코딩 로고" width={24} height={24} />
              <span className="font-bold text-base">뚝딱코딩</span>
            </Link>
            <div className="flex items-center">
              <div className="flex items-center gap-1 mr-2">
                <Link href="/" className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  홈
                </Link>
                <Link href="/tags" className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  태그
                </Link>
                <Link href="/about" className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  소개
                </Link>
              </div>
              <div className="flex items-center gap-0.5 border-l border-gray-200 dark:border-gray-800 pl-2">
                <Search posts={posts} />
                <ThemeToggle />
              </div>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl w-full px-6 py-10 flex-1">
          {children}
        </main>
        <Analytics />
        <footer className="border-t border-gray-200 dark:border-gray-800">
          <div className="mx-auto max-w-5xl px-6 py-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500 dark:text-gray-400">
              <span>&copy; {new Date().getFullYear()} 뚝딱코딩</span>
              <div className="flex items-center gap-4">
                <Link href="/about" className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                  소개
                </Link>
                <Link href="/privacy" className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                  개인정보처리방침
                </Link>
                <a href="/feed.xml" className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors" aria-label="RSS 피드">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20C5 20 4 19 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "뚝딱코딩",
  description: "뚝딱뚝딱 만들어가는 개발 블로그",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-gray-900">
        <header className="border-b border-gray-200">
          <nav className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
            <Link href="/" className="text-xl font-bold">
              뚝딱코딩
            </Link>
            <div className="flex gap-4 text-sm">
              <Link href="/" className="hover:text-gray-600">
                홈
              </Link>
              <Link href="/tags" className="hover:text-gray-600">
                태그
              </Link>
              <Link href="/feed.xml" className="hover:text-gray-600">
                RSS
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl w-full px-6 py-10 flex-1">
          {children}
        </main>
        <footer className="border-t border-gray-200">
          <div className="mx-auto max-w-3xl px-6 py-6 text-center text-sm text-gray-500">
            &copy; {new Date().getFullYear()} 뚝딱코딩. All rights reserved.
          </div>
        </footer>
      </body>
    </html>
  );
}

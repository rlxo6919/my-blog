"use client";

import { useState } from "react";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

export default function MobileToc({ toc }: { toc: TocItem[] }) {
  const [open, setOpen] = useState(false);

  if (toc.length === 0) return null;

  return (
    <div className="lg:hidden mb-8">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
        </svg>
        목차
        <svg
          className={`w-4 h-4 ml-auto transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <nav className="mt-2 px-4 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <ul className="space-y-2 text-sm">
            {toc.map((item) => (
              <li key={item.id} className={item.level === 3 ? "pl-3" : ""}>
                <a
                  href={`#${item.id}`}
                  onClick={() => setOpen(false)}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                >
                  {item.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

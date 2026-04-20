"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/posts";

export default function DesktopToc({ toc }: { toc: TocItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (toc.length === 0) return;

    const ids = toc.map((item) => item.id);
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const visible = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const firstVisible = ids.find((id) => visible.has(id));
        if (firstVisible) {
          setActiveId(firstVisible);
        }
      },
      {
        rootMargin: "-80px 0px -70% 0px",
        threshold: [0, 1],
      }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [toc]);

  if (toc.length === 0) return null;

  return (
    <aside className="hidden lg:block w-56 shrink-0">
      <nav className="sticky top-20">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
          목차
        </h2>
        <ul className="space-y-2 text-sm border-l-2 border-gray-100 dark:border-gray-800">
          {toc.map((item) => {
            const isActive = item.id === activeId;
            return (
              <li
                key={item.id}
                className={`${item.level === 3 ? "pl-6" : "pl-3"} relative`}
              >
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute -left-0.5 top-0 bottom-0 w-0.5 bg-blue-500 dark:bg-blue-400"
                  />
                )}
                <a
                  href={`#${item.id}`}
                  className={`block transition-colors ${
                    isActive
                      ? "text-blue-600 dark:text-blue-400 font-medium"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                  }`}
                >
                  {item.text}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

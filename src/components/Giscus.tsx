"use client";

import { useEffect, useRef } from "react";

export default function Giscus() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || ref.current.hasChildNodes()) return;

    const script = document.createElement("script");
    script.src = "https://giscus.app/client.js";
    script.setAttribute("data-repo", "rlxo6919/my-blog");
    script.setAttribute("data-repo-id", "R_kgDOR615rQ");
    script.setAttribute("data-category", "comment");
    script.setAttribute("data-category-id", "DIC_kwDOR615rc4C6KDC");
    script.setAttribute("data-mapping", "pathname");
    script.setAttribute("data-strict", "0");
    script.setAttribute("data-reactions-enabled", "1");
    script.setAttribute("data-emit-metadata", "0");
    script.setAttribute("data-input-position", "bottom");
    script.setAttribute("data-lang", "ko");
    script.setAttribute("crossorigin", "anonymous");
    script.async = true;

    // 테마 감지
    const dark = document.documentElement.classList.contains("dark");
    script.setAttribute("data-theme", dark ? "dark" : "light");

    ref.current.appendChild(script);
  }, []);

  return <div ref={ref} className="mt-10 pt-6 border-t border-gray-200 dark:border-gray-700" />;
}

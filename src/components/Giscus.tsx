"use client";

import { useEffect, useRef, useCallback } from "react";

export default function Giscus() {
  const ref = useRef<HTMLDivElement>(null);

  const getTheme = useCallback(() => {
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  }, []);

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
    script.setAttribute("data-theme", getTheme());
    script.setAttribute("crossorigin", "anonymous");
    script.async = true;

    ref.current.appendChild(script);
  }, [getTheme]);

  // 테마 변경 감지 → Giscus iframe에 메시지 전송
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const iframe = ref.current?.querySelector<HTMLIFrameElement>("iframe.giscus-frame");
      if (!iframe?.contentWindow) return;
      iframe.contentWindow.postMessage(
        { giscus: { setConfig: { theme: getTheme() } } },
        "https://giscus.app"
      );
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, [getTheme]);

  return <div ref={ref} className="mt-10 pt-6 border-t border-gray-200 dark:border-gray-700" />;
}

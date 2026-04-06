"use client";

import { useEffect } from "react";
import hljs from "highlight.js";

export default function CodeHighlight() {
  useEffect(() => {
    hljs.highlightAll();
  }, []);

  return null;
}

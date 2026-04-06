import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";
import remarkGfm from "remark-gfm";

const postsDirectory = path.join(process.cwd(), "content/posts");

import type { Category } from "./categories";
export type { Category };
export { CATEGORY_LABELS } from "./categories";

export interface Post {
  slug: string;
  title: string;
  date: string;
  category: Category;
  tags: string[];
  excerpt: string;
  content: string;
  readingTime: number;
}

function estimateReadingTime(text: string): number {
  // 코드 블록 제거 (읽기 시간에서 코드는 별도 가중치)
  const codeBlocks = (text.match(/```[\s\S]*?```/g) || []);
  const codeLines = codeBlocks.reduce((sum, block) => sum + block.split("\n").length - 2, 0);
  const withoutCode = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "");

  // 마크다운 문법 제거
  const cleaned = withoutCode
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/!\[.*?]\(.*?\)/g, "")
    .replace(/\[([^]*)]\(.*?\)/g, "$1")
    .replace(/[*_~>`-]{1,3}/g, "");

  // 한국어는 분당 약 500자, 영어는 약 200단어, 코드는 분당 약 20줄
  const koreanChars = (cleaned.match(/[가-힣]/g) || []).length;
  const englishWords = cleaned.replace(/[가-힣]/g, "").split(/\s+/).filter(Boolean).length;
  const minutes = koreanChars / 500 + englishWords / 200 + codeLines / 20;
  return Math.max(1, Math.round(minutes));
}

export function getAllPosts(): Post[] {
  const fileNames = fs.readdirSync(postsDirectory);
  const posts = fileNames
    .filter((name) => name.endsWith(".md"))
    .map((fileName) => {
      const slug = fileName.replace(/\.md$/, "");
      const fullPath = path.join(postsDirectory, fileName);
      const fileContents = fs.readFileSync(fullPath, "utf8");
      const { data, content } = matter(fileContents);

      return {
        slug,
        title: data.title ?? slug,
        date: data.date ?? "",
        category: data.category ?? "troubleshooting",
        tags: data.tags ?? [],
        excerpt: data.excerpt ?? "",
        content,
        readingTime: estimateReadingTime(content),
      };
    });

  return posts.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPostBySlug(slug: string): Post | undefined {
  const fullPath = path.join(postsDirectory, `${slug}.md`);
  if (!fs.existsSync(fullPath)) return undefined;

  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);

  return {
    slug,
    title: data.title ?? slug,
    date: data.date ?? "",
    category: data.category ?? "troubleshooting",
    tags: data.tags ?? [],
    excerpt: data.excerpt ?? "",
    content,
    readingTime: estimateReadingTime(content),
  };
}

export function getAdjacentPosts(slug: string) {
  const posts = getAllPosts();
  const index = posts.findIndex((p) => p.slug === slug);
  return {
    prev: index < posts.length - 1 ? posts[index + 1] : null,
    next: index > 0 ? posts[index - 1] : null,
  };
}

export async function markdownToHtml(markdown: string): Promise<string> {
  const result = await remark().use(remarkGfm).use(html, { sanitize: false }).process(markdown);
  let htmlString = result.toString();

  // h2, h3 태그에 id 속성 추가
  htmlString = htmlString.replace(
    /<(h[23])>(.*?)<\/h[23]>/g,
    (_, tag, text) => {
      const id = text
        .replace(/<[^>]*>/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9가-힣\s-]/g, "")
        .replace(/\s+/g, "-");
      return `<${tag} id="${id}">${text}</${tag}>`;
    }
  );

  return htmlString;
}

export function getAllTags(): string[] {
  const posts = getAllPosts();
  const tagSet = new Set<string>();
  posts.forEach((post) => post.tags.forEach((tag) => tagSet.add(tag)));
  return Array.from(tagSet).sort();
}

export function getPostsByTag(tag: string): Post[] {
  return getAllPosts().filter((post) => post.tags.includes(tag));
}

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

export function extractToc(markdown: string): TocItem[] {
  const headingRegex = /^(#{2,3})\s+(.+)$/gm;
  const toc: TocItem[] = [];
  let match;

  while ((match = headingRegex.exec(markdown)) !== null) {
    const text = match[2].trim();
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s-]/g, "")
      .replace(/\s+/g, "-");
    toc.push({
      id,
      text,
      level: match[1].length,
    });
  }

  return toc;
}

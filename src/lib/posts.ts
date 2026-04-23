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
  featured: boolean;
}

export interface TagSummary {
  tag: string;
  count: number;
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
        featured: data.featured === true,
      };
    });

  return posts.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getFeaturedPosts(limit = 3): Post[] {
  return getAllPosts()
    .filter((p) => p.featured)
    .slice(0, limit);
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
    featured: data.featured === true,
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

export interface SeriesInfo {
  tag: string;
  posts: Post[]; // date ASC — 연재 순서
  position: number; // 0-based index of current post
}

/**
 * 현재 글의 대표 태그(`tags[0]`)로 시리즈를 감지합니다.
 * 같은 태그를 공유하는 글이 `minSize` 이상일 때만 시리즈로 간주합니다.
 */
export function getSeriesForPost(
  slug: string,
  minSize = 3
): SeriesInfo | null {
  const post = getPostBySlug(slug);
  if (!post || post.tags.length === 0) return null;

  const primaryTag = post.tags[0];
  const seriesPosts = getAllPosts()
    .filter((p) => p.tags.includes(primaryTag))
    .sort((a, b) => (a.date < b.date ? -1 : 1)); // ASC

  if (seriesPosts.length < minSize) return null;

  const position = seriesPosts.findIndex((p) => p.slug === slug);
  if (position === -1) return null;

  return { tag: primaryTag, posts: seriesPosts, position };
}

/**
 * 시리즈에 속하면 시리즈 내 이전/다음 글을, 아니면 전체 시간순 이전/다음을 반환합니다.
 * UI의 "이전 글"은 항상 더 오래된 글(= 시리즈에서는 이전 편)을 의미합니다.
 */
export function getSeriesAdjacent(slug: string): {
  prev: Post | null;
  next: Post | null;
  inSeries: boolean;
  seriesTag: string | null;
} {
  const series = getSeriesForPost(slug);
  if (series) {
    return {
      prev: series.position > 0 ? series.posts[series.position - 1] : null,
      next:
        series.position < series.posts.length - 1
          ? series.posts[series.position + 1]
          : null,
      inSeries: true,
      seriesTag: series.tag,
    };
  }
  const adj = getAdjacentPosts(slug);
  return { ...adj, inSeries: false, seriesTag: null };
}

export function getRelatedPosts(slug: string, limit = 3): Post[] {
  const posts = getAllPosts();
  const target = posts.find((p) => p.slug === slug);
  if (!target) return [];

  const targetTags = new Set(target.tags);

  const scored = posts
    .filter((p) => p.slug !== slug)
    .map((p) => {
      const shared = p.tags.filter((t) => targetTags.has(t)).length;
      const categoryBonus = p.category === target.category ? 0.5 : 0;
      return { post: p, score: shared + categoryBonus };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.post.date < b.post.date ? 1 : -1));

  return scored.slice(0, limit).map((x) => x.post);
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
  return getAllTagsWithCount().map(({ tag }) => tag);
}

export function getAllTagsWithCount(): TagSummary[] {
  const tagCount = new Map<string, number>();

  getAllPosts().forEach((post) => {
    post.tags.forEach((tag) => {
      tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    });
  });

  return Array.from(tagCount.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .map(([tag, count]) => ({ tag, count }));
}

export function getPostsByTag(tag: string): Post[] {
  return getAllPosts().filter((post) => post.tags.includes(tag));
}

export { tagToSlug } from "./tags";
import { tagToSlug } from "./tags";

export function getTagBySlug(slug: string): string | undefined {
  const decoded = decodeURIComponent(slug);
  return getAllTags().find((t) => tagToSlug(t) === decoded);
}

export function getPostsByTagSlug(slug: string): Post[] {
  const tag = getTagBySlug(slug);
  return tag ? getPostsByTag(tag) : [];
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

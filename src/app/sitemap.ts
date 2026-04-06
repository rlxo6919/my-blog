import type { MetadataRoute } from "next";
import { getAllPosts, getAllTags } from "@/lib/posts";

const SITE_URL = "https://ttukttak-coding.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts();
  const tags = getAllTags();

  const postEntries = posts.map((post) => ({
    url: `${SITE_URL}/posts/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  const tagEntries = tags.map((tag) => ({
    url: `${SITE_URL}/tags/${encodeURIComponent(tag)}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }));

  return [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/tags`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.6 },
    ...postEntries,
    ...tagEntries,
  ];
}

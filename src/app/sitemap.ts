import type { MetadataRoute } from "next";
import { getAllPosts, getAllTags, tagToSlug } from "@/lib/posts";
import { EBOOKS } from "@/lib/ebooks";

const SITE_URL = "https://www.ttukttak-coding.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts();
  const tags = getAllTags();
  const latestPostDate = posts.length > 0 ? new Date(posts[0].date) : new Date();

  const postEntries = posts.map((post) => ({
    url: `${SITE_URL}/posts/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  const tagEntries = tags.map((tag) => {
    const taggedPosts = posts.filter((post) => post.tags.includes(tag));
    const lastModified =
      taggedPosts.length > 0 ? new Date(taggedPosts[0].date) : latestPostDate;

    return {
      url: `${SITE_URL}/tags/${tagToSlug(tag)}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    };
  });

  return [
    { url: SITE_URL, lastModified: latestPostDate, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/about`, lastModified: latestPostDate, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/privacy`, lastModified: latestPostDate, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/tags`, lastModified: latestPostDate, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/ebook`, lastModified: latestPostDate, changeFrequency: "monthly", priority: 0.9 },
    ...EBOOKS.map((book) => ({
      url: `${SITE_URL}/ebook/${book.id}`,
      lastModified: latestPostDate,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...postEntries,
    ...tagEntries,
  ];
}

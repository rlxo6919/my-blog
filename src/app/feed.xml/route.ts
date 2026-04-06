import { Feed } from "feed";
import { getAllPosts } from "@/lib/posts";

export async function GET() {
  const posts = getAllPosts();
  const siteUrl = process.env.SITE_URL || "https://ttuktak-coding.vercel.app";

  const feed = new Feed({
    title: "뚝딱코딩",
    description: "뚝딱뚝딱 만들어가는 개발 블로그",
    id: siteUrl,
    link: siteUrl,
    language: "ko",
    copyright: `All rights reserved ${new Date().getFullYear()}`,
    author: {
      name: "Blog Author",
    },
  });

  posts.forEach((post) => {
    feed.addItem({
      title: post.title,
      id: `${siteUrl}/posts/${post.slug}`,
      link: `${siteUrl}/posts/${post.slug}`,
      description: post.excerpt,
      date: new Date(post.date),
    });
  });

  return new Response(feed.rss2(), {
    headers: {
      "Content-Type": "application/xml",
    },
  });
}

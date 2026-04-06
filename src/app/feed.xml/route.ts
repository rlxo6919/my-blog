import { Feed } from "feed";
import { getAllPosts } from "@/lib/posts";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ttukttak.dev";

export async function GET() {
  const posts = getAllPosts();

  const feed = new Feed({
    title: "뚝딱코딩",
    description: "뚝딱뚝딱 만들어가는 개발 블로그",
    id: SITE_URL,
    link: SITE_URL,
    language: "ko",
    copyright: `© ${new Date().getFullYear()} 뚝딱코딩`,
    updated: posts.length > 0 ? new Date(posts[0].date) : new Date(),
  });

  for (const post of posts) {
    feed.addItem({
      title: post.title,
      id: `${SITE_URL}/posts/${post.slug}`,
      link: `${SITE_URL}/posts/${post.slug}`,
      description: post.excerpt,
      date: new Date(post.date),
    });
  }

  return new Response(feed.rss2(), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

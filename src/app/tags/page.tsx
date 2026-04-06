import Link from "next/link";
import { getAllTags, getPostsByTag } from "@/lib/posts";

export default function TagsPage() {
  const tags = getAllTags();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">태그</h1>
      <div className="flex flex-wrap gap-3">
        {tags.map((tag) => {
          const count = getPostsByTag(tag).length;
          return (
            <Link
              key={tag}
              href={`/tags/${tag}`}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 text-sm"
            >
              {tag} ({count})
            </Link>
          );
        })}
      </div>
    </div>
  );
}

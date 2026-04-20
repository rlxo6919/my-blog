export function tagToSlug(tag: string): string {
  return tag
    .trim()
    .replace(/\+/g, "-plus-")
    .replace(/[\s/\\]+/g, "-")
    .toLowerCase();
}

export function getTagValue(tags: string[][], tagName: string): string | undefined {
  return tags.find((tag) => tag[0] === tagName)?.[1];
}

export function getTagValues(tags: string[][], tagName: string): string[] {
  return tags.filter((tag) => tag[0] === tagName).map((tag) => tag[1]).filter(Boolean);
}

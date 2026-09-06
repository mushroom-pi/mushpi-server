export function isExternalImageUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

export function buildImageUrl(
  stored: string | null,
  pathPrefix?: string,
): string | null {
  if (!stored) return null;
  if (isExternalImageUrl(stored)) return stored;
  return pathPrefix ? `${pathPrefix}/${stored}` : stored;
}

export function buildImageUrls(
  stored: string[] | null,
  pathPrefix?: string,
): string[] {
  if (!stored || stored.length === 0) return [];
  return stored.map((s) => buildImageUrl(s, pathPrefix) as string);
}

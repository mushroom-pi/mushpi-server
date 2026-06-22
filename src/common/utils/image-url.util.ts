export function isExternalImageUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

export function buildImageUrl(
  stored: string | null,
  baseUrl: string,
): string | null {
  if (!stored) return null;
  if (isExternalImageUrl(stored)) return stored;
  return `${baseUrl}${stored}`;
}

export function buildImageUrls(
  stored: string[] | null,
  baseUrl: string,
): string[] {
  if (!stored || stored.length === 0) return [];
  return stored.map((s) => buildImageUrl(s, baseUrl) as string);
}

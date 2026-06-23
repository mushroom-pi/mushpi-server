export function isExternalImageUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

export function buildImageUrl(
  stored: string | null,
  baseUrl: string,
  pathPrefix?: string,
): string | null {
  if (!stored) return null;
  if (isExternalImageUrl(stored)) return stored;
  const urlPath = pathPrefix ? `${pathPrefix}/${stored}` : stored;
  return `${baseUrl}${urlPath}`;
}

export function buildImageUrls(
  stored: string[] | null,
  baseUrl: string,
  pathPrefix?: string,
): string[] {
  if (!stored || stored.length === 0) return [];
  return stored.map((s) => buildImageUrl(s, baseUrl, pathPrefix) as string);
}

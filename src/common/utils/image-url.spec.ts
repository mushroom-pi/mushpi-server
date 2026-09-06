import {
  buildImageUrl,
  buildImageUrls,
  isExternalImageUrl,
} from './image-url.util';

describe('isExternalImageUrl', () => {
  it('returns true for https:// URLs', () => {
    expect(isExternalImageUrl('https://example.com/img.jpg')).toBe(true);
  });

  it('returns true for http:// URLs', () => {
    expect(isExternalImageUrl('http://example.com/img.jpg')).toBe(true);
  });

  it('returns false for bare filenames', () => {
    expect(isExternalImageUrl('1.jpg')).toBe(false);
  });

  it('returns false for root-relative paths', () => {
    expect(isExternalImageUrl('/images/recipes/1.jpg')).toBe(false);
  });
});

describe('buildImageUrl', () => {
  it('returns null for null input', () => {
    expect(buildImageUrl(null)).toBeNull();
  });

  it('returns null for empty string input', () => {
    expect(buildImageUrl('')).toBeNull();
  });

  it('passes through external https:// URLs as-is', () => {
    expect(buildImageUrl('https://example.com/img.jpg')).toBe(
      'https://example.com/img.jpg',
    );
  });

  it('passes through external http:// URLs as-is', () => {
    expect(buildImageUrl('http://example.com/img.jpg')).toBe(
      'http://example.com/img.jpg',
    );
  });

  it('passes through external URLs even when pathPrefix is given', () => {
    expect(
      buildImageUrl('https://example.com/img.jpg', '/images/recipes'),
    ).toBe('https://example.com/img.jpg');
  });

  it('prepends pathPrefix to a bare filename', () => {
    expect(buildImageUrl('1.jpg', '/images/recipes')).toBe(
      '/images/recipes/1.jpg',
    );
  });

  it('returns the bare filename when no pathPrefix is given', () => {
    expect(buildImageUrl('1.jpg')).toBe('1.jpg');
  });
});

describe('buildImageUrls', () => {
  it('returns empty array for null input', () => {
    expect(buildImageUrls(null)).toEqual([]);
  });

  it('returns empty array for empty array input', () => {
    expect(buildImageUrls([])).toEqual([]);
  });

  it('maps filenames with pathPrefix', () => {
    expect(buildImageUrls(['1.jpg', '2.png'], '/images/batches/7')).toEqual([
      '/images/batches/7/1.jpg',
      '/images/batches/7/2.png',
    ]);
  });

  it('passes through external URLs in the array', () => {
    expect(
      buildImageUrls(['https://example.com/a.jpg'], '/images/batches/7'),
    ).toEqual(['https://example.com/a.jpg']);
  });

  it('preserves order and passthrough in a mixed array', () => {
    const input = ['1.jpg', 'https://example.com/ext.png', '2.jpg'];
    const result = buildImageUrls(input, '/images/batches/7');
    expect(result).toEqual([
      '/images/batches/7/1.jpg',
      'https://example.com/ext.png',
      '/images/batches/7/2.jpg',
    ]);
  });
});

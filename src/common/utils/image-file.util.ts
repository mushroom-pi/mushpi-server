import * as fs from 'fs';
import * as path from 'path';

import { isExternalImageUrl } from './image-url.util';

export function resolveImageFilePath(
  stored: string,
  pathPrefix: string,
  imageUploadDir: string,
): string {
  const relative = pathPrefix
    ? `${pathPrefix.replace(/^\/images\//, '')}/${stored}`
    : stored.replace(/^\/images\//, '');
  return path.join(imageUploadDir, relative);
}

export function deleteImageFile(
  stored: string | null,
  pathPrefix: string,
  imageUploadDir: string,
): void {
  if (!stored) return;
  if (isExternalImageUrl(stored)) return;
  const filePath = resolveImageFilePath(stored, pathPrefix, imageUploadDir);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

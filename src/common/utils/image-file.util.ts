import * as fs from 'fs';
import * as path from 'path';

import { IMAGE_UPLOAD_DIR } from 'src/common/constants/upload.constants';

import { isExternalImageUrl } from './image-url.util';

export function resolveImageFilePath(stored: string): string {
  const relative = stored.replace(/^\/images\//, '');
  return path.join(IMAGE_UPLOAD_DIR, relative);
}

export function deleteImageFile(stored: string | null): void {
  if (!stored) return;
  if (isExternalImageUrl(stored)) return;
  const filePath = resolveImageFilePath(stored);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

import { BadRequestException } from '@nestjs/common';

import { diskStorage } from 'multer';

import {
  IMAGE_ALLOWED_MIME_TYPES,
  IMAGE_MAX_FILE_SIZE,
} from 'src/common/constants/upload.constants';

export const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export interface ImageMulterOptionsConfig {
  destination:
    | string
    | ((
        req: any,
        file: Express.Multer.File,
        cb: (error: Error | null, filename: string) => void,
      ) => void);
  filename: (
    req: any,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void,
  ) => void;
}

export function buildImageMulterOptions(config: ImageMulterOptionsConfig) {
  return {
    storage: diskStorage({
      destination: config.destination,
      filename: config.filename,
    }),
    limits: { fileSize: IMAGE_MAX_FILE_SIZE },
    fileFilter: (
      _req: any,
      file: Express.Multer.File,
      cb: (error: Error | null, accept: boolean) => void,
    ) => {
      if (!IMAGE_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        return cb(
          new BadRequestException(
            `Invalid file type. Allowed: ${IMAGE_ALLOWED_MIME_TYPES.join(', ')}`,
          ),
          false,
        );
      }
      cb(null, true);
    },
  };
}

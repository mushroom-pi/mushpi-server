import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';

import * as fs from 'fs';
import * as path from 'path';
import { Observable } from 'rxjs';

import { IMAGE_MAX_FILES_PER_BATCH } from 'src/modules/batches/batches.constant';
import { BATCH_IMAGE_UPLOAD_DIR } from 'src/modules/batches/batches.constant';
import { Batch } from 'src/modules/batches/batches.entity';

import { MIME_TO_EXT, buildImageMulterOptions } from './image-upload.helpers';

function parseSlotNumber(stored: string): number | null {
  const match = stored.match(/\/(\d+)\.[^.]+$/);
  return match ? Number(match[1]) : null;
}

@Injectable()
export class BatchImagesUploadInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<any> | Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();
    const batch = req.batch as Batch;
    const existing = batch.images?.length ?? 0;
    const remaining = Math.max(0, IMAGE_MAX_FILES_PER_BATCH - existing);

    if (remaining <= 0) {
      throw new ConflictException('Batch already has the maximum of 5 images');
    }

    req.__batchImgSlots = [] as number[];

    const multerOptions = buildImageMulterOptions({
      destination: (_req: any, _file: Express.Multer.File, cb: any) => {
        const dir = path.join(BATCH_IMAGE_UPLOAD_DIR, String(batch.id));
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (reqInner: any, file: Express.Multer.File, cb: any) => {
        const ext = MIME_TO_EXT[file.mimetype] || 'bin';
        const used = new Set<number>();

        (batch.images ?? []).forEach((p) => {
          const n = parseSlotNumber(p);
          if (n) used.add(n);
        });

        (reqInner.__batchImgSlots as number[]).forEach((n) => used.add(n));

        let slot = 1;
        while (used.has(slot) && slot <= IMAGE_MAX_FILES_PER_BATCH) slot++;

        if (slot > IMAGE_MAX_FILES_PER_BATCH) {
          return cb(
            new ConflictException('Batch already has the maximum of 5 images'),
            false,
          );
        }

        reqInner.__batchImgSlots.push(slot);
        cb(null, `${slot}.${ext}`);
      },
    });

    const InterceptorClass = FilesInterceptor(
      'images',
      remaining,
      multerOptions,
    );
    const delegate = new InterceptorClass();

    return delegate.intercept(context, next);
  }
}

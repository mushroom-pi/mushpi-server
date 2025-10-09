import {
  Injectable,
  NestMiddleware,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { NextFunction, Request, Response } from 'express';

import { BatchesService } from 'src/modules/batches/batches.service';

declare module 'express-serve-static-core' {
  interface Request {
    batch?: import('src/modules/batches/batches.entity').Batch;
  }
}

@Injectable()
export class BatchByIdMiddleware implements NestMiddleware {
  constructor(private readonly batches: BatchesService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const raw = (req.params as Record<string, string | undefined>)?.batchId;
    const id = Number(raw);

    if (!raw || !Number.isFinite(id) || id <= 0) {
      return next(new UnprocessableEntityException('Invalid batch id'));
    }

    try {
      const batch = await this.batches.getByIdOrThrow(id);
      req.batch = batch;
      return next();
    } catch {
      return next(new NotFoundException(`Batch ${id} not found`));
    }
  }
}

import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import { Batch } from 'src/modules/batches/batches.entity';

export const GetBatch = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Batch => {
    const req = ctx.switchToHttp().getRequest<{ batch?: Batch }>();
    return req.batch as Batch;
  },
);

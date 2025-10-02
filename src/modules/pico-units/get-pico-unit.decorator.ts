import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import { PicoUnit } from './pico-unit.entity';

export const GetPicoUnit = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PicoUnit => {
    const req = ctx.switchToHttp().getRequest<{ picoUnit?: PicoUnit }>();
    return req.picoUnit as PicoUnit; // middleware guarantees existence or 404 earlier
  },
);

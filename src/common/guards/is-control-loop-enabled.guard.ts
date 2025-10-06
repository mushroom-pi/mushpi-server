import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';

import { Observable } from 'rxjs';

import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';

@Injectable()
export class IsControlLoopEnabledGuard implements CanActivate {
  canActivate(
    ctx: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const req = ctx.switchToHttp().getRequest<{ picoUnit?: PicoUnit }>();

    if (!req.picoUnit || !req.picoUnit.latest_reading)
      throw new ConflictException(
        'This endpoint cannot be used while the control loop is enabled',
      );

    return true;
  }
}

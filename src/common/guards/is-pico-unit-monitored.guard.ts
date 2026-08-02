import {
  CanActivate,
  ExecutionContext,
  GoneException,
  Injectable,
} from '@nestjs/common';

import { Observable } from 'rxjs';

import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';

@Injectable()
export class IsPicoUnitMonitoredGuard implements CanActivate {
  canActivate(
    ctx: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const req = ctx.switchToHttp().getRequest<{ picoUnit?: PicoUnit }>();

    if (!req.picoUnit || !req.picoUnit.monitored)
      throw new GoneException(
        `The Pico Unit ${req.picoUnit?.id} is not being monitored`,
      );

    return true;
  }
}

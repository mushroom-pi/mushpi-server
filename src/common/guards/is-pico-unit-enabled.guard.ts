import {
  CanActivate,
  ExecutionContext,
  GoneException,
  Injectable,
} from '@nestjs/common';

import { Observable } from 'rxjs';

import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';

@Injectable()
export class IsPicoUnitEnabledGuard implements CanActivate {
  canActivate(
    ctx: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const req = ctx.switchToHttp().getRequest<{ picoUnit?: PicoUnit }>();

    if (!req.picoUnit || !req.picoUnit.enabled)
      throw new GoneException(`The Pico Unit ${req.picoUnit.id} is disabled`);

    return true;
  }
}

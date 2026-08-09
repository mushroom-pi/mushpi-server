import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';

import { Observable } from 'rxjs';

import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';

/**
 * Blocks manual output changes while the control loop is enabled.
 * Allows the request when the loop is disabled or state is unknown (no reading yet).
 */
@Injectable()
export class IsControlLoopEnabledGuard implements CanActivate {
  canActivate(
    ctx: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const req = ctx.switchToHttp().getRequest<{ picoUnit?: PicoUnit }>();

    // If there's no reading yet, allow the request (can't determine state)
    // If the control loop IS enabled, block manual output changes
    const isLoopEnabled = req.picoUnit?.latest_reading?.control_loop_enabled;
    if (isLoopEnabled === true) {
      throw new ConflictException(
        'Manual output control is unavailable while the control loop is enabled. Disable the control loop first.',
      );
    }

    return true;
  }
}

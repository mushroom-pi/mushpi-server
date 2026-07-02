import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { Request } from 'express';

import { CustomConfigService } from 'src/modules/config/config.service';

@Injectable()
export class PicoAnnounceSecretGuard implements CanActivate {
  constructor(private readonly config: CustomConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const expected = this.config.pico.announceSecret;
    const provided = req.headers['x-pico-secret'] as string | undefined;

    if (!expected || provided !== expected) {
      throw new UnauthorizedException(
        'Missing or invalid X-Pico-Secret header',
      );
    }

    return true;
  }
}

import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Request } from 'express';

import {
  DEMO_READONLY_FORBIDDEN_MESSAGE,
  DEMO_READONLY_MARK,
  DEMO_READONLY_SAFE_METHODS,
  DemoReadOnlyMark,
} from 'src/common/constants/demo-readonly.constants';
import { CustomConfigService } from 'src/modules/config/config.service';

/**
 * Global guard enforcing the demo read-only contract.
 *
 * On a demo boot (`NODE_ENV=demo`), every request whose method is not safe
 * (`GET`/`HEAD`/`OPTIONS`) is refused with 403 unless the handler carries
 * `@DemoReadOnlyExempt()`; a safe-method handler that nevertheless writes
 * persisted data carries `@DemoReadOnlyRefused()` and is refused too. On
 * every non-demo boot the guard returns true immediately — self-hosted hubs
 * behave exactly as before.
 *
 * Registered as an `APP_GUARD` AFTER `TooManyRequestsGuard` in `app.module.ts`
 * so a request is counted against the pace budget before being refused, and
 * the 403 response still carries the `X-RateLimit-*` headers when throttling
 * is configured. Guards run before the validation pipe, so a malformed body
 * on a refused route gets 403, not 422.
 */
@Injectable()
export class DemoReadOnlyGuard implements CanActivate {
  constructor(
    private readonly config: CustomConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.config.is('demo')) return true;

    const mark = this.reflector.get<DemoReadOnlyMark | undefined>(
      DEMO_READONLY_MARK,
      context.getHandler(),
    );
    if (mark === 'exempt') return true;
    if (mark === 'refused') throw this.refusal();

    const req = context.switchToHttp().getRequest<Request>();
    if (
      DEMO_READONLY_SAFE_METHODS.includes(
        req.method as (typeof DEMO_READONLY_SAFE_METHODS)[number],
      )
    ) {
      return true;
    }
    throw this.refusal();
  }

  /**
   * Explicit-body style (mirrors `TooManyRequestsGuard`): passes through the
   * global `ExceptionsFilter`'s `handleHttpError` with the standard error
   * shape (`emitter`/`timestamp`/`path` appended when ERRORS_DETAIL).
   */
  private refusal(): HttpException {
    return new HttpException(
      {
        statusCode: HttpStatus.FORBIDDEN,
        message: DEMO_READONLY_FORBIDDEN_MESSAGE,
        error: 'Forbidden',
        emitter: 'DemoReadOnlyGuard',
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

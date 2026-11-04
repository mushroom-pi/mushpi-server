import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';

import { formatSlowDownMessage } from 'src/common/constants/rate-limit.constants';
import { CustomConfigService } from 'src/modules/config/config.service';

/**
 * The throttler guard's explicit-body 429, split by deployment profile — a
 * condition inside this one guard, never a profile-named sibling. The
 * `statusCode`/`error`/`emitter` shape and every header stay identical on
 * both branches; only the `message` differs.
 */
@Injectable()
export class TooManyRequestsGuard extends ThrottlerGuard {
  /**
   * Declaring a constructor emits subclass `design:paramtypes` metadata, in
   * which the two option/storage tokens erase to `Object` — so the parent's
   * own inject-token decorators are re-applied here and `super()` is called
   * explicitly. DI resolution stays exactly as the parent wired it.
   */
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: CustomConfigService,
  ) {
    super(options, storageService, reflector);
  }

  protected async throwThrottlingException(
    _context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    // `timeToBlockExpire` is the real blocking window by construction: it is
    // the exact value the library writes into the blocking bucket's
    // `Retry-After` header (and `X-RateLimit-Reset` carries `timeToExpire`),
    // in the library's own relative seconds — nothing is re-rounded here.
    const message = this.config.isDemo
      ? formatSlowDownMessage(throttlerLimitDetail.timeToBlockExpire)
      : 'Too many requests';

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message,
        error: 'Too many requests',
        emitter: 'ThrottlerGuard',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

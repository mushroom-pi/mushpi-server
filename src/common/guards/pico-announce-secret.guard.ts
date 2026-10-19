import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { Request } from 'express';

import { PICO_ANNOUNCE_REFUSED_MESSAGE } from 'src/common/constants/pico-announce.constants';
import { isInternalCaller } from 'src/common/utils/internal-caller.util';
import { CustomConfigService } from 'src/modules/config/config.service';

/**
 * Guards `POST /v1/pico-units/announce` with the shared `X-Pico-Secret`.
 *
 * Two deployment profiles behind this single guard:
 *
 * - **Everywhere outside demo** — the historical path, byte-for-byte: a
 *   missing or mismatched secret is 401, nothing else is consulted. The
 *   `isDemo`-first check is the same mechanism `DemoReadOnlyGuard` and
 *   `applySingleHopTrustProxy` use, so a self-hosted hub is untouched.
 * - **On a demo boot** — a demo has no physical Pico units; its only
 *   legitimate announcer is the simulated unit running beside the server.
 *   External announce attempts therefore have no legitimate use, and they
 *   are refused outright BEFORE the secret is compared: even a correct
 *   `X-Pico-Secret` arriving through a proxy gets an explicit-body 403
 *   (the refusal shape mirrors `DemoReadOnlyGuard`, naming this guard in
 *   `emitter`). Rate-limiting a guess would still leave the guess —
 *   refusing the arrival closes it instead. The `@ReadOnlyExempt()`
 *   mark stays on the announce handler for exactly one reason:
 *   `DemoReadOnlyGuard` cannot tell an internal caller from a visitor, so
 *   removing the exemption would refuse the simulated unit too.
 *
 * Internal callers keep the secret check itself (defence in depth — the
 * simulated unit presents `X-Pico-Secret` just like real hardware). Guards
 * run before the validation pipe and the handler, so a refused announce
 * registers nothing: no upsert, no event, no stored row touched.
 */
@Injectable()
export class PicoAnnounceSecretGuard implements CanActivate {
  constructor(private readonly config: CustomConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const expected = this.config.pico.announceSecret;
    const provided = req.headers['x-pico-secret'] as string | undefined;

    if (this.config.isDemo && !isInternalCaller(req)) {
      throw this.refusal();
    }

    this.assertSecret(expected, provided);
    return true;
  }

  /**
   * Explicit-body style (mirrors `DemoReadOnlyGuard`): passes through the
   * global `ExceptionsFilter`'s `handleHttpError` with the standard error
   * shape (`emitter`/`timestamp`/`path` appended when ERRORS_DETAIL).
   */
  private refusal(): HttpException {
    return new HttpException(
      {
        statusCode: HttpStatus.FORBIDDEN,
        message: PICO_ANNOUNCE_REFUSED_MESSAGE,
        error: 'Forbidden',
        emitter: 'PicoAnnounceSecretGuard',
      },
      HttpStatus.FORBIDDEN,
    );
  }

  private assertSecret(expected?: string, provided?: string): void {
    if (!expected || provided !== expected) {
      throw new UnauthorizedException(
        'Missing or invalid X-Pico-Secret header',
      );
    }
  }
}

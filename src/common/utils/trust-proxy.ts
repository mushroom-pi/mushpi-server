import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';

import { CustomConfigService } from 'src/modules/config/config.service';

/**
 * Demo-only single-hop proxy trust.
 *
 * The demo deployment sits behind exactly one reverse proxy, and its
 * per-visitor rate-limit identity is `req.ip` (the throttler's default
 * tracker). With `trust proxy` at Express's default (disabled), every
 * visitor would share the proxy's address as `req.ip` — one bucket for the
 * whole demo. Enabling ONE hop makes `req.ip` the RIGHTMOST
 * `X-Forwarded-For` entry: the address the proxy itself appended, i.e. the
 * visitor's own. A client-supplied prefix cannot change it (changing
 * address does not escape a slow-down), and visitors behind the same proxy
 * are told apart by their own address.
 *
 * This deliberately rewrites `req.ip`, so it is gated on `isDemo` FIRST and
 * applied in the shared helper from BOTH `main.ts` and `test/test-setup.ts`
 * (middleware applied outside the Nest module graph would otherwise let the
 * e2e fixture drift from production without a single test failing). A
 * self-hosted hub keeps the Express default — its opt-in limiter keeps
 * bucketing by socket address, exactly as before.
 */
export function applyDemoTrustProxy(
  app: INestApplication,
  config: CustomConfigService,
): void {
  if (!config.isDemo) return;

  (app as NestExpressApplication).set('trust proxy', 1);
}

import { ExecutionContext } from '@nestjs/common';
import {
  ThrottlerGenerateKeyFunction,
  ThrottlerOptions,
} from '@nestjs/throttler';

import { Request } from 'express';

import {
  RATE_LIMIT_ABUSE_THROTTLER_NAME,
  RATE_LIMIT_GLOBAL_THROTTLER_NAME,
  RATE_LIMIT_GLOBAL_TRACKER,
} from 'src/common/constants/rate-limit.constants';
import {
  READONLY_MARK,
  ReadOnlyMark,
} from 'src/common/constants/readonly.constants';
import { CustomConfigService } from 'src/modules/config/config.service';

import { isReadOnlyRefusal } from './readonly-refusal.util';

/**
 * Builds the throttler definitions for `ThrottlerModule.forRootAsync()`
 * from the validated configuration. Two disjoint shapes:
 *
 * - **Public-demo profile** (`NODE_ENV=demo`) — exactly three always-on
 *   definitions (browse pace, whole-instance backstop, refused-change pace),
 *   values from the six `VISITOR_*` / `ABUSE_*` / `GLOBAL_*` env vars. A
 *   demo instance is internet-exposed, so an unprotected demo is not an
 *   option: a malformed value THROWS from the factory (fail loudly at boot)
 *   instead of silently serving an unprotected demo. No limit values are
 *   hardcoded in the product.
 * - **Self-hosted profile** — the historical pair-or-empty array VERBATIM:
 *   `MAX_REQUESTS`/`MAX_REQUESTS_TIME` opt-in, or an EMPTY definitions array
 *   when unset. The empty array is what suppresses the headers: every header
 *   write lives inside `ThrottlerGuard.handleRequest()`, so zero definitions
 *   ⇒ the loop body never runs ⇒ no headers and no 429. Never hand the
 *   library a definition with an `undefined` `ttl`/`limit` — it emits
 *   literally `X-RateLimit-Limit: undefined` with `NaN` in the other two.
 *
 * `isDemo` is checked FIRST so the `VISITOR_*`/`ABUSE_*`/`GLOBAL_*` values
 * sitting in a self-hosted hub's env file can never produce a definition
 * there (criterion: a hub without the demo environment has no slow-down and
 * no new limits).
 */
export function buildThrottlerDefinitions(
  config: CustomConfigService,
): ThrottlerOptions[] {
  if (config.isDemo) {
    // Public-demo profile — three always-on limiters, values from the
    // deployment.
    const { visitor, abuse, global: backstop } = config.security.demo;

    const visitorLimit = requirePositiveInt(
      visitor.maxRequests,
      'VISITOR_MAX_REQUESTS',
    );
    const visitorTtl = requirePositiveInt(
      visitor.maxRequestsTime,
      'VISITOR_MAX_REQUESTS_TIME',
    );
    const globalLimit = requirePositiveInt(
      backstop.maxRequests,
      'GLOBAL_MAX_REQUESTS',
    );
    const globalTtl = requirePositiveInt(
      backstop.maxRequestsTime,
      'GLOBAL_MAX_REQUESTS_TIME',
    );
    const abuseLimit = requirePositiveInt(
      abuse.maxRequests,
      'ABUSE_MAX_REQUESTS',
    );
    const abuseTtl = requirePositiveInt(
      abuse.maxRequestsTime,
      'ABUSE_MAX_REQUESTS_TIME',
    );

    // Declaration order [default, demo-global, demo-abuse]. The library
    // RE-SORTS definitions by ascending ttl at init, so with unequal windows
    // the shortest-windowed definition throws first and its suffixed
    // `Retry-After-<name>` is the one a client sees — not declaration order.
    // REFERENCE.md §Guards owns the caveat.
    return [
      // 1. Per-visitor browse pace. UNNAMED, so it fills the `default` slot:
      // its tracker is the library default — `req.ip`, which under the demo's
      // single-hop proxy trust is the visitor's OWN forwarded identity
      // (`X-Forwarded-For` rightmost wins; a spoofed prefix cannot mint a
      // fresh bucket).
      { ttl: visitorTtl, limit: visitorLimit, generateKey: flatThrottlerKey },
      // 2. Whole-instance backstop. Named, constant tracker: one shared
      // bucket so a many-visitor flood slows the DEMO as a whole and recovers
      // without a restart.
      {
        name: RATE_LIMIT_GLOBAL_THROTTLER_NAME,
        ttl: globalTtl,
        limit: globalLimit,
        getTracker: () => RATE_LIMIT_GLOBAL_TRACKER,
        generateKey: flatThrottlerKey,
      },
      // 3. Refused-change pace. Named, per-visitor, its own distinct bucket:
      // enforced ONLY on requests the demo read-only guard would refuse — the
      // same `isReadOnlyRefusal` predicate the guard evaluates, so browsing
      // never spends from it and a visitor repeatedly attempting refused
      // changes is slowed sooner than one who only browses. The mark is read
      // at HANDLER level only (mirroring the guard), so no DI is needed here.
      {
        name: RATE_LIMIT_ABUSE_THROTTLER_NAME,
        ttl: abuseTtl,
        limit: abuseLimit,
        generateKey: flatThrottlerKey,
        skipIf: (context: ExecutionContext) =>
          !isReadOnlyRefusal(
            Reflect.getMetadata(READONLY_MARK, context.getHandler()) as
              | ReadOnlyMark
              | undefined,
            context.switchToHttp().getRequest<Request>().method,
          ),
      },
    ];
  }

  const limit = config.security.maxRequests;
  const ttl = config.security.maxRequestsTime;
  const configured =
    Number.isSafeInteger(limit) &&
    (limit as number) > 0 &&
    Number.isSafeInteger(ttl) &&
    (ttl as number) > 0;
  return configured ? [{ ttl, limit }] : [];
}

/**
 * Shared flat throttler key. The library's default key embeds
 * `Class-handler-name`, which would scatter the backstop across endpoints
 * and re-split a visitor's budget per route. The public-demo definitions key
 * on `throttler-name + tracker`: each visitor's browse and refused-change
 * budgets span ALL endpoints, and the backstop — whose tracker is the
 * constant `RATE_LIMIT_GLOBAL_TRACKER` — collapses into a single
 * instance-wide bucket. The buckets stay distinct because the throttler name
 * is part of the key.
 */
export const flatThrottlerKey: ThrottlerGenerateKeyFunction = (
  _context: ExecutionContext,
  trackerString: string,
  throttlerName: string,
) => `mushpi-demo-${throttlerName}-${trackerString}`;

/**
 * Defensive re-check of one demo limit value. A key absent from Joi's
 * validated map falls through to a live, uncoerced `process.env` read (a
 * string fails `Number.isSafeInteger` and would otherwise reach the library
 * as garbage), so the schema alone is not sufficient at runtime. In demo a
 * failed check throws naming the exact env var — never silently serve an
 * unprotected demo.
 */
function requirePositiveInt(value: unknown, envKey: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(
      `A demo boot requires ${envKey} to be a positive integer (got ${JSON.stringify(value)}). Rate-limit values come from the deployment and are never defaulted in the product.`,
    );
  }
  return value as number;
}

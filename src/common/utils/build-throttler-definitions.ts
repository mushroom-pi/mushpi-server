import { ExecutionContext } from '@nestjs/common';
import {
  ThrottlerGenerateKeyFunction,
  ThrottlerOptions,
} from '@nestjs/throttler';

import { Request } from 'express';

import {
  DEMO_READONLY_MARK,
  DemoReadOnlyMark,
} from 'src/common/constants/demo-readonly.constants';
import {
  DEMO_ABUSE_THROTTLER_NAME,
  DEMO_GLOBAL_THROTTLER_NAME,
  DEMO_GLOBAL_TRACKER,
} from 'src/common/constants/demo.constants';
import { CustomConfigService } from 'src/modules/config/config.service';

import { isDemoReadOnlyRefusal } from './demo-readonly-refusal.util';

/**
 * Builds the throttler definitions for `ThrottlerModule.forRootAsync()`
 * from the validated configuration. Two disjoint shapes:
 *
 * - **Demo boot** — exactly three always-on definitions (browse pace,
 *   whole-instance backstop, refused-change pace), values from the six
 *   `DEMO_*` env vars. A demo instance is internet-exposed, so an
 *   unprotected demo is not an option: a malformed value THROWS from the
 *   factory (fail loudly at boot) instead of silently serving an unprotected
 *   demo. No limit values are hardcoded in the product.
 * - **Every other boot** — the historical pair-or-empty array VERBATIM:
 *   `MAX_REQUESTS`/`MAX_REQUESTS_TIME` opt-in, or an EMPTY definitions array
 *   when unset. The empty array is what suppresses the headers: every header
 *   write lives inside `ThrottlerGuard.handleRequest()`, so zero definitions
 *   ⇒ the loop body never runs ⇒ no headers and no 429. Never hand the
 *   library a definition with an `undefined` `ttl`/`limit` — it emits
 *   literally `X-RateLimit-Limit: undefined` with `NaN` in the other two.
 *
 * `isDemo` is checked FIRST so `DEMO_*` variables sitting in a self-hosted
 * hub's env file can never produce a definition there (criterion: a hub
 * without the demo environment has no slow-down and no new limits).
 */
export function buildThrottlerDefinitions(
  config: CustomConfigService,
): ThrottlerOptions[] {
  if (config.isDemo) return buildDemoDefinitions(config);

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
 * Shared flat demo key. The library's default key embeds
 * `Class-handler-name`, which would scatter the backstop across endpoints
 * and re-split a visitor's budget per route. Demo definitions instead key on
 * `throttler-name + tracker`: each visitor's browse and refused-change
 * budgets span ALL endpoints, and the backstop — whose tracker is the
 * constant `DEMO_GLOBAL_TRACKER` — collapses into a single instance-wide
 * bucket. The buckets stay distinct because the throttler name is part of
 * the key.
 */
export const demoFlatKey: ThrottlerGenerateKeyFunction = (
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

function buildDemoDefinitions(config: CustomConfigService): ThrottlerOptions[] {
  const { visitor, abuse, global: backstop } = config.security.demo;

  const visitorLimit = requirePositiveInt(
    visitor.maxRequests,
    'DEMO_VISITOR_MAX_REQUESTS',
  );
  const visitorTtl = requirePositiveInt(
    visitor.maxRequestsTime,
    'DEMO_VISITOR_MAX_REQUESTS_TIME',
  );
  const globalLimit = requirePositiveInt(
    backstop.maxRequests,
    'DEMO_GLOBAL_MAX_REQUESTS',
  );
  const globalTtl = requirePositiveInt(
    backstop.maxRequestsTime,
    'DEMO_GLOBAL_MAX_REQUESTS_TIME',
  );
  const abuseLimit = requirePositiveInt(
    abuse.maxRequests,
    'DEMO_ABUSE_MAX_REQUESTS',
  );
  const abuseTtl = requirePositiveInt(
    abuse.maxRequestsTime,
    'DEMO_ABUSE_MAX_REQUESTS_TIME',
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
    { ttl: visitorTtl, limit: visitorLimit, generateKey: demoFlatKey },
    // 2. Whole-instance backstop. Named, constant tracker: one shared
    // bucket so a many-visitor flood slows the DEMO as a whole and recovers
    // without a restart.
    {
      name: DEMO_GLOBAL_THROTTLER_NAME,
      ttl: globalTtl,
      limit: globalLimit,
      getTracker: () => DEMO_GLOBAL_TRACKER,
      generateKey: demoFlatKey,
    },
    // 3. Refused-change pace. Named, per-visitor, its own distinct bucket:
    // enforced ONLY on requests the demo read-only guard would refuse — the
    // same `isDemoReadOnlyRefusal` predicate the guard evaluates, so
    // browsing never spends from it and a visitor repeatedly attempting
    // refused changes is slowed sooner than one who only browses. The mark
    // is read at HANDLER level only (mirroring the guard), so no DI is
    // needed here.
    {
      name: DEMO_ABUSE_THROTTLER_NAME,
      ttl: abuseTtl,
      limit: abuseLimit,
      generateKey: demoFlatKey,
      skipIf: (context: ExecutionContext) =>
        !isDemoReadOnlyRefusal(
          Reflect.getMetadata(DEMO_READONLY_MARK, context.getHandler()) as
            | DemoReadOnlyMark
            | undefined,
          context.switchToHttp().getRequest<Request>().method,
        ),
    },
  ];
}

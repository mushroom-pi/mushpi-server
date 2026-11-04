import { INestApplication } from '@nestjs/common';

import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import request from 'supertest';

import {
  RATE_LIMIT_SLOW_DOWN_MESSAGE_TEMPLATE,
  formatSlowDownMessage,
} from '../src/common/constants/rate-limit.constants';
import { READONLY_FORBIDDEN_MESSAGE } from '../src/common/constants/readonly.constants';

/**
 * Demo rate limiting (e2e) — the three always-on throttler definitions of a
 * `NODE_ENV=demo` boot, built from the six rate-limit env pairs
 * (`VISITOR_*`, `ABUSE_*`, `GLOBAL_*`):
 *
 * - the UNNAMED per-visitor browse pace (fills the `default` slot; plain
 *   `X-RateLimit-*` / `Retry-After` headers; tracker = `req.ip`, i.e. the
 *   visitor's own forwarded identity under the demo-only single-hop proxy
 *   trust);
 * - the named `demo-global` backstop (constant tracker ⇒ one bucket for the
 *   whole instance; suffixed headers);
 * - the named `demo-abuse` limiter (per visitor, enforced ONLY on requests
 *   the demo read-only guard would refuse; suffixed headers).
 *
 * The 429 body contract pinned here: `statusCode`/`error`/`emitter` keep the
 * historical explicit-body shape, and the `message` carries the server's own
 * slow-down sentence — `formatSlowDownMessage(<the blocking bucket's
 * Retry-After seconds>)`, the real remaining block window, never a fixed
 * figure. Non-demo boots keep the historical `message: 'Too many requests'`
 * body byte-for-byte — pinned in `rate-limit-headers.e2e-spec.ts`.
 *
 * WINDOW-SIZE DISCIPLINE (the library re-sorts definitions by ASCENDING ttl
 * at init): when the test must see the 429 come from a specific definition,
 * that definition's window is strictly SMALLER than the others so it is
 * evaluated first — with equal windows, ties fall in declaration order
 * (visitor, global, abuse) and the visitor bucket would throw first. Recovery
 * scenarios use short windows and sleep past them — the library self-heals a
 * blocked bucket on the first request after `blockDuration` (default = the
 * window), no restart involved.
 *
 * Every scenario boots its OWN demo app (fresh in-memory throttler storage
 * and fresh module-registry generation): env vars are set BEFORE
 * `jest.resetModules()` + dynamic `test-setup` import — the Joi import-time
 * freeze — and every boot uses throwaway `SQLITE_PATH`/`LOGS_PATH` under
 * `/tmp/opencode`, never live data. `/health` and announce skips are marked
 * by throttler NAME, so they are inert on non-demo boots — pinned in
 * `rate-limit-headers.e2e-spec.ts`.
 */

const DEMO_SECRET = 'e2e-demo-secret';
const OPENCODE_TMP = '/tmp/opencode/mushpi-demo-rate-limit-e2e';
const SQLITE_PATH = join(OPENCODE_TMP, 'demo-rate.sqlite');
const LOGS_PATH = join(OPENCODE_TMP, 'logs');

const ENV_KEYS = [
  'NODE_ENV',
  'PICO_ANNOUNCE_SECRET',
  'SQLITE_PATH',
  'UPLOAD_DIR',
  'LOGS_PATH',
  'LOGS_LEVEL',
  'SEED_ENABLED',
  'MAX_REQUESTS',
  'MAX_REQUESTS_TIME',
  'VISITOR_MAX_REQUESTS',
  'VISITOR_MAX_REQUESTS_TIME',
  'ABUSE_MAX_REQUESTS',
  'ABUSE_MAX_REQUESTS_TIME',
  'GLOBAL_MAX_REQUESTS',
  'GLOBAL_MAX_REQUESTS_TIME',
] as const;

const originalEnv: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) originalEnv[key] = process.env[key];

/**
 * Permissive defaults: nothing may interfere with the scenario under test —
 * only the scenario's own pair is tightened via `limits`. Values are strings:
 * they must be set BEFORE the module import so Joi coerces them to numbers
 * (a post-import assignment would fall through to the live uncoerced env and
 * the demo factory would throw — by design).
 */
const DEFAULT_LIMITS = {
  VISITOR_MAX_REQUESTS: '10000',
  VISITOR_MAX_REQUESTS_TIME: '60000',
  ABUSE_MAX_REQUESTS: '10000',
  ABUSE_MAX_REQUESTS_TIME: '60000',
  GLOBAL_MAX_REQUESTS: '100000',
  GLOBAL_MAX_REQUESTS_TIME: '60000',
};

interface DemoLaunch {
  app: INestApplication;
  close: () => Promise<void>;
}

async function launchDemo(
  limits: Partial<Record<keyof typeof DEFAULT_LIMITS, string>> = {},
): Promise<DemoLaunch> {
  process.env.NODE_ENV = 'demo';
  process.env.PICO_ANNOUNCE_SECRET = DEMO_SECRET;
  process.env.SQLITE_PATH = SQLITE_PATH;
  process.env.UPLOAD_DIR = join(OPENCODE_TMP, 'uploads');
  process.env.LOGS_PATH = LOGS_PATH;
  process.env.LOGS_LEVEL = 'silent';
  // Demo seeding defaults ON in the demo profile; this suite's subject is
  // the limiter wiring, not the catalogue — force seeding off so the
  // several demo boots stay lean. Coverage: `seed.e2e-spec.ts`.
  process.env.SEED_ENABLED = 'false';
  // The historical opt-in pair is deliberately IGNORED inside demo (the
  // visitor definition fills the `default` slot) — a stray shell value must
  // not confuse the boot.
  delete process.env.MAX_REQUESTS;
  delete process.env.MAX_REQUESTS_TIME;
  for (const [key, fallback] of Object.entries(DEFAULT_LIMITS)) {
    process.env[key] = limits[key as keyof typeof DEFAULT_LIMITS] ?? fallback;
  }

  // Fresh throwaway database per scenario; announce scenarios must not see
  // rows from earlier ones. (No app holds the file open: previous apps are
  // closed in their own afterAll before this runs.)
  mkdirSync(OPENCODE_TMP, { recursive: true });
  rmSync(SQLITE_PATH, { force: true });

  jest.resetModules();
  const setup = await import('./test-setup');
  // A demo boot under jest runs ProtectEventLoopMiddleware (armed whenever
  // NODE_ENV is not `test`) with the library default — the busy test worker
  // then reads as an overloaded hub and requests 503. Raise the threshold on
  // the same singleton the middleware requires, and stop its timer on close.
  const toobusy = (await import('toobusy-js')).default;
  toobusy.maxLag(Number.MAX_SAFE_INTEGER);
  const app = await setup.createTestApp();
  await app.init();
  return {
    app,
    close: async () => {
      await setup.closeTestApp(app);
      toobusy.shutdown();
    },
  };
}

function restoreOriginalEnv(): void {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
}

const http = (app: INestApplication) => request(app.getHttpServer());

const get = (launched: DemoLaunch, path: string, xff?: string) => {
  const call = http(launched.app).get(path);
  return xff ? call.set('X-Forwarded-For', xff) : call;
};

/** Every header that is present must be a non-negative integer string. */
function expectWellFormedRateLimitHeaders(
  headers: Record<string, string | string[] | undefined>,
): void {
  for (const [name, value] of Object.entries(headers)) {
    if (!/^x-ratelimit-/i.test(name) && !/^retry-after/i.test(name)) continue;
    expect({ [`${name} is a single value`]: Array.isArray(value) }).toEqual({
      [`${name} is a single value`]: false,
    });
    expect(value as string).toMatch(/^\d+$/);
  }
}

function expectNoRateLimitHeaders(
  headers: Record<string, string | string[] | undefined>,
): void {
  const names = Object.keys(headers).filter(
    (name) => /^x-ratelimit-/i.test(name) || /^retry-after/i.test(name),
  );
  expect({ 'no rate-limit/retry headers at all': names }).toEqual({
    'no rate-limit/retry headers at all': [],
  });
}

/**
 * The demo 429 contract: `statusCode`/`error`/`emitter` keep the historical
 * explicit-body shape, and the `message` is the server's own slow-down
 * sentence stating THE REAL WAIT — it must equal `formatSlowDownMessage`
 * applied to the blocking bucket's own `Retry-After` header (`retryAfterName`),
 * the seconds the guard wrote before throwing. Never a fixed figure
 * independent of that header.
 */
function expectSlowDownThrottleBody(
  res: request.Response,
  retryAfterName: string,
): void {
  expect(res.body).toMatchObject({
    statusCode: 429,
    error: 'Too many requests',
    emitter: 'ThrottlerGuard',
  });
  const header = res.headers[retryAfterName];
  expect({
    [`${retryAfterName} is a single value`]: Array.isArray(header),
  }).toEqual({
    [`${retryAfterName} is a single value`]: false,
  });
  expect(header as string).toMatch(/^\d+$/);
  const seconds = Number(header);
  expect(seconds).toBeGreaterThan(0);
  expect(res.body.message).toBe(formatSlowDownMessage(seconds));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Demo rate limiting (e2e)', () => {
  afterAll(() => {
    restoreOriginalEnv();
    rmSync(OPENCODE_TMP, { recursive: true, force: true });
  });

  describe('per-visitor pacing + recovery after the window', () => {
    let launched: DemoLaunch;

    beforeAll(async () => {
      launched = await launchDemo({
        VISITOR_MAX_REQUESTS: '2',
        VISITOR_MAX_REQUESTS_TIME: '2000',
      });
    });
    afterAll(async () => await launched?.close());

    it('paces the visitor to a plain integer Retry-After and the matching wait sentence', async () => {
      const first = await get(launched, '/ping').expect(200);
      expect(first.headers['x-ratelimit-limit']).toBe('2');
      expect(first.headers['x-ratelimit-remaining']).toBe('1');
      expectWellFormedRateLimitHeaders(first.headers);

      const second = await get(launched, '/ping').expect(200);
      expect(second.headers['x-ratelimit-remaining']).toBe('0');

      const blocked = await get(launched, '/ping').expect(429);
      expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
      // the visitor bucket is the unnamed `default` → NO suffixed Retry-After
      expect(blocked.headers['retry-after-demo-global']).toBeUndefined();
      expect(blocked.headers['retry-after-demo-abuse']).toBeUndefined();
      expectSlowDownThrottleBody(blocked, 'retry-after');
    });

    it('serves the visitor again once the window passes — no restart (criterion: gets served again when their pace drops)', async () => {
      // still inside the 2000 ms window of the block above
      await get(launched, '/ping').expect(429);
      await sleep(2400);
      const recovered = await get(launched, '/ping').expect(200);
      // the blocked bucket self-heals and counts this request afresh
      expect(recovered.headers['x-ratelimit-remaining']).toBe('1');
      expectWellFormedRateLimitHeaders(recovered.headers);
    }, 15000);
  });

  describe('the stated wait scales with the blocking window (never a fixed figure)', () => {
    let launched: DemoLaunch;

    beforeAll(async () => {
      // TWO windows, two buckets: visitor browse pace 2000 ms, abuse pace
      // 8000 ms (global stays permissive). blockDuration defaults to the
      // window, so each fresh block's Retry-After is its own window's
      // seconds: 2 for the browse block, 8 for the abuse block.
      launched = await launchDemo({
        VISITOR_MAX_REQUESTS: '2',
        VISITOR_MAX_REQUESTS_TIME: '2000',
        ABUSE_MAX_REQUESTS: '1',
        ABUSE_MAX_REQUESTS_TIME: '8000',
      });
    });
    afterAll(async () => await launched?.close());

    it('two different throttling windows produce two different stated waits', async () => {
      // Browse block: identity A exhausts the 2-per-2000ms visitor pace.
      await get(launched, '/ping', '10.60.0.1').expect(200);
      await get(launched, '/ping', '10.60.0.1').expect(200);
      const browseBlock = await get(launched, '/ping', '10.60.0.1').expect(429);
      expectSlowDownThrottleBody(browseBlock, 'retry-after');

      // Abuse block: identity B trips the 1-per-8000ms abuse pace with two
      // refused POSTs (fresh visitor bucket, so the browse pace passes first).
      const post = () =>
        http(launched.app)
          .post('/v1/batches')
          .set('X-Forwarded-For', '10.60.0.2')
          .send({});
      const refused = await post();
      expect(refused.status).toBe(403);
      const abuseBlock = await post();
      expect(abuseBlock.status).toBe(429);
      expectSlowDownThrottleBody(abuseBlock, 'retry-after-demo-abuse');

      // Each sentence states ITS OWN header's figure — and the two figures
      // differ (2 vs 8), so nothing is a hard-coded constant dressed up as
      // a wait. The template is the single approved wording; only the
      // {seconds} substitution differs between the two blocks.
      const browseSeconds = browseBlock.headers['retry-after'] as string;
      const abuseSeconds = abuseBlock.headers[
        'retry-after-demo-abuse'
      ] as string;
      expect(browseBlock.body.message).toBe(
        RATE_LIMIT_SLOW_DOWN_MESSAGE_TEMPLATE.replace(
          '{seconds}',
          browseSeconds,
        ),
      );
      expect(abuseBlock.body.message).toBe(
        RATE_LIMIT_SLOW_DOWN_MESSAGE_TEMPLATE.replace(
          '{seconds}',
          abuseSeconds,
        ),
      );
      expect(browseSeconds).toBe('2');
      expect(abuseSeconds).toBe('8');
      expect(browseBlock.body.message).not.toBe(abuseBlock.body.message);
    }, 15000);
  });

  describe('a second forwarded identity is unaffected', () => {
    let launched: DemoLaunch;

    beforeAll(async () => {
      launched = await launchDemo({
        VISITOR_MAX_REQUESTS: '2',
        VISITOR_MAX_REQUESTS_TIME: '60000',
      });
    });
    afterAll(async () => await launched?.close());

    it('exhausting one visitor bucket does not slow another (criterion 4)', async () => {
      await get(launched, '/ping', '10.50.0.1').expect(200);
      await get(launched, '/ping', '10.50.0.1').expect(200);
      await get(launched, '/ping', '10.50.0.1').expect(429);

      const untouched = await get(launched, '/ping', '10.50.0.2').expect(200);
      expect(untouched.headers['x-ratelimit-remaining']).toBe('1');
      expect(untouched.headers['retry-after']).toBeUndefined();
    });
  });

  describe('abuse limiter is stricter than browsing (criterion 6)', () => {
    const ABUSER = '10.30.0.1';
    let launched: DemoLaunch;

    beforeAll(async () => {
      // abuse window STRICTLY smaller than visitor/global: the library
      // re-sorts by ascending ttl, so the abuse bucket is evaluated first
      // and its suffixed headers are what a client sees on the block.
      launched = await launchDemo({
        VISITOR_MAX_REQUESTS: '1000',
        VISITOR_MAX_REQUESTS_TIME: '60000',
        ABUSE_MAX_REQUESTS: '2',
        ABUSE_MAX_REQUESTS_TIME: '3000',
        GLOBAL_MAX_REQUESTS: '100000',
        GLOBAL_MAX_REQUESTS_TIME: '60000',
      });
    });
    afterAll(async () => await launched?.close());

    const postBatch = (xff: string) =>
      http(launched.app)
        .post('/v1/batches')
        .set('X-Forwarded-For', xff)
        .send({});

    it('refused POSTs are 403s carrying rate-limit headers, and the abuse bucket counts down', async () => {
      const first = await postBatch(ABUSER);
      expect(first.status).toBe(403);
      expect(first.body.message).toBe(READONLY_FORBIDDEN_MESSAGE);
      expect(first.headers['x-ratelimit-limit-demo-abuse']).toBe('2');
      expect(first.headers['x-ratelimit-remaining-demo-abuse']).toBe('1');
      expectWellFormedRateLimitHeaders(first.headers);

      const second = await postBatch(ABUSER);
      expect(second.status).toBe(403);
      expect(second.headers['x-ratelimit-remaining-demo-abuse']).toBe('0');
    });

    it('the next refused POST is 429 on the ABUSE bucket, not the browse pace', async () => {
      const blocked = await postBatch(ABUSER);
      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after-demo-abuse']).toMatch(/^\d+$/);
      // the visitor pace is nowhere near exhausted → no plain Retry-After
      expect(blocked.headers['retry-after']).toBeUndefined();
      expectSlowDownThrottleBody(blocked, 'retry-after-demo-abuse');
    });

    it('the same visitor keeps browsing — GETs are never counted by the abuse bucket', async () => {
      const browsing = await get(launched, '/ping', ABUSER).expect(200);
      expect(browsing.headers['x-ratelimit-remaining']).toBeDefined();
      expectWellFormedRateLimitHeaders(browsing.headers);
      // skipIf skipped the abuse throttler → no abuse suffix headers at all
      expect(browsing.headers['x-ratelimit-limit-demo-abuse']).toBeUndefined();
    });

    it('a pure GET-hammerer past the same request count is NOT 429d (scoping bites both ways)', async () => {
      // abuse limit is 2; this visitor does 5 GETs — well past it — and must
      // only ever face the (1000) browse budget.
      for (let i = 0; i < 5; i++) {
        const res = await get(launched, '/ping', '10.30.0.9').expect(200);
        expect(res.headers['retry-after-demo-abuse']).toBeUndefined();
        expect(res.headers['x-ratelimit-limit-demo-abuse']).toBeUndefined();
      }
    });
  });

  describe('announce survives a whole-demo flood', () => {
    let launched: DemoLaunch;

    beforeAll(async () => {
      launched = await launchDemo({
        GLOBAL_MAX_REQUESTS: '3',
        GLOBAL_MAX_REQUESTS_TIME: '60000',
      });
    });
    afterAll(async () => await launched?.close());

    it('exhausts the backstop with two identities, then a valid announce still succeeds', async () => {
      // spread across identities so the visitor pace never throws first
      await get(launched, '/ping', '10.40.0.1').expect(200); // global 1
      await get(launched, '/ping', '10.40.0.2').expect(200); // global 2
      await get(launched, '/ping', '10.40.0.1').expect(200); // global 3
      const flood = await get(launched, '/ping', '10.40.0.2').expect(429); // global 4 > 3
      expect(flood.headers['retry-after-demo-global']).toMatch(/^\d+$/);
      // the backstop is named → NO plain Retry-After
      expect(flood.headers['retry-after']).toBeUndefined();
      expectSlowDownThrottleBody(flood, 'retry-after-demo-global');

      // Announcement is skipped from the backstop and the abuse limiter by
      // NAME — simulated units announce through the flood. The arrival shape
      // here is the simulated unit's true one: direct (no forwarded header)
      // from beside the server — which the demo accepts while it refuses
      // proxy-carried attempts outright. The visitor pace still counts it
      // (the socket identity spent 1 of 10000).
      const announced = await http(launched.app)
        .post('/v1/pico-units/announce')
        .set('X-Pico-Secret', DEMO_SECRET)
        .send({ handle: 'flood-announced-unit', ip: '127.0.0.1', port: 5000 });
      expect(announced.status).toBe(201);
      expect(announced.body.handle).toBe('flood-announced-unit');
    });
  });

  describe('backstop recovers without a restart (criterion 8)', () => {
    let launched: DemoLaunch;

    beforeAll(async () => {
      launched = await launchDemo({
        GLOBAL_MAX_REQUESTS: '2',
        GLOBAL_MAX_REQUESTS_TIME: '2000',
      });
    });
    afterAll(async () => await launched?.close());

    it('slows the whole instance, then returns to normal once the window passes', async () => {
      await get(launched, '/ping', '10.45.0.1').expect(200); // global 1
      await get(launched, '/ping', '10.45.0.2').expect(200); // global 2
      const blocked = await get(launched, '/ping', '10.45.0.1').expect(429); // 3 > 2
      expect(blocked.headers['retry-after-demo-global']).toMatch(/^\d+$/);

      await sleep(2400);
      const recovered = await get(launched, '/ping', '10.45.0.3').expect(200);
      expect(recovered.headers['x-ratelimit-limit-demo-global']).toBe('2');
      expectWellFormedRateLimitHeaders(recovered.headers);
    }, 15000);
  });

  describe('health is never slowed and spends nothing (criterion 9)', () => {
    let launched: DemoLaunch;

    beforeAll(async () => {
      // every limit is tight: two visitor requests, two abuse, three global.
      launched = await launchDemo({
        VISITOR_MAX_REQUESTS: '2',
        VISITOR_MAX_REQUESTS_TIME: '60000',
        ABUSE_MAX_REQUESTS: '2',
        ABUSE_MAX_REQUESTS_TIME: '60000',
        GLOBAL_MAX_REQUESTS: '3',
        GLOBAL_MAX_REQUESTS_TIME: '60000',
      });
    });
    afterAll(async () => await launched?.close());

    it('GET /health hammered past ALL THREE limits stays 200 with zero rate-limit headers', async () => {
      for (let i = 0; i < 8; i++) {
        const res = await get(launched, '/health').expect(200);
        expectNoRateLimitHeaders(res.headers);
      }
    });

    it('nothing was spent from any visitor bucket (full fresh budgets remain)', async () => {
      // visitor limit is 2: the socket identity still holds its FULL budget,
      // proving the health hammer counted for nothing.
      await get(launched, '/ping').expect(200); // visitor 1, global 1
      await get(launched, '/ping').expect(200); // visitor 2, global 2
      await get(launched, '/ping').expect(429); // visitor 3 > 2 → plain block
      // abuse bucket untouched by browsing: refused POSTs still get 403…
      const refused = await http(launched.app)
        .post('/v1/batches')
        .set('X-Forwarded-For', '10.47.0.9')
        .send({});
      expect(refused.status).toBe(403);
      expect(refused.headers['x-ratelimit-limit-demo-abuse']).toBe('2');
      expect(refused.headers['x-ratelimit-remaining-demo-abuse']).toBe('1');
    });
  });

  describe('rightmost-wins X-Forwarded-For (criterion 5)', () => {
    let launched: DemoLaunch;

    beforeAll(async () => {
      launched = await launchDemo({
        VISITOR_MAX_REQUESTS: '2',
        VISITOR_MAX_REQUESTS_TIME: '60000',
      });
    });
    afterAll(async () => await launched?.close());

    it('a two-entry header lands in the RIGHTMOST bucket; the spoofed prefix is inert', async () => {
      // single-hop demo proxy trust: req.ip = the rightmost (proxy-written)
      // address; anything the client prepends is untrusted.
      const first = await get(launched, '/ping', '1.1.1.1, 9.9.9.9').expect(
        200,
      );
      expect(first.headers['x-ratelimit-remaining']).toBe('1');

      // different spoofed prefix, same rightmost ⇒ SAME bucket
      const second = await get(launched, '/ping', '2.2.2.2, 9.9.9.9').expect(
        200,
      );
      expect(second.headers['x-ratelimit-remaining']).toBe('0');

      // escaping by changing the prefix does not work ⇒ bucket exhausted
      const blocked = await get(launched, '/ping', '3.3.3.3, 9.9.9.9').expect(
        429,
      );
      expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
      expectSlowDownThrottleBody(blocked, 'retry-after');
    });

    it('visitors behind the same proxy are told apart by their own address', async () => {
      // same leftmost, different rightmost ⇒ different bucket
      const other = await get(launched, '/ping', '1.1.1.1, 8.8.8.8').expect(
        200,
      );
      expect(other.headers['x-ratelimit-remaining']).toBe('1');
    });
  });
});

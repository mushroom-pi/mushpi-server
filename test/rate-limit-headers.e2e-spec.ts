import { INestApplication } from '@nestjs/common';

import request from 'supertest';

/**
 * Rate-limit response-header behaviour of @nestjs/throttler (installed 6.7.0).
 *
 * Throttling — and therefore the X-RateLimit-* headers — is opt-in: both
 * MAX_REQUESTS and MAX_REQUESTS_TIME must be configured. When they are not,
 * ThrottlerModule.forRootAsync() resolves an EMPTY definitions array, the
 * guard's per-throttler loop never runs, and no rate-limit header is written at
 * all. A response must never carry an `undefined`, `NaN` or empty rate-limit
 * value under any configuration.
 *
 * `/health` is exempt (`@SkipThrottle()`); `/ping` and every application route
 * are throttled when configured.
 *
 * @nestjs/config runs the Joi validation schema once per module-graph import,
 * so each state sets/deletes the env vars BEFORE jest.resetModules() and then
 * dynamically imports the fixture. (An env var assigned after the first import
 * is never coerced to a number — it is read raw from process.env — and the
 * defensive numeric check in app.module.ts then treats it as unconfigured.)
 * Every app is closed between cases so the in-memory throttler storage starts
 * empty each time.
 */
describe('Rate-limit headers (e2e)', () => {
  const hadLimit = 'MAX_REQUESTS' in process.env;
  const hadTime = 'MAX_REQUESTS_TIME' in process.env;
  const originalLimit = process.env.MAX_REQUESTS;
  const originalTime = process.env.MAX_REQUESTS_TIME;

  afterAll(() => {
    if (hadLimit) {
      process.env.MAX_REQUESTS = originalLimit;
    } else {
      delete process.env.MAX_REQUESTS;
    }
    if (hadTime) {
      process.env.MAX_REQUESTS_TIME = originalTime;
    } else {
      delete process.env.MAX_REQUESTS_TIME;
    }
  });

  interface LaunchedApp {
    app: INestApplication;
    close: () => Promise<void>;
  }

  async function launchWithCurrentEnv(): Promise<LaunchedApp> {
    jest.resetModules();
    const setup = await import('./test-setup');
    const app = await setup.createTestApp();
    await app.init();
    return { app, close: () => setup.closeTestApp(app) };
  }

  // supertest lower-cases every header name on the client side
  type Headers = Record<string, string | string[] | undefined>;

  const isRateLimitHeader = (name: string): boolean =>
    /^x-ratelimit-/i.test(name) || /^retry-after$/i.test(name);

  function rateLimitHeaders(headers: Headers): [string, string | string[]][] {
    return Object.entries(headers).filter(([name]) => isRateLimitHeader(name));
  }

  /** Every header that IS present must be a non-negative integer. */
  function expectWellFormedRateLimitHeaders(headers: Headers): void {
    for (const [name, value] of rateLimitHeaders(headers)) {
      expect({ [`${name} is a single value`]: Array.isArray(value) }).toEqual({
        [`${name} is a single value`]: false,
      });

      const header = value as string;
      // explicit rejection of the exact malformed values the bug produced
      expect({
        [`${name} is not the string undefined`]: header === 'undefined',
        [`${name} is not the string NaN`]: header === 'NaN',
        [`${name} is not an empty value`]: header === '',
      }).toEqual({
        [`${name} is not the string undefined`]: false,
        [`${name} is not the string NaN`]: false,
        [`${name} is not an empty value`]: false,
      });

      expect(header).toMatch(/^\d+$/);
    }
  }

  function expectNoRateLimitHeaders(headers: Headers): void {
    // blanket scan: catches any future header name the library may add
    expect(rateLimitHeaders(headers)).toEqual([]);
    for (const name of [
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-reset',
      'retry-after',
    ]) {
      expect({ [`${name} absent`]: headers[name] }).toEqual({
        [`${name} absent`]: undefined,
      });
    }
  }

  function get(app: INestApplication, path: string) {
    return request(app.getHttpServer()).get(path);
  }

  describe('unconfigured (neither MAX_REQUESTS nor MAX_REQUESTS_TIME set)', () => {
    let launched: LaunchedApp;

    beforeEach(async () => {
      delete process.env.MAX_REQUESTS;
      delete process.env.MAX_REQUESTS_TIME;
      launched = await launchWithCurrentEnv();
    });

    afterEach(async () => {
      await launched?.close();
    });

    it('GET /ping is never throttled and emits no rate-limit headers', async () => {
      for (let i = 1; i <= 5; i++) {
        const res = await get(launched.app, '/ping').expect(200);
        expect(res.text).toBe('pong');
        expectNoRateLimitHeaders(res.headers);
        expectWellFormedRateLimitHeaders(res.headers);
      }
    });

    it('GET /health emits no rate-limit headers', async () => {
      const res = await get(launched.app, '/health').expect(200);
      expectNoRateLimitHeaders(res.headers);
      expectWellFormedRateLimitHeaders(res.headers);
    });
  });

  describe('configured (MAX_REQUESTS=2, MAX_REQUESTS_TIME=60000)', () => {
    beforeEach(() => {
      process.env.MAX_REQUESTS = '2';
      process.env.MAX_REQUESTS_TIME = '60000';
    });

    it('GET /ping emits numeric X-RateLimit-* headers and counts down', async () => {
      const launched = await launchWithCurrentEnv();
      try {
        const first = await get(launched.app, '/ping').expect(200);
        expect(first.headers['x-ratelimit-limit']).toBe('2');
        expect(first.headers['x-ratelimit-remaining']).toBe('1');
        expectWellFormedRateLimitHeaders(first.headers);

        const second = await get(launched.app, '/ping').expect(200);
        expect(second.headers['x-ratelimit-limit']).toBe('2');
        expect(second.headers['x-ratelimit-remaining']).toBe('0');
        expectWellFormedRateLimitHeaders(second.headers);

        // window is 60000 ms ⇒ reset is a relative second count (≤ 60)
        expect(Number(second.headers['x-ratelimit-reset'])).toBeGreaterThan(0);
        expect(Number(second.headers['x-ratelimit-reset'])).toBeLessThanOrEqual(
          60,
        );
      } finally {
        await launched.close();
      }
    });

    it('GET /ping past the limit returns 429 with a numeric Retry-After', async () => {
      const launched = await launchWithCurrentEnv();
      try {
        await get(launched.app, '/ping').expect(200);
        await get(launched.app, '/ping').expect(200);

        const blocked = await get(launched.app, '/ping').expect(429);
        expect(blocked.headers['retry-after']).toBeDefined();
        expectWellFormedRateLimitHeaders(blocked.headers);

        // still blocked inside the window, and still well-formed
        const stillBlocked = await get(launched.app, '/ping').expect(429);
        expectWellFormedRateLimitHeaders(stillBlocked.headers);
      } finally {
        await launched.close();
      }
    });

    it('GET /health stays exempt even after the limiter is exhausted', async () => {
      const launched = await launchWithCurrentEnv();
      try {
        await get(launched.app, '/ping').expect(200);
        await get(launched.app, '/ping').expect(200);
        await get(launched.app, '/ping').expect(429);

        const health = await get(launched.app, '/health').expect(200);
        expectNoRateLimitHeaders(health.headers);
      } finally {
        await launched.close();
      }
    });
  });
});

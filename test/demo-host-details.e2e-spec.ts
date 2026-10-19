import { INestApplication } from '@nestjs/common';

import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

/**
 * Demo host-details redaction (e2e).
 *
 * On a `NODE_ENV=demo` boot the Server screen's data source — `GET /health` —
 * withholds host identity: `system.os`, `system.cpu`, `system.disk` and
 * `databases.sqlite.size.path` are omitted from the response (key absent, not
 * null), while health status, environment name, software versions, memory and
 * uptime stay visible so the operator's health check still reports. Visitor-
 * readable error bodies fall back to `emitter: 'unknown'` instead of a
 * stack-derived fragment that could leak a filesystem path. On every other
 * boot these shapes are unchanged (guarded by `monitoring.e2e-spec.ts`).
 *
 * Boot pattern mirrors `demo-readonly.e2e-spec.ts`: `@nestjs/config` runs the
 * Joi validation once per module-graph import, so `process.env` is set BEFORE
 * `jest.resetModules()` and the fixture is dynamically imported afterwards.
 * A demo boot reads `.env` (envFilePath only switches to `.env.test` when
 * `NODE_ENV` is `test`), so `SQLITE_PATH=':memory:'` must be set explicitly —
 * process.env assignments win over file values. The three demo throttle pairs
 * are REQUIRED on a demo boot (Joi required-when-demo); generous limits keep
 * every request below the rate limiter, and the historical MAX_REQUESTS pair
 * is deleted so a stray shell value cannot confuse the boot.
 */
const DEMO_SECRET = 'e2e-demo-secret';
const DEMO_LOGS_PATH = join(
  tmpdir(),
  'mushpi-server-e2e-demo-host-details-logs',
);

const ENV_KEYS = [
  'NODE_ENV',
  'PICO_ANNOUNCE_SECRET',
  'SQLITE_PATH',
  'UPLOAD_DIR',
  'LOGS_PATH',
  'LOGS_LEVEL',
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

function applyDemoEnv(): void {
  process.env.NODE_ENV = 'demo';
  process.env.PICO_ANNOUNCE_SECRET = DEMO_SECRET;
  process.env.SQLITE_PATH = ':memory:';
  process.env.UPLOAD_DIR = 'test/data-test';
  // A demo boot enables dual log outputs (stdout + rolling file) — keep it
  // off the real `data/logs` destination and quiet in the test report.
  process.env.LOGS_PATH = DEMO_LOGS_PATH;
  process.env.LOGS_LEVEL = 'silent';
  process.env.VISITOR_MAX_REQUESTS = '10000';
  process.env.VISITOR_MAX_REQUESTS_TIME = '60000';
  process.env.ABUSE_MAX_REQUESTS = '10000';
  process.env.ABUSE_MAX_REQUESTS_TIME = '60000';
  process.env.GLOBAL_MAX_REQUESTS = '100000';
  process.env.GLOBAL_MAX_REQUESTS_TIME = '60000';
  delete process.env.MAX_REQUESTS;
  delete process.env.MAX_REQUESTS_TIME;
}

function restoreOriginalEnv(): void {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
}

const http = (app: INestApplication) => request(app.getHttpServer());

describe('Demo host-details redaction (e2e)', () => {
  let app: INestApplication;
  let close: () => Promise<void>;

  beforeAll(async () => {
    applyDemoEnv();
    jest.resetModules();
    // All dynamic imports after the reset share one generation with the app
    // graph that `test-setup` pulls in.
    const setup = await import('./test-setup');
    // `toobusy.maxLag()` is configured in `main.ts` only, so a demo boot under
    // jest runs `ProtectEventLoopMiddleware` (armed whenever NODE_ENV is not
    // `test`) with the library default — the busy test worker then reads as an
    // overloaded hub and requests 503. Raise the threshold on the same
    // singleton the middleware requires, and stop its timer on close.
    const toobusy = (await import('toobusy-js')).default;
    toobusy.maxLag(Number.MAX_SAFE_INTEGER);
    app = await setup.createTestApp();
    await app.init();
    close = async () => {
      await setup.closeTestApp(app);
      toobusy.shutdown();
    };
  });

  afterAll(async () => {
    await close?.();
    restoreOriginalEnv();
  });

  describe('GET /health — redacted shape', () => {
    it('keeps server status, environment and versions visible', async () => {
      const res = await http(app).get('/health').expect(200);

      expect(res.body.server.healthy).toBe(true);
      expect(res.body.server.environment).toBe('demo');
      expect(typeof res.body.server.appVersion).toBe('string');
      expect(typeof res.body.server.nodeVersion).toBe('string');
    });

    it('omits the system os/cpu/disk keys while memory and upTime stay', async () => {
      const res = await http(app).get('/health').expect(200);

      expect(res.body).toHaveProperty('system');
      expect(res.body.system).toHaveProperty('memory');
      expect(res.body.system).toHaveProperty('upTime');
      expect(typeof res.body.system.memory.totalMb).toBe('number');
      expect(typeof res.body.system.upTime.seconds).toBe('number');

      expect(res.body.system).not.toHaveProperty('os');
      expect(res.body.system).not.toHaveProperty('cpu');
      expect(res.body.system).not.toHaveProperty('disk');
    });

    it('keeps the size figures but omits the database file path', async () => {
      const res = await http(app).get('/health').expect(200);

      const sqlite = res.body.databases.sqlite;
      expect(typeof sqlite.read).toBe('boolean');
      expect(typeof sqlite.write).toBe('boolean');

      expect(sqlite).toHaveProperty('size');
      expect(sqlite.size).toHaveProperty('totalMb');
      expect(sqlite.size).toHaveProperty('overheadMb');
      expect(sqlite.size.tables).toBeInstanceOf(Array);

      expect(sqlite.size).not.toHaveProperty('path');
    });
  });

  describe('GET /health — query gates keep working on demo', () => {
    it('omits system when system=false', async () => {
      const res = await http(app)
        .get('/health')
        .query({ system: 'false' })
        .expect(200);
      expect(res.body).not.toHaveProperty('system');
    });

    it('omits databases and services when both are none', async () => {
      const res = await http(app)
        .get('/health')
        .query({ databases: 'none', services: 'none' })
        .expect(200);
      expect(res.body).not.toHaveProperty('databases');
      expect(res.body).not.toHaveProperty('services');
    });

    it('omits server when server=false', async () => {
      const res = await http(app)
        .get('/health')
        .query({ server: 'false' })
        .expect(200);
      expect(res.body).not.toHaveProperty('server');
    });
  });

  describe('GET /ping — unchanged liveness', () => {
    it('still answers pong on a demo boot', async () => {
      const res = await http(app).get('/ping').expect(200);
      expect(res.text).toBe('pong');
    });
  });

  describe('error bodies — the emitter fallback never leaks a path', () => {
    // Both probes reach the filter's fallback (the exception's own response
    // carries no emitter). Un-gated, `getEmitter()` derives a fragment from
    // the throwing stack frame, which is an anonymous path frame in compiled
    // code (`at /app/dist/src/foo.js:1:2` → `/app/dist/src/foo`). On demo the
    // fallback must answer `unknown` — no directory separator in any form.
    const expectPathFreeEmitter = (body: Record<string, unknown>) => {
      expect(typeof body.emitter).toBe('string');
      expect(body.emitter).not.toMatch(/[/\\]/);
      expect(body.emitter).toBe('unknown');
    };

    it('404 for a nonexistent unit id carries a path-free emitter', async () => {
      const res = await http(app).get('/v1/pico-units/999999').expect(404);
      expectPathFreeEmitter(res.body);
    });

    it('422 for a malformed unit id carries a path-free emitter', async () => {
      const res = await http(app)
        .get('/v1/pico-units/not-a-number')
        .expect(422);
      expectPathFreeEmitter(res.body);
    });
  });
});

import { INestApplication } from '@nestjs/common';

import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import request from 'supertest';

import { PICO_ANNOUNCE_REFUSED_MESSAGE } from '../src/common/constants/pico-announce.constants';
import { clearPicoUnits, getPicoRepo } from './fixtures/pico-units.fixtures';

/**
 * Demo announce refusal (e2e) — on a `NODE_ENV=demo` boot the announce
 * endpoint accepts only INTERNAL callers (a direct, header-less request from
 * the server's own network — the simulated unit's arrival shape) and refuses
 * externally-originated attempts outright BEFORE the secret is compared.
 * Self-hosted boots keep the historical secret-only path byte-for-byte.
 *
 * Harness discipline copied from `demo-rate-limit.e2e-spec.ts`: every
 * scenario boots its OWN app (fresh module-registry generation) with env
 * vars set BEFORE `jest.resetModules()` + dynamic `test-setup` import (the
 * Joi import-time freeze), on throwaway `SQLITE_PATH`/`LOGS_PATH` under
 * `/tmp/opencode` — never live data. Supertest's own socket peer is
 * loopback: an announce WITHOUT `X-Forwarded-For` is exactly the simulated
 * unit's shape, and one WITH a forwarded header is a visitor — even when
 * the address forges loopback, the refusal precedes everything else, so no
 * registration can slip through.
 */

const DEMO_SECRET = 'e2e-demo-secret';
const WRONG_SECRET = 'e2e-wrong-guess';
const OPENCODE_TMP = '/tmp/opencode/mushpi-demo-announce-refusal-e2e';
const SQLITE_PATH = join(OPENCODE_TMP, 'refusal.sqlite');
const LOGS_PATH = join(OPENCODE_TMP, 'logs');

const ENV_KEYS = [
  'NODE_ENV',
  'PICO_ANNOUNCE_SECRET',
  'SQLITE_PATH',
  'UPLOAD_DIR',
  'LOGS_PATH',
  'LOGS_LEVEL',
  'MAX_REQUESTS',
  'MAX_REQUESTS_TIME',
  'DEMO_VISITOR_MAX_REQUESTS',
  'DEMO_VISITOR_MAX_REQUESTS_TIME',
  'DEMO_ABUSE_MAX_REQUESTS',
  'DEMO_ABUSE_MAX_REQUESTS_TIME',
  'DEMO_GLOBAL_MAX_REQUESTS',
  'DEMO_GLOBAL_MAX_REQUESTS_TIME',
] as const;

const originalEnv: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) originalEnv[key] = process.env[key];

/**
 * Permissive pace values: the throttler buckets must never interfere with
 * the arrival gate under test. (The announce endpoint is a write the demo
 * read-only guard explicitly exempts, so it reaches this guard in all
 * cases.)
 */
const DEFAULT_LIMITS = {
  DEMO_VISITOR_MAX_REQUESTS: '10000',
  DEMO_VISITOR_MAX_REQUESTS_TIME: '60000',
  DEMO_ABUSE_MAX_REQUESTS: '10000',
  DEMO_ABUSE_MAX_REQUESTS_TIME: '60000',
  DEMO_GLOBAL_MAX_REQUESTS: '100000',
  DEMO_GLOBAL_MAX_REQUESTS_TIME: '60000',
};

interface Launched {
  app: INestApplication;
  close: () => Promise<void>;
}

function applyBaseEnv(sqlitePath: string): void {
  mkdirSync(OPENCODE_TMP, { recursive: true });
  rmSync(sqlitePath, { force: true });
  process.env.PICO_ANNOUNCE_SECRET = DEMO_SECRET;
  process.env.SQLITE_PATH = sqlitePath;
  process.env.UPLOAD_DIR = join(OPENCODE_TMP, 'uploads');
  process.env.LOGS_PATH = LOGS_PATH;
  process.env.LOGS_LEVEL = 'silent';
  // The historical opt-in pair is ignored inside demo and unopted for the
  // hub — delete so a stray shell value cannot confuse any boot here.
  delete process.env.MAX_REQUESTS;
  delete process.env.MAX_REQUESTS_TIME;
}

async function launchDemo(): Promise<Launched> {
  process.env.NODE_ENV = 'demo';
  applyBaseEnv(SQLITE_PATH);
  for (const [key, value] of Object.entries(DEFAULT_LIMITS)) {
    process.env[key] = value;
  }

  jest.resetModules();
  const setup = await import('./test-setup');
  // A demo boot under jest runs ProtectEventLoopMiddleware (armed whenever
  // NODE_ENV is not `test`) with the library default — raise the threshold
  // on the singleton the middleware requires, and stop its timer on close.
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

/** A self-hosted boot — the gate must be structurally unreachable. */
async function launchHub(): Promise<Launched> {
  process.env.NODE_ENV = 'test';
  applyBaseEnv(join(OPENCODE_TMP, 'hub.sqlite'));
  for (const key of Object.keys(DEFAULT_LIMITS)) {
    delete process.env[key];
  }

  jest.resetModules();
  const setup = await import('./test-setup');
  const app = await setup.createTestApp();
  await app.init();
  return { app, close: () => setup.closeTestApp(app) };
}

function restoreOriginalEnv(): void {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
}

interface AnnounceOptions {
  secret?: string;
  xff?: string;
  handle: string;
  port?: number;
}

function announce(launched: Launched, opts: AnnounceOptions) {
  const call = http(launched.app).post('/v1/pico-units/announce');
  if (opts.secret !== undefined) call.set('X-Pico-Secret', opts.secret);
  if (opts.xff !== undefined) call.set('X-Forwarded-For', opts.xff);
  return call.send({
    handle: opts.handle,
    ip: '127.0.0.1',
    port: opts.port ?? 5000,
  });
}

const http = (app: INestApplication) => request(app.getHttpServer());

/** The demo refusal shape: explicit body naming this guard as emitter. */
function expectRefusal(res: request.Response): void {
  expect(res.status).toBe(403);
  expect(res.body).toMatchObject({
    statusCode: 403,
    error: 'Forbidden',
    message: PICO_ANNOUNCE_REFUSED_MESSAGE,
    emitter: 'PicoAnnounceSecretGuard',
  });
}

describe('Demo announce refusal (e2e)', () => {
  afterAll(() => {
    restoreOriginalEnv();
    rmSync(OPENCODE_TMP, { recursive: true, force: true });
  });

  describe('demo boot — externally-originated announces are refused outright', () => {
    let launched: Launched;

    beforeAll(async () => {
      launched = await launchDemo();
    });
    afterAll(async () => await launched?.close());
    beforeEach(async () => {
      await clearPicoUnits(launched.app);
    });

    it('refuses a forwarded announce carrying the CORRECT secret, and registers nothing', async () => {
      const res = await announce(launched, {
        secret: DEMO_SECRET,
        xff: '10.70.0.1',
        handle: 'external-announcer',
      });
      expectRefusal(res);

      // A refused announce never reaches the data path: no unit appears.
      const repo = await getPicoRepo(launched.app);
      expect(await repo.findOneBy({ handle: 'external-announcer' })).toBeNull();
      expect(await repo.count()).toBe(0);
    });

    it('refuses a forwarded announce with NO secret — 403, not 401 (the refusal precedes the comparison)', async () => {
      const res = await announce(launched, {
        xff: '10.70.0.2',
        handle: 'no-secret-visitor',
      });
      expectRefusal(res);

      const repo = await getPicoRepo(launched.app);
      expect(await repo.findOneBy({ handle: 'no-secret-visitor' })).toBeNull();
    });

    it('keeps the secret gate for the direct local caller: correct secret upserts, wrong secret stays a 401', async () => {
      // Supertest's own loopback socket, no forwarded header — the
      // simulated unit's arrival shape.
      const ok = await announce(launched, {
        secret: DEMO_SECRET,
        handle: 'simulated-unit',
      });
      expect(ok.status).toBe(201);
      expect(ok.body.handle).toBe('simulated-unit');

      const repo = await getPicoRepo(launched.app);
      expect(await repo.findOneBy({ handle: 'simulated-unit' })).not.toBeNull();

      // The secret check still governs internal callers — defence in depth.
      const wrong = await announce(launched, {
        secret: WRONG_SECRET,
        handle: 'simulated-unit-2',
      });
      expect(wrong.status).toBe(401);
      expect(await repo.findOneBy({ handle: 'simulated-unit-2' })).toBeNull();
    });
  });

  describe('self-hosted boot — nothing is refused', () => {
    let launched: Launched;

    beforeAll(async () => {
      launched = await launchHub();
    });
    afterAll(async () => await launched?.close());

    it('serves a forwarded announce with the correct secret exactly as before (201)', async () => {
      const res = await announce(launched, {
        secret: DEMO_SECRET,
        xff: '10.99.0.1',
        handle: 'hub-announced-unit',
      });
      expect(res.status).toBe(201);
      expect(res.body.handle).toBe('hub-announced-unit');
    });

    it('keeps the historical 401 for a missing secret', async () => {
      const res = await announce(launched, {
        xff: '10.99.0.2',
        handle: 'hub-no-secret',
      });
      expect(res.status).toBe(401);
    });
  });
});

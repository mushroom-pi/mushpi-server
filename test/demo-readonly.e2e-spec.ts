import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import axios from 'axios';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { Repository } from 'typeorm';

import { DEMO_READONLY_FORBIDDEN_MESSAGE } from '../src/common/constants/demo-readonly.constants';
import { Batch } from '../src/modules/batches/batches.entity';
import { PicoUnit } from '../src/modules/pico-units/pico-unit.entity';
import { Readings } from '../src/modules/readings/readings.entity';
import { Recipe } from '../src/modules/recipes/recipes.entity';
import { Settings } from '../src/modules/settings/settings.entity';
import { clearBatches, seedBatch } from './fixtures/batches.fixtures';
import { clearPicoUnits, seedPicoUnit } from './fixtures/pico-units.fixtures';
import { clearRecipes, seedRecipe } from './fixtures/recipes.fixtures';

/**
 * Demo read-only guard (e2e).
 *
 * On a `NODE_ENV=demo` boot every request whose method is not safe
 * (GET/HEAD/OPTIONS) is refused with 403 unless the handler carries
 * `@DemoReadOnlyExempt()`; a safe-method handler that writes persisted data
 * carries `@DemoReadOnlyRefused()` and is refused too. On every other boot
 * the guard is inert.
 *
 * @nestjs/config runs the Joi validation once per module-graph import, so
 * each boot sets `process.env` BEFORE `jest.resetModules()` and then
 * dynamically imports the fixture (the `rate-limit-headers.e2e-spec.ts`
 * pattern). Two generation-sensitive details this encodes:
 *
 * - A demo boot reads `.env` (envFilePath only switches to `.env.test` when
 *   `NODE_ENV` is `test`), whose `SQLITE_PATH` points at the on-disk
 *   database — `SQLITE_PATH=':memory:'` must therefore be set explicitly
 *   before import; process.env assignments win over file values.
 * - The axios automock is a fresh object per module-registry generation, so
 *   "axios was never called" assertions run against the *app generation's*
 *   mock returned from `launchDemo()`, never against this file's static
 *   import (that one would trivially have zero calls — vacuous).
 *
 * Repository tokens survive the reset: `getRepositoryToken` returns a
 * name-based string (`Repository_PicoUnit` form), so statically imported
 * fixtures work against apps from later generations. `SettingsService`
 * (class token) is deliberately not used for cache resets here.
 */
jest.mock('axios');

const DEMO_SECRET = 'e2e-demo-secret';
const DEMO_LOGS_PATH = join(tmpdir(), 'mushpi-server-e2e-demo-logs');

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
 * Synchronous repository access for an app. Generation-safe: TypeORM's
 * repository token is the entity's NAME-based string (`PicoUnitRepository`
 * form), so statically imported entity classes address providers registered
 * by a later module-registry generation identically.
 */
function repos(app: INestApplication) {
  return {
    picoRepo: () => app.get<Repository<PicoUnit>>(getRepositoryToken(PicoUnit)),
    batchRepo: () => app.get<Repository<Batch>>(getRepositoryToken(Batch)),
    recipeRepo: () => app.get<Repository<Recipe>>(getRepositoryToken(Recipe)),
    readingsRepo: () =>
      app.get<Repository<Readings>>(getRepositoryToken(Readings)),
    settingsRepo: () =>
      app.get<Repository<Settings>>(getRepositoryToken(Settings)),
  };
}

interface DemoLaunch extends ReturnType<typeof repos> {
  app: INestApplication;
  close: () => Promise<void>;
  /** The app generation's axios automock — assert "never called" on this. */
  axiosMock: jest.Mocked<typeof axios>;
}

async function launchDemo(
  extraEnv: Record<string, string> = {},
): Promise<DemoLaunch> {
  process.env.NODE_ENV = 'demo';
  process.env.PICO_ANNOUNCE_SECRET = DEMO_SECRET;
  process.env.SQLITE_PATH = ':memory:';
  process.env.UPLOAD_DIR = 'test/data-test';
  // A demo boot enables dual log outputs (stdout + rolling file) — keep it
  // off the real `data/logs` destination and quiet in the test report.
  process.env.LOGS_PATH = DEMO_LOGS_PATH;
  process.env.LOGS_LEVEL = 'silent';
  // The three demo throttle pairs are REQUIRED on a demo boot (Joi
  // required-when-demo). Generous defaults keep every refusal case below
  // about the read-only guard, not pacing; only the pace-budget boot
  // tightens the visitor pair explicitly. The historical MAX_REQUESTS pair
  // is deliberately IGNORED inside demo — delete it so a stray shell value
  // cannot confuse the boot, and pin that the visitor definition (which
  // fills the `default` slot) is what emits the plain X-RateLimit-* headers.
  const demoLimitDefaults: Record<string, string> = {
    DEMO_VISITOR_MAX_REQUESTS: '10000',
    DEMO_VISITOR_MAX_REQUESTS_TIME: '60000',
    DEMO_ABUSE_MAX_REQUESTS: '10000',
    DEMO_ABUSE_MAX_REQUESTS_TIME: '60000',
    DEMO_GLOBAL_MAX_REQUESTS: '100000',
    DEMO_GLOBAL_MAX_REQUESTS_TIME: '60000',
  };
  for (const [key, fallback] of Object.entries(demoLimitDefaults)) {
    process.env[key] = extraEnv[key] ?? fallback;
  }
  delete process.env.MAX_REQUESTS;
  delete process.env.MAX_REQUESTS_TIME;

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
  const axiosGeneration = (await import('axios'))
    .default as unknown as jest.Mocked<typeof axios>;
  const app = await setup.createTestApp();
  await app.init();
  return {
    app,
    close: async () => {
      await setup.closeTestApp(app);
      toobusy.shutdown();
    },
    axiosMock: axiosGeneration,
    ...repos(app),
  };
}

function restoreOriginalEnv(): void {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
}

const http = (app: INestApplication) => request(app.getHttpServer());

/** Every demo refusal shares this body (errorsDetail is on outside prod). */
function expectReadOnlyRefusal(res: request.Response): void {
  expect(res.status).toBe(403);
  expect(res.body).toMatchObject({
    statusCode: 403,
    error: 'Forbidden',
    message: DEMO_READONLY_FORBIDDEN_MESSAGE,
    emitter: 'DemoReadOnlyGuard',
  });
}

describe('Demo read-only guard (e2e)', () => {
  afterAll(() => {
    restoreOriginalEnv();
  });

  describe('demo boot — refusals', () => {
    let launched: DemoLaunch;
    let app: INestApplication;

    beforeAll(async () => {
      launched = await launchDemo();
      app = launched.app;
    });

    afterAll(async () => {
      await launched?.close();
    });

    beforeEach(async () => {
      await clearPicoUnits(app);
      await clearBatches(app);
      await clearRecipes(app);
      await launched.readingsRepo().clear();
      await launched.settingsRepo().clear();
      launched.axiosMock.get.mockClear();
      launched.axiosMock.post.mockClear();
      launched.axiosMock.put.mockClear();
      launched.axiosMock.request.mockClear();
    });

    const anyAxiosCall = () => [
      launched.axiosMock.get,
      launched.axiosMock.post,
      launched.axiosMock.put,
      launched.axiosMock.request,
    ];

    it('POST /v1/pico-units is refused and reaches neither the unit nor the DB', async () => {
      const res = await http(app)
        .post('/v1/pico-units')
        .send({ handle: 'refused-unit' });
      expectReadOnlyRefusal(res);
      expect(await launched.picoRepo().count()).toBe(0);
      // The mDNS reachability check in the service never ran:
      for (const fn of anyAxiosCall()) expect(fn).not.toHaveBeenCalled();
    });

    it('a malformed body on a refused route is 403, not 422 (guards run before the validation pipe)', async () => {
      const res = await http(app)
        .post('/v1/pico-units')
        .send({ unexpected: true, handle: 123 });
      expectReadOnlyRefusal(res);
    });

    it('PATCH /v1/pico-units/:id is refused and the stored fields are unchanged', async () => {
      const unit = await seedPicoUnit(app, { name: 'Original Name' });
      const res = await http(app)
        .patch(`/v1/pico-units/${unit.id}`)
        .send({ name: 'HACKED' });
      expectReadOnlyRefusal(res);
      const stored = await launched.picoRepo().findOneBy({ id: unit.id });
      expect(stored.name).toBe('Original Name');
    });

    it('DELETE /v1/pico-units/:id is refused and the row survives', async () => {
      const unit = await seedPicoUnit(app);
      const res = await http(app).delete(`/v1/pico-units/${unit.id}`);
      expectReadOnlyRefusal(res);
      expect(
        await launched.picoRepo().findOneBy({ id: unit.id }),
      ).not.toBeNull();
    });

    for (const [route, body] of [
      ['setpoints', { temperature: 21, humidity: 85 }],
      ['outputs', { fan: true, humidifier: false, heater: false }],
      ['setup', { devices: {} }],
      ['loop', { enabled: true }],
    ] as [string, Record<string, unknown>][]) {
      it(`PUT control/${route} is refused without proxying to the unit`, async () => {
        const unit = await seedPicoUnit(app);
        const res = await http(app)
          .put(`/v1/pico-units/${unit.id}/control/${route}`)
          .send(body);
        expectReadOnlyRefusal(res);
        for (const fn of anyAxiosCall()) expect(fn).not.toHaveBeenCalled();
      });
    }

    it('POST poll is refused and stores no reading', async () => {
      const unit = await seedPicoUnit(app);
      const res = await http(app).post(`/v1/pico-units/${unit.id}/poll`);
      expectReadOnlyRefusal(res);
      expect(await launched.readingsRepo().count()).toBe(0);
    });

    it('PUT reboot is refused without posting to the unit', async () => {
      const unit = await seedPicoUnit(app);
      const res = await http(app)
        .put(`/v1/pico-units/${unit.id}/reboot`)
        .send({ delay: 1 });
      expectReadOnlyRefusal(res);
      for (const fn of anyAxiosCall()) expect(fn).not.toHaveBeenCalled();
    });

    it('GET ping is refused despite its safe method (it writes last_seen/failed_calls)', async () => {
      const unit = await seedPicoUnit(app, { last_seen: new Date(0) });
      const res = await http(app).get(`/v1/pico-units/${unit.id}/ping`);
      expectReadOnlyRefusal(res);
      const stored = await launched.picoRepo().findOneBy({ id: unit.id });
      expect(stored.last_seen.getTime()).toBe(new Date(0).getTime());
      for (const fn of anyAxiosCall()) expect(fn).not.toHaveBeenCalled();
    });

    it('POST /v1/batches is refused and stores no batch', async () => {
      const res = await http(app).post('/v1/batches').send({
        species: 'oyster',
        temperature_target: 22,
        humidity_target: 80,
      });
      expectReadOnlyRefusal(res);
      expect(await launched.batchRepo().count()).toBe(0);
    });

    it('PATCH /v1/batches/:batchId is refused and notes are unchanged', async () => {
      const unit = await seedPicoUnit(app);
      const batch = await seedBatch(app, unit.id, { notes: 'original notes' });
      const res = await http(app)
        .patch(`/v1/batches/${batch.id}`)
        .send({ notes: 'HACKED' });
      expectReadOnlyRefusal(res);
      const stored = await launched.batchRepo().findOneBy({ id: batch.id });
      expect(stored.notes).toBe('original notes');
    });

    it('DELETE /v1/batches/:batchId is refused and the row survives', async () => {
      const unit = await seedPicoUnit(app);
      const batch = await seedBatch(app, unit.id);
      const res = await http(app).delete(`/v1/batches/${batch.id}`);
      expectReadOnlyRefusal(res);
      expect(
        await launched.batchRepo().findOneBy({ id: batch.id }),
      ).not.toBeNull();
    });

    it('POST /v1/batches/:batchId/recipe is refused and stores no recipe', async () => {
      const unit = await seedPicoUnit(app);
      const batch = await seedBatch(app, unit.id, {
        finish_at: new Date(),
        species: 'oyster',
        temperature_target: 22,
        humidity_target: 80,
      });
      const res = await http(app).post(`/v1/batches/${batch.id}/recipe`);
      expectReadOnlyRefusal(res);
      expect(await launched.recipeRepo().count()).toBe(0);
    });

    it('PUT /v1/batches/:batchId/images is refused and the stored image list is unchanged', async () => {
      const unit = await seedPicoUnit(app);
      const batch = await seedBatch(app, unit.id);
      const res = await http(app)
        .put(`/v1/batches/${batch.id}/images`)
        .field('caption', 'none');
      expectReadOnlyRefusal(res);
      const stored = await launched.batchRepo().findOneBy({ id: batch.id });
      expect(stored.images).toEqual(batch.images);
    });

    it('DELETE /v1/batches/:batchId/images/:filename is refused and the stored list is unchanged', async () => {
      const unit = await seedPicoUnit(app);
      const batch = await seedBatch(app, unit.id);
      // The seed fixture omits `images` — persist the list directly so the
      // refusal has something to leave untouched.
      await launched.batchRepo().save({ ...batch, images: ['existing.png'] });
      const res = await http(app).delete(
        `/v1/batches/${batch.id}/images/existing.png`,
      );
      expectReadOnlyRefusal(res);
      const stored = await launched.batchRepo().findOneBy({ id: batch.id });
      expect(stored.images).toEqual(['existing.png']);
    });

    it('POST /v1/recipes is refused and stores no recipe', async () => {
      const res = await http(app).post('/v1/recipes').send({
        name: 'R',
        species: 'oyster',
        temperature_target: 22,
        humidity_target: 80,
        duration_days: 14,
      });
      expectReadOnlyRefusal(res);
      expect(await launched.recipeRepo().count()).toBe(0);
    });

    it('PATCH /v1/recipes/:recipeId is refused and the name is unchanged', async () => {
      const recipe = await seedRecipe(app, { name: 'Original Recipe' });
      const res = await http(app)
        .patch(`/v1/recipes/${recipe.id}`)
        .send({ name: 'HACKED' });
      expectReadOnlyRefusal(res);
      const stored = await launched.recipeRepo().findOneBy({ id: recipe.id });
      expect(stored.name).toBe('Original Recipe');
    });

    it('DELETE /v1/recipes/:recipeId is refused and the row survives', async () => {
      const recipe = await seedRecipe(app);
      const res = await http(app).delete(`/v1/recipes/${recipe.id}`);
      expectReadOnlyRefusal(res);
      expect(
        await launched.recipeRepo().findOneBy({ id: recipe.id }),
      ).not.toBeNull();
    });

    it('PUT /v1/recipes/:recipeId/image is refused and the image field is untouched', async () => {
      const recipe = await seedRecipe(app);
      const res = await http(app)
        .put(`/v1/recipes/${recipe.id}/image`)
        .field('caption', 'none');
      expectReadOnlyRefusal(res);
      const stored = await launched.recipeRepo().findOneBy({ id: recipe.id });
      expect(stored.image).toBeNull();
    });

    it('DELETE /v1/recipes/:recipeId/image is refused', async () => {
      const recipe = await seedRecipe(app);
      const res = await http(app).delete(`/v1/recipes/${recipe.id}/image`);
      expectReadOnlyRefusal(res);
    });

    it('PATCH /v1/settings is refused and the stored timezone is unchanged', async () => {
      const settingsRepo = launched.settingsRepo();
      await settingsRepo.save({ id: 1, timezone: 'Europe/Berlin' } as Settings);
      const res = await http(app)
        .patch('/v1/settings')
        .send({ timezone: 'HACKED/Zone' });
      expectReadOnlyRefusal(res);
      const stored = await settingsRepo.findOneBy({ id: 1 });
      expect(stored.timezone).toBe('Europe/Berlin');
    });

    it('POST /v1/pico-units/announce with the secret is exempt — 201 and the unit is upserted', async () => {
      const res = await http(app)
        .post('/v1/pico-units/announce')
        .set('X-Pico-Secret', DEMO_SECRET)
        .send({ handle: 'demo-announce-unit', ip: '127.0.0.1', port: 5000 });
      expect(res.status).toBe(201);
      const unit = await launched
        .picoRepo()
        .findOneBy({ handle: 'demo-announce-unit' });
      expect(unit).not.toBeNull();
    });

    it('announce without the secret is 401, not 403 (the secret gate, not the demo gate, refuses)', async () => {
      const res = await http(app)
        .post('/v1/pico-units/announce')
        .send({ handle: 'no-secret-unit' });
      expect(res.status).toBe(401);
    });

    it('every read view stays reachable on a demo boot', async () => {
      const unit = await seedPicoUnit(app);
      const batch = await seedBatch(app, unit.id);
      const recipe = await seedRecipe(app);

      const views: string[] = [
        '/v1/pico-units',
        `/v1/pico-units/${unit.id}`,
        `/v1/pico-units/${unit.id}/batches`,
        `/v1/pico-units/${unit.id}/batches/current`,
        `/v1/pico-units/${unit.id}/readings`,
        // The unit CSV export requires the time window (the batch export
        // takes it optionally).
        `/v1/pico-units/${unit.id}/readings/export?start=2025-10-01T00:00:00Z&end=2025-12-31T23:59:59Z`,
        '/v1/batches',
        `/v1/batches/${batch.id}`,
        `/v1/batches/${batch.id}/readings`,
        `/v1/batches/${batch.id}/readings/export`,
        '/v1/recipes',
        `/v1/recipes/${recipe.id}`,
        `/v1/recipes/${recipe.id}/batches`,
        '/v1/dashboard/summary',
        '/v1/settings',
        '/ping',
        '/health',
      ];
      for (const path of views) {
        const res = await http(app).get(path);
        expect({ [`GET ${path} is reachable on demo`]: res.status }).toEqual({
          [`GET ${path} is reachable on demo`]: 200,
        });
      }
    });

    it('a nonexistent :picoUnitId on a mutating route is 404 (route middleware runs before the guard)', async () => {
      // Each request is constructed just before it is awaited: supertest
      // closes the ephemeral listener it created per Test on teardown, so
      // eagerly built Tests sharing one http.Server refuse from the second
      // request onward.
      const cases: Array<() => request.Test> = [
        () => http(app).patch('/v1/pico-units/999999').send({ name: 'x' }),
        () => http(app).delete('/v1/pico-units/999999'),
        () => http(app).post('/v1/pico-units/999999/poll'),
        () => http(app).put('/v1/pico-units/999999/control/setpoints').send({}),
        () => http(app).get('/v1/pico-units/999999/ping'),
      ];
      for (const makeCall of cases) {
        const res = await makeCall();
        expect(res.status).toBe(404);
      }
    });
  });

  describe('demo boot — pace budget (403 carries rate-limit headers)', () => {
    let launched: DemoLaunch;

    beforeAll(async () => {
      // Throttle-counted-before-refuse ordering: the demo guard is
      // registered AFTER TooManyRequestsGuard, so refused requests still
      // spend from the window and exhaustion escalates to 429. Inside demo
      // the visitor-pair (the unnamed `default` definition) is the pace
      // budget — the historical MAX_REQUESTS pair is ignored by design.
      launched = await launchDemo({
        DEMO_VISITOR_MAX_REQUESTS: '2',
        DEMO_VISITOR_MAX_REQUESTS_TIME: '60000',
      });
    });

    afterAll(async () => {
      await launched?.close();
    });

    it('refused requests consume the window and exhaustion yields 429', async () => {
      const first = await http(launched.app).post('/v1/batches').send({});
      expectReadOnlyRefusal(first);
      expect(first.headers['x-ratelimit-limit']).toBe('2');
      expect(first.headers['x-ratelimit-remaining']).toBe('1');

      const second = await http(launched.app).post('/v1/batches').send({});
      expectReadOnlyRefusal(second);
      expect(second.headers['x-ratelimit-remaining']).toBe('0');

      const blocked = await http(launched.app).post('/v1/batches').send({});
      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after']).toBeDefined();
    });
  });

  describe('non-demo boot — the guard is inert', () => {
    let launched: DemoLaunch;

    beforeAll(async () => {
      // Restore the worker's NODE_ENV (jest sets `test`; envFilePath returns
      // to `.env.test`) and re-import the fixture in a fresh generation.
      restoreOriginalEnv();
      jest.resetModules();
      const setup = await import('./test-setup');
      const app = await setup.createTestApp();
      await app.init();
      launched = {
        app,
        close: () => setup.closeTestApp(app),
        axiosMock: (await import('axios')).default as unknown as jest.Mocked<
          typeof axios
        >,
        ...repos(app),
      };
    });

    afterAll(async () => {
      await launched?.close();
    });

    it('PATCH /v1/pico-units/:id still succeeds outside demo', async () => {
      const unit = await seedPicoUnit(launched.app, { name: 'Original Name' });
      const res = await http(launched.app)
        .patch(`/v1/pico-units/${unit.id}`)
        .send({ name: 'Renamed' });
      expect(res.status).toBe(200);
      const stored = await launched.picoRepo().findOneBy({ id: unit.id });
      expect(stored.name).toBe('Renamed');
    });
  });
});

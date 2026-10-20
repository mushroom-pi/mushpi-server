import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import request from 'supertest';
import { LessThanOrEqual, MoreThan, Repository } from 'typeorm';

import { Batch } from '../src/modules/batches/batches.entity';
import { CustomConfigService } from '../src/modules/config/config.service';
import { PicoUnit } from '../src/modules/pico-units/pico-unit.entity';
import { Readings } from '../src/modules/readings/readings.entity';
import { Recipe } from '../src/modules/recipes/recipes.entity';
import {
  SEED_CONTINUITY_TOLERANCE,
  SEED_READINGS_CADENCE_MS,
} from '../src/modules/seed/seed.constant';

/**
 * Demo seeding (e2e) — server-owned catalogue, roster and backdated
 * readings replacing the mock's seeding role.
 *
 * Boots follow the `demo-readonly` pattern: `process.env` is set BEFORE
 * `jest.resetModules()` and the fixture is dynamically imported, so the
 * Joi schema sees the intended profile. `SEED_ENABLED` defaults ON in the
 * demo profile; the gate itself (demo-off and non-demo-absent) is pinned
 * in the gating suite. All DB files live under a throwaway temp dir — no
 * command here ever touches `data/app.sqlite`.
 */
jest.mock('axios');

const DEMO_SECRET = 'e2e-demo-secret';
const SEED_TMP = `${tmpdir()}/mushpi-server-e2e-seed`;
rmSync(SEED_TMP, { recursive: true, force: true });
mkdirSync(SEED_TMP, { recursive: true });

const ENV_KEYS = [
  'NODE_ENV',
  'PICO_ANNOUNCE_SECRET',
  'SQLITE_PATH',
  'UPLOAD_DIR',
  'LOGS_PATH',
  'LOGS_LEVEL',
  'SEED_ENABLED',
  'SEED_READINGS_DAYS',
  'VISITOR_MAX_REQUESTS',
  'VISITOR_MAX_REQUESTS_TIME',
  'ABUSE_MAX_REQUESTS',
  'ABUSE_MAX_REQUESTS_TIME',
  'GLOBAL_MAX_REQUESTS',
  'GLOBAL_MAX_REQUESTS_TIME',
  'MAX_REQUESTS',
  'MAX_REQUESTS_TIME',
] as const;

const originalEnv: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) originalEnv[key] = process.env[key];

interface Launched {
  app: INestApplication;
  close: () => Promise<void>;
  /** SeedService from the SAME module generation as the running app. */
  seedService: () => { onApplicationBootstrap(): Promise<void> };
  /** CustomConfigService from the app's generation — class tokens do NOT
   *  survive `jest.resetModules()` (name-based repo tokens do). */
  config: () => CustomConfigService;
  recipeRepo: () => Repository<Recipe>;
  unitRepo: () => Repository<PicoUnit>;
  batchRepo: () => Repository<Batch>;
  readingsRepo: () => Repository<Readings>;
}

async function launch(
  sqlitePath: string,
  seedEnv: Record<string, string> = {},
): Promise<Launched> {
  process.env.NODE_ENV = 'demo';
  process.env.PICO_ANNOUNCE_SECRET = DEMO_SECRET;
  process.env.SQLITE_PATH = sqlitePath;
  process.env.UPLOAD_DIR = `${SEED_TMP}/uploads`;
  process.env.LOGS_PATH = `${SEED_TMP}/logs`;
  process.env.LOGS_LEVEL = 'silent';
  process.env.SEED_ENABLED = 'true';
  // Short history keeps the suite fast; the cadence/continuity contract is
  // day-count independent. Full defaults are pinned in the gating suite.
  process.env.SEED_READINGS_DAYS = '2';
  for (const [key, value] of Object.entries(seedEnv)) {
    // An empty override means "unset this key" (pin schema defaults).
    if (value === '') delete process.env[key];
    else process.env[key] = value;
  }
  // The three demo throttle pairs are required in this profile.
  process.env.VISITOR_MAX_REQUESTS = '10000';
  process.env.VISITOR_MAX_REQUESTS_TIME = '60000';
  process.env.ABUSE_MAX_REQUESTS = '10000';
  process.env.ABUSE_MAX_REQUESTS_TIME = '60000';
  process.env.GLOBAL_MAX_REQUESTS = '100000';
  process.env.GLOBAL_MAX_REQUESTS_TIME = '60000';
  delete process.env.MAX_REQUESTS;
  delete process.env.MAX_REQUESTS_TIME;

  jest.resetModules();
  const setup = await import('./test-setup');

  const toobusy = (await import('toobusy-js')).default;
  toobusy.maxLag(Number.MAX_SAFE_INTEGER);
  const { SeedService } = await import('../src/modules/seed/seed.service');
  const { CustomConfigService: ConfigSvc } = await import(
    '../src/modules/config/config.service'
  );
  const app = await setup.createTestApp();
  await app.init();
  return {
    app,
    close: async () => {
      await setup.closeTestApp(app);
      toobusy.shutdown();
    },
    seedService: () => app.get(SeedService),
    config: () => app.get(ConfigSvc) as CustomConfigService,
    recipeRepo: () => app.get(getRepositoryToken(Recipe)),
    unitRepo: () => app.get(getRepositoryToken(PicoUnit)),
    batchRepo: () => app.get(getRepositoryToken(Batch)),
    readingsRepo: () => app.get(getRepositoryToken(Readings)),
  };
}

function restoreOriginalEnv(): void {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
}

const http = (app: INestApplication) => request(app.getHttpServer());

/** Frozen boundary as persisted: the max seeded timestamp of any live unit. */
async function seededBoundary(l: Launched, unitId: number): Promise<Date> {
  const row = await l.readingsRepo().findOne({
    where: { pico_unit_id: unitId },
    order: { ts: 'DESC' },
  });
  return row.ts;
}

describe('Demo seeding (e2e)', () => {
  afterAll(() => {
    restoreOriginalEnv();
    rmSync(SEED_TMP, { recursive: true, force: true });
  });

  describe('demo boot — seeded catalogue, roster, batches and history', () => {
    let launched: Launched;
    let app: INestApplication;

    beforeAll(async () => {
      launched = await launch(`${SEED_TMP}/seeded.sqlite`);
      app = launched.app;
    }, 60_000);
    afterAll(async () => await launched?.close());

    const byHandle = async (handle: string): Promise<PicoUnit> =>
      launched.unitRepo().findOne({ where: { handle } });

    it('seeds the 14 provenance-passing recipes (≥ 10) with attribution and external images', async () => {
      const res = await http(app).get('/v1/recipes?limit=50');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(14);
      expect(res.body.total).toBeGreaterThanOrEqual(10);
      const names: string[] = res.body.items.map((r: Recipe) => r.name);
      // Excluded entries keep their names out of the catalogue…
      expect(names).not.toContain('Black Poplar on Straw');
      expect(names).not.toContain('Nameko in Bottles');
      // …and admitted ones carry the attribution footer + hotlinked photo.
      const oyster = res.body.items.find(
        (r: Recipe) => r.name === 'Grey Oyster on Straw',
      );
      expect(oyster.notes).toContain(
        '\n\nSource: D.I.Y. FunGuide: Grow Your Own Oyster Mushrooms at Home (UF/IFAS SS662) — https://ask.ifas.ufl.edu/publication/SS662 (accessed 2026-10-19, unknown)',
      );
      expect(oyster.image).toContain('https://upload.wikimedia.org');
      expect(oyster.image_url).toContain('https://upload.wikimedia.org');
    });

    it('seeds six simulated units; tent-six renders offline with an aged last_seen', async () => {
      const res = await http(app).get('/v1/pico-units?limit=50');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(6);
      const items = res.body.items;
      for (const item of items) {
        expect(item.description).toContain('Simulated demo unit');
      }
      const six = items.find((u: PicoUnit) => u.handle === 'tent-six');
      expect(six.status).toBe('offline');
      const ageMs = Date.now() - new Date(six.last_seen).getTime();
      expect(ageMs).toBeGreaterThan(24 * 60 * 60 * 1000);
      for (const handle of [
        'tent-one',
        'tent-two',
        'tent-three',
        'tent-four',
        'tent-five',
      ]) {
        const item = items.find((u: PicoUnit) => u.handle === handle);
        expect(item.status).toBe('healthy');
        expect(item.api_compatibility).toBe('compatible');
      }
    });

    it('seeds 17 batches with date-derived statuses 10 finished / 4 in-progress / 3 planned', async () => {
      const res = await http(app).get('/v1/batches?limit=50');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(17);
      const statuses = res.body.items.map((b: Batch) => b.status);
      expect(statuses.filter((s: string) => s === 'finished')).toHaveLength(10);
      expect(statuses.filter((s: string) => s === 'in-progress')).toHaveLength(
        4,
      );
      expect(statuses.filter((s: string) => s === 'planned')).toHaveLength(3);
    });

    it('runs 4 in-progress batches on 4 distinct live units including the drifting tent-three', async () => {
      const units = await launched.unitRepo().find();
      const idToHandle = new Map(units.map((u) => [u.id, u.handle]));
      const active = await launched
        .batchRepo()
        .find({ where: {}, relations: [] });
      const inProgress = active.filter(
        (b) =>
          b.start_at.getTime() <= Date.now() &&
          (!b.finish_at || b.finish_at.getTime() > Date.now()),
      );
      const handles = inProgress.map((b) => idToHandle.get(b.pico_unit_id));
      expect(new Set(handles).size).toBe(4);
      expect(handles).toContain('tent-three');
      expect(handles).not.toContain('tent-six');
    });

    it('keeps every batch off the offline unit and links all batches to seeded recipes', async () => {
      const six = await byHandle('tent-six');
      expect(
        await launched.batchRepo().count({ where: { pico_unit_id: six.id } }),
      ).toBe(0);
      const all = await launched.batchRepo().find();
      // All 17 batches carry a recipe_id (snapshot template).
      expect(all.filter((b) => b.recipe_id != null)).toHaveLength(17);
    });

    it('spreads species so no single species dominates the batch set', async () => {
      const all = await launched.batchRepo().find();
      const perSpecies = new Map<string, number>();
      for (const b of all)
        perSpecies.set(b.species, (perSpecies.get(b.species) ?? 0) + 1);
      expect(perSpecies.size).toBeGreaterThanOrEqual(12);
      expect(Math.max(...perSpecies.values())).toBeLessThanOrEqual(2);
    });

    it('backdates 60 s-spaced history for the 5 live units and none for tent-six', async () => {
      const six = await byHandle('tent-six');
      expect(
        await launched
          .readingsRepo()
          .count({ where: { pico_unit_id: six.id } }),
      ).toBe(0);

      for (const handle of [
        'tent-one',
        'tent-two',
        'tent-three',
        'tent-four',
        'tent-five',
      ]) {
        const unit = await byHandle(handle);
        const seeded = await launched
          .readingsRepo()
          .createQueryBuilder('r')
          .where('r.pico_unit_id = :id', { id: unit.id })
          .getCount();
        expect(seeded).toBeGreaterThan(0);
        // 2 days × 1440 minutes = the exact grid count.
        expect(seeded).toBe(2 * 1440);
      }
    });

    it('terminates the seeded series at one shared frozen boundary, minute-aligned and ≥ 60 s before now', async () => {
      const boundaries: number[] = [];
      for (const handle of [
        'tent-one',
        'tent-two',
        'tent-three',
        'tent-four',
        'tent-five',
      ]) {
        const unit = await byHandle(handle);
        const boundary = await seededBoundary(launched, unit.id);
        boundaries.push(boundary.getTime());
        expect(boundary.getTime() % SEED_READINGS_CADENCE_MS).toBe(0);
        expect(boundary.getTime()).toBeLessThanOrEqual(
          Date.now() - SEED_READINGS_CADENCE_MS,
        );
      }
      // Frozen once at seed start — identical across all units.
      expect(new Set(boundaries).size).toBe(1);
    });

    it('ends each live unit one full cadence interval from the next poll, and lands inside the continuity band of its active batch', async () => {
      const units = await launched.unitRepo().find();
      const batches = await launched.batchRepo().find();
      for (const handle of [
        'tent-one',
        'tent-two',
        'tent-three',
        'tent-four',
      ]) {
        const unit = units.find((u) => u.handle === handle);
        const active = batches
          .filter(
            (b) =>
              b.pico_unit_id === unit.id &&
              b.start_at.getTime() <= Date.now() &&
              (!b.finish_at || b.finish_at.getTime() > Date.now()),
          )
          .sort((a, b) => b.start_at.getTime() - a.start_at.getTime())[0];
        expect(active).toBeDefined();

        const rows = await launched.readingsRepo().find({
          where: { pico_unit_id: unit.id },
          order: { ts: 'DESC' },
          take: 2,
        });
        const [last, prev] = rows;
        // Exactly one interval before the boundary → the live poll lands ~1
        // interval after it (the seeded ⇄ live join contract).
        expect(last.ts.getTime() - prev.ts.getTime()).toBe(
          SEED_READINGS_CADENCE_MS,
        );
        // Continuity: final values inside the worst-case per-poll step of
        // the active-batch setpoints (hysteresis band).
        expect(
          Math.abs(last.temperature - active.temperature_target),
        ).toBeLessThanOrEqual(SEED_CONTINUITY_TOLERANCE.temperatureC);
        expect(
          Math.abs(last.humidity - active.humidity_target),
        ).toBeLessThanOrEqual(SEED_CONTINUITY_TOLERANCE.humidityPct);
        // Setpoint snapshots carried on the row.
        expect(last.temperature_set).toBe(active.temperature_target);
        expect(last.humidity_set).toBe(active.humidity_target);
        // The drifting unit still shows real excursion mid-series.
        if (handle === 'tent-three') {
          const mid = await launched
            .readingsRepo()
            .createQueryBuilder('r')
            .where('r.pico_unit_id = :id', { id: unit.id })
            .orderBy('r.ts', 'ASC')
            .getMany();
          const hMin = Math.min(...mid.map((r) => r.humidity));
          expect(hMin).toBeLessThan(active.humidity_target - 3);
        }
      }
    });
  });

  describe('demo boot — idempotent across two boots (file db)', () => {
    const file = `${SEED_TMP}/idempotent.sqlite`;
    let first: Launched;
    let second: Launched;

    beforeAll(async () => {
      first = await launch(file);
    }, 60_000);
    afterAll(async () => {
      // closeTestApp is idempotent-safe (TypeORM destroy no-ops when the
      // DataSource is not initialized) — covers the in-test closes too.
      try {
        await first?.close();
      } catch {
        /* already closed */
      }
      try {
        await second?.close();
      } catch {
        /* already closed */
      }
    }, 60_000);

    it('the second boot adds nothing and duplicates no reading timestamps', async () => {
      const counts1 = {
        recipes: await first.recipeRepo().count(),
        units: await first.unitRepo().count(),
        batches: await first.batchRepo().count(),
        readings: await first.readingsRepo().count(),
      };
      await first.close();

      second = await launch(file);
      const counts2 = {
        recipes: await second.recipeRepo().count(),
        units: await second.unitRepo().count(),
        batches: await second.batchRepo().count(),
        readings: await second.readingsRepo().count(),
      };

      expect(counts2).toEqual(counts1);
      expect(counts1.recipes).toBe(14);
      expect(counts1.batches).toBe(17);

      // Watermark guard: the second boot added no rows, and per-unit
      // timestamps stay unique (no doubled grid from a re-run).
      const tentOne = await second.unitRepo().findOne({
        where: { handle: 'tent-one' },
      });
      const unitRows = await second
        .readingsRepo()
        .find({ where: { pico_unit_id: tentOne.id }, select: ['ts'] });
      expect(unitRows).toHaveLength(2 * 1440);
      const tsSet = new Set(unitRows.map((r) => r.ts.getTime()));
      expect(tsSet.size).toBe(unitRows.length);
      await second.close();
    }, 60_000);
  });

  describe('demo boot — seeded range regenerates while the live range is preserved', () => {
    let launched: Launched;

    beforeAll(async () => {
      launched = await launch(':memory:', { SEED_READINGS_DAYS: '1' });
    }, 60_000);
    afterAll(async () => await launched?.close());

    it('re-seeding after clearing the seeded range preserves live rows', async () => {
      const unit = await launched.unitRepo().findOne({
        where: { handle: 'tent-one' },
      });
      const boundary1 = await seededBoundary(launched, unit.id);

      // Simulate live polls: rows clearly ABOVE the first boundary.
      const live1 = new Date(
        boundary1.getTime() + 5 * SEED_READINGS_CADENCE_MS,
      );
      const live2 = new Date(
        boundary1.getTime() + 6 * SEED_READINGS_CADENCE_MS,
      );
      await launched.readingsRepo().save([
        {
          ts: live1,
          temperature: 21,
          humidity: 88,
          pico_unit_id: unit.id,
        } as Partial<Readings>,
        {
          ts: live2,
          temperature: 21.2,
          humidity: 89,
          pico_unit_id: unit.id,
        } as Partial<Readings>,
      ]);

      // Clear only the seeded range (≤ boundary1) — a test-local mutation
      // of a throwaway in-memory db, never live state.
      await launched.readingsRepo().delete({
        pico_unit_id: unit.id,
        ts: LessThanOrEqual(boundary1),
      });
      expect(
        await launched
          .readingsRepo()
          .count({ where: { pico_unit_id: unit.id } }),
      ).toBe(2);

      // Re-run the seeder (same code path a reboot takes). The second
      // boundary can be at most boundary1 + one interval, so the live rows
      // (boundary1 + 5/6 intervals) can never trip the watermark.
      await launched.seedService().onApplicationBootstrap();

      // A days=1 boot inserts exactly 1440 grid rows per live unit. The
      // regenerated range must be whole again and the two live rows must
      // survive untouched — never duplicated, never deleted.
      const total = await launched
        .readingsRepo()
        .count({ where: { pico_unit_id: unit.id } });
      expect(total).toBe(1440 + 2);
      expect(
        await launched
          .readingsRepo()
          .count({ where: { pico_unit_id: unit.id, ts: MoreThan(boundary1) } }),
      ).toBe(2); // seeded range regenerated BELOW the boundary only
      const liveKept = await launched.readingsRepo().find({
        where: [{ pico_unit_id: unit.id, ts: MoreThan(live2) }],
      });
      expect(liveKept).toHaveLength(0); // no rows invented above the live pair
      const allRows = await launched.readingsRepo().find({
        where: { pico_unit_id: unit.id },
      });
      const liveTs = allRows
        .map((r) => r.ts.getTime())
        .filter((t) => t >= live1.getTime())
        .sort();
      expect(liveTs).toEqual([live1.getTime(), live2.getTime()]);
    }, 60_000);
  });

  describe('config gating — seeding is inert outside the demo profile', () => {
    let launched: Launched;

    beforeAll(async () => {
      // Demo boot with the capability flag explicitly forced OFF, and the
      // days default left unset so its default is pinned here too.
      launched = await launch(':memory:', {
        SEED_ENABLED: 'false',
        SEED_READINGS_DAYS: '',
      });
    });

    it('demo boot with SEED_ENABLED=false seeds nothing and reports the default history length', async () => {
      expect(launched.config().seed.enabled).toBe(false);
      expect(launched.config().seed.readingsDays).toBe(14);
      expect(await launched.recipeRepo().count()).toBe(0);
      expect(await launched.unitRepo().count()).toBe(0);
      expect(await launched.batchRepo().count()).toBe(0);
      expect(await launched.readingsRepo().count()).toBe(0);
    });

    it('non-demo boot with SEED_ENABLED unset seeds nothing', async () => {
      restoreOriginalEnv(); // jest's NODE_ENV=test comes back
      jest.resetModules();
      delete process.env.SEED_ENABLED;
      delete process.env.SEED_READINGS_DAYS;
      process.env.SQLITE_PATH = ':memory:';
      process.env.UPLOAD_DIR = `${SEED_TMP}/uploads`;
      process.env.LOGS_PATH = `${SEED_TMP}/logs`;
      process.env.LOGS_LEVEL = 'silent';
      const setup = await import('./test-setup');
      const { CustomConfigService: Cfg } = await import(
        '../src/modules/config/config.service'
      );
      const app = await setup.createTestApp();
      await app.init();
      expect((app.get(Cfg) as CustomConfigService).seed.enabled).toBe(false);
      const recipes = await app
        .get<Repository<Recipe>>(getRepositoryToken(Recipe))
        .count();
      const units = await app
        .get<Repository<PicoUnit>>(getRepositoryToken(PicoUnit))
        .count();
      const batches = await app
        .get<Repository<Batch>>(getRepositoryToken(Batch))
        .count();
      const readings = await app
        .get<Repository<Readings>>(getRepositoryToken(Readings))
        .count();
      expect([recipes, units, batches, readings]).toEqual([0, 0, 0, 0]);
      await setup.closeTestApp(app);
    }, 30_000);

    afterAll(async () => {
      await launched?.close();
      restoreOriginalEnv();
    });
  });
});

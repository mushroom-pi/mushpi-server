import { INestApplication } from '@nestjs/common';

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import request from 'supertest';

import { DEMO_OWNERSHIP_MARKER_FILENAME } from 'src/common/utils/clean-start';

/**
 * Bootstrap-ordering guard for the clean start (e2e).
 *
 * Built on `NestFactory.create(AppModule)` — NOT `Test.createTestingModule` /
 * `createTestApp()` — because what this pins is the production bootstrap
 * SEQUENCE itself: `manualInitialization: true` (`sqlite.module.ts`) keeps
 * `@nestjs/typeorm` from connecting inside its provider factory, so
 * `NestFactory.create()` returns with the DataSource NOT connected and the
 * database file not yet created or opened. The clean-start decision therefore
 * sees true on-disk state and a wipe unlinks a file with no open handle; only
 * then does the bootstrap connect explicitly, and `listen()` runs the
 * lifecycle hooks (image dirs, cron startup sweep, demo seeding) against a
 * live connection.
 *
 * Why the ordering assertion below is the load-bearing one: the first
 * clean-start attempt passed the entire suite while being broken, because the
 * e2e fixture never replicated production bootstrap ordering (`@nestjs/typeorm`
 * connected eagerly during app creation in every test). So this spec asserts
 * `isInitialized === false` immediately after `create()` — that assertion
 * FAILS the moment `manualInitialization: true` is removed from the factory
 * options, turning the option into a test-pinned contract.
 *
 * Every boot is a fresh module generation (`jest.resetModules()` + dynamic
 * imports — `SQLITE_PATH`/`UPLOAD_DIR` freeze into the @nestjs/config snapshot
 * at first import, see REFERENCE.md §E2E Gotchas), and `cleanStart` runs in
 * `main.ts`'s exact order — this pins the mechanism, not the demo-profile gate
 * (the gate is the call site in `main.ts`; the spec stays on the default
 * `test` profile so seeding and the demo guards remain inert).
 *
 * All paths are throwaway under `/tmp/opencode/`; `/ping` is probed with
 * supertest against the non-listened server — no spec may bind a real socket
 * (REFERENCE.md §E2E Gotchas).
 */

const TMP = '/tmp/opencode/mushpi-clean-start-bootstrap-e2e';
const DATA_DIR = join(TMP, 'data');
const DB_PATH = join(DATA_DIR, 'app.sqlite');
const MARKER_PATH = join(DATA_DIR, DEMO_OWNERSHIP_MARKER_FILENAME);

const SENTINEL_RECIPE_NAME = 'bootstrap-sentinel-recipe';

function setThrowawayEnv(): void {
  process.env.SQLITE_PATH = DB_PATH;
  process.env.UPLOAD_DIR = TMP;
  process.env.LOGS_PATH = join(TMP, 'logs');
}

interface DataSourceLike {
  isInitialized: boolean;
  initialize(): Promise<unknown>;
  query(sql: string, params?: unknown[]): Promise<any[]>;
}

/** On-disk truth captured the instant BEFORE the decision ran. */
interface DecisionWindow {
  markerPresent: boolean;
  dbPresent: boolean;
  /** Marker surviving the window with nothing else beside it. */
  filesAfterDecision: string[];
}

interface Booted {
  app: INestApplication;
  dataSource: DataSourceLike;
  window: DecisionWindow;
}

/**
 * One full production boot, step by step in `main.ts`'s order:
 * create() → assert the connect is STILL deferred → cleanStart() →
 * initialize() → init() (lifecycle hooks). The caller probes `/ping` and
 * closes.
 */
async function boot(label: string): Promise<Booted> {
  setThrowawayEnv();
  jest.resetModules();

  const { NestFactory } = await import('@nestjs/core');
  const { DataSource } = await import('typeorm');
  const { applyApiVersioning } = await import('src/common/utils/api-version');
  const { cleanStart } = await import('src/common/utils/clean-start');
  const { AppModule } = await import('src/modules/app.module');
  const { CustomConfigService } = await import(
    'src/modules/config/config.service'
  );

  const app: INestApplication = await NestFactory.create(AppModule, {
    logger: false,
  });
  applyApiVersioning(app);

  const dataSource = app.get(DataSource) as unknown as DataSourceLike;

  // THE ordering guard: were `manualInitialization` ever removed, the
  // provider factory would have connected (and created the file) before
  // this line could run. Failure text travels in the object key (Jest 30).
  expect({
    [`${label}: DataSource must NOT be connected after NestFactory.create()`]:
      dataSource.isInitialized,
  }).toEqual({
    [`${label}: DataSource must NOT be connected after NestFactory.create()`]:
      false,
  });

  const window: DecisionWindow = {
    markerPresent: existsSync(MARKER_PATH),
    dbPresent: existsSync(DB_PATH),
    filesAfterDecision: [],
  };
  cleanStart(app.get(CustomConfigService) as never);
  // What the decision left behind, captured BEFORE the explicit connect —
  // a wipe must have left the database ABSENT (nothing created in its place).
  window.filesAfterDecision = existsSync(DATA_DIR) ? safeReaddir(DATA_DIR) : [];
  await dataSource.initialize();

  await app.init();

  return { app, dataSource, window };
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}

/** Close the app — `app.close()` destroys the DataSource (no open handle). */
async function shutdown(booted: Booted): Promise<void> {
  await booted.app.close();
}

/** Every table TypeORM knows about, as created by `synchronize: true`. */
async function tableNames(booted: Booted): Promise<string[]> {
  const rows = await booted.dataSource.query(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  return rows.map((row: { name: string }) => row.name);
}

async function assertAllTablesEmpty(booted: Booted): Promise<string[]> {
  const tables = await tableNames(booted);
  expect(tables.length).toBeGreaterThan(0);
  for (const table of tables) {
    const rows = await booted.dataSource.query(
      `SELECT COUNT(*) AS count FROM "${table}"`,
    );
    expect({ table, rows: rows[0].count }).toEqual({ table, rows: 0 });
  }
  return tables;
}

async function insertSentinel(booted: Booted): Promise<void> {
  await booted.dataSource.query(
    `INSERT INTO recipe (name, species, temperature_target, humidity_target, duration_days)
     VALUES (?, ?, ?, ?, ?)`,
    [SENTINEL_RECEIVED_NAME_CHECK(booted), 'sentinella', 20, 90, 14],
  );
}

function SENTINEL_RECEIVED_NAME_CHECK(_booted: Booted): string {
  return SENTINEL_RECIPE_NAME;
}

async function sentinelExists(booted: Booted): Promise<boolean> {
  const rows = await booted.dataSource.query(
    `SELECT COUNT(*) AS count FROM recipe WHERE name = ?`,
    [SENTINEL_RECIPE_NAME],
  );
  return rows[0].count > 0;
}

describe('Clean-start bootstrap ordering (e2e)', () => {
  beforeAll(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
    setThrowawayEnv();
  });

  afterAll(() => {
    // Shut any app down defensively, then remove the throwaway tree.
    rmSync(TMP, { recursive: true, force: true });
    delete process.env.SQLITE_PATH;
    delete process.env.UPLOAD_DIR;
    delete process.env.LOGS_PATH;
  });

  it('fresh volume: adopts and connects cleanly, serves /ping, leaves nothing behind but the marker', async () => {
    const booted = await boot('boot-1 (fresh volume)');
    try {
      // Pre-decision: a pristine volume — neither marker nor database.
      expect({ 'boot-1: no marker yet': booted.window.markerPresent }).toEqual({
        'boot-1: no marker yet': false,
      });
      expect({ 'boot-1: no db yet': booted.window.dbPresent }).toEqual({
        'boot-1: no db yet': false,
      });
      // Adoption wrote ONLY the marker; the database file still did not
      // exist when the explicit connect ran (this is the path the reverted
      // first attempt could never reach).
      expect(booted.window.filesAfterDecision).toEqual([
        DEMO_OWNERSHIP_MARKER_FILENAME,
      ]);
      expect(existsSync(DB_PATH)).toBe(true); // exists only after initialize()

      await assertAllTablesEmpty(booted);
      await request(booted.app.getHttpServer())
        .get('/ping')
        .expect(200)
        .expect('pong');
    } finally {
      await shutdown(booted);
    }
  });

  it('second full boot on the same volume: the sentinel is wiped before the connect — state is empty again', async () => {
    // Boot 2 re-sees the adopted marker, wipes (the empty boot-1 database —
    // idempotent), and then we populate a sentinel row through a normal
    // connected boot, exactly as a live demo accumulates state.
    const seeded = await boot('boot-2 (populate sentinel)');
    try {
      expect(seeded.window.markerPresent).toBe(true);
      expect(seeded.window.dbPresent).toBe(true);
      await insertSentinel(seeded);
      expect(await sentinelExists(seeded)).toBe(true);
    } finally {
      await shutdown(seeded);
    }

    // The sentinel is really on disk after the close.
    expect(existsSync(DB_PATH)).toBe(true);
    expect(readFileSync(DB_PATH).length).toBeGreaterThan(0);

    // Boot 3: the production sequence again, and the decision wipes what
    // boot 2 left behind.
    const booted = await boot('boot-3 (clean restart)');
    try {
      expect(booted.window.markerPresent).toBe(true);
      expect(booted.window.dbPresent).toBe(true);
      // The wipe left the database ABSENT in the decision window — only the
      // marker survived — and the explicit connect recreated an empty file.
      expect(booted.window.filesAfterDecision).toEqual([
        DEMO_OWNERSHIP_MARKER_FILENAME,
      ]);
      expect(await sentinelExists(booted)).toBe(false);
      const tables = await assertAllTablesEmpty(booted);
      expect(tables).toContain('recipe');

      await request(booted.app.getHttpServer())
        .get('/ping')
        .expect(200)
        .expect('pong');
    } finally {
      await shutdown(booted);
    }
  });
});

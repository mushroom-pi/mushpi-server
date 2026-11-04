import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DataSource } from 'typeorm';

import { Batch } from '../src/modules/batches/batches.entity';
import { PicoUnit } from '../src/modules/pico-units/pico-unit.entity';
import { Readings } from '../src/modules/readings/readings.entity';
import { Recipe } from '../src/modules/recipes/recipes.entity';
import { Settings } from '../src/modules/settings/settings.entity';
import { Health } from '../src/modules/sqlite-health/sqlite-health.entity';
import { MIGRATIONS } from '../src/modules/sqlite/migrations';

/**
 * Migration e2e tests — pure DataSource, no AppModule, no cron, no supertest.
 *
 * Uses temp files under os.tmpdir(), removed in afterAll.
 */

function tmpDbPath(name: string): string {
  return path.join(
    os.tmpdir(),
    `mushpi-migration-test-${name}-${Date.now()}.sqlite`,
  );
}

function buildDataSource(dbPath: string, opts: { migrationsRun: boolean }) {
  return new DataSource({
    type: 'better-sqlite3',
    database: dbPath,
    entities: [Health, PicoUnit, Batch, Readings, Recipe, Settings],
    migrations: MIGRATIONS,
    synchronize: false,
    migrationsRun: opts.migrationsRun,
  });
}

describe('Migrations (e2e)', () => {
  const cleanupPaths: string[] = [];

  afterAll(() => {
    for (const p of cleanupPaths) {
      try {
        fs.unlinkSync(p);
      } catch {
        // ignore
      }
    }
  });

  it('fresh DB: migrationsRun applies all migrations and creates all expected tables', async () => {
    const dbPath = tmpDbPath('fresh');
    cleanupPaths.push(dbPath);

    const ds = buildDataSource(dbPath, { migrationsRun: true });
    await ds.initialize();

    try {
      // Check migrations table
      const applied = await ds.query('SELECT * FROM migrations ORDER BY id');
      expect(applied).toHaveLength(2);
      expect(applied[0].name).toBe('InitSchema1788454880680');
      expect(applied[1].name).toBe(
        'PicoUnitFirmwareVersionApiVersion1789485932426',
      );

      // Check all tables exist
      const tables = await ds.query(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      );
      const tableNames = tables.map((r: any) => r.name);
      expect(tableNames).toEqual(
        expect.arrayContaining([
          'batch',
          'health',
          'migrations',
          'pico_unit',
          'readings',
          'recipe',
          'settings',
        ]),
      );

      // Check custom index exists
      const indexes = await ds.query(
        `SELECT name FROM sqlite_master WHERE type='index' AND name='idx_readings_unit_ts'`,
      );
      expect(indexes).toHaveLength(1);

      // Check pico_unit has all expected columns
      const picoUnitCols = await ds.query('PRAGMA table_info(pico_unit)');
      const colNames = picoUnitCols.map((r: any) => r.name);
      expect(colNames).toEqual(
        expect.arrayContaining([
          'face_color',
          'mac',
          'failed_readings',
          'consecutive_empty_readings',
          'enabled',
          'firmware_version',
          'api_version',
        ]),
      );
      // The incremental migration renamed the baseline's software_version column.
      expect(colNames).not.toContain('software_version');
    } finally {
      await ds.destroy();
    }
  });

  it('legacy populated DB: baseline IF NOT EXISTS no-ops, seeded data preserved', async () => {
    const dbPath = tmpDbPath('legacy');
    cleanupPaths.push(dbPath);

    // Phase 1: build a temp DB with synchronize: true (mimicking legacy dev DBs)
    const legacyDs = new DataSource({
      type: 'better-sqlite3',
      database: dbPath,
      entities: [Health, PicoUnit, Batch, Readings, Recipe, Settings],
      synchronize: true,
    });
    await legacyDs.initialize();

    // Seed one pico_unit row
    const picoRepo = legacyDs.getRepository(PicoUnit);
    const seeded = await picoRepo.save(
      picoRepo.create({
        handle: 'legacy-unit-01',
        name: 'Legacy Unit',
        port: 5000,
        monitored: true,
      }),
    );
    expect(seeded.id).toBeDefined();

    // Capture sqlite_master snapshot before migration (exclude migrations table — it's added by TypeORM)
    const masterBefore = await legacyDs.query(
      `SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name != 'migrations' ORDER BY type, name`,
    );

    // Capture row counts
    const countsBefore = {
      pico_unit: (
        await legacyDs.query('SELECT COUNT(*) AS c FROM pico_unit')
      )[0].c,
      readings: (await legacyDs.query('SELECT COUNT(*) AS c FROM readings'))[0]
        .c,
      recipe: (await legacyDs.query('SELECT COUNT(*) AS c FROM recipe'))[0].c,
      settings: (await legacyDs.query('SELECT COUNT(*) AS c FROM settings'))[0]
        .c,
      health: (await legacyDs.query('SELECT COUNT(*) AS c FROM health'))[0].c,
    };

    await legacyDs.destroy();

    // Phase 2: open with migrationsRun: true — baseline should no-op
    const migratedDs = buildDataSource(dbPath, { migrationsRun: true });
    await migratedDs.initialize();

    try {
      // Migration should be recorded as applied
      const applied = await migratedDs.query(
        'SELECT * FROM migrations ORDER BY id',
      );
      expect(applied).toHaveLength(2);
      expect(applied[0].name).toBe('InitSchema1788454880680');
      expect(applied[1].name).toBe(
        'PicoUnitFirmwareVersionApiVersion1789485932426',
      );

      // sqlite_master should be unchanged (no schema diff, excluding migrations table)
      const masterAfter = await migratedDs.query(
        `SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name != 'migrations' ORDER BY type, name`,
      );
      expect(masterAfter).toEqual(masterBefore);

      // Row counts should be unchanged
      const countsAfter = {
        pico_unit: (
          await migratedDs.query('SELECT COUNT(*) AS c FROM pico_unit')
        )[0].c,
        readings: (
          await migratedDs.query('SELECT COUNT(*) AS c FROM readings')
        )[0].c,
        recipe: (await migratedDs.query('SELECT COUNT(*) AS c FROM recipe'))[0]
          .c,
        settings: (
          await migratedDs.query('SELECT COUNT(*) AS c FROM settings')
        )[0].c,
        health: (await migratedDs.query('SELECT COUNT(*) AS c FROM health'))[0]
          .c,
      };
      expect(countsAfter).toEqual(countsBefore);

      // Seeded row should still be present
      const unit = await migratedDs
        .getRepository(PicoUnit)
        .findOneBy({ handle: 'legacy-unit-01' });
      expect(unit).toBeDefined();
      expect(unit!.name).toBe('Legacy Unit');
    } finally {
      await migratedDs.destroy();
    }
  });

  it('true legacy DB (software_version schema): rename preserves values, api_version added NULL, down() reverts', async () => {
    const dbPath = tmpDbPath('firmware-rename');
    cleanupPaths.push(dbPath);

    // Phase 1: simulate a DB at the PRE-migration shape (baseline schema —
    // software_version column, no api_version) using raw SQL.
    const preDs = new DataSource({
      type: 'better-sqlite3',
      database: dbPath,
      entities: [Health, PicoUnit, Batch, Readings, Recipe, Settings],
      synchronize: false,
    });
    await preDs.initialize();
    try {
      await preDs.query(
        `CREATE TABLE "pico_unit" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "created_at" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          "handle" text NOT NULL,
          "name" text,
          "description" text,
          "face_color" text,
          "ip" text,
          "mac" text,
          "port" integer NOT NULL DEFAULT (5000),
          "enabled" boolean NOT NULL DEFAULT (1),
          "last_seen" datetime,
          "micropython_version" text,
          "software_version" text,
          "board" text,
          "board_total_mem_byte" integer DEFAULT (0),
          "board_total_fs_byte" integer DEFAULT (0),
          "board_cpu_freq_mhz" integer DEFAULT (0),
          "failed_calls" integer NOT NULL DEFAULT (0),
          "failed_readings" integer NOT NULL DEFAULT (0),
          "consecutive_empty_readings" integer NOT NULL DEFAULT (0),
          CONSTRAINT "UQ_fe71723067ef220b65e6118aa3e" UNIQUE ("handle")
        )`,
      );
      await preDs.query(
        `INSERT INTO "pico_unit" ("handle", "port", "software_version") VALUES ('rename-unit', 5000, '0.1.0')`,
      );
    } finally {
      await preDs.destroy();
    }

    // Phase 2: run all pending migrations. Against this pre-existing table the
    // baseline no-ops (CREATE TABLE IF NOT EXISTS) and only the incremental
    // migration mutates the schema — the real prod upgrade path.
    const migratedDs = buildDataSource(dbPath, { migrationsRun: false });
    await migratedDs.initialize();
    try {
      const run = await migratedDs.runMigrations();
      expect(run.map((m) => m.name)).toEqual([
        'InitSchema1788454880680',
        'PicoUnitFirmwareVersionApiVersion1789485932426',
      ]);

      // Column renamed, old name gone.
      const cols = (await migratedDs.query('PRAGMA table_info(pico_unit)')).map(
        (r: any) => r.name,
      );
      expect(cols).toContain('firmware_version');
      expect(cols).not.toContain('software_version');
      expect(cols).toContain('api_version');

      // Existing row value survived the rename; api_version is NULL (never reported).
      const rows = await migratedDs.query(
        `SELECT handle, firmware_version, api_version FROM pico_unit WHERE handle = 'rename-unit'`,
      );
      expect(rows).toEqual([
        { handle: 'rename-unit', firmware_version: '0.1.0', api_version: null },
      ]);

      // down() reverts (undoLastMigration reverts the most recent applied
      // migration — our incremental one): api_version dropped, column renamed
      // back, value intact.
      await migratedDs.undoLastMigration();
      const colsAfter = (
        await migratedDs.query('PRAGMA table_info(pico_unit)')
      ).map((r: any) => r.name);
      expect(colsAfter).toContain('software_version');
      expect(colsAfter).not.toContain('firmware_version');
      expect(colsAfter).not.toContain('api_version');
      const reverted = await migratedDs.query(
        `SELECT handle, software_version FROM pico_unit WHERE handle = 'rename-unit'`,
      );
      expect(reverted).toEqual([
        { handle: 'rename-unit', software_version: '0.1.0' },
      ]);
    } finally {
      await migratedDs.destroy();
    }
  });

  it('idempotency: running migrations a second time returns no new migrations', async () => {
    const dbPath = tmpDbPath('idempotent');
    cleanupPaths.push(dbPath);

    const ds = buildDataSource(dbPath, { migrationsRun: false });
    await ds.initialize();

    try {
      // First run
      const firstRun = await ds.runMigrations();
      expect(firstRun.length).toBeGreaterThanOrEqual(1);

      // Second run — should return empty array (no pending migrations)
      const secondRun = await ds.runMigrations();
      expect(secondRun).toHaveLength(0);
    } finally {
      await ds.destroy();
    }
  });
});

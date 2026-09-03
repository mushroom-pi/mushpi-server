import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';

import { Batch } from 'src/modules/batches/batches.entity';
import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';
import { Readings } from 'src/modules/readings/readings.entity';
import { Recipe } from 'src/modules/recipes/recipes.entity';
import { Settings } from 'src/modules/settings/settings.entity';
import { Health } from 'src/modules/sqlite-health/sqlite-health.entity';
import { MIGRATIONS } from 'src/modules/sqlite/migrations';

/**
 * Build DataSourceOptions for the CLI (migration:generate / migration:run / etc.).
 *
 * Intentionally omits `synchronize` and `migrationsRun` so the CLI never
 * pre-syncs the target DB — migration:generate must see the real pre-migration
 * state to emit a meaningful diff.
 *
 * Uses a static import of the migrations barrel (not a `dist/` glob) so it
 * works in all three contexts: compiled CLI, ts-jest tests, and the ncc
 * single-file Docker bundle.
 */
export function buildSqliteDataSourceOptions(): DataSourceOptions {
  return {
    type: 'better-sqlite3',
    database: process.env.SQLITE_PATH || 'data/app.sqlite',
    entities: [Health, PicoUnit, Batch, Readings, Recipe, Settings],
    migrations: MIGRATIONS,
  };
}

export const AppDataSource = new DataSource(buildSqliteDataSourceOptions());

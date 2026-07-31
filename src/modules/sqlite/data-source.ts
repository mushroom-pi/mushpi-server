import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { Batch } from 'src/modules/batches/batches.entity';
import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';
import { Readings } from 'src/modules/readings/readings.entity';
import { Recipe } from 'src/modules/recipes/recipes.entity';
import { Settings } from 'src/modules/settings/settings.entity';
import { Health } from 'src/modules/sqlite-health/sqlite-health.entity';

export const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: process.env.SQL_PATH || 'data/app.sqlite',
  entities: [Health, PicoUnit, Batch, Readings, Recipe, Settings],
  migrations: ['dist/src/modules/sqlite/migrations/*.(j|t)s'],
  // logging: true,
});

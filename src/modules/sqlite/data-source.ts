import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { Health } from 'src/modules/sqlite-health/sqlite-health.entity';

import { Batch } from '../batches/batches.entity';
import { PicoUnit } from '../pico-units/pico-unit.entity';
import { Readings } from '../readings/readings.entity';
import { Recipe } from '../recipes/recipes.entity';

export const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: process.env.SQL_PATH || 'data/app.sqlite',
  entities: [Health, PicoUnit, Batch, Readings, Recipe],
  migrations: ['dist/src/modules/sqlite/migrations/*.js'],
  // logging: true,
});

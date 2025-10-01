import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { Health } from 'src/modules/sqlite-health/sqlite-health.entity';

export const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: process.env.SQL_PATH || 'data/app.sqlite',
  entities: [Health],
  migrations: ['dist/src/modules/sqlite/migrations/*.js'],
  // logging: true,
});

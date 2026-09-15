/**
 * Single registration point for all TypeORM migrations.
 *
 * Consumed by BOTH `data-source.ts` (CLI) and `sqlite.module.ts` (runtime).
 * Static import — no filesystem glob — so it works in the ncc Docker bundle.
 *
 * Future migrations: append to the MIGRATIONS array below.
 */
import { InitSchema1788454880680 } from './1788454880680-InitSchema';
import { PicoUnitFirmwareVersionApiVersion1789485932426 } from './1789485932426-PicoUnitFirmwareVersionApiVersion';

export const MIGRATIONS = [
  InitSchema1788454880680,
  PicoUnitFirmwareVersionApiVersion1789485932426,
];

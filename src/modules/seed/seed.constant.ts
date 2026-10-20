/**
 * Demo-seeding catalogue constants. The batch roster in `seed-data/batches.ts`
 * is authored to these counts; the e2e suite asserts against them.
 */
export const TOTAL_BATCHES = 17;
export const FINISHED = 10;
export const IN_PROGRESS = 4;
export const PLANNED = 3;

/** Days of backdated 60 s readings the seeder generates per live unit. */
export const SEED_READINGS_DEFAULT_DAYS = 14;

/** Multi-row insert batch size for the readings backfill. */
export const SEED_INSERT_CHUNK = 500;

/** Seed cadence: one row per minute, matching the cron poll interval. */
export const SEED_READINGS_CADENCE_MS = 60_000;

/**
 * Continuity envelope between the last seeded reading and the unit's active
 * batch setpoints. The first live poll continues from the seeded series, so
 * the walk must terminate inside the hysteresis band a real unit traverses in
 * one poll interval (worst-case ~±1 °C / ±5 %RH). The e2e asserts against it.
 */
export const SEED_CONTINUITY_TOLERANCE = {
  temperatureC: 1,
  humidityPct: 5,
} as const;

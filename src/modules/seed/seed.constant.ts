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

/**
 * The climate swing a seeded series must span around its own setpoint, for
 * units on a stable (non-drifting) profile. DHT11-class precision is ±1 °C,
 * so this is deliberately an imperfect-hysteresis band, not a deadband: a
 * seeded series reaches at least this far BELOW and at least this far ABOVE
 * its target. The humidity upper side is read as
 * `min(target + humidityPct, HUMIDITY_MAX)` — seeded targets sit at 85–90 %RH
 * and `HUMIDITY_MAX` is 90, so the upper side clips at the sensor's real
 * saturation ceiling. That clipping is accepted, not worked around: the
 * seeded targets are not lowered and `HUMIDITY_MAX` is not raised for it.
 */
export const SEED_CLIMATE_BAND = { temperatureC: 3, humidityPct: 15 } as const;

/**
 * Per-step noise span of the mean-reverting walk, expressed as the width of
 * the uniform draw (`(rand() - 0.5) * amplitude`) and tuned so the realised
 * series spans `SEED_CLIMATE_BAND` — the amplitude is NOT the band, the
 * reversion coefficient (0.05) shrinks it. Measured over the seeded grids of
 * the demo roster (reversion held at 0.05, all rows integer-valued):
 * - `temperatureC: 1.2` spans ±4–5 °C around target (band asks ±3);
 * - `humidityPct: 4.8` spans −16 to −18 %RH below target and reaches the
 *   `HUMIDITY_MAX` ceiling above it (band asks ±15).
 * Sanity ceilings so a later retune cannot quietly inflate the demo: the
 * realised temperature extreme stays within ±6 °C of target, and the realised
 * humidity minimum stays no lower than `target - 22`. Widening past either
 * ceiling means the band assertion, not the amplitude, is what needs rework.
 */
export const SEED_NOISE_AMPLITUDE = {
  temperatureC: 1.2,
  humidityPct: 4.8,
} as const;

/**
 * Excursion of the wandering profile (`tent-three`), layered on top of
 * `SEED_NOISE_AMPLITUDE` rather than replacing it. A mean-reverting walk
 * chases a slowly-swinging setpoint, so these add to the noise band: the
 * drifting unit reads roughly ±8 °C and down to −36 %RH against its target,
 * which is what keeps the drift story visible above the widened floor.
 * Temperature swings both ways (a full sine); humidity is one-directional
 * DOWNWARD — a drifting sensor reads dry, and that asymmetry is the demo.
 * Both terms vanish at the ends of the series, so the tail blend and the
 * continuity envelope are untouched, and the excursion stays inside the
 * climate bounds without pinning the series against them.
 */
export const SEED_DRIFT_EXCURSION = {
  temperatureC: 4.5,
  humidityPct: -20,
} as const;

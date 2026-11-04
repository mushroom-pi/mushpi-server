import { IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';

import {
  HUMIDITY_MAX,
  HUMIDITY_MIN,
  TEMPERATURE_MAX,
  TEMPERATURE_MIN,
} from 'src/common/constants/climate.constants';
import { Batch } from 'src/modules/batches/batches.entity';
import { Readings } from 'src/modules/readings/readings.entity';

import {
  SEED_DRIFT_EXCURSION,
  SEED_INSERT_CHUNK,
  SEED_NOISE_AMPLITUDE,
  SEED_READINGS_CADENCE_MS,
} from './seed.constant';

/**
 * Self-contained demo readings generator — deliberately NOT a port of the
 * firmware hysteresis loop. It produces a believable 60 s-spaced series
 * (sensor walk + relay latches + board metrics + setpoint snapshots) that
 * satisfies the seed ⇄ live-poll join contract:
 *
 * - cadence 60 s over [startTs, endTs], one row per interval;
 * - temperature and humidity are whole numbers — DHT11 precision is ±1 °C,
 *   so a seeded read never carries a decimal (the mock rounds the same way).
 *   The `Readings.temperature` column stays a float; only the values are
 *   whole. Quantisation happens on the emitted row, never on the walk state,
 *   so it cannot feed back into the mean-reversion term;
 * - a stable unit fluctuates at least `SEED_CLIMATE_BAND` around its target,
 *   clipped only by the climate bounds — whose `HUMIDITY_MAX` is the DHT11's
 *   real saturation ceiling and the one legitimate bound here;
 * - the walk TERMINATES on the unit's active-batch setpoints (tail blend),
 *   so the first live poll continues inside the hysteresis band;
 * - the series ends at `seedEndTs`, never advancing past it.
 */

/**
 * Freeze the seeded/live boundary: the last whole minute at least one poll
 * interval before `now`. Computed once at seed start; live rows are exactly
 * those with `ts > seedEndTs`.
 */
export function computeSeedEndTs(now: number = Date.now()): Date {
  const ms =
    Math.floor((now - SEED_READINGS_CADENCE_MS) / SEED_READINGS_CADENCE_MS) *
    SEED_READINGS_CADENCE_MS;
  return new Date(ms);
}

/**
 * Watermark guard — a unit is "already seeded" iff at least one reading
 * exists at or below the boundary. It is deliberately NOT a total-row-count
 * guard: skipping on total count would truncate the series once live polls
 * have appended rows and block the continuation.
 */
export function seededReadingCount(
  repo: Repository<Readings>,
  picoUnitId: number,
  seedEndTs: Date,
): Promise<number> {
  return repo.count({
    where: { pico_unit_id: picoUnitId, ts: LessThanOrEqual(seedEndTs) },
  });
}

/** The active (in-progress) batch whose setpoints anchor the walk's end. */
export function findActiveBatchForUnit(
  repo: Repository<Batch>,
  picoUnitId: number,
  now: Date,
): Promise<Batch | null> {
  // Find operators (not raw string predicates) — TypeORM binds the Date
  // objects safely against datetime columns (REFERENCE.md §Raw SQL).
  return repo.findOne({
    where: [
      {
        pico_unit_id: picoUnitId,
        start_at: LessThanOrEqual(now),
        finish_at: IsNull(),
      },
      {
        pico_unit_id: picoUnitId,
        start_at: LessThanOrEqual(now),
        finish_at: MoreThan(now),
      },
    ],
    order: { start_at: 'DESC' },
  });
}

/**
 * The unit's earliest STARTED batch at or below the frozen boundary
 * (finished + in-progress). Planned batches start in the future and never
 * contribute — the readings phase must not fabricate future timestamps or
 * extend history for a run that has not begun.
 */
export function findEarliestStartedBatchStart(
  repo: Repository<Batch>,
  picoUnitId: number,
  seedEndTs: Date,
): Promise<Date | null> {
  return repo
    .findOne({
      where: { pico_unit_id: picoUnitId, start_at: LessThanOrEqual(seedEndTs) },
      order: { start_at: 'ASC' },
      select: ['start_at'],
    })
    .then((batch) => batch?.start_at ?? null);
}

/**
 * First timestamp of a unit's seeded grid. The earlier of two bounds wins:
 * - configured history: `rowCount` cadence steps back from the boundary
 *   (`SEED_READINGS_DAYS`);
 * - batch coverage: one cadence step before the unit's earliest started
 *   batch, so every started batch's `[start_at, finish_at]` window holds at
 *   least one grid reading (windows span days; the grid steps by minutes).
 * The coverage bound is floored onto the boundary-anchored 60 s grid so the
 * series still terminates exactly at the frozen `seedEndTs`.
 */
export function computeSeededStartTs(
  seedEndTs: Date,
  rowCount: number,
  earliestStartedBatchStart: Date | null,
): Date {
  const defaultStartMs =
    seedEndTs.getTime() - (rowCount - 1) * SEED_READINGS_CADENCE_MS;
  if (!earliestStartedBatchStart) return new Date(defaultStartMs);
  const coverageMs =
    earliestStartedBatchStart.getTime() - SEED_READINGS_CADENCE_MS;
  if (coverageMs >= defaultStartMs) return new Date(defaultStartMs);
  const intervals = Math.ceil(
    (seedEndTs.getTime() - coverageMs) / SEED_READINGS_CADENCE_MS,
  );
  return new Date(seedEndTs.getTime() - intervals * SEED_READINGS_CADENCE_MS);
}

export interface ReadingsWalkRequest {
  picoUnitId: number;
  /** First seeded timestamp. */
  startTs: Date;
  /** Last seeded timestamp — the frozen `seedEndTs`. */
  endTs: Date;
  temperatureSet: number;
  humiditySet: number;
  /**
   * Wandering profile (tent-three): a `SEED_DRIFT_EXCURSION` mid-series
   * excursion layered on top of the noise band, returning to the setpoints.
   */
  drift?: boolean;
}

/** Deterministic PRNG (mulberry32) so a reset reproduces one stable series. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rows generated for the inclusive 60 s grid [startTs, endTs]. */
export function readingsRowCount(startTs: Date, endTs: Date): number {
  return (
    Math.round(
      (endTs.getTime() - startTs.getTime()) / SEED_READINGS_CADENCE_MS,
    ) + 1
  );
}

/**
 * Build the full seeded series as entity-shaped plain objects (TypeORM
 * binds the Date `ts` — no hand-formatting). Pure and synchronous; the
 * insert lives in `generateAndInsertReadings`.
 */
export function buildReadingsWalk(
  req: ReadingsWalkRequest,
): Partial<Readings>[] {
  const count = readingsRowCount(req.startTs, req.endTs);
  if (count < 1) return [];

  const rand = mulberry32((req.picoUnitId * 2654435761) >>> 0);
  const tSet = req.temperatureSet;
  const hSet = req.humiditySet;

  // Start near the band with a small initial offset.
  let temperature = tSet + (rand() - 0.5) * 3;
  let humidity = hSet + (rand() - 0.5) * 8;
  // Relay states are seeded against the same whole-number thresholds the loop
  // below uses (see the integer-offset comment there).
  let humidifierOn = humidity < hSet - 3;
  let heaterOn = temperature < tSet - 1;
  let fanOn = false;
  let boardTemp = 36 + rand() * 2;

  // The last rows are linearly blended onto the setpoints so the series is
  // guaranteed to terminate inside the continuity envelope (worst observed
  // per-poll drift is ~±1 °C / ±5 %RH). 20 steps = 20 minutes.
  const tail = Math.min(20, count);

  const rows: Partial<Readings>[] = [];
  for (let i = 0; i < count; i++) {
    const ts = new Date(req.startTs.getTime() + i * SEED_READINGS_CADENCE_MS);

    // The drifting unit's excursion, layered on top of the noise band — a
    // slow sine that is zero at both ends, so the tail blend and the
    // continuity envelope are untouched. Humidity drifts one-directionally
    // DOWN (a drifting sensor reads dry); temperature swings both ways.
    const phase = i / (count - 1 || 1);
    const driftHum = req.drift
      ? SEED_DRIFT_EXCURSION.humidityPct * Math.sin(Math.PI * phase)
      : 0;
    const driftTemp = req.drift
      ? SEED_DRIFT_EXCURSION.temperatureC * Math.sin(2 * Math.PI * phase)
      : 0;

    // Mean-reverting random walk toward (setpoint + excursion). The walk
    // state stays float — quantising it here would feed rounding error back
    // into the reversion term and collapse the band.
    temperature +=
      (tSet + driftTemp - temperature) * 0.05 +
      (rand() - 0.5) * SEED_NOISE_AMPLITUDE.temperatureC;
    humidity +=
      (hSet + driftHum - humidity) * 0.05 +
      (rand() - 0.5) * SEED_NOISE_AMPLITUDE.humidityPct;

    let rowTemp = temperature;
    let rowHum = humidity;
    if (i > count - 1 - tail) {
      const w = (i - (count - 1 - tail)) / (tail - 1 || 1);
      rowTemp = rowTemp * (1 - w) + tSet * w;
      rowHum = rowHum * (1 - w) + hSet * w;
    }

    rowTemp = Math.min(TEMPERATURE_MAX, Math.max(TEMPERATURE_MIN, rowTemp));
    rowHum = Math.min(HUMIDITY_MAX, Math.max(HUMIDITY_MIN, rowHum));

    // DHT11-class precision: whole-number reads, the mock's int(round(...)).
    const tempRead = Math.round(rowTemp);
    const humRead = Math.round(rowHum);

    // Latching relays with hysteresis so they flicker at a believable pace.
    // Every temperature threshold is a WHOLE-number offset of the setpoint,
    // because the values compared against are now whole: fractional offsets
    // would make the cosmetic flags disagree with the sensor read they claim
    // to explain (e.g. `<= tSet - 0.8` and `<= tSet - 1` select the same
    // integers, but only the second one reads as a real deadband).
    if (!humidifierOn && humRead <= hSet - 3) humidifierOn = true;
    else if (humidifierOn && humRead >= hSet + 1) humidifierOn = false;
    if (!heaterOn && tempRead <= tSet - 1) heaterOn = true;
    else if (heaterOn && tempRead >= tSet + 1) heaterOn = false;
    if (!fanOn && (tempRead >= tSet + 2 || humRead >= hSet + 5)) fanOn = true;
    else if (fanOn && tempRead <= tSet && humRead <= hSet + 3) fanOn = false;

    boardTemp +=
      (37.5 + ((i % 240) / 240) * 2 - boardTemp) * 0.02 + (rand() - 0.5) * 0.3;

    rows.push({
      ts,
      temperature: tempRead,
      humidity: humRead,
      fan_on: fanOn,
      humidifier_on: humidifierOn,
      heater_on: heaterOn,
      control_loop_enabled: true,
      temperature_set: tSet,
      humidity_set: hSet,
      board_uptime_s: (600 + i * 60) % 86400,
      board_temp: Math.round(boardTemp * 10) / 10,
      board_used_mem: 320_000 + Math.round((rand() - 0.5) * 40_000),
      board_used_fs: 160_000 + Math.round((rand() - 0.5) * 20_000),
      time_to_response_ms: 90 + Math.round(rand() * 160),
    });
  }
  return rows;
}

/**
 * Generate the walk for one unit and insert it in `SEED_INSERT_CHUNK`
 * row chunks. Returns the number of rows inserted. Callers must apply the
 * watermark guard (and skip offline units) before calling.
 */
export async function generateAndInsertReadings(
  repo: Repository<Readings>,
  req: ReadingsWalkRequest,
): Promise<number> {
  const rows = buildReadingsWalk(req);
  let inserted = 0;
  for (let i = 0; i < rows.length; i += SEED_INSERT_CHUNK) {
    const chunk = rows.slice(i, i + SEED_INSERT_CHUNK).map((r) => ({
      ...r,
      pico_unit_id: req.picoUnitId,
    }));
    await repo.insert(chunk);
    inserted += chunk.length;
  }
  return inserted;
}

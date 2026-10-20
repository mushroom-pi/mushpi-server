import { IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';

import {
  HUMIDITY_MAX,
  HUMIDITY_MIN,
  TEMPERATURE_MAX,
  TEMPERATURE_MIN,
} from 'src/common/constants/climate.constants';
import { Batch } from 'src/modules/batches/batches.entity';
import { Readings } from 'src/modules/readings/readings.entity';

import { SEED_INSERT_CHUNK, SEED_READINGS_CADENCE_MS } from './seed.constant';

/**
 * Self-contained demo readings generator — deliberately NOT a port of the
 * firmware hysteresis loop. It produces a believable 60 s-spaced series
 * (sensor walk + relay latches + board metrics + setpoint snapshots) that
 * satisfies the seed ⇄ live-poll join contract:
 *
 * - cadence 60 s over [startTs, endTs], one row per interval;
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

export interface ReadingsWalkRequest {
  picoUnitId: number;
  /** First seeded timestamp. */
  startTs: Date;
  /** Last seeded timestamp — the frozen `seedEndTs`. */
  endTs: Date;
  temperatureSet: number;
  humiditySet: number;
  /** Wandering profile (tent-three): mid-series excursion returning to the setpoints. */
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
  let humidifierOn = humidity < hSet - 3;
  let heaterOn = temperature < tSet - 0.8;
  let fanOn = false;
  let boardTemp = 36 + rand() * 2;

  // The last rows are linearly blended onto the setpoints so the series is
  // guaranteed to terminate inside the continuity envelope (worst observed
  // per-poll drift is ~±1 °C / ±5 %RH). 20 steps = 20 minutes.
  const tail = Math.min(20, count);

  const rows: Partial<Readings>[] = [];
  for (let i = 0; i < count; i++) {
    const ts = new Date(req.startTs.getTime() + i * SEED_READINGS_CADENCE_MS);

    // Gentle bounded excursions for the drifting unit — zero at both ends.
    const phase = i / (count - 1 || 1);
    const driftHum = req.drift ? -4 * Math.sin(Math.PI * phase) : 0;
    const driftTemp = req.drift ? 1.5 * Math.sin(2 * Math.PI * phase) : 0;

    // Mean-reverting random walk toward (setpoint + excursion).
    temperature +=
      (tSet + driftTemp - temperature) * 0.05 + (rand() - 0.5) * 0.3;
    humidity += (hSet + driftHum - humidity) * 0.05 + (rand() - 0.5) * 1.6;

    let rowTemp = temperature;
    let rowHum = humidity;
    if (i > count - 1 - tail) {
      const w = (i - (count - 1 - tail)) / (tail - 1 || 1);
      rowTemp = rowTemp * (1 - w) + tSet * w;
      rowHum = rowHum * (1 - w) + hSet * w;
    }

    rowTemp = Math.min(TEMPERATURE_MAX, Math.max(TEMPERATURE_MIN, rowTemp));
    rowHum = Math.min(HUMIDITY_MAX, Math.max(HUMIDITY_MIN, rowHum));

    const temp1 = Math.round(rowTemp * 10) / 10;
    const hum = Math.round(rowHum);

    // Latching relays with hysteresis so they flicker at a believable pace.
    if (!humidifierOn && hum <= hSet - 3) humidifierOn = true;
    else if (humidifierOn && hum >= hSet + 1) humidifierOn = false;
    if (!heaterOn && temp1 <= tSet - 0.8) heaterOn = true;
    else if (heaterOn && temp1 >= tSet + 0.4) heaterOn = false;
    if (!fanOn && (temp1 >= tSet + 1.2 || hum >= hSet + 5)) fanOn = true;
    else if (fanOn && temp1 <= tSet + 0.4 && hum <= hSet + 3) fanOn = false;

    boardTemp +=
      (37.5 + ((i % 240) / 240) * 2 - boardTemp) * 0.02 + (rand() - 0.5) * 0.3;

    rows.push({
      ts,
      temperature: temp1,
      humidity: hum,
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

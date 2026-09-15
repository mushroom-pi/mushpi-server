import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import axios from 'axios';
import { Response } from 'express';
import { createReadStream, promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { pipeline as pipelineCb } from 'stream';
import {
  Between,
  FindOperator,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { promisify } from 'util';

import { READINGS_DEFAULT_POINTS } from 'src/common/constants/pagination.constants';
import {
  DeviceResponseDto,
  validateDeviceResponse,
} from 'src/common/dto/pico-unit-response.dto';
import { LockedException } from 'src/common/exceptions/locked.exception';
import {
  configureAxiosRetry,
  formatPollError,
  getWithFallback,
} from 'src/common/utils/http-fallback';
import { BatchesService } from 'src/modules/batches/batches.service';
import { CustomConfigService } from 'src/modules/config/config.service';
import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';
import { DANGER_TEMPERATURE_C } from 'src/modules/pico-units/pico-units.constant';
import { PicoUnitsService } from 'src/modules/pico-units/pico-units.service';

import { Batch } from '../batches/batches.entity';
import { isReadingInRange } from './readings-range.util';
import {
  AggregatedReadingsResponseDto,
  DownsamplingQueryDto,
  OptionalTimeLimitsQueryDto,
  TimeLimitsQueryDto,
} from './readings.dto';
import { Readings } from './readings.entity';

const pipeline = promisify(pipelineCb);

@Injectable()
export class ReadingsService {
  private readonly logger = new Logger(ReadingsService.name);
  private readonly pollingUnits = new Set<number>();

  constructor(
    @InjectRepository(Readings) private readingsRepo: Repository<Readings>,
    private readonly picoUnitsService: PicoUnitsService,
    private readonly batchesService: BatchesService,
    private readonly configService: CustomConfigService,
  ) {
    configureAxiosRetry(axios);
  }

  async fetchAndValidateReading(unit: PicoUnit, path: string) {
    const t0 = new Date();
    let r;
    try {
      r = await getWithFallback(unit, path, { timeout: 10000 });
    } catch (error) {
      // No-response errors (EHOSTUNREACH, ECONNREFUSED, etc.) → 502
      if (axios.isAxiosError(error) && !error.response) {
        throw new BadGatewayException(formatPollError(unit, error));
      }
      // HTTP-response errors (e.g. Pico returns 500) and non-axios errors
      // (validation, lock, etc.) propagate unchanged.
      throw error;
    }
    const t1 = new Date();
    const durationMs = Number(t1.getTime() - t0.getTime());
    const { errors } = await validateDeviceResponse(r.data);
    if (errors.length) throw new PreconditionFailedException(errors);

    return { response: r.data as DeviceResponseDto, durationMs };
  }

  async createFromDeviceResponse(
    unit: PicoUnit,
    device: DeviceResponseDto,
    time_to_response_ms: number,
  ): Promise<Readings> {
    // Map fields safely with null checks
    const reading: Partial<Readings> = {
      ts: undefined,
      temperature: device?.sensors?.dht?.temperature ?? null,
      humidity: device?.sensors?.dht?.humidity ?? null,
      last_sensor_err: device?.sensors?.dht?.last_error ?? null,
      fan_on: Boolean(device?.outputs?.fan),
      humidifier_on: Boolean(device?.outputs?.humidifier),
      heater_on: Boolean(device?.outputs?.heater),
      control_loop_enabled: Boolean(device?.control_loop_enabled),
      temperature_set: device?.setpoints?.temperature ?? null,
      humidity_set: device?.setpoints?.humidity ?? null,
      board_uptime_s: device?.health?.uptime_s ?? 0,
      board_temp: device?.health?.mcu_temp_c ?? 0,
      board_used_mem: device?.health?.mem?.used ?? 0,
      board_used_fs: device?.health?.fs?.used ?? 0,
      time_to_response_ms,
      pico_unit_id: unit.id,
    };

    // remove undefined values (TypeORM can accept nulls where allowed)
    Object.keys(reading).forEach((k) => {
      if (reading[k] === undefined) delete reading[k];
    });

    const created = this.readingsRepo.create(reading as Partial<Readings>);
    return this.readingsRepo.save(created);
  }

  async pollReadingsFromUnit(
    unit: PicoUnit,
  ): Promise<{ reading: Readings | null; response: DeviceResponseDto }> {
    if (this.pollingUnits.has(unit.id))
      throw LockedException({
        description: `This Pico unit (${unit.id}) is already being polled`,
      });

    this.pollingUnits.add(unit.id);
    try {
      this.logger.log(`Polling data from pico unit ${unit.id}`);
      const { response, durationMs } = await this.fetchAndValidateReading(
        unit,
        '/?force=1',
      );
      const mac = response?.system?.wifi?.mac;
      await this.picoUnitsService.touchAndResetFailedCalls(unit, mac, {
        firmware_version: response?.firmware_version,
        api_version: response?.api_version,
      });

      // Skip zero-value sensor readings (sensor glitch / warmup noise)
      const rawTemp = response?.sensors?.dht?.temperature;
      const rawHum = response?.sensors?.dht?.humidity;
      if (rawTemp === 0 || rawHum === 0) {
        this.logger.warn(
          `Skipping zero-value sensor reading for unit ${unit.id} ` +
            `(temp=${rawTemp}, humidity=${rawHum}) — treated as sensor noise`,
        );
        return { reading: null, response };
      }

      // Check for empty (null) sensor readings — distinct from out-of-range
      const bothEmpty = rawTemp == null && rawHum == null;

      if (bothEmpty) {
        unit = await this.picoUnitsService.addEmptyReading(unit);
        this.logger.warn(
          `Empty sensor reading on unit ${unit.handle} — consecutive: ${unit.consecutive_empty_readings}`,
        );
        return { reading: null, response }; // No reading row persisted
      }

      // At least one sensor value is present — reset empty counter
      unit = await this.picoUnitsService.resetEmptyReadings(unit);

      // Sensor range validation (DHT11 plausible bounds)
      if (!isReadingInRange(rawTemp, rawHum)) {
        this.logger.warn(
          `Out-of-range DHT11 reading for unit ${unit.id} (temp=${rawTemp}, humidity=${rawHum})`,
        );
        await this.picoUnitsService.addFailedReading(unit);
        return { reading: null, response };
      }

      // Danger-temperature warning (in-range but hazardous — does NOT block persistence)
      if (rawTemp != null && rawTemp > DANGER_TEMPERATURE_C) {
        this.logger.warn(
          `Dangerous temperature for unit ${unit.id}: ${rawTemp}°C (>${DANGER_TEMPERATURE_C}°C)`,
        );
      }

      const reading = await this.createFromDeviceResponse(
        unit,
        response,
        durationMs,
      );

      // Successful persist — reset the sensor fault counter
      await this.picoUnitsService.resetFailedReadings(unit);

      return { reading, response };
    } catch (e) {
      await this.picoUnitsService.addFailedCall(unit);
      throw e;
    } finally {
      // Whatever happens, remove this unit from the polling set
      this.pollingUnits.delete(unit.id);
    }
  }

  async pollReadingsFromAllEnabled(): Promise<void> {
    const picoUnits = await this.picoUnitsService.listMonitored();

    const results = await Promise.allSettled(
      picoUnits.map((unit) => this.pollReadingsFromUnit(unit)),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        this.logger.warn(formatPollError(picoUnits[i], result.reason));
      }
    }
  }

  /**
   * Convert a Date to SQLite's native datetime format (YYYY-MM-DD HH:MM:SS.SSS)
   * for correct lexicographic comparison against stored `ts` values.
   */
  private toSqliteDatetime(date: Date): string {
    return date.toISOString().replace('T', ' ').replace('Z', '');
  }

  private validateTimeFrame(
    startIso?: string,
    endIso?: string,
  ): { ts: FindOperator<Date>; start: Date; end: Date } {
    // parse & validate dates
    let start: Date | undefined;
    let end: Date | undefined;

    if (startIso) {
      start = new Date(startIso);
      if (Number.isNaN(start.getTime())) {
        throw new BadRequestException('Invalid start date');
      }
    }
    if (endIso) {
      end = new Date(endIso);
      if (Number.isNaN(end.getTime())) {
        throw new BadRequestException('Invalid end date');
      }
    }
    if (start && end && start.getTime() > end.getTime()) {
      throw new BadRequestException('start must be <= end');
    }

    let ts: FindOperator<Date>;
    if (start && end) {
      ts = Between(start, end);
    } else if (start) {
      ts = MoreThanOrEqual(start);
    } else if (end) {
      ts = LessThanOrEqual(end);
    }

    return { ts, start, end };
  }

  private validateTimeFrameForBatch(
    batch: Batch,
    query: OptionalTimeLimitsQueryDto,
  ): { start: string; end: string } {
    // baseline window from batch
    const batchStartMs = batch.start_at?.getTime() ?? 0;
    // if finish_at is null, treat upper bound as "now"
    const batchFinishMs = batch.finish_at
      ? batch.finish_at.getTime()
      : Date.now();

    // helper to parse and validate ISO date string -> ms
    const parseIsoToMs = (iso?: string | undefined): number | undefined => {
      if (!iso) return undefined;
      const ms = Date.parse(iso);
      if (Number.isNaN(ms)) {
        throw new BadRequestException(`Invalid date format: ${iso}`);
      }
      return ms;
    };

    const requestedStartMs = parseIsoToMs(query.start);
    const requestedEndMs = parseIsoToMs(query.end);

    // if neither start nor end provided -> use batch window
    let effectiveStartMs = requestedStartMs ?? batchStartMs;
    let effectiveEndMs = requestedEndMs ?? batchFinishMs;

    // clamp to batch window
    if (effectiveStartMs < batchStartMs) effectiveStartMs = batchStartMs;
    if (effectiveEndMs > batchFinishMs) effectiveEndMs = batchFinishMs;

    if (
      effectiveStartMs &&
      effectiveEndMs &&
      effectiveStartMs > effectiveEndMs
    ) {
      throw new BadRequestException(
        'start must be <= end and both must be within the batch time limits',
      );
    }

    return {
      start: new Date(effectiveStartMs).toISOString(),
      end: new Date(effectiveEndMs).toISOString(),
    };
  }

  async listForUnit(
    pico_unit_id: number,
    query: DownsamplingQueryDto,
  ): Promise<AggregatedReadingsResponseDto> {
    const points = query.points ?? READINGS_DEFAULT_POINTS;
    const { start, end } = this.validateTimeFrame(query.start, query.end);

    // Build dynamic WHERE clause
    const conditions: string[] = ['pico_unit_id = ?'];
    const params: (string | number)[] = [pico_unit_id];

    if (start) {
      conditions.push('ts >= ?');
      params.push(this.toSqliteDatetime(start));
    }
    if (end) {
      conditions.push('ts <= ?');
      params.push(this.toSqliteDatetime(end));
    }

    const whereClause = conditions.join(' AND ');

    // Count actual readings in the window
    const countRows = await this.readingsRepo.query(
      `SELECT COUNT(*) AS cnt FROM readings WHERE ${whereClause}`,
      params,
    );
    const actualReadings = Number(countRows[0]?.cnt ?? 0);

    if (actualReadings === 0) {
      return { data: [], points, actualReadings: 0 };
    }

    // NTILE aggregation query
    const rows = await this.readingsRepo.query(
      `SELECT
        MIN(ts) AS timestamp,
        ROUND(AVG(temperature), 1) AS temperature,
        ROUND(AVG(humidity), 1) AS humidity,
        MIN(temperature) AS tempMin,
        MAX(temperature) AS tempMax,
        MIN(humidity) AS humidityMin,
        MAX(humidity) AS humidityMax,
        COUNT(*) AS readingCount,
        SUM(CASE WHEN fan_on = 1 THEN 1 ELSE 0 END) AS fanOnCount,
        SUM(CASE WHEN humidifier_on = 1 THEN 1 ELSE 0 END) AS humidifierOnCount,
        SUM(CASE WHEN heater_on = 1 THEN 1 ELSE 0 END) AS heaterOnCount,
        SUM(CASE WHEN control_loop_enabled = 1 THEN 1 ELSE 0 END) AS controlLoopEnabledCount,
        MAX(temperature_set) AS temperatureSet,
        MAX(humidity_set) AS humiditySet
      FROM (
        SELECT ts, temperature, humidity, fan_on, humidifier_on, heater_on, control_loop_enabled, temperature_set, humidity_set, NTILE(?) OVER (ORDER BY ts) AS bucket
        FROM readings
        WHERE ${whereClause}
      )
      GROUP BY bucket
      ORDER BY bucket`,
      [points, ...params],
    );

    const data = rows.map((row: any) => ({
      // SQLite stores datetime as 'YYYY-MM-DD HH:MM:SS.SSS' (no timezone).
      // Treat as UTC by appending 'Z' after converting space to 'T'.
      timestamp: new Date(row.timestamp.replace(' ', 'T') + 'Z').toISOString(),
      temperature: row.temperature ?? null,
      humidity: row.humidity ?? null,
      tempMin: row.tempMin ?? null,
      tempMax: row.tempMax ?? null,
      humidityMin: row.humidityMin ?? null,
      humidityMax: row.humidityMax ?? null,
      readingCount: Number(row.readingCount),
      fanOnCount: Number(row.fanOnCount),
      humidifierOnCount: Number(row.humidifierOnCount),
      heaterOnCount: Number(row.heaterOnCount),
      controlLoopEnabledCount: Number(row.controlLoopEnabledCount),
      temperatureSet: row.temperatureSet ?? null,
      humiditySet: row.humiditySet ?? null,
    }));

    return { data, points, actualReadings };
  }

  async listForBatch(
    batchId: number,
    query: DownsamplingQueryDto,
  ): Promise<AggregatedReadingsResponseDto> {
    const batch = await this.batchesService.getByIdOrThrow(batchId);
    const { start, end } = this.validateTimeFrameForBatch(batch, {
      start: query.start,
      end: query.end,
    });

    const delegatedQuery: DownsamplingQueryDto = {
      points: query.points,
      start,
      end,
    };

    return this.listForUnit(batch.pico_unit_id, delegatedQuery);
  }

  async latestForUnit(pico_unit_id: number): Promise<Readings | null> {
    return this.readingsRepo.findOne({
      where: { pico_unit_id },
      order: { ts: 'DESC' },
    });
  }

  async getPicoUnitWithLatestReadingById(
    pico_unit_id: number,
  ): Promise<PicoUnit> {
    const unit = await this.picoUnitsService.getByIdOrThrow(pico_unit_id);
    const latest = await this.latestForUnit(pico_unit_id);

    (unit as any).latest_reading = latest ?? undefined;
    return unit;
  }

  async deleteOlderThanMonths(months?: number): Promise<number> {
    const retentionMonths =
      months ?? this.configService.readings.retentionMonths;
    if (retentionMonths <= 0) {
      throw new BadRequestException('months must be a positive integer');
    }

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - retentionMonths);

    const res = await this.readingsRepo
      .createQueryBuilder()
      .delete()
      .from(Readings)
      .where('ts < :cutoff', { cutoff: cutoff.toISOString() })
      .execute();

    return res.affected ?? 0;
  }

  async countAll(): Promise<number> {
    return this.readingsRepo.count();
  }

  private async exportReadingsToCsv(
    pico_unit_id: number,
    startIso?: string,
    endIso?: string,
  ): Promise<{ filepath: string; filename: string; count: number }> {
    const { ts, start, end } = this.validateTimeFrame(startIso, endIso);
    const where: any = {
      pico_unit_id,
      ts,
    };

    const items = await this.readingsRepo.find({
      where,
      order: { ts: 'ASC' },
    });

    // CSV header
    const headers = [
      'id',
      'ts',
      'temperature',
      'humidity',
      'last_sensor_err',
      'fan_on',
      'humidifier_on',
      'heater_on',
      'control_loop_enabled',
      'temperature_set',
      'humidity_set',
      'board_uptime_s',
      'board_temp',
      'board_used_mem',
      'board_used_fs',
      'time_to_response_ms',
      'pico_unit_id',
    ];

    // helper to safely CSV-escape a value
    const csvEscape = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      const s = v instanceof Date ? v.toISOString() : String(v);
      // If contains double quotes or comma or newline, wrap in quotes and escape quotes by doubling
      if (/[,"\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    // build CSV content
    const rows: string[] = [];
    rows.push(headers.join(',')); // header row

    for (const it of items) {
      const row = [
        it.id,
        it.ts
          ? it.ts instanceof Date
            ? it.ts.toISOString()
            : String(it.ts)
          : '',
        it.temperature,
        it.humidity,
        it.last_sensor_err,
        it.fan_on,
        it.humidifier_on,
        it.heater_on,
        it.control_loop_enabled,
        it.temperature_set,
        it.humidity_set,
        it.board_uptime_s,
        it.board_temp,
        it.board_used_mem,
        it.board_used_fs,
        it.time_to_response_ms,
        it.pico_unit_id,
      ].map(csvEscape);

      rows.push(row.join(','));
    }

    const filenameStart = start
      ? new Date(start).toISOString().replace(/[:.]/g, '-')
      : 'start';
    const filenameEnd = end
      ? new Date(end).toISOString().replace(/[:.]/g, '-')
      : 'end';
    const filename = `readings_unit-${pico_unit_id}_${filenameStart}_${filenameEnd}_${Date.now()}.csv`;
    const filepath = path.join(tmpdir(), filename);

    // write file
    await fs.writeFile(filepath, rows.join('\n'), { encoding: 'utf8' });

    return { filepath, filename, count: items.length };
  }

  private async streamResponse(
    { filepath, filename }: { filepath: string; filename: string },
    res: Response,
  ) {
    // verify file exists before streaming (optional but helpful)
    try {
      await fs.access(filepath);
    } catch (err) {
      this.logger.error(err);
      throw new NotFoundException('Export file not found');
    }

    // set headers for download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    // tell browser to download with suggested filename
    // wrap filename in quotes to be safe with spaces
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // optional: set cache headers if desired
    res.setHeader('Cache-Control', 'no-store');

    // stream file to response; pipeline will forward errors to thrown exception
    try {
      const stream = createReadStream(filepath);
      await pipeline(stream, res);
    } finally {
      // always attempt to remove temp file (ignore error)
      await fs.unlink(filepath).catch(() => undefined);
    }

    // pipeline wrote the response already, return nothing
    return;
  }

  async exportCsvForUnit(
    unit: PicoUnit,
    query: TimeLimitsQueryDto,
    res: Response,
  ): Promise<void> {
    const exported = await this.exportReadingsToCsv(
      unit.id,
      query.start,
      query.end,
    );
    await this.streamResponse(exported, res);
  }

  async exportCsvForBatch(
    batch: Batch,
    query: OptionalTimeLimitsQueryDto,
    res: Response,
  ): Promise<void> {
    const { start, end } = this.validateTimeFrameForBatch(batch, query);
    const exported = await this.exportReadingsToCsv(
      batch.pico_unit_id,
      start,
      end,
    );
    await this.streamResponse(exported, res);
  }
}

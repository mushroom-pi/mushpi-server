import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import axios from 'axios';
import axiosRetry from 'axios-retry';
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

import {
  DeviceResponseDto,
  validateDeviceResponse,
} from 'src/common/dto/pico-unit-response.dto';
import { LockedException } from 'src/common/exceptions/locked.exception';
import { BatchesService } from 'src/modules/batches/batches.service';
import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';
import { PicoUnitsService } from 'src/modules/pico-units/pico-units.service';

import { Batch } from '../batches/batches.entity';
import {
  ListReadingsQueryDto,
  OptionalTimeLimitsQueryDto,
  ReadingsListResponseDto,
  TimeLimitsQueryDto,
} from './readings.dto';
import { Readings } from './readings.entity';

const pipeline = promisify(pipelineCb);

@Injectable()
export class ReadingsService {
  private readonly logger = new Logger(ReadingsService.name);
  private isPolling: boolean = false;

  constructor(
    @InjectRepository(Readings) private readingsRepo: Repository<Readings>,
    private readonly picoUnitsService: PicoUnitsService,
    private readonly batchesService: BatchesService,
  ) {
    axiosRetry(axios, { retryDelay: axiosRetry.exponentialDelay });
  }

  async fetchAndValidateReading(url: string) {
    const t0 = new Date();
    const r = await axios.get(url, { timeout: 10000 });
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

  async pollReadingsFromUnit(unit: PicoUnit) {
    if (this.isPolling)
      throw LockedException({
        description: 'The system is already polling records from a Pico Unit',
      });

    try {
      this.isPolling = true;
      this.logger.log(`Polling data from pico unit ${unit.id}`);
      const { response, durationMs } = await this.fetchAndValidateReading(
        `${unit.address}/?force=1`,
      );
      await this.picoUnitsService.touchAndResetFailedCalls(unit);
      const reading = await this.createFromDeviceResponse(
        unit,
        response,
        durationMs,
      );

      return reading;
    } catch (e) {
      await this.picoUnitsService.addFailedCall(unit);
      throw e;
    } finally {
      // Whatever happens, remember that isPolling has to be left as false
      this.isPolling = false;
    }
  }

  async pollReadingsFromAllEnabled(): Promise<void> {
    const picoUnits = await this.picoUnitsService.listEnabled();

    for (const picoUnit of picoUnits) {
      try {
        await this.pollReadingsFromUnit(picoUnit);
      } catch (error) {
        // We don't want conflicts while writting in the database
        this.logger.error(
          `Polling for Pico Unit ${picoUnit.id} couldn't be completed due to: ${JSON.stringify(error)}`,
        );
      }
    }

    return;
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
    query: ListReadingsQueryDto,
  ): Promise<ReadingsListResponseDto> {
    const { start, end, page } = query;
    const take = Math.min(query.limit, 500); // safety cap
    const skip = (Math.max(page, 1) - 1) * take;

    const { ts } = this.validateTimeFrame(start, end);
    const where: any = { pico_unit_id, ts };

    const [items, total] = await this.readingsRepo.findAndCount({
      where,
      order: { ts: 'ASC' }, // chronological: oldest first
      take,
      skip,
    });

    return {
      items,
      page: Math.max(page, 1),
      limit: take,
      total,
      pages: Math.ceil(total / take) || 0,
    };
  }

  async listForBatch(
    batchId: number,
    query: ListReadingsQueryDto,
  ): Promise<ReadingsListResponseDto> {
    const batch = await this.batchesService.getByIdOrThrow(batchId);
    const { start, end } = this.validateTimeFrameForBatch(batch, {
      start: query.start,
      end: query.end,
    });

    // call listForUnit with the effective window as ISO strings (controller/service expects ISO)
    const delegatedQuery: ListReadingsQueryDto = {
      // keep page/limit/potential other fields
      page: query.page,
      limit: query.limit,
      start,
      end,
    } as ListReadingsQueryDto;

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

  async deleteOlderThanMonths(months = 6): Promise<number> {
    if (months <= 0) {
      throw new BadRequestException('months must be a positive integer');
    }

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);

    const res = await this.readingsRepo
      .createQueryBuilder()
      .delete()
      .from(Readings)
      .where('ts < :cutoff', { cutoff: cutoff.toISOString() })
      .execute();

    return res.affected ?? 0;
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

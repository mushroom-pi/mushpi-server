import {
  BadRequestException,
  Injectable,
  Logger,
  PreconditionFailedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import axios from 'axios';
import axiosRetry from 'axios-retry';
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';

import {
  DeviceResponseDto,
  validateDeviceResponse,
} from 'src/common/dto/pico-unit-response.dto';
import { LockedException } from 'src/common/exceptions/locked.exception';
import { BatchesService } from 'src/modules/batches/batches.service';
import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';
import { PicoUnitsService } from 'src/modules/pico-units/pico-units.service';

import { ListReadingsQueryDto, ReadingsListResponseDto } from './readings.dto';
import { Readings } from './readings.entity';

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
    const t0 = process.hrtime.bigint();
    const r = await axios.get(url, { timeout: 10000 });
    const t1 = process.hrtime.bigint();
    const durationMs = Number((t1 - t0) / 1000000n);
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

  async listForUnit(
    pico_unit_id: number,
    query: ListReadingsQueryDto,
  ): Promise<ReadingsListResponseDto> {
    const { start: startIso, end: endIso, page } = query;
    const take = Math.min(query.limit, 500); // safety cap
    const skip = (Math.max(page, 1) - 1) * take;

    // parse dates if provided
    const start = startIso ? new Date(startIso) : undefined;
    const end = endIso ? new Date(endIso) : undefined;

    // validate parsed dates
    if (startIso && Number.isNaN(start!.getTime())) {
      throw new BadRequestException('Invalid start date');
    }
    if (endIso && Number.isNaN(end!.getTime())) {
      throw new BadRequestException('Invalid end date');
    }
    if (start && end && start.getTime() > end.getTime()) {
      throw new BadRequestException('start must be <= end');
    }

    // build where clause
    const where: any = { pico_unit_id };

    if (start && end) {
      where.ts = Between(start, end);
    } else if (start) {
      where.ts = MoreThanOrEqual(start);
    } else if (end) {
      where.ts = LessThanOrEqual(end);
    }

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

    // call listForUnit with the effective window as ISO strings (controller/service expects ISO)
    const delegatedQuery: ListReadingsQueryDto = {
      // keep page/limit/potential other fields
      page: query.page,
      limit: query.limit,
      start: new Date(effectiveStartMs).toISOString(),
      end: new Date(effectiveEndMs).toISOString(),
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
}

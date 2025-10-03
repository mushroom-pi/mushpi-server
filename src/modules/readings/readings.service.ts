import { Injectable, PreconditionFailedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import axios from 'axios';
import axiosRetry from 'axios-retry';
import { Repository } from 'typeorm';

import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';
import { PicoUnitsService } from 'src/modules/pico-units/pico-units.service';

import {
  DeviceResponseDto,
  validateDeviceResponse,
} from './pico-unit-response.dto';
import { ReadingsListResponseDto } from './readings.dto';
import { Readings } from './readings.entity';

@Injectable()
export class ReadingsService {
  constructor(
    @InjectRepository(Readings) private readingsRepo: Repository<Readings>,
    private readonly picoUnitsService: PicoUnitsService,
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
    const { response, durationMs } = await this.fetchAndValidateReading(
      `${unit.address}/?force=1`,
    );
    await this.picoUnitsService.touch(unit);
    return await this.createFromDeviceResponse(unit, response, durationMs);
  }

  async listForUnit(
    pico_unit_id: number,
    page = 1,
    limit = 100,
  ): Promise<ReadingsListResponseDto> {
    const take = Math.min(limit, 500); // safety cap
    const skip = (Math.max(page, 1) - 1) * take;

    const [items, total] = await this.readingsRepo.findAndCount({
      where: { pico_unit_id },
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
}

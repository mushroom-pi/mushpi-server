import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';
import { Readings } from 'src/modules/readings/readings.entity';

export async function seedPicoUnitPartial(
  app: INestApplication,
  data: Partial<PicoUnit> = {},
) {
  const picoRepo = app.get(
    getRepositoryToken(PicoUnit),
  ) as Repository<PicoUnit>;
  const u = picoRepo.create({
    handle: data.handle ?? `unit-${Math.random().toString(16).slice(2, 6)}`,
    host: data.host ?? '127.0.0.1',
    port: data.port ?? 5000,
    monitored: data.monitored ?? true,
    last_seen: data.last_seen ?? undefined,
    name: data.name,
    description: data.description,
  } as Partial<PicoUnit>);
  return picoRepo.save(u);
}

export async function seedReadingForUnit(
  app: INestApplication,
  unit: PicoUnit,
  partial: Partial<Readings> = {},
) {
  const readingsRepo = app.get(
    getRepositoryToken(Readings),
  ) as Repository<Readings>;
  const r = readingsRepo.create({
    pico_unit_id: unit.id,
    ts: partial.ts ?? new Date(),
    temperature: partial.temperature ?? null,
    humidity: partial.humidity ?? null,
    last_sensor_err: partial.last_sensor_err,
    fan_on: partial.fan_on ?? false,
    humidifier_on: partial.humidifier_on ?? false,
    heater_on: partial.heater_on ?? false,
    control_loop_enabled: partial.control_loop_enabled ?? false,
    temperature_set: partial.temperature_set ?? null,
    humidity_set: partial.humidity_set ?? null,
    board_uptime_s: partial.board_uptime_s ?? 0,
    board_temp: partial.board_temp ?? 0,
    board_used_mem: partial.board_used_mem ?? 0,
    board_used_fs: partial.board_used_fs ?? 0,
    time_to_response_ms: partial.time_to_response_ms ?? 0,
  } as Partial<Readings>);
  return readingsRepo.save(r);
}

export const sampleDeviceResponse = {
  devices: {
    active_high: false,
    pins: { fan: 7, dht: 4, humidifier: 6, heater: 8 },
  },
  outputs: { humidifier: true, heater: false, fan: false },
  health: {
    uptime_s: 2827,
    mcu_temp_c: 39.7,
    mem: { used_pct: 71, free: 130944, used: 326208, total: 457152 },
    fs: { used_pct: 6, free: 2461696, used: 159744, total: 2621440 },
    wifi: { connected: true, rssi: -65 },
    event_loop_util_pct: 0,
  },
  sensors: {
    dht: {
      humidity: 55,
      last_ok_age_s: 9,
      last_error: null,
      sensor_ok: true,
      temperature: 27,
    },
  },
  control_loop_enabled: true,
  setpoints: { humidity: 60, temperature: 25 },
  system: {
    micropython: {
      build: 'v1',
      version: '1.26.0',
      name: 'micropython',
      version_tuple: [1, 26, 0, ''],
      mpy: null,
    },
    wifi: { ip: '192.168.1.127', port: 5000, mac: '2c:cf:67:be:95:30' },
    software: { device_name: 'pico-unit1', version: '0.1.0' },
    hardware: {
      port: 'rp2',
      cpu: { freq_mhz: 150 },
      platform: 'rp2',
      board: 'Pico',
    },
  },
};

/**
 * Clone `sampleDeviceResponse` with overridden DHT sensor values.
 * Useful for testing zero-reading filters, null sensors, etc.
 */
export function withSensorOverrides(overrides: {
  temperature?: number;
  humidity?: number;
}) {
  const clone = structuredClone(sampleDeviceResponse);
  Object.assign(clone.sensors.dht, overrides);
  return clone;
}

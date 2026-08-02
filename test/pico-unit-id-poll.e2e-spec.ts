import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import axios, { AxiosError } from 'axios';
import request from 'supertest';
import { Repository } from 'typeorm';

import { PicoUnit } from '../src/modules/pico-units/pico-unit.entity';
import { Readings } from '../src/modules/readings/readings.entity';
import { clearPicoUnits, seedPicoUnit } from './fixtures/pico-units.fixtures';
import {
  sampleDeviceResponse,
  withSensorOverrides,
} from './fixtures/readings.fixtures';
import { closeTestApp, createTestApp } from './test-setup';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('POST /pico-units/:picoUnitId/poll', () => {
  let app: INestApplication;
  let picoRepo: Repository<PicoUnit>;
  let readingsRepo: Repository<Readings>;

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();

    picoRepo = app.get(getRepositoryToken(PicoUnit));
    readingsRepo = app.get(getRepositoryToken(Readings));
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(async () => {
    mockedAxios.get.mockReset();
    mockedAxios.post.mockReset();
    mockedAxios.isAxiosError = jest.fn(
      (err: any) => err?.isAxiosError === true,
    ) as any;
    await clearPicoUnits(app);
    await readingsRepo.clear();
  });

  it('returns 404 when unit does not exist', async () => {
    await request(app.getHttpServer())
      .post('/v1/pico-units/9999/poll')
      .expect(404);
  });

  it('returns 410 Gone when unit is unmonitored', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'poll-disabled',
      port: 5100,
      monitored: false,
    });

    await request(app.getHttpServer())
      .post(`/v1/pico-units/${unit.id}/poll`)
      .expect(410);

    expect(mockedAxios.get).not.toHaveBeenCalled();
    const count = await readingsRepo.count();
    expect(count).toBe(0);
  });

  it('fetches device, persists reading, returns PicoUnit with latest_reading', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'poll-ok',
      port: 5101,
    });

    mockedAxios.get.mockResolvedValueOnce({
      data: sampleDeviceResponse,
      status: 200,
    });

    const before = (await picoRepo.findOneBy({ id: unit.id }))!.last_seen;

    const res = await request(app.getHttpServer())
      .post(`/v1/pico-units/${unit.id}/poll`)
      .expect(201);

    expect(res.body.id).toBe(unit.id);
    expect(res.body.handle).toBe('poll-ok');

    expect(res.body.latest_reading).toBeDefined();
    expect(typeof res.body.latest_reading.id).toBe('number');
    expect(res.body.latest_reading.pico_unit_id).toBe(unit.id);
    expect(res.body.latest_reading.time_to_response_ms).toBeGreaterThanOrEqual(
      0,
    );

    // devices block is passed through from the live Pico response
    expect(res.body.devices).toBeDefined();
    expect(res.body.devices.active_high).toBe(false);
    expect(res.body.devices.pins).toEqual({
      fan: 7,
      dht: 4,
      humidifier: 6,
      heater: 8,
    });

    const readingCount = await readingsRepo.count();
    expect(readingCount).toBe(1);

    const after = (await picoRepo.findOneBy({ id: unit.id }))!.last_seen;
    expect(new Date(after!).getTime()).toBeGreaterThan(
      new Date(before!).getTime(),
    );

    const updatedUnit = (await picoRepo.findOneBy({ id: unit.id }))!;
    expect(updatedUnit.failed_calls).toBe(0);

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'http://poll-ok.local:5101/?force=1',
      { timeout: 10000 },
    );
  });

  it('resets failed_calls on successful poll', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'poll-reset',
      port: 5102,
      failed_calls: 5,
    });

    mockedAxios.get.mockResolvedValueOnce({
      data: sampleDeviceResponse,
      status: 200,
    });

    await request(app.getHttpServer())
      .post(`/v1/pico-units/${unit.id}/poll`)
      .expect(201);

    const updated = (await picoRepo.findOneBy({ id: unit.id }))!;
    expect(updated.failed_calls).toBe(0);
  });

  it('returns 412 on invalid device payload and does not persist', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'poll-bad',
      port: 5103,
    });

    mockedAxios.get.mockResolvedValueOnce({
      data: { bad: 'payload' },
      status: 200,
    });

    await request(app.getHttpServer())
      .post(`/v1/pico-units/${unit.id}/poll`)
      .expect(412);

    const readingCount = await readingsRepo.count();
    expect(readingCount).toBe(0);

    const updated = (await picoRepo.findOneBy({ id: unit.id }))!;
    expect(updated.failed_calls).toBe(1);
  });

  it('maps network failure to 502 and does not persist', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'poll-netfail',
      port: 5104,
      ip: '10.0.0.12',
    });

    const networkError = Object.assign(new Error('no route'), {
      isAxiosError: true,
      request: {},
    });

    mockedAxios.get
      .mockRejectedValueOnce(networkError as AxiosError)
      .mockRejectedValueOnce(networkError as AxiosError);

    await request(app.getHttpServer())
      .post(`/v1/pico-units/${unit.id}/poll`)
      .expect(502);

    const readingCount = await readingsRepo.count();
    expect(readingCount).toBe(0);

    const updated = (await picoRepo.findOneBy({ id: unit.id }))!;
    expect(updated.failed_calls).toBe(1);

    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });

  it('maps EHOSTUNREACH to 502 with a human-readable message', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'poll-eunreach',
      port: 5129,
      ip: '10.0.0.29',
    });

    const hostUnreachable = Object.assign(new Error('No route to host'), {
      isAxiosError: true,
      code: 'EHOSTUNREACH',
      request: {},
    });

    mockedAxios.get
      .mockRejectedValueOnce(hostUnreachable as AxiosError)
      .mockRejectedValueOnce(hostUnreachable as AxiosError);

    const res = await request(app.getHttpServer())
      .post(`/v1/pico-units/${unit.id}/poll`)
      .expect(502);

    expect(res.body.message).toMatch(
      /Pico unit \d+ unreachable \(EHOSTUNREACH: /,
    );

    // mDNS + IP fallback
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);

    // No reading persisted
    const readingCount = await readingsRepo.count();
    expect(readingCount).toBe(0);

    const updated = (await picoRepo.findOneBy({ id: unit.id }))!;
    expect(updated.failed_calls).toBe(1);
  });

  it('falls back to IP when mDNS fails', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'poll-fallback',
      port: 5105,
      ip: '10.0.0.13',
    });

    const networkError = Object.assign(new Error('no route'), {
      isAxiosError: true,
      request: {},
    });

    mockedAxios.get
      .mockRejectedValueOnce(networkError as AxiosError)
      .mockResolvedValueOnce({ data: sampleDeviceResponse, status: 200 });

    const res = await request(app.getHttpServer())
      .post(`/v1/pico-units/${unit.id}/poll`)
      .expect(201);

    expect(res.body.latest_reading).toBeDefined();

    const readingCount = await readingsRepo.count();
    expect(readingCount).toBe(1);

    const firstCallUrl = mockedAxios.get.mock.calls[0][0];
    const secondCallUrl = mockedAxios.get.mock.calls[1][0];
    expect(firstCallUrl).toContain('.local');
    expect(secondCallUrl).toContain('10.0.0.13');
  });

  it('maps remote server error (HTTP 500 from Pico) to 417', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'poll-remote500',
      port: 5106,
      ip: '10.0.0.14',
    });

    const serverError = Object.assign(new Error('remote 500'), {
      isAxiosError: true,
      response: { status: 500, data: 'boom' },
    });

    mockedAxios.get.mockRejectedValueOnce(serverError as AxiosError);

    await request(app.getHttpServer())
      .post(`/v1/pico-units/${unit.id}/poll`)
      .expect(417);

    const readingCount = await readingsRepo.count();
    expect(readingCount).toBe(0);

    const updated = (await picoRepo.findOneBy({ id: unit.id }))!;
    expect(updated.failed_calls).toBe(1);

    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('returns 423 Locked when second concurrent poll arrives', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'poll-lock',
      port: 5107,
    });

    mockedAxios.get.mockImplementationOnce(
      () =>
        new Promise((res) =>
          setTimeout(
            () => res({ data: sampleDeviceResponse, status: 200 }),
            300,
          ),
        ),
    );

    const results = await Promise.all([
      request(app.getHttpServer()).post(`/v1/pico-units/${unit.id}/poll`),
      request(app.getHttpServer()).post(`/v1/pico-units/${unit.id}/poll`),
    ]);

    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 423]);

    const lockedResponse = results.find((r) => r.status === 423);
    const bodyStr = JSON.stringify(lockedResponse!.body).toLowerCase();
    expect(bodyStr).toMatch(/poll|locked/);

    expect(mockedAxios.get).toHaveBeenCalledTimes(1);

    const readingCount = await readingsRepo.count();
    expect(readingCount).toBe(1);
  });

  it('releases lock after failed poll so second request succeeds', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'poll-lockfail',
      port: 5108,
      ip: '10.0.0.17',
    });

    const networkError = Object.assign(new Error('no route'), {
      isAxiosError: true,
      request: {},
    });

    // First poll: both mDNS and IP fail
    mockedAxios.get
      .mockRejectedValueOnce(networkError as AxiosError)
      .mockRejectedValueOnce(networkError as AxiosError);

    const first = await request(app.getHttpServer()).post(
      `/v1/pico-units/${unit.id}/poll`,
    );

    // Second poll: success
    mockedAxios.get.mockResolvedValueOnce({
      data: sampleDeviceResponse,
      status: 200,
    });

    const second = await request(app.getHttpServer()).post(
      `/v1/pico-units/${unit.id}/poll`,
    );

    const statuses = [first.status, second.status];
    expect(statuses).toEqual([502, 201]);

    const readingCount = await readingsRepo.count();
    expect(readingCount).toBe(1);
  });

  describe('zero-reading filter', () => {
    it('skips persisting when temperature is 0 and humidity is valid', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'poll-zero-temp',
        port: 5110,
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: withSensorOverrides({ temperature: 0, humidity: 45 }),
        status: 200,
      });

      const res = await request(app.getHttpServer())
        .post(`/v1/pico-units/${unit.id}/poll`)
        .expect(201);

      // No reading persisted
      const readingCount = await readingsRepo.count();
      expect(readingCount).toBe(0);

      // latest_reading should be absent (no reading stored)
      expect(res.body.latest_reading).toBeUndefined();

      // devices block is still returned even when reading is filtered
      expect(res.body.devices).toBeDefined();
      expect(res.body.devices.pins.fan).toBe(7);

      // last_seen is still updated (touchAndResetFailedCalls runs before filter)
      const updated = await picoRepo.findOneBy({ id: unit.id });
      expect(updated!.last_seen).not.toBeNull();
      expect(updated!.failed_calls).toBe(0);
    });

    it('skips persisting when humidity is 0 and temperature is valid', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'poll-zero-hum',
        port: 5111,
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: withSensorOverrides({ temperature: 22, humidity: 0 }),
        status: 200,
      });

      const res = await request(app.getHttpServer())
        .post(`/v1/pico-units/${unit.id}/poll`)
        .expect(201);

      const readingCount = await readingsRepo.count();
      expect(readingCount).toBe(0);
      expect(res.body.latest_reading).toBeUndefined();

      const updated = await picoRepo.findOneBy({ id: unit.id });
      expect(updated!.last_seen).not.toBeNull();
      expect(updated!.failed_calls).toBe(0);
    });

    it('skips persisting when both temperature and humidity are 0', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'poll-zero-both',
        port: 5112,
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: withSensorOverrides({ temperature: 0, humidity: 0 }),
        status: 200,
      });

      const res = await request(app.getHttpServer())
        .post(`/v1/pico-units/${unit.id}/poll`)
        .expect(201);

      const readingCount = await readingsRepo.count();
      expect(readingCount).toBe(0);
      expect(res.body.latest_reading).toBeUndefined();

      const updated = await picoRepo.findOneBy({ id: unit.id });
      expect(updated!.last_seen).not.toBeNull();
      expect(updated!.failed_calls).toBe(0);
    });

    it('persists reading when both temperature and humidity are non-zero', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'poll-nonzero',
        port: 5113,
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: withSensorOverrides({ temperature: 23, humidity: 55 }),
        status: 200,
      });

      const res = await request(app.getHttpServer())
        .post(`/v1/pico-units/${unit.id}/poll`)
        .expect(201);

      const readingCount = await readingsRepo.count();
      expect(readingCount).toBe(1);

      expect(res.body.latest_reading).toBeDefined();
      expect(res.body.latest_reading.temperature).toBe(23);
      expect(res.body.latest_reading.humidity).toBe(55);
    });
  });

  describe('sensor range validation', () => {
    it('persists reading when values are in-range (happy path)', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'poll-range-ok',
        port: 5120,
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: withSensorOverrides({ temperature: 25, humidity: 60 }),
        status: 200,
      });

      const res = await request(app.getHttpServer())
        .post(`/v1/pico-units/${unit.id}/poll`)
        .expect(201);

      expect(res.body.latest_reading).toBeDefined();
      const readingCount = await readingsRepo.count();
      expect(readingCount).toBe(1);

      const updated = await picoRepo.findOneBy({ id: unit.id });
      expect(updated!.failed_readings).toBe(0);
      expect(updated!.failed_calls).toBe(0);
    });

    it('rejects out-of-range temperature and increments failed_readings', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'poll-range-temph',
        port: 5121,
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: withSensorOverrides({ temperature: 55, humidity: 60 }),
        status: 200,
      });

      const res = await request(app.getHttpServer())
        .post(`/v1/pico-units/${unit.id}/poll`)
        .expect(201);

      expect(res.body.latest_reading).toBeUndefined();
      expect(res.body.devices).toBeDefined();
      expect(res.body.devices.pins.fan).toBe(7);
      const readingCount = await readingsRepo.count();
      expect(readingCount).toBe(0);

      const updated = await picoRepo.findOneBy({ id: unit.id });
      expect(updated!.failed_readings).toBe(1);
      expect(updated!.failed_calls).toBe(0);
    });

    it('rejects out-of-range humidity and increments failed_readings', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'poll-range-hum',
        port: 5122,
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: withSensorOverrides({ temperature: 25, humidity: 5 }),
        status: 200,
      });

      const res = await request(app.getHttpServer())
        .post(`/v1/pico-units/${unit.id}/poll`)
        .expect(201);

      expect(res.body.latest_reading).toBeUndefined();
      const readingCount = await readingsRepo.count();
      expect(readingCount).toBe(0);

      const updated = await picoRepo.findOneBy({ id: unit.id });
      expect(updated!.failed_readings).toBe(1);
    });

    it('single increment when both values are out-of-range', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'poll-range-both',
        port: 5123,
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: withSensorOverrides({ temperature: 55, humidity: 5 }),
        status: 200,
      });

      const res = await request(app.getHttpServer())
        .post(`/v1/pico-units/${unit.id}/poll`)
        .expect(201);

      expect(res.body.latest_reading).toBeUndefined();
      const readingCount = await readingsRepo.count();
      expect(readingCount).toBe(0);

      const updated = await picoRepo.findOneBy({ id: unit.id });
      // Single increment, not two
      expect(updated!.failed_readings).toBe(1);
    });

    it('increments consecutive_empty_readings when both sensors are null (no reading persisted)', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'poll-range-null',
        port: 5124,
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: withSensorOverrides({
          temperature: null as any,
          humidity: null as any,
        }),
        status: 200,
      });

      const res = await request(app.getHttpServer())
        .post(`/v1/pico-units/${unit.id}/poll`)
        .expect(201);

      // No reading persisted — empty sensor data
      expect(res.body.latest_reading).toBeUndefined();
      const readingCount = await readingsRepo.count();
      expect(readingCount).toBe(0);

      const updated = await picoRepo.findOneBy({ id: unit.id });
      expect(updated!.consecutive_empty_readings).toBe(1);
      // Not a range fault
      expect(updated!.failed_readings).toBe(0);
    });

    it('resets failed_readings on recovery after out-of-range polls', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'poll-range-recover',
        port: 5125,
        failed_readings: 4,
      });

      // First poll: out-of-range → failed_readings becomes 5
      mockedAxios.get.mockResolvedValueOnce({
        data: withSensorOverrides({ temperature: 55, humidity: 60 }),
        status: 200,
      });

      await request(app.getHttpServer())
        .post(`/v1/pico-units/${unit.id}/poll`)
        .expect(201);

      let updated = await picoRepo.findOneBy({ id: unit.id });
      expect(updated!.failed_readings).toBe(5);

      // Second poll: in-range → failed_readings resets to 0, reading persisted
      mockedAxios.get.mockResolvedValueOnce({
        data: withSensorOverrides({ temperature: 25, humidity: 60 }),
        status: 200,
      });

      const res = await request(app.getHttpServer())
        .post(`/v1/pico-units/${unit.id}/poll`)
        .expect(201);

      expect(res.body.latest_reading).toBeDefined();
      updated = await picoRepo.findOneBy({ id: unit.id });
      expect(updated!.failed_readings).toBe(0);

      const readingCount = await readingsRepo.count();
      expect(readingCount).toBe(1);
    });

    it('persists reading for dangerous-but-in-range temperature (not a fault)', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'poll-range-danger',
        port: 5126,
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: withSensorOverrides({ temperature: 45, humidity: 60 }),
        status: 200,
      });

      const res = await request(app.getHttpServer())
        .post(`/v1/pico-units/${unit.id}/poll`)
        .expect(201);

      // Reading persisted — valid sensor data, not a fault
      expect(res.body.latest_reading).toBeDefined();
      expect(res.body.latest_reading.temperature).toBe(45);

      const readingCount = await readingsRepo.count();
      expect(readingCount).toBe(1);

      const updated = await picoRepo.findOneBy({ id: unit.id });
      expect(updated!.failed_readings).toBe(0);
    });

    it('zero-reading filter takes precedence over range check (no failed_readings increment)', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'poll-range-zero',
        port: 5127,
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: withSensorOverrides({ temperature: 0, humidity: 60 }),
        status: 200,
      });

      const res = await request(app.getHttpServer())
        .post(`/v1/pico-units/${unit.id}/poll`)
        .expect(201);

      // Zero filter wins — no reading, no range fault
      expect(res.body.latest_reading).toBeUndefined();
      const readingCount = await readingsRepo.count();
      expect(readingCount).toBe(0);

      const updated = await picoRepo.findOneBy({ id: unit.id });
      // Zero is noise, not a range fault
      expect(updated!.failed_readings).toBe(0);
    });

    it('out-of-range path runs inside the lock; second concurrent poll still gets 423', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'poll-range-lock',
        port: 5128,
      });

      // Slow out-of-range response to hold the lock
      mockedAxios.get.mockImplementationOnce(
        () =>
          new Promise((res) =>
            setTimeout(
              () =>
                res({
                  data: withSensorOverrides({ temperature: 55, humidity: 60 }),
                  status: 200,
                }),
              300,
            ),
          ),
      );

      const results = await Promise.all([
        request(app.getHttpServer()).post(`/v1/pico-units/${unit.id}/poll`),
        request(app.getHttpServer()).post(`/v1/pico-units/${unit.id}/poll`),
      ]);

      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 423]);

      // Out-of-range → no reading persisted, failed_readings incremented
      const readingCount = await readingsRepo.count();
      expect(readingCount).toBe(0);

      const updated = await picoRepo.findOneBy({ id: unit.id });
      expect(updated!.failed_readings).toBe(1);
    });
  });

  describe('devices block passthrough', () => {
    it('returns the live devices block from the Pico response even when reading is filtered', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'poll-devices-pass',
        port: 5130,
      });

      // Zero-value filter → no reading row persisted
      mockedAxios.get.mockResolvedValueOnce({
        data: withSensorOverrides({ temperature: 0, humidity: 45 }),
        status: 200,
      });

      const res = await request(app.getHttpServer())
        .post(`/v1/pico-units/${unit.id}/poll`)
        .expect(201);

      // No reading persisted
      expect(res.body.latest_reading).toBeUndefined();
      const readingCount = await readingsRepo.count();
      expect(readingCount).toBe(0);

      // devices block is still returned from the live Pico response
      expect(res.body.devices).toBeDefined();
      expect(res.body.devices.active_high).toBe(false);
      expect(res.body.devices.pins).toEqual({
        fan: 7,
        dht: 4,
        humidifier: 6,
        heater: 8,
      });
    });
  });
});

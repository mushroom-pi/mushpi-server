import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import axios, { AxiosError } from 'axios';
import request from 'supertest';
import { Repository } from 'typeorm';

import { CronService } from 'src/modules/cron/cron.service';
import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';
import { Readings } from 'src/modules/readings/readings.entity';
import { ReadingsService } from 'src/modules/readings/readings.service';

import { clearBatches, seedBatch } from './fixtures/batches.fixtures';
import { clearPicoUnits, seedPicoUnit } from './fixtures/pico-units.fixtures';
import { sampleDeviceResponse } from './fixtures/readings.fixtures';
import { closeTestApp, createModuleFixture, createTestApp } from './test-setup';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const settle = () => new Promise((r) => setTimeout(r, 50));

describe('manual unit pickup parity — scheduled sweep ingestion (default NoopCron fixture)', () => {
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
    mockedAxios.isAxiosError = jest.fn(
      (err: any) => err?.isAxiosError === true,
    ) as any;
    await clearPicoUnits(app);
    await readingsRepo.clear();
  });

  it('the sweep picks up a manually created unit and stores its first reading (enabled defaults true)', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ status: 200, data: 'pong' }) // create's /ping check
      .mockResolvedValue({ status: 200, data: sampleDeviceResponse }); // sweep poll

    const res = await request(app.getHttpServer())
      .post('/v1/pico-units')
      .send({ handle: 'parity-sweep' })
      .expect(201);

    // NoopCronService (default fixture): no event-driven poll ran — the unit
    // has no reading yet. The scheduled sweep must reach it on its own.
    expect(await readingsRepo.countBy({ pico_unit_id: res.body.id })).toBe(0);

    // Delegate of CronService.handleReadings — the 60s sweep body itself.
    await app.get(ReadingsService).pollReadingsFromAllEnabled();

    expect(await readingsRepo.countBy({ pico_unit_id: res.body.id })).toBe(1);
    // The sweep also backfills ip from system.wifi.ip, arming the
    // mDNS→IP fallback for later cycles (no re-save, no restart needed).
    const stored = await picoRepo.findOneBy({ id: res.body.id });
    expect(stored!.ip).toBe('192.168.1.127');
    expect(stored!.failed_calls).toBe(0);
  });
});

describe('PICO_UNIT_EVENTS.CREATED handler — immediate first poll on manual create (withCron)', () => {
  let app: INestApplication;
  let cronService: CronService;
  let picoRepo: Repository<PicoUnit>;
  let readingsRepo: Repository<Readings>;
  let warnSpy: jest.SpyInstance;

  beforeAll(async () => {
    // Opt in to the real CronService so the @OnEvent(CREATED) listener is
    // registered (the default fixture stubs it with NoopCronService).
    const moduleFixture = await createModuleFixture({ withCron: true });
    app = await createTestApp(moduleFixture);
    await app.init();
    cronService = app.get(CronService);
    picoRepo = app.get(getRepositoryToken(PicoUnit));
    readingsRepo = app.get(getRepositoryToken(Readings));

    // The device-down cases intentionally log the poll failure at warn.
    warnSpy = jest
      .spyOn((cronService as any).logger, 'warn')
      .mockImplementation(() => undefined);
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
    await clearBatches(app);
    // Cross-test state: batch-sync window anchor (see REFERENCE §E2E conventions).
    (cronService as any).lastHandleBatchSyncAt = null;
    warnSpy.mockClear();
  });

  it('POST /v1/pico-units triggers an immediate poll — first reading stored without waiting for the sweep', async () => {
    // One persistent mock: create's /ping resolves, then the handler's
    // GET /?force=1 resolves with a full device response.
    mockedAxios.get.mockResolvedValue({
      status: 200,
      data: sampleDeviceResponse,
    });

    const res = await request(app.getHttpServer())
      .post('/v1/pico-units')
      .send({ handle: 'parity-event' })
      .expect(201);

    // The emit is synchronous but the async handler body yields at its first
    // await — let the follow-up poll settle before asserting.
    await settle();

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'http://parity-event.local:5000/?force=1',
      { timeout: 10000 },
    );
    expect(await readingsRepo.countBy({ pico_unit_id: res.body.id })).toBe(1);

    const stored = await picoRepo.findOneBy({ id: res.body.id });
    // The create-time poll also backfills ip — a manual unit leaves the
    // endpoint already armed with the mDNS→IP fallback.
    expect(stored!.ip).toBe('192.168.1.127');
    expect(stored!.mac).toBe('2c:cf:67:be:95:30');
    expect(stored!.failed_calls).toBe(0);
  });

  it('still returns 201 when the follow-up poll fails — the handler swallows the error, nothing throws into the request', async () => {
    const networkError = Object.assign(new Error('No route to host'), {
      isAxiosError: true,
      code: 'EHOSTUNREACH',
      request: {},
    });
    mockedAxios.get
      .mockResolvedValueOnce({ status: 200, data: 'pong' }) // create's /ping
      .mockRejectedValue(networkError as AxiosError); // handler poll; ip NULL → no fallback

    const res = await request(app.getHttpServer())
      .post('/v1/pico-units')
      .send({ handle: 'parity-down' })
      .expect(201);

    await settle();

    const stored = await picoRepo.findOneBy({ id: res.body.id });
    expect(stored!.failed_calls).toBe(1);
    expect(stored!.ip).toBeNull(); // nothing reported — stays unarmed
    expect(await readingsRepo.countBy({ pico_unit_id: res.body.id })).toBe(0);
    // Poll failure is logged at warn (expected operational condition), never rethrown.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('unreachable'),
    );
  });

  it('is one-shot and idempotent for a fresh unit: a single poll, no device pushes when no batch exists', async () => {
    const pico = await seedPicoUnit(app, {
      handle: 'parity-nobatch',
      port: 5002,
    });
    mockedAxios.get.mockResolvedValue({
      status: 200,
      data: sampleDeviceResponse,
    });

    await expect(
      cronService.handlePicoUnitCreated({ unit: pico }),
    ).resolves.not.toThrow();

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'http://parity-nobatch.local:5002/?force=1',
      { timeout: 10000 },
    );
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(await readingsRepo.countBy({ pico_unit_id: pico.id })).toBe(1);
  });

  it('applies an in-progress batch after the immediate poll when one exists (parity with monitoring-started)', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pico = await seedPicoUnit(app, {
      handle: 'parity-batch',
      port: 5001,
    });
    await seedBatch(app, pico.id, {
      start_at: past,
      temperature_target: 23,
      humidity_target: 60,
    });

    mockedAxios.get.mockResolvedValue({
      status: 200,
      data: sampleDeviceResponse,
    });
    mockedAxios.post.mockResolvedValue({ data: {} });

    await cronService.handlePicoUnitCreated({ unit: pico });

    // Poll ran first (stores the reading the batch sync compares against:
    // sampleDeviceResponse setpoints temperature 25 / humidity 60, loop on).
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'http://parity-batch.local:5001/?force=1',
      { timeout: 10000 },
    );
    // Temperature differs (25 → 23) → setpoints pushed; the push carries ALL
    // non-null targets (applyBatchSettings semantics), and the loop is
    // already enabled per the fresh reading → no /control push.
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://parity-batch.local:5001/setpoints',
      { temperature: 23, humidity: 60 },
    );
    expect(mockedAxios.post).not.toHaveBeenCalledWith(
      'http://parity-batch.local:5001/control',
      expect.anything(),
    );
  });

  it('does not throw into the emitter when the batch query finds nothing and the device is down', async () => {
    const networkError = Object.assign(new Error('No route to host'), {
      isAxiosError: true,
      code: 'EHOSTUNREACH',
      request: {},
    });
    const pico = await seedPicoUnit(app, {
      handle: 'parity-down-direct',
      port: 5003,
      ip: undefined as unknown as string,
    });
    mockedAxios.get.mockRejectedValue(networkError as AxiosError);

    await expect(
      cronService.handlePicoUnitCreated({ unit: pico }),
    ).resolves.not.toThrow();
  });
});

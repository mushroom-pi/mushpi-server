import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import axios from 'axios';
import { Repository } from 'typeorm';

import { CronService } from 'src/modules/cron/cron.service';
import { Readings } from 'src/modules/readings/readings.entity';

import { clearBatches, seedBatch } from './fixtures/batches.fixtures';
import { clearPicos, seedPicoUnit } from './fixtures/pico-units.fixtures';
import { seedReadingForUnit } from './fixtures/readings.fixtures';
import { closeTestApp, createTestApp } from './test-setup';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CronService.handleBatchSync() (e2e)', () => {
  let app: INestApplication;
  let cronService: CronService;
  let readingsRepo: Repository<Readings>;

  const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const farPast = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
    cronService = app.get(CronService);
    readingsRepo = app.get(getRepositoryToken(Readings));
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(async () => {
    mockedAxios.post.mockReset();
    mockedAxios.post.mockResolvedValue({ data: {} });
    await readingsRepo.clear();
    await clearBatches(app);
    await clearPicos(app);
  });

  it('does nothing when there are no batches', async () => {
    await cronService.handleBatchSync();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('does not push to units that have no batch at all', async () => {
    await seedPicoUnit(app, { host: '127.0.0.1', port: 7020 });

    await cronService.handleBatchSync();

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('does not push for a planned batch (start_at in the future)', async () => {
    const pico = await seedPicoUnit(app, { host: '127.0.0.1', port: 7021 });
    await seedBatch(app, pico.id, { start_at: future });

    await cronService.handleBatchSync();

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  describe('active batch — first sync (no prior reading)', () => {
    it('pushes setpoints and enables control loop', async () => {
      const pico = await seedPicoUnit(app, { host: '127.0.0.1', port: 7022 });
      await seedBatch(app, pico.id, {
        start_at: past,
        temperature_target: 25,
        humidity_target: 60,
      });

      await cronService.handleBatchSync();

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://127.0.0.1:7022/setpoints',
        { temperature: 25, humidity: 60 },
      );
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://127.0.0.1:7022/control',
        { enabled: true },
      );
    });

    it('only pushes humidity setpoint when temperature_target is null', async () => {
      const pico = await seedPicoUnit(app, { host: '127.0.0.1', port: 7023 });
      await seedBatch(app, pico.id, {
        start_at: past,
        temperature_target: null,
        humidity_target: 75,
      });

      await cronService.handleBatchSync();

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://127.0.0.1:7023/setpoints',
        { humidity: 75 },
      );
    });

    it('only pushes temperature setpoint when humidity_target is null', async () => {
      const pico = await seedPicoUnit(app, { host: '127.0.0.1', port: 7024 });
      await seedBatch(app, pico.id, {
        start_at: past,
        temperature_target: 22,
        humidity_target: null,
      });

      await cronService.handleBatchSync();

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://127.0.0.1:7024/setpoints',
        { temperature: 22 },
      );
    });
  });

  describe('active batch — reading already matches', () => {
    it('does not push when setpoints and control loop already match', async () => {
      const pico = await seedPicoUnit(app, { host: '127.0.0.1', port: 7025 });
      await seedBatch(app, pico.id, {
        start_at: past,
        temperature_target: 25,
        humidity_target: 60,
      });
      await seedReadingForUnit(app, pico, {
        temperature_set: 25,
        humidity_set: 60,
        control_loop_enabled: true,
      });

      await cronService.handleBatchSync();

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('pushes setpoints when temperature differs, even if loop is already enabled', async () => {
      const pico = await seedPicoUnit(app, { host: '127.0.0.1', port: 7026 });
      await seedBatch(app, pico.id, {
        start_at: past,
        temperature_target: 28,
        humidity_target: 60,
      });
      await seedReadingForUnit(app, pico, {
        temperature_set: 25,
        humidity_set: 60,
        control_loop_enabled: true,
      });

      await cronService.handleBatchSync();

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://127.0.0.1:7026/setpoints',
        expect.objectContaining({ temperature: 28 }),
      );
      expect(mockedAxios.post).not.toHaveBeenCalledWith(
        'http://127.0.0.1:7026/control',
        expect.anything(),
      );
    });

    it('enables control loop when setpoints match but loop is off', async () => {
      const pico = await seedPicoUnit(app, { host: '127.0.0.1', port: 7027 });
      await seedBatch(app, pico.id, {
        start_at: past,
        temperature_target: 25,
        humidity_target: 60,
      });
      await seedReadingForUnit(app, pico, {
        temperature_set: 25,
        humidity_set: 60,
        control_loop_enabled: false,
      });

      await cronService.handleBatchSync();

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://127.0.0.1:7027/control',
        { enabled: true },
      );
    });
  });

  describe('finished batch — control loop management', () => {
    it('disables control loop when the unit has a finished batch and loop is on', async () => {
      const pico = await seedPicoUnit(app, { host: '127.0.0.1', port: 7030 });
      await seedBatch(app, pico.id, { start_at: farPast, finish_at: past });
      await seedReadingForUnit(app, pico, { control_loop_enabled: true });

      await cronService.handleBatchSync();

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://127.0.0.1:7030/control',
        { enabled: false },
      );
    });

    it('does not push when control loop is already off', async () => {
      const pico = await seedPicoUnit(app, { host: '127.0.0.1', port: 7031 });
      await seedBatch(app, pico.id, { start_at: farPast, finish_at: past });
      await seedReadingForUnit(app, pico, { control_loop_enabled: false });

      await cronService.handleBatchSync();

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('does not disable control loop for a unit with an active batch', async () => {
      const pico = await seedPicoUnit(app, { host: '127.0.0.1', port: 7032 });
      await seedBatch(app, pico.id, { start_at: past, finish_at: null });
      await seedReadingForUnit(app, pico, {
        control_loop_enabled: true,
        temperature_set: 25,
        humidity_set: 60,
      });
      await seedBatch(app, pico.id, {
        start_at: past,
        temperature_target: 25,
        humidity_target: 60,
      });

      await cronService.handleBatchSync();

      expect(mockedAxios.post).not.toHaveBeenCalledWith(
        'http://127.0.0.1:7032/control',
        { enabled: false },
      );
    });
  });

  describe('error isolation', () => {
    it('continues processing remaining units when one POST fails', async () => {
      const picoA = await seedPicoUnit(app, { host: '127.0.0.1', port: 7040 });
      const picoB = await seedPicoUnit(app, { host: '127.0.0.1', port: 7041 });

      await seedBatch(app, picoA.id, {
        start_at: past,
        temperature_target: 25,
        humidity_target: 60,
      });
      await seedBatch(app, picoB.id, {
        start_at: past,
        temperature_target: 22,
        humidity_target: 70,
      });

      // First POST (for picoA) rejects; all subsequent resolve
      mockedAxios.post.mockRejectedValueOnce(new Error('network error'));
      mockedAxios.post.mockResolvedValue({ data: {} });

      await expect(cronService.handleBatchSync()).resolves.not.toThrow();

      // picoB's setpoints should still have been attempted
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://127.0.0.1:7041/setpoints',
        { temperature: 22, humidity: 70 },
      );
    });
  });
});

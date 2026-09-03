import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import axios from 'axios';
import { Repository } from 'typeorm';

import { BatchesService } from 'src/modules/batches/batches.service';
import { CronService } from 'src/modules/cron/cron.service';
import { Readings } from 'src/modules/readings/readings.entity';

import { clearBatches, seedBatch } from './fixtures/batches.fixtures';
import { clearPicos, seedPicoUnit } from './fixtures/pico-units.fixtures';
import { seedReadingForUnit } from './fixtures/readings.fixtures';
import { closeTestApp, createModuleFixture, createTestApp } from './test-setup';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CronService.handleBatchSync() (e2e)', () => {
  let app: INestApplication;
  let cronService: CronService;
  let batchesService: BatchesService;
  let readingsRepo: Repository<Readings>;
  let loggerErrorSpy: jest.SpyInstance;

  const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const farPast = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    // Opt in to the real CronService (default is NoopCronService) so we can
    // exercise handleBatchSync / handleBatchStarted / etc. directly.
    const moduleFixture = await createModuleFixture({ withCron: true });
    app = await createTestApp(moduleFixture);
    await app.init();
    cronService = app.get(CronService);
    batchesService = app.get(BatchesService);
    readingsRepo = app.get(getRepositoryToken(Readings));

    // Silence the intentional error-path logs from the error-isolation tests
    // so they do not pollute the e2e output. The spy is asserted against in
    // the tests that deliberately trigger failures.
    loggerErrorSpy = jest
      .spyOn((cronService as any).logger, 'error')
      .mockImplementation(() => undefined);
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
    (cronService as any).lastHandleBatchSyncAt = null;
    loggerErrorSpy.mockClear();
  });

  it('does nothing when there are no batches', async () => {
    await cronService.handleBatchSync();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('does not push to units that have no batch at all', async () => {
    await seedPicoUnit(app, { handle: 'u7020', port: 7020 });

    await cronService.handleBatchSync();

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('does not push for a planned batch (start_at in the future)', async () => {
    const pico = await seedPicoUnit(app, { handle: 'u7021', port: 7021 });
    await seedBatch(app, pico.id, { start_at: future });

    await cronService.handleBatchSync();

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  describe('active batch — first sync (no prior reading)', () => {
    it('pushes setpoints and enables control loop', async () => {
      const pico = await seedPicoUnit(app, { handle: 'u7022', port: 7022 });
      await seedBatch(app, pico.id, {
        start_at: past,
        temperature_target: 25,
        humidity_target: 60,
      });

      await cronService.handleBatchSync();

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://u7022.local:7022/setpoints',
        { temperature: 25, humidity: 60 },
      );
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://u7022.local:7022/control',
        { enabled: true },
      );
    });

    it('only pushes humidity setpoint when temperature_target is null', async () => {
      const pico = await seedPicoUnit(app, { handle: 'u7023', port: 7023 });
      await seedBatch(app, pico.id, {
        start_at: past,
        temperature_target: null,
        humidity_target: 75,
      });

      await cronService.handleBatchSync();

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://u7023.local:7023/setpoints',
        { humidity: 75 },
      );
    });

    it('only pushes temperature setpoint when humidity_target is null', async () => {
      const pico = await seedPicoUnit(app, { handle: 'u7024', port: 7024 });
      await seedBatch(app, pico.id, {
        start_at: past,
        temperature_target: 22,
        humidity_target: null,
      });

      await cronService.handleBatchSync();

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://u7024.local:7024/setpoints',
        { temperature: 22 },
      );
    });
  });

  describe('active batch — reading already matches', () => {
    it('does not push when setpoints and control loop already match', async () => {
      const pico = await seedPicoUnit(app, { handle: 'u7025', port: 7025 });
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
      const pico = await seedPicoUnit(app, { handle: 'u7026', port: 7026 });
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
        'http://u7026.local:7026/setpoints',
        expect.objectContaining({ temperature: 28 }),
      );
      expect(mockedAxios.post).not.toHaveBeenCalledWith(
        'http://u7026.local:7026/control',
        expect.anything(),
      );
    });

    it('enables control loop when setpoints match but loop is off', async () => {
      const pico = await seedPicoUnit(app, { handle: 'u7027', port: 7027 });
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
        'http://u7027.local:7027/control',
        { enabled: true },
      );
    });
  });

  describe('finished batch — control loop management', () => {
    it('disables control loop when the unit has a finished batch and loop is on', async () => {
      const pico = await seedPicoUnit(app, { handle: 'u7030', port: 7030 });
      await seedBatch(app, pico.id, {
        start_at: new Date(Date.now() - 120_000),
        finish_at: new Date(Date.now() - 30_000),
      });
      await seedReadingForUnit(app, pico, { control_loop_enabled: true });

      await cronService.handleBatchSync();

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://u7030.local:7030/control',
        { enabled: false },
      );
    });

    it('does not push when control loop is already off', async () => {
      const pico = await seedPicoUnit(app, { handle: 'u7031', port: 7031 });
      await seedBatch(app, pico.id, {
        start_at: new Date(Date.now() - 120_000),
        finish_at: new Date(Date.now() - 30_000),
      });
      await seedReadingForUnit(app, pico, { control_loop_enabled: false });

      await cronService.handleBatchSync();

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('does not disable control loop for a unit with an active batch', async () => {
      const pico = await seedPicoUnit(app, { handle: 'u7032', port: 7032 });
      await seedBatch(app, pico.id, { start_at: past, finish_at: null });
      await seedBatch(app, pico.id, {
        start_at: new Date(Date.now() - 120_000),
        finish_at: new Date(Date.now() - 30_000),
      });
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
        'http://u7032.local:7032/control',
        { enabled: false },
      );
    });

    it('does not disable control loop for unit whose batch finished outside the cron window', async () => {
      const pico = await seedPicoUnit(app, { handle: 'u7033', port: 7033 });
      await seedBatch(app, pico.id, {
        start_at: new Date(Date.now() - 180_000),
        finish_at: new Date(Date.now() - 120_000),
      });
      await seedReadingForUnit(app, pico, { control_loop_enabled: true });

      await cronService.handleBatchSync();

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe('error isolation', () => {
    it('continues processing remaining units when one POST fails', async () => {
      const picoA = await seedPicoUnit(app, { handle: 'u7040', port: 7040 });
      const picoB = await seedPicoUnit(app, { handle: 'u7041', port: 7041 });

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
        'http://u7041.local:7041/setpoints',
        { temperature: 22, humidity: 70 },
      );

      // The intentional failure for picoA was logged
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to apply batch'),
      );
    });
  });

  describe('handleBatchStarted — immediate sync on creation', () => {
    it('pushes setpoints and enables control loop for a new in-progress batch', async () => {
      const pico = await seedPicoUnit(app, { handle: 'u7042', port: 7042 });
      const seeded = await seedBatch(app, pico.id, {
        start_at: past,
        temperature_target: 24,
        humidity_target: 85,
      });
      const hydrated = await batchesService.getByIdOrThrow(seeded.id);

      await cronService.handleBatchStarted({ batch: hydrated });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://u7042.local:7042/setpoints',
        { temperature: 24, humidity: 85 },
      );
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://u7042.local:7042/control',
        { enabled: true },
      );
    });

    it('does not push when the batch setpoints already match the latest reading', async () => {
      const pico = await seedPicoUnit(app, { handle: 'u7043', port: 7043 });
      const seeded = await seedBatch(app, pico.id, {
        start_at: past,
        temperature_target: 24,
        humidity_target: 85,
      });
      await seedReadingForUnit(app, pico, {
        temperature_set: 24,
        humidity_set: 85,
        control_loop_enabled: true,
      });
      const hydrated = await batchesService.getByIdOrThrow(seeded.id);

      await cronService.handleBatchStarted({ batch: hydrated });

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('does not throw when the Pico unit is unreachable', async () => {
      const pico = await seedPicoUnit(app, { handle: 'u7044', port: 7044 });
      const seeded = await seedBatch(app, pico.id, { start_at: past });
      const hydrated = await batchesService.getByIdOrThrow(seeded.id);

      mockedAxios.post.mockRejectedValueOnce(new Error('connection refused'));

      await expect(
        cronService.handleBatchStarted({ batch: hydrated }),
      ).resolves.not.toThrow();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to apply batch'),
      );
    });
  });

  describe('handleBatchFinished — immediate control loop disable', () => {
    it('disables control loop immediately when a batch finishes and loop is on', async () => {
      const pico = await seedPicoUnit(app, { handle: 'u7045', port: 7045 });
      const seeded = await seedBatch(app, pico.id, {
        start_at: farPast,
        finish_at: past,
      });
      await seedReadingForUnit(app, pico, { control_loop_enabled: true });
      const hydrated = await batchesService.getByIdOrThrow(seeded.id);

      await cronService.handleBatchFinished({ batch: hydrated });

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://u7045.local:7045/control',
        { enabled: false },
      );
    });

    it('does nothing when control loop is already off', async () => {
      const pico = await seedPicoUnit(app, { handle: 'u7046', port: 7046 });
      const seeded = await seedBatch(app, pico.id, {
        start_at: farPast,
        finish_at: past,
      });
      await seedReadingForUnit(app, pico, { control_loop_enabled: false });
      const hydrated = await batchesService.getByIdOrThrow(seeded.id);

      await cronService.handleBatchFinished({ batch: hydrated });

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('does not throw when unit is unreachable', async () => {
      const pico = await seedPicoUnit(app, { handle: 'u7047', port: 7047 });
      const seeded = await seedBatch(app, pico.id, {
        start_at: farPast,
        finish_at: past,
      });
      await seedReadingForUnit(app, pico, { control_loop_enabled: true });
      const hydrated = await batchesService.getByIdOrThrow(seeded.id);

      mockedAxios.post.mockRejectedValueOnce(new Error('connection refused'));

      await expect(
        cronService.handleBatchFinished({ batch: hydrated }),
      ).resolves.not.toThrow();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to disable control loop'),
      );
    });
  });

  describe('handlePicoUnitRegistered — restore active batch settings', () => {
    it('pushes batch settings when the re-registering unit has an active batch', async () => {
      const pico = await seedPicoUnit(app, { handle: 'u7050', port: 7050 });
      await seedBatch(app, pico.id, {
        start_at: past,
        temperature_target: 22,
        humidity_target: 80,
      });

      await cronService.handlePicoUnitRegistered({ unit: pico });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://u7050.local:7050/setpoints',
        { temperature: 22, humidity: 80 },
      );
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://u7050.local:7050/control',
        { enabled: true },
      );
    });

    it('does nothing when the unit has no batch at all', async () => {
      const pico = await seedPicoUnit(app, { handle: 'u7051', port: 7051 });

      await cronService.handlePicoUnitRegistered({ unit: pico });

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('does nothing when the unit has only a planned batch', async () => {
      const pico = await seedPicoUnit(app, { handle: 'u7052', port: 7052 });
      await seedBatch(app, pico.id, { start_at: future });

      await cronService.handlePicoUnitRegistered({ unit: pico });

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('does not throw when unit is unreachable', async () => {
      const pico = await seedPicoUnit(app, { handle: 'u7053', port: 7053 });
      await seedBatch(app, pico.id, { start_at: past });

      mockedAxios.post.mockRejectedValueOnce(new Error('connection refused'));

      await expect(
        cronService.handlePicoUnitRegistered({ unit: pico }),
      ).resolves.not.toThrow();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to apply batch'),
      );
    });
  });
});

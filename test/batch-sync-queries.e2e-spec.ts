import { INestApplication } from '@nestjs/common';

import { BatchesService } from 'src/modules/batches/batches.service';

import { clearBatches, seedBatch } from './fixtures/batches.fixtures';
import { clearPicos, seedPicoUnit } from './fixtures/pico-units.fixtures';
import { closeTestApp, createTestApp } from './test-setup';

describe('BatchesService sync queries (e2e)', () => {
  let app: INestApplication;
  let batchesService: BatchesService;

  const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const farPast = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const since = new Date(Date.now() - 72 * 60 * 60 * 1000);

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
    batchesService = app.get(BatchesService);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(async () => {
    await clearBatches(app);
    await clearPicos(app);
  });

  describe('findAllInProgress()', () => {
    it('returns empty array when no batches exist', async () => {
      const result = await batchesService.findAllInProgress();
      expect(result).toEqual([]);
    });

    it('returns open-ended in-progress batch (start_at past, finish_at null)', async () => {
      const pico = await seedPicoUnit(app, { port: 7001 });
      await seedBatch(app, pico.id, { start_at: past, finish_at: null });

      const result = await batchesService.findAllInProgress();
      expect(result).toHaveLength(1);
      expect(result[0].pico_unit_id).toBe(pico.id);
    });

    it('returns fixed-end in-progress batch (start_at past, finish_at future)', async () => {
      const pico = await seedPicoUnit(app, { port: 7002 });
      await seedBatch(app, pico.id, { start_at: past, finish_at: future });

      const result = await batchesService.findAllInProgress();
      expect(result).toHaveLength(1);
    });

    it('excludes planned batch (start_at in the future)', async () => {
      const pico = await seedPicoUnit(app, { port: 7003 });
      await seedBatch(app, pico.id, { start_at: future });

      const result = await batchesService.findAllInProgress();
      expect(result).toEqual([]);
    });

    it('excludes finished batch (finish_at in the past)', async () => {
      const pico = await seedPicoUnit(app, { port: 7004 });
      await seedBatch(app, pico.id, { start_at: farPast, finish_at: past });

      const result = await batchesService.findAllInProgress();
      expect(result).toEqual([]);
    });

    it('loads the pico_unit relation on results', async () => {
      const pico = await seedPicoUnit(app, {
        port: 7005,
        handle: 'relation-test',
      });
      await seedBatch(app, pico.id, { start_at: past });

      const result = await batchesService.findAllInProgress();
      expect(result[0].pico_unit).toBeDefined();
      expect(result[0].pico_unit.id).toBe(pico.id);
    });

    it('returns all in-progress batches across multiple units', async () => {
      const picoA = await seedPicoUnit(app, { port: 7006 });
      const picoB = await seedPicoUnit(app, { port: 7007 });
      await seedBatch(app, picoA.id, { start_at: past });
      await seedBatch(app, picoB.id, { start_at: past });

      const result = await batchesService.findAllInProgress();
      expect(result).toHaveLength(2);
    });
  });

  describe('findUnitsWithFinishedBatch()', () => {
    it('returns empty array when no batches exist', async () => {
      const result = await batchesService.findUnitsWithFinishedBatch(since);
      expect(result).toEqual([]);
    });

    it('returns unit when its only batch is finished', async () => {
      const pico = await seedPicoUnit(app, { port: 7010 });
      await seedBatch(app, pico.id, { start_at: farPast, finish_at: past });

      const result = await batchesService.findUnitsWithFinishedBatch(since);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(pico.id);
    });

    it('excludes unit that currently has an in-progress batch', async () => {
      const pico = await seedPicoUnit(app, { port: 7011 });
      await seedBatch(app, pico.id, { start_at: farPast, finish_at: past });
      await seedBatch(app, pico.id, { start_at: past, finish_at: null });

      const result = await batchesService.findUnitsWithFinishedBatch(since);
      expect(result).toEqual([]);
    });

    it('excludes unit with only planned batches', async () => {
      const pico = await seedPicoUnit(app, { port: 7012 });
      await seedBatch(app, pico.id, { start_at: future });

      const result = await batchesService.findUnitsWithFinishedBatch(since);
      expect(result).toEqual([]);
    });

    it('excludes unmonitored unit with a finished batch', async () => {
      const pico = await seedPicoUnit(app, {
        port: 7013,
        monitored: false,
      });
      await seedBatch(app, pico.id, { start_at: farPast, finish_at: past });

      const result = await batchesService.findUnitsWithFinishedBatch(since);
      expect(result).toEqual([]);
    });

    it('returns multiple units when each has only finished batches', async () => {
      const picoA = await seedPicoUnit(app, { port: 7014 });
      const picoB = await seedPicoUnit(app, { port: 7015 });
      await seedBatch(app, picoA.id, { start_at: farPast, finish_at: past });
      await seedBatch(app, picoB.id, { start_at: farPast, finish_at: past });

      const result = await batchesService.findUnitsWithFinishedBatch(since);
      expect(result).toHaveLength(2);
      const ids = result.map((u) => u.id);
      expect(ids).toContain(picoA.id);
      expect(ids).toContain(picoB.id);
    });

    it('excludes unit whose finished batch ended before the since window', async () => {
      const pico = await seedPicoUnit(app, { port: 7016 });
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      const oneMinAgo = new Date(Date.now() - 60 * 1000);
      await seedBatch(app, pico.id, {
        start_at: new Date(Date.now() - 20 * 60 * 1000),
        finish_at: tenMinAgo,
      });

      const result = await batchesService.findUnitsWithFinishedBatch(oneMinAgo);
      expect(result).toEqual([]);
    });

    it('returns unit whose finished batch ended within the since window', async () => {
      const pico = await seedPicoUnit(app, { port: 7017 });
      const oneMinAgo = new Date(Date.now() - 60 * 1000);
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      await seedBatch(app, pico.id, {
        start_at: new Date(Date.now() - 10 * 60 * 1000),
        finish_at: oneMinAgo,
      });

      const result =
        await batchesService.findUnitsWithFinishedBatch(fiveMinAgo);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(pico.id);
    });
  });
});

import { INestApplication } from '@nestjs/common';

import request from 'supertest';

import {
  clearBatches,
  getBatchRepo,
  seedBatch,
} from './fixtures/batches.fixtures';
import { clearPicos, seedPicoUnit } from './fixtures/pico-units.fixtures';
import { closeTestApp, createTestApp } from './test-setup';

describe('BatchesController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(async () => {
    // clear DB state to keep tests isolated
    await clearBatches(app);
    await clearPicos(app);
  });

  describe('POST /batches', () => {
    it('creates a batch for an existing pico unit', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'create-test',
        host: 'create.host',
        port: 5100,
      });

      const payload = {
        pico_unit_id: pico.id,
        species: 'shiitake',
        temperature_target: 25,
        humidity_target: 60,
        notes: 'Initial batch',
      };

      const res = await request(app.getHttpServer())
        .post('/batches')
        .send(payload)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('pico_unit_id', pico.id);
      expect(res.body).toHaveProperty('species', 'shiitake');

      // check persisted
      const batchRepo = await getBatchRepo(app);
      const persisted = await batchRepo.findOneBy({ id: res.body.id });
      expect(persisted).toBeDefined();
      expect(persisted!.pico_unit_id).toBe(pico.id);
    });

    it('returns 404 when pico unit does not exist', async () => {
      const payload = {
        pico_unit_id: 999999, // non-existent
        species: 'abc',
      };

      const res = await request(app.getHttpServer())
        .post('/batches')
        .send(payload)
        .expect(404);
      expect(res.body).toHaveProperty('statusCode', 404);
    });
  });

  describe('GET /batches (list)', () => {
    it('returns paginated list and respects page/limit', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'list-pico',
        host: 'list.host',
        port: 5110,
      });

      // create 5 batches for that unit with different start times
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        await seedBatch(app, pico.id, {
          start_at: new Date(now - (5 - i) * 1000),
          notes: `batch ${i}`,
        });
      }

      const res = await request(app.getHttpServer())
        .get('/batches')
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body.items.length).toBe(2);
      expect(res.body).toHaveProperty('page', 1);
      expect(res.body).toHaveProperty('limit', 2);
      expect(res.body).toHaveProperty('total', 5);
      expect(res.body).toHaveProperty('pages', Math.ceil(5 / 2));
    });

    it('filters by status (in-progress vs finished) and pico_unit_id', async () => {
      const picoA = await seedPicoUnit(app, {
        handle: 'A',
        host: 'a.host',
        port: 5200,
      });
      const picoB = await seedPicoUnit(app, {
        handle: 'B',
        host: 'b.host',
        port: 5201,
      });

      // create: one finished (finish_at in past), two in-progress (one null, one future)
      const now = Date.now();
      // finished (past)
      await seedBatch(app, picoA.id, {
        start_at: new Date(now - 100000),
        finish_at: new Date(now - 50000),
        notes: 'finished',
      });

      // in-progress with null finish_at
      await seedBatch(app, picoA.id, {
        start_at: new Date(now - 10000),
        finish_at: null,
        notes: 'in-progress-null',
      });

      // in-progress with future finish_at
      await seedBatch(app, picoB.id, {
        start_at: new Date(now - 5000),
        finish_at: new Date(now + 100000),
        notes: 'in-progress-future',
      });

      // Query all in-progress (should return two batches)
      const resIn = await request(app.getHttpServer())
        .get('/batches')
        .query({ status: 'in-progress' })
        .expect(200);

      // Expect result contains 2 items (order may vary, but total should be 2)
      expect(resIn.body.total).toBe(2);
      const notes = resIn.body.items.map((it: any) => it.notes);
      expect(notes).toEqual(
        expect.arrayContaining(['in-progress-null', 'in-progress-future']),
      );

      // Query finished
      const resFin = await request(app.getHttpServer())
        .get('/batches')
        .query({ status: 'finished' })
        .expect(200);
      expect(resFin.body.total).toBe(1);
      expect(resFin.body.items[0].notes).toBe('finished');

      // Query per pico unit (picoA)
      const resA = await request(app.getHttpServer())
        .get('/batches')
        .query({ pico_unit_id: picoA.id })
        .expect(200);

      expect(resA.body.total).toBe(2); // finished + in-progress-null for picoA
      const notesA = resA.body.items.map((it: any) => it.notes);
      expect(notesA).toEqual(
        expect.arrayContaining(['finished', 'in-progress-null']),
      );
    });
  });
});

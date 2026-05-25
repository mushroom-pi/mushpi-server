import { INestApplication } from '@nestjs/common';

import request from 'supertest';

import {
  clearBatches,
  getBatchRepo,
  seedBatch,
} from './fixtures/batches.fixtures';
import { clearPicos, seedPicoUnit } from './fixtures/pico-units.fixtures';
import { clearRecipes, seedRecipe } from './fixtures/recipes.fixtures';
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
    await clearRecipes(app);
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
        description: 'First test batch',
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

    it('returns 409 when the pico unit already has an active batch (finish_at null)', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'conflict-null',
        host: 'conflict.host',
        port: 5300,
      });

      // seed an active batch (finish_at null = in-progress)
      await seedBatch(app, pico.id, { finish_at: null });

      const res = await request(app.getHttpServer())
        .post('/batches')
        .send({ pico_unit_id: pico.id, species: 'oyster' })
        .expect(409);

      expect(res.body).toHaveProperty('statusCode', 409);
      expect(res.body.message).toMatch(/already has an active batch/);
    });

    it('returns 409 when the pico unit already has an active batch (finish_at in the future)', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'conflict-future',
        host: 'conflict.host',
        port: 5301,
      });

      // seed an active batch with finish_at in the future
      await seedBatch(app, pico.id, {
        finish_at: new Date(Date.now() + 10 * 60 * 1000),
      });

      const res = await request(app.getHttpServer())
        .post('/batches')
        .send({ pico_unit_id: pico.id, species: 'shiitake' })
        .expect(409);

      expect(res.body).toHaveProperty('statusCode', 409);
      expect(res.body.message).toMatch(/already has an active batch/);
    });

    it('allows creating a new batch when the previous one is finished', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'conflict-finished',
        host: 'conflict.host',
        port: 5302,
      });

      // seed a finished batch (finish_at in the past)
      await seedBatch(app, pico.id, {
        finish_at: new Date(Date.now() - 1000),
      });

      const res = await request(app.getHttpServer())
        .post('/batches')
        .send({ pico_unit_id: pico.id, species: 'lion mane' })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('pico_unit_id', pico.id);
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

    it('filters by status (planned, in-progress vs finished) and pico_unit_id', async () => {
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

      // create: one planned (future start_at), one finished (finish_at in past), two in-progress (one null, one future)
      const now = Date.now();
      // planned (start_at in future)
      await seedBatch(app, picoA.id, {
        start_at: new Date(now + 100000),
        finish_at: null,
        notes: 'planned',
      });

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

      // Query all planned (should return one batch)
      const resPlanned = await request(app.getHttpServer())
        .get('/batches')
        .query({ status: 'planned' })
        .expect(200);

      expect(resPlanned.body.total).toBe(1);
      expect(resPlanned.body.items[0].notes).toBe('planned');

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

      // Query per pico unit (picoA) - should return 3 batches: planned, finished, in-progress-null
      const resA = await request(app.getHttpServer())
        .get('/batches')
        .query({ pico_unit_id: picoA.id })
        .expect(200);

      expect(resA.body.total).toBe(3);
      const notesA = resA.body.items.map((it: any) => it.notes);
      expect(notesA).toEqual(
        expect.arrayContaining(['planned', 'finished', 'in-progress-null']),
      );
    });
  });

  // ─── POST /batches with recipe_id ──────────────────────────────────────────

  describe('POST /batches — recipe snapshot', () => {
    it('copies species, temperature_target and humidity_target from the recipe when not explicitly provided', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'snap-pico',
        host: '127.0.0.1',
        port: 7300,
      });
      const recipe = await seedRecipe(app, {
        name: 'snapshot-source',
        species: 'lion mane',
        temperature_target: 18,
        humidity_target: 88,
      });

      const res = await request(app.getHttpServer())
        .post('/batches')
        .send({ pico_unit_id: pico.id, recipe_id: recipe.id })
        .expect(201);

      expect(res.body.recipe_id).toBe(recipe.id);
      expect(res.body.species).toBe('lion mane');
      expect(res.body.temperature_target).toBe(18);
      expect(res.body.humidity_target).toBe(88);
    });

    it('uses explicitly provided fields and only copies unset ones from the recipe', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'snap-explicit-pico',
        host: '127.0.0.1',
        port: 7301,
      });
      const recipe = await seedRecipe(app, {
        name: 'partial-snapshot-source',
        species: 'oyster',
        temperature_target: 22,
        humidity_target: 80,
      });

      const res = await request(app.getHttpServer())
        .post('/batches')
        .send({
          pico_unit_id: pico.id,
          recipe_id: recipe.id,
          species: 'my-custom-species', // explicit override
          // temperature_target and humidity_target not provided → copied from recipe
        })
        .expect(201);

      expect(res.body.species).toBe('my-custom-species');
      expect(res.body.temperature_target).toBe(22); // from recipe
      expect(res.body.humidity_target).toBe(80); // from recipe
    });

    it('returns 404 when recipe_id does not match any existing recipe', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'snap-missing-pico',
        host: '127.0.0.1',
        port: 7302,
      });

      const res = await request(app.getHttpServer())
        .post('/batches')
        .send({ pico_unit_id: pico.id, recipe_id: 999999 })
        .expect(404);

      expect(res.body).toHaveProperty('statusCode', 404);
    });
  });
});

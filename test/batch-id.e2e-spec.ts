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

describe('BatchIdController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(async () => {
    await clearBatches(app);
    await clearRecipes(app);
    await clearPicos(app);
  });

  describe('middleware validation', () => {
    it('returns 422 for non-numeric id', async () => {
      const res = await request(app.getHttpServer())
        .get('/batches/abc')
        .expect(422);
      // message from UnprocessableEntityException
      expect(res.body).toHaveProperty('statusCode', 422);
      expect(typeof res.body.message).toBeDefined();
    });

    it('returns 422 for zero or negative id', async () => {
      await request(app.getHttpServer()).get('/batches/0').expect(422);
      await request(app.getHttpServer()).get('/batches/-1').expect(422);
    });

    it('returns 404 when batch does not exist', async () => {
      const res = await request(app.getHttpServer())
        .get('/batches/99999')
        .expect(404);
      expect(res.body).toHaveProperty('statusCode', 404);
    });
  });

  describe('GET /batches/:id', () => {
    it('returns the batch (including loaded pico_unit relation)', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'get-test',
        host: 'g.host',
        port: 5300,
      });
      const batch = await seedBatch(app, pico.id, { notes: 'get-test-batch' });

      const res = await request(app.getHttpServer())
        .get(`/batches/${batch.id}`)
        .expect(200);
      expect(res.body).toHaveProperty('id', batch.id);
      expect(res.body).toHaveProperty('pico_unit_id', pico.id);

      // because controller returns batch from middleware which used relations: ['pico_unit'],
      // the response should include pico_unit object
      expect(res.body).toHaveProperty('pico_unit');
      expect(res.body.pico_unit).toHaveProperty('id', pico.id);
      expect(res.body.notes).toBe('get-test-batch');
    });
  });

  describe('PATCH /batches/:id', () => {
    it('updates allowed fields and returns the updated batch', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'patch-test',
        host: 'p.host',
        port: 5310,
      });
      const batch = await seedBatch(app, pico.id, {
        notes: 'original',
        species: 'oyster',
      });

      const newFinishAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h in future
      const payload = {
        notes: 'updated notes',
        species: 'shiitake',
        finish_at: newFinishAt,
        temperature_target: 27,
        description: 'Updated description',
      };

      const res = await request(app.getHttpServer())
        .patch(`/batches/${batch.id}`)
        .send(payload)
        .expect(200);

      expect(res.body).toHaveProperty('id', batch.id);
      expect(res.body.notes).toBe('updated notes');
      expect(res.body.species).toBe('shiitake');
      // finish_at should be present and close to provided value (string)
      expect(new Date(res.body.finish_at).toISOString()).toBe(
        new Date(newFinishAt).toISOString(),
      );
      expect(res.body.temperature_target).toBe(27);
      expect(res.body.description).toBe('Updated description');

      // persisted in DB
      const repo = await getBatchRepo(app);
      const persisted = await repo.findOneBy({ id: batch.id });
      expect(persisted).toBeDefined();
      expect(persisted!.notes).toBe('updated notes');
    });

    it('rejects invalid payload types (422) e.g., invalid date format', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'patch-invalid',
        host: 'pi.host',
        port: 5320,
      });
      const batch = await seedBatch(app, pico.id, { notes: 'some' });

      // send invalid date string
      await request(app.getHttpServer())
        .patch(`/batches/${batch.id}`)
        .send({ finish_at: 'not-a-date' })
        .expect(422);
    });

    it('does not allow changing pico_unit_id via update DTO (pico_unit_id is not in UpdateBatchDto)', async () => {
      const picoA = await seedPicoUnit(app, {
        handle: 'pA',
        host: 'pa.host',
        port: 5330,
      });
      const picoB = await seedPicoUnit(app, {
        handle: 'pB',
        host: 'pb.host',
        port: 5331,
      });
      const batch = await seedBatch(app, picoA.id, { notes: 'immutable test' });

      // Attempt to change pico_unit_id (ValidationPipe with whitelist should strip unknown props).
      // But to be safe we assert the pico_unit_id remains unchanged after the PATCH.
      await request(app.getHttpServer())
        .patch(`/batches/${batch.id}`)
        .send({ pico_unit_id: picoB.id, notes: 'still same' })
        .expect(422);

      const repo = await getBatchRepo(app);
      const persisted = await repo.findOneBy({ id: batch.id });
      expect(persisted).toBeDefined();
      // pico_unit_id must be unchanged
      expect(persisted!.pico_unit_id).toBe(picoA.id);

      // notes shouldn't have changed
      expect(persisted!.notes).not.toBe('still same');
    });
  });

  describe('DELETE /batches/:id', () => {
    it('deletes the batch and subsequent GET returns 404', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'del-test',
        host: 'd.host',
        port: 5340,
      });
      const batch = await seedBatch(app, pico.id, { notes: 'to-delete' });

      // delete
      await request(app.getHttpServer())
        .delete(`/batches/${batch.id}`)
        .expect(204);

      // ensure removed
      const repo = await getBatchRepo(app);
      const found = await repo.findOneBy({ id: batch.id });
      expect(found).toBeNull();

      // subsequent GET returns 404
      await request(app.getHttpServer())
        .get(`/batches/${batch.id}`)
        .expect(404);
    });

    it('returns 422 for invalid id on delete', async () => {
      await request(app.getHttpServer())
        .delete('/batches/not-a-number')
        .expect(422);
    });
  });

  // ─── recipe_id field ──────────────────────────────────────────────────────

  describe('GET /batches/:id — recipe_id field', () => {
    it('includes recipe_id in the response when the batch was created with one', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'bid-recipe-pico',
        host: '127.0.0.1',
        port: 7400,
      });
      const recipe = await seedRecipe(app, { name: 'bid-recipe' });
      const batch = await seedBatch(app, pico.id, { recipe_id: recipe.id });

      const res = await request(app.getHttpServer())
        .get(`/batches/${batch.id}`)
        .expect(200);

      expect(res.body).toHaveProperty('recipe_id', recipe.id);
    });

    it('has recipe_id as null when the batch was created without one', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'bid-no-recipe-pico',
        host: '127.0.0.1',
        port: 7401,
      });
      const batch = await seedBatch(app, pico.id, {});

      const res = await request(app.getHttpServer())
        .get(`/batches/${batch.id}`)
        .expect(200);

      expect(res.body.recipe_id).toBeNull();
    });
  });
});

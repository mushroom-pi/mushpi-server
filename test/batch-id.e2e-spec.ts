import { INestApplication } from '@nestjs/common';

import request from 'supertest';
import { DataSource } from 'typeorm';

import {
  clearBatches,
  getBatchRepo,
  seedBatch,
} from './fixtures/batches.fixtures';
import { clearPicos, seedPicoUnit } from './fixtures/pico-units.fixtures';
import { clearRecipes, seedRecipe } from './fixtures/recipes.fixtures';
import { closeTestApp, createTestApp } from './test-setup';

describe('BatchIdV1Controller (e2e)', () => {
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
        .get('/v1/batches/abc')
        .expect(422);
      // message from UnprocessableEntityException
      expect(res.body).toHaveProperty('statusCode', 422);
      expect(typeof res.body.message).toBeDefined();
    });

    it('returns 422 for zero or negative id', async () => {
      await request(app.getHttpServer()).get('/v1/batches/0').expect(422);
      await request(app.getHttpServer()).get('/v1/batches/-1').expect(422);
    });

    it('returns 404 when batch does not exist', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/batches/99999')
        .expect(404);
      expect(res.body).toHaveProperty('statusCode', 404);
    });
  });

  describe('GET /batches/:id', () => {
    it('returns the batch (including loaded pico_unit relation)', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'get-test',
        port: 5300,
      });
      const batch = await seedBatch(app, pico.id, { notes: 'get-test-batch' });

      const res = await request(app.getHttpServer())
        .get(`/v1/batches/${batch.id}`)
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
        .patch(`/v1/batches/${batch.id}`)
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
        port: 5320,
      });
      const batch = await seedBatch(app, pico.id, { notes: 'some' });

      // send invalid date string
      await request(app.getHttpServer())
        .patch(`/v1/batches/${batch.id}`)
        .send({ finish_at: 'not-a-date' })
        .expect(422);
    });

    it('does not allow changing pico_unit_id via update DTO (pico_unit_id is not in UpdateBatchDto)', async () => {
      const picoA = await seedPicoUnit(app, {
        handle: 'pA',
        port: 5330,
      });
      const picoB = await seedPicoUnit(app, {
        handle: 'pB',
        port: 5331,
      });
      const batch = await seedBatch(app, picoA.id, { notes: 'immutable test' });

      // Attempt to change pico_unit_id (ValidationPipe with whitelist should strip unknown props).
      // But to be safe we assert the pico_unit_id remains unchanged after the PATCH.
      await request(app.getHttpServer())
        .patch(`/v1/batches/${batch.id}`)
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

    it('returns 412 when trying to modify start_at after batch has started', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'started-batch',
        port: 5335,
      });
      // Create batch with start_at in the past (already started)
      const batch = await seedBatch(app, pico.id, {
        start_at: new Date(Date.now() - 60 * 60 * 1000), // 1h ago
        notes: 'started-batch',
      });

      // Attempt to change start_at
      const res = await request(app.getHttpServer())
        .patch(`/v1/batches/${batch.id}`)
        .send({
          start_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        })
        .expect(412);

      expect(res.body).toHaveProperty('statusCode', 412);
      expect(res.body.message).toMatch(/Cannot modify start_at/);

      // Batch should remain unchanged
      const repo = await getBatchRepo(app);
      const persisted = await repo.findOneBy({ id: batch.id });
      expect(persisted!.notes).toBe('started-batch'); // notes unchanged (nothing else modified)
    });

    it('allows modifying other fields when batch has started', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'started-batch-mod',
        port: 5336,
      });
      // Create batch with start_at in the past
      const batch = await seedBatch(app, pico.id, {
        start_at: new Date(Date.now() - 60 * 60 * 1000), // 1h ago
        notes: 'original notes',
      });

      // Modify notes (should succeed)
      const res = await request(app.getHttpServer())
        .patch(`/v1/batches/${batch.id}`)
        .send({ notes: 'updated notes after start' })
        .expect(200);

      expect(res.body.notes).toBe('updated notes after start');
    });

    it('returns 412 when trying to modify non-description/notes fields after batch has finished', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'finished-batch',
        port: 5337,
      });
      // Create batch with finish_at in the past (finished)
      const batch = await seedBatch(app, pico.id, {
        start_at: new Date(Date.now() - 120 * 60 * 1000), // 2h ago
        finish_at: new Date(Date.now() - 60 * 60 * 1000), // 1h ago
        species: 'oyster',
        temperature_target: 20,
      });

      // Attempt to modify species (should fail)
      const res = await request(app.getHttpServer())
        .patch(`/v1/batches/${batch.id}`)
        .send({ species: 'shiitake' })
        .expect(412);

      expect(res.body).toHaveProperty('statusCode', 412);
      expect(res.body.message).toMatch(/Cannot modify species/);
      expect(res.body.message).toMatch(
        /only description and notes can be modified/i,
      );

      // Verify no change
      const repo = await getBatchRepo(app);
      const persisted = await repo.findOneBy({ id: batch.id });
      expect(persisted!.species).toBe('oyster');
    });

    it('allows modifying description and notes after batch has finished', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'finished-batch-notes',
        port: 5338,
      });
      // Create batch with finish_at in the past (finished)
      const batch = await seedBatch(app, pico.id, {
        start_at: new Date(Date.now() - 120 * 60 * 1000), // 2h ago
        finish_at: new Date(Date.now() - 60 * 60 * 1000), // 1h ago
        notes: 'final notes',
        description: 'final desc',
      });

      // Modify notes and description (should succeed)
      const res = await request(app.getHttpServer())
        .patch(`/v1/batches/${batch.id}`)
        .send({
          notes: 'updated final notes',
          description: 'updated final desc',
        })
        .expect(200);

      expect(res.body.notes).toBe('updated final notes');
      expect(res.body.description).toBe('updated final desc');
    });

    it('rejects modification of temperature_target and notes together after batch has finished', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'finished-multi-mod',
        port: 5339,
      });
      // Create batch with finish_at in the past
      const batch = await seedBatch(app, pico.id, {
        start_at: new Date(Date.now() - 120 * 60 * 1000),
        finish_at: new Date(Date.now() - 60 * 60 * 1000),
        temperature_target: 20,
        notes: 'original',
      });

      // Try to modify both temperature_target (disallowed) and notes (allowed)
      const res = await request(app.getHttpServer())
        .patch(`/v1/batches/${batch.id}`)
        .send({
          temperature_target: 25,
          notes: 'updated notes',
        })
        .expect(412);

      expect(res.body.message).toMatch(/Cannot modify temperature_target/);
      expect(res.body).toHaveProperty('statusCode', 412);

      // Verify nothing changed
      const repo = await getBatchRepo(app);
      const persisted = await repo.findOneBy({ id: batch.id });
      expect(persisted!.temperature_target).toBe(20);
      expect(persisted!.notes).toBe('original');
    });

    it('returns 422 when both start_at and finish_at are sent with finish_at before start_at', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'date-order-both',
        port: 5350,
      });
      // Planned batch (start_at in the future)
      const batch = await seedBatch(app, pico.id, {
        start_at: new Date(Date.now() + 2 * 60 * 60 * 1000),
        finish_at: new Date(Date.now() + 3 * 60 * 60 * 1000),
        notes: 'date-order-test',
      });

      // Attempt to set start_at > finish_at
      const res = await request(app.getHttpServer())
        .patch(`/v1/batches/${batch.id}`)
        .send({
          start_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          finish_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        })
        .expect(422);

      expect(res.body).toHaveProperty('statusCode', 422);
      expect(JSON.stringify(res.body.message)).toMatch(/finish_at/);
      expect(JSON.stringify(res.body.message)).toMatch(/start_at/);
    });

    it('returns 422 when start_at is updated to a date after the existing finish_at', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'date-order-start',
        port: 5351,
      });
      // Planned batch (start_at and finish_at both in the future)
      const batch = await seedBatch(app, pico.id, {
        start_at: new Date(Date.now() + 1 * 60 * 60 * 1000),
        finish_at: new Date(Date.now() + 2 * 60 * 60 * 1000),
        notes: 'date-order-start-test',
      });

      // Move start_at to after finish_at (only start_at in payload)
      const res = await request(app.getHttpServer())
        .patch(`/v1/batches/${batch.id}`)
        .send({
          start_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        })
        .expect(422);

      expect(res.body).toHaveProperty('statusCode', 422);
      expect(JSON.stringify(res.body.message)).toMatch(/finish_at/);
      expect(JSON.stringify(res.body.message)).toMatch(/start_at/);

      // Batch should be unchanged
      const repo = await getBatchRepo(app);
      const persisted = await repo.findOneBy({ id: batch.id });
      expect(persisted!.notes).toBe('date-order-start-test');
    });
  });

  describe('DELETE /batches/:id', () => {
    it('deletes the batch and subsequent GET returns 404', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'del-test',
        port: 5340,
      });
      const batch = await seedBatch(app, pico.id, { notes: 'to-delete' });

      // delete
      await request(app.getHttpServer())
        .delete(`/v1/batches/${batch.id}`)
        .expect(204);

      // ensure removed
      const repo = await getBatchRepo(app);
      const found = await repo.findOneBy({ id: batch.id });
      expect(found).toBeNull();

      // subsequent GET returns 404
      await request(app.getHttpServer())
        .get(`/v1/batches/${batch.id}`)
        .expect(404);
    });

    it('returns 422 for invalid id on delete', async () => {
      await request(app.getHttpServer())
        .delete('/v1/batches/not-a-number')
        .expect(422);
    });
  });

  // ─── recipe_id field ──────────────────────────────────────────────────────

  describe('GET /batches/:id — recipe_id field', () => {
    it('includes recipe_id in the response when the batch was created with one', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'bid-recipe-pico',
        port: 7400,
      });
      const recipe = await seedRecipe(app, { name: 'bid-recipe' });
      const batch = await seedBatch(app, pico.id, { recipe_id: recipe.id });

      const res = await request(app.getHttpServer())
        .get(`/v1/batches/${batch.id}`)
        .expect(200);

      expect(res.body).toHaveProperty('recipe_id', recipe.id);
    });

    it('has recipe_id as null when the batch was created without one', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'bid-no-recipe-pico',
        port: 7401,
      });
      const batch = await seedBatch(app, pico.id, {});

      const res = await request(app.getHttpServer())
        .get(`/v1/batches/${batch.id}`)
        .expect(200);

      expect(res.body.recipe_id).toBeNull();
      expect(res.body.recipe).toBeNull();
    });

    it('includes the nested recipe object when recipe_id refers to a valid recipe', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'bid-recipe-nested-pico',
        port: 7402,
      });
      const recipe = await seedRecipe(app, {
        name: 'bid-recipe-nested',
        species: 'shiitake',
        temperature_target: 20,
        humidity_target: 75,
      });
      const batch = await seedBatch(app, pico.id, { recipe_id: recipe.id });

      const res = await request(app.getHttpServer())
        .get(`/v1/batches/${batch.id}`)
        .expect(200);

      expect(res.body).toHaveProperty('recipe_id', recipe.id);
      expect(res.body).toHaveProperty('recipe');
      expect(res.body.recipe).toBeDefined();
      expect(res.body.recipe).not.toBeNull();
      expect(res.body.recipe.id).toBe(recipe.id);
      expect(res.body.recipe.name).toBe('bid-recipe-nested');
      expect(res.body.recipe.species).toBe('shiitake');
      expect(res.body.recipe.temperature_target).toBe(20);
      expect(res.body.recipe.humidity_target).toBe(75);
    });

    it('returns recipe as null when recipe_id refers to a non-existent recipe', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'bid-orphaned-recipe-pico',
        port: 7403,
      });

      const dataSource = app.get(DataSource);

      // Temporarily disable foreign keys to create an orphaned reference
      await dataSource.query('PRAGMA foreign_keys = OFF');
      try {
        // Insert batch with a recipe_id that doesn't exist
        await dataSource.query(
          `INSERT INTO batch (pico_unit_id, recipe_id, start_at, finish_at, species, temperature_target, humidity_target, notes, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            pico.id,
            999999, // non-existent recipe
            new Date().toISOString(),
            null,
            null,
            null,
            null,
            '',
            null,
          ],
        );
        const batchRepo = await getBatchRepo(app);
        const batch = await batchRepo.findOne({
          where: { pico_unit_id: pico.id },
          order: { id: 'DESC' },
        });

        const res = await request(app.getHttpServer())
          .get(`/v1/batches/${batch!.id}`)
          .expect(200);

        expect(res.body).toHaveProperty('recipe_id', 999999);
        expect(res.body).toHaveProperty('recipe');
        expect(res.body.recipe).toBeNull();
      } finally {
        // Re-enable foreign keys
        await dataSource.query('PRAGMA foreign_keys = ON');
      }
    });
  });
});

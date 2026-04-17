import { INestApplication } from '@nestjs/common';

import request from 'supertest';

import {
  clearBatches,
  seedBatch,
} from './fixtures/batches.fixtures';
import { clearPicos, seedPicoUnit } from './fixtures/pico-units.fixtures';
import { clearRecipes, getRecipeRepo } from './fixtures/recipes.fixtures';
import { closeTestApp, createTestApp } from './test-setup';

describe('BatchIdRecipeController (e2e)', () => {
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

  // Finished batch with all required fields → creates a recipe
  describe('POST /batches/:batchId/recipe — happy path', () => {
    it('creates a recipe with species and targets from the batch, duration_days from dates', async () => {
      const pico = await seedPicoUnit(app, { handle: 'bir-pico', host: '127.0.0.1', port: 7500 });
      const start = new Date('2024-01-01T00:00:00Z');
      const finish = new Date('2024-01-15T00:00:00Z'); // 14 days
      const batch = await seedBatch(app, pico.id, {
        species: 'oyster',
        temperature_target: 22,
        humidity_target: 80,
        start_at: start,
        finish_at: finish,
      });

      const res = await request(app.getHttpServer())
        .post(`/batches/${batch.id}/recipe`)
        .send({ name: 'oyster-standard' })
        .expect(201);

      expect(res.body).toHaveProperty('name', 'oyster-standard');
      expect(res.body).toHaveProperty('species', 'oyster');
      expect(res.body).toHaveProperty('temperature_target', 22);
      expect(res.body).toHaveProperty('humidity_target', 80);
      expect(res.body).toHaveProperty('duration_days', 14);
      expect(res.body).toHaveProperty('id');

      // persisted
      const repo = await getRecipeRepo(app);
      const saved = await repo.findOneBy({ id: res.body.id });
      expect(saved).toBeDefined();
      expect(saved!.name).toBe('oyster-standard');
    });

    it('accepts optional notes and includes them in the recipe', async () => {
      const pico = await seedPicoUnit(app, { handle: 'bir-notes', host: '127.0.0.1', port: 7501 });
      const batch = await seedBatch(app, pico.id, {
        species: 'shiitake',
        temperature_target: 18,
        humidity_target: 75,
        start_at: new Date('2024-02-01'),
        finish_at: new Date('2024-03-01'), // 29 days
      });

      const res = await request(app.getHttpServer())
        .post(`/batches/${batch.id}/recipe`)
        .send({ name: 'shiitake-winter', notes: 'good grow, low ambient temp' })
        .expect(201);

      expect(res.body).toHaveProperty('notes', 'good grow, low ambient temp');
      expect(res.body).toHaveProperty('duration_days', 29);
    });

    it('rounds up partial days to the next whole day', async () => {
      const pico = await seedPicoUnit(app, { handle: 'bir-round', host: '127.0.0.1', port: 7502 });
      const batch = await seedBatch(app, pico.id, {
        species: 'lion',
        temperature_target: 20,
        humidity_target: 85,
        start_at: new Date('2024-03-01T00:00:00Z'),
        finish_at: new Date('2024-03-08T12:00:00Z'), // 7.5 days → ceil = 8
      });

      const res = await request(app.getHttpServer())
        .post(`/batches/${batch.id}/recipe`)
        .send({ name: 'lion-mane-short' })
        .expect(201);

      expect(res.body).toHaveProperty('duration_days', 8);
    });
  });

  // Validation errors
  describe('POST /batches/:batchId/recipe — validation errors', () => {
    it('returns 422 when the batch is not finished (no finish_at)', async () => {
      const pico = await seedPicoUnit(app, { handle: 'bir-unfinished', host: '127.0.0.1', port: 7510 });
      const batch = await seedBatch(app, pico.id, {
        species: 'oyster',
        temperature_target: 22,
        humidity_target: 80,
      }); // finish_at is null → in-progress

      const res = await request(app.getHttpServer())
        .post(`/batches/${batch.id}/recipe`)
        .send({ name: 'will-fail' })
        .expect(422);

      expect(res.body).toHaveProperty('statusCode', 422);
    });

    it('returns 422 when the batch is missing species', async () => {
      const pico = await seedPicoUnit(app, { handle: 'bir-no-species', host: '127.0.0.1', port: 7511 });
      const batch = await seedBatch(app, pico.id, {
        temperature_target: 22,
        humidity_target: 80,
        start_at: new Date('2024-01-01'),
        finish_at: new Date('2024-01-10'),
      });

      await request(app.getHttpServer())
        .post(`/batches/${batch.id}/recipe`)
        .send({ name: 'no-species' })
        .expect(422);
    });

    it('returns 422 when the batch is missing temperature_target', async () => {
      const pico = await seedPicoUnit(app, { handle: 'bir-no-temp', host: '127.0.0.1', port: 7512 });
      const batch = await seedBatch(app, pico.id, {
        species: 'oyster',
        humidity_target: 80,
        start_at: new Date('2024-01-01'),
        finish_at: new Date('2024-01-10'),
      });

      await request(app.getHttpServer())
        .post(`/batches/${batch.id}/recipe`)
        .send({ name: 'no-temp' })
        .expect(422);
    });

    it('returns 422 when the batch is missing humidity_target', async () => {
      const pico = await seedPicoUnit(app, { handle: 'bir-no-humid', host: '127.0.0.1', port: 7513 });
      const batch = await seedBatch(app, pico.id, {
        species: 'oyster',
        temperature_target: 22,
        start_at: new Date('2024-01-01'),
        finish_at: new Date('2024-01-10'),
      });

      await request(app.getHttpServer())
        .post(`/batches/${batch.id}/recipe`)
        .send({ name: 'no-humid' })
        .expect(422);
    });

    it('returns 400 when name is missing from the body', async () => {
      const pico = await seedPicoUnit(app, { handle: 'bir-no-name', host: '127.0.0.1', port: 7514 });
      const batch = await seedBatch(app, pico.id, {
        species: 'oyster',
        temperature_target: 22,
        humidity_target: 80,
        start_at: new Date('2024-01-01'),
        finish_at: new Date('2024-01-10'),
      });

      await request(app.getHttpServer())
        .post(`/batches/${batch.id}/recipe`)
        .send({})
        .expect(422);
    });

    it('returns 409 when a recipe with the same name already exists', async () => {
      const pico = await seedPicoUnit(app, { handle: 'bir-dup', host: '127.0.0.1', port: 7515 });
      const batch = await seedBatch(app, pico.id, {
        species: 'oyster',
        temperature_target: 22,
        humidity_target: 80,
        start_at: new Date('2024-01-01'),
        finish_at: new Date('2024-01-10'),
      });

      // First creation succeeds
      await request(app.getHttpServer())
        .post(`/batches/${batch.id}/recipe`)
        .send({ name: 'duplicate-recipe' })
        .expect(201);

      // Second with same name returns 409
      await request(app.getHttpServer())
        .post(`/batches/${batch.id}/recipe`)
        .send({ name: 'duplicate-recipe' })
        .expect(409);
    });
  });
});

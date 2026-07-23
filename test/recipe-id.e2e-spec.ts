import { INestApplication } from '@nestjs/common';

import request from 'supertest';

import {
  clearBatches,
  getBatchRepo,
  seedBatch,
} from './fixtures/batches.fixtures';
import { clearPicos, seedPicoUnit } from './fixtures/pico-units.fixtures';
import {
  clearRecipes,
  getRecipeRepo,
  seedRecipe,
} from './fixtures/recipes.fixtures';
import { closeTestApp, createTestApp } from './test-setup';

describe('RecipeIdV1Controller (e2e)', () => {
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

  // ─── Middleware ───────────────────────────────────────────────────────────

  describe('middleware validation', () => {
    it('returns 422 for a non-numeric id', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/recipes/abc')
        .expect(422);
      expect(res.body).toHaveProperty('statusCode', 422);
    });

    it('returns 422 for zero or negative id', async () => {
      await request(app.getHttpServer()).get('/v1/recipes/0').expect(422);
      await request(app.getHttpServer()).get('/v1/recipes/-5').expect(422);
    });

    it('returns 404 when the recipe does not exist', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/recipes/99999')
        .expect(404);
      expect(res.body).toHaveProperty('statusCode', 404);
    });
  });

  // ─── GET /recipes/:recipeId ───────────────────────────────────────────────

  describe('GET /recipes/:recipeId', () => {
    it('returns the correct recipe entity', async () => {
      const recipe = await seedRecipe(app, {
        name: 'get-test',
        species: 'shiitake',
        temperature_target: 20,
        humidity_target: 75,
        duration_days: 21,
      });

      const res = await request(app.getHttpServer())
        .get(`/v1/recipes/${recipe.id}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', recipe.id);
      expect(res.body.name).toBe('get-test');
      expect(res.body.species).toBe('shiitake');
      expect(res.body.temperature_target).toBe(20);
      expect(res.body.humidity_target).toBe(75);
      expect(res.body.duration_days).toBe(21);
    });
  });

  // ─── PATCH /recipes/:recipeId ─────────────────────────────────────────────

  describe('PATCH /recipes/:recipeId', () => {
    it('partially updates fields and returns the updated recipe', async () => {
      const recipe = await seedRecipe(app, {
        name: 'patch-me',
        species: 'oyster',
        duration_days: 14,
      });

      const res = await request(app.getHttpServer())
        .patch(`/v1/recipes/${recipe.id}`)
        .send({ species: 'pink oyster', duration_days: 21, notes: 'Updated' })
        .expect(200);

      expect(res.body).toHaveProperty('id', recipe.id);
      expect(res.body.species).toBe('pink oyster');
      expect(res.body.duration_days).toBe(21);
      expect(res.body.notes).toBe('Updated');
      // unchanged field
      expect(res.body.name).toBe('patch-me');

      const repo = await getRecipeRepo(app);
      const persisted = await repo.findOneBy({ id: recipe.id });
      expect(persisted!.species).toBe('pink oyster');
    });

    it('returns 422 when temperature_target is out of range', async () => {
      const recipe = await seedRecipe(app, { name: 'patch-invalid' });

      await request(app.getHttpServer())
        .patch(`/v1/recipes/${recipe.id}`)
        .send({ temperature_target: 99 })
        .expect(422);

      await request(app.getHttpServer())
        .patch(`/v1/recipes/${recipe.id}`)
        .send({ humidity_target: 10 })
        .expect(422);
    });
  });

  // ─── DELETE /recipes/:recipeId ────────────────────────────────────────────

  describe('DELETE /recipes/:recipeId', () => {
    it('deletes the recipe and a subsequent GET returns 404', async () => {
      const recipe = await seedRecipe(app, { name: 'to-delete' });

      await request(app.getHttpServer())
        .delete(`/v1/recipes/${recipe.id}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/v1/recipes/${recipe.id}`)
        .expect(404);

      const repo = await getRecipeRepo(app);
      const found = await repo.findOneBy({ id: recipe.id });
      expect(found).toBeNull();
    });

    it('sets recipe_id to NULL on linked batches after deletion (ON DELETE SET NULL)', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'del-recipe-pico',
        port: 7100,
      });
      const recipe = await seedRecipe(app, { name: 'to-delete-with-batch' });

      // create a batch linked to this recipe
      const batch = await seedBatch(app, pico.id, { recipe_id: recipe.id });
      expect(batch.recipe_id).toBe(recipe.id);

      // delete the recipe
      await request(app.getHttpServer())
        .delete(`/v1/recipes/${recipe.id}`)
        .expect(204);

      // batch should still exist but recipe_id should be NULL
      const batchRepo = await getBatchRepo(app);
      const persisted = await batchRepo.findOneBy({ id: batch.id });
      expect(persisted).toBeDefined();
      expect(persisted!.recipe_id).toBeNull();
    });

    it('returns 422 for non-numeric id on delete', async () => {
      await request(app.getHttpServer())
        .delete('/v1/recipes/not-a-number')
        .expect(422);
    });
  });
});

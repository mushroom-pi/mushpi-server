import { INestApplication } from '@nestjs/common';

import request from 'supertest';

import { clearBatches, seedBatch } from './fixtures/batches.fixtures';
import { clearPicos, seedPicoUnit } from './fixtures/pico-units.fixtures';
import { clearRecipes, seedRecipe } from './fixtures/recipes.fixtures';
import { closeTestApp, createTestApp } from './test-setup';

describe('RecipeIdBatchesController (e2e)', () => {
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

  describe('GET /recipes/:recipeId/batches', () => {
    it('returns an empty list when the recipe has no linked batches', async () => {
      const recipe = await seedRecipe(app, { name: 'empty-recipe' });

      const res = await request(app.getHttpServer())
        .get(`/recipes/${recipe.id}/batches`)
        .expect(200);

      expect(res.body).toMatchObject({ items: [], total: 0 });
    });

    it('returns only batches linked to this recipe', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'rb-pico',
        host: '127.0.0.1',
        port: 7200,
      });
      const recipeA = await seedRecipe(app, { name: 'recipe-a' });
      const recipeB = await seedRecipe(app, { name: 'recipe-b' });

      // 2 batches for recipeA, 1 for recipeB, 1 with no recipe
      await seedBatch(app, pico.id, { recipe_id: recipeA.id, notes: 'A-1' });
      await seedBatch(app, pico.id, { recipe_id: recipeA.id, notes: 'A-2' });
      await seedBatch(app, pico.id, { recipe_id: recipeB.id, notes: 'B-1' });
      await seedBatch(app, pico.id, { notes: 'no-recipe' });

      const res = await request(app.getHttpServer())
        .get(`/recipes/${recipeA.id}/batches`)
        .expect(200);

      expect(res.body.total).toBe(2);
      const notes = res.body.items.map((b: any) => b.notes);
      expect(notes).toEqual(expect.arrayContaining(['A-1', 'A-2']));
      expect(notes).not.toContain('B-1');
      expect(notes).not.toContain('no-recipe');
    });

    it('respects page and limit pagination', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'rb-paged-pico',
        host: '127.0.0.1',
        port: 7201,
      });
      const recipe = await seedRecipe(app, { name: 'paged-recipe' });

      for (let i = 0; i < 5; i++) {
        await seedBatch(app, pico.id, {
          recipe_id: recipe.id,
          notes: `batch-${i}`,
        });
      }

      const res = await request(app.getHttpServer())
        .get(`/recipes/${recipe.id}/batches`)
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(res.body.items.length).toBe(2);
      expect(res.body.total).toBe(5);
      expect(res.body.pages).toBe(3);

      const res2 = await request(app.getHttpServer())
        .get(`/recipes/${recipe.id}/batches`)
        .query({ page: 3, limit: 2 })
        .expect(200);

      expect(res2.body.items.length).toBe(1);
    });
  });
});

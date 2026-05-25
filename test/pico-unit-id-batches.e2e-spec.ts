import { INestApplication } from '@nestjs/common';

import request from 'supertest';

import { clearBatches, seedBatch } from './fixtures/batches.fixtures';
import { clearPicos, seedPicoUnit } from './fixtures/pico-units.fixtures';
import { clearRecipes, seedRecipe } from './fixtures/recipes.fixtures';
import { closeTestApp, createTestApp } from './test-setup';

describe('PicoUnitIdBatchesController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(async () => {
    // keep tests isolated
    await clearBatches(app);
    await clearRecipes(app);
    await clearPicos(app);
  });

  describe('GET /pico-units/:id/batches (list)', () => {
    it('returns paginated batches for the requested pico unit only', async () => {
      // create two pico units
      const picoA = await seedPicoUnit(app, {
        handle: 'pu-a',
        host: 'a.local',
        port: 6000,
      });
      const picoB = await seedPicoUnit(app, {
        handle: 'pu-b',
        host: 'b.local',
        port: 6001,
      });

      // create 3 batches for A, 2 for B (different start_at times)
      const now = Date.now();
      await seedBatch(app, picoA.id, {
        start_at: new Date(now - 50000),
        notes: 'A-1',
      });
      await seedBatch(app, picoA.id, {
        start_at: new Date(now - 40000),
        notes: 'A-2',
      });
      await seedBatch(app, picoA.id, {
        start_at: new Date(now - 30000),
        notes: 'A-3',
      });

      await seedBatch(app, picoB.id, {
        start_at: new Date(now - 20000),
        notes: 'B-1',
      });
      await seedBatch(app, picoB.id, {
        start_at: new Date(now - 10000),
        notes: 'B-2',
      });

      // request list for picoA with pagination limit=2 -> should get first 2 of picoA
      const res1 = await request(app.getHttpServer())
        .get(`/pico-units/${picoA.id}/batches`)
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(Array.isArray(res1.body.items)).toBe(true);
      expect(res1.body.items.length).toBe(2);
      expect(res1.body.total).toBe(3);
      expect(res1.body.page).toBe(1);
      expect(res1.body.limit).toBe(2);
      expect(res1.body.pages).toBe(Math.ceil(3 / 2));

      // page 2 should contain the remaining one for picoA
      const res2 = await request(app.getHttpServer())
        .get(`/pico-units/${picoA.id}/batches`)
        .query({ page: 2, limit: 2 })
        .expect(200);

      expect(Array.isArray(res2.body.items)).toBe(true);
      expect(res2.body.items.length).toBe(1);

      // Ensure no batches for picoB are returned in picoA requests
      const idsA = res1.body.items
        .concat(res2.body.items)
        .map((b: any) => b.pico_unit_id);
      expect(idsA.every((id: number) => id === picoA.id)).toBe(true);
    });

    it('accepts status filter and pico_unit_id is implicit by path', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'pu-status',
        host: 's.local',
        port: 6010,
      });
      const now = Date.now();

      // finished batch (finish in past)
      await seedBatch(app, pico.id, {
        start_at: new Date(now - 60000000),
        finish_at: new Date(now - 30000000),
        notes: 'finished',
      });

      // in-progress: finish_at null
      await seedBatch(app, pico.id, {
        start_at: new Date(now - 20000000),
        finish_at: null,
        notes: 'in-progress-null',
      });

      // in-progress: finish_at in future
      await seedBatch(app, pico.id, {
        start_at: new Date(now - 10000000),
        finish_at: new Date(now + 60000000),
        notes: 'in-progress-future',
      });

      // Query in-progress for this pico unit
      const resIn = await request(app.getHttpServer())
        .get(`/pico-units/${pico.id}/batches`)
        .query({ status: 'in-progress' })
        .expect(200);

      // Two in-progress batches expected
      expect(resIn.body.total).toBe(2);
      const notes = resIn.body.items.map((it: any) => it.notes);
      expect(notes).toEqual(
        expect.arrayContaining(['in-progress-null', 'in-progress-future']),
      );

      // Query finished
      const resFin = await request(app.getHttpServer())
        .get(`/pico-units/${pico.id}/batches`)
        .query({ status: 'finished' })
        .expect(200);

      expect(resFin.body.total).toBe(1);
      expect(resFin.body.items[0].notes).toBe('finished');
    });

    it('includes recipe but NOT pico_unit in response', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'pu-rel-test',
        host: 'pu-rel.local',
        port: 6015,
      });
      const recipe = await seedRecipe(app, {
        name: 'pico-list-recipe',
        species: 'shiitake',
      });

      // Create batches with and without recipe
      await seedBatch(app, pico.id, {
        recipe_id: recipe.id,
        notes: 'has-recipe',
      });
      await seedBatch(app, pico.id, { notes: 'no-recipe' });

      const res = await request(app.getHttpServer())
        .get(`/pico-units/${pico.id}/batches`)
        .expect(200);

      expect(res.body.items.length).toBe(2);

      // Verify pico_unit is NOT included
      res.body.items.forEach((item: any) => {
        expect(item.pico_unit).toBeUndefined();
      });

      // Verify recipe IS included when present
      const withRecipe = res.body.items.find(
        (item: any) => item.notes === 'has-recipe',
      );
      expect(withRecipe.recipe).toBeDefined();
      expect(withRecipe.recipe.id).toBe(recipe.id);

      // Verify recipe is null when not present
      const noRecipe = res.body.items.find(
        (item: any) => item.notes === 'no-recipe',
      );
      expect(noRecipe.recipe).toBeNull();
    });
  });

  describe('GET /pico-units/:id/batches/current', () => {
    it('returns the active batch when finish_at is null', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'pu-current1',
        host: 'c1.local',
        port: 6020,
      });
      const now = Date.now();

      // finished
      await seedBatch(app, pico.id, {
        start_at: new Date(now - 60000),
        finish_at: new Date(now - 30000),
      });

      // active (finish_at null)
      const active = await seedBatch(app, pico.id, {
        start_at: new Date(now - 10000),
        finish_at: null,
        notes: 'active-null',
      });

      const res = await request(app.getHttpServer())
        .get(`/pico-units/${pico.id}/batches/current`)
        .expect(200);

      // Should return the active batch object
      expect(res.body).not.toBeNull();
      expect(res.body.id).toBe(active.id);
      expect(res.body.pico_unit_id).toBe(pico.id);
    });

    it('returns the active batch when finish_at is in the future', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'pu-current2',
        host: 'c2.local',
        port: 6021,
      });
      const now = Date.now();

      // finished
      await seedBatch(app, pico.id, {
        start_at: new Date(now - 60000),
        finish_at: new Date(now - 30000),
      });

      // active (finish_at in future)
      const active = await seedBatch(app, pico.id, {
        start_at: new Date(now - 10000),
        finish_at: new Date(now + 60000),
        notes: 'active-future',
      });

      const res = await request(app.getHttpServer())
        .get(`/pico-units/${pico.id}/batches/current`)
        .expect(200);

      expect(res.body).not.toBeNull();
      expect(res.body.id).toBe(active.id);
      expect(res.body.pico_unit_id).toBe(pico.id);
    });

    it('returns 404 when there is no active batch', async () => {
      const pico = await seedPicoUnit(app, {
        handle: 'pu-none',
        host: 'none.local',
        port: 6022,
      });
      const now = Date.now();

      // one finished batch only
      await seedBatch(app, pico.id, {
        start_at: new Date(now - 60000),
        finish_at: new Date(now - 30000),
      });

      await request(app.getHttpServer())
        .get(`/pico-units/${pico.id}/batches/current`)
        .expect(404);
    });
  });
});

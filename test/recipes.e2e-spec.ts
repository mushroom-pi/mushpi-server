import { INestApplication } from '@nestjs/common';

import request from 'supertest';

import {
  clearRecipes,
  getRecipeRepo,
  seedRecipe,
} from './fixtures/recipes.fixtures';
import { closeTestApp, createTestApp } from './test-setup';

describe('RecipesController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(async () => {
    await clearRecipes(app);
  });

  // ─── GET /recipes ────────────────────────────────────────────────────────────

  describe('GET /recipes', () => {
    it('returns an empty paginated response when no recipes exist', async () => {
      const res = await request(app.getHttpServer())
        .get('/recipes')
        .expect(200);

      expect(res.body).toMatchObject({ items: [], total: 0, page: 1 });
    });

    it('returns paginated list respecting page and limit', async () => {
      for (let i = 0; i < 5; i++) {
        await seedRecipe(app, {
          name: `recipe-list-${i}`,
          species: 'shiitake',
        });
      }

      const res = await request(app.getHttpServer())
        .get('/recipes')
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(res.body.items.length).toBe(2);
      expect(res.body.total).toBe(5);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(2);
      expect(res.body.pages).toBe(3);

      const page2 = await request(app.getHttpServer())
        .get('/recipes')
        .query({ page: 2, limit: 2 })
        .expect(200);

      expect(page2.body.items.length).toBe(2);
    });

    it('filters by species (partial match)', async () => {
      await seedRecipe(app, { name: 'r-oyster', species: 'oyster mushroom' });
      await seedRecipe(app, { name: 'r-shiitake', species: 'shiitake' });
      await seedRecipe(app, { name: 'r-oyster-2', species: 'pink oyster' });

      const res = await request(app.getHttpServer())
        .get('/recipes')
        .query({ species: 'oyster' })
        .expect(200);

      expect(res.body.total).toBe(2);
      const names = res.body.items.map((r: any) => r.name);
      expect(names).toEqual(expect.arrayContaining(['r-oyster', 'r-oyster-2']));
    });
  });

  // ─── POST /recipes ───────────────────────────────────────────────────────────

  describe('POST /recipes', () => {
    it('creates a recipe with all fields and returns 201', async () => {
      const payload = {
        name: 'Golden Oyster 30d',
        species: 'Pleurotus citrinopileatus',
        temperature_target: 24,
        humidity_target: 85,
        duration_days: 30,
        notes: 'Prefers cooler fruiting temps',
      };

      const res = await request(app.getHttpServer())
        .post('/recipes')
        .send(payload)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe(payload.name);
      expect(res.body.species).toBe(payload.species);
      expect(res.body.temperature_target).toBe(24);
      expect(res.body.humidity_target).toBe(85);
      expect(res.body.duration_days).toBe(30);
      expect(res.body.notes).toBe(payload.notes);

      // persisted in DB
      const repo = await getRecipeRepo(app);
      const persisted = await repo.findOneBy({ id: res.body.id });
      expect(persisted).toBeDefined();
      expect(persisted!.name).toBe(payload.name);
    });

    it('creates a recipe without optional notes', async () => {
      const payload = {
        name: 'No-notes recipe',
        species: 'shiitake',
        temperature_target: 20,
        humidity_target: 75,
        duration_days: 21,
      };

      const res = await request(app.getHttpServer())
        .post('/recipes')
        .send(payload)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.notes == null || res.body.notes === '').toBe(true);
    });

    it('returns 422 when required fields are missing', async () => {
      // missing everything
      await request(app.getHttpServer()).post('/recipes').send({}).expect(422);

      // missing species
      await request(app.getHttpServer())
        .post('/recipes')
        .send({
          name: 'incomplete',
          temperature_target: 20,
          humidity_target: 70,
          duration_days: 10,
        })
        .expect(422);
    });

    it('returns 422 when temperature_target is out of range', async () => {
      const base = {
        name: 'temp-test',
        species: 'oyster',
        humidity_target: 70,
        duration_days: 10,
      };

      await request(app.getHttpServer())
        .post('/recipes')
        .send({ ...base, temperature_target: -1 })
        .expect(422);

      await request(app.getHttpServer())
        .post('/recipes')
        .send({ ...base, temperature_target: 51 })
        .expect(422);
    });

    it('returns 422 when humidity_target is out of range', async () => {
      const base = {
        name: 'hum-test',
        species: 'oyster',
        temperature_target: 22,
        duration_days: 10,
      };

      await request(app.getHttpServer())
        .post('/recipes')
        .send({ ...base, humidity_target: 19 })
        .expect(422);

      await request(app.getHttpServer())
        .post('/recipes')
        .send({ ...base, humidity_target: 91 })
        .expect(422);
    });

    it('returns 422 when duration_days is less than 1', async () => {
      await request(app.getHttpServer())
        .post('/recipes')
        .send({
          name: 'duration-test',
          species: 'oyster',
          temperature_target: 22,
          humidity_target: 70,
          duration_days: 0,
        })
        .expect(422);
    });

    it('returns 409 when a recipe with the same name already exists', async () => {
      const payload = {
        name: 'duplicate-name',
        species: 'oyster',
        temperature_target: 22,
        humidity_target: 70,
        duration_days: 14,
      };

      await request(app.getHttpServer())
        .post('/recipes')
        .send(payload)
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/recipes')
        .send(payload)
        .expect(409);

      expect(res.body).toHaveProperty('statusCode', 409);
    });
  });
});

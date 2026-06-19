import { INestApplication } from '@nestjs/common';

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';

import { RECIPE_IMAGE_UPLOAD_DIR } from '../src/modules/recipes/recipes.constant';
import { clearPicos } from './fixtures/pico-units.fixtures';
import {
  clearRecipes,
  getRecipeRepo,
  seedRecipe,
} from './fixtures/recipes.fixtures';
import { closeTestApp, createTestApp } from './test-setup';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('RecipeIdImageController (e2e)', () => {
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
    await clearPicos(app);
    mockedAxios.head.mockReset();
    mockedAxios.isAxiosError = jest.fn(
      (err: any) => err?.isAxiosError === true,
    ) as any;
  });

  // ─── Middleware ───────────────────────────────────────────────────────────

  describe('middleware validation', () => {
    it('returns 422 for a non-numeric id on PUT', async () => {
      await request(app.getHttpServer()).put('/recipes/abc/image').expect(422);
    });

    it('returns 404 when the recipe does not exist on PUT', async () => {
      await request(app.getHttpServer())
        .put('/recipes/99999/image')
        .expect(404);
    });

    it('returns 404 when the recipe does not exist on DELETE', async () => {
      await request(app.getHttpServer())
        .delete('/recipes/99999/image')
        .expect(404);
    });
  });

  // ─── PUT /recipes/:recipeId/image ────────────────────────────────────────

  describe('PUT /recipes/:recipeId/image', () => {
    it('uploads a JPEG file and stores the relative path in the database', async () => {
      const recipe = await seedRecipe(app, { name: 'upload-jpeg' });

      const imageBuffer = Buffer.from('fake-jpeg-data', 'utf-8');

      const res = await request(app.getHttpServer())
        .put(`/recipes/${recipe.id}/image`)
        .attach('image', imageBuffer, 'test.jpg')
        .expect(200);

      expect(res.body).toHaveProperty('id', recipe.id);
      expect(res.body.image).toBe(`/images/recipes/${recipe.id}.jpg`);
      expect(res.body.image_url).toMatch(
        new RegExp(`^http://localhost:\\d+/images/recipes/${recipe.id}\\.jpg$`),
      );

      const repo = await getRecipeRepo(app);
      const persisted = await repo.findOneBy({ id: recipe.id });
      expect(persisted!.image).toBe(`/images/recipes/${recipe.id}.jpg`);

      const filePath = path.join(RECIPE_IMAGE_UPLOAD_DIR, `${recipe.id}.jpg`);
      expect(fs.existsSync(filePath)).toBe(true);
      fs.unlinkSync(filePath);
    });

    it('uploads a PNG file and stores the filename with .png extension', async () => {
      const recipe = await seedRecipe(app, { name: 'upload-png' });

      const imageBuffer = Buffer.from('fake-png-data', 'utf-8');

      const res = await request(app.getHttpServer())
        .put(`/recipes/${recipe.id}/image`)
        .attach('image', imageBuffer, 'test.png')
        .expect(200);

      expect(res.body.image).toBe(`/images/recipes/${recipe.id}.png`);
      expect(res.body.image_url).toMatch(
        new RegExp(`^http://localhost:\\d+/images/recipes/${recipe.id}\\.png$`),
      );

      const filePath = path.join(RECIPE_IMAGE_UPLOAD_DIR, `${recipe.id}.png`);
      expect(fs.existsSync(filePath)).toBe(true);
      fs.unlinkSync(filePath);
    });

    it('sets an external URL after validating it points to an image', async () => {
      const recipe = await seedRecipe(app, { name: 'set-url' });

      mockedAxios.head.mockResolvedValueOnce({
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      } as any);

      const res = await request(app.getHttpServer())
        .put(`/recipes/${recipe.id}/image`)
        .send({ url: 'https://example.com/image.jpg' })
        .expect(200);

      expect(res.body.image).toBe('https://example.com/image.jpg');
      expect(res.body.image_url).toBe('https://example.com/image.jpg');

      const repo = await getRecipeRepo(app);
      const persisted = await repo.findOneBy({ id: recipe.id });
      expect(persisted!.image).toBe('https://example.com/image.jpg');

      expect(mockedAxios.head).toHaveBeenCalledWith(
        'https://example.com/image.jpg',
        expect.objectContaining({ timeout: 10000 }),
      );
    });

    it('returns 406 when the URL is not accessible', async () => {
      const recipe = await seedRecipe(app, { name: 'url-404' });

      mockedAxios.head.mockResolvedValueOnce({
        status: 404,
        headers: {},
      } as any);

      const res = await request(app.getHttpServer())
        .put(`/recipes/${recipe.id}/image`)
        .send({ url: 'https://example.com/not-found.jpg' })
        .expect(406);

      expect(res.body).toHaveProperty('statusCode', 406);
      expect(res.body.message).toContain('not accessible');
    });

    it('returns 406 when the URL does not point to an image', async () => {
      const recipe = await seedRecipe(app, { name: 'url-html' });

      mockedAxios.head.mockResolvedValueOnce({
        status: 200,
        headers: { 'content-type': 'text/html' },
      } as any);

      const res = await request(app.getHttpServer())
        .put(`/recipes/${recipe.id}/image`)
        .send({ url: 'https://example.com/page.html' })
        .expect(406);

      expect(res.body).toHaveProperty('statusCode', 406);
      expect(res.body.message).toContain('does not point to a valid image');
    });

    it('returns 406 when the URL validation fails due to network error', async () => {
      const recipe = await seedRecipe(app, { name: 'url-error' });

      mockedAxios.head.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const res = await request(app.getHttpServer())
        .put(`/recipes/${recipe.id}/image`)
        .send({ url: 'https://example.com/image.jpg' })
        .expect(406);

      expect(res.body).toHaveProperty('statusCode', 406);
    });

    it('returns 400 when neither file nor URL is provided', async () => {
      const recipe = await seedRecipe(app, { name: 'no-image' });

      const res = await request(app.getHttpServer())
        .put(`/recipes/${recipe.id}/image`)
        .send({})
        .expect(400);

      expect(res.body).toHaveProperty('statusCode', 400);
      expect(res.body.message).toContain('Provide an image file');
    });

    it('returns 400 when file type is not allowed', async () => {
      const recipe = await seedRecipe(app, { name: 'wrong-type' });

      const imageBuffer = Buffer.from('fake-gif-data', 'utf-8');

      const res = await request(app.getHttpServer())
        .put(`/recipes/${recipe.id}/image`)
        .attach('image', imageBuffer, 'test.gif')
        .expect(400);

      expect(res.body).toHaveProperty('statusCode', 400);
      expect(res.body.message).toContain('Invalid file type');
    });

    it('replaces existing image when uploading a new file', async () => {
      const recipe = await seedRecipe(app, { name: 'replace-image' });

      const imageBuffer1 = Buffer.from('fake-jpeg-1', 'utf-8');
      await request(app.getHttpServer())
        .put(`/recipes/${recipe.id}/image`)
        .attach('image', imageBuffer1, 'test1.jpg')
        .expect(200);

      const filePath1 = path.join(RECIPE_IMAGE_UPLOAD_DIR, `${recipe.id}.jpg`);
      expect(fs.existsSync(filePath1)).toBe(true);

      const imageBuffer2 = Buffer.from('fake-png-2', 'utf-8');
      const res = await request(app.getHttpServer())
        .put(`/recipes/${recipe.id}/image`)
        .attach('image', imageBuffer2, 'test2.png')
        .expect(200);

      expect(res.body.image).toBe(`/images/recipes/${recipe.id}.png`);
      expect(fs.existsSync(filePath1)).toBe(false);

      const filePath2 = path.join(RECIPE_IMAGE_UPLOAD_DIR, `${recipe.id}.png`);
      expect(fs.existsSync(filePath2)).toBe(true);
      fs.unlinkSync(filePath2);
    });

    it('replaces existing URL when uploading a file', async () => {
      const recipe = await seedRecipe(app, { name: 'url-to-file' });

      mockedAxios.head.mockResolvedValueOnce({
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      } as any);

      await request(app.getHttpServer())
        .put(`/recipes/${recipe.id}/image`)
        .send({ url: 'https://example.com/old.jpg' })
        .expect(200);

      const imageBuffer = Buffer.from('fake-png', 'utf-8');
      const res = await request(app.getHttpServer())
        .put(`/recipes/${recipe.id}/image`)
        .attach('image', imageBuffer, 'new.png')
        .expect(200);

      expect(res.body.image).toBe(`/images/recipes/${recipe.id}.png`);
      fs.unlinkSync(path.join(RECIPE_IMAGE_UPLOAD_DIR, `${recipe.id}.png`));
    });
  });

  // ─── DELETE /recipes/:recipeId/image ─────────────────────────────────────

  describe('DELETE /recipes/:recipeId/image', () => {
    it('removes the image and deletes the file from disk', async () => {
      const recipe = await seedRecipe(app, { name: 'delete-image' });

      const imageBuffer = Buffer.from('fake-jpeg-data', 'utf-8');
      await request(app.getHttpServer())
        .put(`/recipes/${recipe.id}/image`)
        .attach('image', imageBuffer, 'test.jpg')
        .expect(200);

      const filePath = path.join(RECIPE_IMAGE_UPLOAD_DIR, `${recipe.id}.jpg`);
      expect(fs.existsSync(filePath)).toBe(true);

      await request(app.getHttpServer())
        .delete(`/recipes/${recipe.id}/image`)
        .expect(204);

      expect(fs.existsSync(filePath)).toBe(false);

      const repo = await getRecipeRepo(app);
      const persisted = await repo.findOneBy({ id: recipe.id });
      expect(persisted!.image).toBeNull();
    });

    it('removes the image URL without file deletion', async () => {
      const recipe = await seedRecipe(app, { name: 'delete-url' });

      mockedAxios.head.mockResolvedValueOnce({
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      } as any);

      await request(app.getHttpServer())
        .put(`/recipes/${recipe.id}/image`)
        .send({ url: 'https://example.com/image.jpg' })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/recipes/${recipe.id}/image`)
        .expect(204);

      const repo = await getRecipeRepo(app);
      const persisted = await repo.findOneBy({ id: recipe.id });
      expect(persisted!.image).toBeNull();
    });

    it('returns 404 when no image is set', async () => {
      const recipe = await seedRecipe(app, { name: 'no-image' });

      const res = await request(app.getHttpServer())
        .delete(`/recipes/${recipe.id}/image`)
        .expect(404);

      expect(res.body).toHaveProperty('statusCode', 404);
      expect(res.body.message).toContain('No image set');
    });
  });
});

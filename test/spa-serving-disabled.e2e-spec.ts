import { INestApplication } from '@nestjs/common';

import request from 'supertest';

import { closeTestApp, createModuleFixture, createTestApp } from './test-setup';

describe('SPA serving (disabled)', () => {
  describe('default (CLIENT_DIST_DIR unset)', () => {
    let app: INestApplication;

    beforeAll(async () => {
      // Ensure env is not set — Jest isolates per file but be explicit
      delete process.env.CLIENT_DIST_DIR;
      const moduleFixture = await createModuleFixture({
        withServeStatic: true,
      });
      app = await createTestApp(moduleFixture);
      await app.init();
    });

    afterAll(async () => {
      await closeTestApp(app);
    });

    it('GET / → 404 (no SPA fallback)', () => {
      return request(app.getHttpServer()).get('/').expect(404);
    });

    it('GET /settings → 404 (no SPA fallback)', () => {
      return request(app.getHttpServer()).get('/settings').expect(404);
    });

    it('GET /v1/nonexistent → 404', () => {
      return request(app.getHttpServer()).get('/v1/nonexistent').expect(404);
    });
  });

  describe('misconfigured path (nonexistent directory)', () => {
    let app: INestApplication;

    beforeAll(async () => {
      process.env.CLIENT_DIST_DIR = '/nonexistent/path/that/does/not/exist';
      const moduleFixture = await createModuleFixture({
        withServeStatic: true,
      });
      app = await createTestApp(moduleFixture);
      await app.init();
    });

    afterAll(async () => {
      await closeTestApp(app);
      delete process.env.CLIENT_DIST_DIR;
    });

    it('GET / → 404 (SPA serving disabled when index.html missing)', () => {
      return request(app.getHttpServer()).get('/').expect(404);
    });

    it('GET /pico-units/5 → 404 (no SPA fallback)', () => {
      return request(app.getHttpServer()).get('/pico-units/5').expect(404);
    });
  });
});

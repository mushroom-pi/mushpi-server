import { INestApplication } from '@nestjs/common';

import * as path from 'path';
import request from 'supertest';

import { closeTestApp, createModuleFixture, createTestApp } from './test-setup';

describe('SPA serving (enabled)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.CLIENT_DIST_DIR = path.join(__dirname, 'fixtures', 'spa-dist');
    const moduleFixture = await createModuleFixture({ withServeStatic: true });
    app = await createTestApp(moduleFixture);
    await app.init();
  });

  afterAll(async () => {
    await closeTestApp(app);
    delete process.env.CLIENT_DIST_DIR;
  });

  describe('GET /', () => {
    it('should serve index.html with 200 text/html containing fixture marker', async () => {
      const res = await request(app.getHttpServer()).get('/').expect(200);

      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('mushpi-spa-fixture-root');
    });

    it('should set Cache-Control: no-cache for index.html', async () => {
      const res = await request(app.getHttpServer()).get('/').expect(200);

      expect(res.headers['cache-control']).toMatch(/no-cache/);
    });
  });

  describe('GET /assets/app.js', () => {
    it('should serve the JS asset with 200', async () => {
      await request(app.getHttpServer()).get('/assets/app.js').expect(200);
    });

    it('should set Cache-Control: public, max-age=31536000, immutable for assets', async () => {
      const res = await request(app.getHttpServer())
        .get('/assets/app.js')
        .expect(200);

      expect(res.headers['cache-control']).toMatch(
        /public, max-age=31536000, immutable/,
      );
    });
  });

  describe('SPA history fallback', () => {
    it('GET /pico-units/5 → 200 text/html with fixture marker', async () => {
      const res = await request(app.getHttpServer())
        .get('/pico-units/5')
        .expect(200);

      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('mushpi-spa-fixture-root');
    });

    it('GET /settings → 200 text/html with fixture marker', async () => {
      const res = await request(app.getHttpServer())
        .get('/settings')
        .expect(200);

      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('mushpi-spa-fixture-root');
    });
  });

  describe('API routes are NOT caught by SPA fallback', () => {
    it('GET /v1/settings → 200 JSON (not HTML)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/settings')
        .expect(200);

      expect(res.headers['content-type']).toMatch(/json/);
      expect(res.text).not.toContain('mushpi-spa-fixture-root');
    });

    it('GET /v1/nonexistent → 404 JSON (exclude works)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/nonexistent')
        .expect(404);

      expect(res.body).toHaveProperty('statusCode', 404);
      expect(res.text).not.toContain('mushpi-spa-fixture-root');
    });

    it('POST /v1/nonexistent → 404 (catch-all is GET-only)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/nonexistent')
        .expect(404);

      expect(res.body).toHaveProperty('statusCode', 404);
    });
  });

  describe('Monitoring endpoints', () => {
    it('GET /ping → 200', () => {
      return request(app.getHttpServer()).get('/ping').expect(200);
    });

    it('GET /health → 200 JSON', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);

      expect(res.headers['content-type']).toMatch(/json/);
    });

    it('GET /metrics → 200', () => {
      return request(app.getHttpServer()).get('/metrics').expect(200);
    });
  });

  describe('/images is unaffected by SPA fallback', () => {
    it('GET /images/missing.jpg → 404, body does NOT contain fixture marker', async () => {
      const res = await request(app.getHttpServer())
        .get('/images/missing.jpg')
        .expect(404);

      expect(res.text).not.toContain('mushpi-spa-fixture-root');
    });
  });
});

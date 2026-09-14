import { INestApplication } from '@nestjs/common';

import * as path from 'path';
import request from 'supertest';

import { closeTestApp, createModuleFixture, createTestApp } from './test-setup';

/**
 * The `/public` ServeStaticModule entry (asset-only archetype:
 * `index: false, fallthrough: false`) serves repo-root build-time branding
 * assets — currently only the Swagger UI favicon referenced by
 * `customfavIcon` in swagger.module.ts. A missing file must 404 terminally
 * and never fall through to the SPA catch-all.
 */
describe('Public assets serving (/public)', () => {
  const SPA_FIXTURE_MARKER = 'mushpi-spa-fixture-root';

  describe('without client dist (CLIENT_DIST_DIR unset)', () => {
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

    it('GET /public/favicon.svg → 200 image/svg+xml containing <svg', async () => {
      const res = await request(app.getHttpServer())
        .get('/public/favicon.svg')
        .expect(200);

      expect(res.headers['content-type']).toMatch(/image\/svg\+xml/);
      // supertest hands image/* bodies as Buffers (res.text is undefined)
      expect(res.body.toString('utf8')).toContain('<svg');
    });

    it('GET /public/missing.svg → 404 (terminal, no SPA fallback body)', async () => {
      const res = await request(app.getHttpServer())
        .get('/public/missing.svg')
        .expect(404);

      expect(res.text).not.toContain(SPA_FIXTURE_MARKER);
    });

    it('GET /public (exact) → 404 (index: false)', () => {
      return request(app.getHttpServer()).get('/public').expect(404);
    });

    it('GET /public/ (trailing slash) → 404', () => {
      return request(app.getHttpServer()).get('/public/').expect(404);
    });
  });

  describe('with client dist active (SPA catch-all registered)', () => {
    let app: INestApplication;

    beforeAll(async () => {
      // Must be set BEFORE the fixture is built — the ServeStaticModule
      // useFactory reads CLIENT_DIST_DIR at module init time.
      process.env.CLIENT_DIST_DIR = path.join(
        __dirname,
        'fixtures',
        'spa-dist',
      );
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

    it('sanity: SPA catch-all is actually active (GET / → fixture marker)', async () => {
      const res = await request(app.getHttpServer()).get('/').expect(200);

      expect(res.text).toContain(SPA_FIXTURE_MARKER);
    });

    it('GET /public/favicon.svg → 200 SVG, body does NOT contain the SPA marker (ordering proof)', async () => {
      const res = await request(app.getHttpServer())
        .get('/public/favicon.svg')
        .expect(200);

      expect(res.headers['content-type']).toMatch(/image\/svg\+xml/);
      const svgBody = res.body.toString('utf8');
      expect(svgBody).toContain('<svg');
      expect(svgBody).not.toContain(SPA_FIXTURE_MARKER);
    });

    it('GET /public/missing.svg → 404, body does NOT contain the SPA marker (ordering proof)', async () => {
      const res = await request(app.getHttpServer())
        .get('/public/missing.svg')
        .expect(404);

      expect(res.text).not.toContain(SPA_FIXTURE_MARKER);
    });

    it('GET /public (exact) → 404, not the SPA index.html', async () => {
      const res = await request(app.getHttpServer()).get('/public').expect(404);

      expect(res.text).not.toContain(SPA_FIXTURE_MARKER);
    });

    it('GET /public/ (trailing slash) → 404, not the SPA index.html', async () => {
      const res = await request(app.getHttpServer())
        .get('/public/')
        .expect(404);

      expect(res.text).not.toContain(SPA_FIXTURE_MARKER);
    });
  });
});

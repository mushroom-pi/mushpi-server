import { INestApplication } from '@nestjs/common';

import request from 'supertest';

/**
 * Runtime disclosure of the served docs path (e2e).
 *
 * When the boot is configured with a docs path (`DOCS_ENDPOINT` set — the
 * same rule for a self-hosted hub and for the public demo, no profile
 * distinction), `GET /health` discloses where the interactive API contract
 * lives: the `server` section carries `docsPath` with the configured value,
 * so a consumer learns it at runtime instead of relying on a build-time
 * constant. The disabled state (the key absent, the server section holding
 * exactly its pre-disclosure keys) is guarded by `monitoring.e2e-spec.ts`.
 *
 * Boot pattern mirrors `demo-host-details.e2e-spec.ts`: `@nestjs/config` runs
 * the Joi validation once per module-graph import, so `process.env` is set
 * BEFORE `jest.resetModules()` and the fixture is dynamically imported
 * afterwards. `NODE_ENV` stays `test`: `.env.test` still supplies
 * `SQLITE_PATH=':memory:'`, the `DOCS_ENDPOINT` default (`contract`) applies
 * only to `local` boots so the explicit value here is what validates, and
 * `ProtectEventLoopMiddleware` stays inert on the test profile. The companion
 * docs keys are deleted so a stray shell value cannot confuse the
 * enabled-branch validation (e.g. a password without its username).
 */
const ENV_KEYS = [
  'DOCS_ENDPOINT',
  'DOCS_UI_URL',
  'DOCS_USERNAME',
  'DOCS_PASSWORD',
] as const;

const originalEnv: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) originalEnv[key] = process.env[key];

function applyDocsEnv(): void {
  process.env.DOCS_ENDPOINT = 'api-docs';
  delete process.env.DOCS_UI_URL;
  delete process.env.DOCS_USERNAME;
  delete process.env.DOCS_PASSWORD;
}

function restoreOriginalEnv(): void {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
}

const http = (app: INestApplication) => request(app.getHttpServer());

describe('Health docs path disclosure (e2e)', () => {
  let app: INestApplication;
  let close: () => Promise<void>;

  beforeAll(async () => {
    applyDocsEnv();
    jest.resetModules();
    // All dynamic imports after the reset share one generation with the app
    // graph that `test-setup` pulls in.
    const setup = await import('./test-setup');
    app = await setup.createTestApp();
    await app.init();
    close = () => setup.closeTestApp(app);
  });

  afterAll(async () => {
    await close();
    restoreOriginalEnv();
  });

  describe('GET /health — docs enabled', () => {
    it('discloses the configured docs path and changes nothing else in the server section', async () => {
      const res = await http(app)
        .get('/health')
        .query({ system: 'false', databases: 'none', services: 'none' })
        .expect(200);

      expect(res.body).toHaveProperty('server');
      expect(res.body.server.docsPath).toBe('api-docs');

      // Purely additive: the disclosure joins the exact pre-existing key set.
      expect(Object.keys(res.body.server).sort()).toEqual(
        [
          'healthy',
          'environment',
          'loadAverage',
          'memoryUsageInMB',
          'upTime',
          'nodeVersion',
          'appVersion',
          'docsPath',
        ].sort(),
      );
    });

    it('discloses docsPath on the ungated full response as well', async () => {
      const res = await http(app).get('/health').expect(200);

      expect(res.body.server.docsPath).toBe('api-docs');
    });
  });
});

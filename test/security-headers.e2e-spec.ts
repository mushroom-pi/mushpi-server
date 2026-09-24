import { INestApplication } from '@nestjs/common';

import request from 'supertest';

/**
 * Security-header behaviour gated by APP_HTTPS_ENABLED.
 *
 * Plain-HTTP deployments (the default) must NOT receive HTTPS-only headers:
 * CSP `upgrade-insecure-requests` makes browsers rewrite the SPA's own
 * `/assets/*` subresources to https:// with no HTTP fallback, and HSTS pins
 * the host to TLS. `localhost` is exempt as a potentially trustworthy origin,
 * which is why the breakage only shows up on LAN addresses. The flag is
 * validated by @nestjs/config once per module-graph import, so each scenario
 * sets process.env and re-imports the fixture via jest.resetModules().
 */
describe('Security headers (e2e)', () => {
  const hadFlag = 'APP_HTTPS_ENABLED' in process.env;
  const originalFlag = process.env.APP_HTTPS_ENABLED;

  afterAll(() => {
    if (hadFlag) {
      process.env.APP_HTTPS_ENABLED = originalFlag;
    } else {
      delete process.env.APP_HTTPS_ENABLED;
    }
  });

  interface LaunchedApp {
    app: INestApplication;
    close: () => Promise<void>;
  }

  async function launchWithCurrentEnv(): Promise<LaunchedApp> {
    jest.resetModules();
    const setup = await import('./test-setup');
    const app = await setup.createTestApp();
    await app.init();
    return { app, close: () => setup.closeTestApp(app) };
  }

  async function expectHttpOnlyDefaults(launched: LaunchedApp) {
    const res = await request(launched.app.getHttpServer())
      .get('/ping')
      .expect(200);

    expect(res.headers['strict-transport-security']).toBeUndefined();

    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).not.toMatch(/upgrade-insecure-requests/);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("img-src 'self' data: blob: https:");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");

    // all other Helmet defaults stay untouched
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['referrer-policy']).toBeDefined();
  }

  describe.each([
    ['unset (Joi default false)', null],
    ['false', 'false'],
  ] as const)('APP_HTTPS_ENABLED %s', (_label, value) => {
    let launched: LaunchedApp;

    beforeEach(async () => {
      if (value === null) {
        delete process.env.APP_HTTPS_ENABLED;
      } else {
        process.env.APP_HTTPS_ENABLED = value;
      }
      launched = await launchWithCurrentEnv();
    });

    afterEach(async () => {
      await launched?.close();
    });

    it('omits HSTS and upgrade-insecure-requests', async () => {
      await expectHttpOnlyDefaults(launched);
    });
  });

  describe('APP_HTTPS_ENABLED=true', () => {
    let launched: LaunchedApp;

    beforeEach(async () => {
      process.env.APP_HTTPS_ENABLED = 'true';
      launched = await launchWithCurrentEnv();
    });

    afterEach(async () => {
      await launched?.close();
    });

    it('emits HSTS and upgrade-insecure-requests, CSP otherwise intact', async () => {
      const res = await request(launched.app.getHttpServer())
        .get('/ping')
        .expect(200);

      // Helmet's stock HSTS defaults
      expect(res.headers['strict-transport-security']).toBe(
        'max-age=31536000; includeSubDomains',
      );

      const csp = res.headers['content-security-policy'];
      expect(csp).toBeDefined();
      // CSP directives are ;-separated, so anchor to the boundary
      expect(csp).toMatch(/(^|;)\s*upgrade-insecure-requests(;|$)/);
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("img-src 'self' data: blob: https:");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("object-src 'none'");
    });
  });
});

import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from './config.interface';
import { validationSchema } from './config.schema';
import { CustomConfigService } from './config.service';

/**
 * Rate-limit configuration is opt-in: MAX_REQUESTS (requests per window) and
 * MAX_REQUESTS_TIME (window length in milliseconds) must be supplied together
 * as positive integers. A partial or malformed pair is a startup validation
 * error — it must never reach the throttler library, which would otherwise
 * emit `undefined`/`NaN` in the X-RateLimit-* response headers.
 */
describe('config validationSchema — rate limiting', () => {
  // NODE_ENV=test keeps unrelated conditional requirements (CLIENT_URL in
  // local, CLIENT_DIST_DIR/PICO_ANNOUNCE_SECRET in prod) out of the way so
  // each case asserts only about the rate-limit pair. Docs credentials are
  // optional in every environment and need no fixture here.
  const baseEnv = { NODE_ENV: 'test' };

  const validate = (env: Record<string, unknown>) =>
    validationSchema.validate({ ...baseEnv, ...env }, { allowUnknown: true });

  describe('absent pair (throttling off)', () => {
    it('validates with neither key present', () => {
      const { error, value } = validate({});
      expect(error).toBeUndefined();
      expect('MAX_REQUESTS' in value).toBe(false);
      expect('MAX_REQUESTS_TIME' in value).toBe(false);
    });
  });

  describe('valid pair (throttling on)', () => {
    it('accepts integers', () => {
      const { error, value } = validate({
        MAX_REQUESTS: 2,
        MAX_REQUESTS_TIME: 60000,
      });
      expect(error).toBeUndefined();
      expect(value.MAX_REQUESTS).toBe(2);
      expect(value.MAX_REQUESTS_TIME).toBe(60000);
    });

    it('coerces numeric strings to numbers (why the env must be set before boot)', () => {
      const { error, value } = validate({
        MAX_REQUESTS: '2',
        MAX_REQUESTS_TIME: '60000',
      });
      expect(error).toBeUndefined();
      expect(typeof value.MAX_REQUESTS).toBe('number');
      expect(typeof value.MAX_REQUESTS_TIME).toBe('number');
      expect(value.MAX_REQUESTS).toBe(2);
      expect(value.MAX_REQUESTS_TIME).toBe(60000);
    });

    it('accepts the minimum boundary of 1 for both keys', () => {
      const { error } = validate({ MAX_REQUESTS: 1, MAX_REQUESTS_TIME: 1 });
      expect(error).toBeUndefined();
    });
  });

  describe('partial pair (rejected)', () => {
    it('rejects MAX_REQUESTS without MAX_REQUESTS_TIME', () => {
      const { error } = validate({ MAX_REQUESTS: 10 });
      expect(error).toBeDefined();
      expect(error.message).toContain('MAX_REQUESTS_TIME');
    });

    it('rejects MAX_REQUESTS_TIME without MAX_REQUESTS', () => {
      const { error } = validate({ MAX_REQUESTS_TIME: 60000 });
      expect(error).toBeDefined();
      expect(error.message).toContain('MAX_REQUESTS');
    });
  });

  describe('malformed values (rejected)', () => {
    it.each([
      ['zero', 0, 0],
      ['negative', -1, -1],
      ['fractional', 2.5, 60000.5],
      ['non-numeric string', 'two', 'sixty seconds'],
      ['empty string', '', ''],
    ])('rejects a %s pair', (_label, limit, ttl) => {
      const { error } = validate({
        MAX_REQUESTS: limit,
        MAX_REQUESTS_TIME: ttl,
      });
      expect(error).toBeDefined();
    });

    it('rejects a valid limit paired with a malformed ttl', () => {
      const { error } = validate({ MAX_REQUESTS: 10, MAX_REQUESTS_TIME: 0 });
      expect(error).toBeDefined();
    });

    it('rejects a valid ttl paired with a malformed limit', () => {
      const { error } = validate({
        MAX_REQUESTS: 1.5,
        MAX_REQUESTS_TIME: 60000,
      });
      expect(error).toBeDefined();
    });
  });
});

/**
 * Swagger docs configuration. Docs credentials are OPTIONAL IN EVERY
 * ENVIRONMENT — permitted, never required. A non-empty username must pair
 * with a valid password; a partial pair (either half without the other)
 * fails at boot; an explicitly empty pair means "docs enabled,
 * unauthenticated".
 *
 * The whole block exists because of the Joi `.when()` definedness trap: a
 * condition like `is: Joi.string().not('')` short-circuits `undefined` and
 * therefore ALSO matches an ABSENT `DOCS_ENDPOINT` — which made a stock
 * `NODE_ENV=prod` boot demand `"DOCS_USERNAME" is required` even with the
 * docs endpoint disabled. The fix carries `.required()` on the `is` schema
 * so absence unambiguously selects the disabled branch. `Joi.exist()` is
 * NOT a valid substitute: it counts an empty string as present, and
 * emptiness must stay distinct from "enabled".
 */
describe('config validationSchema — Swagger docs configuration', () => {
  // A production fixture that also supplies the unrelated variables prod
  // requires, so every case below controls only the DOCS_* keys.
  const prodBase = {
    NODE_ENV: 'prod',
    CLIENT_DIST_DIR: '/usr/src/app/client',
    PICO_ANNOUNCE_SECRET: 'unit-test-secret',
  };

  const validate = (env: Record<string, unknown>) =>
    validationSchema.validate({ ...prodBase, ...env }, { allowUnknown: true });

  // Feed the validated map back through CustomConfigService exactly as
  // @nestjs/config does at runtime, to assert the derived `docs` flags.
  const docsFlags = (value: Record<string, unknown>) => {
    const fakeConfig = {
      get: (key: string) => value[key],
    } as unknown as ConfigService<EnvironmentVariables>;
    return new CustomConfigService(fakeConfig).docs;
  };

  describe('production boot without any docs configuration', () => {
    // The regression: this exact case failed with
    // `"DOCS_USERNAME" is required` before the `is`-definedness fix.
    it('validates when DOCS_ENDPOINT, DOCS_USERNAME and DOCS_PASSWORD are all absent', () => {
      const { error, value } = validate({});
      expect(error).toBeUndefined();
      expect('DOCS_ENDPOINT' in value).toBe(false);
      expect('DOCS_USERNAME' in value).toBe(false);
      expect('DOCS_PASSWORD' in value).toBe(false);
    });

    it('takes the DISABLED branch when DOCS_ENDPOINT is unset (credentials are not even type-checked)', () => {
      // 'admin' is rejected by the username rules of the ENABLED branch —
      // validating it with the endpoint unset proves the absent reference
      // selected `otherwise` instead of silently matching `not('')`.
      const { error } = validate({
        DOCS_USERNAME: 'admin',
        DOCS_PASSWORD: 'Sup3rSecret',
      });
      expect(error).toBeUndefined();
    });
  });

  describe('production docs endpoint enabled', () => {
    it('validates without credentials (docs enabled, unauthenticated)', () => {
      const { error, value } = validate({ DOCS_ENDPOINT: 'contract' });
      expect(error).toBeUndefined();
      const docs = docsFlags(value);
      expect(docs.makeDocs).toBe(true);
      expect(docs.useAuth).toBe(false);
    });

    it('validates with a valid credential pair and preserves both values', () => {
      const { error, value } = validate({
        DOCS_ENDPOINT: 'contract',
        DOCS_USERNAME: 'opsuser',
        DOCS_PASSWORD: 'Sup3rSecret',
      });
      expect(error).toBeUndefined();
      expect(value.DOCS_USERNAME).toBe('opsuser');
      expect(value.DOCS_PASSWORD).toBe('Sup3rSecret');
      expect(docsFlags(value).useAuth).toBe(true);
    });

    it('validates with both credentials explicitly empty (useAuth stays false)', () => {
      const { error, value } = validate({
        DOCS_ENDPOINT: 'contract',
        DOCS_USERNAME: '',
        DOCS_PASSWORD: '',
      });
      expect(error).toBeUndefined();
      expect(value.DOCS_USERNAME).toBe('');
      expect(value.DOCS_PASSWORD).toBe('');
      const docs = docsFlags(value);
      expect(docs.makeDocs).toBe(true);
      expect(docs.useAuth).toBe(false);
    });

    it('rejects a username supplied without a password', () => {
      const { error } = validate({
        DOCS_ENDPOINT: 'contract',
        DOCS_USERNAME: 'opsuser',
      });
      expect(error).toBeDefined();
      expect(error.message).toContain('DOCS_PASSWORD');
    });

    it('rejects a password supplied without a username', () => {
      const { error } = validate({
        DOCS_ENDPOINT: 'contract',
        DOCS_PASSWORD: 'Sup3rSecret',
      });
      expect(error).toBeDefined();
      expect(error.message).toContain('DOCS_PASSWORD');
    });

    it('rejects the banned usernames even with a valid password', () => {
      const { error } = validate({
        DOCS_ENDPOINT: 'contract',
        DOCS_USERNAME: 'admin',
        DOCS_PASSWORD: 'Sup3rSecret',
      });
      expect(error).toBeDefined();
      expect(error.message).toContain('DOCS_USERNAME');
    });
  });

  describe('non-production environments', () => {
    it('validates with docs disabled (dev, no DOCS_* keys)', () => {
      const { error } = validate({ NODE_ENV: 'dev' });
      expect(error).toBeUndefined();
    });

    it('validates with docs enabled AND credentials supplied (optional in every environment)', () => {
      // Previously failed: outside prod the schema forced DOCS_USERNAME to
      // '' (valid('')), rejecting any non-empty username. The amendment
      // removed that restriction entirely — one uniform policy everywhere.
      const { error, value } = validate({
        NODE_ENV: 'dev',
        DOCS_ENDPOINT: 'contract',
        DOCS_USERNAME: 'opsuser',
        DOCS_PASSWORD: 'Sup3rSecret',
      });
      expect(error).toBeUndefined();
      expect(value.DOCS_USERNAME).toBe('opsuser');
      expect(value.DOCS_PASSWORD).toBe('Sup3rSecret');
      expect(docsFlags(value).useAuth).toBe(true);
    });

    it('still enforces the username restrictions in non-prod when docs are enabled', () => {
      const { error } = validate({
        NODE_ENV: 'dev',
        DOCS_ENDPOINT: 'contract',
        DOCS_USERNAME: 'user',
        DOCS_PASSWORD: 'Sup3rSecret',
      });
      expect(error).toBeDefined();
      expect(error.message).toContain('DOCS_USERNAME');
    });

    it('validates the local default endpoint without credentials', () => {
      const { error, value } = validate({
        NODE_ENV: 'local',
        CLIENT_URL: 'http://localhost:5173',
      });
      expect(error).toBeUndefined();
      expect(value.DOCS_ENDPOINT).toBe('contract');
      expect(docsFlags(value).makeDocs).toBe(true);
      expect(docsFlags(value).useAuth).toBe(false);
    });
  });
});

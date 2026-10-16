import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from './config.interface';
import { validationSchema } from './config.schema';
import { CustomConfigService } from './config.service';

/**
 * `NODE_ENV=demo` marks an internet-exposed demonstration instance, so its
 * announce secret carries two rules: it must be set explicitly (the
 * development default does not apply) and it must not be the published
 * development value `mushpi-dev-secret` — that literal is public knowledge,
 * so a demo boot keeping it would leave `POST /v1/pico-units/announce` open
 * to anyone. `prod` keeps its original rule — presence of any value of six
 * or more characters, the public one included — and every other environment
 * keeps the default. `APP_SECRET` stays optional everywhere: a demo
 * deployment leaves it unset (setting it would 426 the dashboard).
 */
describe('config validationSchema — demo node environment', () => {
  // Exactly the options @nestjs/config uses when none are configured.
  const options = { allowUnknown: true, abortEarly: false };
  const validate = (env: Record<string, unknown>) =>
    validationSchema.validate(env, options);
  /**
   * A demo boot additionally requires the three always-on rate-limit pairs.
   * Supplied here so the announce-secret cases below control only about
   * PICO_ANNOUNCE_SECRET; the pairs themselves are exercised by the
   * 'demo rate limiting' block.
   */
  const demoLimits = {
    DEMO_VISITOR_MAX_REQUESTS: 100,
    DEMO_VISITOR_MAX_REQUESTS_TIME: 60000,
    DEMO_ABUSE_MAX_REQUESTS: 10,
    DEMO_ABUSE_MAX_REQUESTS_TIME: 60000,
    DEMO_GLOBAL_MAX_REQUESTS: 1000,
    DEMO_GLOBAL_MAX_REQUESTS_TIME: 60000,
  };
  const demo = (env: Record<string, unknown> = {}) =>
    validate({ NODE_ENV: 'demo', ...demoLimits, ...env });

  describe('PICO_ANNOUNCE_SECRET — set explicitly, never the public value', () => {
    it('rejects a demo boot that does not set PICO_ANNOUNCE_SECRET', () => {
      const { error } = demo();
      expect(error).toBeDefined();
      expect(error.message).toContain('PICO_ANNOUNCE_SECRET');
    });

    it('rejects the public development value of PICO_ANNOUNCE_SECRET on a demo boot', () => {
      const { error } = demo({ PICO_ANNOUNCE_SECRET: 'mushpi-dev-secret' });
      expect(error).toBeDefined();
      expect(error.message).toContain('PICO_ANNOUNCE_SECRET');
    });

    it('rejects a demo PICO_ANNOUNCE_SECRET shorter than six characters', () => {
      const { error } = demo({ PICO_ANNOUNCE_SECRET: 'x' });
      expect(error).toBeDefined();
      expect(error.message).toContain('PICO_ANNOUNCE_SECRET');
    });

    it('accepts a demo boot with a non-public PICO_ANNOUNCE_SECRET explicitly set', () => {
      const { error, value } = demo({
        PICO_ANNOUNCE_SECRET: 'unit-test-secret',
      });
      expect(error).toBeUndefined();
      expect(value.PICO_ANNOUNCE_SECRET).toBe('unit-test-secret');
    });

    it('accepts a non-public PICO_ANNOUNCE_SECRET of six or more characters on a demo boot', () => {
      for (const secret of ['abcdef', 'unit-test-secret']) {
        const { error, value } = demo({ PICO_ANNOUNCE_SECRET: secret });
        expect(error).toBeUndefined();
        expect(value.PICO_ANNOUNCE_SECRET).toBe(secret);
      }
    });
  });

  describe('APP_SECRET is not required in any environment', () => {
    it('does not require APP_SECRET on a demo boot', () => {
      const { error, value } = demo({
        PICO_ANNOUNCE_SECRET: 'unit-test-secret',
      });
      expect(error).toBeUndefined();
      expect('APP_SECRET' in value).toBe(false);
    });

    it('still permits an explicitly set APP_SECRET on a demo boot', () => {
      const { error, value } = demo({
        PICO_ANNOUNCE_SECRET: 'unit-test-secret',
        APP_SECRET: 'whatever-an-operator-picks',
      });
      expect(error).toBeUndefined();
      expect(value.APP_SECRET).toBe('whatever-an-operator-picks');
    });
  });

  describe('prod is unchanged — its rule is presence, not provenance', () => {
    // A prod fixture carrying the unrelated CLIENT_DIST_DIR requirement, so
    // the only thing under test is the announce secret.
    const prod = (env: Record<string, unknown> = {}) =>
      validate({
        NODE_ENV: 'prod',
        CLIENT_DIST_DIR: '/usr/src/app/client',
        ...env,
      });

    it('keeps the prod requirement: a prod boot without PICO_ANNOUNCE_SECRET fails', () => {
      const { error } = prod();
      expect(error).toBeDefined();
      expect(error.message).toContain('PICO_ANNOUNCE_SECRET');
    });

    it('accepts a prod boot with PICO_ANNOUNCE_SECRET', () => {
      const { error, value } = prod({
        PICO_ANNOUNCE_SECRET: 'unit-test-secret',
      });
      expect(error).toBeUndefined();
      expect(value.PICO_ANNOUNCE_SECRET).toBe('unit-test-secret');
    });

    it('still accepts the public development value of PICO_ANNOUNCE_SECRET in prod when explicitly set', () => {
      const { error, value } = prod({
        PICO_ANNOUNCE_SECRET: 'mushpi-dev-secret',
      });
      expect(error).toBeUndefined();
      expect(value.PICO_ANNOUNCE_SECRET).toBe('mushpi-dev-secret');
    });
  });

  describe('the development default applies only outside prod and demo', () => {
    it('leaves a boot without NODE_ENV not-demo and applies the development announce-secret default', () => {
      // Absent NODE_ENV resolves to the schema's `local` default, which
      // requires CLIENT_URL — an unrelated rule supplied here so the case
      // asserts only about the announce secret.
      const { error, value } = validate({
        CLIENT_URL: 'http://localhost:5173',
      });
      expect(error).toBeUndefined();
      expect(value.NODE_ENV).toBe('local');
      expect(value.NODE_ENV).not.toBe('demo');
      expect(value.PICO_ANNOUNCE_SECRET).toBe('mushpi-dev-secret');
    });

    it.each(['dev', 'local', 'staging', 'test'])(
      'applies the development announce-secret default in %s',
      (nodeEnv) => {
        const env: Record<string, unknown> = { NODE_ENV: nodeEnv };
        // local additionally requires CLIENT_URL (unrelated to the secret).
        if (nodeEnv === 'local') env.CLIENT_URL = 'http://localhost:5173';
        const { error, value } = validate(env);
        expect(error).toBeUndefined();
        expect(value.PICO_ANNOUNCE_SECRET).toBe('mushpi-dev-secret');
      },
    );
  });
});

/**
 * Rate-limit configuration is opt-in: MAX_REQUESTS (requests per window) and
 * MAX_REQUESTS_TIME (window length in milliseconds) must be supplied together
 * as positive integers. A partial or malformed pair is a startup validation
 * error — it must never reach the throttler library, which would otherwise
 * emit `undefined`/`NaN` in the X-RateLimit-* response headers.
 */
describe('config validationSchema — rate limiting', () => {
  // NODE_ENV=test keeps unrelated conditional requirements (CLIENT_URL in
  // local, CLIENT_DIST_DIR/PICO_ANNOUNCE_SECRET in prod and demo) out of
  // the way so each case asserts only about the rate-limit pair. Docs
  // credentials are optional in every environment and need no fixture here.
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
 * Demo rate-limit configuration is required-when-demo: a `demo` boot is
 * internet-exposed, so an unprotected demo is not an option — a missing
 * limit pair fails the boot loudly instead of serving a demo with no
 * throttling. The three pairs (visitor browse pace, abuse refused-change
 * pace, global backstop) each follow the same all-or-nothing `.and()` rule
 * as the historical MAX_REQUESTS pair. Outside `demo` the same keys are
 * merely optional (and ignored by the throttler factory — a self-hosted hub
 * gets no new limits, see the 'ignored outside demo' case).
 *
 * Every `.when('NODE_ENV', …)` condition's `is` schema carries
 * `.required()` — the definedness trap: a non-required `is` schema also
 * matches an ABSENT reference and would select the required branch on a
 * stock boot. The absent-NODE_ENV case below pins that no branch fires.
 */
describe('config validationSchema — demo rate limiting', () => {
  const options = { allowUnknown: true, abortEarly: false };
  const validate = (env: Record<string, unknown>) =>
    validationSchema.validate(env, options);

  const allLimits = {
    DEMO_VISITOR_MAX_REQUESTS: 100,
    DEMO_VISITOR_MAX_REQUESTS_TIME: 60000,
    DEMO_ABUSE_MAX_REQUESTS: 10,
    DEMO_ABUSE_MAX_REQUESTS_TIME: 60000,
    DEMO_GLOBAL_MAX_REQUESTS: 1000,
    DEMO_GLOBAL_MAX_REQUESTS_TIME: 60000,
  };
  // A demo boot with the announce secret supplied so every case below
  // controls only the rate-limit keys.
  const demo = (env: Record<string, unknown> = {}) =>
    validate({
      NODE_ENV: 'demo',
      PICO_ANNOUNCE_SECRET: 'unit-test-secret',
      ...env,
    });

  it('accepts a demo boot with every pair present and coerces numeric strings', () => {
    const { error, value } = demo({
      DEMO_VISITOR_MAX_REQUESTS: '100',
      DEMO_VISITOR_MAX_REQUESTS_TIME: '60000',
      DEMO_ABUSE_MAX_REQUESTS: '10',
      DEMO_ABUSE_MAX_REQUESTS_TIME: '60000',
      DEMO_GLOBAL_MAX_REQUESTS: '1000',
      DEMO_GLOBAL_MAX_REQUESTS_TIME: '60000',
    });
    expect(error).toBeUndefined();
    expect(typeof value.DEMO_VISITOR_MAX_REQUESTS).toBe('number');
    expect(value.DEMO_VISITOR_MAX_REQUESTS).toBe(100);
  });

  describe('required in demo — one failing case per pair', () => {
    const pairKeys: Array<[string, string]> = [
      ['DEMO_VISITOR_MAX_REQUESTS', 'DEMO_VISITOR_MAX_REQUESTS_TIME'],
      ['DEMO_ABUSE_MAX_REQUESTS', 'DEMO_ABUSE_MAX_REQUESTS_TIME'],
      ['DEMO_GLOBAL_MAX_REQUESTS', 'DEMO_GLOBAL_MAX_REQUESTS_TIME'],
    ];
    for (const [limit, ttl] of pairKeys) {
      it(`rejects a demo boot missing the ${limit} pair`, () => {
        const withoutPair = { ...allLimits };
        delete withoutPair[limit];
        delete withoutPair[ttl];
        const { error } = demo(withoutPair);
        expect(error).toBeDefined();
        expect(error.message).toContain(limit);
      });

      it(`rejects a partial ${limit} pair in demo (all-or-nothing)`, () => {
        const partial = { ...allLimits };
        delete partial[ttl];
        const { error } = demo(partial);
        expect(error).toBeDefined();
        expect(error.message).toContain(ttl);
      });

      it(`rejects a partial ${ttl} pair in demo (all-or-nothing)`, () => {
        const partial = { ...allLimits };
        delete partial[limit];
        const { error } = demo(partial);
        expect(error).toBeDefined();
        expect(error.message).toContain(limit);
      });
    }
  });

  describe('rejected demo values', () => {
    it.each([
      ['zero', 0, 0],
      ['negative', -1, -1],
      ['fractional', 2.5, 60000.5],
      ['non-numeric string', 'two', 'sixty seconds'],
      ['empty string', '', ''],
    ])('rejects a %s visitor pair in demo', (_label, limit, ttl) => {
      const { error } = demo({
        ...allLimits,
        DEMO_VISITOR_MAX_REQUESTS: limit,
        DEMO_VISITOR_MAX_REQUESTS_TIME: ttl,
      });
      expect(error).toBeDefined();
      expect(error.message).toContain('DEMO_VISITOR_MAX_REQUESTS');
    });

    it('rejects a valid limit paired with a malformed ttl in demo', () => {
      const { error } = demo({
        ...allLimits,
        DEMO_GLOBAL_MAX_REQUESTS: 10,
        DEMO_GLOBAL_MAX_REQUESTS_TIME: 0,
      });
      expect(error).toBeDefined();
      expect(error.message).toContain('DEMO_GLOBAL_MAX_REQUESTS_TIME');
    });
  });

  describe('optional elsewhere', () => {
    it('validates a non-demo boot with NO demo keys present', () => {
      const { error, value } = validate({ NODE_ENV: 'test' });
      expect(error).toBeUndefined();
      for (const key of Object.keys(allLimits)) {
        expect(key in value).toBe(false);
      }
    });

    it('still accepts (and keeps) demo keys on a non-demo boot — the values are ignored, not rejected', () => {
      const { error, value } = validate({ NODE_ENV: 'dev', ...allLimits });
      expect(error).toBeUndefined();
      expect(value.DEMO_VISITOR_MAX_REQUESTS).toBe(100);
    });

    it.each(['local', 'dev', 'staging', 'test', 'prod'])(
      'does not require the demo pairs in %s',
      (nodeEnv) => {
        const env: Record<string, unknown> = { NODE_ENV: nodeEnv };
        // Unrelated conditional requirements supplied so the cases assert
        // only about the demo pairs: local needs CLIENT_URL; prod additionally
        // needs CLIENT_DIST_DIR and PICO_ANNOUNCE_SECRET.
        if (nodeEnv === 'local') env.CLIENT_URL = 'http://localhost:5173';
        if (nodeEnv === 'prod') {
          env.CLIENT_DIST_DIR = '/usr/src/app/client';
          env.PICO_ANNOUNCE_SECRET = 'unit-test-secret';
        }
        const { error } = validate(env);
        expect(error).toBeUndefined();
      },
    );

    it('enforces the all-or-nothing rule for a partial demo pair outside demo as well', () => {
      const { error } = validate({
        NODE_ENV: 'test',
        DEMO_ABUSE_MAX_REQUESTS: 10,
      });
      expect(error).toBeDefined();
      expect(error.message).toContain('DEMO_ABUSE_MAX_REQUESTS_TIME');
    });
  });

  describe('absent NODE_ENV fires no required branch', () => {
    // The definedness trap, pinned for the demo pairs: without `.required()`
    // on the `is` schema an absent NODE_ENV would also match and demand all
    // six keys on a stock boot.
    it('validates a boot with no NODE_ENV and no demo keys', () => {
      const { error, value } = validate({
        CLIENT_URL: 'http://localhost:5173',
      });
      expect(error).toBeUndefined();
      expect(value.NODE_ENV).toBe('local');
      for (const key of Object.keys(allLimits)) {
        expect(key in value).toBe(false);
      }
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

/**
 * Unknown environment keys stay tolerated: `CustomConfigModule` passes no
 * `validationOptions`, so @nestjs/config validates with its defaults —
 * `allowUnknown: true`, `abortEarly: false`. Deployed env files can therefore
 * carry keys the schema no longer knows about. `APP_HOST` was deleted as a
 * variable with zero runtime consumers while `.env` files in the wild still
 * set it; this pins that such a leftover (URL-shaped, port and all) is
 * ignored rather than fatal, and that the schema no longer injects a default
 * for it.
 */
describe('config validationSchema — unknown keys stay tolerated', () => {
  // Exactly the options @nestjs/config uses when none are configured.
  const libraryDefaults = { allowUnknown: true, abortEarly: false };

  const leftoverEnv = {
    NODE_ENV: 'test',
    APP_HOST: 'http://picopi.local:8080',
  };

  it('accepts a leftover APP_HOST and does not inject the removed default', () => {
    const { error, value } = validationSchema.validate(
      leftoverEnv,
      libraryDefaults,
    );
    expect(error).toBeUndefined();
    // Unknown key passes through untouched — no Joi rules apply to it.
    expect(value.APP_HOST).toBe('http://picopi.local:8080');

    // With the key absent, the schema holds no APP_HOST default anymore.
    const clean = validationSchema.validate(
      { NODE_ENV: 'test' },
      libraryDefaults,
    );
    expect(clean.error).toBeUndefined();
    expect('APP_HOST' in clean.value).toBe(false);
  });

  it('fails without allowUnknown — the tolerance is the option, not a Joi default', () => {
    const { error } = validationSchema.validate(leftoverEnv, {
      abortEarly: false,
    });
    expect(error).toBeDefined();
    expect(error.message).toContain('APP_HOST');
  });
});

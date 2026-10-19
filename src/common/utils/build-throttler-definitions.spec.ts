import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerOptions } from '@nestjs/throttler';

import { READONLY_MARK } from 'src/common/constants/readonly.constants';
import { EnvironmentVariables } from 'src/modules/config/config.interface';
import { CustomConfigService } from 'src/modules/config/config.service';

import {
  buildThrottlerDefinitions,
  flatThrottlerKey,
} from './build-throttler-definitions';

/**
 * The throttler-definition factory: the demo boot's three always-on
 * definitions (browse pace, whole-instance backstop, refused-change pace)
 * built ONLY from deployment values, and the non-demo historical pair-or-
 * empty array verbatim. Config is fed as the validated-env map exactly as
 * @nestjs/config does at runtime (the `docsFlags` pattern in
 * `config.schema.spec.ts`).
 */
const DEMO_LIMIT_ENV = {
  NODE_ENV: 'demo',
  VISITOR_MAX_REQUESTS: 100,
  VISITOR_MAX_REQUESTS_TIME: 60000,
  ABUSE_MAX_REQUESTS: 10,
  ABUSE_MAX_REQUESTS_TIME: 60000,
  GLOBAL_MAX_REQUESTS: 1000,
  GLOBAL_MAX_REQUESTS_TIME: 60000,
};

const configWith = (env: Record<string, unknown>): CustomConfigService =>
  new CustomConfigService({
    get: (key: string) => env[key],
  } as unknown as ConfigService<EnvironmentVariables>);

const demoConfig = (overrides: Record<string, unknown> = {}) =>
  configWith({ ...DEMO_LIMIT_ENV, ...overrides });

const fakeContext = (handler: unknown, method: string): ExecutionContext =>
  ({
    getHandler: () => handler,
    getClass: () => class FakeController {},
    switchToHttp: () => ({ getRequest: () => ({ method }) }),
  }) as unknown as ExecutionContext;

describe('buildThrottlerDefinitions', () => {
  describe('demo boot — exactly three definitions', () => {
    const definitions: ThrottlerOptions[] =
      buildThrottlerDefinitions(demoConfig());

    it('returns the three demo definitions in declaration order', () => {
      expect(definitions).toHaveLength(3);
      // [visitor(default/unnamed), demo-global, demo-abuse]
      expect(definitions[0].name).toBeUndefined();
      expect(definitions[1].name).toBe('demo-global');
      expect(definitions[2].name).toBe('demo-abuse');
    });

    it('takes every value from the deployment env — never from defaults', () => {
      expect(definitions[0].ttl).toBe(60000);
      expect(definitions[0].limit).toBe(100);
      expect(definitions[1].ttl).toBe(60000);
      expect(definitions[1].limit).toBe(1000);
      expect(definitions[2].ttl).toBe(60000);
      expect(definitions[2].limit).toBe(10);
    });

    it('keys all three flat, and leaves the visitor tracker at the forwarded-identity default', () => {
      // Unnamed definition has no getTracker → the guard resolves the
      // library default (req.ip — the visitor's forwarded identity under
      // the demo's single-hop proxy trust).
      expect(definitions[0].getTracker).toBeUndefined();
      // The backstop collapses to a single instance-wide bucket.
      expect(definitions[1].getTracker).toBeDefined();
      expect(
        definitions[1].getTracker!(
          {},
          fakeContext(() => {}, 'GET'),
        ),
      ).toBe('global');
      for (const definition of definitions) {
        expect(definition.generateKey).toBe(flatThrottlerKey);
      }
    });

    it('enforces the abuse limiter only where the read-only guard refuses', () => {
      expect(definitions[0].skipIf).toBeUndefined();
      expect(definitions[1].skipIf).toBeUndefined();
      expect(definitions[2].skipIf).toBeDefined();
    });

    describe('fail loudly on malformed deployment values', () => {
      const badKeys = [
        'VISITOR_MAX_REQUESTS',
        'VISITOR_MAX_REQUESTS_TIME',
        'ABUSE_MAX_REQUESTS',
        'ABUSE_MAX_REQUESTS_TIME',
        'GLOBAL_MAX_REQUESTS',
        'GLOBAL_MAX_REQUESTS_TIME',
      ];

      for (const key of badKeys) {
        it.each([
          ['zero', 0],
          ['negative', -5],
          ['fractional', 2.5],
          // the live-`process.env` fall-through trap: an uncoerced string
          // never reached the library, and in demo must abort the boot
          ['string', '10'],
          ['undefined (pair missing)', undefined],
        ])('throws naming %s when the value is a %s', (_label, value) => {
          expect(() =>
            buildThrottlerDefinitions(demoConfig({ [key]: value })),
          ).toThrow(`A demo boot requires ${key}`);
        });
      }
    });
  });

  describe('flatThrottlerKey — flat across endpoints, distinct per bucket', () => {
    const handlerA = function list() {};
    const handlerB = function health() {};

    it('spans all endpoints: same tracker + throttler name ⇒ same key', () => {
      expect(
        flatThrottlerKey(fakeContext(handlerA, 'GET'), '10.0.0.1', 'default'),
      ).toBe(
        flatThrottlerKey(fakeContext(handlerB, 'GET'), '10.0.0.1', 'default'),
      );
      expect(
        flatThrottlerKey(fakeContext(handlerA, 'GET'), '10.0.0.1', 'default'),
      ).toBe('mushpi-demo-default-10.0.0.1');
    });

    it('keeps the three buckets distinct through name + tracker', () => {
      const visitor = flatThrottlerKey(
        fakeContext(handlerA, 'GET'),
        '10.0.0.1',
        'default',
      );
      const abuse = flatThrottlerKey(
        fakeContext(handlerA, 'POST'),
        '10.0.0.1',
        'demo-abuse',
      );
      const backstop = flatThrottlerKey(
        fakeContext(handlerA, 'GET'),
        'global',
        'demo-global',
      );
      expect(visitor).toBe('mushpi-demo-default-10.0.0.1');
      expect(abuse).toBe('mushpi-demo-demo-abuse-10.0.0.1');
      expect(backstop).toBe('mushpi-demo-demo-global-global');
      expect(new Set([visitor, abuse, backstop]).size).toBe(3);
    });
  });

  describe('abuse skipIf — one definition of "a refused change" with the guard', () => {
    const skipIf = buildThrottlerDefinitions(demoConfig())[2].skipIf!;

    it('skips plain browsing (safe method, unmarked)', () => {
      expect(skipIf(fakeContext(function list() {}, 'GET'))).toBe(true);
      expect(skipIf(fakeContext(function ping() {}, 'HEAD'))).toBe(true);
    });

    it('enforces on an unmarked non-safe method (the guard would refuse)', () => {
      expect(skipIf(fakeContext(function create() {}, 'POST'))).toBe(false);
      expect(skipIf(fakeContext(function remove() {}, 'DELETE'))).toBe(false);
    });

    it('skips an exempt-marked handler (announcement is never abuse-limited)', () => {
      const handler = function announce() {};
      Reflect.defineMetadata(READONLY_MARK, 'exempt', handler);
      expect(skipIf(fakeContext(handler, 'POST'))).toBe(true);
    });

    it('enforces a refused-marked safe-method handler (the guard would refuse)', () => {
      const handler = function ping() {};
      Reflect.defineMetadata(READONLY_MARK, 'refused', handler);
      expect(skipIf(fakeContext(handler, 'GET'))).toBe(false);
    });
  });

  describe('non-demo boot — historical behaviour, byte-for-byte', () => {
    it('applies no throttling when the opt-in pair is unset: empty definitions (no throttling, no headers)', () => {
      expect(
        buildThrottlerDefinitions(configWith({ NODE_ENV: 'local' })),
      ).toEqual([]);
    });

    it('returns the historical pair verbatim when configured', () => {
      expect(
        buildThrottlerDefinitions(
          configWith({
            NODE_ENV: 'test',
            MAX_REQUESTS: 2,
            MAX_REQUESTS_TIME: 60000,
          }),
        ),
      ).toEqual([{ ttl: 60000, limit: 2 }]);
    });

    it('treats an uncoerced string pair as unconfigured (historical defensive re-check, never throws)', () => {
      expect(
        buildThrottlerDefinitions(
          configWith({
            NODE_ENV: 'test',
            MAX_REQUESTS: '2',
            MAX_REQUESTS_TIME: '60000',
          }),
        ),
      ).toEqual([]);
    });

    it('still returns the historical shape when the demo limiter vars are present on a self-hosted hub', () => {
      // isDemo is checked FIRST: stray `VISITOR_*`/`ABUSE_*`/`GLOBAL_*` values
      // in an env file can never produce a demo definition — nor throw —
      // outside a demo boot.
      expect(
        buildThrottlerDefinitions(
          configWith({
            NODE_ENV: 'test',
            VISITOR_MAX_REQUESTS: 100,
            VISITOR_MAX_REQUESTS_TIME: 60000,
            ABUSE_MAX_REQUESTS: 10,
            ABUSE_MAX_REQUESTS_TIME: 60000,
            // deliberately malformed: must be ignored, never throw
            GLOBAL_MAX_REQUESTS: 0,
            GLOBAL_MAX_REQUESTS_TIME: 60000,
          }),
        ),
      ).toEqual([]);
    });
  });
});

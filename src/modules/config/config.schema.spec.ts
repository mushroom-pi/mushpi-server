import { validationSchema } from './config.schema';

/**
 * Rate-limit configuration is opt-in: MAX_REQUESTS (requests per window) and
 * MAX_REQUESTS_TIME (window length in milliseconds) must be supplied together
 * as positive integers. A partial or malformed pair is a startup validation
 * error — it must never reach the throttler library, which would otherwise
 * emit `undefined`/`NaN` in the X-RateLimit-* response headers.
 */
describe('config validationSchema — rate limiting', () => {
  // NODE_ENV=test keeps unrelated conditional requirements (CLIENT_URL in
  // local, CLIENT_DIST_DIR/DOCS_* in prod, PICO_ANNOUNCE_SECRET in prod) out
  // of the way so each case asserts only about the rate-limit pair.
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

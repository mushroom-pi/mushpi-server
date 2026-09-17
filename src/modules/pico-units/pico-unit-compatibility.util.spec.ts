import {
  getPicoApiCompatibility,
  isSupportedPicoApiVersion,
  isValidPicoFirmwareVersion,
} from './pico-unit-compatibility.util';
import {
  PICO_API_VERSION_MAX,
  PICO_API_VERSION_MIN,
} from './pico-units.constant';

describe('isValidPicoFirmwareVersion', () => {
  it.each(['0.8.4', '1.2.0', '0.1.0', '10.20.30', '0.0.0'])(
    'accepts strict SemVer %s',
    (value) => {
      expect(isValidPicoFirmwareVersion(value)).toBe(true);
    },
  );

  it.each([
    '0.8', // missing patch
    '0', // bare major
    'v0.8.4', // v-prefix
    '0.8.4-rc.1', // pre-release (forbidden by versioning.md §3.4)
    '0.8.4+build', // build metadata (forbidden)
    '0.8.4-rc.1+build.7', // both suffixes
    '0.8.4.', // trailing dot
    '.0.8.4', // leading dot
    '0.8.x', // non-numeric
    '0.8.4.5', // four segments
    '', // empty string
    ' 0.8.4', // leading whitespace
    '0.8.4 ', // trailing whitespace
  ])('rejects malformed version %p', (value) => {
    expect(isValidPicoFirmwareVersion(value)).toBe(false);
  });

  it('rejects non-string garbage without throwing', () => {
    for (const garbage of [
      null,
      undefined,
      123,
      1.5,
      NaN,
      true,
      false,
      {},
      [],
      ['0.8.4'],
      Symbol('x'),
      () => '0.8.4',
    ]) {
      expect(() => isValidPicoFirmwareVersion(garbage)).not.toThrow();
      expect(isValidPicoFirmwareVersion(garbage)).toBe(false);
    }
  });
});

describe('isSupportedPicoApiVersion', () => {
  it('accepts the bounds of the supported range (verdict-only, no validation role)', () => {
    expect(isSupportedPicoApiVersion(PICO_API_VERSION_MIN)).toBe(true);
    expect(isSupportedPicoApiVersion(PICO_API_VERSION_MAX)).toBe(true);
  });

  it('rejects values outside the supported range', () => {
    expect(isSupportedPicoApiVersion(PICO_API_VERSION_MAX + 1)).toBe(false);
    expect(isSupportedPicoApiVersion(PICO_API_VERSION_MAX + 99)).toBe(false);
    expect(isSupportedPicoApiVersion(PICO_API_VERSION_MIN - 1)).toBe(false);
    expect(isSupportedPicoApiVersion(-5)).toBe(false);
  });

  it('rejects non-integers and nullish values', () => {
    expect(isSupportedPicoApiVersion(1.5)).toBe(false);
    expect(isSupportedPicoApiVersion(NaN)).toBe(false);
    expect(isSupportedPicoApiVersion(Infinity)).toBe(false);
    expect(isSupportedPicoApiVersion(null)).toBe(false);
    expect(isSupportedPicoApiVersion(undefined)).toBe(false);
  });

  it('rejects non-number garbage without throwing', () => {
    for (const garbage of ['1', '', true, {}, [], () => 1]) {
      expect(() => isSupportedPicoApiVersion(garbage)).not.toThrow();
      expect(isSupportedPicoApiVersion(garbage)).toBe(false);
    }
  });
});

describe('getPicoApiCompatibility', () => {
  it('compatible: integer within [MIN, MAX] — regardless of contact evidence', () => {
    expect(getPicoApiCompatibility(PICO_API_VERSION_MIN, true)).toBe(
      'compatible',
    );
    expect(getPicoApiCompatibility(PICO_API_VERSION_MAX, false)).toBe(
      'compatible',
    );
  });

  it('incompatible: non-null integer outside the supported range — regardless of contact', () => {
    // Above MAX = a NEWER contract generation: accept-and-flag, never reject.
    expect(getPicoApiCompatibility(PICO_API_VERSION_MAX + 1, true)).toBe(
      'incompatible',
    );
    expect(getPicoApiCompatibility(PICO_API_VERSION_MAX + 1, false)).toBe(
      'incompatible',
    );
    expect(getPicoApiCompatibility(PICO_API_VERSION_MIN - 1, true)).toBe(
      'incompatible',
    );
  });

  it('incompatible: never reported BUT contact evidence (firmware predates the handshake)', () => {
    expect(getPicoApiCompatibility(null, true)).toBe('incompatible');
    expect(getPicoApiCompatibility(undefined, true)).toBe('incompatible');
  });

  it('unknown: never reported and no contact evidence (server has no basis to judge)', () => {
    expect(getPicoApiCompatibility(null, false)).toBe('unknown');
    expect(getPicoApiCompatibility(undefined, false)).toBe('unknown');
  });

  it('never throws on garbage input (total function)', () => {
    for (const garbage of [
      NaN,
      Infinity,
      1.5,
      -1,
      0,
      '1' as unknown as number,
      'abc' as unknown as number,
      {} as unknown as number,
      [] as unknown as number,
      true as unknown as number,
    ]) {
      for (const contact of [true, false]) {
        expect(() => getPicoApiCompatibility(garbage, contact)).not.toThrow();
        const verdict = getPicoApiCompatibility(garbage, contact);
        expect(['compatible', 'incompatible', 'unknown']).toContain(verdict);
        // A non-null garbage value is never "never reported" ⇒ never unknown.
        expect(verdict).not.toBe('unknown');
      }
    }
  });
});

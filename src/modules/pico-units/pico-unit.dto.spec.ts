import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AnnouncePicoUnitDto } from './pico-unit.dto';
import { PICO_API_VERSION_MAX } from './pico-units.constant';

/**
 * Validate a raw announce payload the way the global ValidationPipe does
 * (transform + implicit conversion), and return the failing property paths.
 */
async function announceErrors(payload: Record<string, unknown>) {
  const instance = plainToInstance(AnnouncePicoUnitDto, payload, {
    enableImplicitConversion: true,
  });
  const errors = await validate(instance, { whitelist: true });
  const failing = new Set<string>();
  for (const e of errors) {
    if (e.constraints) failing.add(e.property);
    for (const child of e.children ?? []) {
      if (child.constraints) failing.add(child.property);
    }
  }
  return failing;
}

const base = { handle: 'dto-spec', ip: '192.168.1.2' };

describe('AnnouncePicoUnitDto — firmware_version strict SemVer (announce is the STRICT path)', () => {
  it.each(['0.8.4', '0.1.0', '1.26.0'])(
    'accepts valid MAJOR.MINOR.PATCH %s',
    async (value) => {
      const failing = await announceErrors({
        ...base,
        firmware_version: value,
      });
      expect(failing.has('firmware_version')).toBe(false);
      expect(failing.size).toBe(0);
    },
  );

  it.each(['0.8', 'v0.8.4', '0.8.4-rc.1', '0.8.4+build', ''])(
    'rejects %p',
    async (value) => {
      const failing = await announceErrors({
        ...base,
        firmware_version: value,
      });
      expect(failing.has('firmware_version')).toBe(true);
    },
  );

  it('keeps firmware_version optional — omitting it (legacy firmware) still validates', async () => {
    const failing = await announceErrors(base);
    expect(failing.size).toBe(0);
  });

  it('rejects non-string firmware_version', async () => {
    const failing = await announceErrors({ ...base, firmware_version: 123 });
    expect(failing.has('firmware_version')).toBe(true);
  });
});

describe('AnnouncePicoUnitDto — api_version accept-and-flag (no @Max bound)', () => {
  it('accepts values ABOVE PICO_API_VERSION_MAX (newer contract generation: store + flag, never 422)', async () => {
    for (const value of [
      PICO_API_VERSION_MAX,
      PICO_API_VERSION_MAX + 1,
      PICO_API_VERSION_MAX + 99,
    ]) {
      const failing = await announceErrors({ ...base, api_version: value });
      expect(failing.has('api_version')).toBe(false);
    }
  });

  it('keeps @Min(1): api_version 0 (no API v0) is rejected', async () => {
    const failing = await announceErrors({ ...base, api_version: 0 });
    expect(failing.has('api_version')).toBe(true);
  });

  it('rejects non-integer api_version (with implicit conversion, "abc" → NaN)', async () => {
    const failing = await announceErrors({ ...base, api_version: 'abc' });
    expect(failing.has('api_version')).toBe(true);
  });

  it('keeps api_version optional — legacy firmware omitting it still announces', async () => {
    const failing = await announceErrors(base);
    expect(failing.size).toBe(0);
  });
});

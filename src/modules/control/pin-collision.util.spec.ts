import {
  DEVICE_PIN_KEYS,
  PinConflict,
  findSetupPinConflict,
  formatPinConflict,
  hasSetupPinChanges,
} from './pin-collision.util';

const EXISTING = { dht: 4, humidifier: 6, fan: 7, heater: 8 };

describe('DEVICE_PIN_KEYS', () => {
  it('is the fixed four-device order dht → humidifier → fan → heater', () => {
    expect(DEVICE_PIN_KEYS).toEqual(['dht', 'humidifier', 'fan', 'heater']);
  });
});

describe('hasSetupPinChanges', () => {
  it.each([
    ['dht', 4],
    ['humidifier', 6],
    ['fan', 7],
    ['heater', 0], // GP0 is a valid pin — zero counts
  ])('true when %s is an own numeric property', (key, value) => {
    expect(hasSetupPinChanges({ [key]: value })).toBe(true);
  });

  it('true when at least one of several pin keys is numeric', () => {
    expect(hasSetupPinChanges({ heater: 9, dht: undefined })).toBe(true);
  });

  it('false for undefined / null / non-object bodies', () => {
    expect(hasSetupPinChanges(undefined)).toBe(false);
    expect(hasSetupPinChanges(null)).toBe(false);
    expect(hasSetupPinChanges('pins')).toBe(false);
    expect(hasSetupPinChanges(42)).toBe(false);
    expect(hasSetupPinChanges([])).toBe(false);
  });

  it('false for an empty pins object', () => {
    expect(hasSetupPinChanges({})).toBe(false);
  });

  it('false when no pin key is present', () => {
    expect(hasSetupPinChanges({ active_high: true })).toBe(false);
  });

  it('false for non-numeric values under a pin key', () => {
    expect(hasSetupPinChanges({ dht: '4' })).toBe(false);
    expect(hasSetupPinChanges({ dht: null })).toBe(false);
    expect(hasSetupPinChanges({ heater: true })).toBe(false);
  });

  it('ignores keys that are not device pin keys', () => {
    expect(hasSetupPinChanges({ unknown: 5 })).toBe(false);
  });
});

describe('findSetupPinConflict — merged-view semantics', () => {
  it('reports a conflict when an incoming pin is already held by another device', () => {
    expect(findSetupPinConflict(EXISTING, { heater: 6 })).toEqual({
      pin: 6,
      holder: 'humidifier',
    });
  });

  it('names the non-requested device as the holder', () => {
    expect(findSetupPinConflict(EXISTING, { humidifier: 8 })).toEqual({
      pin: 8,
      holder: 'heater',
    });
  });

  it('holder is the first other key in fixed order when several share the pin', () => {
    // humidifier and fan both on 6 out-of-band; incoming heater 6 must blame
    // the earlier key in dht → humidifier → fan → heater order.
    const existing = { dht: 4, humidifier: 6, fan: 6, heater: 8 };
    expect(findSetupPinConflict(existing, { heater: 6 })).toEqual({
      pin: 6,
      holder: 'humidifier',
    });
  });

  it('same-device re-assignment is a no-op', () => {
    expect(findSetupPinConflict(EXISTING, { heater: 8 })).toBeNull();
  });

  it('moving to a free pin is allowed', () => {
    expect(findSetupPinConflict(EXISTING, { heater: 10 })).toBeNull();
  });

  it('moving onto a pin freed by another device in the same request is allowed', () => {
    // heater currently 8; this request moves fan onto 8 and heater onto 9.
    expect(findSetupPinConflict(EXISTING, { heater: 9, fan: 8 })).toBeNull();
  });

  it('unrelated change on a unit whose mapping is already duplicated out-of-band is allowed', () => {
    const duplicated = { dht: 4, humidifier: 6, fan: 6, heater: 8 };
    expect(findSetupPinConflict(duplicated, { heater: 10 })).toBeNull();
  });

  it('a change that perpetuates a pre-existing duplicate IS a conflict', () => {
    const duplicated = { dht: 4, humidifier: 6, fan: 6, heater: 8 };
    expect(findSetupPinConflict(duplicated, { humidifier: 6 })).toEqual({
      pin: 6,
      holder: 'fan',
    });
  });

  it('catches in-request duplicates even when dht is absent', () => {
    expect(findSetupPinConflict(EXISTING, { humidifier: 6, fan: 6 })).toEqual({
      pin: 6,
      holder: 'fan',
    });
  });

  it('blames the dht when another device moves onto its pin', () => {
    expect(findSetupPinConflict(EXISTING, { humidifier: 4 })).toEqual({
      pin: 4,
      holder: 'dht',
    });
  });

  it('unknown existing values (missing or non-numeric) are excluded from the merge', () => {
    // With no known holders, an incoming pin cannot collide with anything.
    expect(findSetupPinConflict({}, { heater: 6 })).toBeNull();
    expect(findSetupPinConflict({ heater: 'oops' }, { heater: 6 })).toBeNull();
    expect(findSetupPinConflict(null, { heater: 6 })).toBeNull();
    expect(findSetupPinConflict(undefined, { heater: 6 })).toBeNull();
  });

  it('non-numeric incoming values are excluded', () => {
    expect(findSetupPinConflict(EXISTING, { heater: '8' })).toBeNull();
  });

  it('never throws on garbage input (total function)', () => {
    for (const existing of [
      null,
      undefined,
      0,
      'x',
      [],
      { dht: {} },
      { heater: NaN },
    ]) {
      for (const incoming of [null, undefined, 0, 'x', [], { fan: {} }]) {
        const result: PinConflict | null = findSetupPinConflict(
          existing,
          incoming,
        );
        expect(result === null || typeof result.pin === 'number').toBe(true);
      }
    }
  });
});

describe('formatPinConflict', () => {
  it('renders the exact 422 message naming pin and holder', () => {
    expect(formatPinConflict({ pin: 6, holder: 'humidifier' })).toBe(
      'GPIO 6 is already assigned to the humidifier',
    );
  });

  it('uses the pin key name for every device', () => {
    expect(formatPinConflict({ pin: 22, holder: 'dht' })).toBe(
      'GPIO 22 is already assigned to the dht',
    );
    expect(formatPinConflict({ pin: 0, holder: 'fan' })).toBe(
      'GPIO 0 is already assigned to the fan',
    );
    expect(formatPinConflict({ pin: 8, holder: 'heater' })).toBe(
      'GPIO 8 is already assigned to the heater',
    );
  });
});

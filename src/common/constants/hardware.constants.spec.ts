import { VALID_USER_GPIO_PINS } from './hardware.constants';

/**
 * Allow-list content guard for the setup-proxy pin validation. Asserts the
 * LIST only — nothing here speaks for runtime GP0 behaviour or for the AP
 * force-provision switch.
 */
describe('VALID_USER_GPIO_PINS', () => {
  it('includes GP0 (valid general-purpose I/O on the Pico 2W)', () => {
    expect([...VALID_USER_GPIO_PINS]).toContain(0);
  });

  it.each([23, 24, 25, 29])(
    'excludes GP%i (permanently reserved for the CYW43439 WiFi/BT chip)',
    (pin) => {
      expect([...VALID_USER_GPIO_PINS]).not.toContain(pin);
    },
  );

  it('is exactly GP0–GP22 plus GP26–GP28 (26 user I/O pins)', () => {
    const expected = [
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      21, 22, 26, 27, 28,
    ];
    expect([...VALID_USER_GPIO_PINS]).toEqual(expected);
    expect(expected).toHaveLength(26);
  });
});

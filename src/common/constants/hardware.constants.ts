/**
 * Valid user-available GPIO pins on the Raspberry Pi Pico 2W.
 *
 * The RP2350 provides the range GP0–GP28 (29 pins), but GP23, GP24, GP25 and
 * GP29 are permanently reserved for the CYW43439 WiFi/BT chip and cannot be
 * used as general I/O — those pins are excluded from the list below.
 */
export const VALID_USER_GPIO_PINS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  22, 26, 27, 28,
] as const;

/** Standard TCP/IP port range. */
export const PORT_MIN = 1;
export const PORT_MAX = 65535;
export const PORT_DEFAULT = 5000;

/**
 * GPIO pin range for the Raspberry Pi Pico 2W (RP2350, 29 pins: GP0–GP28).
 *
 * Note: GP23, GP24, GP25, and GP29 are permanently reserved for the
 * CYW43439 WiFi/BT chip on the Pico 2W and cannot be used as general I/O.
 * See VALID_USER_GPIO_PINS below for the list of pins available to user code.
 */
export const GPIO_PIN_MIN = 0;
export const GPIO_PIN_MAX = 28;

/**
 * Valid user-available GPIO pins on the Raspberry Pi Pico 2W.
 * Excludes GP23, GP24, GP25 (WiFi chip) and GP29 (WiFi chip).
 */
export const VALID_USER_GPIO_PINS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  22, 26, 27, 28,
] as const;

/** Standard TCP/IP port range. */
export const PORT_MIN = 1;
export const PORT_MAX = 65535;
export const PORT_DEFAULT = 5000;

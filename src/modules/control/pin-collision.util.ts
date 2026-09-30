/**
 * Merged-view GPIO pin collision detection for the setup proxy.
 *
 * Pin mappings are not persisted server-side, so a partial
 * `PUT /v1/pico-units/:id/control/setup` cannot be checked against the
 * device's current assignment by the DTO alone. The control service fetches
 * the live mapping (`GET /setup`) and merges the partial body over it; this
 * util answers whether that merged view would leave two controls on one GPIO.
 *
 * The rules mirror the firmware-side merged-view check in
 * `mushpi-grow/app/api.py`:
 * - re-assigning a device to the pin it already has is a no-op (allowed);
 * - a pin freed by another device in the same request is free (allowed);
 * - pre-existing duplicates the request does not touch pass — only conflicts
 *   the request creates or perpetuates are reported;
 * - in-request duplicates are reported too.
 *
 * All functions are total: they never throw and accept any input (the device
 * response is untrusted), treating missing / non-numeric values as unknown.
 */

/** Device controls with a GPIO pin assignment, in fixed report order. */
export const DEVICE_PIN_KEYS = ['dht', 'humidifier', 'fan', 'heater'] as const;

export type DevicePinKey = (typeof DEVICE_PIN_KEYS)[number];

/** A pin the incoming request would place on a GPIO already held by another device. */
export interface PinConflict {
  pin: number;
  /** The device that would still hold the pin in the merged view. */
  holder: DevicePinKey;
}

/**
 * True iff `pins` has at least one own numeric property among the four device
 * pin keys — i.e. the body changes at least one pin and the service must
 * consult the device before forwarding. A body that only changes `active_high`
 * (or holds garbage where numbers were expected) skips the device round trip.
 */
export function hasSetupPinChanges(pins: unknown): boolean {
  if (!pins || typeof pins !== 'object') return false;
  const map = pins as Record<string, unknown>;
  return DEVICE_PIN_KEYS.some(
    (key) =>
      Object.prototype.hasOwnProperty.call(map, key) &&
      typeof map[key] === 'number',
  );
}

/** Keep only the four device pin keys with numeric values; everything else is unknown. */
function numericPinsOf(pins: unknown): Partial<Record<DevicePinKey, number>> {
  const numeric: Partial<Record<DevicePinKey, number>> = {};
  if (!pins || typeof pins !== 'object') return numeric;
  const map = pins as Record<string, unknown>;
  for (const key of DEVICE_PIN_KEYS) {
    if (typeof map[key] === 'number') numeric[key] = map[key] as number;
  }
  return numeric;
}

/**
 * Merged-view conflict: overlay `incomingPins` on `existingPins` (the live
 * `GET /setup` mapping, possibly missing keys — unknown values are excluded)
 * and check whether some incoming `(key, pin)` lands on a GPIO that the
 * merged view still assigns to a different device. The reported holder is
 * the first other key in fixed order (`dht → humidifier → fan → heater`)
 * whose merged value equals the incoming pin. Returns `null` when the merged
 * view is duplicate-free.
 */
export function findSetupPinConflict(
  existingPins: unknown,
  incomingPins: unknown,
): PinConflict | null {
  const existing = numericPinsOf(existingPins);
  const incoming = numericPinsOf(incomingPins);
  const merged = { ...existing, ...incoming };

  for (const key of DEVICE_PIN_KEYS) {
    const pin = incoming[key];
    if (pin === undefined) continue;
    for (const other of DEVICE_PIN_KEYS) {
      if (other === key) continue;
      if (merged[other] === pin) return { pin, holder: other };
    }
  }
  return null;
}

/** Human-readable 422 message naming the pin and the device holding it. */
export function formatPinConflict(conflict: PinConflict): string {
  return `GPIO ${conflict.pin} is already assigned to the ${conflict.holder}`;
}

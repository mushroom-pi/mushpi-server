import { SENSOR_RANGE } from 'src/modules/pico-units/pico-units.constant';

/**
 * Check whether a DHT11 reading falls within the plausible sensor range.
 *
 * Null / undefined values are treated as "no data" (not a range fault) —
 * Feature #9's empty-readings logic handles those separately.
 */
export function isReadingInRange(
  temp: number | null | undefined,
  hum: number | null | undefined,
): boolean {
  const tOk =
    temp == null ||
    (temp >= SENSOR_RANGE.temperature.min &&
      temp <= SENSOR_RANGE.temperature.max);
  const hOk =
    hum == null ||
    (hum >= SENSOR_RANGE.humidity.min && hum <= SENSOR_RANGE.humidity.max);
  return tOk && hOk;
}

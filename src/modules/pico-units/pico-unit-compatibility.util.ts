import { PicoApiCompatibility } from './pico-unit.type';
import {
  PICO_API_VERSION_MAX,
  PICO_API_VERSION_MIN,
  PICO_FIRMWARE_VERSION_REGEX,
} from './pico-units.constant';

/**
 * Strict SemVer (`MAJOR.MINOR.PATCH`) check for firmware-reported
 * `firmware_version` values (no pre-release/build suffixes —
 * `mushpi-docs/versioning.md` §3.4). Total: never throws, accepts any input.
 */
export function isValidPicoFirmwareVersion(value: unknown): boolean {
  return typeof value === 'string' && PICO_FIRMWARE_VERSION_REGEX.test(value);
}

/**
 * Whether a value is an integer contract generation the server currently
 * understands (`PICO_API_VERSION_MIN` .. `PICO_API_VERSION_MAX` inclusive).
 * VERDICT-ONLY predicate — never a validation bound (accept-and-flag: newer
 * generations are stored and flagged `incompatible`, not rejected).
 * Total: never throws, accepts any input.
 */
export function isSupportedPicoApiVersion(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= PICO_API_VERSION_MIN &&
    value <= PICO_API_VERSION_MAX
  );
}

/**
 * Compute the three-state Pico API compatibility verdict from the stored
 * `api_version` plus contact evidence (`last_seen != null`). Independent from
 * the health `status` computation. Resolution:
 *
 * | stored api_version            | contact | verdict        |
 * | ----------------------------- | ------- | -------------- |
 * | integer within [MIN, MAX]     | either  | `compatible`   |
 * | non-null value outside range  | either  | `incompatible` |
 * | null / never reported         | yes     | `incompatible` |
 * | null / never reported         | no      | `unknown`      |
 *
 * Contacted-but-never-reported means the firmware predates the version
 * handshake ⇒ needs an update. Without contact the server has no basis to
 * judge ⇒ `unknown`. Total: never throws on garbage input.
 */
export function getPicoApiCompatibility(
  apiVersion: number | null | undefined,
  hasContactEvidence: boolean,
): PicoApiCompatibility {
  if (apiVersion === null || apiVersion === undefined) {
    return hasContactEvidence ? 'incompatible' : 'unknown';
  }
  return isSupportedPicoApiVersion(apiVersion) ? 'compatible' : 'incompatible';
}

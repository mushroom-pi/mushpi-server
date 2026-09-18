import { RebootType } from './pico-unit.type';

const failsToUnhealthy = 3;
// A monitored unit is considered offline once failed_calls >= this threshold (3 consecutive unreachable cron polls).
export const OFFLINE_FAILED_CALLS_THRESHOLD = failsToUnhealthy;
export const reboot: RebootType[] = ['hard', 'soft'];

export const SENSOR_RANGE = {
  temperature: { min: 0, max: 50 },
  humidity: { min: 10, max: 90 },
} as const;

export const DANGER_TEMPERATURE_C = 40;

/** Minimum Pico REST API version a firmware can report. There is no API v0. */
export const PICO_API_VERSION_MIN = 1;

/**
 * Maximum Pico REST API version this server understands as compatible.
 * MUST track the current `api_version` generation in
 * `mushpi-grow/spec/openapi.yaml` — bump it only when the server gains
 * support for a newer Pico↔Server contract generation.
 *
 * ⚠️ VERDICT-ONLY: used exclusively by the computed `api_compatibility`
 * predicate — it is NEVER a request-validation bound. Out-of-range values
 * (a newer-contract unit) are accepted and stored, then flagged
 * `incompatible`; rejecting them would 422 the announce, lose the unit, and
 * break the IP-refresh fallback (accept-and-flag policy).
 */
export const PICO_API_VERSION_MAX = 1;

/**
 * Strict SemVer (`MAJOR.MINOR.PATCH`) for `firmware_version`. Pre-release and
 * build-metadata suffixes (`-rc`, `+build`) are forbidden by
 * `mushpi-docs/versioning.md` §3.4, so they must NOT be added here. No semver
 * library dependency — this regex is the canonical check (announce validation
 * + poll ingestion predicate).
 */
export const PICO_FIRMWARE_VERSION_REGEX = /^\d+\.\d+\.\d+$/;

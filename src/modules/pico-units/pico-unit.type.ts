export type RebootType = 'soft' | 'hard';

export const PICO_UNIT_STATUSES = [
  'unmonitored',
  'healthy',
  'degraded',
  'offline',
] as const;
export type PicoUnitStatus = (typeof PICO_UNIT_STATUSES)[number];

/**
 * Verdict of the computed (never stored) `api_compatibility` field judging
 * the Pico↔Server `api_version` contract generation ONLY — it is independent
 * from the health `status` (a unit can be `healthy` and `incompatible` at
 * once). Resolution table lives in REFERENCE.md.
 */
export const PICO_API_COMPATIBILITIES = [
  'compatible',
  'incompatible',
  'unknown',
] as const;
export type PicoApiCompatibility = (typeof PICO_API_COMPATIBILITIES)[number];

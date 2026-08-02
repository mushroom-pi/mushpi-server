export type RebootType = 'soft' | 'hard';

export const PICO_UNIT_STATUSES = [
  'unmonitored',
  'healthy',
  'degraded',
  'offline',
] as const;
export type PicoUnitStatus = (typeof PICO_UNIT_STATUSES)[number];

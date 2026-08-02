import { RebootType } from './pico-unit.type';

export const failsToUnhealthy = 3;
// A monitored unit is considered offline once failed_calls >= this threshold (3 consecutive unreachable cron polls).
export const OFFLINE_FAILED_CALLS_THRESHOLD = failsToUnhealthy;
export const reboot: RebootType[] = ['hard', 'soft'];

export const SENSOR_RANGE = {
  temperature: { min: 0, max: 50 },
  humidity: { min: 10, max: 90 },
} as const;

export const DANGER_TEMPERATURE_C = 40;

export const failsReadingsToUnhealthy = 5;

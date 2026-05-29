import { PicoUnit } from './pico-unit.entity';

export const PICO_UNIT_EVENTS = {
  REGISTERED: 'pico-unit.registered',
  ENABLED: 'pico-unit.enabled',
  DISABLED: 'pico-unit.disabled',
} as const;

export class PicoUnitRegisteredEvent {
  constructor(public readonly unit: PicoUnit) {}
}

export class PicoUnitEnabledEvent {
  constructor(public readonly unit: PicoUnit) {}
}

export class PicoUnitDisabledEvent {
  constructor(public readonly unit: PicoUnit) {}
}

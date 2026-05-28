import { PicoUnit } from './pico-unit.entity';

export const PICO_UNIT_EVENTS = {
  REGISTERED: 'pico-unit.registered',
} as const;

export class PicoUnitRegisteredEvent {
  constructor(public readonly unit: PicoUnit) {}
}

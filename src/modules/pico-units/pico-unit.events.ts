import { PicoUnit } from './pico-unit.entity';

export const PICO_UNIT_EVENTS = {
  CREATED: 'pico-unit.created',
  REGISTERED: 'pico-unit.registered',
  MONITORING_STARTED: 'pico-unit.monitoring_started',
  MONITORING_STOPPED: 'pico-unit.monitoring_stopped',
} as const;

export class PicoUnitCreatedEvent {
  constructor(public readonly unit: PicoUnit) {}
}

export class PicoUnitRegisteredEvent {
  constructor(public readonly unit: PicoUnit) {}
}

export class PicoUnitMonitoringStartedEvent {
  constructor(public readonly unit: PicoUnit) {}
}

export class PicoUnitMonitoringStoppedEvent {
  constructor(public readonly unit: PicoUnit) {}
}

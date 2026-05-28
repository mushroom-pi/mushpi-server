import { Batch } from './batches.entity';

export const BATCH_EVENTS = {
  STARTED: 'batch.started',
  FINISHED: 'batch.finished',
} as const;

export class BatchStartedEvent {
  constructor(public readonly batch: Batch) {}
}

export class BatchFinishedEvent {
  constructor(public readonly batch: Batch) {}
}

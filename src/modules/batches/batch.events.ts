import { Batch } from './batches.entity';

export const BATCH_EVENTS = {
  STARTED: 'batch.started',
} as const;

export class BatchStartedEvent {
  constructor(public readonly batch: Batch) {}
}

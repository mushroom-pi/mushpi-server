import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';

import { formatPollError } from 'src/common/utils/http-fallback';
import {
  BATCH_EVENTS,
  BatchFinishedEvent,
  BatchStartedEvent,
} from 'src/modules/batches/batch.events';
import { Batch } from 'src/modules/batches/batches.entity';
import { BatchesService } from 'src/modules/batches/batches.service';
import { ControlService } from 'src/modules/control/control.service';
import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';
import {
  PICO_UNIT_EVENTS,
  PicoUnitDisabledEvent,
  PicoUnitEnabledEvent,
  PicoUnitRegisteredEvent,
} from 'src/modules/pico-units/pico-unit.events';
import { ReadingsService } from 'src/modules/readings/readings.service';

@Injectable()
export class CronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CronService.name);
  private lastHandleBatchSyncAt: Date | null = null;

  constructor(
    private readonly readingsService: ReadingsService,
    private readonly batchesService: BatchesService,
    private readonly controlService: ControlService,
  ) {
    this.logger.log('cron!');
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleReadings() {
    await this.runReadingsSweep();
  }

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log(
      'Startup sweep — polling all enabled pico units immediately',
    );
    void this.runReadingsSweep().catch((error) => {
      this.logger.error(`Startup sweep failed: ${JSON.stringify(error)}`);
    });
  }

  private async runReadingsSweep(): Promise<void> {
    this.logger.log('Polling readings from pico units');
    await this.readingsService.pollReadingsFromAllEnabled();
    await this.handleBatchSync();
  }

  async handleBatchSync() {
    const now = new Date();
    const since =
      this.lastHandleBatchSyncAt ?? new Date(now.getTime() - 60_000);

    const activeBatches = await this.batchesService.findAllInProgress();
    for (const batch of activeBatches) {
      await this.applyBatchSettingsSafe(batch);
    }

    const finishedUnits =
      await this.batchesService.findUnitsWithFinishedBatch(since);
    for (const unit of finishedUnits) {
      await this.applyControlLoopDisableSafe(unit);
    }

    this.lastHandleBatchSyncAt = now;
  }

  @OnEvent(BATCH_EVENTS.STARTED)
  async handleBatchStarted({ batch }: BatchStartedEvent) {
    this.logger.log(
      `Batch ${batch.id} started — applying settings immediately to unit ${batch.pico_unit_id}`,
    );
    await this.applyBatchSettingsSafe(batch);
  }

  @OnEvent(BATCH_EVENTS.FINISHED)
  async handleBatchFinished({ batch }: BatchFinishedEvent) {
    this.logger.log(
      `Batch ${batch.id} finished — disabling control loop on unit ${batch.pico_unit_id}`,
    );
    await this.applyControlLoopDisableSafe(batch.pico_unit);
  }

  @OnEvent(PICO_UNIT_EVENTS.REGISTERED)
  async handlePicoUnitRegistered({ unit }: PicoUnitRegisteredEvent) {
    const batch = await this.batchesService.findInProgressForUnit(unit.id);
    if (!batch) return;
    this.logger.log(
      `Pico unit ${unit.id} registered — restoring active batch ${batch.id} settings`,
    );
    await this.applyBatchSettingsSafe(batch);
  }

  @OnEvent(PICO_UNIT_EVENTS.DISABLED)
  async handlePicoUnitDisabled({ unit }: PicoUnitDisabledEvent) {
    this.logger.log(
      `Pico unit ${unit.id} disabled — turning off control loop and all outputs`,
    );
    await this.applyUnitDisabledSafe(unit);
  }

  @OnEvent(PICO_UNIT_EVENTS.ENABLED)
  async handlePicoUnitEnabled({ unit }: PicoUnitEnabledEvent) {
    this.logger.log(`Pico unit ${unit.id} enabled — resuming readings`);
    try {
      await this.readingsService.pollReadingsFromUnit(unit);
    } catch (error) {
      this.logger.warn(formatPollError(unit, error));
    }
    const batch = await this.batchesService.findInProgressForUnit(unit.id);
    if (!batch) return;
    this.logger.log(
      `Pico unit ${unit.id} enabled — applying active batch ${batch.id} settings`,
    );
    await this.applyBatchSettingsSafe(batch);
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  cleanReadings() {
    this.logger.log('Cleaning readings table');
    this.readingsService.deleteOlderThanMonths();
  }

  private async applyBatchSettingsSafe(batch: Batch): Promise<void> {
    try {
      const changed = await this.controlService.applyBatchSettings(
        batch.pico_unit,
        batch,
      );
      if (changed) {
        this.logger.log(
          `Applied batch ${batch.id} settings to pico unit ${batch.pico_unit_id}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to apply batch ${batch.id} settings to pico unit ${batch.pico_unit_id}: ${JSON.stringify(error)}`,
      );
    }
  }

  private async applyUnitDisabledSafe(unit: PicoUnit): Promise<void> {
    try {
      const changed = await this.controlService.applyUnitDisabled(unit);
      if (changed) {
        this.logger.log(
          `Turned off control loop and outputs for disabled pico unit ${unit.id}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to turn off outputs for disabled pico unit ${unit.id}: ${JSON.stringify(error)}`,
      );
    }
  }

  private async applyControlLoopDisableSafe(unit: PicoUnit): Promise<void> {
    try {
      const changed = await this.controlService.applyControlLoopDisable(unit);
      if (changed) {
        this.logger.log(
          `Disabled control loop on pico unit ${unit.id} (batch finished)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to disable control loop on pico unit ${unit.id}: ${JSON.stringify(error)}`,
      );
    }
  }
}

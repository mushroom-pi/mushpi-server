import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { BatchesService } from 'src/modules/batches/batches.service';
import { ControlService } from 'src/modules/control/control.service';
import { ReadingsService } from 'src/modules/readings/readings.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly readingsService: ReadingsService,
    private readonly batchesService: BatchesService,
    private readonly controlService: ControlService,
  ) {
    this.logger.log('cron!');
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleReadings() {
    this.logger.log('Polling readings from pico units');
    await this.readingsService.pollReadingsFromAllEnabled();
    await this.handleBatchSync();
  }

  async handleBatchSync() {
    const activeBatches = await this.batchesService.findAllInProgress();
    for (const batch of activeBatches) {
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

    const finishedUnits =
      await this.batchesService.findUnitsWithFinishedBatch();
    for (const unit of finishedUnits) {
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

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  cleanReadings() {
    this.logger.log('Cleaning readings table');
    this.readingsService.deleteOlderThanMonths();
  }
}

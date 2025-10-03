import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { ReadingsService } from 'src/modules/readings/readings.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(private readonly readingsService: ReadingsService) {
    this.logger.log('cron!');
  }

  @Cron(CronExpression.EVERY_MINUTE)
  handleReadings() {
    this.logger.log('Polling readings from pico units');
    this.readingsService.pollReadingsFromAllEnabled();
  }
}

import { Module } from '@nestjs/common';

import { BatchesModule } from 'src/modules/batches/batches.module';
import { ControlModule } from 'src/modules/control/control.module';
import { ReadingsModule } from 'src/modules/readings/readings.module';

import { CronService } from './cron.service';

@Module({
  imports: [BatchesModule, ControlModule, ReadingsModule],
  providers: [CronService],
})
export class CronModule {}

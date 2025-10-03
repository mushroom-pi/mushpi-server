import { Module } from '@nestjs/common';

import { ReadingsModule } from 'src/modules/readings/readings.module';

import { CronService } from './cron.service';

@Module({
  imports: [ReadingsModule],
  providers: [CronService],
})
export class CronModule {}

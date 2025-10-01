import { Module } from '@nestjs/common';

import { SQLiteHealthModule } from 'src/modules/sqlite-health/sqlite-health.module';

import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [SQLiteHealthModule],
  controllers: [MonitoringController],
  providers: [MonitoringService],
})
export class MonitoringModule {}

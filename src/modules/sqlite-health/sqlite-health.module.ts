import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Health } from './sqlite-health.entity';
import { SQLiteHealthService } from './sqlite-health.service';

@Module({
  imports: [TypeOrmModule.forFeature([Health])],
  providers: [SQLiteHealthService],
  exports: [SQLiteHealthService],
})
export class SQLiteHealthModule {}

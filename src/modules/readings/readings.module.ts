import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BatchesModule } from 'src/modules/batches/batches.module';
import { PicoUnitsModule } from 'src/modules/pico-units/pico-units.module';

import { BatchIdReadingsController } from './controllers/batch-id-readings.controller';
import { PicoUnitIdReadingsController } from './controllers/pico-unit-id-readings.controller';
import { Readings } from './readings.entity';
import { ReadingsService } from './readings.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Readings]),
    PicoUnitsModule,
    BatchesModule,
  ],
  providers: [ReadingsService],
  controllers: [PicoUnitIdReadingsController, BatchIdReadingsController],
  exports: [ReadingsService],
})
export class ReadingsModule {}

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BatchesModule } from 'src/modules/batches/batches.module';
import { PicoUnitsModule } from 'src/modules/pico-units/pico-units.module';

import { BatchIdReadingsV1Controller } from './controllers/batch-id-readings.v1.controller';
import { PicoUnitIdReadingsV1Controller } from './controllers/pico-unit-id-readings.v1.controller';
import { Readings } from './readings.entity';
import { ReadingsService } from './readings.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Readings]),
    forwardRef(() => PicoUnitsModule),
    forwardRef(() => BatchesModule),
  ],
  providers: [ReadingsService],
  controllers: [PicoUnitIdReadingsV1Controller, BatchIdReadingsV1Controller],
  exports: [ReadingsService],
})
export class ReadingsModule {}

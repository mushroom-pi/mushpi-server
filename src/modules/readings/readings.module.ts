import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PicoUnitsModule } from 'src/modules/pico-units/pico-units.module';

import { PicoUnitIdReadingsController } from './controllers/pico-unit-id-readings.controller';
import { Readings } from './readings.entity';
import { ReadingsService } from './readings.service';

@Module({
  imports: [TypeOrmModule.forFeature([Readings]), PicoUnitsModule],
  providers: [ReadingsService],
  controllers: [PicoUnitIdReadingsController],
  exports: [ReadingsService],
})
export class ReadingsModule {}

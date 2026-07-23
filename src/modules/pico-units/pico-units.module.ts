import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ReadingsModule } from 'src/modules/readings/readings.module';

import { PicoUnitIdV1Controller } from './controllers/pico-unit-id.v1.controller';
import { PicoUnitsV1Controller } from './controllers/pico-units.v1.controller';
import { PicoUnit } from './pico-unit.entity';
import { PicoUnitsService } from './pico-units.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PicoUnit]),
    forwardRef(() => ReadingsModule),
  ],
  providers: [PicoUnitsService],
  exports: [PicoUnitsService, TypeOrmModule.forFeature([PicoUnit])],
  controllers: [PicoUnitsV1Controller, PicoUnitIdV1Controller],
})
export class PicoUnitsModule {}

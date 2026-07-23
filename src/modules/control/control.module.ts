import { Module } from '@nestjs/common';

import { PicoUnitsModule } from 'src/modules/pico-units/pico-units.module';
import { ReadingsModule } from 'src/modules/readings/readings.module';

import { ControlService } from './control.service';
import { PicoUnitIdControlV1Controller } from './pico-unit-id-control.v1.controller';

@Module({
  imports: [ReadingsModule, PicoUnitsModule],
  providers: [ControlService],
  controllers: [PicoUnitIdControlV1Controller],
  exports: [ControlService],
})
export class ControlModule {}

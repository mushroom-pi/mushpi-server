import { Module } from '@nestjs/common';

import { PicoUnitsModule } from 'src/modules/pico-units/pico-units.module';
import { ReadingsModule } from 'src/modules/readings/readings.module';

import { ControlService } from './control.service';
import { PicoUnitIdControlController } from './pico-unit-id-control.controller';

@Module({
  imports: [ReadingsModule, PicoUnitsModule],
  providers: [ControlService],
  controllers: [PicoUnitIdControlController],
  exports: [ControlService],
})
export class ControlModule {}

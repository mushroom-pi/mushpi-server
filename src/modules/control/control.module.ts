import { Module } from '@nestjs/common';

import { ReadingsModule } from 'src/modules/readings/readings.module';

import { ControlService } from './control.service';
import { PicoUnitIdControlController } from './pico-unit-id-control.controller';

@Module({
  imports: [ReadingsModule],
  providers: [ControlService],
  controllers: [PicoUnitIdControlController],
  exports: [ControlService],
})
export class ControlModule {}

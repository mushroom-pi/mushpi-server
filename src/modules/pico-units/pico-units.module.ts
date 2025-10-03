import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PicoUnitIdController } from './controllers/pico-unit-id.controller';
import { PicoUnitsController } from './controllers/pico-units.controller';
import { PicoUnit } from './pico-unit.entity';
import { PicoUnitsService } from './pico-units.service';

@Module({
  imports: [TypeOrmModule.forFeature([PicoUnit])],
  providers: [PicoUnitsService],
  exports: [PicoUnitsService, TypeOrmModule.forFeature([PicoUnit])],
  controllers: [PicoUnitsController, PicoUnitIdController],
})
export class PicoUnitsModule {}

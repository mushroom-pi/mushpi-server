import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ReadingsModule } from 'src/modules/readings/readings.module';

import { PicoUnitIdController } from './controllers/pico-unit-id.controller';
import { PicoUnitsController } from './controllers/pico-units.controller';
import { PicoUnit } from './pico-unit.entity';
import { PicoUnitsService } from './pico-units.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PicoUnit]),
    forwardRef(() => ReadingsModule),
  ],
  providers: [PicoUnitsService],
  exports: [PicoUnitsService, TypeOrmModule.forFeature([PicoUnit])],
  controllers: [PicoUnitsController, PicoUnitIdController],
})
export class PicoUnitsModule {}

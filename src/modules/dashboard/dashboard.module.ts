import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Batch } from 'src/modules/batches/batches.entity';
import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';
import { Readings } from 'src/modules/readings/readings.entity';
import { Recipe } from 'src/modules/recipes/recipes.entity';

import { DashboardService } from './dashboard.service';
import { DashboardV1Controller } from './dashboard.v1.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PicoUnit, Batch, Recipe, Readings])],
  providers: [DashboardService],
  controllers: [DashboardV1Controller],
})
export class DashboardModule {}

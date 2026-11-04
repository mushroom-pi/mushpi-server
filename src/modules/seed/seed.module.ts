import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Batch } from 'src/modules/batches/batches.entity';
import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';
import { Readings } from 'src/modules/readings/readings.entity';
import { Recipe } from 'src/modules/recipes/recipes.entity';

import { SeedService } from './seed.service';

/**
 * Server-owned demo seeding (insert-only, config-gated). Registers no
 * controllers — the seeder runs once at bootstrap and never touches the
 * request path.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Recipe, PicoUnit, Batch, Readings])],
  providers: [SeedService],
})
export class SeedModule {}

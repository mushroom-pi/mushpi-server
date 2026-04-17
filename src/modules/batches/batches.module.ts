import {
  MiddlewareConsumer,
  Module,
  RequestMethod,
  forwardRef,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BatchByIdMiddleware } from 'src/common/middleware/batch-by-id.middleware';
import { PicoUnitsModule } from 'src/modules/pico-units/pico-units.module';
import { RecipesModule } from 'src/modules/recipes/recipes.module';

import { Batch } from './batches.entity';
import { BatchesService } from './batches.service';
import { BatchIdRecipeController } from './controllers/batch-id-recipe.controller';
import { BatchIdController } from './controllers/batch-id.controller';
import { BatchesController } from './controllers/batches.controller';
import { PicoUnitIdBatchesController } from './controllers/pico-unit-id-batches.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Batch]),
    PicoUnitsModule,
    forwardRef(() => RecipesModule),
  ],
  providers: [BatchesService],
  exports: [BatchesService, TypeOrmModule.forFeature([Batch])],
  controllers: [
    BatchesController,
    BatchIdController,
    BatchIdRecipeController,
    PicoUnitIdBatchesController,
  ],
})
export class BatchesModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(BatchByIdMiddleware).forRoutes({
      path: 'batches/:batchId',
      method: RequestMethod.ALL,
    });
    consumer.apply(BatchByIdMiddleware).forRoutes({
      path: 'batches/:batchId/*path',
      method: RequestMethod.ALL,
    });
  }
}

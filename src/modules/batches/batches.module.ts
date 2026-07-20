import {
  MiddlewareConsumer,
  Module,
  NestModule,
  OnModuleInit,
  RequestMethod,
  forwardRef,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import * as fs from 'fs';
import * as path from 'path';

import { BatchByIdMiddleware } from 'src/common/middleware/batch-by-id.middleware';
import { CustomConfigService } from 'src/modules/config/config.service';
import { PicoUnitsModule } from 'src/modules/pico-units/pico-units.module';
import { RecipesModule } from 'src/modules/recipes/recipes.module';

import { Batch } from './batches.entity';
import { BatchesService } from './batches.service';
import { BatchIdImagesController } from './controllers/batch-id-images.controller';
import { BatchIdRecipeController } from './controllers/batch-id-recipe.controller';
import { BatchIdController } from './controllers/batch-id.controller';
import { BatchesController } from './controllers/batches.controller';
import { PicoUnitIdBatchesController } from './controllers/pico-unit-id-batches.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Batch]),
    forwardRef(() => PicoUnitsModule),
    forwardRef(() => RecipesModule),
  ],
  providers: [BatchesService],
  exports: [BatchesService, TypeOrmModule.forFeature([Batch])],
  controllers: [
    BatchesController,
    BatchIdController,
    BatchIdImagesController,
    BatchIdRecipeController,
    PicoUnitIdBatchesController,
  ],
})
export class BatchesModule implements NestModule, OnModuleInit {
  constructor(private readonly configService: CustomConfigService) {}

  onModuleInit() {
    const batchImageDir = path.join(
      this.configService.upload.imageDir,
      'batches',
    );
    fs.mkdirSync(batchImageDir, { recursive: true });
  }

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

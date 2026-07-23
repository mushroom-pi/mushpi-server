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
import { BatchIdImagesV1Controller } from './controllers/batch-id-images.v1.controller';
import { BatchIdRecipeV1Controller } from './controllers/batch-id-recipe.v1.controller';
import { BatchIdV1Controller } from './controllers/batch-id.v1.controller';
import { BatchesV1Controller } from './controllers/batches.v1.controller';
import { PicoUnitIdBatchesV1Controller } from './controllers/pico-unit-id-batches.v1.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Batch]),
    forwardRef(() => PicoUnitsModule),
    forwardRef(() => RecipesModule),
  ],
  providers: [BatchesService],
  exports: [BatchesService, TypeOrmModule.forFeature([Batch])],
  controllers: [
    BatchesV1Controller,
    BatchIdV1Controller,
    BatchIdImagesV1Controller,
    BatchIdRecipeV1Controller,
    PicoUnitIdBatchesV1Controller,
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
      path: 'v1/batches/:batchId',
      method: RequestMethod.ALL,
    });
    consumer.apply(BatchByIdMiddleware).forRoutes({
      path: 'v1/batches/:batchId/*path',
      method: RequestMethod.ALL,
    });
  }
}

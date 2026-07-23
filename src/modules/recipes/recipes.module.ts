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

import { BatchesModule } from 'src/modules/batches/batches.module';
import { CustomConfigService } from 'src/modules/config/config.service';

import { RecipeIdBatchesV1Controller } from './controllers/recipe-id-batches.v1.controller';
import { RecipeIdImageV1Controller } from './controllers/recipe-id-image.v1.controller';
import { RecipeIdV1Controller } from './controllers/recipe-id.v1.controller';
import { RecipesV1Controller } from './controllers/recipes.v1.controller';
import { RecipeByIdMiddleware } from './recipe-by-id.middleware';
import { Recipe } from './recipes.entity';
import { RecipesService } from './recipes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Recipe]),
    forwardRef(() => BatchesModule),
  ],
  controllers: [
    RecipesV1Controller,
    RecipeIdV1Controller,
    RecipeIdBatchesV1Controller,
    RecipeIdImageV1Controller,
  ],
  providers: [RecipesService],
  exports: [RecipesService, TypeOrmModule.forFeature([Recipe])],
})
export class RecipesModule implements NestModule, OnModuleInit {
  constructor(private readonly configService: CustomConfigService) {}

  onModuleInit() {
    const recipeImageDir = path.join(
      this.configService.upload.imageDir,
      'recipes',
    );
    fs.mkdirSync(recipeImageDir, { recursive: true });
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RecipeByIdMiddleware).forRoutes({
      path: 'v1/recipes/:recipeId',
      method: RequestMethod.ALL,
    });
    consumer.apply(RecipeByIdMiddleware).forRoutes({
      path: 'v1/recipes/:recipeId/*path',
      method: RequestMethod.ALL,
    });
  }
}

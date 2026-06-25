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

import { RecipeIdBatchesController } from './controllers/recipe-id-batches.controller';
import { RecipeIdImageController } from './controllers/recipe-id-image.controller';
import { RecipeIdController } from './controllers/recipe-id.controller';
import { RecipesController } from './controllers/recipes.controller';
import { RecipeByIdMiddleware } from './recipe-by-id.middleware';
import { Recipe } from './recipes.entity';
import { RecipesService } from './recipes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Recipe]),
    forwardRef(() => BatchesModule),
  ],
  controllers: [
    RecipesController,
    RecipeIdController,
    RecipeIdBatchesController,
    RecipeIdImageController,
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
      path: 'recipes/:recipeId',
      method: RequestMethod.ALL,
    });
    consumer.apply(RecipeByIdMiddleware).forRoutes({
      path: 'recipes/:recipeId/*path',
      method: RequestMethod.ALL,
    });
  }
}

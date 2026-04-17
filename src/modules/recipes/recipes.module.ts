import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
  forwardRef,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BatchesModule } from 'src/modules/batches/batches.module';

import { RecipeIdBatchesController } from './controllers/recipe-id-batches.controller';
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
  ],
  providers: [RecipesService],
  exports: [RecipesService, TypeOrmModule.forFeature([Recipe])],
})
export class RecipesModule implements NestModule {
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

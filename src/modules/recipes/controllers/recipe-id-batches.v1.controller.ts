import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiRecipe } from 'src/common/decorators/docs/api-recipe.decorator';
import { GetRecipe } from 'src/common/decorators/get-recipe.decorator';
import {
  BatchListResponseDto,
  ListPicoUnitBatchesQueryDto,
} from 'src/modules/batches/batches.dto';
import { BatchesService } from 'src/modules/batches/batches.service';

import { Recipe } from '../recipes.entity';

@ApiTags('recipes', 'batches')
@Controller('recipes/:recipeId/batches')
@ApiRecipe()
export class RecipeIdBatchesV1Controller {
  constructor(private readonly batchesSvc: BatchesService) {}

  @Get()
  @ApiOperation({ summary: 'Get batches created with a specific recipe' })
  @ApiOkResponse({
    description: 'List with pagination',
    type: BatchListResponseDto,
  })
  list(
    @GetRecipe() recipe: Recipe,
    @Query() query: ListPicoUnitBatchesQueryDto,
  ) {
    return this.batchesSvc.listForRecipeId(recipe.id, query);
  }
}

import { Body, Controller, Delete, Get, Param, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiRecipe } from 'src/common/decorators/docs/api-recipe.decorator';
import { ApiEmptyOkResponse } from 'src/common/decorators/docs/empty-ok-response.decorator';
import { GetRecipe } from 'src/common/decorators/get-recipe.decorator';

import { UpdateRecipeDto } from '../recipes.dto';
import { Recipe } from '../recipes.entity';
import { RecipesService } from '../recipes.service';

@ApiTags('recipes')
@Controller('recipes/:recipeId')
@ApiRecipe()
export class RecipeIdController {
  constructor(private readonly svc: RecipesService) {}

  @Get()
  @ApiOperation({ summary: 'Get a recipe by id' })
  @ApiOkResponse({ type: Recipe })
  getOne(@GetRecipe() recipe: Recipe) {
    return recipe;
  }

  @Patch()
  @ApiOperation({ summary: 'Update a recipe' })
  @ApiOkResponse({ type: Recipe })
  update(@GetRecipe() recipe: Recipe, @Body() dto: UpdateRecipeDto) {
    return this.svc.update(recipe, dto);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete a recipe' })
  @ApiEmptyOkResponse({ description: 'Deleted' })
  remove(@Param('recipeId') id: string) {
    this.svc.remove(Number(id));
  }
}

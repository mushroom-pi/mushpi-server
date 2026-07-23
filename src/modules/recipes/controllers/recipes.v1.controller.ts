import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotAcceptableResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ErrorDto } from 'src/common/dto/error.dto';

import {
  CreateRecipeDto,
  ListRecipesQueryDto,
  RecipeListResponseDto,
} from '../recipes.dto';
import { Recipe } from '../recipes.entity';
import { RecipesService } from '../recipes.service';

@ApiTags('recipes')
@Controller('recipes')
@ApiNotAcceptableResponse({
  description: 'Database-related error',
  type: ErrorDto,
})
export class RecipesV1Controller {
  constructor(private readonly svc: RecipesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new recipe',
    description: 'Register a reusable growing template',
  })
  @ApiCreatedResponse({
    description: 'Recipe created',
    type: Recipe,
  })
  @ApiNotFoundResponse({
    description: 'Conflict — a recipe with that name already exists',
    type: ErrorDto,
  })
  create(@Body() dto: CreateRecipeDto) {
    return this.svc.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List recipes (paginated)',
    description: 'Retrieve all stored recipes with optional species filter',
  })
  @ApiOkResponse({
    description: 'List with pagination',
    type: RecipeListResponseDto,
  })
  list(@Query() query: ListRecipesQueryDto) {
    return this.svc.findAll(query);
  }
}

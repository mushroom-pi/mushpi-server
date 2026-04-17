import { applyDecorators } from '@nestjs/common';
import {
  ApiNotAcceptableResponse,
  ApiNotFoundResponse,
  ApiParam,
} from '@nestjs/swagger';

import { ErrorDto } from 'src/common/dto/error.dto';

export function ApiRecipe() {
  return applyDecorators(
    ApiParam({
      name: 'recipeId',
      required: true,
      description: 'Recipe ID',
      schema: { type: 'integer', minimum: 1, example: 1 },
    }),
    ApiNotFoundResponse({
      description: 'Recipe not found',
      type: ErrorDto,
    }),
    ApiNotAcceptableResponse({
      description: 'Database-related error',
      type: ErrorDto,
    }),
  );
}

import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotAcceptableResponse,
  ApiNotFoundResponse,
  ApiParam,
} from '@nestjs/swagger';

import { ErrorDto } from 'src/common/dto/error.dto';

export function ApiPicoUnit() {
  return applyDecorators(
    ApiParam({
      name: 'picoUnitId',
      required: true,
      description: 'Pico unit ID',
      schema: { type: 'integer', minimum: 1, example: 42 },
    }),
    ApiBadRequestResponse({
      description: 'Invalid pico unit id',
      type: ErrorDto,
    }),
    ApiNotFoundResponse({
      description: 'PicoUnit not found',
      type: ErrorDto,
    }),
    ApiNotAcceptableResponse({
      description: 'Database-related error',
      type: ErrorDto,
    }),
  );
}

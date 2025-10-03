import { applyDecorators } from '@nestjs/common';
import {
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

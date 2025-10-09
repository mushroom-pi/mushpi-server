import { applyDecorators } from '@nestjs/common';
import {
  ApiNotAcceptableResponse,
  ApiNotFoundResponse,
  ApiParam,
} from '@nestjs/swagger';

import { ErrorDto } from 'src/common/dto/error.dto';

export function ApiBatch() {
  return applyDecorators(
    ApiParam({
      name: 'batchId',
      required: true,
      description: 'Batch ID',
      schema: { type: 'integer', minimum: 1, example: 42 },
    }),
    ApiNotFoundResponse({
      description: 'Batch not found',
      type: ErrorDto,
    }),
    ApiNotAcceptableResponse({
      description: 'Database-related error',
      type: ErrorDto,
    }),
  );
}

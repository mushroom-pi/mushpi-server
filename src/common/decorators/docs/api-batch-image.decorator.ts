import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';

import { ErrorDto } from 'src/common/dto/error.dto';

export function ApiBatchImageErrors() {
  return applyDecorators(
    ApiNotFoundResponse({
      description: 'Batch or image not found',
      type: ErrorDto,
    }),
    ApiBadRequestResponse({
      description: 'Invalid file type, file too large, or invalid filename',
      type: ErrorDto,
    }),
    ApiConflictResponse({
      description: 'Batch already has the maximum of 5 images',
      type: ErrorDto,
    }),
    ApiUnsupportedMediaTypeResponse({
      description: 'Invalid content type',
      type: ErrorDto,
    }),
  );
}

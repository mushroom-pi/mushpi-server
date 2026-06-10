import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotAcceptableResponse,
  ApiNotFoundResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';

import { ErrorDto } from 'src/common/dto/error.dto';

export function ApiRecipeImageErrors() {
  return applyDecorators(
    ApiNotFoundResponse({
      description: 'Recipe or image not found',
      type: ErrorDto,
    }),
    ApiBadRequestResponse({
      description: 'Invalid file type, file too large, or missing image/url',
      type: ErrorDto,
    }),
    ApiNotAcceptableResponse({
      description:
        'The provided URL is not accessible or does not point to a valid image',
      type: ErrorDto,
    }),
    ApiUnsupportedMediaTypeResponse({
      description: 'Invalid content type',
      type: ErrorDto,
    }),
  );
}

import { HttpCode, HttpStatus, applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

export function ApiEmptyOkResponse({ description }: { description?: string }) {
  return applyDecorators(
    HttpCode(HttpStatus.NO_CONTENT),
    ApiResponse({
      description,
      status: HttpStatus.NO_CONTENT,
    }),
  );
}

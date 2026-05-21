import { HttpStatus, applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

export function ApiConflictErrorResponse({
  description,
  message,
}: {
  description?: string;
  message?: string;
}) {
  const example = {
    statusCode: HttpStatus.CONFLICT,
    error: 'Conflict',
    message: message ?? 'Conflict',
    timestamp: new Date(2024, 8, 15).toISOString(),
    path: '/path/of/the/failing/route',
  };

  return applyDecorators(
    ApiResponse({
      status: HttpStatus.CONFLICT,
      description: description ?? 'Conflict',
      schema: { example },
    }),
  );
}

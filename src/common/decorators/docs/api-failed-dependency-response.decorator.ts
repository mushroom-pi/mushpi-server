import { HttpStatus, applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

export function ApiFailedDependencyResponse({
  description,
}: {
  description?: string;
}) {
  return applyDecorators(
    ApiResponse({
      status: HttpStatus.FAILED_DEPENDENCY,
      description: description ?? 'Failed Dependency',
      schema: {
        example: {
          statusCode: HttpStatus.FAILED_DEPENDENCY,
          error: 'Failed Dependency',
          description: description ?? 'Failed Dependency',
          timestamp: new Date(2024, 8, 15).toISOString(),
          path: '/path/of/the/failing/route',
        },
      },
    }),
  );
}

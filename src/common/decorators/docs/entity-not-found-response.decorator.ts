import { HttpStatus, applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

export function ApiEntityNotFoundErrorResponse({
  description,
  emitter,
  entity,
}: {
  description?: string;
  emitter?: string;
  entity: string;
}) {
  const example = {
    statusCode: HttpStatus.NOT_FOUND,
    error: 'Not Found',
    message: `${entity} not found`,

    // TODO: These fields won't be returned if errorsDetail is false. We should document it
    emitter: emitter || 'Middleware',
    description: {},
    timestamp: new Date(2024, 8, 15).toISOString(),
    path: '/path/of/the/failing/route',
  };

  return applyDecorators(
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      description: description || `${entity} not found`,
      schema: { example },
    }),
  );
}

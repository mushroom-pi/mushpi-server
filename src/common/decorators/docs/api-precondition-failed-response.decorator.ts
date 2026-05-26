import { HttpStatus, applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

export function ApiPreconditionFailedErrorResponse({
  description,
  emitter,
}: {
  description?: string;
  emitter?: string;
}) {
  const message = "The server's expectations aren't being met";
  const example = {
    statusCode: HttpStatus.PRECONDITION_FAILED,
    error: 'Precondition failed',
    message,
    emitter: emitter || 'Middleware',
    timestamp: new Date(2024, 8, 15).toISOString(),
    path: '/path/of/the/failing/route',
  };

  return applyDecorators(
    ApiResponse({
      status: HttpStatus.PRECONDITION_FAILED,
      description: description || message,
      schema: { example },
    }),
  );
}

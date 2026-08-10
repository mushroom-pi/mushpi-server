import { HttpStatus } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorDto {
  @ApiProperty({ type: Number, example: 404 })
  statusCode: HttpStatus;

  @ApiProperty({ type: String, example: 'Not Found' })
  error: string;

  @ApiProperty({ type: String, example: 'Resource not found' })
  message: string;

  @ApiPropertyOptional({
    type: String,
    example: 'ErrorProducerModule',
    description:
      'If the error was produced within the codebase, the name of the module where it was created',
  })
  emitter?: string;

  @ApiPropertyOptional({
    type: String,
    example: '2024-09-15T00:00:00.000Z',
    description: 'ISO timestamp of when the error occurred',
  })
  timestamp?: string;

  @ApiPropertyOptional({
    type: String,
    example: '/path/of/the/failing/route',
    description: 'Endpoint responsible for the production of the error',
  })
  path?: string;
}

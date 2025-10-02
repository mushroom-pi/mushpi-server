import { HttpStatus } from '@nestjs/common';

export class ErrorDto {
  statusCode: HttpStatus;
  error: string;
  message: string;
  emitter?: string;
  timestamp?: string;
  path?: string;
}

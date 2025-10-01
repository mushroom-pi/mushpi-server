import { HttpStatus } from '@nestjs/common';

import { OverrideTags } from './swagger.type';

export interface ErrorResponseInput {
  statusCode: HttpStatus | number;
  error: string;
  description: string;
  messageExample: string | string[];
  overrideTag?: OverrideTags;
}

export interface DocumentDescriptor {
  name?: string;
  description?: string;
  version?: string;
}

interface ResponseProperty {
  type: string;
  example: string | HttpStatus | string[];
  description?: string;
}

export interface ErrorProperties {
  statusCode: ResponseProperty;
  error: ResponseProperty;
  message: ResponseProperty;
  emitter?: ResponseProperty;
  timestamp?: ResponseProperty;
  path?: ResponseProperty;
}

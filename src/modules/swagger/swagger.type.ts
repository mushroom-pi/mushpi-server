import { OpenAPIObject } from '@nestjs/swagger';

export type OverrideTags =
  | 'no-validation'
  | 'no-internal'
  | 'no-invalid'
  | 'no-secret';
export type ErrorResponseAdder = (document: OpenAPIObject) => void;

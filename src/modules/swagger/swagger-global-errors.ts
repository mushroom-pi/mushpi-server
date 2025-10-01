import { HttpStatus } from '@nestjs/common';

import { ErrorResponseInput } from './swagger.interface';

const unprocessableEntity: ErrorResponseInput = {
  statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
  error: 'Unprocessable Entity',
  description: 'Validation error',
  messageExample: [
    'propertyA has wrong value "...", [constrains]',
    'propertyB has wrong value "...", [constrains]',
    '...',
  ],
  overrideTag: 'no-validation',
};

const upgradeRequired: ErrorResponseInput = {
  statusCode: 426,
  error: 'Upgrade Required',
  description:
    "This route requires carrying the app's secret in the authentication headers and it's not being included",
  messageExample: 'Invalid app secret',
  overrideTag: 'no-secret',
};

const tooMany: ErrorResponseInput = {
  statusCode: HttpStatus.TOO_MANY_REQUESTS,
  error: 'Too Many Requests',
  description: 'Rate limit for the endpont have been overcome',
  messageExample: 'Too many requests',
};

const internal: ErrorResponseInput = {
  statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  error: 'Internal Server Error',
  description: 'Generic unknown error produced by an unidentified exception',
  messageExample: 'Internal server error',
  overrideTag: 'no-internal',
};

const unavailable: ErrorResponseInput = {
  statusCode: HttpStatus.SERVICE_UNAVAILABLE,
  error: 'Service Unavailable',
  description:
    'The event loop is lagging and no more requests can be attended right now',
  messageExample: 'Server is too busy',
};

export const globalErrors: ErrorResponseInput[] = [
  unprocessableEntity,
  upgradeRequired,
  tooMany,
  internal,
  unavailable,
];

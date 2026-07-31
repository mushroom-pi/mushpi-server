import { UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { Logger } from '@nestjs/common';

import { ValidationError } from 'class-validator';

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): string[] {
  const messages: string[] = [];
  for (const error of errors) {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    if (error.constraints) {
      messages.push(
        `${path} has wrong value ${error.value}, ${Object.values(error.constraints).join(', ')}`,
      );
    }
    if (error.children?.length) {
      messages.push(...flattenValidationErrors(error.children, path));
    }
  }
  return messages;
}

export const validationPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  forbidNonWhitelisted: true,
  exceptionFactory: (errors) => {
    const logger = new Logger('ValidationPipe');
    const messages = flattenValidationErrors(errors);

    // Log the validation errors to the console
    logger.verbose(messages, 'Validation errors');

    return new UnprocessableEntityException(messages);
  },
});

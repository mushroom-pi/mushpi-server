import { UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { Logger } from '@nestjs/common';

export const validationPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
  exceptionFactory: (errors) => {
    const logger = new Logger('ValidationPipe');
    const messages = errors.map(
      (error) =>
        `${error.property} has wrong value ${error.value}, ${Object.values(error.constraints).join(', ')}`,
    );

    // Log the validation errors to the console
    logger.verbose(messages, 'Validation errors');

    return new UnprocessableEntityException(messages);
  },
});

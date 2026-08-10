import { HttpException } from '@nestjs/common';

import { HttpExceptionArgs } from './exceptions.interfaces';

export const FailedDependencyException = ({
  description,
  emitter,
}: HttpExceptionArgs): HttpException =>
  new HttpException(
    {
      error: 'Failed Dependency',
      statusCode: 424,
      description: description || 'Failed Dependency',
      emitter,
    },
    424,
  );

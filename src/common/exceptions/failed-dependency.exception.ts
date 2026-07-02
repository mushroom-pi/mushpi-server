import { HttpException } from '@nestjs/common';

import { HttpExceptionArgs } from './exceptions.interfaces';

export const FailedDependencyException = ({
  description,
  emmitter,
}: HttpExceptionArgs): HttpException =>
  new HttpException(
    {
      error: 'Failed Dependency',
      statusCode: 424,
      description: description || 'Failed Dependency',
      emmitter,
    },
    424,
  );

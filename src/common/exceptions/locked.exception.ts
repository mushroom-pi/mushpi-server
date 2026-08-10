import { HttpException } from '@nestjs/common';

import { HttpExceptionArgs } from './exceptions.interfaces';

export const LockedException = ({
  description,
  emitter,
}: HttpExceptionArgs): HttpException =>
  new HttpException(
    {
      error: 'Locked',
      statusCode: 423,
      description: description || 'Locked',
      emitter,
    },
    423,
  );

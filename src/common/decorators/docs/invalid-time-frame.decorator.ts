import { applyDecorators } from '@nestjs/common';
import { ApiBadRequestResponse } from '@nestjs/swagger';

import { ErrorDto } from 'src/common/dto/error.dto';

export function ApiInvalidTimeFrame() {
  return applyDecorators(
    ApiBadRequestResponse({
      description: 'Invalid requested time frame',
      type: ErrorDto,
    }),
  );
}

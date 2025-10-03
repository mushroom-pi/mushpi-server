import { HttpStatus, applyDecorators } from '@nestjs/common';
import { ApiBadGatewayResponse, ApiResponse } from '@nestjs/swagger';

import { ErrorDto } from 'src/common/dto/error.dto';

export function ApiAxiosErrorResponses() {
  return applyDecorators(
    ApiResponse({
      status: HttpStatus.EXPECTATION_FAILED,
      description: 'A service returned an error response',
      type: ErrorDto,
    }),
    ApiResponse({
      status: HttpStatus.FAILED_DEPENDENCY,
      description: 'Axios produced an error',
      type: ErrorDto,
    }),
    ApiBadGatewayResponse({
      description: 'A request was made but no response was received',
      type: ErrorDto,
    }),
  );
}

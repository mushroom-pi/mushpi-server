import { UseGuards, applyDecorators } from '@nestjs/common';
import { ApiGoneResponse } from '@nestjs/swagger';

import { ErrorDto } from 'src/common/dto/error.dto';
import { IsPicoUnitEnabledGuard } from 'src/common/guards/is-pico-unit-enabled.guard';

export function OnlyEnabledPicoUnits() {
  return applyDecorators(
    UseGuards(IsPicoUnitEnabledGuard),
    ApiGoneResponse({
      description:
        'This action can only be implemented with enabled Pico Units',
      type: ErrorDto,
    }),
  );
}

import { UseGuards, applyDecorators } from '@nestjs/common';
import { ApiConflictResponse, ApiGoneResponse } from '@nestjs/swagger';

import { ErrorDto } from 'src/common/dto/error.dto';
import { IsControlLoopEnabledGuard } from 'src/common/guards/is-control-loop-enabled.guard';
import { IsPicoUnitEnabledGuard } from 'src/common/guards/is-pico-unit-enabled.guard';

export function OnlyEnabledPicoUnitsWithControlLoop() {
  return applyDecorators(
    UseGuards(IsPicoUnitEnabledGuard, IsControlLoopEnabledGuard),
    ApiConflictResponse({
      description:
        "This endpoint cannot be used as long as the Pico Unit's control loop is activated",
      type: ErrorDto,
    }),
    ApiGoneResponse({
      description:
        'This action can only be implemented with enabled Pico Units',
      type: ErrorDto,
    }),
  );
}

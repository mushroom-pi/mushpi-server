import { UseGuards, applyDecorators } from '@nestjs/common';
import { ApiGoneResponse } from '@nestjs/swagger';

import { ErrorDto } from 'src/common/dto/error.dto';
import { IsPicoUnitMonitoredGuard } from 'src/common/guards/is-pico-unit-monitored.guard';

export function OnlyMonitoredPicoUnits() {
  return applyDecorators(
    UseGuards(IsPicoUnitMonitoredGuard),
    ApiGoneResponse({
      description:
        'This action can only be implemented with monitored Pico Units',
      type: ErrorDto,
    }),
  );
}

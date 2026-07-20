import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Response } from 'express';

import { ApiPicoUnit } from 'src/common/decorators/docs/api-pico-unit.decorator';
import { ApiInvalidTimeFrame } from 'src/common/decorators/docs/invalid-time-frame.decorator';
import { GetPicoUnit } from 'src/common/decorators/get-pico-unit.decorator';
import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';

import {
  ListReadingsQueryDto,
  ReadingsListResponseDto,
  TimeLimitsQueryDto,
} from '../readings.dto';
import { ReadingsService } from '../readings.service';

@ApiTags('readings')
@Controller('pico-units/:picoUnitId/readings')
@ApiPicoUnit()
export class PicoUnitIdReadingsController {
  constructor(private readonly svc: ReadingsService) {}

  @Get()
  @ApiOperation({
    summary: 'List readings for a pico unit',
    description:
      'Extracts requested readings from the database (without calling the Pico Unit) and displays them chronologically. Results can be framed by time.',
  })
  @ApiOkResponse({ type: ReadingsListResponseDto })
  @ApiInvalidTimeFrame()
  async listForUnit(
    @GetPicoUnit() unit: PicoUnit,
    @Query() query: ListReadingsQueryDto,
  ) {
    return this.svc.listForUnit(unit.id, query);
  }

  @Get('export')
  @ApiOperation({
    summary: 'Download pico unit readings as CSV',
    description:
      'Generate and trigger download of a CSV file with the readings from the requested pico unit and time window',
  })
  @ApiOkResponse({
    description: 'CSV File generated and ready for consumption',
    content: {
      'text/csv': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiInvalidTimeFrame()
  async exportCsvForUnit(
    @GetPicoUnit() unit: PicoUnit,
    @Query() query: TimeLimitsQueryDto,
    @Res() res?: Response,
  ) {
    return this.svc.exportCsvForUnit(unit, query, res);
  }
}

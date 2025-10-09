import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiPicoUnit } from 'src/common/decorators/docs/api-pico-unit.decorator';
import { OnlyEnabledPicoUnits } from 'src/common/decorators/docs/only-enabled-pico-unit.decorator';
import { GetPicoUnit } from 'src/common/decorators/get-pico-unit.decorator';
import { ErrorDto } from 'src/common/dto/error.dto';
import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';

import { ListReadingsQueryDto, ReadingsListResponseDto } from '../readings.dto';
import { Readings } from '../readings.entity';
import { ReadingsService } from '../readings.service';

@ApiTags('readings')
@Controller('pico-units/:picoUnitId/readings')
@ApiPicoUnit()
export class PicoUnitIdReadingsController {
  constructor(private readonly svc: ReadingsService) {}

  @ApiTags('proxy')
  @OnlyEnabledPicoUnits()
  @Get('poll')
  @ApiOperation({
    summary: 'Exctract live reading',
    description:
      'Connect with the Pico Unit, exctract a current reading from it and, if successful, save it to the database',
  })
  @ApiOkResponse({ type: Readings })
  @ApiResponse({
    description:
      'The system is alrady polling and saving content from a different unit',
    status: 423,
    type: ErrorDto,
  })
  poll(@GetPicoUnit() unit: PicoUnit) {
    return this.svc.pollReadingsFromUnit(unit);
  }

  @Get()
  @ApiOperation({
    summary: 'List readings for a pico unit',
    description:
      'Extracts requested readings from the database (without calling the Pico Unit) and displays them chronologically. Results can be framed by time.',
  })
  @ApiOkResponse({ type: ReadingsListResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid requested time frame',
    type: ErrorDto,
  })
  async listForUnit(
    @GetPicoUnit() unit: PicoUnit,
    @Query() query: ListReadingsQueryDto,
  ) {
    return this.svc.listForUnit(unit.id, query);
  }
}

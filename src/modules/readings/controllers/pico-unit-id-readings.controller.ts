import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiPicoUnit } from 'src/common/decorators/docs/api-pico-unit.decorator';
import { GetPicoUnit } from 'src/common/decorators/get-pico-unit.decorator';
import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';

import { ListReadingsQueryDto, ReadingsListResponseDto } from '../readings.dto';
import { Readings } from '../readings.entity';
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
      'Extracts requested readings from the database (without calling the Pico Unit) and displays them chronologically.',
  })
  @ApiOkResponse({ type: ReadingsListResponseDto })
  async listForUnit(
    @GetPicoUnit() unit: PicoUnit,
    @Query() query: ListReadingsQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 100;
    return this.svc.listForUnit(unit.id, page, limit);
  }

  @ApiTags('proxy')
  @Get('poll')
  @ApiOperation({
    summary: 'Exctract live reading',
    description:
      'Connect with the Pico Unit, exctract a current reading from it and, if successful, save it to the database',
  })
  @ApiOkResponse({ type: Readings })
  poll(@GetPicoUnit() unit: PicoUnit) {
    return this.svc.pollReadingsFromUnit(unit);
  }
}

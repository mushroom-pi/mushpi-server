import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotAcceptableResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ErrorDto } from 'src/common/dto/error.dto';

import {
  ListPicoUnitsQueryDto,
  PicoUnitListResponseDto,
  UpsertPicoUnitDto,
} from '../pico-unit.dto';
import { PicoUnit } from '../pico-unit.entity';
import { PicoUnitsService } from '../pico-units.service';

@ApiTags('pico-units')
@Controller('pico-units')
@ApiNotAcceptableResponse({
  description: 'Database-related error',
  type: ErrorDto,
})
export class PicoUnitsController {
  constructor(private readonly svc: PicoUnitsService) {}

  @Post()
  @ApiOperation({
    summary: 'Upsert pico unit',
    description:
      'Create a new pico unit in the database or asses an already existing one',
  })
  @ApiCreatedResponse({
    description: 'Pico unit created in the database',
    type: PicoUnit,
  })
  upsert(@Body() upsertPicoUnitDto: UpsertPicoUnitDto) {
    return this.svc.upsert(upsertPicoUnitDto);
  }

  @Get()
  @ApiOperation({
    summary: 'List Pico Units (paginated)',
    description:
      'Retrieve all the pico units stored in the database, with minimal filtering options',
  })
  @ApiOkResponse({
    description: 'List with pagination',
    type: PicoUnitListResponseDto,
  })
  list(@Query() query: ListPicoUnitsQueryDto) {
    return this.svc.list(query);
  }
}

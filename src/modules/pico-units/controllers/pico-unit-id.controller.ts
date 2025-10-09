import { Body, Controller, Delete, Get, Param, Patch } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiPicoUnit } from 'src/common/decorators/docs/api-pico-unit.decorator';
import { ApiAxiosErrorResponses } from 'src/common/decorators/docs/axios-errors.decorator';
import { ApiEmptyOkResponse } from 'src/common/decorators/docs/empty-ok-response.decorator';
import { GetPicoUnit } from 'src/common/decorators/get-pico-unit.decorator';

import { UpdatePicoUnitDto } from '../pico-unit.dto';
import { PicoUnit } from '../pico-unit.entity';
import { PicoUnitsService } from '../pico-units.service';

@ApiTags('pico-units')
@Controller('pico-units/:picoUnitId')
@ApiPicoUnit()
export class PicoUnitIdController {
  constructor(private readonly svc: PicoUnitsService) {}

  @Get()
  @ApiOperation({ summary: 'Get a Pico Unit by id' })
  @ApiOkResponse({ type: PicoUnit })
  getOne(@GetPicoUnit() unit: PicoUnit) {
    return unit;
  }

  @Patch()
  @ApiOperation({ summary: 'Update a Pico Unit' })
  @ApiOkResponse({ type: PicoUnit })
  @ApiConflictResponse({ description: 'host:port already exists' })
  update(@GetPicoUnit() unit: PicoUnit, @Body() dto: UpdatePicoUnitDto) {
    return this.svc.update(unit, dto);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete a Pico Unit' })
  @ApiEmptyOkResponse({ description: 'Deleted' })
  remove(@Param('picoUnitId') id: string) {
    return this.svc.removeById(Number(id));
  }

  @ApiTags('proxy')
  @Get('ping')
  @ApiOperation({
    summary: 'Ping the Pico Unit',
    description:
      "Send GET request to the unit's most basic life-check endpoint",
  })
  @ApiOkResponse({ example: 'pong' })
  @ApiAxiosErrorResponses()
  ping(@GetPicoUnit() unit: PicoUnit) {
    return this.svc.ping(unit);
  }
}

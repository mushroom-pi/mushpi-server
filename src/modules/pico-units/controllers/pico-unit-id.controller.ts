import { Body, Controller, Delete, Get, Param, Patch } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiEmptyOkResponse } from 'src/common/decorators/empty-ok-response.decorator';

import { ApiPicoUnit } from '../docs/api-pico-unit.decorator';
import { GetPicoUnit } from '../get-pico-unit.decorator';
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
  @ApiPicoUnit()
  @ApiOkResponse({ type: PicoUnit })
  @ApiConflictResponse({ description: 'host:port already exists' })
  update(@GetPicoUnit() unit: PicoUnit, @Body() dto: UpdatePicoUnitDto) {
    return this.svc.update(unit, dto);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete a Pico Unit' })
  @ApiPicoUnit()
  @ApiEmptyOkResponse({ description: 'Deleted' })
  async remove(@Param('picoUnitId') id: string) {
    await this.svc.removeById(Number(id));
    return { ok: true };
  }
}

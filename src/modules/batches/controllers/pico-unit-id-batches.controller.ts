import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiBatch } from 'src/common/decorators/docs/api-batch.decorator';
import { ApiPicoUnit } from 'src/common/decorators/docs/api-pico-unit.decorator';
import { GetPicoUnit } from 'src/common/decorators/get-pico-unit.decorator';
import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';

import {
  BatchListResponseDto,
  ListPicoUnitBatchesQueryDto,
} from '../batches.dto';
import { Batch } from '../batches.entity';
import { BatchesService } from '../batches.service';

@ApiTags('pico-units', 'batches')
@Controller('pico-units/:picoUnitId/batches')
@ApiPicoUnit()
export class PicoUnitIdBatchesController {
  constructor(private readonly svc: BatchesService) {}

  @Get()
  @ApiOperation({ summary: "Get a unit's batches" })
  @ApiOkResponse({
    description: 'List with pagination',
    type: BatchListResponseDto,
  })
  list(
    @GetPicoUnit() unit: PicoUnit,
    @Query() query: ListPicoUnitBatchesQueryDto,
  ) {
    return this.svc.listForPicoUnitId(unit.id, query);
  }

  @Get('current')
  @ApiOperation({ summary: "Get the unit's active batch, if any" })
  @ApiOkResponse({ type: Batch })
  @ApiBatch()
  getCurrent(@GetPicoUnit() unit: PicoUnit) {
    return this.svc.currentForUnitOrThrow(unit.id);
  }
}

import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiPicoUnit } from 'src/common/decorators/docs/api-pico-unit.decorator';
import { GetPicoUnit } from 'src/common/decorators/get-pico-unit.decorator';
import { ErrorDto } from 'src/common/dto/error.dto';
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
export class PicoUnitIdBatchesV1Controller {
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
  // The 404 documents the no-active-batch case (see currentForUnitOrThrow).
  // Only the response part of ApiBatch() is used here: the route carries no
  // `:batchId` path parameter, so the composite's ApiParam would emit a
  // phantom path parameter that is invalid OAS3 (not in the path template).
  @ApiNotFoundResponse({
    description: 'Batch not found',
    type: ErrorDto,
  })
  getCurrent(@GetPicoUnit() unit: PicoUnit) {
    return this.svc.currentForUnitOrThrow(unit.id);
  }
}

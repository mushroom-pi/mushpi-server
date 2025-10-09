import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiBatch } from 'src/common/decorators/docs/api-batch.decorator';
import { GetBatch } from 'src/common/decorators/get-batch.decorator';
import { ErrorDto } from 'src/common/dto/error.dto';
import { Batch } from 'src/modules/batches/batches.entity';

import { ListReadingsQueryDto, ReadingsListResponseDto } from '../readings.dto';
import { ReadingsService } from '../readings.service';

@ApiTags('readings', 'batches')
@Controller('batches/:batchId/readings')
@ApiBatch()
export class BatchIdReadingsController {
  constructor(private readonly svc: ReadingsService) {}

  @Get()
  @ApiOperation({
    summary: 'List readings for a batch',
    description:
      "Extracts requested readings from the database and displays them chronologically. Results can be framed by time, but if the provided time limits are beyond the batch's, they won't be applied.",
  })
  @ApiOkResponse({ type: ReadingsListResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid requested time frame',
    type: ErrorDto,
  })
  async listForBatch(
    @GetBatch() batch: Batch,
    @Query() query: ListReadingsQueryDto,
  ) {
    return this.svc.listForBatch(batch.id, query);
  }
}

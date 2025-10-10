import { Controller, Get, Query, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Response } from 'express';

import { ApiBatch } from 'src/common/decorators/docs/api-batch.decorator';
import { ApiInvalidTimeFrame } from 'src/common/decorators/docs/invalid-time-frame.decorator';
import { GetBatch } from 'src/common/decorators/get-batch.decorator';
import { ErrorDto } from 'src/common/dto/error.dto';
import { Batch } from 'src/modules/batches/batches.entity';

import {
  ListReadingsQueryDto,
  OptionalTimeLimitsQueryDto,
  ReadingsListResponseDto,
} from '../readings.dto';
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

  @Get('export')
  @ApiOperation({
    summary: 'Download batch readings as CSV',
    description:
      'Generate and trigger download of a CSV file with the readings from the requested batch. Same time window rules apply as for the list readings endpoint',
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
    @GetBatch() batch: Batch,
    @Query() query: OptionalTimeLimitsQueryDto,
    @Res() res?: Response,
  ) {
    return this.svc.exportCsvForBatch(batch, query, res);
  }
}

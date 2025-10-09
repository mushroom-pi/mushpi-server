import { Body, Controller, Delete, Get, Param, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiBatch } from 'src/common/decorators/docs/api-batch.decorator';
import { ApiEmptyOkResponse } from 'src/common/decorators/docs/empty-ok-response.decorator';
import { GetBatch } from 'src/common/decorators/get-batch.decorator';

import { UpdateBatchDto } from '../batches.dto';
import { Batch } from '../batches.entity';
import { BatchesService } from '../batches.service';

@ApiTags('batches')
@Controller('batches/:batchId')
@ApiBatch()
export class BatchIdController {
  constructor(private readonly svc: BatchesService) {}

  @Get()
  @ApiOperation({ summary: 'Get growing batch by id' })
  @ApiOkResponse({ type: Batch })
  getOne(@GetBatch() batch: Batch) {
    return batch;
  }

  @Patch()
  @ApiOperation({ summary: 'Modify an existing batch' })
  @ApiOkResponse({ type: Batch })
  update(@GetBatch() batch: Batch, @Body() dto: UpdateBatchDto) {
    return this.svc.update(batch, dto);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete a batch' })
  @ApiEmptyOkResponse({ description: 'Deleted' })
  remove(@Param('batchId') id: string) {
    this.svc.removeById(Number(id));
  }
}

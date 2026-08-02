import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotAcceptableResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiConflictErrorResponse } from 'src/common/decorators/docs/api-conflict-response.decorator';
import { ErrorDto } from 'src/common/dto/error.dto';

import {
  BatchListResponseDto,
  CreateBatchDto,
  ListBatchesQueryDto,
} from '../batches.dto';
import { Batch } from '../batches.entity';
import { BatchesService } from '../batches.service';

@ApiTags('batches')
@Controller('batches')
@ApiNotAcceptableResponse({
  description: 'Database-related error',
  type: ErrorDto,
})
export class BatchesV1Controller {
  constructor(private readonly svc: BatchesService) {}

  @Post()
  @ApiOperation({
    summary: 'Kick-off a new batch',
    description:
      "For a Pico Unit, establish a new growing or incubation process. If the unit has an active batch, the new batch can only be created if: (1) the active batch has a defined finish_at date, AND (2) the new batch's start_at is scheduled after the active batch's finish_at.",
  })
  @ApiCreatedResponse({
    description: 'New batch created',
    type: Batch,
  })
  @ApiNotFoundResponse({
    description:
      "The provided pico_unit_id doesn't correspond to any existing and monitored Pico Unit",
    type: ErrorDto,
  })
  @ApiConflictErrorResponse({
    description:
      'The Pico Unit already has an active batch without a defined end, or the new batch start_at overlaps with the active batch',
    message:
      'Pico unit 1 already has an active batch (id: 7) with no defined end. Finish it before starting a new one. OR Pico unit 1 already has an active batch (id: 7) finishing at 2026-05-27T10:00:00.000Z. Start the new batch after that time.',
  })
  create(@Body() createBatchDto: CreateBatchDto) {
    return this.svc.create(createBatchDto);
  }

  @Get()
  @ApiOperation({
    summary: 'List batches (paginated)',
    description:
      'Retrieve all the batches stored in the database, with minimal filtering options',
  })
  @ApiOkResponse({
    description: 'List with pagination',
    type: BatchListResponseDto,
  })
  list(@Query() query: ListBatchesQueryDto) {
    return this.svc.list(query);
  }
}

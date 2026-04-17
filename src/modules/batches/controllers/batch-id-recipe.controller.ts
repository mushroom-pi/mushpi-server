import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { ApiBatch } from 'src/common/decorators/docs/api-batch.decorator';
import { GetBatch } from 'src/common/decorators/get-batch.decorator';
import { ErrorDto } from 'src/common/dto/error.dto';
import { Recipe } from 'src/modules/recipes/recipes.entity';

import { CreateRecipeFromBatchDto } from '../batches.dto';
import { Batch } from '../batches.entity';
import { BatchesService } from '../batches.service';

@ApiTags('batches')
@Controller('batches/:batchId')
@ApiBatch()
export class BatchIdRecipeController {
  constructor(private readonly svc: BatchesService) {}

  @Post('recipe')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a recipe from a finished batch',
    description:
      'Creates a new recipe using the species and climate targets from the batch. ' +
      'duration_days is computed from start_at → finish_at. ' +
      'The batch must be finished and have species, temperature_target, and humidity_target set.',
  })
  @ApiCreatedResponse({ type: Recipe })
  @ApiUnprocessableEntityResponse({
    description: 'Batch is not finished or is missing required fields',
    type: ErrorDto,
  })
  createRecipe(
    @GetBatch() batch: Batch,
    @Body() dto: CreateRecipeFromBatchDto,
  ) {
    return this.svc.createRecipeFromBatch(batch, dto);
  }
}

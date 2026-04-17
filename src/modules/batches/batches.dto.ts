import { ApiExtraModels, ApiPropertyOptional, OmitType } from '@nestjs/swagger';

import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

import {
  HUMIDITY_MAX,
  HUMIDITY_MIN,
  TEMPERATURE_MAX,
  TEMPERATURE_MIN,
} from 'src/common/constants/climate.constants';
import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_DEFAULT_PAGE,
  PAGINATION_MAX_LIMIT,
  PAGINATION_MIN_LIMIT,
  PAGINATION_MIN_PAGE,
} from 'src/common/constants/pagination.constants';
import { NOTES_MAX_LENGTH } from 'src/common/constants/validation.constants';
import { PaginatedDto } from 'src/common/dto/paginated-response.dto';

import { batchStatuses } from './batches.constant';
import { Batch } from './batches.entity';
import { BatchStatus } from './batches.type';

export class CreateBatchDto {
  @ApiPropertyOptional()
  @IsInt()
  pico_unit_id!: number;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  start_at?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  finish_at?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  species?: string;

  @ApiPropertyOptional({
    type: Number,
    minimum: TEMPERATURE_MIN,
    maximum: TEMPERATURE_MAX,
  })
  @IsInt()
  @Min(TEMPERATURE_MIN)
  @Max(TEMPERATURE_MAX)
  @IsOptional()
  temperature_target?: number;

  @ApiPropertyOptional({
    type: Number,
    minimum: HUMIDITY_MIN,
    maximum: HUMIDITY_MAX,
  })
  @IsInt()
  @Min(HUMIDITY_MIN)
  @Max(HUMIDITY_MAX)
  @IsOptional()
  humidity_target?: number;

  @ApiPropertyOptional({ maxLength: NOTES_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @Length(0, NOTES_MAX_LENGTH)
  notes?: string;

  @ApiPropertyOptional({
    type: Number,
    description:
      'Optional recipe to use as a template. species, temperature_target and humidity_target will be copied from the recipe if not explicitly provided.',
  })
  @IsInt()
  @IsOptional()
  recipe_id?: number;
}

export class UpdateBatchDto extends OmitType(CreateBatchDto, [
  'pico_unit_id',
  'recipe_id',
] as const) {}

export class ListBatchesQueryDto {
  @ApiPropertyOptional({
    type: Number,
    minimum: PAGINATION_MIN_PAGE,
    default: PAGINATION_DEFAULT_PAGE,
  })
  @IsOptional()
  @IsInt()
  @Min(PAGINATION_MIN_PAGE)
  page?: number = PAGINATION_DEFAULT_PAGE;

  @ApiPropertyOptional({
    type: Number,
    minimum: PAGINATION_MIN_LIMIT,
    maximum: PAGINATION_MAX_LIMIT,
    default: PAGINATION_DEFAULT_LIMIT,
  })
  @IsOptional()
  @IsInt()
  @Min(PAGINATION_MIN_LIMIT)
  @Max(PAGINATION_MAX_LIMIT)
  limit?: number = PAGINATION_DEFAULT_LIMIT;

  @ApiPropertyOptional({
    type: String,
    description: 'Filter by batches depending on their readiness status',
    enum: batchStatuses,
  })
  @IsOptional()
  @IsString()
  @IsIn(batchStatuses)
  status?: BatchStatus;

  @ApiPropertyOptional({
    type: Number,
    description: 'Search by Pico Unit',
  })
  @IsOptional()
  @IsInt()
  pico_unit_id?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Filter by Recipe',
  })
  @IsOptional()
  @IsInt()
  recipe_id?: number;
}

export class ListPicoUnitBatchesQueryDto extends OmitType(ListBatchesQueryDto, [
  'pico_unit_id',
  'recipe_id',
] as const) {}

@ApiExtraModels(Batch)
export class BatchListResponseDto extends PaginatedDto(Batch) {}

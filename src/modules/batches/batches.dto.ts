import { ApiExtraModels, ApiPropertyOptional, OmitType } from '@nestjs/swagger';

import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

import { PaginatedDto } from 'src/common/dto/paginated-response.dto';
import {
  HUMIDITY_MAX,
  HUMIDITY_MIN,
  TEMPERATURE_MAX,
  TEMPERATURE_MIN,
} from 'src/common/constants/climate.constants';

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
  @IsNumber()
  @Min(TEMPERATURE_MIN)
  @Max(TEMPERATURE_MAX)
  @IsOptional()
  temperature_target?: number;

  @ApiPropertyOptional({
    type: Number,
    minimum: HUMIDITY_MIN,
    maximum: HUMIDITY_MAX,
  })
  @IsNumber()
  @Min(HUMIDITY_MIN)
  @Max(HUMIDITY_MAX)
  @IsOptional()
  humidity_target?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  notes?: string;
}

export class UpdateBatchDto extends OmitType(CreateBatchDto, [
  'pico_unit_id',
] as const) {}

export class ListBatchesQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

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
}

export class ListPicoUnitBatchesQueryDto extends OmitType(ListBatchesQueryDto, [
  'pico_unit_id',
] as const) {}

@ApiExtraModels(Batch)
export class BatchListResponseDto extends PaginatedDto(Batch) {}

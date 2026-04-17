import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
} from '@nestjs/swagger';

import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

import {
  PAGINATION_DEFAULT_PAGE,
  PAGINATION_MIN_LIMIT,
  PAGINATION_MIN_PAGE,
  READINGS_DEFAULT_LIMIT,
  READINGS_MAX_LIMIT,
} from 'src/common/constants/pagination.constants';
import { PaginatedDto } from 'src/common/dto/paginated-response.dto';

import { Readings } from './readings.entity';

export class TimeLimitsQueryDto {
  @ApiProperty({
    description:
      'Start time (ISO 8601). If provided, only readings with ts >= start are returned.',
    example: '2025-10-01T00:00:00Z',
  })
  @IsDateString()
  start: string;

  @ApiProperty({
    description:
      'End time (ISO 8601). If provided, only readings with ts <= end are returned.',
    example: '2025-10-09T23:59:59Z',
  })
  @IsDateString()
  end: string;
}

export class OptionalTimeLimitsQueryDto extends PartialType(
  TimeLimitsQueryDto,
) {}

export class ListReadingsQueryDto extends OptionalTimeLimitsQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    example: 1,
    minimum: PAGINATION_MIN_PAGE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(PAGINATION_MIN_PAGE)
  page?: number = PAGINATION_DEFAULT_PAGE;

  @ApiPropertyOptional({
    description: `Page size (max ${READINGS_MAX_LIMIT})`,
    example: READINGS_DEFAULT_LIMIT,
    minimum: PAGINATION_MIN_LIMIT,
    maximum: READINGS_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(PAGINATION_MIN_LIMIT)
  @Max(READINGS_MAX_LIMIT)
  limit?: number = READINGS_DEFAULT_LIMIT;
}

@ApiExtraModels(Readings)
export class ReadingsListResponseDto extends PaginatedDto(Readings) {}

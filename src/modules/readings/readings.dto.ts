import { ApiExtraModels, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

import { PaginatedDto } from 'src/common/dto/paginated-response.dto';

import { Readings } from './readings.entity';

export class ListReadingsQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Page size (max 500)',
    example: 100,
    minimum: 1,
    maximum: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 100;

  @ApiPropertyOptional({
    description:
      'Start time (ISO 8601). If provided, only readings with ts >= start are returned.',
    example: '2025-10-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  start?: string;

  @ApiPropertyOptional({
    description:
      'End time (ISO 8601). If provided, only readings with ts <= end are returned.',
    example: '2025-10-09T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  end?: string;
}

@ApiExtraModels(Readings)
export class ReadingsListResponseDto extends PaginatedDto(Readings) {}

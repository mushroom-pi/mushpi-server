import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

import {
  READINGS_MAX_POINTS,
  READINGS_MIN_POINTS,
} from 'src/common/constants/pagination.constants';

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

export class DownsamplingQueryDto extends OptionalTimeLimitsQueryDto {
  @ApiPropertyOptional({
    description:
      'Target number of aggregated data points to return (actual may be fewer if there are fewer readings).',
    example: 200,
    minimum: READINGS_MIN_POINTS,
    maximum: READINGS_MAX_POINTS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(READINGS_MIN_POINTS)
  @Max(READINGS_MAX_POINTS)
  points?: number;
}

export class AggregatedReadingDto {
  @ApiProperty({
    description: 'First timestamp in the aggregation bucket (ISO 8601)',
    example: '2025-10-01T00:00:00.000Z',
  })
  timestamp!: string;

  @ApiProperty({
    description: 'Average temperature in the bucket (rounded to 1 decimal)',
    nullable: true,
    example: 22.5,
  })
  temperature!: number | null;

  @ApiProperty({
    description: 'Average humidity in the bucket (rounded to 1 decimal)',
    nullable: true,
    example: 55.3,
  })
  humidity!: number | null;

  @ApiProperty({
    description: 'Minimum temperature in the bucket (raw value)',
    nullable: true,
    example: 20.1,
  })
  tempMin!: number | null;

  @ApiProperty({
    description: 'Maximum temperature in the bucket (raw value)',
    nullable: true,
    example: 24.8,
  })
  tempMax!: number | null;

  @ApiProperty({
    description: 'Minimum humidity in the bucket (raw value)',
    nullable: true,
    example: 50,
  })
  humidityMin!: number | null;

  @ApiProperty({
    description: 'Maximum humidity in the bucket (raw value)',
    nullable: true,
    example: 60,
  })
  humidityMax!: number | null;

  @ApiProperty({
    description: 'Number of raw readings in this bucket',
    example: 7,
  })
  readingCount!: number;

  @ApiProperty({
    description: 'Count of readings in this bucket where the fan relay was on',
    example: 3,
  })
  fanOnCount!: number;

  @ApiProperty({
    description:
      'Count of readings in this bucket where the humidifier relay was on',
    example: 5,
  })
  humidifierOnCount!: number;

  @ApiProperty({
    description:
      'Count of readings in this bucket where the heater relay was on',
    example: 2,
  })
  heaterOnCount!: number;

  @ApiProperty({
    description:
      'Count of readings in this bucket where the control loop was enabled',
    example: 7,
  })
  controlLoopEnabledCount!: number;

  @ApiProperty({
    description:
      'Temperature setpoint during this bucket (MAX — constant within bucket)',
    nullable: true,
    example: 25,
  })
  temperatureSet!: number | null;

  @ApiProperty({
    description:
      'Humidity setpoint during this bucket (MAX — constant within bucket)',
    nullable: true,
    example: 60,
  })
  humiditySet!: number | null;
}

export class AggregatedReadingsResponseDto {
  @ApiProperty({ type: [AggregatedReadingDto] })
  data!: AggregatedReadingDto[];

  @ApiProperty({
    description: 'Requested number of aggregation points',
    example: 200,
  })
  points!: number;

  @ApiProperty({
    description: 'Total number of raw readings in the time window',
    example: 1440,
  })
  actualReadings!: number;
}

import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

import { PaginatedDto } from 'src/common/dto/paginated-response.dto';

import { PicoUnit } from './pico-unit.entity';

export class UpsertPicoUnitDto {
  @ApiProperty({
    type: String,
    example: 'unit-01',
    description:
      'Name for the unit as it is stated in its own software. Should not be changed.',
    minLength: 1,
    maxLength: 64,
  })
  @IsString()
  @Length(1, 64)
  handle!: string;

  @ApiProperty({
    type: String,
    minLength: 1,
    maxLength: 255,
    description: 'IPv4/hostname where the Pico API is reachable.',
    examples: ['192.168.1.50', 'rpi3.local'],
  })
  @IsString()
  @Length(1, 255)
  host!: string;

  @ApiProperty({
    type: Number,
    example: 5000,
    minimum: 1,
    maximum: 65535,
    description: 'Pico API port',
  })
  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    maxLength: 255,
    description: 'Version tag for the Micropython executed by the unit',
    examples: ['v1.26.0 on 2025-08-09 (GNU 14.2.0 MinSizeRel)', '1.26.0.'],
  })
  @IsString()
  @IsOptional()
  @Length(1, 255)
  micropython_version?: string;

  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    maxLength: 255,
    description: 'Version tag for the custom software executed by the unit',
    examples: ['0.1.0'],
  })
  @IsString()
  @IsOptional()
  @Length(1, 255)
  software_version?: string;

  @ApiPropertyOptional({
    type: String,
    minLength: 1,
    maxLength: 255,
    description: "Name of the unit's board",
    examples: ['Raspberry Pi Pico 2 W with RP2350'],
  })
  @IsString()
  @IsOptional()
  @Length(1, 255)
  board?: string;

  @ApiPropertyOptional({
    type: Number,
    description: "Size of the unit's memory in bytes",
  })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  board_total_mem_byte?: number;

  @ApiPropertyOptional({
    type: Number,
    description: "Size of the unit's file system in bytes",
  })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  board_total_fs_byte?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'CPU Frequency in MHz',
  })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  board_cpu_freq_mhz?: number;
}

export class UpdatePicoUnitDto {
  @ApiProperty({
    type: String,
    minLength: 0,
    maxLength: 128,
    description: 'Friendly name of the unit.',
    examples: ['Grow Tent A'],
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(0, 128)
  name?: string;

  @ApiProperty({
    required: false,
    description: 'Optional notes about this particular unit.',
  })
  @IsOptional()
  @IsString()
  @Length(0, 512)
  description?: string;

  @ApiProperty({
    required: false,
    default: true,
    description: 'A flag that is true if the unit is active and reachable.',
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ListPicoUnitsQueryDto {
  @ApiProperty({ required: false, minimum: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiProperty({ required: false, description: 'Filter by enabled' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ required: false, description: 'Search in handle/name/host' })
  @IsOptional()
  @IsString()
  q?: string;
}

@ApiExtraModels(PicoUnit) // ensures PicoUnit schema is available for $ref
export class PicoUnitListResponseDto extends PaginatedDto(PicoUnit) {}

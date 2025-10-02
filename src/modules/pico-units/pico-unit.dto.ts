import {
  ApiExtraModels,
  ApiProperty,
  OmitType,
  PartialType,
} from '@nestjs/swagger';

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
    example: 5000,
    minimum: 1,
    maximum: 65535,
    description: 'Pico API port',
  })
  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

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

export class UpdatePicoUnitDto extends PartialType(
  OmitType(UpsertPicoUnitDto, ['host', 'port', 'handle'] as const),
) {}

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

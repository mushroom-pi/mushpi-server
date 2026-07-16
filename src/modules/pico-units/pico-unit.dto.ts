import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIP,
  IsInt,
  IsMACAddress,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

import {
  PORT_DEFAULT,
  PORT_MAX,
  PORT_MIN,
} from 'src/common/constants/hardware.constants';
import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_DEFAULT_PAGE,
  PAGINATION_MAX_LIMIT,
  PAGINATION_MIN_LIMIT,
  PAGINATION_MIN_PAGE,
} from 'src/common/constants/pagination.constants';
import {
  HANDLE_MAX_LENGTH,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  PICO_DESCRIPTION_MAX_LENGTH,
  STANDARD_TEXT_MAX_LENGTH,
} from 'src/common/constants/validation.constants';
import { PaginatedDto } from 'src/common/dto/paginated-response.dto';

import { PicoUnit } from './pico-unit.entity';

export class AnnouncePicoUnitDto {
  @ApiProperty({
    type: String,
    example: 'unit-01',
    description:
      'Name for the unit as it is stated in its own software. Should not be changed.',
    minLength: NAME_MIN_LENGTH,
    maxLength: HANDLE_MAX_LENGTH,
  })
  @IsString()
  @Length(NAME_MIN_LENGTH, HANDLE_MAX_LENGTH)
  handle!: string;

  @ApiPropertyOptional({
    type: String,
    description:
      'IPv4 address where the Pico API is reachable. Provided by the unit on announcement.',
    example: '192.168.1.50',
  })
  @IsString()
  @IsOptional()
  @IsIP('4')
  ip?: string;

  @ApiProperty({
    type: Number,
    example: PORT_DEFAULT,
    minimum: PORT_MIN,
    maximum: PORT_MAX,
    default: PORT_DEFAULT,
    description: 'Pico API port',
  })
  @IsInt()
  @Min(PORT_MIN)
  @Max(PORT_MAX)
  port?: number = PORT_DEFAULT;

  @ApiPropertyOptional({
    type: String,
    minLength: NAME_MIN_LENGTH,
    maxLength: STANDARD_TEXT_MAX_LENGTH,
    description: 'Version tag for the Micropython executed by the unit',
    examples: ['v1.26.0 on 2025-08-09 (GNU 14.2.0 MinSizeRel)', '1.26.0.'],
  })
  @IsString()
  @IsOptional()
  @Length(NAME_MIN_LENGTH, STANDARD_TEXT_MAX_LENGTH)
  micropython_version?: string;

  @ApiPropertyOptional({
    type: String,
    minLength: NAME_MIN_LENGTH,
    maxLength: STANDARD_TEXT_MAX_LENGTH,
    description: 'Version tag for the custom software executed by the unit',
    examples: ['0.1.0'],
  })
  @IsString()
  @IsOptional()
  @Length(NAME_MIN_LENGTH, STANDARD_TEXT_MAX_LENGTH)
  software_version?: string;

  @ApiPropertyOptional({
    type: String,
    minLength: NAME_MIN_LENGTH,
    maxLength: STANDARD_TEXT_MAX_LENGTH,
    description: "Name of the unit's board",
    examples: ['Raspberry Pi Pico 2 W with RP2350'],
  })
  @IsString()
  @IsOptional()
  @Length(NAME_MIN_LENGTH, STANDARD_TEXT_MAX_LENGTH)
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

  @ApiPropertyOptional({
    type: String,
    description: 'Physical MAC address of the unit',
    examples: ['2c:cf:67:be:95:30'],
  })
  @IsMACAddress()
  @IsOptional()
  mac?: string;
}

export class CreatePicoUnitDto {
  @ApiProperty({
    type: String,
    example: 'unit-01',
    description: 'Handle (mDNS name) of the Pico unit to add manually',
    minLength: 1,
    maxLength: 64,
  })
  @IsString()
  @Length(1, 64)
  handle!: string;
}

export class UpdatePicoUnitDto {
  @ApiProperty({
    type: String,
    minLength: 0,
    maxLength: NAME_MAX_LENGTH,
    description: 'Friendly name of the unit.',
    examples: ['Grow Tent A'],
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(0, NAME_MAX_LENGTH)
  name?: string;

  @ApiProperty({
    required: false,
    description: 'Optional notes about this particular unit.',
    maxLength: PICO_DESCRIPTION_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @Length(0, PICO_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @ApiProperty({
    required: false,
    default: true,
    description: 'A flag that is true if the unit is active and reachable.',
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({
    required: false,
    type: String,
    description: 'Cosmetic hex color assigned to the unit (e.g. #4CAF50).',
    example: '#4CAF50',
    pattern: '^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$',
  })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/)
  face_color?: string | null;
}

export class ListPicoUnitsQueryDto {
  @ApiProperty({
    required: false,
    minimum: PAGINATION_MIN_PAGE,
    default: PAGINATION_DEFAULT_PAGE,
  })
  @IsOptional()
  @IsInt()
  @Min(PAGINATION_MIN_PAGE)
  page?: number = PAGINATION_DEFAULT_PAGE;

  @ApiProperty({
    required: false,
    minimum: PAGINATION_MIN_LIMIT,
    maximum: PAGINATION_MAX_LIMIT,
    default: PAGINATION_DEFAULT_LIMIT,
  })
  @IsOptional()
  @IsInt()
  @Min(PAGINATION_MIN_LIMIT)
  @Max(PAGINATION_MAX_LIMIT)
  limit?: number = PAGINATION_DEFAULT_LIMIT;

  @ApiProperty({ required: false, description: 'Filter by enabled' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ required: false, description: 'Search in handle/name/ip' })
  @IsOptional()
  @IsString()
  q?: string;
}

@ApiExtraModels(PicoUnit) // ensures PicoUnit schema is available for $ref
export class PicoUnitListResponseDto extends PaginatedDto(PicoUnit) {}

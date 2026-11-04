import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';

import { DevicesDto } from 'src/common/dto/pico-unit-response.dto';

import { PicoUnit } from './pico-unit.entity';

class DevicesMixin {
  @ApiPropertyOptional({
    type: () => DevicesDto,
    nullable: true,
    description:
      'Live devices block from the latest Pico poll response — not persisted',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DevicesDto)
  devices?: DevicesDto;
}

export class PollPicoUnitResponseDto extends IntersectionType(
  PicoUnit,
  DevicesMixin,
) {}

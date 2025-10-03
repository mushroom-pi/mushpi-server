import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ChangeSetPointsDto {
  @ApiPropertyOptional({
    description:
      'The temperature in Celsius degrees that we want the Pico Unit to maintain',
    example: 27,
    minimum: 0,
    maximum: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50)
  temperature?: number;

  @ApiPropertyOptional({
    description:
      'The percentage of humidity that we want the Pico Unit to maintain',
    example: 60,
    minimum: 20,
    maximum: 90,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(20)
  @Max(90)
  humidity?: number;
}

class ChangeDevicePinsDto {
  @ApiPropertyOptional({
    type: Number,
    description: 'Change the GPIO pin assigned to the DHT11 sensor',
    example: 4,
    minimum: 0,
    maximum: 28,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(28)
  dht?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Change the GPIO pin assigned to the humidifier',
    example: 6,
    minimum: 0,
    maximum: 28,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(28)
  humidifier?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Change the GPIO pin assigned to the fan',
    example: 7,
    minimum: 0,
    maximum: 28,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(28)
  fan?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Change the GPIO pin assigned to the heater',
    example: 8,
    minimum: 0,
    maximum: 28,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(28)
  heater?: number;
}

export class ChangeSetupDto {
  @ApiPropertyOptional({
    type: Boolean,
    description:
      "A flag that should be true if the relay's circuits are connected to the NO (Normally Open) port, and false if they are connected through NC (Normally Closed).",
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active_high?: boolean;

  @ValidateNested()
  @Type(() => ChangeDevicePinsDto)
  pins?: ChangeDevicePinsDto;
}

export class ChangeOutputsDto {
  @ApiPropertyOptional({
    type: Boolean,
    description: 'A flag that should be true we want the humidifier to be ON',
  })
  @IsOptional()
  @IsBoolean()
  humidifier?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'A flag that should be true we want the fan to be ON',
  })
  @IsOptional()
  @IsBoolean()
  fan?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'A flag that should be true we want the heater to be ON',
  })
  @IsOptional()
  @IsBoolean()
  heater?: boolean;
}

export class ControlLoopDto {
  @ApiProperty({
    type: Boolean,
    description:
      'A flag that should be true if we want the Pico Unit to automatically turn on and off devices to meet the temperature and humidity goals.',
  })
  @IsBoolean()
  enabled: boolean;
}

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

import {
  HUMIDITY_MAX,
  HUMIDITY_MIN,
  TEMPERATURE_MAX,
  TEMPERATURE_MIN,
} from 'src/common/constants/climate.constants';
import {
  GPIO_PIN_MAX,
  GPIO_PIN_MIN,
} from 'src/common/constants/hardware.constants';

export class ChangeSetPointsDto {
  @ApiPropertyOptional({
    description:
      'The temperature in Celsius degrees that we want the Pico Unit to maintain',
    example: 27,
    minimum: TEMPERATURE_MIN,
    maximum: TEMPERATURE_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(TEMPERATURE_MIN)
  @Max(TEMPERATURE_MAX)
  temperature?: number;

  @ApiPropertyOptional({
    description:
      'The percentage of humidity that we want the Pico Unit to maintain',
    example: 60,
    minimum: HUMIDITY_MIN,
    maximum: HUMIDITY_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(HUMIDITY_MIN)
  @Max(HUMIDITY_MAX)
  humidity?: number;
}

class ChangeDevicePinsDto {
  @ApiPropertyOptional({
    type: Number,
    description: 'Change the GPIO pin assigned to the DHT11 sensor',
    example: 4,
    minimum: GPIO_PIN_MIN,
    maximum: GPIO_PIN_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(GPIO_PIN_MIN)
  @Max(GPIO_PIN_MAX)
  dht?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Change the GPIO pin assigned to the humidifier',
    example: 6,
    minimum: GPIO_PIN_MIN,
    maximum: GPIO_PIN_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(GPIO_PIN_MIN)
  @Max(GPIO_PIN_MAX)
  humidifier?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Change the GPIO pin assigned to the fan',
    example: 7,
    minimum: GPIO_PIN_MIN,
    maximum: GPIO_PIN_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(GPIO_PIN_MIN)
  @Max(GPIO_PIN_MAX)
  fan?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Change the GPIO pin assigned to the heater',
    example: 8,
    minimum: GPIO_PIN_MIN,
    maximum: GPIO_PIN_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(GPIO_PIN_MIN)
  @Max(GPIO_PIN_MAX)
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

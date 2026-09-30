import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';

import {
  HUMIDITY_MAX,
  HUMIDITY_MIN,
  TEMPERATURE_MAX,
  TEMPERATURE_MIN,
} from 'src/common/constants/climate.constants';
import { VALID_USER_GPIO_PINS } from 'src/common/constants/hardware.constants';

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

@ValidatorConstraint({ name: 'noDuplicatePins', async: false })
class NoDuplicatePinsConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const pins = args.object as ChangeDevicePinsDto;
    const assigned = [pins.dht, pins.humidifier, pins.fan, pins.heater].filter(
      (v): v is number => v !== undefined && v !== null,
    );
    return new Set(assigned).size === assigned.length;
  }
  defaultMessage() {
    return 'Two devices cannot be assigned to the same GPIO pin';
  }
}

/**
 * Anchors the duplicate-pin check at the CLASS level of the whole-object
 * constraint — it must not be anchored on a pin field, because `@IsOptional()`
 * is a CONDITIONAL_VALIDATION that suppresses ALL validators on its property
 * when the value is absent: a field-anchored check silently no-ops whenever
 * that one field is missing (e.g. `{ humidifier: 6, fan: 6 }` without `dht`).
 *
 * The built-in `@Validate` cannot be used here: it is a `PropertyDecorator`
 * (`object.constructor` only resolves the class when the decorator runs on a
 * property; on a class declaration it resolves `Function`, registering the
 * constraint against the wrong target — a silent no-op). So the constraint is
 * registered directly against the constructor with no property name, which is
 * exactly the shape `@Validate` produces for a property, and the executor
 * hands the constraint the instance via `args.object`.
 */
function NoDuplicatePins(): ClassDecorator {
  return (target) => {
    registerDecorator({
      name: 'noDuplicatePins',
      target,
      // Class-level constraint: no single property to anchor; the executor
      // validates the whole object and the constraint reads `args.object`.
      propertyName: undefined as unknown as string,
      validator: NoDuplicatePinsConstraint,
    });
  };
}

@NoDuplicatePins()
class ChangeDevicePinsDto {
  @ApiPropertyOptional({
    type: Number,
    description:
      'Change the GPIO pin assigned to the DHT11 sensor. Must be a valid user I/O pin (excludes GP23-25, GP29 which are WiFi-reserved on Pico 2W).',
    example: 4,
    enum: VALID_USER_GPIO_PINS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(VALID_USER_GPIO_PINS, {
    message:
      'GPIO must be a valid user I/O pin (excludes GP23-25, GP29 which are WiFi-reserved)',
  })
  dht?: number;

  @ApiPropertyOptional({
    type: Number,
    description:
      'Change the GPIO pin assigned to the humidifier. Must be a valid user I/O pin (excludes GP23-25, GP29 which are WiFi-reserved on Pico 2W).',
    example: 6,
    enum: VALID_USER_GPIO_PINS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(VALID_USER_GPIO_PINS, {
    message:
      'GPIO must be a valid user I/O pin (excludes GP23-25, GP29 which are WiFi-reserved)',
  })
  humidifier?: number;

  @ApiPropertyOptional({
    type: Number,
    description:
      'Change the GPIO pin assigned to the fan. Must be a valid user I/O pin (excludes GP23-25, GP29 which are WiFi-reserved on Pico 2W).',
    example: 7,
    enum: VALID_USER_GPIO_PINS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(VALID_USER_GPIO_PINS, {
    message:
      'GPIO must be a valid user I/O pin (excludes GP23-25, GP29 which are WiFi-reserved)',
  })
  fan?: number;

  @ApiPropertyOptional({
    type: Number,
    description:
      'Change the GPIO pin assigned to the heater. Must be a valid user I/O pin (excludes GP23-25, GP29 which are WiFi-reserved on Pico 2W).',
    example: 8,
    enum: VALID_USER_GPIO_PINS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(VALID_USER_GPIO_PINS, {
    message:
      'GPIO must be a valid user I/O pin (excludes GP23-25, GP29 which are WiFi-reserved)',
  })
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

  @ApiPropertyOptional({
    type: () => ChangeDevicePinsDto,
    description:
      'GPIO pin assignments for the DHT11, humidifier, fan, and heater',
  })
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

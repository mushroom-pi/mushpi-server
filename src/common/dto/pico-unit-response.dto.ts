// device-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

import { Type, plainToInstance } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  ValidationError,
  validate,
} from 'class-validator';

/* ---------- devices.pins ---------- */
export class DevicePinsDto {
  @ApiProperty({
    type: 'integer',
    description: 'GPIO pin driving the fan relay',
    example: 7,
  })
  @IsInt()
  fan!: number;

  @ApiProperty({
    type: 'integer',
    description: 'GPIO pin driving the DHT11 sensor',
    example: 4,
  })
  @IsInt()
  dht!: number;

  @ApiProperty({
    type: 'integer',
    description: 'GPIO pin driving the humidifier relay',
    example: 6,
  })
  @IsInt()
  humidifier!: number;

  @ApiProperty({
    type: 'integer',
    description: 'GPIO pin driving the heater relay',
    example: 8,
  })
  @IsInt()
  heater!: number;
}

/* ---------- devices ---------- */
export class DevicesDto {
  @ApiProperty({
    type: Boolean,
    description:
      'Relay polarity: true = NO (normally-open) wiring. Deliberately not shown in the pin-mapping UI.',
    example: true,
  })
  @IsBoolean()
  active_high!: boolean;

  @ApiProperty({
    type: () => DevicePinsDto,
    description: 'Live GPIO pin mapping reported by the Pico',
  })
  @ValidateNested()
  @Type(() => DevicePinsDto)
  pins!: DevicePinsDto;
}

/* ---------- outputs ---------- */
export class OutputsDto {
  @IsBoolean() humidifier!: boolean;
  @IsBoolean() heater!: boolean;
  @IsBoolean() fan!: boolean;
}

/* ---------- memory and fs shapes inside health ---------- */
export class MemDto {
  @IsInt() used_pct!: number;
  @IsInt() free!: number;
  @IsInt() used!: number;
  @IsInt() total!: number;
}

export class FsDto {
  @IsInt() used_pct!: number;
  @IsInt() free!: number;
  @IsInt() used!: number;
  @IsInt() total!: number;
}

export class WifiHealthDto {
  @IsBoolean() connected!: boolean;
  @IsInt() rssi!: number;
}

export class HealthDto {
  @IsInt() uptime_s!: number;

  @IsNumber({}, { message: 'mcu_temp_c must be a number' })
  mcu_temp_c!: number;

  @ValidateNested()
  @Type(() => MemDto)
  mem!: MemDto;

  @ValidateNested()
  @Type(() => FsDto)
  fs!: FsDto;

  @ValidateNested()
  @Type(() => WifiHealthDto)
  wifi!: WifiHealthDto;

  @IsInt()
  event_loop_util_pct!: number;
}

/* ---------- sensors (dht) ---------- */
export class DhtSensorDto {
  @IsOptional()
  @IsInt()
  humidity?: number;

  @IsOptional()
  @IsInt()
  last_ok_age_s?: number | null;

  // can be string or null (IsOptional allows null/undefined)
  @IsOptional()
  @IsString()
  last_error?: string | null;

  @IsBoolean()
  sensor_ok!: boolean;

  @IsOptional()
  @IsNumber()
  temperature?: number;
}

export class SensorsDto {
  @ValidateNested()
  @Type(() => DhtSensorDto)
  dht!: DhtSensorDto;
}

/* ---------- setpoints ---------- */
export class SetpointsDto {
  @IsInt() humidity!: number;
  @IsInt() temperature!: number;
}

/* ---------- system.* ---------- */
export class MicroPythonDto {
  @IsString() build!: string;
  @IsString() version!: string;
  @IsString() name!: string;

  @IsOptional()
  @IsArray()
  version_tuple!: (number | string)[];

  @IsOptional()
  mpy?: any;
}

export class SystemWifiDto {
  @IsString() ip!: string;
  @IsInt() port!: number;
  @IsString() mac!: string;
}

export class SoftwareDto {
  @IsString() device_name!: string;
  @IsString() version!: string;
}

export class HardwareCpuDto {
  @IsInt() freq_mhz!: number;
}

export class HardwareDto {
  @IsString() port!: string;
  @ValidateNested()
  @Type(() => HardwareCpuDto)
  cpu!: HardwareCpuDto;
  @IsString() platform!: string;
  @IsString() board!: string;
}

export class SystemDto {
  @ValidateNested()
  @Type(() => MicroPythonDto)
  micropython!: MicroPythonDto;

  @ValidateNested()
  @Type(() => SystemWifiDto)
  wifi!: SystemWifiDto;

  @ValidateNested()
  @Type(() => SoftwareDto)
  software!: SoftwareDto;

  @ValidateNested()
  @Type(() => HardwareDto)
  hardware!: HardwareDto;
}

/* ---------- root DTO ---------- */
export class DeviceResponseDto {
  // LENIENT BY DESIGN (poll path; the announce DTO is the strict one): these
  // two optional fields carry NO type validator so a malformed value (e.g.
  // firmware_version: 123, api_version: 'abc') can never fail response
  // validation, increment failed_calls, or block reading persistence. The
  // declared TS types document the expected shape only. Acceptance is decided
  // by the service predicates in PicoUnitsService.touchAndResetFailedCalls()
  // (isValidPicoFirmwareVersion / integer >= PICO_API_VERSION_MIN); rejected
  // values are ignored and the last accepted stored values are preserved.
  // Unknown keys are dropped by whitelist:true + forbidNonWhitelisted:false.
  @IsOptional()
  firmware_version?: string;

  @IsOptional()
  api_version?: number;

  @ValidateNested()
  @Type(() => DevicesDto)
  devices!: DevicesDto;

  @ValidateNested()
  @Type(() => OutputsDto)
  outputs!: OutputsDto;

  @ValidateNested()
  @Type(() => HealthDto)
  health!: HealthDto;

  @ValidateNested()
  @Type(() => SensorsDto)
  sensors!: SensorsDto;

  @IsBoolean()
  control_loop_enabled!: boolean;

  @ValidateNested()
  @Type(() => SetpointsDto)
  setpoints!: SetpointsDto;

  @ValidateNested()
  @Type(() => SystemDto)
  system!: SystemDto;
}

/* ---------- validation helper ---------- */

/**
 * Validate a plain JS object (e.g. axios response.data) against DeviceResponseDto.
 * Returns: { instance, errors } where `instance` is the typed DTO instance and
 * `errors` is ValidationError[] from class-validator (empty array if ok).
 */
export async function validateDeviceResponse(
  plain: unknown,
): Promise<{ instance?: DeviceResponseDto; errors: ValidationError[] }> {
  const inst = plainToInstance(DeviceResponseDto, plain, {
    enableImplicitConversion: true, // helpful if numeric strings appear
  });
  const errors = await validate(inst, {
    whitelist: true,
    forbidNonWhitelisted: false,
  });
  if (errors.length > 0) return { errors };
  return { instance: inst, errors: [] };
}

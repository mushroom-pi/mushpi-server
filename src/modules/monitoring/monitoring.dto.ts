import { ApiProperty } from '@nestjs/swagger';

import { IsIn, IsOptional, IsString } from 'class-validator';

import { IsAllNoneOrCommaSeparatedEnum } from 'src/common/validators/is-all-none-or-comma-separated-enum.validator';
import {
  databases,
  nodeEnvironments,
  services,
} from 'src/modules/config/config.constants';
import { NodeEnvironments } from 'src/modules/config/config.types';

export class HealthCheckQueryDto {
  @ApiProperty({
    required: false,
    type: String,
    enum: ['true', 'false'],
    description: 'Include or remove server health information',
  })
  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  readonly server?: 'true' | 'false';

  @ApiProperty({
    required: false,
    type: String,
    enum: ['true', 'false'],
    description: 'Include or remove system health information',
  })
  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  readonly system?: 'true' | 'false';

  @ApiProperty({
    required: false,
    type: String,
    enum: ['all', 'none'].concat(databases),
    description: 'Comma-separated list of database names to check',
  })
  @IsOptional()
  @IsString()
  @IsAllNoneOrCommaSeparatedEnum(databases, {})
  readonly databases?: string;

  @ApiProperty({
    required: false,
    type: String,
    enum: ['all', 'none'].concat(services),
    description: 'Comma-separated list of external services names to check',
  })
  @IsOptional()
  @IsString()
  @IsAllNoneOrCommaSeparatedEnum(services, {})
  readonly services?: string;
}

class MemoryUsageDto {
  @ApiProperty({ type: Number, example: 74.57 })
  readonly rss: number;

  @ApiProperty({ type: Number, example: 54.23 })
  readonlyheapTotal: number;

  @ApiProperty({ type: Number, example: 35.67 })
  readonlyheapUsed: number;

  @ApiProperty({ type: Number, example: 1.18 })
  readonly external: number;

  @ApiProperty({ type: Number, example: 0.44 })
  readonly arrayBuffers: number;
}

class UpTime {
  @ApiProperty({
    type: Number,
    description: 'Total time the server has been running in seconds',
  })
  readonly seconds: number;

  @ApiProperty({
    type: Number,
    description: 'Total time the server has been running in minutes',
  })
  readonly minutes: number;

  @ApiProperty({
    type: Number,
    description: 'Total time the server has been running in hours',
  })
  readonly hours: number;

  @ApiProperty({
    type: Number,
    description: 'Total time the server has been running in days',
  })
  readonly days: number;
}

class ServerDto {
  @ApiProperty({ type: Boolean })
  readonly healthy: boolean;

  @ApiProperty({
    type: String,
    enum: nodeEnvironments,
    description:
      'The environment in which this instance of the service is being executed',
  })
  readonly environment: NodeEnvironments;

  @ApiProperty({
    type: [Number],
    example: [0.12, 0.34, 0.56],
    description: "Basic estimation of the system's memory load",
  })
  readonly loadAverage: number[];

  @ApiProperty({ type: MemoryUsageDto })
  readonly memoryUsageInMB: MemoryUsageDto;

  @ApiProperty({ type: UpTime })
  readonly upTime: UpTime;

  @ApiProperty({ type: String, example: 'v14.17.0' })
  readonly nodeVersion: string;

  @ApiProperty({ type: String, example: '1.0.0' })
  readonly appVersion: string;
}

class ServiceMockDto {
  @ApiProperty({
    type: Boolean,
    description:
      'Check if theres a key to stablish communications with the service',
  })
  readonly hasKey: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'Check if the service is reachable',
  })
  readonly available: boolean;

  @ApiProperty({
    type: Number,
    description:
      'If the service is reachable, the time it takes to provide a response',
    required: false,
  })
  readonly responseTimeInMs: number;
}

class ServicesDto {
  @ApiProperty({ type: ServiceMockDto, required: false })
  serviceMock?: ServiceMockDto;
}

class TableSizeDto {
  @ApiProperty({ type: String, example: 'readings' })
  readonly name: string;

  @ApiProperty({ type: Number, nullable: true, example: 0.82 })
  readonly sizeMb: number | null;

  @ApiProperty({ type: Number, required: false, example: 1234 })
  readonly rowCount?: number;
}

class DatabaseSizeDto {
  @ApiProperty({ type: Number, nullable: true, example: 1.24 })
  readonly totalMb: number | null;

  @ApiProperty({ type: Boolean, example: false })
  readonly inMemory: boolean;

  @ApiProperty({ type: String, example: './data/app.sqlite' })
  readonly path: string;

  @ApiProperty({ type: [TableSizeDto] })
  readonly tables: TableSizeDto[];

  @ApiProperty({ type: Number, nullable: true, example: 0.12 })
  readonly overheadMb: number | null;
}

class DatabaseMockDto {
  @ApiProperty({
    type: Boolean,
    description: 'Check that the provided credentials have read privileges',
  })
  read: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'Check that the provided credentials have write privileges',
  })
  write: boolean;

  @ApiProperty({ type: DatabaseSizeDto, required: false })
  readonly size?: DatabaseSizeDto;
}

class DatabasesDto {
  @ApiProperty({ type: DatabaseMockDto })
  'sqlite'?: DatabaseMockDto;
}

class OsInfoDto {
  @ApiProperty({ type: String, example: 'linux' })
  readonly platform: string;

  @ApiProperty({ type: String, example: 'Linux' })
  readonly type: string;

  @ApiProperty({ type: String, example: '5.15.0-v8+' })
  readonly release: string;

  @ApiProperty({ type: String, example: 'raspberrypi' })
  readonly hostname: string;

  @ApiProperty({ type: String, example: 'arm64' })
  readonly arch: string;
}

class CpuInfoDto {
  @ApiProperty({ type: String, example: 'ARM Cortex-A72' })
  readonly model: string;

  @ApiProperty({ type: Number, example: 4 })
  readonly cores: number;
}

class SystemMemoryDto {
  @ApiProperty({ type: Number, example: 8192 })
  readonly totalMb: number;

  @ApiProperty({ type: Number, example: 3456 })
  readonly freeMb: number;
}

class DiskInfoDto {
  @ApiProperty({ type: String, example: '/home/pi/data' })
  readonly path: string;

  @ApiProperty({ type: Number, nullable: true, example: 29440 })
  readonly totalMb: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 21500 })
  readonly freeMb: number | null;
}

class SystemInfoDto {
  @ApiProperty({ type: OsInfoDto })
  readonly os: OsInfoDto;

  @ApiProperty({ type: CpuInfoDto })
  readonly cpu: CpuInfoDto;

  @ApiProperty({ type: SystemMemoryDto })
  readonly memory: SystemMemoryDto;

  @ApiProperty({ type: UpTime })
  readonly upTime: UpTime;

  @ApiProperty({ type: DiskInfoDto })
  readonly disk: DiskInfoDto;
}

export class HealthCheckResponseDto {
  @ApiProperty({ type: ServerDto, required: false })
  server?: ServerDto;

  @ApiProperty({ type: SystemInfoDto, required: false })
  system?: SystemInfoDto;

  @ApiProperty({
    type: DatabasesDto,
    description: 'Check any database that the microservice needs to operate',
  })
  databases?: DatabasesDto;

  @ApiProperty({ type: ServicesDto, required: false })
  services?: ServicesDto;
}

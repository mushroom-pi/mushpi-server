import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  PICO_UNIT_STATUSES,
  PicoUnitStatus,
} from '../../pico-units/pico-unit.type';

// ─── Leaf DTOs ────────────────────────────────────────────────────────────────

export class DashboardLastReadingDto {
  @ApiPropertyOptional({ type: 'number', nullable: true })
  temperature!: number | null;

  @ApiPropertyOptional({ type: 'number', nullable: true })
  humidity!: number | null;

  @ApiProperty({ type: 'string', format: 'date-time' })
  timestamp!: string;
}

export class DashboardActiveBatchDto {
  @ApiProperty({ type: 'integer' })
  id!: number;

  @ApiProperty({ type: 'string' })
  name!: string;

  @ApiProperty({ enum: ['in-progress'] })
  status!: 'in-progress';

  @ApiProperty({ type: 'integer' })
  daysRemaining!: number;
}

export class DashboardWarningReadingDto {
  @ApiProperty({
    type: 'number',
    description:
      'Actual sensor value (temp or humidity depending on warning type)',
  })
  value!: number;

  @ApiProperty({ type: 'number', description: 'Target setpoint value' })
  target!: number;

  @ApiProperty({ type: 'string', format: 'date-time' })
  timestamp!: string;
}

// ─── Unit item ────────────────────────────────────────────────────────────────

export class DashboardUnitItemDto {
  @ApiProperty({ type: 'integer' })
  id!: number;

  @ApiProperty({ type: 'string' })
  handle!: string;

  @ApiPropertyOptional({ type: 'string', nullable: true })
  name!: string | null;

  @ApiProperty({ enum: PICO_UNIT_STATUSES })
  status!: PicoUnitStatus;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  lastSeenSecondsAgo!: number | null;

  @ApiProperty({ type: 'number' })
  uptimeHours!: number;

  @ApiProperty({ type: 'integer' })
  failedCalls!: number;

  @ApiProperty({ type: 'integer' })
  failedReadings!: number;

  @ApiProperty({ type: 'integer' })
  consecutiveEmptyReadings!: number;

  @ApiProperty({ type: 'boolean' })
  controlLoopEnabled!: boolean;

  @ApiPropertyOptional({ type: DashboardLastReadingDto, nullable: true })
  lastReading!: DashboardLastReadingDto | null;

  @ApiPropertyOptional({ type: DashboardActiveBatchDto, nullable: true })
  activeBatch!: DashboardActiveBatchDto | null;
}

// ─── Units section ────────────────────────────────────────────────────────────

export class DashboardUnitsDto {
  @ApiProperty({ type: 'integer' })
  healthy!: number;

  @ApiProperty({ type: 'integer' })
  degraded!: number;

  @ApiProperty({ type: 'integer' })
  offline!: number;

  @ApiProperty({ example: 2 })
  paused!: number;

  @ApiProperty({ type: 'integer' })
  total!: number;

  @ApiProperty({ type: [DashboardUnitItemDto] })
  items!: DashboardUnitItemDto[];
}

// ─── Batches section ──────────────────────────────────────────────────────────

export class DashboardApproachingBatchDto {
  @ApiProperty({ type: 'integer' })
  id!: number;

  @ApiProperty({ type: 'string' })
  name!: string;

  @ApiProperty({ type: 'string' })
  species!: string;

  @ApiProperty({ type: 'integer' })
  daysRemaining!: number;

  @ApiProperty({ type: 'string', format: 'date-time' })
  finishAt!: string;

  @ApiProperty({ type: 'string' })
  picoUnitHandle!: string;
}

export class DashboardFinishedBatchDto {
  @ApiProperty({ type: 'integer' })
  id!: number;

  @ApiProperty({ type: 'string' })
  name!: string;

  @ApiProperty({ type: 'string' })
  species!: string;

  @ApiProperty({ type: 'string', format: 'date-time' })
  finishedAt!: string;

  @ApiProperty({ type: 'string' })
  picoUnitHandle!: string;
}

export class DashboardBatchesDto {
  @ApiProperty({ type: 'integer' })
  active!: number;

  @ApiProperty({ type: 'integer' })
  total!: number;

  @ApiProperty({ type: [DashboardApproachingBatchDto] })
  approachingCompletion!: DashboardApproachingBatchDto[];

  @ApiProperty({ type: [DashboardFinishedBatchDto] })
  recentlyFinished!: DashboardFinishedBatchDto[];
}

// ─── Recipes section ──────────────────────────────────────────────────────────

export class DashboardTopRecipeDto {
  @ApiProperty({ type: 'integer' })
  id!: number;

  @ApiProperty({ type: 'string' })
  name!: string;

  @ApiProperty({ type: 'string' })
  species!: string;

  @ApiProperty({ type: 'integer' })
  batchCount!: number;
}

export class DashboardRecipesDto {
  @ApiProperty({ type: 'integer' })
  total!: number;

  @ApiProperty({ type: [DashboardTopRecipeDto] })
  mostUsed!: DashboardTopRecipeDto[];

  @ApiProperty({ type: 'integer' })
  topCount!: number;
}

// ─── Stats section ────────────────────────────────────────────────────────────

export class DashboardStatsDto {
  @ApiProperty({ type: 'integer' })
  totalReadings!: number;

  @ApiProperty({ type: 'integer' })
  totalBatches!: number;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  oldestActiveBatchDays!: number | null;
}

// ─── Warnings ─────────────────────────────────────────────────────────────────

export class DashboardWarningDto {
  @ApiProperty({
    enum: [
      'temp_deviation',
      'humidity_deviation',
      'unit_degraded',
      'unit_offline',
      'empty_readings',
    ],
  })
  type!: string;

  @ApiProperty({ enum: ['warning', 'error'] })
  severity!: 'warning' | 'error';

  @ApiProperty({ type: 'integer' })
  unitId!: number;

  @ApiProperty({ type: 'string' })
  handle!: string;

  @ApiProperty({ type: 'string' })
  message!: string;

  @ApiPropertyOptional({ type: DashboardWarningReadingDto })
  reading?: DashboardWarningReadingDto;

  @ApiPropertyOptional({ type: 'integer' })
  failedCalls?: number;

  @ApiPropertyOptional({ type: 'integer' })
  failedReadings?: number;

  @ApiPropertyOptional({ type: 'integer' })
  consecutiveEmptyReadings?: number;
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export class DashboardSummaryDto {
  @ApiProperty({ type: DashboardUnitsDto })
  units!: DashboardUnitsDto;

  @ApiProperty({ type: DashboardBatchesDto })
  batches!: DashboardBatchesDto;

  @ApiProperty({ type: DashboardRecipesDto })
  recipes!: DashboardRecipesDto;

  @ApiProperty({ type: DashboardStatsDto })
  stats!: DashboardStatsDto;

  @ApiProperty({ type: [DashboardWarningDto] })
  warnings!: DashboardWarningDto[];
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Between, IsNull, LessThan, MoreThan, Repository } from 'typeorm';

import { Batch } from 'src/modules/batches/batches.entity';
import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';
import { Readings } from 'src/modules/readings/readings.entity';
import { Recipe } from 'src/modules/recipes/recipes.entity';

import {
  APPROACHING_COMPLETION_DAYS,
  DASHBOARD_TOP_RECIPES_LIMIT,
  EMPTY_READINGS_THRESHOLD,
  HUMIDITY_DEVIATION,
  RECENTLY_FINISHED_HOURS,
  RECENTLY_FINISHED_LIMIT,
  TEMP_DEVIATION_C,
  UNIT_DEGRADED_FAILED_READINGS,
  UNIT_OFFLINE_FAILED_CALLS,
  UNIT_OFFLINE_THRESHOLD_SECONDS,
} from './dashboard.constant';
import {
  DashboardApproachingBatchDto,
  DashboardBatchesDto,
  DashboardFinishedBatchDto,
  DashboardRecipesDto,
  DashboardStatsDto,
  DashboardSummaryDto,
  DashboardTopRecipeDto,
  DashboardUnitItemDto,
  DashboardUnitsDto,
  DashboardWarningDto,
} from './dto/dashboard-summary.dto';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectRepository(PicoUnit) private readonly picoRepo: Repository<PicoUnit>,
    @InjectRepository(Batch) private readonly batchRepo: Repository<Batch>,
    @InjectRepository(Recipe) private readonly recipeRepo: Repository<Recipe>,
    @InjectRepository(Readings)
    private readonly readingsRepo: Repository<Readings>,
  ) {}

  async getSummary(): Promise<DashboardSummaryDto> {
    const now = new Date();
    const fortyEightHoursAgo = new Date(
      now.getTime() - RECENTLY_FINISHED_HOURS * 3600 * 1000,
    );

    // 1. Run independent queries in Promise.all
    const [
      allUnits,
      totalBatches,
      totalReadings,
      totalRecipes,
      activeBatches,
      recentlyFinished,
      mostUsedRecipesRaw,
    ] = await Promise.all([
      this.picoRepo.find({ where: { enabled: true } }),
      this.batchRepo.count(),
      this.readingsRepo.count(),
      this.recipeRepo.count(),
      this.batchRepo.find({
        where: [
          { start_at: LessThan(now), finish_at: IsNull() },
          { start_at: LessThan(now), finish_at: MoreThan(now) },
        ],
        relations: ['pico_unit'],
      }),
      this.batchRepo.find({
        where: { finish_at: Between(fortyEightHoursAgo, now) },
        order: { finish_at: 'DESC' },
        take: RECENTLY_FINISHED_LIMIT,
        relations: ['pico_unit'],
      }),
      this.recipeRepo
        .createQueryBuilder('recipe')
        .select(['recipe.id', 'recipe.name', 'recipe.species'])
        .addSelect('COUNT(batch.id)', 'batchCount')
        .leftJoin('recipe.batches', 'batch')
        .groupBy('recipe.id')
        .orderBy('"batchCount"', 'DESC')
        .limit(DASHBOARD_TOP_RECIPES_LIMIT)
        .getRawMany(),
    ]);

    // 2. Latest readings — single query using MAX(id) GROUP BY (id is monotonic with ts)
    const unitIds = allUnits.map((u) => u.id);
    const latestReadingsMap = new Map<number, Readings>();

    if (unitIds.length > 0) {
      const latestReadings = await this.readingsRepo
        .createQueryBuilder('r')
        .where(
          'r.id IN (SELECT MAX(r2.id) FROM readings r2 WHERE r2.pico_unit_id IN (:...ids) GROUP BY r2.pico_unit_id)',
          { ids: unitIds },
        )
        .getMany();

      for (const r of latestReadings) {
        latestReadingsMap.set(r.pico_unit_id, r);
      }
    }

    // 3. Active batches by unit — from the already-fetched activeBatches
    const activeBatchByUnit = new Map<number, Batch>();
    for (const b of activeBatches) {
      const existing = activeBatchByUnit.get(b.pico_unit_id);
      if (!existing || b.start_at > existing.start_at) {
        activeBatchByUnit.set(b.pico_unit_id, b);
      }
    }

    // 4. Build unit items
    const unitItems: DashboardUnitItemDto[] = [];
    let healthyCount = 0;
    let degradedCount = 0;
    let offlineCount = 0;

    for (const unit of allUnits) {
      const lastReading = latestReadingsMap.get(unit.id) ?? null;
      const lastSeenSecondsAgo = unit.last_seen
        ? Math.floor((now.getTime() - unit.last_seen.getTime()) / 1000)
        : null;
      const online =
        lastSeenSecondsAgo != null &&
        lastSeenSecondsAgo <= UNIT_OFFLINE_THRESHOLD_SECONDS;
      const degraded =
        online &&
        ((unit.failed_readings ?? 0) > 0 ||
          (unit.consecutive_empty_readings ?? 0) > 0);
      const healthy = online && !degraded;

      if (healthy) healthyCount++;
      else if (degraded) degradedCount++;
      else offlineCount++;

      const activeBatch = activeBatchByUnit.get(unit.id);
      const daysRemaining = activeBatch?.finish_at
        ? Math.ceil(
            (activeBatch.finish_at.getTime() - now.getTime()) / 86400000,
          )
        : 0;

      unitItems.push({
        id: unit.id,
        handle: unit.handle,
        name: unit.name ?? null,
        status: healthy ? 'healthy' : degraded ? 'degraded' : 'offline',
        lastSeenSecondsAgo,
        uptimeHours: lastReading?.board_uptime_s
          ? Math.round((lastReading.board_uptime_s / 3600) * 100) / 100
          : 0,
        failedCalls: unit.failed_calls ?? 0,
        failedReadings: unit.failed_readings ?? 0,
        consecutiveEmptyReadings: unit.consecutive_empty_readings ?? 0,
        controlLoopEnabled: lastReading?.control_loop_enabled ?? false,
        lastReading: lastReading
          ? {
              temperature: lastReading.temperature ?? null,
              humidity: lastReading.humidity ?? null,
              timestamp: lastReading.ts.toISOString(),
            }
          : null,
        activeBatch: activeBatch
          ? {
              id: activeBatch.id,
              name:
                activeBatch.description ??
                activeBatch.species ??
                `Batch #${activeBatch.id}`,
              status: 'in-progress' as const,
              daysRemaining,
            }
          : null,
      });
    }

    // 5. Build batches section
    const approachingCompletion: DashboardApproachingBatchDto[] = [];
    for (const b of activeBatches) {
      if (b.finish_at) {
        const daysRemaining = Math.ceil(
          (b.finish_at.getTime() - now.getTime()) / 86400000,
        );
        if (
          daysRemaining <= APPROACHING_COMPLETION_DAYS &&
          daysRemaining >= 0
        ) {
          approachingCompletion.push({
            id: b.id,
            name: b.description ?? b.species ?? `Batch #${b.id}`,
            species: b.species ?? '',
            daysRemaining,
            finishAt: b.finish_at.toISOString(),
            picoUnitHandle: b.pico_unit?.handle ?? '',
          });
        }
      }
    }

    const recentlyFinishedItems: DashboardFinishedBatchDto[] =
      recentlyFinished.map((b) => ({
        id: b.id,
        name: b.description ?? b.species ?? `Batch #${b.id}`,
        species: b.species ?? '',
        finishedAt: b.finish_at!.toISOString(),
        picoUnitHandle: b.pico_unit?.handle ?? '',
      }));

    // 6. Build recipes section
    const mostUsed: DashboardTopRecipeDto[] = (
      mostUsedRecipesRaw as Array<Record<string, unknown>>
    ).map((r) => ({
      id: Number(r['recipe_id'] ?? r['id']),
      name: String(r['recipe_name'] ?? r['name'] ?? ''),
      species: String(r['recipe_species'] ?? r['species'] ?? ''),
      batchCount: Number(r['batchCount']),
    }));

    // 7. Build stats section
    const oldestStart =
      activeBatches.length > 0
        ? activeBatches.reduce(
            (min, b) => (b.start_at < min ? b.start_at : min),
            activeBatches[0].start_at,
          )
        : null;
    const oldestActiveBatchDays = oldestStart
      ? Math.floor((now.getTime() - oldestStart.getTime()) / 86400000)
      : null;

    // 8. Build warnings
    const warnings: DashboardWarningDto[] = [];
    for (const item of unitItems) {
      const lastReading = latestReadingsMap.get(item.id);

      if (item.failedCalls >= UNIT_OFFLINE_FAILED_CALLS) {
        warnings.push({
          type: 'unit_offline',
          severity: 'error',
          unitId: item.id,
          handle: item.handle,
          message: `Unit ${item.handle} unreachable for ${item.failedCalls} minutes`,
          failedCalls: item.failedCalls,
        });
      }

      if (item.failedReadings >= UNIT_DEGRADED_FAILED_READINGS) {
        warnings.push({
          type: 'unit_degraded',
          severity: 'warning',
          unitId: item.id,
          handle: item.handle,
          message: `${item.failedReadings} consecutive out-of-range sensor readings — check DHT11`,
          failedReadings: item.failedReadings,
        });
      }

      if (item.consecutiveEmptyReadings >= EMPTY_READINGS_THRESHOLD) {
        warnings.push({
          type: 'empty_readings',
          severity: 'warning',
          unitId: item.id,
          handle: item.handle,
          message: `Sensor returning empty readings for ${item.consecutiveEmptyReadings} minutes — check DHT11 wiring`,
          consecutiveEmptyReadings: item.consecutiveEmptyReadings,
        });
      }

      if (lastReading && lastReading.control_loop_enabled) {
        if (
          lastReading.temperature != null &&
          lastReading.temperature_set != null &&
          Math.abs(lastReading.temperature - lastReading.temperature_set) >
            TEMP_DEVIATION_C
        ) {
          warnings.push({
            type: 'temp_deviation',
            severity: 'warning',
            unitId: item.id,
            handle: item.handle,
            message: `Temperature ${lastReading.temperature}°C is ${Math.abs(lastReading.temperature - lastReading.temperature_set)}°C ${lastReading.temperature > lastReading.temperature_set ? 'above' : 'below'} target ${lastReading.temperature_set}°C`,
            reading: {
              value: lastReading.temperature,
              target: lastReading.temperature_set,
              timestamp: lastReading.ts.toISOString(),
            },
          });
        }

        if (
          lastReading.humidity != null &&
          lastReading.humidity_set != null &&
          Math.abs(lastReading.humidity - lastReading.humidity_set) >
            HUMIDITY_DEVIATION
        ) {
          warnings.push({
            type: 'humidity_deviation',
            severity: 'warning',
            unitId: item.id,
            handle: item.handle,
            message: `Humidity ${lastReading.humidity}% is ${Math.abs(lastReading.humidity - lastReading.humidity_set)}% ${lastReading.humidity > lastReading.humidity_set ? 'above' : 'below'} target ${lastReading.humidity_set}%`,
            reading: {
              value: lastReading.humidity,
              target: lastReading.humidity_set,
              timestamp: lastReading.ts.toISOString(),
            },
          });
        }
      }
    }

    // 9. Assemble and return
    const units: DashboardUnitsDto = {
      healthy: healthyCount,
      degraded: degradedCount,
      offline: offlineCount,
      total: allUnits.length,
      items: unitItems,
    };

    const batches: DashboardBatchesDto = {
      active: activeBatches.length,
      total: totalBatches,
      approachingCompletion,
      recentlyFinished: recentlyFinishedItems,
    };

    const recipes: DashboardRecipesDto = {
      total: totalRecipes,
      mostUsed,
      topCount: DASHBOARD_TOP_RECIPES_LIMIT,
    };

    const stats: DashboardStatsDto = {
      totalReadings,
      totalBatches,
      oldestActiveBatchDays,
    };

    return { units, batches, recipes, stats, warnings };
  }
}

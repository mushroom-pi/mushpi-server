import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { Batch } from 'src/modules/batches/batches.entity';
import { CustomConfigService } from 'src/modules/config/config.service';
import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';
import { OFFLINE_FAILED_CALLS_THRESHOLD } from 'src/modules/pico-units/pico-units.constant';
import { Readings } from 'src/modules/readings/readings.entity';
import { Recipe } from 'src/modules/recipes/recipes.entity';

import {
  composeAttributionNote,
  recipePassesProvenance,
} from './provenance/provenance.check';
import {
  computeSeedEndTs,
  findActiveBatchForUnit,
  generateAndInsertReadings,
  seededReadingCount,
} from './readings-history.generator';
import {
  composeHarvestImageAttribution,
  harvestImageForSpecies,
} from './seed-data/batch-images';
import { SEED_BATCHES } from './seed-data/batches';
import { SEED_RECIPES } from './seed-data/recipes';
import { SEED_UNITS } from './seed-data/units';
import {
  FINISHED,
  IN_PROGRESS,
  PLANNED,
  SEED_READINGS_CADENCE_MS,
  TOTAL_BATCHES,
} from './seed.constant';
import { BatchSeedEntry, RecipeSeedEntry, UnitSeedEntry } from './seed.types';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Default offline age for `tent-six` — a plausible "seen yesterday" gap. */
const OFFLINE_LAST_SEEN_AGO_MS = 26 * 60 * 60 * 1000;

/**
 * Server-owned demo seeding: the recipe catalogue, the simulated unit
 * roster (including one offline unit), backdated batch history and 60 s
 * readings series — replacing the mock's seeding role. Gated on
 * `config.seed.enabled` (schema default: on in `demo`, off elsewhere),
 * hard-refused on `NODE_ENV=prod` regardless of the flag (warn + return,
 * never throw), and strictly **insert-only**: an existing row's
 * user-visible content is never rewritten or deleted beyond the upsert of
 * its own seeded entry.
 *
 * Phases run in dependency order — recipes → units → batches → readings —
 * each idempotent independently:
 * - recipes: upsert by unique `name`, skip when present;
 * - units: upsert by unique `handle`, skip when present;
 * - batches: skip the whole phase when the batch table already has rows
 *   (writing directly through the repository, NOT `BatchesService.create`
 *   — that would fire a synchronous `BATCH_EVENTS.STARTED` at unreachable
 *   units and trip the active-batch conflict check);
 * - readings: per-unit watermark guard at the frozen `seedEndTs` boundary
 *   (never a total row-count guard — that would truncate the series).
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly config: CustomConfigService,
    @InjectRepository(Recipe) private readonly recipeRepo: Repository<Recipe>,
    @InjectRepository(PicoUnit) private readonly unitRepo: Repository<PicoUnit>,
    @InjectRepository(Batch) private readonly batchRepo: Repository<Batch>,
    @InjectRepository(Readings)
    private readonly readingsRepo: Repository<Readings>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.seed.enabled) {
      this.logger.debug('Demo seeding disabled — skipping');
      return;
    }
    // Hard rule, single-sourced here (not in the getter or schema): a
    // production boot refuses seeding regardless of SEED_ENABLED. Warn,
    // touch nothing, never throw — seeding must not block or alter prod.
    if (this.config.isProd) {
      this.logger.warn(
        'SEED_ENABLED is set but IGNORED on NODE_ENV=prod — demo seeding is refused and the database is untouched',
      );
      return;
    }
    // Boot survival: seeding must never prevent the server from booting —
    // mirror of the cron startup-sweep catch pattern.
    try {
      await this.runSeed();
    } catch (error) {
      this.logger.error(
        `Demo seeding failed: ${error?.message ?? String(error)}`,
      );
    }
  }

  private async runSeed(): Promise<void> {
    // Frozen once at seed start; live rows are exactly those with ts > it.
    const seedEndTs = computeSeedEndTs();
    this.logger.log(
      `Demo seeding start — boundary ${seedEndTs.toISOString()}, history ${this.config.seed.readingsDays} day(s)`,
    );

    const recipes = await this.seedRecipes();
    const units = await this.seedUnits(seedEndTs);
    await this.seedBatches();
    const readings = await this.seedReadings(seedEndTs, units);

    this.logger.log(
      `Demo seeding complete — recipes +${recipes}, units +${units.length}, batches ${await this.batchRepo.count()}, readings +${readings}`,
    );
  }

  /** Recipes that pass the provenance gate; excluded ones are named in the report. */
  private seedableRecipes(): RecipeSeedEntry[] {
    return SEED_RECIPES.filter((entry) => recipePassesProvenance(entry));
  }

  private async seedRecipes(): Promise<number> {
    let inserted = 0;
    for (const entry of this.seedableRecipes()) {
      const existing = await this.recipeRepo.findOne({
        where: { name: entry.name },
      });
      if (existing) continue;
      await this.recipeRepo.save(
        this.recipeRepo.create({
          name: entry.name,
          species: entry.species,
          temperature_target: entry.temperatureTarget,
          humidity_target: entry.humidityTarget,
          duration_days: entry.durationDays,
          notes: `${entry.notes}${composeAttributionNote(entry)}`,
          // External Wikimedia hotlink — the column already supports URLs
          // and the CSP allows https:; nothing is bundled or downloaded.
          image: entry.provenance.image?.sourceUrl ?? null,
        }),
      );
      inserted++;
    }
    return inserted;
  }

  /**
   * Insert-or-fetch the unit roster (upsert by `handle`). Live units are
   * healthy with `last_seen` at the frozen boundary; the offline unit
   * carries `failed_calls` at the threshold and an aged `last_seen`, so
   * the existing status derivation renders it `offline` immediately.
   */
  private async seedUnits(seedEndTs: Date): Promise<PicoUnit[]> {
    const out: PicoUnit[] = [];
    for (const entry of SEED_UNITS) {
      let unit = await this.unitRepo.findOne({
        where: { handle: entry.handle },
      });
      if (!unit) {
        unit = await this.unitRepo.save(
          this.unitRepo.create({
            ...this.unitSeedFields(entry),
            handle: entry.handle,
            last_seen: entry.offline
              ? new Date(seedEndTs.getTime() - OFFLINE_LAST_SEEN_AGO_MS)
              : new Date(seedEndTs.getTime()),
            failed_calls: entry.offline ? OFFLINE_FAILED_CALLS_THRESHOLD : 0,
          }),
        );
      }
      out.push(unit);
    }
    return out;
  }

  /** Columns common to create and (future) refresh of a roster unit. */
  private unitSeedFields(entry: UnitSeedEntry): Partial<PicoUnit> {
    return {
      name: entry.name,
      description: entry.description,
      face_color: entry.face_color ?? null,
      mac: entry.mac ?? null,
      ip: entry.ip ?? null,
      port: 5000,
      monitored: true,
      micropython_version: entry.micropython_version ?? null,
      firmware_version: entry.firmware_version ?? null,
      api_version: entry.api_version ?? null,
      board: entry.board ?? null,
      board_total_mem_byte: entry.board_total_mem_byte ?? null,
      board_total_fs_byte: entry.board_total_fs_byte ?? null,
      board_cpu_freq_mhz: entry.board_cpu_freq_mhz ?? null,
      failed_readings: 0,
      consecutive_empty_readings: 0,
    };
  }

  /**
   * Directly through the repository — `BatchesService.create` is
   * deliberately bypassed (event fan-out + active-batch conflict). The
   * whole phase no-ops when any batch row already exists.
   */
  private async seedBatches(): Promise<void> {
    if ((await this.batchRepo.count()) > 0) {
      this.logger.debug('Batch table populated — skipping batch seed');
      return;
    }
    // Per-status roster assertion against the catalogue constants.
    const counts: Record<string, number> = {
      finished: 0,
      'in-progress': 0,
      planned: 0,
    };
    for (const entry of SEED_BATCHES) counts[entry.status]++;
    if (
      SEED_BATCHES.length !== TOTAL_BATCHES ||
      counts.finished !== FINISHED ||
      counts['in-progress'] !== IN_PROGRESS ||
      counts.planned !== PLANNED
    ) {
      this.logger.warn(
        `Demo batch roster drifted: ${SEED_BATCHES.length} entries (${counts.finished}/${counts['in-progress']}/${counts.planned}), expected ${TOTAL_BATCHES} (${FINISHED}/${IN_PROGRESS}/${PLANNED})`,
      );
    }

    for (const entry of SEED_BATCHES) {
      const recipe = await this.recipeRepo.findOne({
        where: { name: entry.recipeName },
      });
      const unit = await this.unitRepo.findOne({
        where: { handle: entry.unitHandle },
      });
      if (!recipe || !unit) {
        this.logger.warn(
          `Skipping demo batch "${entry.description}" — missing recipe "${entry.recipeName}" or unit "${entry.unitHandle}"`,
        );
        continue;
      }
      const { start_at, finish_at } = this.batchWindow(entry, recipe);
      await this.batchRepo.save(
        this.batchRepo.create({
          start_at,
          finish_at,
          // Snapshot copied from the linked recipe (immutable-FK template).
          species: recipe.species,
          temperature_target: recipe.temperature_target,
          humidity_target: recipe.humidity_target,
          notes: this.batchNotes(recipe.species),
          description: entry.description,
          // External harvest-photo URLs from the committed dataset —
          // the upload endpoint's files-only rule does not bind this
          // direct-repository write (asymmetry documented in REFERENCE.md).
          images: entry.images ?? null,
          pico_unit_id: unit.id,
          recipe_id: recipe.id,
        }),
      );
    }
  }

  /** Relative offsets → absolute dates. Statuses derive from these. */
  private batchWindow(
    entry: BatchSeedEntry,
    recipe: Recipe,
  ): { start_at: Date; finish_at: Date | null } {
    const now = Date.now();
    const durationMs = (recipe.duration_days || 1) * DAY_MS;

    if (entry.status === 'finished') {
      // finish = now + k (k negative); start derived from recipe duration.
      const finish = new Date(now + (entry.finishOffsetDays ?? -1) * DAY_MS);
      return {
        start_at: new Date(finish.getTime() - durationMs),
        finish_at: finish,
      };
    }
    if (entry.status === 'planned') {
      const start = new Date(now + (entry.startOffsetDays ?? 7) * DAY_MS);
      return {
        start_at: start,
        finish_at: new Date(start.getTime() + durationMs),
      };
    }
    // in-progress: start negative, finish positive or null (open-ended).
    const start = new Date(now + (entry.startOffsetDays ?? -5) * DAY_MS);
    const finish =
      entry.finishOffsetDays == null
        ? null
        : new Date(now + entry.finishOffsetDays * DAY_MS);
    return { start_at: start, finish_at: finish };
  }

  /**
   * Batch notes: the seeded base line plus the one-line image attribution
   * the dataset dictates (`Batch` has no per-image licence column). Never
   * duplicated: an already-present `Image:` line is left as is.
   */
  private batchNotes(species: string | null): string {
    const base = 'Seeded for the demonstration catalogue.';
    const img = harvestImageForSpecies(species);
    if (!img) return base;
    const line = composeHarvestImageAttribution(img);
    return base.includes('\nImage: ') ? base : `${base}${line}`;
  }

  /**
   * Backdate readings for every unit in the seeded roster that is not the
   * offline one. Per-unit watermark guard: skip only when rows already
   * exist at or below the frozen boundary (never a total count — live rows
   * above the boundary must not block the seeded series).
   */
  private async seedReadings(
    seedEndTs: Date,
    seededUnits: PicoUnit[],
  ): Promise<number> {
    const offlineHandles = new Set(
      SEED_UNITS.filter((u) => u.offline).map((u) => u.handle),
    );
    const days = this.config.seed.readingsDays;
    const rowCount = Math.round((days * DAY_MS) / SEED_READINGS_CADENCE_MS);
    let inserted = 0;

    for (const unit of seededUnits) {
      if (offlineHandles.has(unit.handle)) continue;

      if (
        (await seededReadingCount(this.readingsRepo, unit.id, seedEndTs)) > 0
      ) {
        continue;
      }

      const entry = SEED_UNITS.find((u) => u.handle === unit.handle);
      const active = await findActiveBatchForUnit(
        this.batchRepo,
        unit.id,
        new Date(),
      );
      const temperatureSet =
        active?.temperature_target ??
        entry?.fallbackSetpoint?.temperature ??
        22;
      const humiditySet =
        active?.humidity_target ?? entry?.fallbackSetpoint?.humidity ?? 85;

      const startTs = new Date(
        seedEndTs.getTime() - (rowCount - 1) * SEED_READINGS_CADENCE_MS,
      );
      inserted += await generateAndInsertReadings(this.readingsRepo, {
        picoUnitId: unit.id,
        startTs,
        endTs: seedEndTs,
        temperatureSet,
        humiditySet,
        drift: entry?.drift,
      });
    }
    return inserted;
  }
}

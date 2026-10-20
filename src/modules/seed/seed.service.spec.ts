import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { DESCRIPTION_MAX_LENGTH } from 'src/common/constants/validation.constants';
import { Batch } from 'src/modules/batches/batches.entity';
import { CustomConfigService } from 'src/modules/config/config.service';
import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';
import { OFFLINE_FAILED_CALLS_THRESHOLD } from 'src/modules/pico-units/pico-units.constant';
import { Readings } from 'src/modules/readings/readings.entity';
import { Recipe } from 'src/modules/recipes/recipes.entity';

import harvestDataset from './provenance/batch-harvest-images.json';
import { HARVEST_IMAGE_MISSING_SPECIES } from './seed-data/batch-images';
import { SEED_BATCHES } from './seed-data/batches';
import { SEED_INSERT_CHUNK, SEED_READINGS_CADENCE_MS } from './seed.constant';
import { SeedService } from './seed.service';

/**
 * Unit-level coverage of the seeder's gates and idempotency decisions with
 * in-memory repository fakes. The walk itself is exercised against a real
 * DB in `test/seed.e2e-spec.ts`; here we pin the skip rules, roster
 * shapes, provenance exclusion, the watermark guard, the started-batch
 * grid extension, and boot survival.
 */
const DAYS = 2;
const GRID_PER_UNIT = DAYS * 1440;
const DAY_MS = 24 * 60 * 60 * 1000;

describe('SeedService', () => {
  let service: SeedService;
  let config: {
    seed: { enabled: boolean; readingsDays: number };
    isProd: boolean;
  };

  // In-memory "database" fakes.
  const savedRecipes = new Map<string, any>();
  const savedUnits = new Map<string, any>();
  const savedBatches: any[] = [];
  let recipeSaves: any[];
  let unitSaves: any[];
  let batchSaves: any[];
  let insertCalls: [any[]][];
  let countCalls: any[];
  let rejectUnitSave: boolean;
  /**
   * Coverage finder stand-in: when set, `findEarliestStartedBatchStart`
   * resolves this start (the fake keys off the query shape — the
   * active-batch finder passes an array `where`, the coverage finder an
   * object). Null (default) = no started batch visible, so the grid stays
   * at the configured `DAYS` window.
   */
  let coverageStart: Date | null;
  let idSeq = 1;

  jest.spyOn(Logger.prototype, 'log').mockImplementation();
  jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  jest.spyOn(Logger.prototype, 'error').mockImplementation();

  const makeRepo = () => ({
    create: jest.fn((x: any) => ({ ...x })),
    save: jest.fn(async (x: any) => ({ ...x, id: idSeq++ })),
    insert: jest.fn(async (_rows: any) => ({ identifiers: [] })),
    count: jest.fn(async (_q: any) => 0),
    findOne: jest.fn(async (_q: any) => null),
    find: jest.fn(async (_q: any) => []),
  });
  let recipeRepo: ReturnType<typeof makeRepo>;
  let unitRepo: ReturnType<typeof makeRepo>;
  let batchRepo: ReturnType<typeof makeRepo>;
  let readingsRepo: ReturnType<typeof makeRepo>;

  /** Faithful fake: existence check and lookup read the same store. */
  const wireRecipeRepo = () => {
    recipeRepo.findOne.mockImplementation(async ({ where }: any) =>
      Promise.resolve(
        where?.name ? (savedRecipes.get(where.name) ?? null) : null,
      ),
    );
    recipeRepo.save.mockImplementation(async (x: any) => {
      const row = { ...x, id: idSeq++ };
      savedRecipes.set(row.name, row);
      recipeSaves.push(row);
      return row;
    });
  };

  const wireUnitRepo = () => {
    unitRepo.findOne.mockImplementation(async ({ where }: any) =>
      Promise.resolve(
        where?.handle ? (savedUnits.get(where.handle) ?? null) : null,
      ),
    );
    unitRepo.save.mockImplementation(async (x: any) => {
      if (rejectUnitSave) throw new Error('db exploded');
      const row = { ...x, id: idSeq++ };
      savedUnits.set(row.handle, row);
      unitSaves.push(row);
      return row;
    });
  };

  const wireBatchRepo = () => {
    batchRepo.save.mockImplementation(async (x: any) => {
      const row = { ...x, id: idSeq++ };
      savedBatches.push(row);
      batchSaves.push(row);
      return row;
    });
    batchRepo.count.mockImplementation(async () => savedBatches.length);
    // findOne backs two lookups of different shape: the active-batch finder
    // passes an array `where` (unresolved at this level — the readings walk
    // uses roster fallbacks; the e2e covers DB-resolved setpoints), the
    // started-batch coverage finder an object `where`, resolved from
    // `coverageStart`.
    batchRepo.findOne.mockImplementation(async (query: any) => {
      const where = query?.where;
      if (Array.isArray(where)) return null;
      return coverageStart ? { start_at: coverageStart } : null;
    });
  };

  const wireReadingsRepo = () => {
    readingsRepo.insert.mockImplementation(async (rows: any[]) => {
      insertCalls.push([rows]);
      return { identifiers: [] };
    });
    readingsRepo.count.mockImplementation(async (query: any) => {
      countCalls.push(query);
      return 0;
    });
  };

  beforeEach(async () => {
    // Reset spy call logs (implementations survive clearAllMocks) so
    // toHaveBeenCalledWith assertions are per-test.
    jest.clearAllMocks();
    idSeq = 1;
    savedRecipes.clear();
    savedUnits.clear();
    savedBatches.length = 0;
    recipeSaves = [];
    unitSaves = [];
    batchSaves = [];
    insertCalls = [];
    countCalls = [];
    rejectUnitSave = false;
    coverageStart = null;
    config = { seed: { enabled: true, readingsDays: DAYS }, isProd: false };

    recipeRepo = makeRepo();
    unitRepo = makeRepo();
    batchRepo = makeRepo();
    readingsRepo = makeRepo();
    wireRecipeRepo();
    wireUnitRepo();
    wireBatchRepo();
    wireReadingsRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeedService,
        { provide: getRepositoryToken(Recipe), useValue: recipeRepo },
        { provide: getRepositoryToken(PicoUnit), useValue: unitRepo },
        { provide: getRepositoryToken(Batch), useValue: batchRepo },
        { provide: getRepositoryToken(Readings), useValue: readingsRepo },
        { provide: CustomConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(SeedService);
  });

  const insertedRows = () => insertCalls.flatMap(([rows]) => rows);

  it('does nothing when seeding is disabled', async () => {
    config.seed.enabled = false;
    await service.onApplicationBootstrap();
    expect(recipeSaves).toHaveLength(0);
    expect(unitSaves).toHaveLength(0);
    expect(batchSaves).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
  });

  it('hard-refuses seeding on prod even when SEED_ENABLED is set — warns, touches nothing', async () => {
    config.isProd = true; // SEED_ENABLED stays true (schema passthrough)
    await service.onApplicationBootstrap();
    expect(recipeSaves).toHaveLength(0);
    expect(unitSaves).toHaveLength(0);
    expect(batchSaves).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.stringContaining('SEED_ENABLED'),
    );
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.stringContaining('IGNORED on NODE_ENV=prod'),
    );
  });

  it('seeds nothing on a prod boot without the flag and stays silent (no ignore-warning)', async () => {
    config.isProd = true;
    config.seed.enabled = false;
    await service.onApplicationBootstrap();
    expect(recipeSaves).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
    expect(Logger.prototype.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('IGNORED on NODE_ENV=prod'),
    );
  });

  it('seeds on a development boot with SEED_ENABLED explicitly true (non-demo, non-prod)', async () => {
    // config default: enabled=true, isProd=false — the explicit-flag dev case.
    await service.onApplicationBootstrap();
    expect(recipeSaves).toHaveLength(14);
    expect(unitSaves).toHaveLength(6);
  });

  it('seeds only the 14 provenance-passing recipes with attribution and external images', async () => {
    await service.onApplicationBootstrap();
    expect(recipeSaves).toHaveLength(14);
    const names = recipeSaves.map((r) => r.name);
    expect(names).not.toContain('Black Poplar on Straw');
    expect(names).not.toContain('Nameko in Bottles');
    const oyster = recipeSaves.find((r) => r.name === 'Grey Oyster on Straw');
    expect(oyster.notes).toContain('\n\nSource: ');
    expect(oyster.notes).toMatch(
      /Source: .+ — .+ \(accessed 2026-10-19, unknown\)$/,
    );
    expect(oyster.image).toMatch(/^https:\/\/upload\.wikimedia\.org/);
  });

  it('skips a recipe that already exists by name (idempotent upsert)', async () => {
    savedRecipes.set('Enoki in Bottles', {
      id: 999,
      name: 'Enoki in Bottles',
      species: 'Flammulina filiformis',
      temperature_target: 15,
      humidity_target: 90,
      duration_days: 10,
    });
    await service.onApplicationBootstrap();
    const names = recipeSaves.map((r) => r.name);
    expect(names).toHaveLength(13);
    expect(names).not.toContain('Enoki in Bottles');
  });

  it('creates the 6-unit roster: live units healthy at the boundary, tent-six offline', async () => {
    await service.onApplicationBootstrap();
    expect(unitSaves).toHaveLength(6);
    const six = unitSaves.find((u) => u.handle === 'tent-six');
    expect(six.monitored).toBe(true);
    expect(six.failed_calls).toBe(OFFLINE_FAILED_CALLS_THRESHOLD);
    expect(Date.now() - six.last_seen.getTime()).toBeGreaterThan(
      24 * 60 * 60 * 1000,
    );
    for (const u of unitSaves.filter((x) => x.handle !== 'tent-six')) {
      expect(u.failed_calls).toBe(0);
      expect(u.description).toContain('Simulated demo unit');
      expect(u.last_seen.getTime() % 60_000).toBe(0); // frozen boundary
      expect(u.last_seen.getTime()).toBeLessThanOrEqual(Date.now() - 59_000);
    }
  });

  it('writes 17 batches through the repository — recipe snapshots for linked entries, null FK for hand-authored ones', async () => {
    await service.onApplicationBootstrap();
    expect(batchSaves).toHaveLength(17);
    const now = Date.now();
    expect(
      batchSaves.filter((b) => b.finish_at && b.finish_at.getTime() < now),
    ).toHaveLength(10);
    expect(batchSaves.filter((b) => b.start_at.getTime() > now)).toHaveLength(
      3,
    );
    expect(
      batchSaves.filter(
        (b) =>
          b.start_at.getTime() <= now &&
          b.finish_at &&
          b.finish_at.getTime() > now,
      ),
    ).toHaveLength(4);
    expect(batchSaves.filter((b) => b.recipe_id != null)).toHaveLength(15);
    expect(batchSaves.filter((b) => b.recipe_id == null)).toHaveLength(2);
    // Snapshot fields copied from the linked recipe row — only the
    // recipe-linked entries participate (hand-authored rows have no recipe).
    for (const b of batchSaves.filter((x) => x.recipe_id != null)) {
      const recipe = savedRecipes.get(
        [...savedRecipes.values()].find((r) => r.id === b.recipe_id)!.name,
      );
      expect(b.species).toBe(recipe.species);
      expect(b.temperature_target).toBe(recipe.temperature_target);
      expect(b.humidity_target).toBe(recipe.humidity_target);
    }
    // No executing batch lands on the offline unit.
    const sixId = savedUnits.get('tent-six').id;
    expect(
      batchSaves.filter(
        (b) =>
          b.pico_unit_id === sixId &&
          b.start_at.getTime() <= now &&
          (!b.finish_at || b.finish_at.getTime() > now),
      ),
    ).toHaveLength(0);
  });

  it('persists the two hand-authored batches with recipe_id null, own species and integer targets', async () => {
    const handEntries = SEED_BATCHES.filter((e) => e.recipeName == null);
    expect(handEntries).toHaveLength(2);
    await service.onApplicationBootstrap();
    const handSaves = batchSaves.filter((b) => b.recipe_id == null);
    expect(handSaves).toHaveLength(2);
    for (const b of handSaves) {
      const entry = handEntries.find((e) => e.description === b.description)!;
      expect(entry).toBeDefined();
      expect(b.species).toBe(entry.species);
      expect(b.temperature_target).toBe(entry.temperatureTarget);
      expect(b.humidity_target).toBe(entry.humidityTarget);
      expect(Number.isInteger(b.temperature_target)).toBe(true);
      expect(Number.isInteger(b.humidity_target)).toBe(true);
      // Finished hand-authored windows derive from the entry's OWN
      // durationDays (no recipe duration behind them).
      expect(b.finish_at.getTime() - b.start_at.getTime()).toBe(
        entry.durationDays * DAY_MS,
      );
      // The no-recipe path must not request a recipe lookup for its entry.
      expect(entry.recipeName).toBeUndefined();
    }
  });

  it('authors every description distinctly — no shared demo prefix, within the length bound', async () => {
    await service.onApplicationBootstrap();
    expect(batchSaves).toHaveLength(17);
    const descriptions = batchSaves.map((b) => b.description);
    // Uniqueness comes from authorship (no DB uniqueness index on the column).
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const d of descriptions) {
      expect(d).not.toMatch(/^Demo (run|plan) — /);
      expect(d.length).toBeLessThanOrEqual(DESCRIPTION_MAX_LENGTH);
    }
  });

  it('keeps the demo signal in notes on every seeded batch', async () => {
    await service.onApplicationBootstrap();
    for (const b of batchSaves) {
      expect(b.notes).toContain('Seeded for the demonstration catalogue.');
    }
  });

  it('attaches the harvest image to exactly the batches whose species has one — count computed, never hardcoded', async () => {
    await service.onApplicationBootstrap();
    const expected = SEED_BATCHES.filter((e) => e.images?.length).length;
    expect(
      batchSaves.filter((b) => b.images && b.images.length > 0),
    ).toHaveLength(expected);
    expect(batchSaves.filter((b) => b.images === null)).toHaveLength(
      batchSaves.length - expected,
    );
  });

  it('leaves every batch of a missing species image-free, with no attribution line', async () => {
    await service.onApplicationBootstrap();
    for (const species of HARVEST_IMAGE_MISSING_SPECIES) {
      const rows = batchSaves.filter((b) => b.species === species);
      expect(rows.length).toBeGreaterThan(0); // the roster covers each species
      for (const r of rows) {
        expect(r.images).toBeNull();
        expect(r.notes).not.toContain('Image:');
      }
    }
  });

  it('stores the exact dataset imageUrl and carries the one-line attribution in notes', async () => {
    await service.onApplicationBootstrap();
    const entry = (harvestDataset as any).images.find(
      (i: any) => i.species === 'Pleurotus ostreatus',
    );
    const row = batchSaves.find((b) => b.species === 'Pleurotus ostreatus');
    expect(row.images).toEqual([entry.imageUrl]);
    expect(row.notes).toContain(
      `Image: ${entry.title} by ${entry.author}, ${entry.license} — ${entry.pageUrl}`,
    );
    // one line only, appended after the seeded base note
    expect(
      row.notes.split('\n').filter((l: string) => l.startsWith('Image:')),
    ).toHaveLength(1);
  });

  it('never mutates an existing batch row on a second run (images stay user-owned)', async () => {
    savedBatches.push({
      id: 777,
      images: ['user-upload.jpg'],
      notes: 'user kept notes',
      species: 'Pleurotus ostreatus',
    });
    await service.onApplicationBootstrap();
    expect(batchSaves).toHaveLength(0); // phase no-ops while any row exists
    expect(savedBatches[0].images).toEqual(['user-upload.jpg']);
    expect(savedBatches[0].notes).toBe('user kept notes');
  });

  it('skips the whole batch phase when any batch row exists', async () => {
    savedBatches.push({ id: 1 });
    await service.onApplicationBootstrap();
    expect(batchSaves).toHaveLength(0);
    // Readings phase still evaluates its own per-unit guards.
    expect(insertCalls.length).toBeGreaterThan(0);
  });

  it('backdates the 60 s grid for the 5 live units only, in ≤500-row chunks', async () => {
    // Default fakes resolve no started batch (coverage finder null), so the
    // grid equals the configured window — extension is pinned next.
    await service.onApplicationBootstrap();
    const rows = insertedRows();
    expect(rows).toHaveLength(GRID_PER_UNIT * 5);
    for (const [chunk] of insertCalls) {
      expect(chunk.length).toBeLessThanOrEqual(SEED_INSERT_CHUNK);
    }
    const sixId = savedUnits.get('tent-six').id;
    expect(rows.filter((r) => r.pico_unit_id === sixId)).toHaveLength(0);
    // Frozen shared boundary: every unit's max ts is one aligned minute.
    const liveIds = [...savedUnits.values()]
      .filter((u) => u.handle !== 'tent-six')
      .map((u) => u.id);
    const maxes = liveIds.map((id) =>
      Math.max(
        ...rows.filter((r) => r.pico_unit_id === id).map((r) => r.ts.getTime()),
      ),
    );
    expect(new Set(maxes).size).toBe(1);
    expect(maxes[0] % 60_000).toBe(0);
    expect(maxes[0]).toBeLessThanOrEqual(Date.now() - 59_000);
  });

  it('extends the grid back to one cadence step before the earliest started batch', async () => {
    // A started batch 30 days old reaches far past the 2-day configured
    // window — coverage must stretch the grid to it, planned (future)
    // starts must not, and the frozen boundary contract must survive.
    const earliest = new Date(Date.now() - 30 * DAY_MS);
    coverageStart = earliest;
    await service.onApplicationBootstrap();
    const rows = insertedRows();
    const tentOneId = savedUnits.get('tent-one').id;
    const tsList = rows
      .filter((r) => r.pico_unit_id === tentOneId)
      .map((r) => r.ts.getTime());
    const minTs = tsList.reduce(
      (a, b) => Math.min(a, b),
      Number.MAX_SAFE_INTEGER,
    );
    const maxTs = tsList.reduce((a, b) => Math.max(a, b), 0);
    // Reaches at least one cadence step before the earliest start...
    expect(minTs).toBeLessThanOrEqual(
      earliest.getTime() - SEED_READINGS_CADENCE_MS,
    );
    // ...and no farther than a step past it — extended, never padded.
    expect(minTs).toBeGreaterThan(
      earliest.getTime() - 2 * SEED_READINGS_CADENCE_MS,
    );
    // Frozen boundary intact: terminates on one aligned minute.
    expect(maxTs % SEED_READINGS_CADENCE_MS).toBe(0);
    expect(maxTs).toBeLessThanOrEqual(Date.now() - 59_000);
    // Perfect 60 s grid over the extended range — cadence never thins.
    expect(tsList).toHaveLength(
      Math.round((maxTs - minTs) / SEED_READINGS_CADENCE_MS) + 1,
    );
    expect(tsList.length).toBeGreaterThan(GRID_PER_UNIT);
    // Offline unit still gets nothing, even with the extended window.
    const sixId = savedUnits.get('tent-six').id;
    expect(rows.filter((r) => r.pico_unit_id === sixId)).toHaveLength(0);
  });

  it('skips a unit whose seeded range already exists (per-unit watermark guard, never a total count)', async () => {
    const tentOneId = () => savedUnits.get('tent-one')?.id ?? -1;
    readingsRepo.count.mockImplementation(async (query: any) => {
      countCalls.push(query);
      // The guard query carries the per-unit range predicate; skip tent-one.
      return query?.where?.pico_unit_id === tentOneId() ? 42 : 0;
    });
    await service.onApplicationBootstrap();
    const rows = insertedRows();
    expect(rows).toHaveLength(GRID_PER_UNIT * 4);
    const guardForOne = countCalls.find(
      (q) => q?.where?.pico_unit_id === tentOneId(),
    );
    expect(guardForOne?.where?.ts).toBeDefined(); // boundary filter present
  });

  it('never lets a seeding failure prevent the boot', async () => {
    rejectUnitSave = true;
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining('Demo seeding failed'),
    );
  });
});

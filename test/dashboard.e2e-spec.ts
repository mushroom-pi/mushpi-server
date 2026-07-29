import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { Readings } from 'src/modules/readings/readings.entity';

import { clearBatches, seedBatch } from './fixtures/batches.fixtures';
import { clearPicos, seedPicoUnit } from './fixtures/pico-units.fixtures';
import { seedReadingForUnit } from './fixtures/readings.fixtures';
import { clearRecipes, seedRecipe } from './fixtures/recipes.fixtures';
import { closeTestApp, createTestApp } from './test-setup';

describe('GET /v1/dashboard/summary (e2e)', () => {
  let app: INestApplication;
  let readingsRepo: Repository<Readings>;

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
    readingsRepo = app.get(getRepositoryToken(Readings));
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(async () => {
    await readingsRepo.clear();
    await clearBatches(app);
    await clearRecipes(app);
    await clearPicos(app);
  });

  // Helper to call the endpoint
  const fetchSummary = async () => {
    const supertest = await import('supertest');
    const request = supertest.default;
    const res = await request(app.getHttpServer())
      .get('/v1/dashboard/summary')
      .expect(200);
    return res.body;
  };

  it('returns zero counts and empty arrays on empty DB', async () => {
    const body = await fetchSummary();

    expect(body.units.healthy).toBe(0);
    expect(body.units.degraded).toBe(0);
    expect(body.units.offline).toBe(0);
    expect(body.units.total).toBe(0);
    expect(body.units.items).toEqual([]);

    expect(body.batches.active).toBe(0);
    expect(body.batches.total).toBe(0);
    expect(body.batches.approachingCompletion).toEqual([]);
    expect(body.batches.recentlyFinished).toEqual([]);

    expect(body.recipes.total).toBe(0);
    expect(body.recipes.mostUsed).toEqual([]);
    expect(body.recipes.topCount).toBe(3);

    expect(body.stats.totalReadings).toBe(0);
    expect(body.stats.totalBatches).toBe(0);
    expect(body.stats.oldestActiveBatchDays).toBeNull();

    expect(body.warnings).toEqual([]);
  });

  it('healthy unit with active batch approaching completion', async () => {
    const now = new Date();
    const unit = await seedPicoUnit(app, {
      handle: 'dash-healthy',
      port: 8001,
      last_seen: new Date(now.getTime() - 30_000), // 30s ago
      failed_calls: 0,
      failed_readings: 0,
      consecutive_empty_readings: 0,
    });

    await seedReadingForUnit(app, unit, {
      temperature: 25,
      humidity: 60,
      control_loop_enabled: true,
      temperature_set: 25,
      humidity_set: 60,
      board_uptime_s: 7200, // 2 hours
      ts: now,
    });

    // Active batch finishing in 2 days
    await seedBatch(app, unit.id, {
      start_at: new Date(now.getTime() - 5 * 86400000),
      finish_at: new Date(now.getTime() + 2 * 86400000),
      species: 'oyster',
      description: 'Test batch',
    });

    const body = await fetchSummary();

    expect(body.units.total).toBe(1);
    expect(body.units.healthy).toBe(1);
    expect(body.units.degraded).toBe(0);
    expect(body.units.offline).toBe(0);

    const item = body.units.items[0];
    expect(item.status).toBe('healthy');
    expect(item.handle).toBe('dash-healthy');
    expect(item.uptimeHours).toBe(2);
    expect(item.lastReading).toBeDefined();
    expect(item.lastReading.temperature).toBe(25);
    expect(item.lastReading.humidity).toBe(60);
    expect(item.controlLoopEnabled).toBe(true);
    expect(item.activeBatch).toBeDefined();
    expect(item.activeBatch.status).toBe('in-progress');
    expect(item.activeBatch.daysRemaining).toBe(2);

    expect(body.batches.active).toBe(1);
    expect(body.batches.approachingCompletion).toHaveLength(1);
    expect(body.batches.approachingCompletion[0].species).toBe('oyster');

    expect(body.warnings).toEqual([]);
  });

  it('degraded unit with failed_readings and empty_readings triggers warnings', async () => {
    const now = new Date();
    const unit = await seedPicoUnit(app, {
      handle: 'dash-degraded',
      port: 8002,
      last_seen: new Date(now.getTime() - 30_000),
      failed_readings: 5,
      consecutive_empty_readings: 5,
      failed_calls: 0,
    });

    // One valid in-range reading
    await seedReadingForUnit(app, unit, {
      temperature: 25,
      humidity: 60,
      control_loop_enabled: true,
      temperature_set: 25,
      humidity_set: 60,
      ts: now,
    });

    const body = await fetchSummary();

    expect(body.units.degraded).toBe(1);
    const item = body.units.items[0];
    expect(item.status).toBe('degraded');

    const types = body.warnings.map((w: any) => w.type).sort();
    expect(types).toContain('unit_degraded');
    expect(types).toContain('empty_readings');
  });

  it('offline unit with no last_seen and failed_calls', async () => {
    await seedPicoUnit(app, {
      handle: 'dash-offline',
      port: 8003,
      last_seen: undefined,
      failed_calls: 5,
    });

    const body = await fetchSummary();

    expect(body.units.offline).toBe(1);
    const item = body.units.items[0];
    expect(item.status).toBe('offline');
    expect(item.lastSeenSecondsAgo).toBeNull();
    expect(item.uptimeHours).toBe(0);
    expect(item.controlLoopEnabled).toBe(false);
    expect(item.lastReading).toBeNull();
    expect(item.activeBatch).toBeNull();

    const offlineWarning = body.warnings.find(
      (w: any) => w.type === 'unit_offline',
    );
    expect(offlineWarning).toBeDefined();
    expect(offlineWarning.severity).toBe('error');
    expect(offlineWarning.failedCalls).toBe(5);
  });

  it('temp deviation warning when control_loop_enabled and temp far from setpoint', async () => {
    const now = new Date();

    // Unit A: control_loop_enabled=true, temp deviation
    const unitA = await seedPicoUnit(app, {
      handle: 'dash-temp-dev',
      port: 8004,
      last_seen: new Date(now.getTime() - 30_000),
    });
    await seedReadingForUnit(app, unitA, {
      temperature: 35,
      humidity: 60,
      control_loop_enabled: true,
      temperature_set: 25,
      humidity_set: 60,
      ts: now,
    });

    // Unit B: same values but control_loop_enabled=false → no deviation warning
    const unitB = await seedPicoUnit(app, {
      handle: 'dash-temp-no-dev',
      port: 8005,
      last_seen: new Date(now.getTime() - 30_000),
    });
    await seedReadingForUnit(app, unitB, {
      temperature: 35,
      humidity: 60,
      control_loop_enabled: false,
      temperature_set: 25,
      humidity_set: 60,
      ts: now,
    });

    const body = await fetchSummary();

    const tempWarnings = body.warnings.filter(
      (w: any) => w.type === 'temp_deviation',
    );
    expect(tempWarnings).toHaveLength(1);
    expect(tempWarnings[0].handle).toBe('dash-temp-dev');
    expect(tempWarnings[0].reading.value).toBe(35);
    expect(tempWarnings[0].reading.target).toBe(25);
  });

  it('humidity deviation warning when control_loop_enabled and humidity far from setpoint', async () => {
    const now = new Date();
    const unit = await seedPicoUnit(app, {
      handle: 'dash-hum-dev',
      port: 8006,
      last_seen: new Date(now.getTime() - 30_000),
    });
    await seedReadingForUnit(app, unit, {
      temperature: 25,
      humidity: 80,
      control_loop_enabled: true,
      temperature_set: 25,
      humidity_set: 60,
      ts: now,
    });

    const body = await fetchSummary();

    const humWarnings = body.warnings.filter(
      (w: any) => w.type === 'humidity_deviation',
    );
    expect(humWarnings).toHaveLength(1);
    expect(humWarnings[0].reading.value).toBe(80);
    expect(humWarnings[0].reading.target).toBe(60);
  });

  it('approaching completion boundary: 2 days yes, 4 days no', async () => {
    const now = new Date();
    const unit = await seedPicoUnit(app, {
      handle: 'dash-approach',
      port: 8007,
      last_seen: new Date(now.getTime() - 30_000),
    });

    // Batch finishing in 2 days → should appear in approachingCompletion
    await seedBatch(app, unit.id, {
      start_at: new Date(now.getTime() - 5 * 86400000),
      finish_at: new Date(now.getTime() + 2 * 86400000),
      species: 'oyster',
    });

    // Batch finishing in 4 days → should NOT appear in approachingCompletion
    const unit2 = await seedPicoUnit(app, {
      handle: 'dash-approach2',
      port: 8008,
      last_seen: new Date(now.getTime() - 30_000),
    });
    await seedBatch(app, unit2.id, {
      start_at: new Date(now.getTime() - 1 * 86400000),
      finish_at: new Date(now.getTime() + 4 * 86400000),
      species: 'lion',
    });

    const body = await fetchSummary();

    expect(body.batches.active).toBe(2);
    expect(body.batches.approachingCompletion).toHaveLength(1);
    expect(body.batches.approachingCompletion[0].species).toBe('oyster');
  });

  it('recently finished: 10 min ago yes, 3 days ago no', async () => {
    const now = new Date();
    const unit = await seedPicoUnit(app, {
      handle: 'dash-finished',
      port: 8009,
      last_seen: new Date(now.getTime() - 30_000),
    });

    // Finished 10 min ago
    await seedBatch(app, unit.id, {
      start_at: new Date(now.getTime() - 10 * 86400000),
      finish_at: new Date(now.getTime() - 10 * 60_000),
      species: 'oyster',
    });

    // Finished 3 days ago
    const unit2 = await seedPicoUnit(app, {
      handle: 'dash-finished2',
      port: 8010,
      last_seen: new Date(now.getTime() - 30_000),
    });
    await seedBatch(app, unit2.id, {
      start_at: new Date(now.getTime() - 20 * 86400000),
      finish_at: new Date(now.getTime() - 3 * 86400000),
      species: 'lion',
    });

    const body = await fetchSummary();

    expect(body.batches.recentlyFinished).toHaveLength(1);
    expect(body.batches.recentlyFinished[0].species).toBe('oyster');
  });

  it('top recipes: returns top 3 by batch count', async () => {
    const r1 = await seedRecipe(app, { name: 'Recipe-A', species: 'oyster' });
    const r2 = await seedRecipe(app, { name: 'Recipe-B', species: 'lion' });
    const r3 = await seedRecipe(app, { name: 'Recipe-C', species: 'shiitake' });
    const r4 = await seedRecipe(app, { name: 'Recipe-D', species: 'enoki' });

    const unit = await seedPicoUnit(app, {
      handle: 'dash-recipes',
      port: 8011,
    });

    // r1: 3 batches
    await seedBatch(app, unit.id, { recipe_id: r1.id, species: 'oyster' });
    await seedBatch(app, unit.id, { recipe_id: r1.id, species: 'oyster' });
    await seedBatch(app, unit.id, { recipe_id: r1.id, species: 'oyster' });
    // r2: 2 batches
    await seedBatch(app, unit.id, { recipe_id: r2.id, species: 'lion' });
    await seedBatch(app, unit.id, { recipe_id: r2.id, species: 'lion' });
    // r3: 2 batches
    await seedBatch(app, unit.id, { recipe_id: r3.id, species: 'shiitake' });
    await seedBatch(app, unit.id, { recipe_id: r3.id, species: 'shiitake' });
    // r4: 1 batch
    await seedBatch(app, unit.id, { recipe_id: r4.id, species: 'enoki' });

    const body = await fetchSummary();

    expect(body.recipes.total).toBe(4);
    expect(body.recipes.topCount).toBe(3);
    expect(body.recipes.mostUsed).toHaveLength(3);
    expect(body.recipes.mostUsed[0].batchCount).toBe(3);
    expect(body.recipes.mostUsed[0].name).toBe('Recipe-A');
  });

  it('stats: oldestActiveBatchDays and totalReadings', async () => {
    const now = new Date();
    const unit = await seedPicoUnit(app, {
      handle: 'dash-stats',
      port: 8012,
      last_seen: new Date(now.getTime() - 30_000),
    });

    // Two active batches: one started 5 days ago, one 1 day ago
    await seedBatch(app, unit.id, {
      start_at: new Date(now.getTime() - 5 * 86400000),
      finish_at: new Date(now.getTime() + 10 * 86400000),
    });
    await seedBatch(app, unit.id, {
      start_at: new Date(now.getTime() - 1 * 86400000),
      finish_at: new Date(now.getTime() + 10 * 86400000),
    });

    // 7 readings
    for (let i = 0; i < 7; i++) {
      await seedReadingForUnit(app, unit, {
        temperature: 25,
        humidity: 60,
        ts: new Date(now.getTime() - i * 60_000),
      });
    }

    const body = await fetchSummary();

    expect(body.stats.totalReadings).toBe(7);
    expect(body.stats.totalBatches).toBe(2);
    expect(body.stats.oldestActiveBatchDays).toBe(5);
  });
});

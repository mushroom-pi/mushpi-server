import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import request from 'supertest';
import { Repository } from 'typeorm';

import { Batch } from '../src/modules/batches/batches.entity';
import { Readings } from '../src/modules/readings/readings.entity';
import { seedBatch } from './fixtures/batches.fixtures';
import { clearPicos, seedPicoUnit } from './fixtures/pico-units.fixtures';
import { seedReadingForUnit } from './fixtures/readings.fixtures';
import { closeTestApp, createTestApp } from './test-setup';

describe('Batch readings endpoint (e2e)', () => {
  let app: INestApplication;
  let readingsRepo: Repository<Readings>;
  let batchRepo: Repository<Batch>;

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();

    readingsRepo = app.get(getRepositoryToken(Readings));
    batchRepo = app.get(getRepositoryToken(Batch));
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(async () => {
    await readingsRepo.clear();
    await batchRepo.clear();
    await clearPicos(app);
  });

  it('returns only in-batch readings when no query provided', async () => {
    const pico = await seedPicoUnit(app, {
      handle: 'batch-agg-1',
      port: 5400,
    });

    const base = Date.now();
    // readings: before, inside (3), after
    await seedReadingForUnit(app, pico, {
      ts: new Date(base - 60000),
      temperature: 1,
    });
    await seedReadingForUnit(app, pico, {
      ts: new Date(base - 30000),
      temperature: 10,
      fan_on: true,
      humidifier_on: false,
      heater_on: true,
      control_loop_enabled: true,
      temperature_set: 22,
      humidity_set: 55,
    });
    await seedReadingForUnit(app, pico, {
      ts: new Date(base - 20000),
      temperature: 11,
      fan_on: true,
      humidifier_on: true,
      heater_on: false,
      control_loop_enabled: true,
      temperature_set: 22,
      humidity_set: 55,
    });
    await seedReadingForUnit(app, pico, {
      ts: new Date(base - 10000),
      temperature: 12,
      fan_on: false,
      humidifier_on: true,
      heater_on: false,
      control_loop_enabled: false,
      temperature_set: 22,
      humidity_set: 55,
    });
    await seedReadingForUnit(app, pico, {
      ts: new Date(base + 10000),
      temperature: 2,
    });

    // batch spans the 3 inside readings
    const batch = await seedBatch(app, pico.id, {
      start_at: new Date(base - 30000),
      finish_at: new Date(base - 10000),
    });

    const res = await request(app.getHttpServer())
      .get(`/v1/batches/${batch.id}/readings`)
      .expect(200);

    expect(res.body.actualReadings).toBe(3);
    expect(res.body.points).toBe(200);
    expect(res.body.data.length).toBe(3);

    // Each bucket has readingCount=1
    for (const bucket of res.body.data) {
      expect(bucket.readingCount).toBe(1);
    }

    // Relay counts and setpoints for each single-reading bucket
    const [b0, b1, b2] = res.body.data;

    // Reading 1: fan=true, humidifier=false, heater=true, loop=true
    expect(b0.fanOnCount).toBe(1);
    expect(b0.humidifierOnCount).toBe(0);
    expect(b0.heaterOnCount).toBe(1);
    expect(b0.controlLoopEnabledCount).toBe(1);
    expect(b0.temperatureSet).toBe(22);
    expect(b0.humiditySet).toBe(55);

    // Reading 2: fan=true, humidifier=true, heater=false, loop=true
    expect(b1.fanOnCount).toBe(1);
    expect(b1.humidifierOnCount).toBe(1);
    expect(b1.heaterOnCount).toBe(0);
    expect(b1.controlLoopEnabledCount).toBe(1);
    expect(b1.temperatureSet).toBe(22);
    expect(b1.humiditySet).toBe(55);

    // Reading 3: fan=false, humidifier=true, heater=false, loop=false
    expect(b2.fanOnCount).toBe(0);
    expect(b2.humidifierOnCount).toBe(1);
    expect(b2.heaterOnCount).toBe(0);
    expect(b2.controlLoopEnabledCount).toBe(0);
    expect(b2.temperatureSet).toBe(22);
    expect(b2.humiditySet).toBe(55);
  });

  it('narrows results with start/end inside batch window', async () => {
    const pico = await seedPicoUnit(app, {
      handle: 'batch-agg-2',
      port: 5401,
    });

    const base = Date.now();
    await seedReadingForUnit(app, pico, {
      ts: new Date(base - 40000),
      temperature: 10,
    });
    await seedReadingForUnit(app, pico, {
      ts: new Date(base - 30000),
      temperature: 11,
    });
    await seedReadingForUnit(app, pico, {
      ts: new Date(base - 20000),
      temperature: 12,
    });
    await seedReadingForUnit(app, pico, {
      ts: new Date(base - 10000),
      temperature: 13,
    });

    const batch = await seedBatch(app, pico.id, {
      start_at: new Date(base - 40000),
      finish_at: new Date(base - 10000),
    });

    // Narrow to middle two readings
    const startIso = new Date(base - 35000).toISOString();
    const endIso = new Date(base - 15000).toISOString();
    const res = await request(app.getHttpServer())
      .get(`/v1/batches/${batch.id}/readings`)
      .query({ start: startIso, end: endIso })
      .expect(200);

    expect(res.body.actualReadings).toBe(2);
    expect(res.body.data.length).toBe(2);
  });

  it('clamps wider window to batch window', async () => {
    const pico = await seedPicoUnit(app, {
      handle: 'batch-agg-3',
      port: 5402,
    });

    const base = Date.now();
    await seedReadingForUnit(app, pico, {
      ts: new Date(base - 80000),
      temperature: 1,
    });
    await seedReadingForUnit(app, pico, {
      ts: new Date(base - 60000),
      temperature: 10,
    });
    await seedReadingForUnit(app, pico, {
      ts: new Date(base - 40000),
      temperature: 11,
    });
    await seedReadingForUnit(app, pico, {
      ts: new Date(base - 20000),
      temperature: 12,
    });
    await seedReadingForUnit(app, pico, {
      ts: new Date(base + 20000),
      temperature: 2,
    });

    // batch spans -60s to -20s (3 readings inside)
    const batch = await seedBatch(app, pico.id, {
      start_at: new Date(base - 60000),
      finish_at: new Date(base - 20000),
    });

    // Request wider window — clamped to batch
    const res = await request(app.getHttpServer())
      .get(`/v1/batches/${batch.id}/readings`)
      .query({
        start: new Date(base - 120000).toISOString(),
        end: new Date(base + 60000).toISOString(),
      })
      .expect(200);

    expect(res.body.actualReadings).toBe(3);
    expect(res.body.data.length).toBe(3);
  });

  it('returns 400 when requested window does not overlap the batch', async () => {
    const pico = await seedPicoUnit(app, {
      handle: 'batch-agg-4',
      port: 5403,
    });

    const base = Date.now();
    await seedReadingForUnit(app, pico, {
      ts: new Date(base - 30000),
    });
    await seedReadingForUnit(app, pico, {
      ts: new Date(base - 20000),
    });

    const batch = await seedBatch(app, pico.id, {
      start_at: new Date(base - 30000),
      finish_at: new Date(base - 20000),
    });

    await request(app.getHttpServer())
      .get(`/v1/batches/${batch.id}/readings`)
      .query({
        start: new Date(base + 10000).toISOString(),
        end: new Date(base + 20000).toISOString(),
      })
      .expect(400);
  });

  it('returns 422 for invalid date format', async () => {
    const pico = await seedPicoUnit(app, {
      handle: 'batch-agg-5',
      port: 5404,
    });
    const batch = await seedBatch(app, pico.id, {
      start_at: new Date(),
      finish_at: new Date(Date.now() + 60000),
    });

    await request(app.getHttpServer())
      .get(`/v1/batches/${batch.id}/readings`)
      .query({ start: 'invalid-date' })
      .expect(422);
  });

  it('returns 400 when start > end', async () => {
    const pico = await seedPicoUnit(app, {
      handle: 'batch-agg-6',
      port: 5405,
    });

    const base = Date.now();
    const batch = await seedBatch(app, pico.id, {
      start_at: new Date(base - 30000),
      finish_at: new Date(base + 30000),
    });

    const s = new Date(base + 20000).toISOString();
    const e = new Date(base - 20000).toISOString();

    await request(app.getHttpServer())
      .get(`/v1/batches/${batch.id}/readings`)
      .query({ start: s, end: e })
      .expect(400);
  });

  it('downsamples 30 readings into 10 buckets inside batch', async () => {
    const pico = await seedPicoUnit(app, {
      handle: 'batch-agg-7',
      port: 5406,
    });

    const base = Date.now();
    const totalReadings = 30;
    for (let i = 0; i < totalReadings; i++) {
      await seedReadingForUnit(app, pico, {
        ts: new Date(base - (totalReadings - i) * 60000),
        temperature: 20 + i * 0.1,
        humidity: 50 + i * 0.2,
      });
    }

    // batch covers all 30 readings
    const batch = await seedBatch(app, pico.id, {
      start_at: new Date(base - totalReadings * 60000),
      finish_at: new Date(base),
    });

    const res = await request(app.getHttpServer())
      .get(`/v1/batches/${batch.id}/readings`)
      .query({ points: 10 })
      .expect(200);

    expect(res.body.data.length).toBeLessThanOrEqual(10);
    expect(res.body.points).toBe(10);
    expect(res.body.actualReadings).toBe(totalReadings);

    const sumCounts = res.body.data.reduce(
      (sum: number, b: any) => sum + b.readingCount,
      0,
    );
    expect(sumCounts).toBe(totalReadings);
  });
});

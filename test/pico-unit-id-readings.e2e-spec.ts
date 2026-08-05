import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import request from 'supertest';
import { Repository } from 'typeorm';

import { PicoUnit } from '../src/modules/pico-units/pico-unit.entity';
import { Readings } from '../src/modules/readings/readings.entity';
import {
  seedPicoUnitPartial,
  seedReadingForUnit,
} from './fixtures/readings.fixtures';
import { closeTestApp, createTestApp } from './test-setup';

describe('Readings endpoints (e2e)', () => {
  let app: INestApplication;
  let readingsRepo: Repository<Readings>;
  let picoRepo: Repository<PicoUnit>;

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();

    picoRepo = app.get(getRepositoryToken(PicoUnit));
    readingsRepo = app.get(getRepositoryToken(Readings));
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(async () => {
    if (readingsRepo) await readingsRepo.clear();
    if (picoRepo) await picoRepo.clear();
  });

  describe('GET /pico-units/:id/readings (downsampled)', () => {
    it('returns aggregated buckets with default points', async () => {
      const unit = await seedPicoUnitPartial(app, {
        handle: 'agg-default',
        port: 5010,
      });

      await seedReadingForUnit(app, unit, {
        ts: new Date(Date.now() - 30000),
        temperature: 20,
        humidity: 50,
        fan_on: true,
        humidifier_on: false,
        heater_on: true,
        control_loop_enabled: true,
        temperature_set: 25,
        humidity_set: 60,
      });
      await seedReadingForUnit(app, unit, {
        ts: new Date(Date.now() - 20000),
        temperature: 21,
        humidity: 51,
        fan_on: true,
        humidifier_on: true,
        heater_on: false,
        control_loop_enabled: true,
        temperature_set: 25,
        humidity_set: 60,
      });
      await seedReadingForUnit(app, unit, {
        ts: new Date(Date.now() - 10000),
        temperature: 22,
        humidity: 52,
        fan_on: false,
        humidifier_on: true,
        heater_on: false,
        control_loop_enabled: false,
        temperature_set: 25,
        humidity_set: 60,
      });

      const res = await request(app.getHttpServer())
        .get(`/v1/pico-units/${unit.id}/readings`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('points', 200);
      expect(res.body).toHaveProperty('actualReadings', 3);
      expect(Array.isArray(res.body.data)).toBe(true);
      // 3 readings, 3 buckets (each readingCount=1)
      expect(res.body.data.length).toBe(3);

      for (const bucket of res.body.data) {
        expect(bucket.readingCount).toBe(1);
        // With single reading, min === max === avg
        expect(bucket.tempMin).toBe(bucket.tempMax);
        expect(bucket.humidityMin).toBe(bucket.humidityMax);
      }

      // Relay counts and setpoints for each single-reading bucket
      const [b0, b1, b2] = res.body.data;

      // Bucket 0: fan=true, humidifier=false, heater=true, loop=true
      expect(b0.fanOnCount).toBe(1);
      expect(b0.humidifierOnCount).toBe(0);
      expect(b0.heaterOnCount).toBe(1);
      expect(b0.controlLoopEnabledCount).toBe(1);
      expect(b0.temperatureSet).toBe(25);
      expect(b0.humiditySet).toBe(60);

      // Bucket 1: fan=true, humidifier=true, heater=false, loop=true
      expect(b1.fanOnCount).toBe(1);
      expect(b1.humidifierOnCount).toBe(1);
      expect(b1.heaterOnCount).toBe(0);
      expect(b1.controlLoopEnabledCount).toBe(1);
      expect(b1.temperatureSet).toBe(25);
      expect(b1.humiditySet).toBe(60);

      // Bucket 2: fan=false, humidifier=true, heater=false, loop=false
      expect(b2.fanOnCount).toBe(0);
      expect(b2.humidifierOnCount).toBe(1);
      expect(b2.heaterOnCount).toBe(0);
      expect(b2.controlLoopEnabledCount).toBe(0);
      expect(b2.temperatureSet).toBe(25);
      expect(b2.humiditySet).toBe(60);

      // Chronological order
      const timestamps = res.body.data.map((b: any) => b.timestamp);
      expect(timestamps).toEqual([...timestamps].sort());
    });

    it('downsamples ~50 readings into requested number of buckets', async () => {
      const unit = await seedPicoUnitPartial(app, {
        handle: 'agg-downsample',
        port: 5011,
      });

      const now = Date.now();
      const totalReadings = 50;
      for (let i = 0; i < totalReadings; i++) {
        await seedReadingForUnit(app, unit, {
          ts: new Date(now - (totalReadings - i) * 60000),
          temperature: 20 + i * 0.1,
          humidity: 50 + i * 0.2,
        });
      }

      const res = await request(app.getHttpServer())
        .get(`/v1/pico-units/${unit.id}/readings`)
        .query({ points: 10 })
        .expect(200);

      expect(res.body.data.length).toBeLessThanOrEqual(10);
      expect(res.body.actualReadings).toBe(totalReadings);
      expect(res.body.points).toBe(10);

      // Sum of readingCounts should equal total readings
      const sumCounts = res.body.data.reduce(
        (sum: number, b: any) => sum + b.readingCount,
        0,
      );
      expect(sumCounts).toBe(totalReadings);

      // temperature should be within [tempMin, tempMax] per bucket
      for (const bucket of res.body.data) {
        if (bucket.temperature != null) {
          expect(bucket.temperature).toBeGreaterThanOrEqual(bucket.tempMin);
          expect(bucket.temperature).toBeLessThanOrEqual(bucket.tempMax);
        }
      }
    });

    it('returns default points=200 when omitted', async () => {
      const unit = await seedPicoUnitPartial(app, {
        handle: 'agg-points-default',
        port: 5012,
      });

      await seedReadingForUnit(app, unit, {
        ts: new Date(Date.now() - 10000),
        temperature: 20,
      });

      const res = await request(app.getHttpServer())
        .get(`/v1/pico-units/${unit.id}/readings`)
        .expect(200);

      expect(res.body.points).toBe(200);
    });

    it('returns empty data when no readings exist', async () => {
      const unit = await seedPicoUnitPartial(app, {
        handle: 'agg-empty',
        port: 5013,
      });

      const res = await request(app.getHttpServer())
        .get(`/v1/pico-units/${unit.id}/readings`)
        .expect(200);

      expect(res.body.data).toEqual([]);
      expect(res.body.points).toBe(200);
      expect(res.body.actualReadings).toBe(0);
    });

    describe('time window filtering', () => {
      let unit: PicoUnit;
      const now = Date.now();

      beforeEach(async () => {
        unit = await seedPicoUnitPartial(app, {
          handle: 'agg-time-window',
          port: 5014,
        });

        await seedReadingForUnit(app, unit, {
          ts: new Date(now - 30000),
          temperature: 10,
        });
        await seedReadingForUnit(app, unit, {
          ts: new Date(now - 20000),
          temperature: 11,
        });
        await seedReadingForUnit(app, unit, {
          ts: new Date(now - 10000),
          temperature: 12,
        });
      });

      it('filters by start only', async () => {
        const startIso = new Date(now - 20000).toISOString();
        const res = await request(app.getHttpServer())
          .get(`/v1/pico-units/${unit.id}/readings`)
          .query({ start: startIso })
          .expect(200);

        expect(res.body.actualReadings).toBe(2);
        expect(res.body.data.length).toBe(2);
      });

      it('filters by end only', async () => {
        const endIso = new Date(now - 20000).toISOString();
        const res = await request(app.getHttpServer())
          .get(`/v1/pico-units/${unit.id}/readings`)
          .query({ end: endIso })
          .expect(200);

        expect(res.body.actualReadings).toBe(2);
        expect(res.body.data.length).toBe(2);
      });

      it('filters by start and end', async () => {
        const startIso = new Date(now - 25000).toISOString();
        const endIso = new Date(now - 15000).toISOString();
        const res = await request(app.getHttpServer())
          .get(`/v1/pico-units/${unit.id}/readings`)
          .query({ start: startIso, end: endIso })
          .expect(200);

        expect(res.body.actualReadings).toBe(1);
        expect(res.body.data.length).toBe(1);
      });

      it('returns empty when window is outside stored readings', async () => {
        const startIso = new Date(now + 10000).toISOString();
        const endIso = new Date(now + 20000).toISOString();
        const res = await request(app.getHttpServer())
          .get(`/v1/pico-units/${unit.id}/readings`)
          .query({ start: startIso, end: endIso })
          .expect(200);

        expect(res.body.data).toEqual([]);
        expect(res.body.actualReadings).toBe(0);
      });
    });

    it('returns 422 for invalid date format', async () => {
      const unit = await seedPicoUnitPartial(app, {
        handle: 'agg-invalid-date',
        port: 5015,
      });

      await request(app.getHttpServer())
        .get(`/v1/pico-units/${unit.id}/readings`)
        .query({ start: 'not-a-date' })
        .expect(422);
    });

    it('returns 400 when start > end', async () => {
      const unit = await seedPicoUnitPartial(app, {
        handle: 'agg-start-gt-end',
        port: 5016,
      });

      const now = Date.now();
      const s = new Date(now - 5000).toISOString();
      const e = new Date(now - 20000).toISOString();

      await request(app.getHttpServer())
        .get(`/v1/pico-units/${unit.id}/readings`)
        .query({ start: s, end: e })
        .expect(400);
    });

    describe('points validation', () => {
      let unit: PicoUnit;

      beforeEach(async () => {
        unit = await seedPicoUnitPartial(app, {
          handle: 'agg-points-validation',
          port: 5017,
        });
        await seedReadingForUnit(app, unit, { temperature: 20 });
      });

      it('returns 422 for points=0', async () => {
        await request(app.getHttpServer())
          .get(`/v1/pico-units/${unit.id}/readings`)
          .query({ points: 0 })
          .expect(422);
      });

      it('returns 422 for points=5 (below min 10)', async () => {
        await request(app.getHttpServer())
          .get(`/v1/pico-units/${unit.id}/readings`)
          .query({ points: 5 })
          .expect(422);
      });

      it('returns 422 for points=99999 (above max 2000)', async () => {
        await request(app.getHttpServer())
          .get(`/v1/pico-units/${unit.id}/readings`)
          .query({ points: 99999 })
          .expect(422);
      });

      it('returns 422 for points=abc', async () => {
        await request(app.getHttpServer())
          .get(`/v1/pico-units/${unit.id}/readings`)
          .query({ points: 'abc' })
          .expect(422);
      });
    });

    it('passes through NULL temperature and humidity', async () => {
      const unit = await seedPicoUnitPartial(app, {
        handle: 'agg-null-pass',
        port: 5018,
      });

      await seedReadingForUnit(app, unit, {
        ts: new Date(Date.now() - 10000),
        temperature: null,
        humidity: null,
      });

      const res = await request(app.getHttpServer())
        .get(`/v1/pico-units/${unit.id}/readings`)
        .expect(200);

      expect(res.body.data.length).toBe(1);
      const bucket = res.body.data[0];
      expect(bucket.temperature).toBeNull();
      expect(bucket.humidity).toBeNull();
      expect(bucket.tempMin).toBeNull();
      expect(bucket.tempMax).toBeNull();
      expect(bucket.humidityMin).toBeNull();
      expect(bucket.humidityMax).toBeNull();
      expect(bucket.readingCount).toBe(1);
    });

    it('aggregates relay counts across multiple readings in a bucket', async () => {
      const unit = await seedPicoUnitPartial(app, {
        handle: 'agg-relay-sum',
        port: 5019,
      });

      const now = Date.now();
      // Seed 20 readings; with points=10, NTILE(10) produces 10 buckets of 2
      // Even-indexed readings: fan=true, humidifier=false, heater=true, loop=true
      // Odd-indexed readings: fan=false, humidifier=true, heater=false, loop=true
      for (let i = 0; i < 20; i++) {
        const isEven = i % 2 === 0;
        await seedReadingForUnit(app, unit, {
          ts: new Date(now - (20 - i) * 10000),
          temperature: 20 + i * 0.1,
          humidity: 50 + i * 0.1,
          fan_on: isEven,
          humidifier_on: !isEven,
          heater_on: isEven,
          control_loop_enabled: true,
          temperature_set: 25,
          humidity_set: 60,
        });
      }

      const res = await request(app.getHttpServer())
        .get(`/v1/pico-units/${unit.id}/readings`)
        .query({ points: 10 })
        .expect(200);

      expect(res.body.data.length).toBe(10);
      expect(res.body.actualReadings).toBe(20);

      // Each bucket has exactly 2 readings
      for (const bucket of res.body.data) {
        expect(bucket.readingCount).toBe(2);
        // Each bucket: 1 even (fan=T, hum=F, heater=T) + 1 odd (fan=F, hum=T, heater=F)
        expect(bucket.fanOnCount).toBe(1);
        expect(bucket.humidifierOnCount).toBe(1);
        expect(bucket.heaterOnCount).toBe(1);
        expect(bucket.controlLoopEnabledCount).toBe(2);
        expect(bucket.temperatureSet).toBe(25);
        expect(bucket.humiditySet).toBe(60);
      }
    });

    it('returns NULL setpoints when temperature_set and humidity_set are null', async () => {
      const unit = await seedPicoUnitPartial(app, {
        handle: 'agg-null-setpoints',
        port: 5020,
      });

      await seedReadingForUnit(app, unit, {
        ts: new Date(Date.now() - 10000),
        temperature: 20,
        humidity: 50,
        temperature_set: null,
        humidity_set: null,
      });

      const res = await request(app.getHttpServer())
        .get(`/v1/pico-units/${unit.id}/readings`)
        .expect(200);

      expect(res.body.data.length).toBe(1);
      const bucket = res.body.data[0];
      expect(bucket.temperatureSet).toBeNull();
      expect(bucket.humiditySet).toBeNull();
      expect(bucket.fanOnCount).toBe(0);
      expect(bucket.humidifierOnCount).toBe(0);
      expect(bucket.heaterOnCount).toBe(0);
      expect(bucket.controlLoopEnabledCount).toBe(0);
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import request from 'supertest';
import { Repository } from 'typeorm';

import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';
import { Readings } from 'src/modules/readings/readings.entity';
import { OS_TIMEZONE } from 'src/modules/settings/settings.constant';

import {
  seedPicoUnitPartial,
  seedReadingForUnit,
} from './fixtures/readings.fixtures';
import { clearSettings } from './fixtures/settings.fixtures';
import { closeTestApp, createTestApp } from './test-setup';

describe('Settings endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(async () => {
    await clearSettings(app);
  });

  describe('GET /v1/settings', () => {
    it('returns OS timezone when no row exists', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/settings')
        .expect(200);

      expect(res.body).toHaveProperty('timezone');
      expect(res.body.timezone).toBe(OS_TIMEZONE);
    });

    it('returns persisted timezone after PATCH', async () => {
      await request(app.getHttpServer())
        .patch('/v1/settings')
        .send({ timezone: 'Europe/Madrid' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/v1/settings')
        .expect(200);

      expect(res.body.timezone).toBe('Europe/Madrid');
    });
  });

  describe('PATCH /v1/settings', () => {
    it('sets timezone', async () => {
      const res = await request(app.getHttpServer())
        .patch('/v1/settings')
        .send({ timezone: 'Europe/Madrid' })
        .expect(200);

      expect(res.body).toEqual({ timezone: 'Europe/Madrid' });
    });

    it('returns 422 for invalid timezone', async () => {
      await request(app.getHttpServer())
        .patch('/v1/settings')
        .send({ timezone: 'Foo/Bar' })
        .expect(422);
    });

    it('returns 422 for lowercase timezone (case-sensitive)', async () => {
      await request(app.getHttpServer())
        .patch('/v1/settings')
        .send({ timezone: 'europe/madrid' })
        .expect(422);
    });

    it('accepts UTC', async () => {
      const res = await request(app.getHttpServer())
        .patch('/v1/settings')
        .send({ timezone: 'UTC' })
        .expect(200);

      expect(res.body.timezone).toBe('UTC');
    });

    it('handles empty body (partial update)', async () => {
      // First set a timezone
      await request(app.getHttpServer())
        .patch('/v1/settings')
        .send({ timezone: 'Europe/Madrid' })
        .expect(200);

      // Then PATCH with empty body
      const res = await request(app.getHttpServer())
        .patch('/v1/settings')
        .send({})
        .expect(200);

      // Timezone should remain unchanged
      expect(res.body.timezone).toBe('Europe/Madrid');
    });
  });

  describe('Timezone conversion', () => {
    let picoRepo: Repository<PicoUnit>;
    let readingsRepo: Repository<Readings>;

    beforeAll(() => {
      picoRepo = app.get(getRepositoryToken(PicoUnit));
      readingsRepo = app.get(getRepositoryToken(Readings));
    });

    beforeEach(async () => {
      await readingsRepo.clear();
      await picoRepo.clear();
    });

    it('converts Date fields in responses when timezone is set', async () => {
      // Set timezone to Europe/Madrid (UTC+2 in summer, UTC+1 in winter)
      await request(app.getHttpServer())
        .patch('/v1/settings')
        .send({ timezone: 'Europe/Madrid' })
        .expect(200);

      // Seed a reading with a known UTC timestamp
      const unit = await seedPicoUnitPartial(app, {
        handle: 'tz-test',
        port: 5099,
      });

      // Use a fixed timestamp: 2024-06-15T12:00:00Z (summer time, UTC+2)
      const utcTimestamp = new Date('2024-06-15T12:00:00Z');
      await seedReadingForUnit(app, unit, {
        ts: utcTimestamp,
        temperature: 25,
      });

      // Fetch readings
      const res = await request(app.getHttpServer())
        .get(`/v1/pico-units/${unit.id}/readings`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      const ts = res.body.items[0].ts;

      // Should be converted to Europe/Madrid time (UTC+2 in June)
      // 2024-06-15T12:00:00Z → 2024-06-15T14:00:00.000+02:00
      expect(ts).toMatch(/2024-06-15T14:00:00\.\d{3}\+02:00/);
      expect(ts).not.toMatch(/Z$/); // Should not end with Z
    });

    it('returns UTC format when timezone is UTC', async () => {
      // Set timezone to UTC
      await request(app.getHttpServer())
        .patch('/v1/settings')
        .send({ timezone: 'UTC' })
        .expect(200);

      // Seed a reading
      const unit = await seedPicoUnitPartial(app, {
        handle: 'utc-test',
        port: 5098,
      });

      const utcTimestamp = new Date('2024-06-15T12:00:00Z');
      await seedReadingForUnit(app, unit, {
        ts: utcTimestamp,
        temperature: 25,
      });

      // Fetch readings
      const res = await request(app.getHttpServer())
        .get(`/v1/pico-units/${unit.id}/readings`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      const ts = res.body.items[0].ts;

      // Should remain in UTC format (fast path)
      expect(ts).toMatch(/2024-06-15T12:00:00\.\d{3}Z/);
    });
  });
});

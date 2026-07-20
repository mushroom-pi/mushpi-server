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

  describe('GET /pico-units/:id/readings (list)', () => {
    it('returns paginated chronological readings', async () => {
      const unit = await seedPicoUnitPartial(app, {
        handle: 'list-test',
        port: 5010,
      });

      // create 3 readings with increasing ts (older to newer)
      const a = await seedReadingForUnit(app, unit, {
        ts: new Date(Date.now() - 30000),
        temperature: 20,
      });
      const b = await seedReadingForUnit(app, unit, {
        ts: new Date(Date.now() - 20000),
        temperature: 21,
      });
      const c = await seedReadingForUnit(app, unit, {
        ts: new Date(Date.now() - 10000),
        temperature: 22,
      });

      // ask page 1 limit 2 -> should return oldest two (a,b)
      const res = await request(app.getHttpServer())
        .get(`/pico-units/${unit.id}/readings`)
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBe(2);

      // items ordered chronologically: first item has ts === a.ts
      const returnedIds = res.body.items.map((it: any) => it.id);
      expect(returnedIds).toEqual([a.id, b.id]);

      // check pagination metadata
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(2);
      expect(res.body.total).toBe(3);
      expect(res.body.pages).toBe(2);

      // page 2 should return the last (c)
      const res2 = await request(app.getHttpServer())
        .get(`/pico-units/${unit.id}/readings`)
        .query({ page: 2, limit: 2 })
        .expect(200);

      expect(res2.body.items.length).toBe(1);
      expect(res2.body.items[0].id).toBe(c.id);
    });

    it('returns empty list if none', async () => {
      const unit = await seedPicoUnitPartial(app, {
        handle: 'empty',
        port: 5020,
      });

      const res = await request(app.getHttpServer())
        .get(`/pico-units/${unit.id}/readings`)
        .expect(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    describe('time window filtering', () => {
      let unit: PicoUnit;
      let a: Readings;
      let b: Readings;
      let c: Readings;
      const now = Date.now();

      beforeEach(async () => {
        unit = await seedPicoUnitPartial(app, {
          handle: 'time-window',
          port: 5030,
        });

        // deterministic timestamps
        a = await seedReadingForUnit(app, unit, {
          ts: new Date(now - 30000), // t0 - 30s
          temperature: 10,
        });
        b = await seedReadingForUnit(app, unit, {
          ts: new Date(now - 20000), // t0 - 20s
          temperature: 11,
        });
        c = await seedReadingForUnit(app, unit, {
          ts: new Date(now - 10000), // t0 - 10s
          temperature: 12,
        });
      });

      it('filters by start only (inclusive) returning readings >= start', async () => {
        // start at b.ts -> should return b and c
        const startIso = b.ts.toISOString();
        const res = await request(app.getHttpServer())
          .get(`/pico-units/${unit.id}/readings`)
          .query({ start: startIso })
          .expect(200);

        const ids = res.body.items.map((it: any) => it.id);
        expect(ids).toEqual([b.id, c.id]);
        expect(res.body.total).toBe(2);
      });

      it('filters by end only (inclusive) returning readings <= end', async () => {
        // end at b.ts -> should return a and b
        const endIso = b.ts.toISOString();
        const res = await request(app.getHttpServer())
          .get(`/pico-units/${unit.id}/readings`)
          .query({ end: endIso })
          .expect(200);

        const ids = res.body.items.map((it: any) => it.id);
        expect(ids).toEqual([a.id, b.id]);
        expect(res.body.total).toBe(2);
      });

      it('filters by start and end narrowing the window (inclusive)', async () => {
        // start between a and b, end between b and c -> should return just b
        const startBetween = new Date(a.ts.getTime() + 5000).toISOString(); // a + 5s
        const endBetween = new Date(b.ts.getTime() + 5000).toISOString(); // b + 5s

        const res = await request(app.getHttpServer())
          .get(`/pico-units/${unit.id}/readings`)
          .query({ start: startBetween, end: endBetween })
          .expect(200);

        const ids = res.body.items.map((it: any) => it.id);
        expect(ids).toEqual([b.id]);
        expect(res.body.total).toBe(1);
      });

      it('returns empty list when requested window is outside stored readings', async () => {
        // request a window entirely after c
        const startAfter = new Date(c.ts.getTime() + 1000).toISOString();
        const endAfter = new Date(c.ts.getTime() + 2000).toISOString();

        const res = await request(app.getHttpServer())
          .get(`/pico-units/${unit.id}/readings`)
          .query({ start: startAfter, end: endAfter })
          .expect(200);

        expect(res.body.items).toEqual([]);
        expect(res.body.total).toBe(0);
      });

      it('returns 422 for invalid date format', async () => {
        await request(app.getHttpServer())
          .get(`/pico-units/${unit.id}/readings`)
          .query({ start: 'not-a-date' })
          .expect(422);
      });

      it('returns 400 when start > end', async () => {
        const s = new Date(now - 5000).toISOString();
        const e = new Date(now - 20000).toISOString(); // end earlier than start

        const res = await request(app.getHttpServer())
          .get(`/pico-units/${unit.id}/readings`)
          .query({ start: s, end: e })
          .expect(400);

        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });
  });
});

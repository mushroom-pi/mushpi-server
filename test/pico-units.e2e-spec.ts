import { INestApplication } from '@nestjs/common';

import request from 'supertest';

import { PicoUnit } from '../src/modules/pico-units/pico-unit.entity';
import {
  clearPicoUnits,
  getPicoRepo,
  seedManyPicoUnits,
} from './fixtures/pico-units.fixtures';
import { closeTestApp, createTestApp } from './test-setup';

describe('Pico Units (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(async () => {
    await clearPicoUnits(app);
  });

  describe('POST /pico-units (upsert)', () => {
    it('creates a new pico unit (201) and sets last_seen', async () => {
      const res = await request(app.getHttpServer())
        .post('/pico-units')
        .send({
          handle: 'alpha',
          host: 'rpi.local',
          port: 5001,
          software_version: '0.1.0',
          micropython_version: 'v1.26.0 on 2025-08-09 (GNU 14.2.0 MinSizeRel)',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        id: expect.any(Number),
        handle: 'alpha',
        host: 'rpi.local',
        port: 5001,
        enabled: true,
        software_version: '0.1.0',
        micropython_version: 'v1.26.0 on 2025-08-09 (GNU 14.2.0 MinSizeRel)',
      });
      // last_seen should be set by service
      expect(new Date(res.body.last_seen).toString()).not.toBe('Invalid Date');

      // re-upsert same host:port returns the same row (id unchanged)
      const res2 = await request(app.getHttpServer())
        .post('/pico-units')
        .send({
          handle: 'alpha2',
          host: 'rpi.local',
          port: 5001,
          software_version: '0.2.0',
        })
        .expect(201);

      expect(res2.body.id).toBe(res.body.id);
      expect(res2.body.handle).not.toBe(res.body.handle);
      expect(res2.body.software_version).not.toBe(res.body.software_version);
      expect(res2.body.micropython_version).toBe(res.body.micropython_version);
      expect(res2.body.board).toBe(res.body.board);

      // DB has only 1 row
      const repo = await getPicoRepo(app);
      const count = await repo.count();
      expect(count).toBe(1);
    });
  });

  describe('GET /pico-units (list)', () => {
    it('returns paginated list with filters', async () => {
      await seedManyPicoUnits(app, 3); // 3 units

      const res = await request(app.getHttpServer())
        .get('/pico-units')
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(res.body).toMatchObject({
        page: 1,
        limit: 2,
        total: 3,
        pages: 2,
      });
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBe(2);

      // query by q
      const repo = await getPicoRepo(app);
      const one = await repo.findOneBy({ handle: 'unit-2' });
      const resQ = await request(app.getHttpServer())
        .get('/pico-units')
        .query({ q: one!.host }) // search by host
        .expect(200);
      expect(resQ.body.items.some((u: PicoUnit) => u.id === one!.id)).toBe(
        true,
      );
    });
  });
});

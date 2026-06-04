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
          port: 5001,
          software_version: '0.1.0',
          micropython_version: 'v1.26.0 on 2025-08-09 (GNU 14.2.0 MinSizeRel)',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        id: expect.any(Number),
        handle: 'alpha',
        host: 'alpha.local',
        port: 5001,
        enabled: true,
        software_version: '0.1.0',
        micropython_version: 'v1.26.0 on 2025-08-09 (GNU 14.2.0 MinSizeRel)',
      });
      // last_seen should be set by service
      expect(new Date(res.body.last_seen).toString()).not.toBe('Invalid Date');

      // re-upsert same handle returns the same row (id unchanged)
      const res2 = await request(app.getHttpServer())
        .post('/pico-units')
        .send({
          handle: 'alpha',
          port: 5001,
          software_version: '0.2.0',
        })
        .expect(201);

      expect(res2.body.id).toBe(res.body.id);
      expect(res2.body.handle).toBe(res.body.handle);
      expect(res2.body.software_version).not.toBe(res.body.software_version);
      expect(res2.body.micropython_version).toBe(res.body.micropython_version);
      expect(res2.body.board).toBe(res.body.board);

      // DB has only 1 row
      const repo = await getPicoRepo(app);
      const count = await repo.count();
      expect(count).toBe(1);
    });

    it('includes address, host and ipAddress when created with an ip', async () => {
      const res = await request(app.getHttpServer())
        .post('/pico-units')
        .send({
          handle: 'beta',
          port: 5002,
          ip: '192.168.1.50',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        handle: 'beta',
        host: 'beta.local',
        address: 'http://beta.local:5002',
        ipAddress: 'http://192.168.1.50:5002',
        port: 5002,
      });
    });

    it('omits ipAddress when created without an ip', async () => {
      const res = await request(app.getHttpServer())
        .post('/pico-units')
        .send({
          handle: 'gamma',
          port: 5003,
        })
        .expect(201);

      expect(res.body).toMatchObject({
        handle: 'gamma',
        host: 'gamma.local',
        address: 'http://gamma.local:5003',
      });
      expect(res.body.ipAddress).toBeUndefined();
    });

    it('updates ip when re-upserting a pre-existing handle', async () => {
      const res = await request(app.getHttpServer())
        .post('/pico-units')
        .send({ handle: 'delta', ip: '192.168.1.10' })
        .expect(201);

      const res2 = await request(app.getHttpServer())
        .post('/pico-units')
        .send({ handle: 'delta', ip: '10.0.0.99' })
        .expect(201);

      expect(res2.body.id).toBe(res.body.id);
      expect(res2.body.ip).toBe('10.0.0.99');
      expect(res2.body.port).toBe(5000);
      expect(res2.body.ipAddress).toBe('http://10.0.0.99:5000');

      const repo = await getPicoRepo(app);
      const db = await repo.findOneBy({ handle: 'delta' });
      expect(db!.ip).toBe('10.0.0.99');
      expect(db!.port).toBe(5000);
      expect(await repo.count()).toBe(1);
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
        .query({ q: one!.handle }) // search by handle
        .expect(200);
      expect(resQ.body.items.some((u: PicoUnit) => u.id === one!.id)).toBe(
        true,
      );
    });

    it('exposes host, address and ipAddress on listed items', async () => {
      await seedManyPicoUnits(app, 2);

      const res = await request(app.getHttpServer())
        .get('/pico-units')
        .expect(200);

      const items = res.body.items as any[];
      expect(items.length).toBeGreaterThanOrEqual(2);
      for (const item of items) {
        expect(item).toMatchObject({
          host: `${item.handle}.local`,
          address: `http://${item.handle}.local:${item.port}`,
        });
      }
    });
  });
});

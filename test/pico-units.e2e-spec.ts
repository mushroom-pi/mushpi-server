import { INestApplication } from '@nestjs/common';

import request from 'supertest';

import { PicoUnit } from '../src/modules/pico-units/pico-unit.entity';
import {
  clearPicoUnits,
  getPicoRepo,
  seedManyPicoUnits,
  seedPicoUnit,
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
        .send({ handle: 'alpha', host: 'rpi.local', port: 5001 })
        .expect(201);

      expect(res.body).toMatchObject({
        id: expect.any(Number),
        handle: 'alpha',
        host: 'rpi.local',
        port: 5001,
        enabled: true,
      });
      // last_seen should be set by service
      expect(new Date(res.body.last_seen).toString()).not.toBe('Invalid Date');

      // re-upsert same host:port returns the same row (id unchanged)
      const res2 = await request(app.getHttpServer())
        .post('/pico-units')
        .send({ handle: 'alpha2', host: 'rpi.local', port: 5001 })
        .expect(201);

      expect(res2.body.id).toBe(res.body.id);
      // handle may be updated by your upsert logic (you set handle in upsert payload)
      expect(res2.body.handle).toBe('alpha2');

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

  describe('GET /pico-units/:picoUnitId', () => {
    it('returns a single Pico Unit', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'single',
        host: 'one.local',
        port: 5050,
      });

      const res = await request(app.getHttpServer())
        .get(`/pico-units/${unit.id}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: unit.id,
        handle: 'single',
        host: 'one.local',
        port: 5050,
      });
    });

    it('404 when not found', async () => {
      await request(app.getHttpServer()).get('/pico-units/9999').expect(404);
    });
  });

  describe('PATCH /pico-units/:picoUnitId', () => {
    it('updates name/description/enabled', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'editme',
        host: 'edit.local',
        port: 6000,
      });

      const res = await request(app.getHttpServer())
        .patch(`/pico-units/${unit.id}`)
        .send({ name: 'New Name', description: 'Updated', enabled: false })
        .expect(200);

      expect(res.body).toMatchObject({
        id: unit.id,
        name: 'New Name',
        description: 'Updated',
        enabled: false,
      });
    });
  });

  describe('DELETE /pico-units/:picoUnitId', () => {
    it('deletes a unit', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'deleteme',
        host: 'delete.local',
        port: 7000,
      });

      await request(app.getHttpServer())
        .delete(`/pico-units/${unit.id}`)
        .expect(204)
        .expect(({ body }) => expect(body).toMatchObject({}));

      // confirm it’s gone
      await request(app.getHttpServer())
        .get(`/pico-units/${unit.id}`)
        .expect(404);
    });
  });
});

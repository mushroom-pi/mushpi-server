import { INestApplication } from '@nestjs/common';

import axios from 'axios';
import request from 'supertest';

import { PicoUnit } from '../src/modules/pico-units/pico-unit.entity';
import {
  clearPicoUnits,
  getPicoRepo,
  seedManyPicoUnits,
  seedPicoUnit,
} from './fixtures/pico-units.fixtures';
import { closeTestApp, createTestApp } from './test-setup';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

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
    mockedAxios.get.mockReset();
    mockedAxios.isAxiosError = jest.fn(
      (err: any) => err?.isAxiosError === true,
    ) as any;
    await clearPicoUnits(app);
  });

  describe('POST /pico-units/announce (hardware)', () => {
    const announceHeaders = { 'x-pico-secret': 'mushpi-dev-secret' };

    it('creates a new unit (201) with full payload and sets last_seen', async () => {
      const res = await request(app.getHttpServer())
        .post('/pico-units/announce')
        .set(announceHeaders)
        .send({
          handle: 'alpha',
          port: 5001,
          ip: '192.168.1.50',
          software_version: '0.1.0',
          micropython_version: 'v1.26.0 on 2025-08-09 (GNU 14.2.0 MinSizeRel)',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        id: expect.any(Number),
        handle: 'alpha',
        host: 'alpha.local',
        port: 5001,
        ip: '192.168.1.50',
        enabled: true,
        software_version: '0.1.0',
        micropython_version: 'v1.26.0 on 2025-08-09 (GNU 14.2.0 MinSizeRel)',
      });
      expect(new Date(res.body.last_seen).toString()).not.toBe('Invalid Date');
    });

    it('re-announces same handle with new IP → same id, ip updated, last_seen refreshed', async () => {
      const res = await request(app.getHttpServer())
        .post('/pico-units/announce')
        .set(announceHeaders)
        .send({ handle: 'alpha', ip: '192.168.1.10' })
        .expect(201);

      // wait a tick so last_seen differs
      await new Promise((r) => setTimeout(r, 10));

      const res2 = await request(app.getHttpServer())
        .post('/pico-units/announce')
        .set(announceHeaders)
        .send({ handle: 'alpha', ip: '10.0.0.99' })
        .expect(201);

      expect(res2.body.id).toBe(res.body.id);
      expect(res2.body.ip).toBe('10.0.0.99');
      expect(new Date(res2.body.last_seen).getTime()).toBeGreaterThanOrEqual(
        new Date(res.body.last_seen).getTime(),
      );

      const repo = await getPicoRepo(app);
      expect(await repo.count()).toBe(1);
    });

    it('returns 401 when X-Pico-Secret is missing', async () => {
      await request(app.getHttpServer())
        .post('/pico-units/announce')
        .send({ handle: 'alpha' })
        .expect(401);
    });

    it('returns 401 when X-Pico-Secret is wrong', async () => {
      await request(app.getHttpServer())
        .post('/pico-units/announce')
        .set({ 'x-pico-secret': 'wrong-secret' })
        .send({ handle: 'alpha' })
        .expect(401);
    });

    it('returns 409 when re-announcing existing handle WITHOUT ip', async () => {
      await request(app.getHttpServer())
        .post('/pico-units/announce')
        .set(announceHeaders)
        .send({ handle: 'alpha', ip: '192.168.1.10' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/pico-units/announce')
        .set(announceHeaders)
        .send({ handle: 'alpha' })
        .expect(409);
    });

    it('returns 422 when handle is missing', async () => {
      await request(app.getHttpServer())
        .post('/pico-units/announce')
        .set(announceHeaders)
        .send({})
        .expect(422);
    });
  });

  describe('POST /pico-units (manual create)', () => {
    it('returns 201 and creates { handle, port: 5000 } when ping succeeds', async () => {
      mockedAxios.get.mockResolvedValueOnce({ status: 200, data: 'pong' });

      const res = await request(app.getHttpServer())
        .post('/pico-units')
        .send({ handle: 'manual-1' })
        .expect(201);

      expect(res.body).toMatchObject({
        id: expect.any(Number),
        handle: 'manual-1',
        port: 5000,
      });
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'http://manual-1.local:5000/ping',
        expect.objectContaining({ timeout: 5000 }),
      );
    });

    it('returns 424 when unreachable', async () => {
      mockedAxios.get.mockRejectedValueOnce({ isAxiosError: true });

      const res = await request(app.getHttpServer())
        .post('/pico-units')
        .send({ handle: 'unreachable' })
        .expect(424);

      expect(res.body.description).toContain('unreachable');
      expect(res.body.description).toContain(
        'http://unreachable.local:5000/ping',
      );

      const repo = await getPicoRepo(app);
      expect(await repo.count()).toBe(0);
    });

    it('returns 409 when handle already exists', async () => {
      await seedPicoUnit(app, { handle: 'existing', port: 5099 });

      mockedAxios.get.mockResolvedValueOnce({ status: 200, data: 'pong' });

      await request(app.getHttpServer())
        .post('/pico-units')
        .send({ handle: 'existing' })
        .expect(409);
    });

    it('returns 422 when handle is missing', async () => {
      await request(app.getHttpServer())
        .post('/pico-units')
        .send({})
        .expect(422);
    });

    it('returns 422 when handle is empty string', async () => {
      await request(app.getHttpServer())
        .post('/pico-units')
        .send({ handle: '' })
        .expect(422);
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

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
        .post('/v1/pico-units/announce')
        .set(announceHeaders)
        .send({
          handle: 'alpha',
          port: 5001,
          ip: '192.168.1.50',
          firmware_version: '0.1.0',
          api_version: 1,
          micropython_version: 'v1.26.0 on 2025-08-09 (GNU 14.2.0 MinSizeRel)',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        id: expect.any(Number),
        handle: 'alpha',
        host: 'alpha.local',
        port: 5001,
        ip: '192.168.1.50',
        monitored: true,
        firmware_version: '0.1.0',
        api_version: 1,
        api_compatibility: 'compatible',
        micropython_version: 'v1.26.0 on 2025-08-09 (GNU 14.2.0 MinSizeRel)',
      });
      expect(new Date(res.body.last_seen).toString()).not.toBe('Invalid Date');
    });

    it('re-announces same handle with new IP → same id, ip updated, last_seen refreshed', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/pico-units/announce')
        .set(announceHeaders)
        .send({ handle: 'alpha', ip: '192.168.1.10' })
        .expect(201);

      // wait a tick so last_seen differs
      await new Promise((r) => setTimeout(r, 10));

      const res2 = await request(app.getHttpServer())
        .post('/v1/pico-units/announce')
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
        .post('/v1/pico-units/announce')
        .send({ handle: 'alpha' })
        .expect(401);
    });

    it('returns 401 when X-Pico-Secret is wrong', async () => {
      await request(app.getHttpServer())
        .post('/v1/pico-units/announce')
        .set({ 'x-pico-secret': 'wrong-secret' })
        .send({ handle: 'alpha' })
        .expect(401);
    });

    it('returns 409 when re-announcing existing handle WITHOUT ip', async () => {
      await request(app.getHttpServer())
        .post('/v1/pico-units/announce')
        .set(announceHeaders)
        .send({ handle: 'alpha', ip: '192.168.1.10' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/v1/pico-units/announce')
        .set(announceHeaders)
        .send({ handle: 'alpha' })
        .expect(409);
    });

    it('returns 422 when handle is missing', async () => {
      await request(app.getHttpServer())
        .post('/v1/pico-units/announce')
        .set(announceHeaders)
        .send({})
        .expect(422);
    });

    it('announces with api_version → persisted on response and readable via GET by id', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/pico-units/announce')
        .set(announceHeaders)
        .send({
          handle: 'apiver',
          ip: '192.168.1.61',
          firmware_version: '0.2.0',
          api_version: 1,
        })
        .expect(201);

      expect(res.body.firmware_version).toBe('0.2.0');
      expect(res.body.api_version).toBe(1);

      const fetched = await request(app.getHttpServer())
        .get(`/v1/pico-units/${res.body.id}`)
        .expect(200);
      expect(fetched.body.firmware_version).toBe('0.2.0');
      expect(fetched.body.api_version).toBe(1);
    });

    it('returns 422 when api_version is below the minimum (0 — no API v0)', async () => {
      await request(app.getHttpServer())
        .post('/v1/pico-units/announce')
        .set(announceHeaders)
        .send({ handle: 'apiver-min', ip: '192.168.1.62', api_version: 0 })
        .expect(422);
    });

    it('announces without api_version → 201 with api_version null (unit predates the field)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/pico-units/announce')
        .set(announceHeaders)
        .send({ handle: 'apiver-absent', ip: '192.168.1.63' })
        .expect(201);

      expect(res.body.api_version).toBeNull();
      // Contact evidence (announce sets last_seen) + NULL api_version ⇒ the
      // firmware predates the handshake ⇒ incompatible, NOT unknown.
      expect(res.body.api_compatibility).toBe('incompatible');
    });

    it('returns 422 when api_version is not an integer', async () => {
      await request(app.getHttpServer())
        .post('/v1/pico-units/announce')
        .set(announceHeaders)
        .send({ handle: 'apiver-bad', ip: '192.168.1.64', api_version: 'abc' })
        .expect(422);
    });

    it('returns 422 when announcing the removed software_version key (hard cutover — no compatibility window)', async () => {
      await request(app.getHttpServer())
        .post('/v1/pico-units/announce')
        .set(announceHeaders)
        .send({
          handle: 'cutover',
          ip: '192.168.1.65',
          software_version: '0.1.0',
        })
        .expect(422);
    });

    it('returns 422 when firmware_version is NOT strict SemVer (pre-release/build rejected)', async () => {
      for (const bad of ['0.8', 'v0.8.4', '0.8.4-rc.1', '0.8.4+build', '']) {
        await request(app.getHttpServer())
          .post('/v1/pico-units/announce')
          .set(announceHeaders)
          .send({ handle: 'badfw', ip: '192.168.1.70', firmware_version: bad })
          .expect(422);
      }
    });

    it('announces strict SemVer firmware_version 0.8.4 (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/pico-units/announce')
        .set(announceHeaders)
        .send({
          handle: 'goodfw',
          ip: '192.168.1.71',
          firmware_version: '0.8.4',
          api_version: 1,
        })
        .expect(201);
      expect(res.body.firmware_version).toBe('0.8.4');
    });

    it('announces api_version 2 (newer contract) with 201, stores it raw, flags incompatible', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/pico-units/announce')
        .set(announceHeaders)
        .send({
          handle: 'future',
          ip: '192.168.1.72',
          firmware_version: '0.9.0',
          api_version: 2,
        })
        .expect(201);
      expect(res.body.api_version).toBe(2);
      expect(res.body.api_compatibility).toBe('incompatible');
      const repo = await getPicoRepo(app);
      const stored = await repo.findOneBy({ handle: 'future' });
      expect(stored!.api_version).toBe(2);
    });

    it('re-announce preserves api_version when the field is omitted', async () => {
      await request(app.getHttpServer())
        .post('/v1/pico-units/announce')
        .set(announceHeaders)
        .send({
          handle: 'preserve',
          ip: '192.168.1.66',
          firmware_version: '0.2.0',
          api_version: 2,
        })
        .expect(201);

      // Re-announce the same handle with a new IP, omitting api_version.
      const res2 = await request(app.getHttpServer())
        .post('/v1/pico-units/announce')
        .set(announceHeaders)
        .send({ handle: 'preserve', ip: '10.0.0.66' })
        .expect(201);

      expect(res2.body.ip).toBe('10.0.0.66');
      expect(res2.body.api_version).toBe(2);

      const repo = await getPicoRepo(app);
      const stored = await repo.findOneBy({ handle: 'preserve' });
      expect(stored!.api_version).toBe(2);
    });
  });

  describe('POST /pico-units (manual create)', () => {
    it('returns 201 and creates { handle, port: 5000 } when ping succeeds', async () => {
      mockedAxios.get.mockResolvedValueOnce({ status: 200, data: 'pong' });

      const res = await request(app.getHttpServer())
        .post('/v1/pico-units')
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

      // The successful /ping is contact evidence: last_seen is set so the
      // verdict resolves to `incompatible` (contacted, never reported),
      // NOT `unknown` (no basis to judge).
      expect(new Date(res.body.last_seen).toString()).not.toBe('Invalid Date');
      expect(res.body.api_compatibility).toBe('incompatible');
    });

    it('returns 424 when unreachable', async () => {
      mockedAxios.get.mockRejectedValueOnce({ isAxiosError: true });

      const res = await request(app.getHttpServer())
        .post('/v1/pico-units')
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
        .post('/v1/pico-units')
        .send({ handle: 'existing' })
        .expect(409);
    });

    it('returns 422 when handle is missing', async () => {
      await request(app.getHttpServer())
        .post('/v1/pico-units')
        .send({})
        .expect(422);
    });

    it('returns 422 when handle is empty string', async () => {
      await request(app.getHttpServer())
        .post('/v1/pico-units')
        .send({ handle: '' })
        .expect(422);
    });
  });

  describe('api_compatibility verdict (computed, separate from status)', () => {
    const announceHeaders = { 'x-pico-secret': 'mushpi-dev-secret' };

    it('within-range api_version 1 → compatible on announce response and later GETs', async () => {
      const created = await request(app.getHttpServer())
        .post('/v1/pico-units/announce')
        .set(announceHeaders)
        .send({ handle: 'compat', ip: '192.168.1.80', api_version: 1 })
        .expect(201);
      expect(created.body.api_compatibility).toBe('compatible');

      const res = await request(app.getHttpServer())
        .get(`/v1/pico-units/${created.body.id}`)
        .expect(200);
      expect(res.body.api_compatibility).toBe('compatible');
    });

    it('out-of-range (above MAX) api_version → incompatible while status stays healthy (accept-and-flag, not folded into health)', async () => {
      const created = await request(app.getHttpServer())
        .post('/v1/pico-units/announce')
        .set(announceHeaders)
        .send({
          handle: 'incompat-healthy',
          ip: '192.168.1.81',
          api_version: 2,
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/v1/pico-units/${created.body.id}`)
        .expect(200);
      // The two computations are orthogonal: a unit can be healthy AND
      // incompatible at the same time.
      expect(res.body.api_compatibility).toBe('incompatible');
      expect(res.body.status).toBe('healthy');
    });

    it('NULL api_version + contact evidence (last_seen set) → incompatible (firmware predates the handshake)', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'legacy-contacted',
        port: 5182,
        api_version: null as unknown as number,
        last_seen: new Date(),
      });

      const res = await request(app.getHttpServer())
        .get(`/v1/pico-units/${unit.id}`)
        .expect(200);
      expect(res.body.api_compatibility).toBe('incompatible');
    });

    it('NULL api_version + no contact evidence (last_seen null) → unknown (no basis to judge)', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'never-seen',
        port: 5183,
        api_version: null as unknown as number,
        last_seen: undefined,
      });

      const res = await request(app.getHttpServer())
        .get(`/v1/pico-units/${unit.id}`)
        .expect(200);
      expect(res.body.api_compatibility).toBe('unknown');
    });

    it('every serialized PicoUnit in the list carries the verdict field', async () => {
      await seedPicoUnit(app, {
        handle: 'v-list1',
        port: 5184,
        api_version: 1,
      });
      await seedPicoUnit(app, {
        handle: 'v-list2',
        port: 5185,
        api_version: 3,
      });
      await seedPicoUnit(app, {
        handle: 'v-list3',
        port: 5186,
        api_version: null as unknown as number,
        last_seen: undefined,
      });

      const res = await request(app.getHttpServer())
        .get('/v1/pico-units')
        .expect(200);

      const byHandle = Object.fromEntries(
        (res.body.items as any[]).map((u) => [u.handle, u]),
      );
      expect(byHandle['v-list1'].api_compatibility).toBe('compatible');
      expect(byHandle['v-list2'].api_compatibility).toBe('incompatible');
      expect(byHandle['v-list3'].api_compatibility).toBe('unknown');
    });
  });

  describe('GET /pico-units (list)', () => {
    it('returns paginated list with filters', async () => {
      await seedManyPicoUnits(app, 3); // 3 units

      const res = await request(app.getHttpServer())
        .get('/v1/pico-units')
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
        .get('/v1/pico-units')
        .query({ q: one!.handle }) // search by handle
        .expect(200);
      expect(resQ.body.items.some((u: PicoUnit) => u.id === one!.id)).toBe(
        true,
      );
    });

    it('exposes host, address and ipAddress on listed items', async () => {
      await seedManyPicoUnits(app, 2);

      const res = await request(app.getHttpServer())
        .get('/v1/pico-units')
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

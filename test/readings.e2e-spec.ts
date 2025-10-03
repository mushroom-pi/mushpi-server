import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import axios, { AxiosError } from 'axios';
import request from 'supertest';
import { Repository } from 'typeorm';

import { PicoUnit } from '../src/modules/pico-units/pico-unit.entity';
import { Readings } from '../src/modules/readings/readings.entity';
import {
  sampleDeviceResponse,
  seedPicoUnitPartial,
  seedReadingForUnit,
} from './fixtures/readings.fixtures';
import { closeTestApp, createTestApp } from './test-setup';

// jest mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

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
    // reset axios mock and clear DB
    mockedAxios.get.mockReset();

    if (readingsRepo) await readingsRepo.clear();
    if (picoRepo) await picoRepo.clear();
  });

  describe('GET /pico-units/:id/readings (list)', () => {
    it('returns paginated chronological readings', async () => {
      const unit = await seedPicoUnitPartial(app, {
        handle: 'list-test',
        host: 'list.host',
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
        host: 'empty.host',
        port: 5020,
      });

      const res = await request(app.getHttpServer())
        .get(`/pico-units/${unit.id}/readings`)
        .expect(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.total).toBe(0);
    });
  });

  describe('GET /pico-units/:id/readings/poll (live fetch & save)', () => {
    it('fetches device, validates and saves a reading, writing time_to_response_ms', async () => {
      const unit = await seedPicoUnitPartial(app, {
        handle: 'poll-test',
        host: 'poll.host',
        port: 5050,
      });

      // mock axios.get to return the sample JSON
      mockedAxios.get.mockResolvedValueOnce({
        data: sampleDeviceResponse,
        status: 200,
      });

      const res = await request(app.getHttpServer())
        .get(`/pico-units/${unit.id}/readings/poll`)
        .expect(200);

      // response should contain created Reading (entity)
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('pico_unit_id', unit.id);
      expect(typeof res.body.time_to_response_ms).toBe('number');
      expect(res.body.time_to_response_ms).toBeGreaterThanOrEqual(0);

      // confirm row exists in DB
      const persisted = await readingsRepo.findOneBy({ id: res.body.id });
      expect(persisted).toBeDefined();
      expect(persisted!.pico_unit_id).toBe(unit.id);
      expect(typeof persisted!.time_to_response_ms).toBe('number');
    });

    it('locks concurrent polling: second request should fail while first is running', async () => {
      const unit = await seedPicoUnitPartial(app, {
        handle: 'poll-test',
        host: 'poll.host',
        port: 5050,
      });

      const DELAY_MS = 300;

      // mock axios.get to resolve after a short delay
      mockedAxios.get.mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ data: sampleDeviceResponse, status: 200 }),
              DELAY_MS,
            ),
          ),
      );

      // For safety, ensure subsequent calls (if any) also return something predictable
      mockedAxios.get.mockImplementation(() =>
        Promise.resolve({ data: sampleDeviceResponse, status: 200 }),
      );

      // Start two concurrent requests without awaiting the first
      const url = `/pico-units/${unit.id}/readings/poll`;

      // Launch both requests nearly simultaneously
      const req1 = request(app.getHttpServer()).get(url);
      const req2 = request(app.getHttpServer()).get(url);

      // Wait for both to finish (run concurrently)
      const [res1, res2] = await Promise.all([req1, req2]);

      // One should be success (200), the other should be an error due to lock.
      const statuses = [res1.status, res2.status].sort();
      expect(statuses[0]).toBe(200);
      expect(statuses[1]).toBeGreaterThanOrEqual(423);

      // Assert lock-specific message is present in the error response
      const errRes = res1.status >= 400 ? res1 : res2;
      expect(errRes.body).toBeDefined();
      // The body should contain text about locking; adjust if your LockedException message differs
      const bodyStr = JSON.stringify(errRes.body).toLowerCase();
      expect(
        bodyStr.includes('poll') ||
          bodyStr.includes('locked') ||
          bodyStr.includes('already polling') ||
          bodyStr.includes('system is already polling'),
      ).toBeTruthy();

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);

      // Confirm exactly one reading was persisted for this pico unit
      const count = await readingsRepo.countBy({ pico_unit_id: unit.id });
      expect(count).toBe(1);
    });

    it("doesn't lock if the previous request has already been completed", async () => {
      const unit = await seedPicoUnitPartial(app, {
        handle: 'poll-test',
        host: 'poll.host',
        port: 5050,
      });

      const DELAY_MS = 300;

      // mock axios.get to resolve after a short delay
      mockedAxios.get.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ data: sampleDeviceResponse, status: 200 }),
              DELAY_MS,
            ),
          ),
      );

      // For safety, ensure subsequent calls (if any) also return something predictable
      mockedAxios.get.mockImplementation(() =>
        Promise.resolve({ data: sampleDeviceResponse, status: 200 }),
      );

      // Start two concurrent requests without awaiting the first
      const url = `/pico-units/${unit.id}/readings/poll`;

      // Launch both requests one after the first one finishes
      await request(app.getHttpServer()).get(url).expect(200);
      await request(app.getHttpServer()).get(url).expect(200);

      expect(mockedAxios.get).toHaveBeenCalledTimes(2);

      // Confirm exactly two readings were persisted for this pico unit
      const count = await readingsRepo.countBy({ pico_unit_id: unit.id });
      expect(count).toBe(2);
    });

    it('maps a remote validation error to 412 Precondition Failed (and does not persist)', async () => {
      const unit = await seedPicoUnitPartial(app, {
        handle: 'poll-bad',
        host: 'bad.host',
        port: 5051,
      });

      // mock axios.get to return invalid payload (e.g., missing sensors)
      mockedAxios.get.mockResolvedValueOnce({
        data: { bad: 'payload' },
        status: 200,
      });

      const res = await request(app.getHttpServer())
        .get(`/pico-units/${unit.id}/readings/poll`)
        .expect(412);

      // should not have created any reading
      const count = await readingsRepo.countBy({ pico_unit_id: unit.id });
      expect(count).toBe(0);
      expect(res.body).toHaveProperty('statusCode', 412);
      expect(res.body).toHaveProperty('message');
    });

    it('maps a network failure to 502 Bad Gateway and does not persist', async () => {
      const unit = await seedPicoUnitPartial(app, {
        handle: 'poll-netfail',
        host: 'nf.host',
        port: 5052,
      });

      // simulate network error with axios-like error with .request
      const axErr: Partial<AxiosError> = Object.assign(
        new Error('no response'),
        { isAxiosError: true, request: {} },
      );
      mockedAxios.get.mockRejectedValueOnce(axErr as AxiosError);

      const res = await request(app.getHttpServer())
        .get(`/pico-units/${unit.id}/readings/poll`)
        .expect(502);

      const count = await readingsRepo.countBy({ pico_unit_id: unit.id });
      expect(count).toBe(0);
      expect(res.body).toHaveProperty('statusCode', 502);
    });
  });
});

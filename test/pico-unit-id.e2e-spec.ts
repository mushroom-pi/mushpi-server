import { INestApplication } from '@nestjs/common';

import axios, { AxiosError } from 'axios';
import request from 'supertest';

import {
  clearPicoUnits,
  getPicoRepo,
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
    await clearPicoUnits(app);
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

  describe('GET /pico-units/:picoUnitId/ping', () => {
    it('returns pong and updates last_seen on success', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'ping-success',
        host: 'ping.ok',
        port: 8000,
      });

      // make axios.get succeed
      mockedAxios.get.mockResolvedValueOnce({ status: 200, data: 'pong' });

      // read previous last_seen
      const repo = await getPicoRepo(app);
      const before = (await repo.findOneBy({ id: unit.id }))!.last_seen;

      const res = await request(app.getHttpServer())
        .get(`/pico-units/${unit.id}/ping`)
        .expect(200);

      // controller returns string 'pong'
      expect(res.text === 'pong' || res.body === 'pong').toBeTruthy();

      // last_seen should be updated (newer than before)
      const after = (await repo.findOneBy({ id: unit.id }))!.last_seen;
      expect(new Date(after).getTime()).toBeGreaterThan(
        new Date(before).getTime(),
      );
      expect(mockedAxios.get).toHaveBeenCalledWith(
        `http://${unit.host}:${unit.port}/ping`.replace(/([^:])\/\//, '$1/'),
      ); // not strict, just ensures call
    });

    it('maps axios response errors to 417 Expectation Failed', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'ping-respond-error',
        host: 'ping.err',
        port: 8001,
      });

      // construct an axios-like error with .response
      const error = Object.assign(new Error('remote 500'), {
        isAxiosError: true,
        response: { status: 500, data: 'boom' },
      });

      mockedAxios.get.mockRejectedValueOnce(error as AxiosError);

      const res = await request(app.getHttpServer())
        .get(`/pico-units/${unit.id}/ping`)
        .expect(417);

      // response body should be your ExceptionResponseBody shape with statusCode 417
      expect(res.body).toHaveProperty('statusCode', 417);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('message');
    });

    it('maps axios no-response to 502 Bad Gateway', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'ping-no-response',
        host: 'ping.noreply',
        port: 8002,
      });

      const error: Partial<AxiosError> = Object.assign(
        new Error('no response'),
        {
          isAxiosError: true,
          request: {}, // indicates request was made but no response
        },
      );

      mockedAxios.get.mockRejectedValueOnce(error as AxiosError);

      const res = await request(app.getHttpServer())
        .get(`/pico-units/${unit.id}/ping`)
        .expect(502);

      expect(res.body).toHaveProperty('statusCode', 502);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('message');
    });

    it('maps other axios failures to 424 Failed Dependency', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'ping-other-err',
        host: 'ping.bad',
        port: 8003,
      });

      const error: Partial<AxiosError> = Object.assign(
        new Error('bad things'),
        {
          isAxiosError: true,
          // neither response nor request
        },
      );

      mockedAxios.get.mockRejectedValueOnce(error as AxiosError);

      const res = await request(app.getHttpServer())
        .get(`/pico-units/${unit.id}/ping`)
        .expect(424);

      expect(res.body).toHaveProperty('statusCode', 424);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('message');
    });
  });
});

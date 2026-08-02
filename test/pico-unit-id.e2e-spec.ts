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
    mockedAxios.post.mockReset();
    mockedAxios.isAxiosError = jest.fn(
      (err: any) => err?.isAxiosError === true,
    ) as any;
    await clearPicoUnits(app);
  });

  describe('GET /pico-units/:picoUnitId', () => {
    it('returns a single Pico Unit', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'single',
        port: 5050,
      });

      const res = await request(app.getHttpServer())
        .get(`/v1/pico-units/${unit.id}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: unit.id,
        handle: 'single',
        host: 'single.local',
        port: 5050,
      });
    });

    it('includes address, host and ipAddress for a unit with ip', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'with-ip',
        port: 5051,
        ip: '10.0.0.1',
      });

      const res = await request(app.getHttpServer())
        .get(`/v1/pico-units/${unit.id}`)
        .expect(200);

      expect(res.body).toMatchObject({
        host: 'with-ip.local',
        address: 'http://with-ip.local:5051',
        ipAddress: 'http://10.0.0.1:5051',
      });
    });

    it('omits ipAddress for a unit without ip', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'no-ip',
        port: 5052,
        ip: undefined as unknown as string,
      });

      const res = await request(app.getHttpServer())
        .get(`/v1/pico-units/${unit.id}`)
        .expect(200);

      expect(res.body).toMatchObject({
        host: 'no-ip.local',
        address: 'http://no-ip.local:5052',
      });
      expect(res.body.ipAddress).toBeUndefined();
    });

    it('404 when not found', async () => {
      await request(app.getHttpServer()).get('/v1/pico-units/9999').expect(404);
    });
  });

  describe('PATCH /pico-units/:picoUnitId', () => {
    it('updates name/description/monitored', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'editme',
        port: 6000,
      });

      const res = await request(app.getHttpServer())
        .patch(`/v1/pico-units/${unit.id}`)
        .send({ name: 'New Name', description: 'Updated', monitored: false })
        .expect(200);

      expect(res.body).toMatchObject({
        id: unit.id,
        name: 'New Name',
        description: 'Updated',
        monitored: false,
      });
    });
  });

  describe('DELETE /pico-units/:picoUnitId', () => {
    it('deletes a unit', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'deleteme',
        port: 7000,
      });

      await request(app.getHttpServer())
        .delete(`/v1/pico-units/${unit.id}`)
        .expect(204)
        .expect(({ body }) => expect(body).toMatchObject({}));

      // confirm it’s gone
      await request(app.getHttpServer())
        .get(`/v1/pico-units/${unit.id}`)
        .expect(404);
    });
  });

  describe('GET /pico-units/:picoUnitId/ping', () => {
    it('returns pong and updates last_seen on success', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'ping-success',
        port: 8000,
      });

      // make axios.get succeed
      mockedAxios.get.mockResolvedValueOnce({ status: 200, data: 'pong' });

      // read previous last_seen
      const repo = await getPicoRepo(app);
      const before = (await repo.findOneBy({ id: unit.id }))!.last_seen;

      const res = await request(app.getHttpServer())
        .get(`/v1/pico-units/${unit.id}/ping`)
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
        { timeout: 5000 },
      ); // not strict, just ensures call
    });

    it('maps axios response errors to 417 Expectation Failed', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'ping-respond-error',
        port: 8001,
        ip: undefined as unknown as string,
      });

      // construct an axios-like error with .response
      const error = Object.assign(new Error('remote 500'), {
        isAxiosError: true,
        response: { status: 500, data: 'boom' },
      });

      mockedAxios.get.mockRejectedValueOnce(error as AxiosError);

      const res = await request(app.getHttpServer())
        .get(`/v1/pico-units/${unit.id}/ping`)
        .expect(417);

      // response body should be your ExceptionResponseBody shape with statusCode 417
      expect(res.body).toHaveProperty('statusCode', 417);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('message');
    });

    it('maps axios no-response to 502 Bad Gateway', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'ping-no-response',
        port: 8002,
        ip: undefined as unknown as string,
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
        .get(`/v1/pico-units/${unit.id}/ping`)
        .expect(502);

      expect(res.body).toHaveProperty('statusCode', 502);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('message');
    });

    it('maps other axios failures to 424 Failed Dependency', async () => {
      const unit = await seedPicoUnit(app, {
        handle: 'ping-other-err',
        port: 8003,
        ip: undefined as unknown as string,
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
        .get(`/v1/pico-units/${unit.id}/ping`)
        .expect(424);

      expect(res.body).toHaveProperty('statusCode', 424);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('message');
    });

    describe('IP fallback', () => {
      it('falls back to IP address when mDNS fails and unit has ip', async () => {
        const unit = await seedPicoUnit(app, {
          handle: 'fb-ip',
          port: 8004,
          ip: '10.0.0.2',
        });

        const networkError = Object.assign(new Error('no route'), {
          isAxiosError: true,
          request: {},
        });

        mockedAxios.get
          .mockRejectedValueOnce(networkError as AxiosError) // mDNS fails
          .mockResolvedValueOnce({ status: 200, data: 'pong' }); // IP succeeds

        const res = await request(app.getHttpServer())
          .get(`/v1/pico-units/${unit.id}/ping`)
          .expect(200);

        expect(res.text === 'pong' || res.body === 'pong').toBeTruthy();

        expect(mockedAxios.get).toHaveBeenNthCalledWith(
          1,
          `http://fb-ip.local:8004/ping`,
          { timeout: 5000 },
        );
        expect(mockedAxios.get).toHaveBeenNthCalledWith(
          2,
          `http://10.0.0.2:8004/ping`,
          { timeout: 5000 },
        );
      });

      it('fails with 502 when mDNS fails and unit has no ip', async () => {
        const unit = await seedPicoUnit(app, {
          handle: 'fb-no-ip',
          port: 8005,
          ip: undefined as unknown as string,
        });

        const networkError = Object.assign(new Error('no route'), {
          isAxiosError: true,
          request: {},
        });

        mockedAxios.get.mockRejectedValueOnce(networkError as AxiosError);

        await request(app.getHttpServer())
          .get(`/v1/pico-units/${unit.id}/ping`)
          .expect(502);
      });

      it('fails with 417 when mDNS returns a server error regardless of ip', async () => {
        const unit = await seedPicoUnit(app, {
          handle: 'fb-server-err',
          port: 8006,
          ip: '10.0.0.3',
        });

        const serverError = Object.assign(new Error('remote 500'), {
          isAxiosError: true,
          response: { status: 500, data: 'boom' },
        });

        mockedAxios.get.mockRejectedValueOnce(serverError as AxiosError);

        await request(app.getHttpServer())
          .get(`/v1/pico-units/${unit.id}/ping`)
          .expect(417);
      });
    });
  });
});

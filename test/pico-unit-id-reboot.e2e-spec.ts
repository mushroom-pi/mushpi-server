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

describe('PUT /pico-units/:picoUnitId/reboot (e2e)', () => {
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

  it('happy path: soft reboot returns 202 and echoes type', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'reboot-soft',
      port: 9000,
    });

    mockedAxios.post.mockResolvedValueOnce({ status: 200, data: {} });

    const res = await request(app.getHttpServer())
      .put(`/pico-units/${unit.id}/reboot`)
      .send({ type: 'soft' })
      .expect(202);

    expect(res.body).toMatchObject({
      message: 'Reboot initiated',
      type: 'soft',
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      `http://reboot-soft.local:9000/reboot`,
      { type: 'soft' },
      { timeout: 5000 },
    );

    // failed_calls should NOT be incremented
    const repo = await getPicoRepo(app);
    const updated = await repo.findOneBy({ id: unit.id });
    expect(updated!.failed_calls).toBe(0);
  });

  it('connection drop (no ip): treats as success, does not increment failed_calls', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'reboot-drop',
      port: 9001,
      ip: undefined as unknown as string,
    });

    const networkError = Object.assign(new Error('socket hang up'), {
      isAxiosError: true,
      request: {},
    });

    mockedAxios.post.mockRejectedValueOnce(networkError as AxiosError);

    const res = await request(app.getHttpServer())
      .put(`/pico-units/${unit.id}/reboot`)
      .send({ type: 'soft' })
      .expect(202);

    expect(res.body).toMatchObject({
      message: 'Reboot initiated',
      type: 'soft',
    });

    const repo = await getPicoRepo(app);
    const updated = await repo.findOneBy({ id: unit.id });
    expect(updated!.failed_calls).toBe(0);
  });

  it('connection drop with IP fallback: retries against IP and returns 202', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'reboot-ip-fb',
      port: 9002,
      ip: '10.0.0.5',
    });

    const networkError = Object.assign(new Error('no route'), {
      isAxiosError: true,
      request: {},
    });

    mockedAxios.post
      .mockRejectedValueOnce(networkError as AxiosError) // mDNS fails
      .mockRejectedValueOnce(networkError as AxiosError); // IP also drops (expected)

    const res = await request(app.getHttpServer())
      .put(`/pico-units/${unit.id}/reboot`)
      .send({ type: 'soft' })
      .expect(202);

    expect(res.body).toMatchObject({
      message: 'Reboot initiated',
      type: 'soft',
    });

    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      `http://reboot-ip-fb.local:9002/reboot`,
      { type: 'soft' },
      { timeout: 5000 },
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      `http://10.0.0.5:9002/reboot`,
      { type: 'soft' },
      { timeout: 5000 },
    );
  });

  it('hard type: echoes hard in response', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'reboot-hard',
      port: 9003,
    });

    mockedAxios.post.mockResolvedValueOnce({ status: 200, data: {} });

    const res = await request(app.getHttpServer())
      .put(`/pico-units/${unit.id}/reboot`)
      .send({ type: 'hard' })
      .expect(202);

    expect(res.body).toMatchObject({
      message: 'Reboot initiated',
      type: 'hard',
    });
  });

  it('invalid type: returns 422 and does not call axios', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'reboot-invalid',
      port: 9004,
    });

    await request(app.getHttpServer())
      .put(`/pico-units/${unit.id}/reboot`)
      .send({ type: 'warm' })
      .expect(422);

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('missing type: returns 422', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'reboot-missing',
      port: 9005,
    });

    await request(app.getHttpServer())
      .put(`/pico-units/${unit.id}/reboot`)
      .send({})
      .expect(422);
  });

  it('disabled unit: returns 410', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'reboot-disabled',
      port: 9006,
      enabled: false,
    });

    await request(app.getHttpServer())
      .put(`/pico-units/${unit.id}/reboot`)
      .send({ type: 'soft' })
      .expect(410);
  });

  it('404 when unit does not exist', async () => {
    await request(app.getHttpServer())
      .put('/pico-units/9999/reboot')
      .send({ type: 'soft' })
      .expect(404);
  });

  it('server error from Pico: returns 417 and increments failed_calls', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'reboot-500',
      port: 9007,
      ip: undefined as unknown as string,
    });

    const serverError = Object.assign(new Error('remote 500'), {
      isAxiosError: true,
      response: { status: 500, data: 'boom' },
    });

    mockedAxios.post.mockRejectedValueOnce(serverError as AxiosError);

    const res = await request(app.getHttpServer())
      .put(`/pico-units/${unit.id}/reboot`)
      .send({ type: 'soft' })
      .expect(417);

    expect(res.body).toHaveProperty('statusCode', 417);

    const repo = await getPicoRepo(app);
    const updated = await repo.findOneBy({ id: unit.id });
    expect(updated!.failed_calls).toBe(1);
  });
});

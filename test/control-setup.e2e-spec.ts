import { INestApplication } from '@nestjs/common';

import axios from 'axios';
import request from 'supertest';

import { clearPicoUnits, seedPicoUnit } from './fixtures/pico-units.fixtures';
import { closeTestApp, createTestApp } from './test-setup';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PUT /pico-units/:picoUnitId/control/setup — pin validation', () => {
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

  it('returns 422 when a pin is set to a WiFi-reserved GPIO (e.g. 23)', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'setup-invalid-gpio',
      port: 5400,
    });

    const res = await request(app.getHttpServer())
      .put(`/v1/pico-units/${unit.id}/control/setup`)
      .send({ pins: { dht: 23 } })
      .expect(422);

    expect(res.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining('valid user I/O pin')]),
    );
  });

  it('returns 422 when a pin is set to 24 (WiFi-reserved)', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'setup-invalid-24',
      port: 5401,
    });

    const res = await request(app.getHttpServer())
      .put(`/v1/pico-units/${unit.id}/control/setup`)
      .send({ pins: { fan: 24 } })
      .expect(422);

    expect(res.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining('valid user I/O pin')]),
    );
  });

  it('returns 422 when a pin is set to 25 (WiFi-reserved)', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'setup-invalid-25',
      port: 5402,
    });

    const res = await request(app.getHttpServer())
      .put(`/v1/pico-units/${unit.id}/control/setup`)
      .send({ pins: { heater: 25 } })
      .expect(422);

    expect(res.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining('valid user I/O pin')]),
    );
  });

  it('returns 422 when a pin is set to 29 (out of range)', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'setup-invalid-29',
      port: 5403,
    });

    const res = await request(app.getHttpServer())
      .put(`/v1/pico-units/${unit.id}/control/setup`)
      .send({ pins: { humidifier: 29 } })
      .expect(422);

    expect(res.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining('valid user I/O pin')]),
    );
  });

  it('returns 422 when two devices are assigned to the same GPIO pin', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'setup-dup-pins',
      port: 5404,
    });

    const res = await request(app.getHttpServer())
      .put(`/v1/pico-units/${unit.id}/control/setup`)
      .send({ pins: { dht: 4, humidifier: 4 } })
      .expect(422);

    expect(res.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining('same GPIO pin')]),
    );
  });

  it('returns 422 when three devices share the same GPIO pin', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'setup-triple-dup',
      port: 5405,
    });

    const res = await request(app.getHttpServer())
      .put(`/v1/pico-units/${unit.id}/control/setup`)
      .send({ pins: { dht: 6, humidifier: 6, fan: 6 } })
      .expect(422);

    expect(res.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining('same GPIO pin')]),
    );
  });

  it('accepts valid unique GPIO pins', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'setup-valid-pins',
      port: 5406,
    });

    // This will pass validation and reach the service layer, which will
    // attempt to call the Pico. We only verify it does NOT return 422.
    mockedAxios.post.mockRejectedValueOnce(new Error('no pico'));

    const res = await request(app.getHttpServer())
      .put(`/v1/pico-units/${unit.id}/control/setup`)
      .send({ pins: { dht: 4, humidifier: 6, fan: 7, heater: 8 } });

    // 422 would indicate validation failure — we expect something else
    // (e.g. 417/424/502 from the mocked axios failure)
    expect(res.status).not.toBe(422);
  });

  it('accepts partial pin updates with valid GPIOs', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'setup-partial-pins',
      port: 5407,
    });

    mockedAxios.post.mockRejectedValueOnce(new Error('no pico'));

    const res = await request(app.getHttpServer())
      .put(`/v1/pico-units/${unit.id}/control/setup`)
      .send({ pins: { dht: 22 } });

    expect(res.status).not.toBe(422);
  });
});

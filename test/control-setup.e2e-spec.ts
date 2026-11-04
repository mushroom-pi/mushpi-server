import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import axios from 'axios';
import request from 'supertest';
import { Repository } from 'typeorm';

import { Readings } from '../src/modules/readings/readings.entity';
import {
  clearPicoUnits,
  getPicoRepo,
  seedPicoUnit,
} from './fixtures/pico-units.fixtures';
import { sampleDeviceResponse } from './fixtures/readings.fixtures';
import { closeTestApp, createTestApp } from './test-setup';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PUT /pico-units/:picoUnitId/control/setup — pin validation', () => {
  let app: INestApplication;
  let readingsRepo: Repository<Readings>;

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();

    readingsRepo = app.get(getRepositoryToken(Readings));
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
    // The conflict-free forward path persists a reading via the follow-up
    // poll — clear every entity this suite touches.
    await readingsRepo.clear();
  });

  // The live pin mapping a mocked `GET /setup` pre-fetch serves back:
  // dht 4, humidifier 6, fan 7, heater 8.
  const deviceSnapshot = () => ({ data: sampleDeviceResponse.devices });

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

  it('returns 422 for an in-request duplicate that omits dht (class-anchored constraint)', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'setup-dup-no-dht',
      port: 5413,
    });

    // Previously slipped through the pipe: the constraint was anchored on
    // `dht` and @IsOptional() suppressed it whenever `dht` was absent.
    const res = await request(app.getHttpServer())
      .put(`/v1/pico-units/${unit.id}/control/setup`)
      .send({ pins: { humidifier: 6, fan: 6 } })
      .expect(422);

    expect(res.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining('same GPIO pin')]),
    );
    // Pipe-level rejection — the device is never contacted.
    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('accepts valid unique GPIO pins', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'setup-valid-pins',
      port: 5406,
    });

    // This will pass validation and reach the service layer, which will
    // pre-fetch the live mapping and then attempt to call the Pico. We only
    // verify it does NOT return 422.
    mockedAxios.get.mockResolvedValueOnce(deviceSnapshot());
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

    mockedAxios.get.mockResolvedValueOnce(deviceSnapshot());
    mockedAxios.post.mockRejectedValueOnce(new Error('no pico'));

    const res = await request(app.getHttpServer())
      .put(`/v1/pico-units/${unit.id}/control/setup`)
      .send({ pins: { dht: 22 } });

    expect(res.status).not.toBe(422);
  });

  it('rejects a partial update reusing a GPIO another device already holds — and never forwards it', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'setup-collision-heater',
      port: 5410,
    });

    // Device snapshot: humidifier on GPIO 6. A partial body asking for
    // heater 6 must NOT pass — the merged view would leave both on GPIO 6.
    mockedAxios.get.mockResolvedValueOnce(deviceSnapshot());

    const res = await request(app.getHttpServer())
      .put(`/v1/pico-units/${unit.id}/control/setup`)
      .send({ pins: { heater: 6 } })
      .expect(422);

    expect(res.body.message).toContain('GPIO 6');
    expect(res.body.message).toContain('humidifier');
    expect(res.body.message).toBe(
      'GPIO 6 is already assigned to the humidifier',
    );

    // Rejection happens BEFORE anything is forwarded: the device is untouched.
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).not.toHaveBeenCalled();
    // A validation rejection is not a device fault — no failed_calls bump.
    const picoRepo = await getPicoRepo(app);
    const stored = await picoRepo.findOneBy({ id: unit.id });
    expect(stored!.failed_calls).toBe(0);
  });

  it('names the non-requested device holding the pin as the holder', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'setup-collision-humidifier',
      port: 5411,
    });

    // Device snapshot: heater on GPIO 8. Moving humidifier onto 8 conflicts
    // with the heater — the message must blame the heater, not the humidifier.
    mockedAxios.get.mockResolvedValueOnce(deviceSnapshot());

    const res = await request(app.getHttpServer())
      .put(`/v1/pico-units/${unit.id}/control/setup`)
      .send({ pins: { humidifier: 8 } })
      .expect(422);

    expect(res.body.message).toBe('GPIO 8 is already assigned to the heater');
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('forwards a conflict-free partial update unchanged (original body, not a fabricated full mapping)', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'setup-forward-partial',
      port: 5412,
    });

    // Ordered GET mocks: 1) the pre-flight `GET /setup` snapshot,
    // 2) the follow-up `GET /?force=1` poll after the forwarded POST.
    mockedAxios.get.mockResolvedValueOnce(deviceSnapshot());
    mockedAxios.get.mockResolvedValueOnce({ data: sampleDeviceResponse });
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        active_high: false,
        pins: { fan: 7, dht: 4, humidifier: 6, heater: 10 },
      },
    });

    const res = await request(app.getHttpServer())
      .put(`/v1/pico-units/${unit.id}/control/setup`)
      .send({ pins: { heater: 10 } })
      .expect(200);

    expect(res.body.pins).toEqual({
      fan: 7,
      dht: 4,
      humidifier: 6,
      heater: 10,
    });

    // The device was consulted fresh before forwarding...
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    // ...and the ORIGINAL partial body was forwarded untouched.
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/setup'),
      { pins: { heater: 10 } },
    );
  });

  it('skips the device round trip entirely for a body with no pins (active_high only)', async () => {
    const unit = await seedPicoUnit(app, {
      handle: 'setup-no-pins',
      port: 5414,
    });

    mockedAxios.post.mockRejectedValueOnce(new Error('no pico'));

    const res = await request(app.getHttpServer())
      .put(`/v1/pico-units/${unit.id}/control/setup`)
      .send({ active_high: true });

    expect(res.status).not.toBe(422);
    // No pre-fetch: same round-trip count as a body that changes no pins.
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });
});

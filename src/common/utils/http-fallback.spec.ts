import axios, { AxiosError } from 'axios';

import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';

import {
  getWithFallback,
  isNetworkError,
  postWithFallback,
} from './http-fallback';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

beforeAll(() => {
  mockedAxios.isAxiosError = jest.fn(
    (err: any) => err?.isAxiosError === true,
  ) as any;
});

describe('isNetworkError', () => {
  it('returns true for AxiosError without response', () => {
    const err = Object.assign(new Error('no response'), {
      isAxiosError: true,
      request: {},
    });
    expect(isNetworkError(err)).toBe(true);
  });

  it('returns false for AxiosError with response', () => {
    const err = Object.assign(new Error('server error'), {
      isAxiosError: true,
      response: { status: 500 },
    });
    expect(isNetworkError(err)).toBe(false);
  });

  it('returns false for non-axios errors', () => {
    expect(isNetworkError(new Error('generic'))).toBe(false);
  });
});

function makeUnit(overrides: Partial<PicoUnit> = {}): PicoUnit {
  return Object.assign(new PicoUnit(), {
    id: 1,
    handle: 'unit-test',
    port: 5000,
    enabled: true,
    ...overrides,
  });
}

describe('getWithFallback', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
  });

  it('uses mDNS address on first attempt', async () => {
    const unit = makeUnit({ ip: '192.168.1.10' });
    mockedAxios.get.mockResolvedValue({ status: 200, data: 'ok' });

    const result = await getWithFallback(unit, '/ping', { timeout: 5000 });

    expect(result.data).toBe('ok');
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'http://unit-test.local:5000/ping',
      { timeout: 5000 },
    );
  });

  it('falls back to IP address on network error when IP is available', async () => {
    const unit = makeUnit({ ip: '192.168.1.10' });

    const networkError = Object.assign(new Error('no route'), {
      isAxiosError: true,
      request: {},
    });

    mockedAxios.get
      .mockRejectedValueOnce(networkError as AxiosError)
      .mockResolvedValueOnce({ status: 200, data: 'pong' });

    const result = await getWithFallback(unit, '/ping', { timeout: 5000 });

    expect(result.data).toBe('pong');
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      1,
      'http://unit-test.local:5000/ping',
      { timeout: 5000 },
    );
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      2,
      'http://192.168.1.10:5000/ping',
      { timeout: 5000 },
    );
  });

  it('throws on network error when no IP is set', async () => {
    const unit = makeUnit({ ip: undefined as unknown as string });

    const networkError = Object.assign(new Error('no route'), {
      isAxiosError: true,
      request: {},
    });

    mockedAxios.get.mockRejectedValueOnce(networkError as AxiosError);

    await expect(getWithFallback(unit, '/ping')).rejects.toThrow('no route');
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('throws on non-network error even with IP available', async () => {
    const unit = makeUnit({ ip: '192.168.1.10' });

    const serverError = Object.assign(new Error('500'), {
      isAxiosError: true,
      response: { status: 500 },
    });

    mockedAxios.get.mockRejectedValueOnce(serverError as AxiosError);

    await expect(getWithFallback(unit, '/ping')).rejects.toThrow('500');
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });
});

describe('postWithFallback', () => {
  beforeEach(() => {
    mockedAxios.post.mockReset();
  });

  it('uses mDNS address on first attempt', async () => {
    const unit = makeUnit({ ip: '192.168.1.10' });
    mockedAxios.post.mockResolvedValue({ status: 200, data: { ok: true } });

    const result = await postWithFallback(unit, '/setpoints', {
      temperature: 25,
    });

    expect(result.data).toEqual({ ok: true });
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://unit-test.local:5000/setpoints',
      { temperature: 25 },
    );
  });

  it('falls back to IP address on network error', async () => {
    const unit = makeUnit({ ip: '10.0.0.5' });

    const networkError = Object.assign(new Error('timeout'), {
      isAxiosError: true,
      request: {},
    });

    mockedAxios.post
      .mockRejectedValueOnce(networkError as AxiosError)
      .mockResolvedValueOnce({ status: 200, data: 'ok' });

    const result = await postWithFallback(unit, '/control', { enabled: true });

    expect(result.data).toBe('ok');
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      'http://unit-test.local:5000/control',
      { enabled: true },
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      'http://10.0.0.5:5000/control',
      { enabled: true },
    );
  });

  it('throws when no IP and network error occurs', async () => {
    const unit = makeUnit({ ip: undefined as unknown as string });

    const networkError = Object.assign(new Error('dns failed'), {
      isAxiosError: true,
      request: {},
    });

    mockedAxios.post.mockRejectedValueOnce(networkError as AxiosError);

    await expect(
      postWithFallback(unit, '/outputs', { fan: false }),
    ).rejects.toThrow('dns failed');
  });

  it('passes options when provided', async () => {
    const unit = makeUnit({ ip: '192.168.1.10' });
    mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

    await postWithFallback(unit, '/setup', {}, { timeout: 3000 });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://unit-test.local:5000/setup',
      {},
      { timeout: 3000 },
    );
  });
});

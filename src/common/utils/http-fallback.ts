import { HttpException } from '@nestjs/common';

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';

import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';

/** Error codes that indicate the Pico is unreachable at the network level. */
export const CONNECTION_LEVEL_ERROR_CODES = [
  'EHOSTUNREACH',
  'ECONNREFUSED',
  'ENETUNREACH',
  'ETIMEDOUT',
];

export function isNetworkError(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response;
}

/**
 * Returns true when the error is an axios error with no `.response` and a
 * connection-level error code (EHOSTUNREACH, ECONNREFUSED, etc.).
 */
export function isConnectionLevelError(error: unknown): boolean {
  return (
    axios.isAxiosError(error) &&
    !error.response &&
    CONNECTION_LEVEL_ERROR_CODES.includes((error as any).code)
  );
}

/**
 * Retry condition for axios-retry: only retry transient HTTP-server responses
 * (5xx or 429). Connection-level errors and "no-response" errors return false.
 */
export function shouldRetryAxiosError(error: unknown): boolean {
  return (
    axios.isAxiosError(error) &&
    !!error.response &&
    (error.response.status >= 500 || error.response.status === 429)
  );
}

/**
 * Thin, idempotent wrapper around axiosRetry that applies the project-wide
 * retry policy (2 retries, exponential delay, server-error only).
 */
export function configureAxiosRetry(axiosInstance: AxiosInstance): void {
  axiosRetry(axiosInstance, {
    retries: 2,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: shouldRetryAxiosError,
  });
}

/**
 * Format a human-readable error message for a Pico poll failure.
 * Distinguishes between "unreachable" (no response) and "poll failed" (HTTP
 * response received but indicates an error).
 */
export function formatPollError(unit: PicoUnit, error: unknown): string {
  // Nest exceptions carry an already-formatted / true reason in their
  // payload (e.g. the BadGatewayException rethrown by
  // ReadingsService.fetchAndValidateReading). Re-formatting them misreads
  // the Nest payload as an axios response → "HTTP undefined: host:port".
  if (error instanceof HttpException) {
    const payload = error.getResponse();
    if (typeof payload === 'string') return payload;
    const { message, description } = payload as {
      message?: unknown;
      description?: unknown;
    };
    if (typeof message === 'string') return message;
    if (typeof description === 'string') return description; // LockedException shape
    return error.message;
  }
  const reason =
    (error as any)?.code ??
    ((error as any)?.response
      ? `HTTP ${(error as any).response.status}`
      : 'NO_RESPONSE');
  const target = (error as any)?.config?.url ?? `${unit.host}:${unit.port}`;
  const hasResponse = !!(error as any)?.response;
  const verb = hasResponse ? 'poll failed' : 'unreachable';
  return `Pico unit ${unit.id} ${verb} (${reason}: ${target})`;
}

export async function getWithFallback(
  unit: PicoUnit,
  path: string,
  options?: AxiosRequestConfig,
): Promise<AxiosResponse> {
  const doGet = (baseUrl: string) =>
    options
      ? axios.get(`${baseUrl}${path}`, options)
      : axios.get(`${baseUrl}${path}`);
  try {
    return await doGet(unit.address);
  } catch (primaryErr) {
    if (!isNetworkError(primaryErr) || !unit.ipAddress) {
      throw primaryErr;
    }
    return await doGet(unit.ipAddress);
  }
}

export async function postWithFallback(
  unit: PicoUnit,
  path: string,
  data?: unknown,
  options?: AxiosRequestConfig,
): Promise<AxiosResponse> {
  const doPost = (baseUrl: string) =>
    options
      ? axios.post(`${baseUrl}${path}`, data, options)
      : axios.post(`${baseUrl}${path}`, data);
  try {
    return await doPost(unit.address);
  } catch (primaryErr) {
    if (!isNetworkError(primaryErr) || !unit.ipAddress) {
      throw primaryErr;
    }
    return await doPost(unit.ipAddress);
  }
}

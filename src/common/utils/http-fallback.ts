import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

import { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';

export function isNetworkError(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response;
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

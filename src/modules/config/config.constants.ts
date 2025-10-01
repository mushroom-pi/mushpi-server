import {
  Databases,
  LogLevels,
  NodeEnvironments,
  Services,
} from './config.types';

export const nodeEnvironments: NodeEnvironments[] = [
  'dev',
  'local',
  'prod',
  'staging',
  'test',
];

export const logLevels: LogLevels[] = [
  'info',
  'trace',
  'silent',
  'debug',
  'error',
  'fatal',
  'trace',
  'warn',
];

/**
 * Names of databases and other external dependencies here
 */
export const databases: Databases[] = ['mongoMock'];

export const services: Services[] = ['serviceMock'];

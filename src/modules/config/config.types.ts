export type NodeEnvironments = 'local' | 'dev' | 'prod' | 'test' | 'staging';

export type LogLevels =
  | 'info'
  | 'trace'
  | 'silent'
  | 'debug'
  | 'error'
  | 'fatal'
  | 'trace'
  | 'warn';

/**
 * Names of databases and other external dependencies here
 */
export type Databases = 'sqlite';

export type Services = 'serviceMock';

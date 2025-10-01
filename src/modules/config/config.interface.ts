import { LogLevels, NodeEnvironments } from './config.types';

export interface EnvironmentVariables {
  NODE_ENV: NodeEnvironments;
  PORT?: string;
  APP_HOST: string;
  APP_PORT?: number;
  APP_SECRET?: string;
  DOCS_ENDPOINT?: string;
  DOCS_UI_URL?: string;
  DOCS_USERNAME?: string;
  DOCS_PASSWORD?: string;
  LOGS_LEVEL: LogLevels;
  ERRORS_DETAIL?: boolean;
  MAX_EVENT_LOOP_DELAY: number;
  MAX_REQUESTS?: number;
  MAX_REQUESTS_TIME?: number;
  SQLITE_PATH: string;
  SQLITE_LOG: boolean;
}

export interface ServerConfig {
  nodeEnv: EnvironmentVariables['NODE_ENV'];
  host: EnvironmentVariables['APP_HOST'];
  port: EnvironmentVariables['APP_PORT'];
  logsLevel: EnvironmentVariables['LOGS_LEVEL'];
  errorsDetail?: EnvironmentVariables['ERRORS_DETAIL'];
  isProd: boolean;
}

export interface SecurityConfig {
  secret?: EnvironmentVariables['APP_SECRET'];
  maxEventLoopDelay: EnvironmentVariables['MAX_EVENT_LOOP_DELAY'];
  maxRequests?: EnvironmentVariables['MAX_REQUESTS'];
  maxRequestsTime?: EnvironmentVariables['MAX_REQUESTS_TIME'];
}

export interface DocsConfig {
  endpoint?: EnvironmentVariables['DOCS_ENDPOINT'];
  ui?: EnvironmentVariables['DOCS_UI_URL'];
  username?: EnvironmentVariables['DOCS_USERNAME'];
  password?: EnvironmentVariables['DOCS_PASSWORD'];
  makeDocs: boolean;
  useAuth: boolean;
}

export interface DbConfig {
  uri: string;
  port?: number;
  host?: string;
  name?: string;
  username?: string;
  password?: string;
}

export interface ServiceConfig {
  url?: string;
  host?: string;
  port?: string;
  secretKey?: string;
}

export interface SQLiteConfig {
  database: string;
  logging: boolean;
}

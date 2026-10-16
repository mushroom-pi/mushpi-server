import { LogLevels, NodeEnvironments } from './config.types';

export interface EnvironmentVariables {
  NODE_ENV: NodeEnvironments;
  PORT?: string;
  APP_PORT?: number;
  APP_SECRET?: string;
  CLIENT_URL?: string;
  DOCS_ENDPOINT?: string;
  DOCS_UI_URL?: string;
  DOCS_USERNAME?: string;
  DOCS_PASSWORD?: string;
  LOGS_LEVEL: LogLevels;
  LOGS_PATH: string;
  LOGS_LIFE_DAYS: number;
  ERRORS_DETAIL?: boolean;
  APP_HTTPS_ENABLED: boolean;
  MAX_EVENT_LOOP_DELAY: number;
  MAX_REQUESTS?: number;
  MAX_REQUESTS_TIME?: number;
  DEMO_VISITOR_MAX_REQUESTS?: number;
  DEMO_VISITOR_MAX_REQUESTS_TIME?: number;
  DEMO_ABUSE_MAX_REQUESTS?: number;
  DEMO_ABUSE_MAX_REQUESTS_TIME?: number;
  DEMO_GLOBAL_MAX_REQUESTS?: number;
  DEMO_GLOBAL_MAX_REQUESTS_TIME?: number;
  SQLITE_PATH: string;
  SQLITE_LOG: boolean;
  UPLOAD_DIR: string;
  PICO_ANNOUNCE_SECRET?: string;
  READINGS_RETENTION_MONTHS: number;
  CLIENT_DIST_DIR?: string;
}

export interface ServerConfig {
  nodeEnv: EnvironmentVariables['NODE_ENV'];
  port: EnvironmentVariables['APP_PORT'];
  errorsDetail?: EnvironmentVariables['ERRORS_DETAIL'];
  isProd: boolean;
}

export interface LogsConfig {
  level: EnvironmentVariables['LOGS_LEVEL'];
  path: EnvironmentVariables['LOGS_PATH'];
  lifeDays: EnvironmentVariables['LOGS_LIFE_DAYS'];
}

export interface SecurityConfig {
  secret?: EnvironmentVariables['APP_SECRET'];
  httpsEnabled: boolean;
  maxEventLoopDelay: EnvironmentVariables['MAX_EVENT_LOOP_DELAY'];
  maxRequests?: EnvironmentVariables['MAX_REQUESTS'];
  maxRequestsTime?: EnvironmentVariables['MAX_REQUESTS_TIME'];
  /**
   * The three always-on demo rate-limit pairs (per-visitor browse pace,
   * per-visitor refused-change pace, whole-instance backstop). Values come
   * from the deployment; they are required in `demo` and simply unused on
   * every other boot — a non-demo ConfigService reports them as they were
   * validated (typically `undefined`) but no throttler definition reads
   * them. Details: REFERENCE.md §Guards.
   */
  demo: DemoRateLimitsConfig;
}

/**
 * One limit/window pair — the shape shared by the historical opt-in
 * (`security.maxRequests` / `maxRequestsTime`) and each demo pair.
 * Windows are milliseconds; `Retry-After`/`X-RateLimit-Reset` are seconds.
 */
export interface DemoRateLimitPair {
  maxRequests?: number;
  maxRequestsTime?: number;
}

export interface DemoRateLimitsConfig {
  visitor: DemoRateLimitPair;
  abuse: DemoRateLimitPair;
  global: DemoRateLimitPair;
}

export interface DocsConfig {
  endpoint?: EnvironmentVariables['DOCS_ENDPOINT'];
  ui?: EnvironmentVariables['DOCS_UI_URL'];
  username?: EnvironmentVariables['DOCS_USERNAME'];
  password?: EnvironmentVariables['DOCS_PASSWORD'];
  makeDocs: boolean;
  useAuth: boolean;
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

export interface UploadConfig {
  dir: string;
  imageDir: string;
}

export interface PicoConfig {
  announceSecret?: string;
}

export interface ReadingsConfig {
  retentionMonths: number;
}

export interface ClientConfig {
  clientUrl?: EnvironmentVariables['CLIENT_URL'];
  distDir?: EnvironmentVariables['CLIENT_DIST_DIR'];
}

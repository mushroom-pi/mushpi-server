/**
 * Using Joi for this validation instead of class-validator as it is proposed here https://docs.nestjs.com/techniques/configuration#custom-validate-function because the validation errors it returns are far easier to read.
 */
import * as Joi from 'joi';

import { logLevels, nodeEnvironments } from './config.constants';
import { Services } from './config.types';

/**
 * A little trick to automate the valid values for the NODE_ENV variable
 */
const addValids = (valids: string[], def?: string): Joi.StringSchema => {
  let V = Joi.string();
  valids.forEach((v) => (V = V.valid(v)));
  if (def) V = V.default(def);
  return V;
};

/**
 * Docs basic-auth credentials are **optional in every environment** —
 * permitted, never required. A non-empty username must pair with a password
 * (see `password()`); an explicitly empty pair means "docs enabled,
 * unauthenticated". The old rules that forced `''` outside `NODE_ENV=prod`
 * and required the pair inside it are gone: there is one uniform policy.
 */
const username = Joi.string().not('admin').not('user').trim().allow('');

/**
 * All-or-nothing pair: require a password only when the username is
 * non-empty, and reject a password supplied without its username rather
 * than silently ignoring a half-configured pair.
 *
 * The `is` schema carries `.required()` deliberately — the definedness
 * trap: Joi short-circuits `undefined` for a non-required `is` schema, so a
 * bare `Joi.string().not('')` ALSO matches an absent reference (and an empty
 * one), which is exactly how a `NODE_ENV=prod` boot came to demand
 * "DOCS_USERNAME" even with the docs endpoint unset. `Joi.exist()` is not a
 * substitute here: it rejects an absent reference but counts an empty string
 * as present, and emptiness must stay a distinct state from "enabled".
 */
const password = (usernameReference: string) =>
  Joi.any().when(usernameReference, {
    is: Joi.string().not('').required(),
    then: Joi.string()
      .not('admin', 'abc', '123')
      .pattern(new RegExp('^[a-zA-Z0-9]{6,30}$'))
      .required(),
    otherwise: Joi.string().valid('').optional(),
  });

const secret = Joi.any().when('NODE_ENV', {
  is: 'prod',
  then: Joi.string().min(6).required(),
  otherwise: Joi.optional(),
});

const picoAnnounceSecret = Joi.any().when('NODE_ENV', {
  is: 'prod',
  then: Joi.string().min(6).required(),
  otherwise: Joi.string().min(6).default('mushpi-dev-secret'),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const generateServiceSchema = (serviceName: Services) => {
  const handle = serviceName.replaceAll('-', '_').toUpperCase();
  return {
    [`${handle}_URL`]: Joi.string().uri().optional(),
    [`${handle}_HOST`]: Joi.string().optional(),
    [`${handle}_PORT`]: Joi.any().when(`${handle}_URL`, {
      then: Joi.optional(),
      otherwise: Joi.number().port().required(),
    }),
    [`${handle}_SECRET`]: secret,
  };
};

export const validationSchema = Joi.object({
  NODE_ENV: addValids(nodeEnvironments, 'local'),
  APP_HOST: Joi.string().default('localhost'),
  APP_PORT: Joi.number().port().optional(),
  APP_SECRET: Joi.string().optional(),
  CLIENT_URL: Joi.string().uri().when('NODE_ENV', {
    is: 'local',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  CLIENT_DIST_DIR: Joi.string().when('NODE_ENV', {
    is: 'prod',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  DOCS_ENDPOINT: Joi.any().when('NODE_ENV', {
    is: 'local',
    then: Joi.string().default('contract'),
    otherwise: Joi.optional(),
  }),
  DOCS_UI_URL: Joi.any().when('DOCS_ENDPOINT', {
    // `.required()` makes an ABSENT endpoint unambiguously select the
    // disabled branch (see the definedness note on `password()`).
    is: Joi.string().not('').required(),
    then: Joi.string().uri().optional(),
    otherwise: Joi.optional(),
  }),
  DOCS_USERNAME: Joi.any().when('DOCS_ENDPOINT', {
    // Same definedness-safe idiom: with the old `Joi.string().not('')` the
    // absent endpoint matched, taking the enabled branch and (in prod)
    // making the credentials mandatory on a boot where docs were disabled.
    is: Joi.string().not('').required(),
    then: username,
    otherwise: Joi.optional(),
  }),
  DOCS_PASSWORD: password('DOCS_USERNAME'),
  LOGS_LEVEL: addValids(logLevels, 'info'),
  LOGS_PATH: Joi.string().default('data/logs'),
  LOGS_LIFE_DAYS: Joi.number().integer().default(7),
  ERRORS_DETAIL: Joi.boolean().optional(),
  APP_HTTPS_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false)
    .description(
      'Declares that the browser-facing deployment is reached over HTTPS (TLS terminated upstream or directly). Does NOT configure TLS in this app — it only gates the HTTPS-only security headers: helmet HSTS and the CSP upgrade-insecure-requests directive.',
    ),
  MAX_EVENT_LOOP_DELAY: Joi.number().default(100),
  MAX_REQUESTS: Joi.number()
    .integer()
    .min(1)
    .optional()
    .description(
      'Rate limiting is opt-in: the maximum number of requests allowed per window, must be set TOGETHER with MAX_REQUESTS_TIME. If either one is absent the app applies no throttling and emits no X-RateLimit-* response headers.',
    ),
  MAX_REQUESTS_TIME: Joi.number()
    .integer()
    .min(1)
    .optional()
    .description(
      'Rate-limit window length in MILLISECONDS (e.g. 60000 = 1 minute), must be set TOGETHER with MAX_REQUESTS. If either one is absent the app applies no throttling and emits no X-RateLimit-* response headers.',
    ),
  SQLITE_PATH: Joi.string().default('data/app.sqlite'),
  SQLITE_LOG: Joi.boolean().truthy('true').falsy('false').default(false),
  UPLOAD_DIR: Joi.string().default('data'),
  PICO_ANNOUNCE_SECRET: picoAnnounceSecret,
  READINGS_RETENTION_MONTHS: Joi.number().integer().min(1).default(6),
})
  // Rate limiting is opt-in and needs both halves of the pair: a lone
  // MAX_REQUESTS or MAX_REQUESTS_TIME is a configuration mistake, so it fails
  // at boot (validation error) instead of silently half-configuring the guard.
  .and('MAX_REQUESTS', 'MAX_REQUESTS_TIME');

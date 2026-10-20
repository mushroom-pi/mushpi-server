/**
 * Using Joi for this validation instead of class-validator as it is proposed here https://docs.nestjs.com/techniques/configuration#custom-validate-function because the validation errors it returns are far easier to read.
 */
import * as Joi from 'joi';

import { SEED_READINGS_DEFAULT_DAYS } from '../seed/seed.constant';
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

/**
 * The shared secret Pico units present in the `X-Pico-Secret` header of
 * `POST /v1/pico-units/announce`.
 *
 * A `demo` instance is internet-exposed, so its announce secret must be set
 * explicitly AND must not be the published development value — that literal
 * is public knowledge, and leaving it in place would keep the announce
 * endpoint open to anyone. `prod` deliberately keeps accepting any value of
 * six or more characters, including that one: its rule is presence, not
 * provenance. The development default therefore applies only outside
 * `prod`/`demo`.
 *
 * Each `is` schema carries `.required()` deliberately — the definedness
 * trap: Joi short-circuits `undefined` for a non-required `is` schema, so a
 * bare `Joi.string().valid('prod')` would ALSO match an absent `NODE_ENV`
 * and select a required branch (see the note on `password()`). Do not add
 * `.invalid()` to the `prod` or `otherwise` branches: only `demo` refuses
 * the public value.
 */
const picoAnnounceSecret = Joi.any()
  .when('NODE_ENV', {
    switch: [
      {
        is: Joi.string().valid('prod').required(),
        then: Joi.string().min(6).required(),
      },
      {
        is: Joi.string().valid('demo').required(),
        then: Joi.string().min(6).invalid('mushpi-dev-secret').required(),
      },
    ],
    otherwise: Joi.string().min(6).default('mushpi-dev-secret'),
  })
  .description(
    'Shared secret expected in the `X-Pico-Secret` header of `POST /v1/pico-units/announce`. Required (min 6 chars) when `NODE_ENV` is `prod` or `demo`; a `demo` instance additionally refuses the public development value `mushpi-dev-secret`; elsewhere defaults to that public development value.',
  );

/**
 * Rate limiting is deployment-profile-shaped — two profiles with different
 * threat models, and these keys are read as one profile's configuration,
 * not as demo special cases:
 *
 * - **Self-hosted profile** — a hub on a trusted local network; the network
 *   is the security boundary. Limits are OPT-IN: the historical
 *   `MAX_REQUESTS` / `MAX_REQUESTS_TIME` pair below. The three limiter pairs
 *   below are ignored entirely on this profile.
 * - **Public-demo profile** (`NODE_ENV=demo`) — an internet-exposed,
 *   unauthenticated demonstration instance behind exactly one reverse
 *   proxy; an unprotected public demo is not an option. Limits are ALWAYS
 *   ON through three all-or-nothing pairs mirroring the opt-in convention:
 *   `VISITOR_*` (per-visitor browse pace — keyed on the visitor's own
 *   forwarded address, spanning every endpoint), `ABUSE_*` (per-visitor
 *   pace for refused changes — enforced only on requests the demo read-only
 *   guard would refuse) and `GLOBAL_*` (whole-instance backstop on a
 *   constant tracker key — a flood slows the demo as a whole and recovers
 *   without a restart). Every value arrives from the deployment; none is
 *   hardcoded in the product.
 *
 * PROFILE SCOPE: the required-when-`demo` rule below carries it — each
 * limiter pair is mandatory on the public-demo profile and optional (and
 * read by no throttler definition) on every other profile, which is exactly
 * where an operator reads it. The throttler NAMES are load-bearing: they key
 * the `@SkipThrottle` metadata and the response-header suffixes.
 *
 * These pairs also carry a real limit: per-visitor bucketing comes from
 * the forwarded-header chain and is only sound behind exactly ONE known
 * appending proxy — the demo's topology. An arbitrary hub (no proxy, or a
 * chain of unknown length) gets no per-visitor feature for this reason, so
 * these three pairs are profile-scoped variables, not a general per-visitor
 * option. Details: REFERENCE.md §Guards.
 *
 * Windows are **milliseconds** (same unit as `MAX_REQUESTS_TIME`); the
 * emitted `Retry-After` / `X-RateLimit-Reset` headers are relative seconds.
 *
 * `is: Joi.string().valid('demo').required()` carries `.required()`
 * deliberately — the definedness trap: a non-required `is` schema also
 * matches an ABSENT `NODE_ENV`, which would make the whole set mandatory on
 * a stock boot (see the note on `password()`).
 */
const VISITOR_MAX_REQUESTS_DESCRIPTION =
  "Public-demo profile (`NODE_ENV=demo`) — always on; ignored on every other boot: maximum requests per visitor per window, the browse pace, spanning all endpoints under the visitor's forwarded identity. Must be set TOGETHER with VISITOR_MAX_REQUESTS_TIME. Required when `NODE_ENV` is `demo`; a public-demo boot missing it fails at startup rather than serving an unprotected instance.";
const VISITOR_MAX_REQUESTS_TIME_DESCRIPTION =
  'Public-demo profile (`NODE_ENV=demo`): browse-pace window length in MILLISECONDS (e.g. 60000 = 1 minute), must be set TOGETHER with VISITOR_MAX_REQUESTS. `Retry-After` and `X-RateLimit-Reset` are emitted in relative SECONDS. Required when `NODE_ENV` is `demo`; ignored on every other boot.';
const ABUSE_MAX_REQUESTS_DESCRIPTION =
  'Public-demo profile (`NODE_ENV=demo`) — always on; ignored elsewhere: maximum REFUSED-CHANGE requests per visitor per window — requests the demo read-only guard would refuse get a stricter allowance than plain browsing (browsing never spends from this bucket). Must be set TOGETHER with ABUSE_MAX_REQUESTS_TIME. Required when `NODE_ENV` is `demo`.';
const ABUSE_MAX_REQUESTS_TIME_DESCRIPTION =
  'Public-demo profile (`NODE_ENV=demo`): refused-change window length in MILLISECONDS, must be set TOGETHER with ABUSE_MAX_REQUESTS. Required when `NODE_ENV` is `demo`; ignored on every other boot.';
const GLOBAL_MAX_REQUESTS_DESCRIPTION =
  'Public-demo profile (`NODE_ENV=demo`) — always on; ignored elsewhere: whole-instance backstop — maximum requests across ALL visitors per window. A flood overloading the demo slows the whole instance to a safe pace until the window passes; `GET /health` and Pico announcements are exempt. Must be set TOGETHER with GLOBAL_MAX_REQUESTS_TIME. Required when `NODE_ENV` is `demo`.';
const GLOBAL_MAX_REQUESTS_TIME_DESCRIPTION =
  'Public-demo profile (`NODE_ENV=demo`): backstop window length in MILLISECONDS, must be set TOGETHER with GLOBAL_MAX_REQUESTS. Required when `NODE_ENV` is `demo`; ignored on every other boot.';

const demoLimit = (description: string): Joi.NumberSchema =>
  Joi.number()
    .integer()
    .min(1)
    .when('NODE_ENV', {
      is: Joi.string().valid('demo').required(),
      then: Joi.required(),
      otherwise: Joi.optional(),
    })
    .description(description);

/**
 * Server-owned demo seeding gate. The env key names the capability; the
 * profile scope lives here: `NODE_ENV=demo` defaults the flag ON, every
 * other profile defaults it OFF, and an explicit value always wins —
 * EXCEPT `prod`, where the value is accepted at validation (refusing it
 * would block the boot, which the rule forbids) but hard-refused at
 * runtime by `SeedService`, which warns and touches nothing. The
 * `is` schema carries `.required()` deliberately — the definedness trap: a
 * non-required `is` schema also matches an ABSENT `NODE_ENV`, which would
 * arm seeding on a stock boot (see the note on `password()`).
 */
const seedEnabled = Joi.boolean()
  .truthy('true')
  .falsy('false')
  .when('NODE_ENV', {
    is: Joi.string().valid('demo').required(),
    then: Joi.boolean().truthy('true').falsy('false').default(true),
    otherwise: Joi.boolean().truthy('true').falsy('false').default(false),
  })
  .description(
    'Server-owned demo seeding: catalogue (recipes + batches), the simulated unit roster, and backdated readings history. Defaults to `true` when `NODE_ENV` is `demo` and to `false` on every other boot; set explicitly to force either state — EXCEPT on `NODE_ENV=prod`, where seeding is always refused at runtime (the flag is ignored with a warning, the database is untouched, boot never fails). Seeding is insert-only and idempotent — existing rows are never rewritten or removed.',
  );

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
      'Self-hosted profile — rate limiting is OPT-IN: the maximum number of requests allowed per window, must be set TOGETHER with MAX_REQUESTS_TIME. If either one is absent the app applies no throttling and emits no X-RateLimit-* response headers. Ignored when `NODE_ENV=demo` (the public-demo profile always arms its three `VISITOR_*`/`ABUSE_*`/`GLOBAL_*` limiter pairs).',
    ),
  MAX_REQUESTS_TIME: Joi.number()
    .integer()
    .min(1)
    .optional()
    .description(
      'Self-hosted profile: rate-limit window length in MILLISECONDS (e.g. 60000 = 1 minute), must be set TOGETHER with MAX_REQUESTS. If either one is absent the app applies no throttling and emits no X-RateLimit-* response headers. Ignored when `NODE_ENV=demo` (the public-demo profile always arms its three `VISITOR_*`/`ABUSE_*`/`GLOBAL_*` limiter pairs).',
    ),
  SQLITE_PATH: Joi.string().default('data/app.sqlite'),
  SQLITE_LOG: Joi.boolean().truthy('true').falsy('false').default(false),
  UPLOAD_DIR: Joi.string().default('data'),
  PICO_ANNOUNCE_SECRET: picoAnnounceSecret,
  READINGS_RETENTION_MONTHS: Joi.number().integer().min(1).default(6),
  SEED_ENABLED: seedEnabled,
  SEED_READINGS_DAYS: Joi.number()
    .integer()
    .min(1)
    .default(SEED_READINGS_DEFAULT_DAYS)
    .description(
      'Days of backdated 60-second-spaced readings the demo seeder generates per live unit. Applies only when `SEED_ENABLED` is on; a non-positive or fractional value fails at boot.',
    ),
  VISITOR_MAX_REQUESTS: demoLimit(VISITOR_MAX_REQUESTS_DESCRIPTION),
  VISITOR_MAX_REQUESTS_TIME: demoLimit(VISITOR_MAX_REQUESTS_TIME_DESCRIPTION),
  ABUSE_MAX_REQUESTS: demoLimit(ABUSE_MAX_REQUESTS_DESCRIPTION),
  ABUSE_MAX_REQUESTS_TIME: demoLimit(ABUSE_MAX_REQUESTS_TIME_DESCRIPTION),
  GLOBAL_MAX_REQUESTS: demoLimit(GLOBAL_MAX_REQUESTS_DESCRIPTION),
  GLOBAL_MAX_REQUESTS_TIME: demoLimit(GLOBAL_MAX_REQUESTS_TIME_DESCRIPTION),
})
  // Rate limiting is opt-in and needs both halves of the pair: a lone
  // MAX_REQUESTS or MAX_REQUESTS_TIME is a configuration mistake, so it fails
  // at boot (validation error) instead of silently half-configuring the guard.
  // The three demo pairs follow the same all-or-nothing rule; in `demo` they
  // are additionally required (see the comment on the demo limit keys).
  .and('MAX_REQUESTS', 'MAX_REQUESTS_TIME')
  .and('VISITOR_MAX_REQUESTS', 'VISITOR_MAX_REQUESTS_TIME')
  .and('ABUSE_MAX_REQUESTS', 'ABUSE_MAX_REQUESTS_TIME')
  .and('GLOBAL_MAX_REQUESTS', 'GLOBAL_MAX_REQUESTS_TIME');

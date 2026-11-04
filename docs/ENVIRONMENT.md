# Environment Variables Documentation

> Automatically generated from Joi validation schema

| Variable | Type | Required | Default | Conditions | Description |
|----------|------|----------|---------|------------|-------------|
| `NODE_ENV` | string | Never | `"local"` | Allowed values: `demo`, `dev`, `local`, `prod`, `staging`, `test` |  |
| `APP_PORT` | number | Never |  |  |  |
| `APP_SECRET` | string | Never |  |  |  |
| `CLIENT_URL` | string | Never |  |  |  |
| `CLIENT_DIST_DIR` | string | Never |  |  |  |
| `DOCS_ENDPOINT` | any | Never |  |  |  |
| `DOCS_UI_URL` | any | Never |  |  |  |
| `DOCS_USERNAME` | any | Never |  |  |  |
| `DOCS_PASSWORD` | any | Never |  |  |  |
| `LOGS_LEVEL` | string | Never | `"info"` | Allowed values: `info`, `trace`, `silent`, `debug`, `error`, `fatal`, `warn` |  |
| `LOGS_PATH` | string | Never | `"data/logs"` |  |  |
| `LOGS_LIFE_DAYS` | number | Never | `7` |  |  |
| `ERRORS_DETAIL` | boolean | Never |  |  |  |
| `APP_HTTPS_ENABLED` | boolean | Never | `false` |  | Declares that the browser-facing deployment is reached over HTTPS (TLS terminated upstream or directly). Does NOT configure TLS in this app — it only gates the HTTPS-only security headers: helmet HSTS and the CSP upgrade-insecure-requests directive. |
| `MAX_EVENT_LOOP_DELAY` | number | Never | `100` |  |  |
| `MAX_REQUESTS` | number | Never |  | Minimum: `1` | Self-hosted profile — rate limiting is OPT-IN: the maximum number of requests allowed per window, must be set TOGETHER with MAX_REQUESTS_TIME. If either one is absent the app applies no throttling and emits no X-RateLimit-* response headers. Ignored when `NODE_ENV=demo` (the public-demo profile always arms its three `VISITOR_*`/`ABUSE_*`/`GLOBAL_*` limiter pairs). |
| `MAX_REQUESTS_TIME` | number | Never |  | Minimum: `1` | Self-hosted profile: rate-limit window length in MILLISECONDS (e.g. 60000 = 1 minute), must be set TOGETHER with MAX_REQUESTS. If either one is absent the app applies no throttling and emits no X-RateLimit-* response headers. Ignored when `NODE_ENV=demo` (the public-demo profile always arms its three `VISITOR_*`/`ABUSE_*`/`GLOBAL_*` limiter pairs). |
| `SQLITE_PATH` | string | Never | `"data/app.sqlite"` |  |  |
| `SQLITE_LOG` | boolean | Never | `false` |  |  |
| `UPLOAD_DIR` | string | Never | `"data"` |  |  |
| `PICO_ANNOUNCE_SECRET` | any | Never |  |  | Shared secret expected in the `X-Pico-Secret` header of `POST /v1/pico-units/announce`. Required (min 6 chars) when `NODE_ENV` is `prod` or `demo`; a `demo` instance additionally refuses the public development value `mushpi-dev-secret`; elsewhere defaults to that public development value. |
| `READINGS_RETENTION_MONTHS` | number | Never | `6` | Minimum: `1` |  |
| `SEED_ENABLED` | boolean | Never |  |  | Server-owned demo seeding: catalogue (recipes + batches), the simulated unit roster, and backdated readings history. Defaults to `true` when `NODE_ENV` is `demo` and to `false` on every other boot; set explicitly to force either state — EXCEPT on `NODE_ENV=prod`, where seeding is always refused at runtime (the flag is ignored with a warning, the database is untouched, boot never fails). Seeding is insert-only and idempotent — existing rows are never rewritten or removed. |
| `SEED_READINGS_DAYS` | number | Never | `14` | Minimum: `1` | Days of backdated 60-second-spaced readings the demo seeder generates per live unit. Applies only when `SEED_ENABLED` is on; a non-positive or fractional value fails at boot. |
| `VISITOR_MAX_REQUESTS` | number | Never |  | Minimum: `1` | Public-demo profile (`NODE_ENV=demo`) — always on; ignored on every other boot: maximum requests per visitor per window, the browse pace, spanning all endpoints under the visitor's forwarded identity. Must be set TOGETHER with VISITOR_MAX_REQUESTS_TIME. Required when `NODE_ENV` is `demo`; a public-demo boot missing it fails at startup rather than serving an unprotected instance. |
| `VISITOR_MAX_REQUESTS_TIME` | number | Never |  | Minimum: `1` | Public-demo profile (`NODE_ENV=demo`): browse-pace window length in MILLISECONDS (e.g. 60000 = 1 minute), must be set TOGETHER with VISITOR_MAX_REQUESTS. `Retry-After` and `X-RateLimit-Reset` are emitted in relative SECONDS. Required when `NODE_ENV` is `demo`; ignored on every other boot. |
| `ABUSE_MAX_REQUESTS` | number | Never |  | Minimum: `1` | Public-demo profile (`NODE_ENV=demo`) — always on; ignored elsewhere: maximum REFUSED-CHANGE requests per visitor per window — requests the demo read-only guard would refuse get a stricter allowance than plain browsing (browsing never spends from this bucket). Must be set TOGETHER with ABUSE_MAX_REQUESTS_TIME. Required when `NODE_ENV` is `demo`. |
| `ABUSE_MAX_REQUESTS_TIME` | number | Never |  | Minimum: `1` | Public-demo profile (`NODE_ENV=demo`): refused-change window length in MILLISECONDS, must be set TOGETHER with ABUSE_MAX_REQUESTS. Required when `NODE_ENV` is `demo`; ignored on every other boot. |
| `GLOBAL_MAX_REQUESTS` | number | Never |  | Minimum: `1` | Public-demo profile (`NODE_ENV=demo`) — always on; ignored elsewhere: whole-instance backstop — maximum requests across ALL visitors per window. A flood overloading the demo slows the whole instance to a safe pace until the window passes; `GET /health` and Pico announcements are exempt. Must be set TOGETHER with GLOBAL_MAX_REQUESTS_TIME. Required when `NODE_ENV` is `demo`. |
| `GLOBAL_MAX_REQUESTS_TIME` | number | Never |  | Minimum: `1` | Public-demo profile (`NODE_ENV=demo`): backstop window length in MILLISECONDS, must be set TOGETHER with GLOBAL_MAX_REQUESTS. Required when `NODE_ENV` is `demo`; ignored on every other boot. |

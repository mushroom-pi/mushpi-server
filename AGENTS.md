# mushpi-server — Agent Instructions

NestJS 11 backend: polls Pico units via cron, stores readings in SQLite. Exposes REST API + OpenAPI spec consumed by `mushpi-client`.

> Load `nestjs-backend` for general NestJS; `REFERENCE.md` (Index inside) holds long-tail gotchas — load only for touched areas. Cross-repo contracts: root `AGENTS.md`.

## Verification Commands

Run after every feature delivery, no need to ask — all must exit 0: `yarn build && yarn lint && yarn test && yarn test:e2e && yarn start`

## Module Layout

Feature modules live in `src/modules/`; **the DB module is `sqlite/`** (there is no `database/`):

```
src/main.ts — bootstrap: versioning, security, docs auth, Swagger, globals
src/common/ — constants, decorators, dto, exceptions, filters, guards, interceptors, middleware, pipes, utils, validators
src/common/middleware/helmet.middleware.ts — shared Helmet factory
app.module.ts — root module (APP_GUARD, global middleware)
pino-logger.module.ts — nestjs-pino HTTP logging
config/ — @Global env+Joi config module
sqlite/ — TypeORM root: data-source.ts + entities, autoLoadEntities, better-sqlite3
sqlite/migrations/ — migrations + MIGRATIONS barrel
sqlite-health/ — /health "databases" probe (read/write+size)
swagger/ — OpenAPI builder (error schemas, operationIdFactory)
monitoring/ — infra endpoints
pico-units/ — CRUD + ping/poll/reboot proxies + api_compatibility verdict
readings/ — NTILE aggregation + CSV export
batches/ — CRUD + lifecycle + recipe-from-batch + images
recipes/ — CRUD + images + per-recipe batch listing
control/ — setpoints/outputs/setup/loop proxies (+poll)
cron/ — 60s polling sweeps + retention cleanup
dashboard/ — aggregated summary
settings/ — timezone + TimezoneInterceptor
seed/ — insert-only demo seeding (gated by SEED_ENABLED; refused on prod; REFERENCE.md §Seed join contract)
seed/provenance/ — recipe + harvest-image datasets, gate + provenance report
spec/generators/ — openapi + bruno generators
docs/env-vars.generator.ts — → docs/ENVIRONMENT.md
public/ — /public assets (Swagger favicon)
test/jest-e2e.json — e2e jest config
.vscode/ — committed editor settings (vscode-jest wired to e2e, runMode on-save; rationale: REFERENCE.md §E2E Gotchas)
```

## API Versioning

URI versioning (`VersioningType.URI`, `defaultVersion: API_VERSION`): all functional endpoints under `/v1/`. Sole exception: `MonitoringController` (version-neutral). Other controllers carry a `V1` class/filename suffix — REFERENCE.md §API Versioning Internals.

## REST API — 40 operations

| Method | Path | Notes |
|---|---|---|
| GET | /v1/pico-units | List (pag.) |
| POST | /v1/pico-units | Create (mDNS check first) |
| POST | /v1/pico-units/announce | Upsert by handle + `X-Pico-Secret`; demo: internal callers only |
| GET | /v1/pico-units/:id |
| PATCH | /v1/pico-units/:id | Partial |
| DELETE | /v1/pico-units/:id |
| GET | /v1/pico-units/:id/ping | → Pico `/ping` |
| PUT | /v1/pico-units/:id/control/setpoints | → Pico `/setpoints` |
| PUT | /v1/pico-units/:id/control/outputs | → Pico `/outputs` |
| PUT | /v1/pico-units/:id/control/setup | → Pico `/setup`; GPIO-validated |
| PUT | /v1/pico-units/:id/control/loop | → Pico `/control` toggle |
| POST | /v1/pico-units/:id/poll | On-demand poll → store reading → `PollPicoUnitResponseDto` |
| PUT | /v1/pico-units/:id/reboot | → Pico POST `/reboot`; 202 |
| GET | /v1/pico-units/:id/readings | Bucketed NTILE → `AggregatedReadingsResponseDto` (no pagination) |
| GET | /v1/pico-units/:id/readings/export | CSV: raw reading rows |
| GET | /v1/pico-units/:id/batches | Batches for unit |
| GET | /v1/pico-units/:id/batches/current | Active batch |
| GET | /v1/batches | List (pag.) |
| POST | /v1/batches | Create (recipe snapshot) |
| GET | /v1/batches/:batchId |
| PATCH | /v1/batches/:batchId | Partial |
| DELETE | /v1/batches/:batchId | Wipes image dir |
| GET | /v1/batches/:batchId/readings | Clamped to batch window |
| GET | /v1/batches/:batchId/readings/export | CSV: raw reading rows |
| POST | /v1/batches/:batchId/recipe | Recipe from finished batch |
| PUT | /v1/batches/:batchId/images | Upload (append, max 5) |
| DELETE | /v1/batches/:batchId/images/:filename | Remove one |
| GET | /v1/recipes | List |
| POST | /v1/recipes | Create |
| GET | /v1/recipes/:recipeId |
| PATCH | /v1/recipes/:recipeId | Partial |
| DELETE | /v1/recipes/:recipeId | Removes image file |
| GET | /v1/recipes/:recipeId/batches | Batches using this recipe |
| PUT | /v1/recipes/:recipeId/image | Upload |
| DELETE | /v1/recipes/:recipeId/image | Removes image |
| GET | /v1/dashboard/summary | units/batches/recipes/stats/warnings |
| GET | /v1/settings | Timezone (default: OS) |
| PATCH | /v1/settings | IANA-validated |
| GET | /ping | Liveness |
| GET | /health | server/system/databases/services (query-gated); demo: host details withheld |

## Entities & Columns

| Entity | Stored columns (snake_case) |
|---|---|
| `PicoUnit` | id, created_at, handle, name, description, face_color, ip, mac, port, `monitored` (DB column `enabled`), last_seen, micropython_version, firmware_version, api_version, board, board_total_mem_byte, board_total_fs_byte, board_cpu_freq_mhz, failed_calls, failed_readings, consecutive_empty_readings |
| `Readings` | id, ts, temperature, humidity, last_sensor_err, fan_on, humidifier_on, heater_on, control_loop_enabled, temperature_set, humidity_set, board_uptime_s, board_temp, board_used_mem, board_used_fs, time_to_response_ms, pico_unit_id |
| `Batch` | id, start_at, finish_at, species, temperature_target, humidity_target, notes, description, images (simple-json), pico_unit_id, recipe_id |
| `Recipe` | id, name, species, temperature_target, humidity_target, duration_days, notes, image, created_at, updated_at |
| `Settings` | id (always 1), timezone |
| `Health` | id, created_at (write probe) |

Computed `@Expose()` getters: `PicoUnit` host, address, ipAddress, status, api_compatibility, latest_reading · `Batch` status, images_left, images_url · `Recipe` image_url.

## Scripts

| Group | Script | Notes |
|---|---|---|
| build | `build` |
| lint | `lint` | eslint --fix (.ts only) |
| lint | `lint:ci` | no --fix; `--max-warnings=0` (CI) |
| lint | `format` | prettier (.ts only) |
| test | `test` | jest unit |
| test | `test:watch` | |
| test | `test:cov` | --coverage |
| test | `test:debug` | inspector |
| test | `test:e2e` | jest --config test/jest-e2e.json |
| test | `test:e2e:cov` | |
| spec | `spec:export` | `yarn build` + run compiled generator → committed spec/openapi.{json,yaml} |
| spec | `spec:bruno` | → spec/bruno/ (gitignored) |
| spec | `spec:all` | both |
| db | `typeorm` | CLI on dist data-source |
| db | `migration:generate` | build + CLI |
| db | `migration:run` | ↑ |
| db | `migration:revert` | ↑ |
| db | `migration:show` | ↑ |
| audit | `audit:prod` | informational |
| audit | `audit:ci` | gating (high severity) |
| docs | `docs:env` | → docs/ENVIRONMENT.md |
| start | `start` |
| start | `start:dev` | --watch |
| start | `start:debug` | --debug --watch |
| start | `start:prod` | node dist/src/main.js |
| hooks | `prepare` | husky |
| prune | `knip:ci` | unused prod deps (gotcha: REFERENCE.md §Dependency Remediation) |

**Husky hooks**: `pre-commit` / `commit-msg` / `pre-merge-commit` / `pre-push` — full pipelines and spec-regeneration live-state rules: REFERENCE.md §Git hooks (Husky).

## Env & Config

Env reference is **generated**, never hand-maintained: `yarn docs:env` → `docs/ENVIRONMENT.md`. `CustomConfigService` getters:

| Getter | Domain |
|---|---|
| `server` | port (`APP_PORT`, legacy `PORT` fallback), NODE_ENV, errorsDetail |
| `logs` | pino level |
| `security` | APP_SECRET, httpsEnabled (APP_HTTPS_ENABLED), throttler by deployment profile — self-hosted: opt-in `MAX_REQUESTS` + `MAX_REQUESTS_TIME`; public-demo (`NODE_ENV=demo`): always-on `{VISITOR,ABUSE,GLOBAL}_MAX_REQUESTS(_TIME)` (required-when-demo; ignored elsewhere); `isDemo`; REFERENCE.md §Guards | event-loop |
| `docs` | Swagger endpoint + auth |
| `sqlite` | DB path |
| `upload` | UPLOAD_DIR → imageDir |
| `pico` | PICO_ANNOUNCE_SECRET |
| `readings` | retention only |
| `seed` | SEED_ENABLED (schema default: on in `demo`, off elsewhere) + SEED_READINGS_DAYS |
| `client` | clientUrl (CORS) + distDir (SPA) |

## Top Conventions

### Column/property naming

Stored columns use **snake_case property names** matching the DB column — no `@Column({ name })` overrides. Computed `@Expose()` getters: camelCase. Sole sanctioned override: `PicoUnit.monitored` ↔ `enabled` (backward compat; do not replicate).

### DTO partial-update contract

**`UpdateXxxDto` fields must have no initializers** (no `?: string = ''`) — a default would overwrite stored values on partial PATCH. Mechanism: REFERENCE.md §Pass-Through & Response Shape.

### Status is computed, not stored

`Batch.status`, `PicoUnit.status` and `PicoUnit.api_compatibility` are computed `@Expose()` getters, never stored. Rules: REFERENCE.md §Computed Status Fields.

### Data integrity

Register every entity in BOTH `data-source.ts` (CLI) and `TypeOrmModule.forFeature()` (runtime). Snapshot/immutable-FK rules: REFERENCE.md §Batch Lifecycle.

### Content-named code

Name files and symbols for what they contain, never for the profile that triggers them: profile branches go at the call site (`config.isDemo`), not in profile-named siblings. Sole exception: a unit that cannot exist outside the profile (`DemoReadOnlyGuard`). Env vars name the capability. Doctrine: `nestjs-backend` skill §Naming and Profile-Scoped Code.

### Demo read-only contract

On a demo boot (`NODE_ENV=demo`) every non-safe-method request is refused with 403 by the global `DemoReadOnlyGuard`, and the OpenAPI spec documents that 403 on exactly those operations — both from the same handler marks (`@ReadOnlyExempt()` / `@ReadOnlyRefused()` in `src/common/decorators/docs/`). **A new endpoint needs no demo work**: a non-safe method is refused and documented automatically; a safe-method handler that writes persisted data MUST carry `@ReadOnlyRefused()`. Exemptions are deliberate, explicit, and greppable — today only `POST /v1/pico-units/announce`, which is additionally origin-gated in demo (external callers refused before the secret check — REFERENCE.md §Guards). On a demo boot `/health` additionally **withholds host details** (`system.os`/`cpu`/`disk`, database file path) — REFERENCE.md §Demo host-details redaction. Guards are inert on every other boot; the cron/event-handler paths never pass through them. Rate limiting follows the deployment profiles: a self-hosted hub arms nothing unless the opt-in pair is set (limiter pairs inert there); the public-demo profile (`NODE_ENV=demo`) always-runs three env-supplied limiters (browse pace, refused-change pace, whole-instance backstop) — the required-when-demo rule marks that profile scope. Details: REFERENCE.md §Guards / §Spec Tooling Internals.

### Versioning

Release policy: REFERENCE.md §Release Versioning.

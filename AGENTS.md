# mushpi-server — Agent Instructions

NestJS 11 backend for mushroom growing control system. Runs on Raspberry Pi, polls Pico units via cron, stores readings in SQLite. Exposes REST API + OpenAPI spec consumed by `mushpi-client`.

> Load `nestjs-backend` for general NestJS; [`REFERENCE.md`](./REFERENCE.md) (Index inside) holds long-tail gotchas — load only for touched areas.

## External Relationships

Cross-repo contracts (Pico announce/poll/proxy, client codegen) are owned by root [`AGENTS.md`](../AGENTS.md); detail: REFERENCE.md §Pico Proxy Internals. Client consumes `/<DOCS_ENDPOINT>-json`; CORS origin `CLIENT_URL`.

## Verification Commands

Run after every feature delivery, no need to ask — all exit 0; `yarn start` boots clean:

```bash
yarn build && yarn lint && yarn test && yarn test:e2e && yarn start
```

**Entrypoint**: `nest build` emits `dist/src/main.js` (not `dist/main.js`) — `docs/`+`spec/` in the tsc compile set push `rootDir` to the project root; `start:prod` & the Docker `CMD` use that path.

## Module Layout

**`sqlite/` is the database module — there is no `database/` module.** Feature modules live in `src/modules/`:

```
src/main.ts — bootstrap: versioning, security, docs auth, Swagger, globals
src/common/ — constants, decorators, dto, exceptions, filters, guards, interceptors, middleware, pipes, utils, validators
app.module.ts — root module (APP_GUARD, global middleware)
pino-logger.module.ts — nestjs-pino HTTP logging
config/ — @Global env+Joi config module
sqlite/ — TypeORM root: data-source.ts + entities, autoLoadEntities, better-sqlite3; sync dev / migrationsRun prod
sqlite/migrations/ — migrations + MIGRATIONS barrel
sqlite-health/ — /health "databases" probe (read/write+size)
swagger/ — OpenAPI builder (error schemas, operationIdFactory)
monitoring/ — infra endpoints
pico-units/ — CRUD + ping/poll/reboot proxies + api_compatibility verdict
readings/ — readings + NTILE aggregation + CSV export
batches/ — CRUD + lifecycle + recipe-from-batch + images
recipes/ — CRUD + images + per-recipe batch listing
control/ — setpoints/outputs/setup/loop proxies (+poll)
cron/ — 60s polling sweeps + retention cleanup
dashboard/ — aggregated summary
settings/ — timezone + TimezoneInterceptor
spec/generators/ — openapi + bruno generators
docs/env-vars.generator.ts — → docs/ENVIRONMENT.md
public/ — assets served at /public (Swagger favicon)
test/jest-e2e.json — e2e jest config (maxWorkers: 1)
```

## API Versioning

URI versioning (`VersioningType.URI`, `defaultVersion: API_VERSION` = `'1'`, `src/common/utils/api-version.ts`): all functional endpoints under `/v1/`. Sole exception: `MonitoringController` (`@Controller({ version: VERSION_NEUTRAL })`). All other controllers carry a `V1` class/filename suffix (`batches.v1.controller.ts` → `BatchesV1Controller`), stripped from operationIds by a custom factory — sites/factory/workarounds: REFERENCE.md §API Versioning Internals.

## REST API — 40 operations

| Method | Path | Notes |
|---|---|---|
| GET | /v1/pico-units | List (pag.) |
| POST | /v1/pico-units | Create (mDNS check first) |
| POST | /v1/pico-units/announce | Upsert by handle + `X-Pico-Secret` |
| GET | /v1/pico-units/:id |
| PATCH | /v1/pico-units/:id | Partial |
| DELETE | /v1/pico-units/:id |
| GET | /v1/pico-units/:id/ping | → Pico `/ping` |
| PUT | /v1/pico-units/:id/control/setpoints | → Pico `/setpoints` |
| PUT | /v1/pico-units/:id/control/outputs | → Pico `/outputs` |
| PUT | /v1/pico-units/:id/control/setup | → Pico `/setup`; GPIO 0–22/26–28 + no-dup |
| PUT | /v1/pico-units/:id/control/loop | → Pico `/control` toggle |
| POST | /v1/pico-units/:id/poll | On-demand poll → store reading → `PollPicoUnitResponseDto` (unit + optional `devices`); zero-value/empty-sensor/out-of-range readings return without persisting |
| PUT | /v1/pico-units/:id/reboot | → Pico POST `/reboot`; 202 |
| GET | /v1/pico-units/:id/readings | `points`-bucket NTILE over range → `AggregatedReadingsResponseDto` {`data`,`points`,`actualReadings`}; no pagination |
| GET | /v1/pico-units/:id/readings/export | CSV: raw reading rows |
| GET | /v1/pico-units/:id/batches | Batches for unit |
| GET | /v1/pico-units/:id/batches/current | Active batch |
| GET | /v1/batches | List (pag.) |
| POST | /v1/batches | Create (`recipe_id` snapshot-copied) |
| GET | /v1/batches/:batchId |
| PATCH | /v1/batches/:batchId | Partial |
| DELETE | /v1/batches/:batchId | Wipes image dir |
| GET | /v1/batches/:batchId/readings | Same; clamped to batch window |
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
| DELETE | /v1/recipes/:recipeId/image | Remove |
| GET | /v1/dashboard/summary | units/batches/recipes/stats/warnings |
| GET | /v1/settings | Timezone (default: OS) |
| PATCH | /v1/settings | IANA-validated |
| GET | /ping | Liveness |
| GET | /health | server/system/databases/services (query-gated) |

## Entities & Columns

| Entity | Stored columns (snake_case) |
|---|---|
| `PicoUnit` | id, created_at, handle, name, description, face_color, ip, mac, port, `monitored` (DB column `enabled`), last_seen, micropython_version, firmware_version, api_version, board, board_total_mem_byte, board_total_fs_byte, board_cpu_freq_mhz, failed_calls, failed_readings, consecutive_empty_readings |
| `Readings` | id, ts, temperature, humidity, last_sensor_err, fan_on, humidifier_on, heater_on, control_loop_enabled, temperature_set, humidity_set, board_uptime_s, board_temp, board_used_mem, board_used_fs, time_to_response_ms, pico_unit_id |
| `Batch` | id, start_at, finish_at, species, temperature_target, humidity_target, notes, description, images (simple-json), pico_unit_id, recipe_id |
| `Recipe` | id, name, species, temperature_target, humidity_target, duration_days, notes, image, created_at, updated_at |
| `Settings` | id (always 1), timezone |
| `Health` | id, created_at (write probe) |

Computed `@Expose()` getters: `PicoUnit` host, address, ipAddress, status, api_compatibility, latest_reading · `Batch` status, images_left, images_url · `Recipe` image_url. Contract exceptions to camelCase-getters: `api_compatibility`, `images_left`, `host`/`status`/`latest_reading`.

## Scripts

| Group | Script | Notes |
|---|---|---|
| build | `build` |
| lint | `lint` | eslint --fix (.ts only) |
| lint | `format` | prettier (.ts only; agent .md excluded) |
| test | `test` | jest unit |
| test | `test:watch` | |
| test | `test:cov` | --coverage |
| test | `test:debug` | inspector, in-band |
| test | `test:e2e` | jest --config test/jest-e2e.json |
| test | `test:e2e:cov` | |
| spec | `spec:export` | → committed spec/openapi.{json,yaml} (client contract) |
| spec | `spec:bruno` | → spec/bruno/ (gitignored) |
| spec | `spec:all` | both |
| db | `typeorm` | CLI on dist data-source |
| db | `migration:generate` | build + CLI |
| db | `migration:run` | ↑ |
| db | `migration:revert` | ↑ |
| db | `migration:show` | ↑ |
| audit | `audit:prod` | yarn npm audit, recursive production graph, deprecations excluded (informational) |
| audit | `audit:ci` | audit:prod + `--severity high` (gating variant; relies on Yarn exit code) |
| docs | `docs:env` | → docs/ENVIRONMENT.md |
| start | `start` |
| start | `start:dev` | --watch |
| start | `start:debug` | --debug --watch |
| start | `start:prod` | node dist/src/main.js |
| hooks | `prepare` | husky |
| prune | `knip:ci` | unused prod deps (`--no-gitignore` — nested-repo gotcha, REFERENCE.md) |

**Husky pre-commit**: `yarn format` + `yarn lint`; regenerates + stages `docs/ENVIRONMENT.md` on `config.schema.ts` change; runs `yarn spec:all` + stages the spec files on `src/` change; `yarn build` runs last, after the generators, so it validates exactly the content being committed. `commit-msg` = commitlint; `pre-merge-commit` = test + e2e; `pre-push` = audit:ci → build → knip:ci → test → e2e (both audit scripts exclude deprecations).

## Env & Config

Env reference is **generated**, never hand-maintained: `yarn docs:env` → [`docs/ENVIRONMENT.md`](./docs/ENVIRONMENT.md). `CustomConfigService` getters:

| Getter | Domain |
|---|---|
| `server` | host/port, NODE_ENV, errorsDetail |
| `logs` | pino level |
| `security` | APP_SECRET, throttler, event-loop |
| `docs` | Swagger endpoint + auth |
| `sqlite` | DB path |
| `upload` | UPLOAD_DIR → imageDir |
| `pico` | PICO_ANNOUNCE_SECRET |
| `readings` | retention only |
| `client` | clientUrl (CORS) + distDir (SPA) |

## Top Conventions

### Column/property naming

Stored columns use **snake_case property names** matching the DB column (e.g. `last_seen`) — no `@Column({ name })` overrides. Computed `@Expose()` getters: camelCase. Sole sanctioned override: `PicoUnit.monitored` ↔ `enabled` (backward compat; do not replicate).

### DTO partial-update contract

`PicoUnitsService.update()` uses `Object.assign(unit, dto)` for partial PATCH. **DTO fields must have no initializers** (no `?: string = ''`). Omitted fields are not own-enumerable, so `Object.assign` skips them. A default value or initializer in any `UpdateXxxDto` field would incorrectly overwrite stored values on PATCH.

### Status is computed, not stored

`Batch.status`, `PicoUnit.status` and `PicoUnit.api_compatibility` are computed `@Expose()` getters, never stored; health and the verdict are independent. Rules: REFERENCE.md §Computed Status Fields.

### Data integrity

Register every entity in BOTH `src/modules/sqlite/data-source.ts` (CLI) and `TypeOrmModule.forFeature()` (runtime). Snapshot/immutable-FK rules: REFERENCE.md §Batch Lifecycle.

### Versioning

Release policy (Conventional Commits; version bumps only on `main` at release): REFERENCE.md §Release Versioning.

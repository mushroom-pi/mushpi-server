# mushpi-server — Agent Instructions

NestJS 11 backend for mushroom growing control system. Runs on Raspberry Pi, polls Pico units via cron, stores readings in SQLite. Exposes REST API + OpenAPI spec consumed by `mushpi-client`.

> **Skill**: For general NestJS patterns (bootstrap order, controller splitting, DTO hierarchy, Joi config, exception filter dispatch, e2e test structure), load the `nestjs-backend` skill. This file documents **only** what is specific to this project or deviates from standard NestJS conventions.
>
> **Reference**: Long-tail gotchas (Pico proxy internals, image uploads, timezone, cron, migrations, env vars, logging, raw SQL, e2e quirks) live in [`REFERENCE.md`](./REFERENCE.md). Load it **only when the task touches those areas** — do not read it on every spawn.

## External Relationships

- **mushpi-grow** (Pico units): server proxies `/sensors`, `/setpoints`, `/outputs`, `/setup`, `/control` to each unit via `src/common/utils/http-fallback.ts` (`getWithFallback`/`postWithFallback`, mDNS → IP fallback). Units self-register on boot via `POST /v1/pico-units/announce`.
- **mushpi-client** (frontend): consumes Swagger JSON at `/<DOCS_ENDPOINT>-json` to regenerate its API client. CORS origin from `CLIENT_URL`.

## Verification Commands

Run these after every feature delivery without asking:

```bash
yarn build     # Must exit 0
yarn lint      # Must have no new errors
yarn test      # Unit tests — must all pass
yarn test:e2e  # E2E tests — must all pass
yarn start     # Must boot without exceptions
```

**Production entrypoint**: `nest build` emits the entrypoint at `dist/src/main.js` (NOT `dist/main.js`) because `docs/` and `spec/` are in the tsc compile set, so `rootDir` resolves to the project root. `start:prod` and the Docker `CMD` both use `node dist/src/main.js`.

## Module Layout

```
pico-units/   — CRUD + ping proxy
readings/     — readings storage + time-range queries (incl. CSV export)
batches/      — batch CRUD + lifecycle rules + create-recipe-from-batch
recipes/      — recipe CRUD + image upload/removal + per-recipe batch listing
control/      — proxy: setpoints, outputs, setup, control loop toggle (each triggers an immediate trailing poll via `callPollAndUpdate`)
cron/         — scheduled polling of all monitored Pico units
dashboard/    — aggregated summary endpoint (unit health, batches, recipes, stats, warnings)
settings/     — GET/PATCH /v1/settings for timezone config; global TimezoneInterceptor converts all response dates
monitoring/   — /ping, /health, /metrics (VERSION_NEUTRAL — unversioned)
swagger/      — OpenAPI setup with global error schemas + operationIdFactory; powers spec:export
config/       — CustomConfigModule (@Global): wraps @nestjs/config (env + Joi validation + cache), provides CustomConfigService
sqlite/       — TypeORM root module (better-sqlite3, autoLoadEntities, synchronize dev / migrationsRun prod)
sqlite-health/ — SQLite health probe (read/write + size) for the /health "databases" section
```

## API Versioning

All functional endpoints live under `/v1/` via NestJS's idiomatic built-in versioning:

```ts
// src/common/utils/api-version.ts
app.enableVersioning({ type: VersioningType.URI, defaultVersion: API_VERSION });
```

Applied in `main.ts`, `test/test-setup.ts`, and `spec/generators/openapi.generator.ts` **before** any route registration or Swagger document building. Monitoring endpoints (`/ping`, `/health`, `/metrics`) are exempted via `@Controller({ version: VERSION_NEUTRAL })`.

### Controller Naming Convention

All controllers **except `MonitoringController`** carry a `V1` suffix in both class name and filename (`batches.v1.controller.ts` → `BatchesV1Controller`). The `V1` suffix is **not** reflected in OpenAPI `operationId`s — a custom `operationIdFactory` strips it so the client contract stays stable (`BatchesController_create_v1`, not `BatchesV1Controller_...`). See REFERENCE.md for the exact factory and the middleware/versioning workarounds.

## REST API

| Method           | Path                                            | Notes                                                                          |
| ---------------- | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| GET/POST         | `/v1/pico-units`                                | List (paginated) / Manual create (verify reachability via mDNS, then create)   |
| POST             | `/v1/pico-units/announce`                       | Pico hardware announcement (upsert by handle, requires `X-Pico-Secret` header) |
| GET/PATCH/DELETE | `/v1/pico-units/:picoUnitId`                    | CRUD                                                                           |
| GET              | `/v1/pico-units/:picoUnitId/ping`               | Proxy → Pico `/`                                                               |
| PUT              | `/v1/pico-units/:picoUnitId/control/setpoints`  | Proxy → Pico `/setpoints`                                                      |
| PUT              | `/v1/pico-units/:picoUnitId/control/setup`      | Proxy → Pico `/setup`; validates GPIO pins (0–22, 26–28) + no-duplicate constraint    |
| PUT              | `/v1/pico-units/:picoUnitId/control/outputs`    | Proxy → Pico `/outputs`                                                        |
| PUT              | `/v1/pico-units/:picoUnitId/control/loop`       | Proxy → Pico `/control` toggle                                                 |
| POST             | `/v1/pico-units/:picoUnitId/poll`               | On-demand Pico poll → store reading → return `PollPicoUnitResponseDto` (PicoUnit + optional `devices` block)    |
| PUT              | `/v1/pico-units/:picoUnitId/reboot`             | Proxy → Pico POST /reboot (soft/hard reset); returns 202                       |
| GET              | `/v1/pico-units/:picoUnitId/readings`           | Time-range filtered + `points`-based server-side aggregation (NTILE). Returns `AggregatedReading[]` with per-bucket avg/min/max + relay counts + setpoints. No pagination. |
| GET              | `/v1/pico-units/:picoUnitId/readings/export`    | CSV export of aggregated readings                                             |
| GET              | `/v1/pico-units/:picoUnitId/batches`            | + `/current`                                                                   |
| GET/POST         | `/v1/batches`                                   | List (paginated) / Create                                                      |
| GET/PATCH/DELETE | `/v1/batches/:batchId`                          | CRUD                                                                           |
| GET              | `/v1/batches/:batchId/readings`                 | Same aggregation model as unit readings; window clamped to batch start/finish.  |
| GET              | `/v1/batches/:batchId/readings/export`          | CSV export of batch readings                                                   |
| POST             | `/v1/batches/:batchId/recipe`                   | Create a recipe from a finished batch                                          |
| PUT              | `/v1/batches/:batchId/images`                   | Batch image upload (append, max 5)                                             |
| DELETE           | `/v1/batches/:batchId/images/:filename`         | Remove one batch image                                                         |
| GET/POST         | `/v1/recipes`                                   | List / Create                                                                  |
| GET/PATCH/DELETE | `/v1/recipes/:recipeId`                         | CRUD                                                                           |
| GET              | `/v1/recipes/:recipeId/batches`                 | Batches using this recipe                                                      |
| PUT/DELETE       | `/v1/recipes/:recipeId/image`                   | Recipe image upload/removal                                                    |
| GET              | `/v1/dashboard/summary`                         | Aggregated dashboard snapshot (units, batches, recipes, stats, warnings)       |
| GET/PATCH        | `/v1/settings`                                  | Get/update display timezone (defaults to OS timezone); IANA tz name validated  |
| GET              | `/ping` + `/health` + `/metrics`                | Liveness / full health (server, system, databases, services — query-param gated) / Prometheus (unversioned, VERSION_NEUTRAL)             |

## Top Conventions

### Column/property naming convention

Stored columns use **snake_case property names** (e.g. `last_seen`, `micropython_version`) matching the database column name directly — no `@Column({ name })` overrides. Computed `@Expose()` getters use camelCase. **Sanctioned exception**: `PicoUnit.monitored` uses `@Column({ name: 'enabled' })` for backward compatibility — the only override in the project; do not replicate.

### DTO partial-update contract

`PicoUnitsService.update()` uses `Object.assign(unit, dto)` for partial PATCH. **DTO fields must have no initializers** (no `?: string = ''`). Omitted fields are not own-enumerable properties, so `Object.assign` skips them. Adding a default value or initializer to any `UpdateXxxDto` field will incorrectly overwrite stored values on PATCH.

### `temperature_target` and `humidity_target` are always integers

Use `@IsInt()`, `{ type: 'integer' }` in TypeORM, `{ type: 'integer' }` in Swagger. Never floats.

### Status is computed, not stored

- **Batch `status`**: `'planned'` (`start_at > now`) / `'in-progress'` / `'finished'` (`finish_at < now`). Requires `@Expose()` + `@ApiProperty()`.
- **PicoUnit `status`**: `'unmonitored'` / `'offline'` / `'degraded'` / `'healthy'` derived from `monitored`, `failed_calls` (threshold 3), `failed_readings`, `consecutive_empty_readings`. Requires `@Expose()` + `@ApiProperty({ enum: PICO_UNIT_STATUSES })`. Canonical values array/type live in `pico-unit.type.ts`.

### Data integrity

- Snapshot copy over live reference: at batch creation, an optional `recipe_id` acts as a template — `species`, `temperature_target`, `humidity_target` are copied from the recipe into the batch (unless explicitly supplied on the DTO). Editing a recipe must never alter historical batches.
- Immutable FK references (`recipe_id`, `pico_unit_id`) omitted from UpdateDto via `OmitType`.
- Entity registration: `src/modules/sqlite/data-source.ts` (CLI) + `TypeOrmModule.forFeature` (runtime) — both required.

### API spec tooling

The server code (NestJS decorators) is the **source of truth**; the OpenAPI spec and Bruno collection are derived artifacts:

```bash
yarn spec:export   # Generates spec/openapi.json + spec/openapi.yaml (in-process, no HTTP server)
yarn spec:bruno    # Converts spec/openapi.json → spec/bruno/ Bruno collection
yarn spec:all      # Both (runs spec:export then spec:bruno)
```

`spec/openapi.json` and `spec/openapi.yaml` are committed (canonical contract — consumed by mushpi-client's `yarn gen:all:remote`). `spec/bruno/` is gitignored. A Husky pre-commit hook runs `yarn spec:all` on `src/` changes. See REFERENCE.md for the runtime-vs-export title nuance and the dual-wiring details.

# mushpi-server — NestJS Hub Backend Agent

NestJS 11 + TypeORM + SQLite hub running on Raspberry Pi 3 B+. Registers Pico units, polls them via cron, stores readings, and exposes REST API + OpenAPI spec to `mushpi-client`.

## Stack

NestJS 11 · TypeScript 5.5 · TypeORM 0.3 · SQLite (better-sqlite3) · axios + axios-retry · class-validator · @nestjs/swagger · nestjs-pino · @nestjs/schedule · Jest · Yarn 1.22

## Module Structure

```
src/modules/
  config/           # Joi-validated env config (CustomConfigService)
  sqlite/           # TypeORM DataSource
  pico-units/       # CRUD + proxy calls to Pico units
  readings/         # Readings storage and query
  batches/          # Growing batch management
  control/          # Proxy: toggle control loop
  cron/             # Scheduled polling of all enabled units
  monitoring/       # /monitoring/ping + /monitoring/health
  swagger/          # OpenAPI setup
```

## Entities (SQLite via TypeORM)

**PicoUnit** (`pico_unit`): `id`, `handle` (= Pico's `device_name`), `name`, `description`, `host`, `port`, `enabled`, `last_seen`, `failed_calls`, board metrics. Unique on `(host, port)`. Virtual getter `address` → `http://host:port`.

**Readings** (`readings`): `id`, `ts`, `temperature`, `humidity`, `fan_on`, `humidifier_on`, `heater_on`, `control_loop_enabled`, `temperature_set`, `humidity_set`, `board_uptime_s`, `board_temp`, `board_used_mem`, `board_used_fs`, `time_to_response_ms`, `pico_unit_id` FK (CASCADE delete). Index on `(pico_unit_id, ts)`.

**Batch** (`batch`): `id`, `start_at`, `finish_at`, `species`, `temperature_target` (integer), `humidity_target` (integer), `notes`, `pico_unit_id` FK, `recipe_id` FK (SET NULL). Virtual getter `status` → `'in-progress'` | `'finished'`.

**Recipe** (`recipe`): `id`, `name` (unique), `species`, `temperature_target` (integer), `humidity_target` (integer), `duration_days`, `notes`, `created_at`, `updated_at`. `@OneToMany` to Batch.

## REST API

| Method | Path | Notes |
|--------|------|-------|
| GET/POST | `/pico-units` | List (paginated) / Register (upsert, called by Pico on boot) |
| GET/PATCH/DELETE | `/pico-units/:id` | CRUD |
| GET/POST | `/pico-units/:id/sensors` | Proxy → Pico `/sensors` |
| GET/POST | `/pico-units/:id/setpoints` | Proxy → Pico `/setpoints` |
| GET/POST | `/pico-units/:id/outputs` | Proxy → Pico `/outputs` |
| GET/POST | `/pico-units/:id/setup` | Proxy → Pico `/setup` |
| GET/POST | `/pico-units/:id/control` | Proxy → Pico `/control` |
| GET | `/pico-units/:id/readings` | Filterable by time range + limit |
| GET/POST/PATCH/DELETE | `/batches` + `/batches/:id` | Batch CRUD |
| GET | `/pico-units/:id/batches` | Batches for a unit |
| GET | `/batches/:id/readings` | Readings for a batch |
| GET | `/monitoring/ping` + `/monitoring/health` | Liveness / full health |

## Cron Polling

`CronService` polls all **enabled** `PicoUnit`s: fetches `GET /` → creates `Readings` → updates `last_seen` + `failed_calls` + board metadata. Failed units increment `failed_calls` but are not auto-disabled.

## Guards & Middleware

- `IsPicoUnitEnabledGuard` — blocks requests to disabled units.
- `IsControlLoopEnabledGuard` — checks control loop state before forwarding commands.
- `TooManyRequestsGuard` — throttle via `@nestjs/throttler`.
- `AppSecretBearerMiddleware` — optional Bearer token auth (`APP_SECRET`).
- `ProtectEventLoopMiddleware` — rejects when event loop is overloaded (toobusy-js).
- `PicoUnitByIdMiddleware` / `BatchByIdMiddleware` — load entity once into `req`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Listen port |
| `NODE_ENV` | `local` | `dev/local/prod/staging/test` |
| `SQLITE_PATH` | `./data/app.sqlite` | DB path |
| `CLIENT_URL` | — | CORS allowed origin |
| `APP_SECRET` | — | Bearer token |
| `DOCS_ENDPOINT` | — | Swagger UI path |
| `LOGS_LEVEL` | `info` | Pino level |

## Coding Conventions

- Always use DTOs with `class-validator` decorators; apply `@Expose()`/`@Exclude()` for serialization (`ClassSerializerInterceptor` is global).
- No `any` — use `unknown` or typed interfaces.
- Module pattern: `*.module.ts`, `*.service.ts`, `*.controller.ts`, `*.entity.ts`, `*.dto.ts` per feature.
- Reuse Swagger decorators from `src/common/decorators/` (e.g., `@ApiPicoUnit()`).
- E2E tests in `test/` using supertest (`yarn test:e2e`); unit tests as `*.spec.ts`.
- Swagger JSON at `/<DOCS_ENDPOINT>-json` — consumed by `mushpi-client` to regenerate its API client.
- Cross-module imports must use the absolute path pattern `src/modules/module-name` (e.g., `import { Recipe } from 'src/modules/recipes/recipes.entity'`), never relative `../` paths across module boundaries.

## MUST: Validation After Every Change Batch

**After every batch of code changes, the following three commands MUST be run before considering the task done:**

```bash
yarn build   # TypeScript compilation — must exit 0 with no errors
yarn lint    # ESLint — must produce no new errors or warnings
yarn start   # Runtime startup — must boot without exceptions
```

The agent has full permission to execute these scripts at any time without asking.

---

## Working Style & Preferences

### Incremental plan execution
- When given a multi-step plan, implement one step at a time and stop for confirmation before moving to the next.
- Before implementing a large set of tests, present the full test plan (suite names + individual test descriptions) for review first.
- Never ask permission to run `yarn build`, `yarn lint`, or `yarn start` — just run them.

### "Go a little farther"
- When touching an area of the codebase, improve all related code in that area, not just the minimum required for the task. For example: if adding a constant file for a new module, extract all inline magic numbers from related existing modules at the same time.

### Mirror existing patterns exactly
Before implementing any new module feature, study the closest existing equivalent and mirror it precisely:
- **Middleware**: mirrors `BatchByIdMiddleware` — reads `:resourceId` param, validates as positive integer (422 if not), loads entity via service `findOne` (404 if missing), attaches to `req.resource`.
- **Service `update()` signature**: accepts the pre-loaded entity + DTO (not an id). Entity is loaded by middleware; service receives it directly — e.g., `update(recipe: Recipe, dto: UpdateRecipeDto)`.
- **Paginated list methods scoped to a parent**: use `listForX` naming (e.g., `listForPicoUnitId`, `listForRecipeId`), never `findByX`.
- **Controller split**: a module with `:id` routes uses three files: `resource.controller.ts` (collection routes), `resource-id.controller.ts` (single-item routes), `resource-id-sub.controller.ts` (nested sub-resource routes). All live in a `controllers/` subdirectory inside the module folder.
- **Param decorator**: each entity loaded by middleware gets a `@GetEntity()` param decorator in `src/common/decorators/` (e.g., `@GetRecipe()`).
- **Composite Swagger decorator**: each resource gets an `@ApiX()` composite decorator in `src/common/decorators/docs/` (e.g., `@ApiRecipe()`) that bundles `@ApiOperation`, `@ApiResponse`, and common response codes.

### Route parameter naming
Use `:resourceId` (not `:id`) in all route params, middleware registrations, and controller decorators — consistent with `:picoUnitId`, `:batchId`, `:recipeId`.

### Shared constants — single source of truth
All domain limit numbers (validator min/max, string lengths, pagination defaults) live in `src/common/constants/`. Never use inline magic numbers in DTOs, entities, or service logic:
- `climate.constants.ts` — temperature/humidity min/max
- `pagination.constants.ts` — default page size, max limit
- `validation.constants.ts` — string length limits (name, description, notes, etc.)
- `hardware.constants.ts` — TCP port range, GPIO ranges

### Type precision
- `temperature_target` and `humidity_target` are always **integers** — use `@IsInt()`, `{ type: 'integer' }` in TypeORM columns, and integer literals in Swagger metadata. Never float.
- Prefer `@IsInt()` over `@IsNumber()` for whole-number fields.

### Data integrity by design
- Snapshot copy over live reference: when linking a template/recipe to a record, copy the values at creation time. Editing the template must never silently alter historical records.
- Treat FK references that were used as a template as **immutable after creation** (omit them from `UpdateDto`).
- For soft-delete FK patterns use `onDelete: 'SET NULL'` — preserve the record history, nullify the reference.
- SQLite requires `PRAGMA foreign_keys = ON` (off by default) for `ON DELETE SET NULL` / `CASCADE` to actually fire. Always enable it via `prepareDatabase` in `sqlite.module.ts`.

### Module wiring checklist (new module)
1. Entity registered in both `src/modules/sqlite/data-source.ts` (TypeORM CLI) **and** `TypeOrmModule.forFeature([Entity])` inside the module (runtime) — both must be kept in sync.
2. Module imported in `app.module.ts`.
3. If two modules reference each other's services, use `forwardRef(() => ModuleX)` on **both** sides of the import.
4. `autoLoadEntities: true` alone is NOT sufficient — entities must be registered via `TypeOrmModule.forFeature()` in a module that is imported into `AppModule`.

### E2E test isolation
- Each test suite uses a unique `host:port` combination for any `PicoUnit` seed data to avoid unique-constraint conflicts when test suites run in parallel.
- Always call `clearX()` fixture helpers in `beforeEach` for every entity type the test suite touches.

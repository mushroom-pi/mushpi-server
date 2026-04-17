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

**Batch** (`batch`): `id`, `start_at`, `finish_at`, `species`, `temperature_target`, `humidity_target`, `notes`, `pico_unit_id` FK. Virtual getter `status` → `'in-progress'` | `'finished'`.

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

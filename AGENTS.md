# mushpi-server — Agent Instructions

NestJS 11 backend for mushroom growing control system. Runs on Raspberry Pi, polls Pico units via cron, stores readings in SQLite. Exposes REST API + OpenAPI spec consumed by `mushpi-client`.

## External Relationships

- **mushpi-grow** (Pico units): each unit runs a MicroPython HTTP server on `handle.local:port`. Server proxies calls (`/sensors`, `/setpoints`, `/outputs`, `/setup`, `/control`) via mDNS → IP fallback using `src/common/utils/http-fallback.ts` (`getWithFallback`/`postWithFallback`). Units self-register on boot via `POST /pico-units`.
  - **Pico response validation**: `validateDeviceResponse()` in `readings.service.ts` validates the Pico `GET /` response against `DeviceResponseDto` with `whitelist: true` + `forbidNonWhitelisted: false`. Any key the Pico emits that is not decorated on the DTO is **silently dropped** — no error, no warning, no `failed_calls` increment. Firmware field names must match the DTO exactly (e.g. `outputs.heater`, not `outputs.heater_on`).
- **mushpi-client** (frontend): consumes Swagger JSON at `/<DOCS_ENDPOINT>-json` to regenerate its API client. CORS origin from `CLIENT_URL` env var.

## Verification Commands

Run these after every feature delivery without asking:

```bash
yarn build     # Must exit 0
yarn lint      # Must have no new errors
yarn test      # Unit tests — must all pass
yarn test:e2e  # E2E tests — must all pass
yarn start     # Must boot without exceptions
```

## E2E Test Conventions

When new functionality is added, **propose and write e2e tests** that cover the new behavior. At minimum, consider:

- **Happy path**: the expected outcome when all conditions are met
- **Boundary/edge**: time windows, empty inputs, missing relations, null fields
- **State persistence**: any accumulated state (e.g. `lastHandleBatchSyncAt`) that persists across test cases — reset it in `beforeEach` to avoid cross-test contamination

Tests that exercise time-windowed queries must use `finish_at` / `start_at` timestamps that fall within the window the production code actually computes (e.g. within the last 60 seconds for `handleBatchSync()`), or explicitly pass a `since` argument wide enough to cover the seeded data.

## Project-Specific Domain Rules

### Column/property naming convention

All stored columns use **snake_case property names** (e.g. `last_seen`, `micropython_version`, `face_color`, `mac`) that match the database column name directly — no `@Column({ name })` overrides needed. This is the convention across the SQL entity definitions. Computed `@Expose()` getters use camelCase (e.g. `host`, `address`, `ipAddress`).

### DTO partial-update contract

`PicoUnitsService.update()` uses `Object.assign(unit, dto)` for partial PATCH. This means **DTO fields must have no initializers** (no `?: string = ''`). Omitted fields are not own-enumerable properties, so `Object.assign` skips them. Adding a default value or initializer to any `UpdateXxxDto` field will incorrectly overwrite stored values on PATCH.

### `temperature_target` and `humidity_target` are always integers

Use `@IsInt()`, `{ type: 'integer' }` in TypeORM, `{ type: 'integer' }` in Swagger. Never floats.

### Batch `status` — computed, not stored

- `'planned'`: `start_at > now`
- `'in-progress'`: `(finish_at IS NULL OR finish_at > now) AND start_at < now`
- `'finished'`: `finish_at < now`
  Requires `@Expose()` + `@ApiProperty()` to serialize.

### Batch lifecycle constraints

- **Create**: if unit has an active batch, reject unless active batch has `finish_at` AND new `start_at > finish_at`.
- **Update**: if `start_at` has passed, prevent changing `start_at` (409). If `finish_at` has passed, allow `description`/`notes` only (409 for other fields).

### Selective relation loading

- `list()`: loads both `pico_unit` + `recipe`
- `listForPicoUnitId()`: loads only `recipe` (unit implicit from URL)
- `listForRecipeId()`: loads only `pico_unit` (recipe implicit from URL)
  Via private `listInternal()` with relation params.

### Data integrity

- Snapshot copy over live reference: when linking recipe to batch, copy `species`, `temperature_target`, `humidity_target` at creation. Editing recipe must never alter historical batches.
- Immutable FK references (`recipe_id`, `pico_unit_id`) omitted from UpdateDto via `OmitType`.
- Entity registration: `src/modules/sqlite/data-source.ts` (CLI) + `TypeOrmModule.forFeature` (runtime) — both required.

### Image uploads

- `image` field stores filename (e.g. `1.jpg`) for uploaded files or external URL
- `image_url` is a computed field (not stored) that returns absolute URL for uploaded files or the external URL as-is
- Uploaded files stored in `data/images/recipes/` and served via `ServeStaticModule` at `/images/`
- Recipe deletion also removes the associated uploaded image file
- Shared image utilities in `src/common/utils/image-url.util.ts` and `src/common/utils/image-file.util.ts` — both recipes and batches use these for URL computation and file deletion; pass a `pathPrefix` (e.g. `/images/recipes`) to reconstruct full paths from filenames
- Shared multer options factory in `src/common/interceptors/image-upload.helpers.ts`

#### Batch images (multi-image, no hotlinking)

- `images` column (`simple-json`) stores an array of filenames (e.g. `['1.jpg', '2.png']`), `[]` when empty
- `images_url` is a computed field returning absolute URLs for each image
- Up to 5 images per batch (`IMAGE_MAX_FILES_PER_BATCH`); additive PUT appends, rejecting if total would exceed 5
- Files stored in `data/images/batches/{batchId}/` subdirectories, enumerated `1.jpg`–`5.jpg` using first free slot
- `DELETE /batches/:batchId/images/:filename` removes one image; filename validated against path traversal
- Batch deletion (`removeById`) wipes the entire `data/images/batches/{batchId}/` subdirectory
- No hotlinking (files only, no URL body); uses `FilesInterceptor` with dynamic per-request max count

#### Computed fields with DI dependencies

When a computed field needs access to services (like `CustomConfigService` for `image_url`), compute it in the service layer rather than using `@Transform()` or getters. Apply the computation method to all service methods that return the entity.

#### Static file serving

When using `ServeStaticModule`, explicitly disable SPA mode with `serveStaticOptions: { index: false, fallthrough: false }` to prevent it from looking for `index.html`.

#### Static files and CORS

`ServeStaticModule` registers Express-level middleware that bypasses NestJS's `app.enableCors()`. Use the `setHeaders` callback in `serveStaticOptions` to add CORS headers manually:

```ts
setHeaders: (res) => {
  const origin = config.security.clientUrl;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
};
```

Also override `Cross-Origin-Resource-Policy` to `cross-origin` — `helmet` sets it to `same-origin` by default, which blocks cross-origin resource loading even when CORS headers are present.

#### Relative path storage

Store relative paths in the database (`/images/recipes/{id}.{ext}`) and compute absolute URLs at runtime using `configService.baseUrl`. This avoids hardcoding server URLs in the database.

#### Path resolution

Upload paths are driven by the `UPLOAD_DIR` env var (default `data`). Access via `configService.upload.imageDir` (resolves to `${UPLOAD_DIR}/images`). The `ServeStaticModule` root path uses `path.resolve(config.upload.imageDir)`. In Docker, set `UPLOAD_DIR: /data` so uploads land in the mounted volume.

## Module Layout

```
pico-units/   — CRUD + ping proxy
readings/     — readings storage and time-range queries
batches/      — batch CRUD + lifecycle rules + recipe linking
control/      — proxy: setpoints, outputs, setup, control loop toggle (each triggers an immediate trailing poll via `callPollAndUpdate`)  
cron/         — scheduled polling of all enabled Pico units
monitoring/   — /ping, /health
swagger/      — OpenAPI setup with global error schemas; provider registered in AppModule, invoked manually in main.ts; also powers spec:export
```

## API Specification Tooling

The server code (NestJS decorators) is the **source of truth** for the REST API. The OpenAPI spec and Bruno collection are derived artifacts generated via scripts:

```bash
yarn spec:export   # Generates spec/openapi.json + spec/openapi.yaml (in-process, no HTTP server)
yarn spec:bruno    # Converts spec/openapi.json → spec/bruno/ Bruno collection (.bru directory)
yarn spec:all      # Both (runs spec:export then spec:bruno)
```

### Generated files

| Path | Committed? | Purpose |
|------|-----------|---------|
| `spec/openapi.json` | Yes | Canonical API contract — consumed by mushpi-client's `yarn gen:all:remote` |
| `spec/openapi.yaml` | Yes | Human-readable YAML version of the same contract |
| `spec/bruno/` | No (gitignored) | Bruno collection — directory of `.bru` files + `bruno.json`, fully regenerable |

### Pre-commit hook

Husky detects `src/` changes and automatically runs `yarn spec:all`, then stages `spec/openapi.json` and `spec/openapi.yaml`. No `src/` changes → skipped. This keeps the committed spec in lockstep with the code.

### `setupSwagger()` at runtime vs spec export

`SwaggerModule.setupSwagger()` calls `buildOpenApiDocument()` with `appendEnvSuffix: true` to produce the title `"mushpi-server LOCAL"` (or DEV/PROD). The `spec:export` script calls it with `appendEnvSuffix: false` to produce a deterministic title (`"mushpi-server"`) suitable for committed output.

### SwaggerModule dual wiring

`SwaggerModule` is registered as a **provider in `AppModule`** but invoked **manually in `main.ts`** (not via DI in a controller). This exists because `setupSwagger()` needs the `INestApplication` instance before the server starts. The `spec:export` script (`spec/generators/openapi.generator.ts`) gets it via `app.get(SwaggerModule)` after booting a lightweight `NestFactory.createApplicationContext()` (no HTTP listener).

### Script conventions (ts-node)

Scripts that import TypeScript source using `src/*` path aliases (e.g. `spec/generators/`, `docs/`) must be invoked with:

```bash
ts-node -r tsconfig-paths/register <script.ts>
```

This is the established pattern (also used by the `typeorm` CLI script). Without `tsconfig-paths/register`, the path aliases configured in `tsconfig.json` won't resolve.

## REST API

| Method           | Path                                      | Notes                                                                          |
| ---------------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| GET/POST         | `/pico-units`                             | List (paginated) / Manual create (verify reachability via mDNS, then create)   |
| POST             | `/pico-units/announce`                    | Pico hardware announcement (upsert by handle, requires `X-Pico-Secret` header) |
| GET/PATCH/DELETE | `/pico-units/:picoUnitId`                 | CRUD                                                                           |
| GET              | `/pico-units/:picoUnitId/ping`            | Proxy → Pico `/`                                                               |
| PUT              | `/pico-units/:picoUnitId/setpoints`       | Proxy → Pico `/setpoints`                                                      |
| PUT              | `/pico-units/:picoUnitId/setup`           | Proxy → Pico `/setup`                                                          |
| PUT              | `/pico-units/:picoUnitId/outputs`         | Proxy → Pico `/outputs`                                                        |
| POST/DELETE      | `/pico-units/:picoUnitId/control`         | Proxy → Pico `/control` toggle                                                 |
| POST             | `/pico-units/:picoUnitId/poll`            | On-demand Pico poll → store reading → return PicoUnit with `latest_reading`    |
| PUT              | `/pico-units/:picoUnitId/reboot`          | Proxy → Pico POST /reboot (soft/hard reset); returns 202                       |
| GET              | `/pico-units/:picoUnitId/readings`        | Filterable by time range + limit                                               |
| GET              | `/pico-units/:picoUnitId/batches`         | + `/current`                                                                   |
| GET/POST         | `/batches`                                | List (paginated) / Create                                                      |
| GET/PATCH/DELETE | `/batches/:batchId`                       | CRUD                                                                           |
| GET              | `/batches/:batchId/readings`              | Readings for a batch                                                           |
| POST             | `/batches/:batchId/recipe`                | Link recipe to batch                                                           |
| PUT/DELETE       | `/batches/:batchId/images/:filename`      | Batch image upload (append, max 5) / removal                                   |
| GET/POST         | `/recipes`                                | List / Create                                                                  |
| GET/PATCH/DELETE | `/recipes/:recipeId`                      | CRUD                                                                           |
| GET              | `/recipes/:recipeId/batches`              | Batches using this recipe                                                      |
| PUT/DELETE       | `/recipes/:recipeId/image`                | Recipe image upload/removal                                                    |
| GET              | `/monitoring/ping` + `/monitoring/health` | Liveness / full health                                                         |

## Cron Polling

`CronService` polls all **enabled** PicoUnits every minute: `GET /` → creates `Readings` → updates `last_seen` + `failed_calls` + board metadata.

**Readings ingestion funnel**: `ReadingsService.createFromDeviceResponse()` is the **only** write path for the `readings` table — there is no direct POST endpoint for readings and no batch-side writes. Any quality filter or validation rule for incoming readings belongs in `ReadingsService.pollReadingsFromUnit()` (the caller), not in `createFromDeviceResponse` itself, which should remain a pure mapper/persister. Failed units increment `failed_calls` but are not auto-disabled. Uses error-safe wrappers (`applyBatchSettingsSafe`) to avoid crashing the cron job.

`CronService` also runs an immediate startup sweep via `OnApplicationBootstrap` in addition to the `@Cron(EVERY_MINUTE)` tick; both delegate to the same private `runReadingsSweep()` method so behaviour stays uniform. The startup sweep is fire-and-forget (`void …catch()`) to avoid blocking the HTTP server bind.

The Pico's `system.wifi.mac` is also captured during polling and persisted to `PicoUnit.mac` (nullable text). **MAC is set only once** (first successful poll) and never overwritten — it is immutable hardware identity. The client uses it to derive the AP provisioning SSID.

Cron-side state changes that are time-anchored (e.g. disabling the control loop after a batch finishes) should use a time-windowed query so the action is naturally self-limiting. For batch-finish auto-disable, `findUnitsWithFinishedBatch()` only considers batches that finished in the last 60s — they fall out of the window and are never re-disabled. The `BATCH_EVENTS.FINISHED` event handler handles the primary synchronous path.

### State-visibility split: proxy vs. batch-orchestrated changes

Control-proxy endpoints (`setpoints`, `outputs`, `setup`, `control`) use `callPollAndUpdate` which POSTs to the Pico then immediately polls, so `latest_reading` reflects the new state right away. Batch-orchestrated changes (`applyBatchSettings`, `applyControlLoopDisable`, `applyUnitDisabled`) use `callSilent` — the Pico is updated but **no trailing poll** occurs. The server's `latest_reading` therefore lags the Pico's actual state by up to 60 s (the next cron tick). This is intentional: batch-driven changes are bulk operations where a per-unit poll would serialize and block the cron loop. The `POST /pico-units/:picoUnitId/poll` endpoint exists for the frontend to force an immediate poll when needed.

## Guards

- `IsPicoUnitEnabledGuard` (410 Gone for disabled units) — used via `@OnlyEnabledPicoUnits()` decorator
- `IsControlLoopEnabledGuard` (409 Conflict when control loop active, prevents manual output changes) — used via `@OnlyEnabledPicoUnitsWithControlLoop()`
- `PicoAnnounceSecretGuard` (401 Unauthorized, validates `X-Pico-Secret` header against `PICO_ANNOUNCE_SECRET`) — used via `@PicoAnnounceSecret()` composite decorator
- `TooManyRequestsGuard` — `@nestjs/throttler` rate limiting
- `AppSecretBearerMiddleware` — optional Bearer token auth from `APP_SECRET`
- `ProtectEventLoopMiddleware` — toobusy-js overload rejection

Every guard must be bundled with its Swagger error responses into a composite decorator under `src/common/decorators/docs/`, regardless of how many methods use it. The extraction criterion is "guard + Swagger bundle" — not reuse count. This keeps controllers pure (endpoint definitions and Swagger docs only, no guard wiring scattered inline). For reference: `@OnlyEnabledPicoUnitsWithControlLoop()` is single-use yet still extracted.

## Migrations

Schema changes for production (`NODE_ENV=prod`, where `synchronize: false`) require a migration file. Dev/local auto-syncs via `synchronize: !isProd`.

- **Directory**: `src/modules/sqlite/migrations/`
- **Naming**: `<timestamp>-<DescriptiveName>.ts` (use `Date.now()` as timestamp)
- **Template**:

  ```ts
  import { MigrationInterface, QueryRunner } from 'typeorm';

  export class DescriptiveName<timestamp> implements MigrationInterface {
    name = 'DescriptiveName<timestamp>';

    public async up(queryRunner: QueryRunner): Promise<void> {
      await queryRunner.query(
        `ALTER TABLE table_name ADD COLUMN column_name TYPE`,
      );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
      await queryRunner.query(`ALTER TABLE table_name DROP COLUMN column_name`);
    }
  }
  ```

- SQLite requires ≥ 3.35.0 for `DROP COLUMN` (bundled `better-sqlite3` satisfies this).
- Entity changes also require registration in both `data-source.ts` (CLI) and `TypeOrmModule.forFeature` (runtime).
- **Migrations are never auto-run on app boot.** They must be applied explicitly via `yarn migration:run` as part of the release process. `synchronize: !isProd` handles dev/local schema sync.
- **Data-only migrations** (no schema change, e.g. one-shot `DELETE`/`UPDATE`) are valid. When the operation is irreversible, `down()` should be a no-op with a comment explaining why.

## Environment Variables

| Variable               | Default             | Description                                                                   |
| ---------------------- | ------------------- | ----------------------------------------------------------------------------- |
| `PORT`                 | `3000`              | Listen port                                                                   |
| `NODE_ENV`             | `local`             | `dev/local/prod/staging/test`                                                 |
| `SQLITE_PATH`          | `./data/app.sqlite` | DB path                                                                       |
| `CLIENT_URL`           | —                   | CORS allowed origin                                                           |
| `APP_SECRET`           | —                   | Bearer token (required in prod)                                               |
| `PICO_ANNOUNCE_SECRET` | `mushpi-dev-secret` | Shared secret for `POST /pico-units/announce` (required in prod, min 6 chars) |
| `DOCS_ENDPOINT`        | —                   | Swagger UI path                                                               |
| `LOGS_LEVEL`           | `info`              | Pino level                                                                    |

## Config

`CustomConfigService` exposes typed getters grouped by **domain area** — not by "what kind of value" (string, secret, etc.). The `security` getter is reserved for **cross-cutting/infra** concerns (global auth, rate limiting, event-loop protection, CORS). Domain-specific secrets belong in their own domain getter (e.g., `pico.announceSecret` for Pico-hardware trust, not `security.picoAnnounceSecret`). This keeps domain concerns colocated and prevents the `security` getter from becoming a grab-bag.

## E2E Testing Gotchas

- `forceExit: true` + `maxWorkers: 1` in `jest-e2e.json` — cron timers survive `app.close()`; parallel workers cause SQLite lock contention.
- Axios auto-mock makes `isAxiosError` return `undefined` — install manually in `beforeEach`:
  ```ts
  mockedAxios.isAxiosError = jest.fn(
    (err: any) => err?.isAxiosError === true,
  ) as any;
  ```
- `ClassSerializerInterceptor` must be registered in `createTestApp()` or `@Expose()` virtual getters are omitted.
- Each test suite uses unique `host:port` for PicoUnit seeds (unique constraint). Call `clearX()` for every touched entity in `beforeEach`.
- **IP fallback double-mock**: When a unit has an `ip` and the test simulates a network error (`isAxiosError: true` with `.request`, no `.response`), `getWithFallback` retries against the IP URL — the mock must reject **twice** (mDNS then IP). If the error has a `.response` (e.g. HTTP 500 from Pico), no fallback occurs — mock only once.
- **POST endpoints return 201 by default** unless `@HttpCode()` is specified. Test assertions expecting 200 must either add the decorator or assert 201.

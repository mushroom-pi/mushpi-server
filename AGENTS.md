# mushpi-server — Agent Instructions

NestJS 11 backend for mushroom growing control system. Runs on Raspberry Pi, polls Pico units via cron, stores readings in SQLite. Exposes REST API + OpenAPI spec consumed by `mushpi-client`.

## External Relationships

- **mushpi-grow** (Pico units): each unit runs a MicroPython HTTP server on `handle.local:port`. Server proxies calls (`/sensors`, `/setpoints`, `/outputs`, `/setup`, `/control`) via mDNS → IP fallback using `src/common/utils/http-fallback.ts` (`getWithFallback`/`postWithFallback`). Units self-register on boot via `POST /pico-units`.
- **mushpi-client** (frontend): consumes Swagger JSON at `/<DOCS_ENDPOINT>-json` to regenerate its API client. CORS origin from `CLIENT_URL` env var.

## Verification Commands

Run these after every change batch without asking:

```bash
yarn build   # Must exit 0
yarn lint    # Must have no new errors
yarn start   # Must boot without exceptions
```

## Project-Specific Domain Rules

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
}
```
Also override `Cross-Origin-Resource-Policy` to `cross-origin` — `helmet` sets it to `same-origin` by default, which blocks cross-origin resource loading even when CORS headers are present.

#### Relative path storage
Store relative paths in the database (`/images/recipes/{id}.{ext}`) and compute absolute URLs at runtime using `configService.baseUrl`. This avoids hardcoding server URLs in the database.

#### Path resolution
Use `path.resolve(process.cwd(), 'data/images')` for static file roots, not `path.join(__dirname, ...)`, since the app runs from the project root.

## Module Layout

```
pico-units/   — CRUD + ping proxy
readings/     — readings storage and time-range queries
batches/      — batch CRUD + lifecycle rules + recipe linking
control/      — proxy: setpoints, outputs, setup, control loop toggle
cron/         — scheduled polling of all enabled Pico units
monitoring/   — /ping, /health
swagger/      — OpenAPI setup with global error schemas
```

## REST API

| Method | Path | Notes |
|--------|------|-------|
| GET/POST | `/pico-units` | List (paginated) / Register (upsert, called by Pico on boot) |
| GET/PATCH/DELETE | `/pico-units/:picoUnitId` | CRUD |
| GET | `/pico-units/:picoUnitId/ping` | Proxy → Pico `/` |
| PUT | `/pico-units/:picoUnitId/setpoints` | Proxy → Pico `/setpoints` |
| PUT | `/pico-units/:picoUnitId/setup` | Proxy → Pico `/setup` |
| PUT | `/pico-units/:picoUnitId/outputs` | Proxy → Pico `/outputs` |
| POST/DELETE | `/pico-units/:picoUnitId/control` | Proxy → Pico `/control` toggle |
| GET | `/pico-units/:picoUnitId/readings` | Filterable by time range + limit |
| GET | `/pico-units/:picoUnitId/batches` | + `/current` |
| GET/POST | `/batches` | List (paginated) / Create |
| GET/PATCH/DELETE | `/batches/:batchId` | CRUD |
| GET | `/batches/:batchId/readings` | Readings for a batch |
| POST | `/batches/:batchId/recipe` | Link recipe to batch |
| PUT/DELETE | `/batches/:batchId/images/:filename` | Batch image upload (append, max 5) / removal |
| GET/POST | `/recipes` | List / Create |
| GET/PATCH/DELETE | `/recipes/:recipeId` | CRUD |
| GET | `/recipes/:recipeId/batches` | Batches using this recipe |
| PUT/DELETE | `/recipes/:recipeId/image` | Recipe image upload/removal |
| GET | `/monitoring/ping` + `/monitoring/health` | Liveness / full health |

## Cron Polling

`CronService` polls all **enabled** PicoUnits every minute: `GET /` → creates `Readings` → updates `last_seen` + `failed_calls` + board metadata. Failed units increment `failed_calls` but are not auto-disabled. Uses error-safe wrappers (`applyBatchSettingsSafe`) to avoid crashing the cron job.

## Guards

- `IsPicoUnitEnabledGuard` (410 Gone for disabled units) — used via `@OnlyEnabledPicoUnits()` decorator
- `IsControlLoopEnabledGuard` (409 Conflict when control loop active, prevents manual output changes) — used via `@OnlyEnabledPicoUnitsWithControlLoop()`
- `TooManyRequestsGuard` — `@nestjs/throttler` rate limiting
- `AppSecretBearerMiddleware` — optional Bearer token auth from `APP_SECRET`
- `ProtectEventLoopMiddleware` — toobusy-js overload rejection

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Listen port |
| `NODE_ENV` | `local` | `dev/local/prod/staging/test` |
| `SQLITE_PATH` | `./data/app.sqlite` | DB path |
| `CLIENT_URL` | — | CORS allowed origin |
| `APP_SECRET` | — | Bearer token (required in prod) |
| `DOCS_ENDPOINT` | — | Swagger UI path |
| `LOGS_LEVEL` | `info` | Pino level |

## E2E Testing Gotchas

- `forceExit: true` + `maxWorkers: 1` in `jest-e2e.json` — cron timers survive `app.close()`; parallel workers cause SQLite lock contention.
- Axios auto-mock makes `isAxiosError` return `undefined` — install manually in `beforeEach`:
  ```ts
  mockedAxios.isAxiosError = jest.fn((err: any) => err?.isAxiosError === true) as any;
  ```
- `ClassSerializerInterceptor` must be registered in `createTestApp()` or `@Expose()` virtual getters are omitted.
- Each test suite uses unique `host:port` for PicoUnit seeds (unique constraint). Call `clearX()` for every touched entity in `beforeEach`.

# mushpi-server — Reference (On-Demand)

Long-tail gotchas and detailed conventions. **Load only when the task touches these areas** — do not read on every spawn. The always-loaded [`AGENTS.md`](./AGENTS.md) holds the module map, entity/column table, scripts & hooks table, env/config table, top conventions, and the REST API table.

## Index

- [Pico Proxy Internals](#pico-proxy-internals) — axios retry centralization, Pico response validation, `api_compatibility` resolution table, accept-and-flag, strict-announce vs lenient-poll ingestion
- [Computed Status Fields](#computed-status-fields) — derivation rules for `Batch.status`, `PicoUnit.status`, `PicoUnit.api_compatibility` (moved from core)
- [E2E Test Conventions](#e2e-test-conventions) — project-specific e2e rules: time windows, state reset
- [Batch Lifecycle & Relation Loading](#batch-lifecycle--relation-loading) — create/update constraints, recipe template snapshot, immutable FKs, selective relation loading
- [Image Uploads & Static Serving](#image-uploads--static-serving) — recipe/batch image uploads, ServeStaticModule, SPA serving, static CORS, helmet CSP
- [API Versioning Internals](#api-versioning-internals) — version application sites, `operationIdFactory`, middleware×versioning workarounds, named wildcards, `main.ts` coverage gap
- [Spec Tooling Internals](#spec-tooling-internals) — generated artifacts table, Husky git hooks, runtime-vs-export title, SwaggerModule dual wiring, ts-node script conventions
- [Release Versioning](#release-versioning) — package-version bump policy, post-bump spec regeneration, `release.json`/tags prohibition (moved from core)
- [Cron Polling](#cron-polling) — sweep overlap/parallelism, readings ingestion funnel & quality gates, MAC/version refresh, time-windowed state changes, proxy-vs-batch poll visibility split
- [Pass-Through & Response Shape](#pass-through--response-shape) — non-persisted response fields, `@ApiProperty` coverage rule, validation-pipe safety, `forbidNonWhitelisted`, GPIO pin validation
- [Timezone](#timezone) — UTC storage, Settings module, TimezoneInterceptor
- [Logging](#logging) — error-vs-warn policy, `formatPollError`, pino-http duplicate suppression
- [Guards](#guards) — guard inventory and the composite-decorator bundling requirement
- [Migrations](#migrations) — directory, naming, barrel registration, baseline convention, prod `migrationsRun`
- [Environment Variables](#environment-variables) — key env var table (full generated reference: `docs/ENVIRONMENT.md`)
- [Config](#config) — `CustomConfigService` getter grouping philosophy
- [Raw SQL](#raw-sql) — SQLite datetime conversion for `repository.query()`; aggregation response shape (`AggregatedReadingsResponseDto`)
- [Local Verification](#local-verification-smoke-boot-without-disturbing-a-live-instance) — smoke-booting on throwaway paths without touching a live instance
- [E2E Gotchas](#e2e-gotchas) — jest worker/mocking/fixture quirks

---

## Pico Proxy Internals

- **Axios retry config is centralized**: all Pico-bound axios calls must use `configureAxiosRetry(axios)` from `http-fallback.ts`. Do **not** call `axiosRetry(axios, ...)` directly in service constructors. `configureAxiosRetry` is the single source of truth for retry count, retry condition, and retry delay. It only retries on transient HTTP server errors (5xx, 429) — connection-level errors (`EHOSTUNREACH`, `ECONNREFUSED`, `ENETUNREACH`, `ETIMEDOUT`) fail immediately.
- **Pico response validation**: `validateDeviceResponse()` in `readings.service.ts` validates the Pico `GET /` response against `DeviceResponseDto` with `whitelist: true` + `forbidNonWhitelisted: false`. Any key the Pico emits that is not decorated on the DTO is **silently dropped** — no error, no warning, no `failed_calls` increment. Firmware field names must match the DTO exactly (e.g. `outputs.heater`, not `outputs.heater_on`).
- **`api_compatibility` — the compatibility resolution table**: the computed (never stored) three-state verdict is derived at response time by `getPicoApiCompatibility(apiVersion, hasContactEvidence)` in `pico-unit-compatibility.util.ts`. `hasContactEvidence` is **`last_seen != null`** — `last_seen` is the sole contact-evidence marker. Because `PicoUnitsService.create()` (manual add) leaves `api_version` NULL, it **must set `last_seen`** after its successful `/ping` reachability check, or a manually-created unit would misclassify as `unknown` instead of `incompatible`.

  | Stored `api_version` | Contact evidence (`last_seen`) | `api_compatibility` |
  | -------------------- | ------------------------------ | ------------------- |
  | integer within `[PICO_API_VERSION_MIN, PICO_API_VERSION_MAX]` | either | `compatible` |
  | non-null integer outside the range (only above MAX today) | either | `incompatible` |
  | `NULL` / never reported | **yes** — contacted ⇒ firmware predates the handshake ⇒ needs update | `incompatible` |
  | `NULL` / never reported | **no** — server has no basis to judge | `unknown` |

- **`PICO_API_VERSION_MAX` is verdict-only, never a validation bound (accept-and-flag)**: it exists solely so `isSupportedPicoApiVersion()` can classify a value `compatible`/`incompatible`. Do **NOT** add `@Max(PICO_API_VERSION_MAX)` to `AnnouncePicoUnitDto` (it keeps only `@Min(1)`), and do **NOT** tighten the poll storage filter to `<= MAX` (it stays `>= PICO_API_VERSION_MIN`, **including values above MAX**). A newer-contract unit must be *stored and flagged*, never rejected — rejecting it would 422 the announce, lose the unit entirely, and break the IP-refresh fallback.
- **Poll leniency vs strict announce (asymmetric ingestion)**: the announce path is **strict** — `AnnouncePicoUnitDto.firmware_version` carries `@Matches(PICO_FIRMWARE_VERSION_REGEX)` (strict SemVer `MAJOR.MINOR.PATCH`; `-rc`/`+build` suffixes rejected per `mushpi-docs/versioning.md` §3.4), so a malformed announce version 422s. The poll path is **lenient** — `DeviceResponseDto.firmware_version`/`api_version` intentionally carry **no** `@IsString`/`@IsInt` validators, so malformed version metadata in a `GET /` response can never fail `validateDeviceResponse`, can never throw, can never increment `failed_calls`, and can never block reading persistence. Acceptance is decided by the predicates in `PicoUnitsService.touchAndResetFailedCalls()` (`isValidPicoFirmwareVersion` for the string, the existing `Number.isInteger && >= PICO_API_VERSION_MIN` check for the generation); rejected/garbage values are silently ignored and the **last accepted stored values are preserved** (`undefined`/`null` never clobber). Both version fields stay `@IsOptional` on the announce DTO so legacy firmware that omits them still announces. There is no `semver` dependency — `PICO_FIRMWARE_VERSION_REGEX` is the canonical check.

## Computed Status Fields

All three status fields are computed `@Expose()` getters — never `@Column`s, never migrated, never cron-maintained. Core (`AGENTS.md`) keeps a one-line pointer here.

- **Batch `status`**: `'planned'` (`start_at > now`) / `'in-progress'` / `'finished'` (`finish_at < now`). Requires `@Expose()` + `@ApiProperty()`.
- **PicoUnit `status`** (health): `'unmonitored'` / `'offline'` / `'degraded'` / `'healthy'` derived from `monitored`, `failed_calls` (threshold 3), `failed_readings`, `consecutive_empty_readings`. Requires `@Expose()` + `@ApiProperty({ enum: PICO_UNIT_STATUSES })`. Canonical values array/type live in `pico-unit.type.ts`.
- **PicoUnit `api_compatibility`**: `'compatible'` / `'incompatible'` / `'unknown'` — a **computed, required, non-nullable** `@Expose()` getter (NO `@Column`, no migration, no cron) judging the `api_version` contract generation ONLY. It is **separate from `status`/health** (a unit can be `healthy` AND `incompatible` at once) and is mirrored onto `DashboardUnitItemDto.api_compatibility` (not folded into health counts/warnings). Predicate lives in `pico-unit-compatibility.util.ts`; canonical values array/type + `PicoApiCompatibility` live in `pico-unit.type.ts`. The `PICO_API_VERSION_MAX` verdict-only rule, the full resolution table, and the strict-announce / lenient-poll ingestion asymmetry are in [Pico Proxy Internals](#pico-proxy-internals) — do not restate them elsewhere.

## E2E Test Conventions

When new functionality is added, **propose and write e2e tests** (see the `nestjs-backend` skill for general e2e patterns). Project-specific rules:

- Tests that exercise time-windowed queries must use `finish_at` / `start_at` timestamps that fall within the window the production code actually computes (e.g. within the last 60 seconds for `handleBatchSync()`), or explicitly pass a `since` argument wide enough to cover the seeded data.
- **State persistence**: any accumulated state (e.g. `lastHandleBatchSyncAt`) that persists across test cases — reset it in `beforeEach` to avoid cross-test contamination.

## Batch Lifecycle & Relation Loading

### Batch lifecycle constraints

- **Create**: if unit has an active batch, reject unless active batch has `finish_at` AND new `start_at > finish_at`.
- **Update**: if `start_at` has passed, prevent changing `start_at` (409). If `finish_at` has passed, allow `description`/`notes` only (409 for other fields).

### Template snapshot & immutable FKs

- **Snapshot copy over live reference**: at batch creation, an optional `recipe_id` acts as a template — `species`, `temperature_target`, `humidity_target` are copied from the recipe into the batch (unless explicitly supplied on the DTO). Editing a recipe must never alter historical batches.
- **Immutable FK references** (`recipe_id`, `pico_unit_id`) are omitted from UpdateDto via `OmitType`. (Dual entity-registration rule: kept in core; see also [Migrations](#migrations).)

### Selective relation loading

- `list()`: loads both `pico_unit` + `recipe`
- `listForPicoUnitId()`: loads only `recipe` (unit implicit from URL)
- `listForRecipeId()`: loads only `pico_unit` (recipe implicit from URL)
  Via private `listInternal()` with relation params.

## Image Uploads & Static Serving

### Image uploads

- `image` field stores filename (e.g. `1.jpg`) for uploaded files or external URL
- `image_url` is a computed field (not stored) that returns a root-relative URL (e.g. `/images/recipes/1.jpg`) for uploaded files, or the external URL as-is
- Uploaded files stored in `data/images/recipes/` and served via `ServeStaticModule` at `/images/`
- Recipe deletion also removes the associated uploaded image file
- Shared image utilities in `src/common/utils/image-url.util.ts` and `src/common/utils/image-file.util.ts` — both recipes and batches use these for URL computation and file deletion; pass a `pathPrefix` (e.g. `/images/recipes`) to reconstruct full paths from filenames
- Shared multer options factory in `src/common/interceptors/image-upload.helpers.ts`

#### Batch images (multi-image, no hotlinking)

- `images` column (`simple-json`) stores an array of filenames (e.g. `['1.jpg', '2.png']`), `[]` when empty
- `images_url` is a computed field returning root-relative URLs for each image (e.g. `/images/batches/7/1.jpg`)
- Up to 5 images per batch (`IMAGE_MAX_FILES_PER_BATCH`); additive PUT appends, rejecting if total would exceed 5
- Files stored in `data/images/batches/{batchId}/` subdirectories, enumerated `1.jpg`–`5.jpg` using first free slot
- `DELETE /batches/:batchId/images/:filename` removes one image; filename validated against path traversal
- Batch deletion (`removeById`) wipes the entire `data/images/batches/{batchId}/` subdirectory
- No hotlinking (files only, no URL body); uses `FilesInterceptor` with dynamic per-request max count

#### Computed fields with DI dependencies

When a computed field needs access to services (like `CustomConfigService` for `upload.imageDir` used in image file deletion), compute it in the service layer rather than using `@Transform()` or getters. Apply the computation method to all service methods that return the entity.

#### Static file serving

`ServeStaticModule` is used for two distinct purposes — keep them separate:

1. **Asset-only entries** (e.g. `/images` for uploads): explicitly disable SPA fallback with `serveStaticOptions: { index: false, fallthrough: false }` to prevent it from looking for `index.html`. Current asset-only entries: `/images` (uploaded recipe/batch images, `rootPath` from `config.upload.imageDir`) and `/public` (repo-root build-time branding assets — Swagger UI favicon served at `/public/favicon.svg`; `rootPath: path.resolve('public')`, ships via Docker COPY, not a volume). `/public` also sets `serveStaticOptions.redirect: false` and `exclude: ['/public', '/public/']`: with `index: false` the bare directory URL would otherwise 301-redirect (`redirect: true`) or leak a non-ENOENT `http-errors` 404 that the error middleware forwards uncaught → global filter → **500**; `exclude` forces ServeStaticModule's error middleware to translate the directory 404 into a Nest `NotFoundException` (404 JSON). The trailing-slash exclude entry is required because ServeStaticModule's `isRouteExcluded` appends `/` before matching, and path-to-regexp's `/public` does NOT match `/public//`.

2. **SPA serving** (the built `mushpi-client` frontend, when `CLIENT_DIST_DIR` is set): use the OPPOSITE shape — do **not** set `index: false`/`fallthrough: false`. Instead register a conditional entry with `renderPath: '{*any}'` (path-to-regexp **v8 syntax** — malformed `exclude` patterns throw per-request, so keep them minimal) and `exclude: ['/v1/{*any}']` so unknown API GETs keep JSON 404 semantics rather than falling back to `index.html`. Gate the entry on `CLIENT_DIST_DIR` being set AND `index.html` existing at that path. Cache headers: `no-cache` for `index.html`, `public, max-age=31536000, immutable` for `/assets/*`.

**Registration order is safe**: Express registers controller routes (`/v1/*`, `/ping`, `/health`, `/metrics`) and Swagger docs **before** `ServeStaticModule`'s `onModuleInit` static middleware + catch-all, and before Nest's not-found handler. So the SPA catch-all can only fire for requests matching no controller route — it cannot shadow the API, monitoring, docs, or `/images` (whose `fallthrough: false` responds 404 ahead of it). Note also: every `serveRoot` entry additionally registers a renderFn GET route at `serveRoot + '{*any}'` that resolves `index.html` — if that route ever handled a request for an asset-only root, it would throw on the missing `index.html`; `fallthrough: false` makes the static middleware answer the request (200 or terminal 404) first, so the renderFn stays dead code for `/images` and `/public`.

**helmet CSP governs the SPA**: once the server serves the client HTML, helmet's `contentSecurityPolicy` applies to it (in dev the UI came from Vite :5173, outside helmet's reach). `img-src` is relaxed to `["'self'", 'data:', 'blob:', 'https:']` in `main.ts` for hotlinked recipe images and blob/object-URL previews. Any future client feature that loads cross-origin resources must be CSP-audited against helmet defaults.

#### Static files and CORS

`ServeStaticModule` registers Express-level middleware that bypasses NestJS's `app.enableCors()`. Use the `setHeaders` callback in `serveStaticOptions` to add CORS headers manually:

```ts
setHeaders: (res) => {
  const origin = config.client.clientUrl;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
};
```

Also override `Cross-Origin-Resource-Policy` to `cross-origin` — `helmet` sets it to `same-origin` by default, which blocks cross-origin resource loading even when CORS headers are present.

#### Relative path storage

Store filenames in the database (e.g. `1.jpg`) and emit root-relative URLs at runtime (e.g. `/images/recipes/1.jpg`) via `buildImageUrl`/`buildImageUrls` in `src/common/utils/image-url.util.ts`. External `http(s)://` hotlinks pass through as-is. This avoids hardcoding server URLs in the database or in the API response.

#### Path resolution

Upload paths are driven by the `UPLOAD_DIR` env var (default `data`). Access via `configService.upload.imageDir` (resolves to `${UPLOAD_DIR}/images`). The `ServeStaticModule` root path uses `path.resolve(config.upload.imageDir)`. In Docker, set `UPLOAD_DIR: /data` so uploads land in the mounted volume.

## API Versioning Internals

### Version application sites

`app.enableVersioning({ type: VersioningType.URI, defaultVersion: API_VERSION })` (constant `API_VERSION = '1'` in `src/common/utils/api-version.ts`) must be applied in **three** places — `main.ts`, `test/test-setup.ts`, and `spec/generators/openapi.generator.ts` — each time **before** any route registration or Swagger document building. Without the spec-generator application the committed `openapi.json` silently omits the `/v1/` prefix and the generated client uses wrong paths.

### Swagger operationIdFactory

The `V1` controller suffix is stripped from OpenAPI `operationId` values via a custom factory in `SwaggerModule.buildOpenApiDocument()`:

```ts
operationIdFactory: (controllerKey, methodKey, version) => {
  const cleanKey = controllerKey.replace(/V1(?=Controller)/, '');
  return version ? `${cleanKey}_${methodKey}_${version}` : `${cleanKey}_${methodKey}`;
}
```

This keeps the generated client contract stable — operationIds like `BatchesController_create_v1` (not `BatchesV1Controller_create_v1`). The version segment `_v1` at the end comes from the `version` parameter, not the class name.

### Middleware and API Versioning

NestJS 11's `MiddlewareConsumer` with the `version` property in `forRoutes()` is **broken** with `path-to-regexp` v8 (Express 5) — it throws `TypeError: Unexpected ( at 8, expected END`. Two workarounds are in place:

1. **Global middleware** (`ProtectEventLoopMiddleware`, `AppSecretBearerMiddleware`): registered via `app.use()` in `main.ts` and `test-setup.ts`, bypassing route versioning entirely — they apply to all routes including monitoring and static assets.

2. **Route-specific middleware** (`PicoUnitByIdMiddleware`, `BatchByIdMiddleware`, `RecipeByIdMiddleware`): use explicit `v1/` prefix in path strings (e.g. `forRoutes('v1/pico-units/:picoUnitId')`) in their respective module's `configure()` method. This avoids the broken `version` property on `RouteInfo` objects.

### Named wildcards in Express 5 paths (path-to-regexp v8)

Express 5 / path-to-regexp v8 rejects bare `*` wildcards: **every** wildcard route or middleware path must be *named* — `'{*splat}'` / `'{*any}'` in Nest path strings, `'*path'` in `forRoutes()`. A bare `*` throws `TypeError: Missing parameter name at N` **eagerly at registration time** (when `app.use(path, …)` runs), so it crashes boot rather than failing per-request. Existing mounts follow the rule: the docs basicAuth middleware in `main.ts` uses `'/' + configService.docs.endpoint + '{*splat}'`, and the SPA `ServeStaticModule` entry uses `renderPath: '{*any}'`. Any new `app.use(path, …)` with a wildcard must do the same.

**Coverage gap — smoke-test `main.ts` boot wiring manually.** The bootstrap-only wiring in `main.ts` (docs basicAuth mount, Swagger `setupSwagger()` call) is exercised by **no** unit or e2e suite — `test/test-setup.ts` builds its own app and does not replicate it. Note also that the Joi schema forces `DOCS_USERNAME` to `''` outside `NODE_ENV=prod`, so the basicAuth branch is only reachable in a prod-style boot — which is exactly why dev (no docs auth) and e2e never caught the bare-`*` crash. Therefore: any boot-affecting `main.ts` change must be smoke-tested by actually starting the app with the docs vars set (`DOCS_ENDPOINT`, `DOCS_USERNAME`, `DOCS_PASSWORD` — with `NODE_ENV=prod` to reach the auth path), and verified by curling the docs endpoint for 401 → 200-with-creds. Point `SQLITE_PATH` (and `LOGS_PATH`) at throwaway paths under `/tmp` during such a smoke test so no real dev/prod database is touched.

## Spec Tooling Internals

The server code (NestJS decorators) is the **source of truth** for the REST API. The OpenAPI spec and Bruno collection are derived artifacts generated via scripts (`yarn spec:export`, `yarn spec:bruno`, `yarn spec:all`).

### Generated files

| Path | Committed? | Purpose |
|------|-----------|---------|
| `spec/openapi.json` | Yes | Canonical API contract — consumed by mushpi-client's `yarn gen:all:remote` |
| `spec/openapi.yaml` | Yes | Human-readable YAML version of the same contract |
| `spec/bruno/` | No (gitignored) | Bruno collection — directory of `.bru` files + `bruno.json`, fully regenerable |

### Git hooks (Husky)

- **`pre-commit`**: detects `src/` changes and automatically runs `yarn spec:all`, then stages `spec/openapi.json` and `spec/openapi.yaml`. No `src/` changes → skipped. This keeps the committed spec in lockstep with the code.
- **`commit-msg`**: runs commitlint (Conventional Commits).
- **Yarn 4 does not run the root `prepare` script on a plain `yarn install`** once dependencies are cached, so an absent/broken `.husky/_` is *not* repaired by `yarn install` alone. Reinstall the hooks with `yarn prepare` (or `rm -rf .husky/_ && yarn prepare`), then confirm `git config core.hooksPath` is `.husky/_`.

### `setupSwagger()` at runtime vs spec export

`SwaggerModule.setupSwagger()` calls `buildOpenApiDocument()` with `appendEnvSuffix: true` to produce the title `"mushpi-server LOCAL"` (or DEV/PROD). The `spec:export` script calls it with `appendEnvSuffix: false` to produce a deterministic title (`"mushpi-server"`) suitable for committed output.

### SwaggerModule dual wiring

`SwaggerModule` is registered as a **provider in `AppModule`** but invoked **manually in `main.ts`** (not via DI in a controller). This exists because `setupSwagger()` needs the `INestApplication` instance before the server starts. The `spec:export` script (`spec/generators/openapi.generator.ts`) gets it via `app.get(SwaggerModule)` after booting a `NestFactory.create(AppModule, { logger: false })` instance (no HTTP listener — `app.listen()` is never called).

### Script conventions (ts-node)

Scripts that import TypeScript source using `src/*` path aliases (e.g. `spec/generators/`, `docs/`) require `tsconfig-paths/register`. The `typeorm` CLI script follows the same pattern.

## Release Versioning

Policy detail (core keeps a one-line pointer here):

- Commit messages follow **Conventional Commits**, enforced by commitlint (`commitlint.config.mjs`, `@commitlint/config-conventional`) via the Husky `commit-msg` hook (see [Spec Tooling Internals → Git hooks](#git-hooks-husky)).
- The `package.json` `version` is bumped **only when releasing, on the `main` branch** — never during day-to-day `dev` work.
- After any version bump, run `yarn spec:all` so the committed OpenAPI spec carries the same `info.version` as `package.json`.
- Never edit the root `release.json` or git tags.

## Cron Polling

`CronService` polls all **monitored** PicoUnits every minute: `GET /` → creates `Readings` → updates `last_seen` + `failed_calls` + `failed_readings` + board metadata.

**Cron overlap protection**: The `@Cron(EVERY_MINUTE)` decorator does not prevent parallel executions. `handleReadings()` checks an `isPolling` flag before running — if a previous sweep is still in progress (e.g., many units or slow network), the tick is skipped with a warning log. The flag is set in a `try/finally` block to guarantee reset on errors.

**Parallel polling**: Units are polled via `Promise.allSettled()` rather than a serial `for...of` loop. With 10 units at 5s each, parallel polling completes in ~5s instead of ~50s. The `pollingUnits` Set already prevents concurrent polls of the same unit from other entry points.

**Readings ingestion funnel**: `ReadingsService.createFromDeviceResponse()` is the **only** write path for the `readings` table — there is no direct POST endpoint for readings and no batch-side writes. Any quality filter or validation rule for incoming readings belongs in `ReadingsService.pollReadingsFromUnit()` (the caller), not in `createFromDeviceResponse` itself, which should remain a pure mapper/persister. Failed units increment `failed_calls` but are not auto-disabled. Uses error-safe wrappers (`applyBatchSettingsSafe`) to avoid crashing the cron job.

**Sensor range validation**: out-of-range DHT11 readings (outside `SENSOR_RANGE` in `pico-units.constant.ts`: temperature 0–50°C, humidity 10–90%) increment `failed_readings` on the PicoUnit instead of persisting a reading row. `failed_readings` resets to 0 on the next valid in-range reading (consecutive-failure model, independent from `failed_calls`). Temperature > 40°C logs a warning but does not block persistence (valid sensor data — safety threshold only). The range gate lives in `pollReadingsFromUnit()`, not in `DeviceResponseDto` (which is a structural validator, not a data-quality gate).

**Empty-readings tracking**: when both `temperature` and `humidity` are `null` (sensor returned no data), `consecutive_empty_readings` on the PicoUnit is incremented and no reading row is persisted. When at least one sensor value is non-null, `consecutive_empty_readings` resets to 0. This is distinct from `failed_readings` (out-of-range) and `failed_calls` (unreachable). The empty-readings gate runs after the zero-value skip and before the range check in `pollReadingsFromUnit()`.

`CronService` also runs an immediate startup sweep via `OnApplicationBootstrap` in addition to the `@Cron(EVERY_MINUTE)` tick; both delegate to the same private `runReadingsSweep()` method so behaviour stays uniform. The startup sweep is fire-and-forget (`void …catch()`) to avoid blocking the HTTP server bind.

The Pico's `system.wifi.mac` is also captured during polling and persisted to `PicoUnit.mac` (nullable text). **MAC is set only once** (first successful poll) and never overwritten — it is immutable hardware identity. The client uses it to derive the AP provisioning SSID.

`firmware_version` and `api_version` are also refreshed from every `GET /` response (top-level keys on `DeviceResponseDto`, optional — older firmware omits them), self-healing if an announce is ever missed. **Preserve-when-absent**: the poll only writes each field when the response actually carries a non-null **and predicate-accepted** value (`PicoUnitsService.touchAndResetFailedCalls()` — `isValidPicoFirmwareVersion` gates `firmware_version` to strict SemVer; `api_version` needs a non-null integer `>= PICO_API_VERSION_MIN`, values above MAX are stored per accept-and-flag); an absent/`null`/malformed key never clobbers the stored value — unlike MAC, these *are* overwritten on every poll when present, since firmware can be reflashed.

Cron-side state changes that are time-anchored (e.g. disabling the control loop after a batch finishes) should use a time-windowed query so the action is naturally self-limiting. For batch-finish auto-disable, `findUnitsWithFinishedBatch()` only considers batches that finished in the last 60s — they fall out of the window and are never re-disabled. The `BATCH_EVENTS.FINISHED` event handler handles the primary synchronous path.

**Readings cleanup**: `cleanReadings()` runs daily at midnight and deletes readings older than `READINGS_RETENTION_MONTHS` (default 6, configurable via env var). A row-count safety cap (`READINGS_SAFETY_MAX_ROWS`, default 1,000,000) triggers an immediate cleanup regardless of age if the readings table exceeds this threshold — a safety net for missed cron cycles.

**Middleware error propagation**: Entity-by-ID middlewares (`PicoUnitByIdMiddleware`, `BatchByIdMiddleware`, `RecipeByIdMiddleware`) catch service errors and only convert `NotFoundException` instances to 404 responses. All other errors (DB failures, timeouts) are re-thrown via `next(error)` so they reach the global exception filter and produce proper 500 responses. Never use bare `catch {}` that silently converts all errors to 404.

### State-visibility split: proxy vs. batch-orchestrated changes

Control-proxy endpoints (`setpoints`, `outputs`, `setup`, `control`) use `callPollAndUpdate` which POSTs to the Pico then immediately polls, so `latest_reading` reflects the new state right away. Batch-orchestrated changes (`applyBatchSettings`, `applyControlLoopDisable`, `applyUnitDisabled`) use `callSilent` — the Pico is updated but **no trailing poll** occurs. The server's `latest_reading` therefore lags the Pico's actual state by up to 60 s (the next cron tick). This is intentional: batch-driven changes are bulk operations where a per-unit poll would serialize and block the cron loop. The `POST /pico-units/:picoUnitId/poll` endpoint exists for the frontend to force an immediate poll when needed.

### PUT-on-server → POST-to-Pico verb mismatch

Every control proxy endpoint (`setpoints`, `outputs`, `setup`, `control`, `reboot`) uses `postWithFallback` (axios POST) to communicate with the Pico, regardless of the server's HTTP method. The server endpoint may be `PUT /v1/pico-units/:id/control/setup`, but the underlying call to the Pico is always `POST /setup`. Do **not** assume the server's HTTP method carries through to the Pico — `control.service.ts` calls `postWithFallback` unconditionally.

## Pass-Through & Response Shape

### Pass-through fields (non-persisted response fields)

Certain fields appear in API responses but are **not stored** in any database column. Two sanctioned approaches exist:

**(a) Entity-attached `@ApiProperty` for shared computed fields**: Used when the field is meaningful across multiple endpoints. `latest_reading` on `PicoUnit` is the prime example — it is added via `@Expose()` getter or service-level enrichment (not a real column, loaded via relation), and returned by `GET /v1/pico-units/:id`, `POST …/poll`, and dashboard summary endpoints. Declare it on the **entity itself** with `@ApiProperty({ nullable: true })` so it appears in every Swagger response that includes the entity.

**(b) Wrapper DTO via `IntersectionType` for endpoint-specific ephemeral fields**: Used when the field is only meaningful on one endpoint. `devices` (live pin mapping from the Pico) is the prime example — it is only returned by `POST /v1/pico-units/:id/poll`. Create a `DevicesMixin` class and merge it with `PicoUnit` via `IntersectionType(PicoUnit, DevicesMixin)` to produce `PollPicoUnitResponseDto`. This keeps the shared `PicoUnit` entity schema untouched while adding the endpoint-specific field.

### Every stored column returned by a controller must carry `@ApiProperty`/`@ApiPropertyOptional`

The Docker image build regenerates the client from the **committed** `spec/openapi.json` (`COPY mushpi-server/spec/openapi.json ./openapi.json` → `yarn gen:client && gen:schemas` → `tsc -b && vite build`). If an entity field has `@Column` + class-validator decorators but NO Swagger decorator, the committed spec omits it, the regenerated client type is incomplete, and the client `tsc` build FAILS with `Property 'X' does not exist on type '<Entity>'` — even though runtime responses serialize the field fine (`ClassSerializerInterceptor` runs without `excludeExtraneousValues`). Rule:

- **Any `@Column` field that a controller returns (directly or via `latest_reading`/relations) must be decorated** with `@ApiProperty` or `@ApiPropertyOptional`. Do not blanket-add — only expose fields the client actually consumes (cross-reference `mushpi-client`).
- **Match decorator requiredness/nullability to how the client accesses the field** (client is `strict: true`): client uses `field ?? fallback` (null-safe) → `@ApiPropertyOptional({ nullable: true })`; client renders directly or passes to a non-nullable param (e.g. `formatDate(iso: string)`) → required `@ApiProperty` with **no** `nullable: true`.
- **Relations that are conditionally loaded**: if some endpoint omits the relation (e.g. `GET /v1/pico-units/:id/batches` omits `pico_unit`), type it `@ApiPropertyOptional(...)` (optional, not `nullable: true` unless it can genuinely be null — a batch always *has* a `pico_unit_id`, it's just not always *expanded*). Use lazy refs `type: () => PicoUnit` to avoid circular `$ref`s.
- **Regression guard**: `test/openapi-schemas.e2e-spec.ts` boots the app, builds the doc in-process, and asserts every client-consumed field exists per schema. Add new fields to it when you add new entity fields.

### `devices` block — not persisted

The `devices` block (`active_high`, `pins.dht`, `pins.humidifier`, `pins.fan`, `pins.heater`) is read directly from the Pico's `GET /` response during polling. It is **validated** via `class-transformer`/`class-validator` but **never persisted** to any database table. It passes through from the Pico to the client via `PollPicoUnitResponseDto`. There is no `devices` column on `PicoUnit` and no migration adding one — the canonical source is the Pico itself, queried fresh on every poll.

### Validation pipe safety (`flattenValidationErrors`)

The global `ValidationPipe`'s `exceptionFactory` must **recursively flatten `ValidationError.children`** for nested DTOs annotated with `@ValidateNested()`. Parent-level errors from nested validation have `constraints: undefined` — accessing them directly causes a 500 internal server error instead of a proper 422. The `flattenValidationErrors()` function in `src/common/pipes/validation.pipe.ts` walks the `children` array and only reads `constraints` when defined. Any new `@ValidateNested()` usage must go through this pipe — do not use the default `ValidationPipe.exceptionFactory`.

### Unknown request-body keys are a hard 422 (`forbidNonWhitelisted`) — no silent-drop window

The global pipe runs with `forbidNonWhitelisted: true`: **any key on a `/v1` request body that is not declared on the DTO fails validation**, and the custom `exceptionFactory` returns an `UnprocessableEntityException` → **422**. This is the exact opposite of the polling path's tolerant `DeviceResponseDto` validation (`whitelist: true` + `forbidNonWhitelisted: false` in `validateDeviceResponse()`), which silently drops unknown keys. Consequence: removing or renaming a field on an announce/create/update DTO **immediately** breaks any client still sending the old key with a 422 — there is no compatibility or silent-drop window on request bodies (only on Pico responses). When renaming/removing a DTO field, the firmware/client must stop sending the old key **before or simultaneously with** the server change (the `software_version` → `firmware_version` + `api_version` cutover is the worked example — guarded by `test/pico-units.e2e-spec.ts`).

### Pin validation for setup proxy

`PUT /v1/pico-units/:id/control/setup` validates GPIO pins against `VALID_USER_GPIO_PINS` from `src/common/constants/hardware.constants.ts` — valid user I/O GPIOs are 0–22, 26–28 (GP23/24/25/29 are WiFi-reserved on Pico 2W). A `NoDuplicatePinsConstraint` class-level validator rejects configs where two devices share the same GPIO (returns 422).

## Timezone

All database timestamps are stored as UTC ISO-8601 strings (`2026-07-31T10:30:00.000Z`) — TypeORM's `.toISOString()` always produces UTC regardless of host timezone. This is relied upon by the `TimezoneInterceptor`.

### Settings Module

`GET /v1/settings` and `PATCH /v1/settings` manage the display timezone:

- **Storage**: `Settings` entity — single-row table (`id=1`), upsert-on-write
- **Default**: OS timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone` when no persisted row exists
- **Service**: `SettingsService` with in-memory cache (`getTimezone()` / `setTimezone()` / `resetCache()`) — hits DB only on first read post-boot and after writes
- **Module**: `@Global()` `SettingsModule` so the interceptor can inject `SettingsService`

### TimezoneInterceptor

A global `APP_INTERCEPTOR` that recursively walks all API responses and converts:

- `Date` instances → `dayjs.utc(value).tz(tz).format('YYYY-MM-DDTHH:mm:ssZ')`
- Strings matching ISO-8601 UTC (`...Z`) → same conversion
- Arrays/Objects → recursed
- Primitive/non-date strings → passthrough

**Fast path**: when `timezone === 'UTC'`, the interceptor is a zero-cost passthrough (`next.handle()` without any body walk). All existing e2e tests pass unchanged.

**Output format**: `2026-07-31T12:30:00+02:00` — explicit offset, unambiguous for clients.

**Note**: Dates are always serialized as UTC ISO-8601 (`...Z`) strings by the app. If a future feature emits naive datetime strings (no `Z`/offset), they will bypass conversion — always use `.toISOString()` for date serialization.

## Logging

### Error logging levels

- **Unreachable Pico units in cron sweeps**: log at `warn`, not `error`. An unreachable unit is an expected operational condition — not a server fault. Use `formatPollError()` from `http-fallback.ts` to produce a concise single-line message (e.g. `Pico unit 190 unreachable (EHOSTUNREACH: http://192.168.1.74:5000/?force=1)`).
- **Client-triggered poll failures**: the `fetchAndValidateReading` method catches no-response axios errors and rethrows them as `BadGatewayException` with the same `formatPollError` message. The exceptions filter logs at `error` because this represents a client-facing failure.
- **Never log raw error objects with `JSON.stringify(error)`**. The full axios error dump (config, retry state, stack) is unreadable in logs. Always use `formatPollError` or a similarly concise helper.
- `formatPollError` unwraps Nest `HttpException`s — when a call site receives a re-thrown exception (cron sweep `Promise.allSettled` reasons, `handlePicoUnitMonitoringStarted`) it returns the exception's message verbatim. Never re-format an already-wrapped exception at a call site; pass it straight to `formatPollError`.

### Preventing pino-http duplicate error logs

When the exceptions filter catches and logs an error, pino-http's `onResFinished` handler fires a second `[HTTP]` log on the response `finish` event. To suppress this duplicate:

- **In `exceptions.filter.ts`**: set `(response as any)._exceptionLogged = true` just before `httpAdapter.reply()`.
- **In `pino-logger.module.ts`**: add `if ((res as any)._exceptionLogged) return 'silent';` as the **first check** in `customLogLevel`.

This ensures one canonical log entry per exception. Non-exception responses (404s, 4xx without throws) are unaffected — they still get their single pino-http log.

## Guards

- `IsPicoUnitMonitoredGuard` (410 Gone for unmonitored units) — used via `@OnlyMonitoredPicoUnits()` decorator
- `IsControlLoopEnabledGuard` (409 Conflict when control loop active, prevents manual output changes) — used via `@OnlyMonitoredPicoUnitsWithControlLoop()`
- `PicoAnnounceSecretGuard` (401 Unauthorized, validates `X-Pico-Secret` header against `PICO_ANNOUNCE_SECRET`) — used via `@PicoAnnounceSecret()` composite decorator
- `TooManyRequestsGuard` — `@nestjs/throttler` rate limiting
- `AppSecretBearerMiddleware` — optional Bearer token auth from `APP_SECRET`
- `ProtectEventLoopMiddleware` — toobusy-js overload rejection

Every guard must be bundled with its Swagger error responses into a composite decorator under `src/common/decorators/docs/`, regardless of how many methods use it. The extraction criterion is "guard + Swagger bundle" — not reuse count. This keeps controllers pure (endpoint definitions and Swagger docs only, no guard wiring scattered inline). For reference: `@OnlyEnabledPicoUnitsWithControlLoop()` is single-use yet still extracted.

## Migrations

Schema changes for production (`NODE_ENV=prod`, where `synchronize: false`) require a migration file. Dev/local/test auto-sync via `synchronize: true`.

- **Directory**: `src/modules/sqlite/migrations/`
- **Naming**: `<timestamp>-<DescriptiveName>.ts` (use `Date.now()` as timestamp)
- **Barrel registration**: All migrations must be exported from `src/modules/sqlite/migrations/index.ts` as a static array `MIGRATIONS`. This barrel is consumed by BOTH `data-source.ts` (CLI) and `sqlite.module.ts` (runtime). Static import — no filesystem glob — so it is resolvable at boot in the Docker image (which runs the compiled `dist/` with prod-only `node_modules`, no CLI).
- **Baseline migration convention**: The first migration (`InitSchema<timestamp>`) uses `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` throughout so it is safe to run against databases created historically via `synchronize: true`. Its `down()` is a no-op (reversing baseline = dropping all tables = data loss; not supported).
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
- **Prod-only `migrationsRun: true`**: In production (`NODE_ENV=prod`), pending migrations are applied automatically on app boot via `migrationsRun: true` in `sqlite.module.ts`. Dev/local/test keep `synchronize: true` and do not run migrations. This is a deliberate convention: the Docker prod image runs the compiled `dist/` with prod-only `node_modules` and no CLI access, so migrations must run at boot. Host-side CLI commands (`yarn migration:run`, `yarn migration:generate`, `yarn migration:show`, `yarn migration:revert`) target `SQLITE_PATH=./data/app.sqlite` for development workflows.
- **Data-only migrations** (no schema change, e.g. one-shot `DELETE`/`UPDATE`) are valid. When the operation is irreversible, `down()` should be a no-op with a comment explaining why.
- **Generating migrations**: Use `yarn migration:generate src/modules/sqlite/migrations/<DescriptiveName>`. For a baseline migration, target an empty temp DB (`SQLITE_PATH=/tmp/opencode/empty.sqlite yarn migration:generate ...`). For incremental migrations, target the dev DB. The CLI does not load `.env` files — pass env vars explicitly.

## Environment Variables

| Variable               | Default             | Description                                                                   |
| ---------------------- | ------------------- | ----------------------------------------------------------------------------- |
| `PORT`                 | `3000`              | Listen port                                                                   |
| `NODE_ENV`             | `local`             | `dev/local/prod/staging/test`                                                 |
| `SQLITE_PATH`          | `./data/app.sqlite` | DB path                                                                       |
| `CLIENT_URL`           | —                   | CORS allowed origin (required in `local`, optional elsewhere)                 |
| `CLIENT_DIST_DIR`      | —                   | Absolute path to the built `mushpi-client` SPA (`dist/`). Required in `prod`; unset = SPA serving disabled (dev uses Vite :5173). Docker sets e.g. `/usr/src/app/client`. |
| `APP_SECRET`           | —                   | Optional Bearer token for human auth (optional in all envs; LAN/Tailscale is the security boundary) |
| `PICO_ANNOUNCE_SECRET` | `mushpi-dev-secret` | Shared secret for `POST /v1/pico-units/announce` (required in prod, min 6 chars) |
| `DOCS_ENDPOINT`        | —                   | Swagger UI path                                                               |
| `LOGS_LEVEL`           | `info`              | Pino level                                                                    |
| `READINGS_RETENTION_MONTHS` | `6`              | Months of readings to retain before cleanup                                    |
| `READINGS_SAFETY_MAX_ROWS`  | `1000000`         | Row-count safety cap — triggers cleanup regardless of age                     |

## Config

`CustomConfigService` exposes typed getters grouped by **domain area** — not by "what kind of value" (string, secret, etc.). The `security` getter is reserved for **cross-cutting/infra** concerns (global auth, rate limiting, event-loop protection). Domain-specific secrets belong in their own domain getter (e.g., `pico.announceSecret` for Pico-hardware trust, not `security.picoAnnounceSecret`). The `client` getter holds client-domain config — `clientUrl` (the CORS allowed origin, used in local dev) and `distDir` (the served SPA path) — so CORS lives beside the other client concerns rather than in `security`. This keeps domain concerns colocated and prevents the `security` getter from becoming a grab-bag.

## Raw SQL

When using `repository.query()` for raw SQL (e.g., window functions like `NTILE`), the `ts` column (TypeORM `datetime` type) is stored as `YYYY-MM-DD HH:MM:SS.SSS` — no `T` and no `Z`. ISO strings from `Date.toISOString()` compare incorrectly via lexicographic ordering against this format. Always convert:

- **Input**: `Date.toISOString()` → `YYYY-MM-DD HH:MM:SS.SSS` before passing to WHERE clauses.
- **Output**: query result timestamps → ISO string (`replace(' ', 'T') + 'Z'`) before returning to callers.

The `toSqliteDatetime()` helper (`src/common/utils/to-sqlite-datetime.ts`) handles input conversion. Raw query results come back with SQLite-native format — convert in the service before returning DTOs.

**Aggregation response shape** (`GET …/readings`, unit and batch): `AggregatedReadingsResponseDto` { `data`: `AggregatedReadingDto[]` — per-bucket avg/min/max of temperature/humidity, relay on-counts, and the setpoints active in the bucket — `points`: requested bucket count, `actualReadings`: raw row count in the window }. There is **no** `AggregatedReading` class — the bucket DTO is `AggregatedReadingDto` (`readings.dto.ts`).

## Local Verification (smoke-boot without disturbing a live instance)

`yarn start` (from AGENTS.md's verification list) binds port 3000. If a live instance is already running there, it fails with `EADDRINUSE`. To smoke-boot without touching that server, launch with a free `APP_PORT` and throwaway paths under `/tmp`:

```bash
APP_PORT=3130 SQLITE_PATH=/tmp/opencode/smoke.sqlite LOGS_PATH=/tmp/opencode/logs node dist/src/main.js &
SMOKE_PID=$!
# ...verify /ping, then ALWAYS stop it:
kill "$SMOKE_PID"
```

**Hard rule — stop any instance you start.** Capture the PID at launch and `kill` it explicitly when the checks finish, so you never leave an orphan server listening on a random port that later blocks verification or confuses the next session. Never use a broad `pkill -f "dist/src/main"` — it can match a live server you did not start.

## E2E Gotchas

- `maxWorkers: 1` in `jest-e2e.json` — parallel workers cause SQLite lock contention. `forceExit` is **not** needed: `@nestjs/schedule` v6 clears cron jobs on `app.close()` and `@nestjs/typeorm` destroys the DataSource. If the suite ever hangs at exit, run `npx jest --config ./test/jest-e2e.json --detectOpenHandles` to diagnose.
- **CronService is stubbed by default** in e2e via `createModuleFixture()` → `NoopCronService`. Scheduled sweeps and batch/pico-unit event handlers never issue real HTTP. Specs testing cron behaviour opt in via `createModuleFixture({ withCron: true })` + `createTestApp(moduleFixture)` and must keep `jest.mock('axios')`.
- `process.env` mutations are contained per-file (Jest 30 node environment copies `process` per test file), but always restore env in `afterAll`/`afterEach` and use `delete process.env.X` (assigning `undefined` stores the string `"undefined"`).
- Only `console.error`-level output surfaces in e2e runs (custom reporters drop `console.log`) — silence expected error-path logging with `jest.spyOn(logger, 'error')`.
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
- **`ServeStaticModule` is inert under `Test.createTestingModule()`** — its `AbstractLoader` provider resolves to `NoopLoader` at compile time (no HTTP adapter exists until `createNestApplication()`), so `onModuleInit()` no-ops and static routes never register. To test static/SPA serving, opt in via `createModuleFixture({ withServeStatic: true })`, which does `overrideProvider(AbstractLoader).useClass(ExpressLoader)` (both from `@nestjs/serve-static`). Set any env the `useFactory` reads (e.g. `CLIENT_DIST_DIR`) **before** building the fixture.
- **Never call `app.listen()` in `createTestApp()` or any spec.** Binding a real socket keeps the Jest worker alive at exit (some specs, e.g. monitoring, never `closeTestApp`) and hangs the suite — the `forceExit`-free exit relies on no listening sockets. Every spec that creates an app must `closeTestApp(app)` in `afterAll`.

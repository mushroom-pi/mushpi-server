# mushpi-server — Reference (On-Demand)

Long-tail gotchas and detailed conventions. **Load only when the task touches these areas** — do not read on every spawn. The always-loaded [`AGENTS.md`](./AGENTS.md) holds the module map, entity/column table, scripts & hooks table, env/config table, top conventions, and the REST API table.

## Index

- [Pico Proxy Internals](#pico-proxy-internals) — cross-repo contract pointers (root `AGENTS.md` ownership, spec endpoint, CORS origin), axios retry centralization, Pico response validation, `api_compatibility` resolution table, accept-and-flag, strict-announce vs lenient-poll ingestion
- [Computed Status Fields](#computed-status-fields) — derivation rules for `Batch.status`, `PicoUnit.status`, `PicoUnit.api_compatibility` (moved from core), camelCase-getter naming exceptions
- [E2E Test Conventions](#e2e-test-conventions) — project-specific e2e rules: time windows, state reset
- [Batch Lifecycle & Relation Loading](#batch-lifecycle--relation-loading) — create/update constraints, recipe template snapshot, immutable FKs, selective relation loading
- [Image Uploads & Static Serving](#image-uploads--static-serving) — recipe/batch image uploads, ServeStaticModule, SPA serving, static CORS, helmet CSP, `APP_HTTPS_ENABLED` HSTS/CSP gating
- [API Versioning Internals](#api-versioning-internals) — version application sites, version-neutral exception + `V1` suffix naming, `operationIdFactory`, middleware×versioning workarounds, named wildcards, `main.ts` coverage gap
- [Spec Tooling Internals](#spec-tooling-internals) — generated artifacts table, Husky git hooks, runtime-vs-export title, generation from compiled output (swagger CLI plugin `_OPENAPI_METADATA_FACTORY`), served-vs-committed reconciliation checks, ts-node script conventions, generator-version churn of committed `spec/`
- [Release Versioning](#release-versioning) — package-version bump policy, post-bump spec regeneration, `mushpi-hub/release.json`/tags prohibition (moved from core)
- [Cron Polling](#cron-polling) — sweep overlap/parallelism, readings ingestion funnel & quality gates, MAC/version/ip refresh, time-windowed state changes, proxy-vs-batch poll visibility split
- [Seed join contract](#seed-join-contract) — demo seeding ⇄ live-poll seam: prod refusal, frozen `seedEndTs`, per-unit watermark guard (never a row-count guard), seeded⇔live boundary, continuity tail-blend, direct-repo batch writes, class-token × `jest.resetModules` e2e gotcha
- [Pass-Through & Response Shape](#pass-through--response-shape) — non-persisted response fields, `@ApiProperty` coverage rule, validation-pipe safety, `forbidNonWhitelisted`, GPIO pin validation
- [Timezone](#timezone) — UTC storage, Settings module, TimezoneInterceptor
- [Logging](#logging) — error-vs-warn policy, `formatPollError`, pino-http duplicate suppression
- [Guards](#guards) — guard inventory, the composite-decorator bundling requirement, the two deployment profiles of rate limiting (self-hosted opt-in vs public-demo always-on — flat keys, ttl re-sort, `skipIf` semantics lock, proxy trust, name-keyed skips), and the rate-limit response headers (names, units, `/health` exemption)
- [Demo host-details redaction](#demo-host-details-redaction) — `/health` host-identity omission on demo boots (omitted-key list), the `isDemo`-first early return, the error-body `emitter` fallback, the `errorsDetail` true-unless-`'false'` correction
- [Migrations](#migrations) — directory, naming, barrel registration, baseline convention, prod `migrationsRun`
- [Clean start](#clean-start) — demo-profile volume reset: call-site `isDemo` gate, `manualInitialization` connect window, `.demo-owned` adopt/wipe/refuse matrix, fail-closed one-time remediation, logs untouched, post-wipe re-seed
- [Environment Variables](#environment-variables) — key env var table (full generated reference: `docs/ENVIRONMENT.md`)
- [Config](#config) — `CustomConfigService` getter grouping philosophy
- [Dependency Remediation Notes](#dependency-remediation-notes) — node-gyp/native builds, the multer `resolutions` pin + removal condition, the `proxy-addr` lockfile-only refresh (GHSA-jqcg-44mw-7w3h), the knip nested-repo gitignore hazard (`--no-gitignore` mitigation)
- [Scripts — Operational Notes](#scripts--operational-notes) — per-script commentary trimmed from the core Scripts table: lint autofixing vs CI gate, format scope, test:debug inspector, audit informational-vs-gating semantics, knip:ci flag rationale
- [Tooling & Style Deviations](#tooling--style-deviations) — tsconfig strictness disabled; `settings.v1.controller.ts` branching (skill deviations)
- [Raw SQL](#raw-sql) — SQLite datetime conversion for raw SQL + QueryBuilder string predicates; aggregation response shape (`AggregatedReadingsResponseDto`)
- [Build Output & Entrypoint](#build-output--entrypoint) — `dist/src/main.js` path and why (tsc `rootDir` push), `start:prod` + Docker `CMD`
- [Local Verification](#local-verification-smoke-boot-without-disturbing-a-live-instance) — smoke-booting on throwaway paths without touching a live instance
- [E2E Gotchas](#e2e-gotchas) — jest worker/mocking/fixture quirks

---

## Pico Proxy Internals

- **Cross-repo contract pointers**: the Pico announce/poll/proxy contracts and the client-codegen contract are **owned by the project-root [`AGENTS.md`](../AGENTS.md)** — check there before changing any cross-tier shape (the server's global `forbidNonWhitelisted: true` pipe makes announce-payload field changes a hard 422 cutover across grow/mock/server). The client consumes the OpenAPI spec at `/<DOCS_ENDPOINT>-json`; the CORS allowed origin is `CLIENT_URL` (`config.client.clientUrl`). This section holds the server-side internals of that contract.
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
- **Poll leniency vs strict announce (asymmetric ingestion)**: the announce path is **strict** — `AnnouncePicoUnitDto.firmware_version` carries `@Matches(PICO_FIRMWARE_VERSION_REGEX)` (strict SemVer `MAJOR.MINOR.PATCH`; `-rc`/`+build` suffixes rejected — normative rules: `mushpi-hub/MAINTAINING.md` §Version & Release Semantics), so a malformed announce version 422s. The poll path is **lenient** — `DeviceResponseDto.firmware_version`/`api_version` intentionally carry **no** `@IsString`/`@IsInt` validators, so malformed version metadata in a `GET /` response can never fail `validateDeviceResponse`, can never throw, can never increment `failed_calls`, and can never block reading persistence. Acceptance is decided by the predicates in `PicoUnitsService.touchAndResetFailedCalls()` (`isValidPicoFirmwareVersion` for the string, the existing `Number.isInteger && >= PICO_API_VERSION_MIN` check for the generation); rejected/garbage values are silently ignored and the **last accepted stored values are preserved** (`undefined`/`null` never clobber). Both version fields stay `@IsOptional` on the announce DTO so legacy firmware that omits them still announces. There is no `semver` dependency — `PICO_FIRMWARE_VERSION_REGEX` is the canonical check.
- **Poll-path writers must never `save()` a PicoUnit snapshot.** Every non-announce writer — `touch()`, `addFailedCall()`, `addFailedReading()`, `addEmptyReading()`, `resetFailedReadings()`, `resetEmptyReadings()` and `touchAndResetFailedCalls()` — persists **column-level partial updates** (`repo.increment()` / `repo.update()` with only its own columns). The 60 s poll loads its units at cycle start and can finish ~10 s later; a full-entity `save()` on that snapshot writes `ip`/`mac`/`port`/`firmware_version` back to their pre-announce values and erases the unit's network identity. Once `ip` is NULL there is no IP fallback (the poll target degrades to `<handle>.local`), and the self-heal in `touchAndResetFailedCalls()` only runs on a **successful** poll — so a clobbered unit is dark permanently. The success path refreshes `ip` overwrite-when-present and writes `mac` **set-once through an atomic `mac IS NULL` guard**, judged against the live row. `announce()` stays the authoritative identity writer; `create()`/`update()` are the only other full-entity saves and are not on the poll path. Pinned by `pico-units.service.spec.ts`, whose fake repository reproduces TypeORM write semantics (a regression to `save(entity)` fails 12 of its 13 tests).

## Computed Status Fields

All three status fields are computed `@Expose()` getters — never `@Column`s, never migrated, never cron-maintained. Core (`AGENTS.md`) keeps a one-line pointer here. **Contract exceptions to the camelCase-getter naming rule** (wire-contract names that must not be renamed): `api_compatibility`, `images_left`, and `PicoUnit`'s `host`/`status`/`latest_reading` — all other computed `@Expose()` getters use camelCase.

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

- `images` column (`simple-json`, nullable, entity default `NULL`) stores an array of filenames (e.g. `['1.jpg', '2.png']`); an **empty set is stored as `null`, not `[]`** — removing the last image resets the column to `null` (`batches.service.ts`). Service-level response enrichment substitutes `[]` for URL computation only; the stored value stays `null`.
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

**Registration order is safe**: Express registers controller routes (`/v1/*`, `/ping`, `/health`) and Swagger docs **before** `ServeStaticModule`'s `onModuleInit` static middleware + catch-all, and before Nest's not-found handler. So the SPA catch-all can only fire for requests matching no controller route — it cannot shadow the API, monitoring, docs, or `/images` (whose `fallthrough: false` responds 404 ahead of it). Note also: every `serveRoot` entry additionally registers a renderFn GET route at `serveRoot + '{*any}'` that resolves `index.html` — if that route ever handled a request for an asset-only root, it would throw on the missing `index.html`; `fallthrough: false` makes the static middleware answer the request (200 or terminal 404) first, so the renderFn stays dead code for `/images` and `/public`. **`/metrics` was removed** (no controller route): with the SPA entry active the catch-all now serves `index.html` for `GET /metrics` (200 text/html), and in the API-only e2e fixture (no SPA) it falls to Nest's not-found handler (404).

**helmet CSP governs the SPA**: once the server serves the client HTML, helmet's `contentSecurityPolicy` applies to it (in dev the UI came from Vite :5173, outside helmet's reach). `img-src` is relaxed to `["'self'", 'data:', 'blob:', 'https:']` in `src/common/middleware/helmet.middleware.ts` (shared factory, applied by `main.ts` and `test/test-setup.ts`) for hotlinked recipe images and blob/object-URL previews. Any future client feature that loads cross-origin resources must be CSP-audited against helmet defaults.

**HTTPS-only headers are gated by `APP_HTTPS_ENABLED`** (default `false` = plain-HTTP deployment). The factory sets `'upgrade-insecure-requests': httpsEnabled ? [] : null` and `hsts: httpsEnabled`. The `null` is load-bearing: helmet re-applies any default directive that is merely *omitted* from the directives object, so leaving the key out would bring `upgrade-insecure-requests` back and break the SPA on LAN addresses (browsers rewrite `/assets/*` to `https://` with no fallback; `localhost` is exempt as a potentially trustworthy origin, so local dev masks the bug — classic `SSL_ERROR_RX_RECORD_TOO_LONG` white page). With the flag on, HSTS ships helmet's stock default (`max-age=31536000; includeSubDomains`) and the directive stays for mixed-content protection. The flag only *declares* that TLS is terminated upstream/directly; it configures no TLS itself. Express `trust proxy` is deliberately **not** enabled.

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

The sole version-neutral exception is `MonitoringController`, declared with `@Controller({ version: VERSION_NEUTRAL })` (infra endpoints `/ping`, `/health` stay unprefixed). Every other controller carries a `V1` class/filename suffix — `batches.v1.controller.ts` → `BatchesV1Controller` — which the `operationIdFactory` strips (next subsection).

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

**Coverage gap — smoke-test `main.ts` boot wiring manually.** The bootstrap-only wiring in `main.ts` (docs basicAuth mount, unauthenticated-prod-docs warning, Swagger `setupSwagger()` call) is exercised by **no** unit or e2e suite — `test/test-setup.ts` builds its own app and does not replicate it. Note also that the docs credentials are **optional in every environment** (`DOCS_USERNAME`/`DOCS_PASSWORD` are never required and may be set anywhere), so the basicAuth branch is reachable in any environment once a non-empty pair is supplied alongside `DOCS_ENDPOINT` — and `NODE_ENV=prod` with docs enabled but no pair takes the other new bootstrap path: the unauthenticated-docs warning. Neither path runs in default dev/e2e boots — which is exactly why the bare-`*` crash and the false `"DOCS_USERNAME" is required` prod boot failure both went unnoticed. Therefore: any boot-affecting `main.ts` change must be smoke-tested by actually starting the app with the docs vars set (`DOCS_ENDPOINT`, `DOCS_USERNAME`, `DOCS_PASSWORD`, with `NODE_ENV=prod` to also exercise the warning branch), and verified by curling the docs endpoint for 401 → 200-with-creds and confirming the expected warning (or its absence) in the logs. Point `SQLITE_PATH` (and `LOGS_PATH`) at throwaway paths under `/tmp` during such a smoke test so no real dev/prod database is touched.

## Spec Tooling Internals

The server code (NestJS decorators) is the **source of truth** for the REST API. The OpenAPI spec and Bruno collection are derived artifacts generated via scripts (`yarn spec:export`, `yarn spec:bruno`, `yarn spec:all`).

### Generated files

| Path | Committed? | Purpose |
|------|-----------|---------|
| `spec/openapi.json` | Yes | Canonical API contract — consumed by mushpi-client's `yarn gen:all:remote` |
| `spec/openapi.yaml` | Yes | Human-readable YAML version of the same contract |
| `spec/bruno/` | No (gitignored) | Bruno collection — directory of `.bru` files + `bruno.json`, fully regenerable |

### Decorator pitfalls that make the committed spec invalid

The generated document must be **valid OpenAPI 3.0**, and the published documentation site renders its API reference straight from `spec/openapi.json` — so a malformed decorator is a broken public page, not just an internal wart. Three classes have already shipped and been fixed:

- **Swagger 2.0 / OAS 3.1 keys in OAS 3.0 positions.** A response-level `schema` alongside `type` (`@ApiOkResponse({ schema: {...}, type: String })`) emits a 2.0-style key beside the OAS3 `content` block, which validators reject. The same trap catches `in`/`name` on an `http` bearer security scheme (implicit for bearer — drop them), and the plural `examples:` array on `@ApiProperty`, which is an **3.1** keyword in a 3.0 document — use singular `example:`.
- **A parameter-carrying composite used on a route that does not have the parameter.** `@ApiBatch()` on `GET /v1/pico-units/{picoUnitId}/batches/current` injected a phantom `batchId` path parameter into the spec. That is invalid OAS3 *and* it silently changed the generated client's method signature, committing a required argument no caller could supply. Only decorate a route whose template actually contains the parameter.
- **A missing space after a TypeScript `readonly` modifier is absorbed into the property name.** `readonlyheapTotal` is a valid camelCase identifier, so it compiles and lints clean — the failure is silent: runtime is correct (the wire shape comes from `process.memoryUsage()`), but the served and committed OpenAPI contract advertises a phantom field and hides the real one. The guard is exact-key-set schema assertions — the `MemoryUsageDto` block in `test/openapi-schemas.e2e-spec.ts`; when reviewing a new schema diff, grep DTOs for `readonly[a-z]`.

**Gate spec changes with `npx swagger-cli validate spec/openapi.json`.** Validators give different verdicts: redocly's default rule set mixes in opinionated style rules (an operation declaring no `security`, an empty `servers`, example-versus-schema drift) that are not validity errors and are deliberately not all satisfied here. `swagger-cli` answers the question that matters — is the document valid OpenAPI 3.

### Git hooks (Husky)

- **`pre-commit`**: runs `yarn format` + `yarn lint`, then regenerates + stages `docs/ENVIRONMENT.md` when `src/modules/config/config.schema.ts` is part of the staged changes, then detects `src/` changes and automatically runs `yarn spec:all`, staging `spec/openapi.json` and `spec/openapi.yaml` (no `src/` changes → skipped). `yarn build` runs **last**, after the generator blocks, so it validates exactly the content being committed. This keeps the committed spec and generated docs in lockstep with the code.
  - ⚠️ **Spec regeneration boots the app — and it must never touch live state.** Regenerating the spec instantiates the whole `AppModule`; before the `applyThrowawayRuntimePaths()` guard existed, that opened the **configured database** (`.env`/shell `SQLITE_PATH`, dev `synchronize: true`) and `CronService`'s `OnApplicationBootstrap` sweep could **contact real Pico units** on every source-changing commit. The generator now forces throwaway `SQLITE_PATH`/`LOGS_PATH` under the OS temp dir itself, so `yarn spec:all` and this hook never touch `data/` — but any *other* booting command (smoke boots, `yarn start`, ad-hoc scripts) must still set both vars to throwaway paths itself ([Local Verification](#local-verification-smoke-boot-without-disturbing-a-live-instance)).
- **`commit-msg`**: runs commitlint (Conventional Commits). `body-max-line-length: 100` is enforced — precomposed multi-line commit bodies routinely violate it. A rejection aborts **before** the commit object is written, leaving staging intact: re-wrap the message and retry with a fresh commit rather than amending. **Footer-parse gotcha:** any commit-*body* line that begins with `Token: value` is parsed as a git trailer/footer, not body text — e.g. an HTTP header literal written as `X-RateLimit-Limit: undefined` at line start trips the `footer-leading-blank` rule and the commit fails. Wrap such literals in backticks (a leading backtick is not a valid footer token, so the line stays body text).
- **`pre-merge-commit`**: runs `yarn test` + `yarn test:e2e` before a merge commit is created.
- **`pre-push`**: runs `yarn audit:ci` → `yarn build` → `yarn knip:ci` → `yarn test` → `yarn test:e2e`, in order (both audit scripts exclude deprecations via `--no-deprecations`).
- **Failure semantics — the wrapper runs user hooks with `sh -e`**: the generated wrapper `.husky/_/h` invokes the user hook as `sh -e "$s" "$@"` (installed husky 9.1.7; confirmed in `node_modules/husky/husky` and by a sandboxed end-to-end run of the wrapper). A multi-line hook therefore **aborts at the first failing command** — that is what gates this repo's newline-separated hooks (e.g. pre-commit's final `yarn build` only runs if format/lint/generators all passed). The claim that "husky does not run hooks with `set -e`, so multi-command hooks must be `&&`-chained or they won't abort" is **false on this version** — never "fix" a hook on that premise. `&&`-chaining (the style mushpi-client's `pre-push` uses) remains a valid alternative: explicit short-circuiting that is version-independent and survives a future husky change — but it is a portability preference, not an absence-of-`-e` necessity.
- **Yarn 4 does not run the root `prepare` script on a plain `yarn install`** once dependencies are cached, so an absent/broken `.husky/_` is *not* repaired by `yarn install` alone. Reinstall the hooks with `yarn prepare` (or `rm -rf .husky/_ && yarn prepare`), then confirm `git config core.hooksPath` is `.husky/_`.

### `setupSwagger()` at runtime vs spec export

`SwaggerModule.setupSwagger()` calls `buildOpenApiDocument()` with `appendEnvSuffix: true` to produce the title `"mushpi-server LOCAL"` (or DEV/PROD). The `spec:export` script calls it with `appendEnvSuffix: false` to produce a deterministic title (`"mushpi-server"`) suitable for committed output. `info.title` is the **only** sanctioned served-vs-committed difference (see §generation from compiled output).

### Demo read-only 403 injection (selective, rule-driven)

`SwaggerModule.buildOpenApiDocument()` runs `addReadOnlyResponses(document)` after the `globalErrors` pass: every operation whose method key is not safe (`get`/`head`/`options`) **or** that carries the `x-demo-readonly: refused` extension gets a `403` response, except operations carrying `x-demo-readonly: exempt`. Unlike the 429 global error — injected when the *generating* deployment's profile arms rate limiting (opt-in pair configured on the self-hosted profile, always on for the public-demo profile; see the **Served-spec 429 truthfulness** paragraph below) — this injection is **unconditional**: the committed spec is generated on pre-commit in a dev/local boot and must document demo-mode behaviour regardless of the generating environment; runtime refusal stays per-deployment (`DemoReadOnlyGuard` is inert outside `NODE_ENV=demo`, see §Guards). The extensions the adder reads are written by the same mark decorators the guard reads — a refused operation can never exist without documented 403s. Pure addition: existing `403` entries are never mutated. Invariant pinned by the `test/openapi-committed-spec.e2e-spec.ts` demo read-only block.

**Served-spec 429 truthfulness (profile arm)**: `documentsTooManyRequests()` gates the `429` global-error injection and tracks the boot's **profile** — the self-hosted profile documents it only when the opt-in `MAX_REQUESTS`/`MAX_REQUESTS_TIME` pair is configured; the public-demo profile documents it unconditionally, because its limiters are always on and its served docs must advertise the 429 its runtime can always produce. Neither arm fires on the local boot that generates the **committed** spec, so that file stays byte-for-byte unchanged — the same served-vs-committed reasoning as the unconditional demo 403 injection above. No client regeneration is triggered by a demo boot's served document.

### Generation from compiled output (swagger CLI plugin)

`spec:export` = `yarn build && node dist/spec/generators/openapi.generator.js` — the committed spec is generated from the **compiled app**, never from ts-node-transpiled source. Mechanism: `nest-cli.json` registers the `@nestjs/swagger` CLI plugin (`dtoFileNameSuffix: ['.dto.ts', '.entity.ts']` + `classValidatorShim: true`), which injects a static `_OPENAPI_METADATA_FACTORY()` into every compiled entity/DTO class in `dist/`; at document-build time `ModelPropertiesAccessor.applyMetadataFactory()` merges that metadata **under** the explicit decorators (decorator-set keys win their own keys, factory-only keys leak through: inferred types, `required` from TS optionality, class-validator constraints). The historical defect: the old ts-node path ran no plugin transform, so the committed spec carried only explicitly-decorated properties while the served contract (compiled `main.js`) carried the plugin's merged shape. Generating from `dist` reconciles served === committed modulo `info.title`.

Consequences:

- An undecorated class property no longer drops out of the committed spec — it arrives plugin-**inferred** (`number` where `@IsInt()` meant integer, requiredness from `?`/`!`/initializer, no description/example). Hence the `@ApiProperty` rule guards **shape intent** (§Pass-Through & Response Shape).
- `spec/generators/openapi.generator.ts` itself is unchanged: tsc rewrites its `src/*` alias imports to relative requires (`../../src/...`), output paths stay `resolve(process.cwd(), 'spec')`, so run it with cwd = repo root.
- The generator boots `AppModule`: opens SQLite with dev `synchronize: true` and fires `CronService`'s `OnApplicationBootstrap` sweep (real HTTP to monitored units). The generator now enforces the guard itself: `applyThrowawayRuntimePaths()` (`src/common/utils/throwaway-runtime-paths.ts`) **unconditionally** displaces `SQLITE_PATH`/`LOGS_PATH` to throwaway paths under `os.tmpdir()/mushpi-server-spec-gen` (mkdirs the base dir first — better-sqlite3 will not create a missing parent dir). A throwaway DB has zero units, hence no Pico traffic; nothing there is ever cleaned up because nothing there is ever real. **Mechanism is import-order-dependent**: @nestjs/config (installed 4.0.4) runs the Joi validation in the synchronous prefix of `ConfigModule.forRoot()` — at the first *import* of `src/modules/config/config.module.ts`, not at `NestFactory.create()` — and the validated snapshot outranks later `process.env` writes (same freeze as §E2E Gotchas). So the helper self-applies on module import, and `openapi.generator.ts` must keep importing it **before** `src/modules/app.module` (the prettier sort guarantees `src/common/**` < `src/modules/**`; the in-IIFE re-call is belt-and-braces). The manual `SQLITE_PATH=… LOGS_PATH=…` form remains the rule for **non-generator boots** ([Local Verification](#local-verification-smoke-boot-without-disturbing-a-live-instance)); pinned by `src/common/utils/throwaway-runtime-paths.spec.ts`.

### Reconciliation checks (run after any spec-tooling or dependency-refresh change)

```bash
# (a) committed spec is exactly what a fresh build emits (idempotence / no staleness):
#     no SQLITE_PATH/LOGS_PATH prefix needed — the generator forces throwaway paths itself.
yarn spec:all
git diff --exit-code -- spec/openapi.json spec/openapi.yaml   # must be exit 0

# (b) served contract === committed spec, modulo info.title: smoke-boot on a free APP_PORT +
#     throwaway SQLITE_PATH/LOGS_PATH, GET /<DOCS_ENDPOINT>-json (local default: /contract-json),
#     deep-compare both documents with info.title stripped, then ALWAYS kill the instance.
```

### SwaggerModule dual wiring

`SwaggerModule` is registered as a **provider in `AppModule`** but invoked **manually in `main.ts`** (not via DI in a controller). This exists because `setupSwagger()` needs the `INestApplication` instance before the server starts. The `spec:export` script (source `spec/generators/openapi.generator.ts`, executed from `dist/` post-build) gets it via `app.get(SwaggerModule)` after booting a `NestFactory.create(AppModule, { logger: false })` instance (no HTTP listener — `app.listen()` is never called).

### Script conventions (ts-node)

Scripts that import TypeScript source using `src/*` path aliases require `tsconfig-paths/register` when run under ts-node. Since the switch to compiled-output generation, `spec:export` no longer runs under ts-node; the surviving ts-node consumers don't need the hook either — `spec:bruno` reads `spec/openapi.json` from cwd (imports only `dotenv`/`fs`/`path`; its register hook is now vestigial) and `docs:env` imports its Joi schema via a relative path. The `typeorm` CLI script runs compiled `dist/` paths like `spec:export` does.

### Committed `spec/` is sensitive to generator versions

`spec/openapi.json` and `spec/openapi.yaml` are outputs of `@nestjs/swagger` + `js-yaml`, so a lockfile refresh can dirty them with pure **emitter churn** even when nothing in `src/` changed (observed: swagger 11.4 adds a redundant sibling `type: object` next to `allOf`-composed properties; js-yaml 5 changed quoting of `'...'` in example arrays). Practical consequence: run `yarn spec:all` and commit the result **alongside any dependency-refresh commit**, even one that doesn't touch `src/` — the pre-commit hook only regenerates on `src/` changes, so otherwise the churn surfaces later in an unrelated commit.

## Release Versioning

Policy detail (core keeps a one-line pointer here):

- Commit messages follow **Conventional Commits**, enforced by commitlint (`commitlint.config.mjs`, `@commitlint/config-conventional`) via the Husky `commit-msg` hook (see [Spec Tooling Internals → Git hooks](#git-hooks-husky)).
- The `package.json` `version` is bumped **only when releasing, on the `main` branch** — never during day-to-day `dev` work.
- After any version bump, run `yarn spec:all` so the committed OpenAPI spec carries the same `info.version` as `package.json`.
- Never edit `mushpi-hub/release.json` or git tags.

## Cron Polling

`CronService` polls all **monitored** PicoUnits every minute: `GET /` → creates `Readings` → updates `last_seen` + `failed_calls` + `failed_readings` + board metadata.

**Cron overlap protection**: The `@Cron(EVERY_MINUTE)` decorator does not prevent parallel executions. `handleReadings()` checks an `isPolling` flag before running — if a previous sweep is still in progress (e.g., many units or slow network), the tick is skipped with a warning log. The flag is set in a `try/finally` block to guarantee reset on errors.

**Parallel polling**: Units are polled via `Promise.allSettled()` rather than a serial `for...of` loop. With 10 units at 5s each, parallel polling completes in ~5s instead of ~50s. The `pollingUnits` Set already prevents concurrent polls of the same unit from other entry points.

**Readings ingestion funnel**: `ReadingsService.createFromDeviceResponse()` is the **only** write path for the `readings` table — there is no direct POST endpoint for readings and no batch-side writes. Any quality filter or validation rule for incoming readings belongs in `ReadingsService.pollReadingsFromUnit()` (the caller), not in `createFromDeviceResponse` itself, which should remain a pure mapper/persister. Failed units increment `failed_calls` but are not auto-disabled. Uses error-safe wrappers (`applyBatchSettingsSafe`) to avoid crashing the cron job.

**Zero-value skip**: if either raw sensor value is exactly `0` (`sensors.dht.temperature === 0` or `.humidity === 0`), the reading is treated as sensor glitch/warmup noise: a warn is logged and **no reading row is persisted** (`pollReadingsFromUnit()` in `readings.service.ts`, before the empty-readings gate).

**Sensor range validation**: out-of-range DHT11 readings (outside `SENSOR_RANGE` in `pico-units.constant.ts`: temperature 0–50°C, humidity 10–90%) increment `failed_readings` on the PicoUnit instead of persisting a reading row. `failed_readings` resets to 0 on the next valid in-range reading (consecutive-failure model, independent from `failed_calls`). Temperature > 40°C logs a warning but does not block persistence (valid sensor data — safety threshold only). The range gate lives in `pollReadingsFromUnit()`, not in `DeviceResponseDto` (which is a structural validator, not a data-quality gate).

**Empty-readings tracking**: when both `temperature` and `humidity` are `null` (sensor returned no data), `consecutive_empty_readings` on the PicoUnit is incremented and no reading row is persisted. When at least one sensor value is non-null, `consecutive_empty_readings` resets to 0. This is distinct from `failed_readings` (out-of-range) and `failed_calls` (unreachable). The empty-readings gate runs after the zero-value skip and before the range check in `pollReadingsFromUnit()`.

`CronService` also runs an immediate startup sweep via `OnApplicationBootstrap` in addition to the `@Cron(EVERY_MINUTE)` tick; both delegate to the same private `runReadingsSweep()` method so behaviour stays uniform. The startup sweep is fire-and-forget (`void …catch()`) to avoid blocking the HTTP server bind.

**Registration-path poll parity**: the sweep polls every *monitored* unit regardless of how it was registered, but manual creation additionally triggers an immediate first poll. `PICO_UNIT_EVENTS.CREATED` has a listener (`CronService.handlePicoUnitCreated`) that mirrors `handlePicoUnitMonitoringStarted`: one `pollReadingsFromUnit(unit)` (try/catch, never throws into the synchronous emit) followed by `applyBatchSettingsSafe` if a batch is in progress. One-shot and idempotent for a fresh unit. So a manually added unit captures `ip`/`mac` and gets its first reading at creation time, indistinguishable from an announced unit, instead of waiting for the next sweep.

The Pico's `system.wifi.mac` is also captured during polling and persisted to `PicoUnit.mac` (nullable text). **MAC is set only once** (first successful poll) and never overwritten — it is immutable hardware identity. The client uses it to derive the AP provisioning SSID.

The Pico's `system.wifi.ip` is likewise captured during polling and persisted to `PicoUnit.ip`. **Refresh-when-present** (like the version fields below, *unlike* MAC): a non-empty reported IP overwrites the stored value — DHCP leases change — while an absent/`null`/empty value never clobbers it. This matters because `announce()` is not the only `ip` writer: a unit added through the server's manual-create path never announced, so it has no stored `ip` and `getWithFallback()` (`http-fallback.ts`) would otherwise be mDNS-only. Capturing `ip` on the first successful poll arms the mDNS→IP fallback and lets such a unit self-heal without a re-save or restart. (`SystemWifiDto.ip` is structurally required, so a malformed/`null` IP 412s the whole poll before any write; the preserve rule only guards empty-string and direct-service-call paths.)

`firmware_version` and `api_version` are also refreshed from every `GET /` response (top-level keys on `DeviceResponseDto`, optional — older firmware omits them), self-healing if an announce is ever missed. **Preserve-when-absent**: the poll only writes each field when the response actually carries a non-null **and predicate-accepted** value (`PicoUnitsService.touchAndResetFailedCalls()` — `isValidPicoFirmwareVersion` gates `firmware_version` to strict SemVer; `api_version` needs a non-null integer `>= PICO_API_VERSION_MIN`, values above MAX are stored per accept-and-flag); an absent/`null`/malformed key never clobbers the stored value — unlike MAC, these *are* overwritten on every poll when present, since firmware can be reflashed.

Cron-side state changes that are time-anchored (e.g. disabling the control loop after a batch finishes) should use a time-windowed query so the action is naturally self-limiting. For batch-finish auto-disable, `findUnitsWithFinishedBatch()` only considers batches that finished in the last 60s — they fall out of the window and are never re-disabled. The `BATCH_EVENTS.FINISHED` event handler handles the primary synchronous path.

**Readings cleanup**: `cleanReadings()` runs daily at midnight and deletes readings older than `READINGS_RETENTION_MONTHS` (default 6, configurable via env var) — that age filter is the **only** thing that deletes rows. The row-count safety cap `READINGS_SAFETY_MAX_ROWS = 1_000_000` is a **hardcoded module constant** in `cron.service.ts` — not an env var: it is absent from the Joi schema and from `CustomConfigService`. Exceeding it only emits a `warn` log line, after which the same age-based `deleteOlderThanMonths()` runs; the cap never force-deletes fresh rows (the log's "triggering cleanup" wording is misleading — the age-based cleanup runs every night regardless).

**Middleware error propagation**: Entity-by-ID middlewares (`PicoUnitByIdMiddleware`, `BatchByIdMiddleware`, `RecipeByIdMiddleware`) catch service errors and only convert `NotFoundException` instances to 404 responses. All other errors (DB failures, timeouts) are re-thrown via `next(error)` so they reach the global exception filter and produce proper 500 responses. Never use bare `catch {}` that silently converts all errors to 404.

### State-visibility split: proxy vs. batch-orchestrated changes

Control-proxy endpoints (`setpoints`, `outputs`, `setup`, `control`) use `callPollAndUpdate` which POSTs to the Pico then immediately polls, so `latest_reading` reflects the new state right away. Batch-orchestrated changes (`applyBatchSettings`, `applyControlLoopDisable`, `applyUnitDisabled`) use `callSilent` — the Pico is updated but **no trailing poll** occurs. The server's `latest_reading` therefore lags the Pico's actual state by up to 60 s (the next cron tick). This is intentional: batch-driven changes are bulk operations where a per-unit poll would serialize and block the cron loop. The `POST /pico-units/:picoUnitId/poll` endpoint exists for the frontend to force an immediate poll when needed.

### PUT-on-server → POST-to-Pico verb mismatch

Every control proxy endpoint (`setpoints`, `outputs`, `setup`, `control`, `reboot`) uses `postWithFallback` (axios POST) to communicate with the Pico, regardless of the server's HTTP method. The server endpoint may be `PUT /v1/pico-units/:id/control/setup`, but the underlying call to the Pico is always `POST /setup`. Do **not** assume the server's HTTP method carries through to the Pico — `control.service.ts` calls `postWithFallback` unconditionally.

## Seed join contract

`SeedModule` bootstraps the server-owned demo catalogue, unit roster and backdated readings (gated by `SEED_ENABLED`; per-entry verdicts in `seed/provenance/report.md`, researched dataset at `seed/provenance/dataset.json`, gate at `seed/provenance/provenance.check.ts`). The seeded series must join seamlessly with live cron polls into one continuous chart — this contract locks that seam.

- **Production refusal (hard rule)**: `NODE_ENV=prod` refuses seeding regardless of `SEED_ENABLED` — the seeder logs a warning naming the ignored flag and returns without touching the database. Single-sourced in `SeedService.onApplicationBootstrap` (the `config.isProd` call-site branch), not duplicated in the getter or schema. The flag keeps its profile defaults (off generally, on in `demo`); local development seeds with an explicit `SEED_ENABLED=true`.
- **Readings seeding is boot-time only — no CLI**: the developer-facing backdated-readings knob stays with `mushpi-mock` for local development; the server seeds readings only through `SeedService` on the demo profile.
- **Frozen boundary**: `seedEndTs` = the last whole minute at least 60 s before `now`, computed ONCE at seed start and never advanced. Seeded ⇔ `ts <= seedEndTs`; live ⇔ `ts > seedEndTs`. No column marks the split — the timestamp boundary is the whole contract.
- **Watermark guard, never a row-count guard**: a unit's readings phase is skipped iff `COUNT(*) WHERE pico_unit_id = :id AND ts <= :seedEndTs > 0` (bind via the `LessThanOrEqual` find operator — safe per [Raw SQL](#raw-sql)). Skipping on a *total* row count would truncate the series and block the live continuation once any poll has landed.
- **Regenerate without duplication**: a re-run inserts only the seeded range and no-ops while it is populated; live rows above the boundary are never touched or copied. The seeder is insert-only end to end (it never updates or deletes a row's user-visible content) and is order-independent against the cron startup sweep — the frozen `seedEndTs` is the belt-and-braces against a poll landing mid-seed.
- **Continuity tail-blend**: `readings-history.generator.ts` walks a mean-reverting 60 s grid and linearly blends its final ~20 rows onto the unit's *active-batch* setpoints (queried from the DB, so it holds even when the batch phase skipped), guaranteeing the series terminates inside `SEED_CONTINUITY_TOLERANCE` (±1 °C / ±5 %RH — the worst-case step one real poll interval can traverse). The first live poll therefore continues inside the hysteresis band, landing ~exactly one interval after the boundary.
- **Backdated window = history length × batch coverage**: the grid is still anchored on the frozen `seedEndTs` and steps at the readings cadence, but its per-unit start is extended backwards to one cadence step before that unit's earliest started batch — `computeSeededStartTs()` takes the earlier of the configured history (`SEED_READINGS_DAYS`, schema default `SEED_READINGS_DEFAULT_DAYS`) and the coverage bound from `findEarliestStartedBatchStart()`, floored onto the boundary-anchored grid. "Started" means finished plus in-progress; **planned** batches never extend the grid and have no readings, and the offline unit still gets none. The coverage this buys: every finished and in-progress batch has at least one reading inside `[start_at, finish_at ?? boundary]` on its own unit (readings are attributed per unit and clamped to the batch window by the batch-readings endpoints).
- **Readings values are whole numbers inside a deliberate band**: seeded `temperature` and `humidity` are emitted through `Math.round(...)` — DHT11-class precision, matching the mock's `int(round(...))` — while the walk state itself stays float so quantisation never feeds back into the mean-reversion term. `SEED_NOISE_AMPLITUDE` sizes a mean-reverting AR(1) (reversion `0.05`) so a stable unit spans at least `SEED_CLIMATE_BAND` (±3 °C / ±15 %RH) around its **own** target in both directions, and `SEED_DRIFT_EXCURSION` adds the drifting unit's deterministic excursion on top, sized to stay visible above that floor. The **only** clamp is the climate-bound one (`TEMPERATURE_MIN`/`TEMPERATURE_MAX`, `HUMIDITY_MIN`/`HUMIDITY_MAX`) — there is deliberately no no-overshoot rule against the target, so do not "restore" one; the old apparent cap was reversion dominating the noise, not a clamp. Because seeded humidity targets are 85–90 %RH and `HUMIDITY_MAX` is 90, the upper side legitimately saturates at that ceiling — the DHT11's real limit, not a defect.
- **Chart points are bucket averages, not readings**: `GET /v1/pico-units/:id/readings` and the batch equivalent return `ROUND(AVG(temperature), 1)` per NTILE bucket, so a plotted point is usually fractional even when every stored row is a whole number. Do not read that decimal as sensor precision or "fix" the generator because of it — the raw rows (and the CSV exports) are the readings.
- **PRNG draw budget**: `mulberry32` is seeded per unit, and the walk consumes 3 draws before the loop plus 6 per row. Any re-tuning or port must match that schedule or the series stops being reproducible and the exact band assertions move.
- **Batches are written directly through the repository**, never `BatchesService.create` — that would fire a synchronous `BATCH_EVENTS.STARTED` at unreachable units and trip the active-batch conflict check. The batch phase no-ops while the batch table is non-empty.
- **Seeded batch rows may be recipe-less**: a batch can be seeded without a recipe — `recipe_id` persists as `null` and the row carries its own `species` plus integer `temperature_target` / `humidity_target`, with the window derived from the seed entry's own `durationDays` instead of the recipe's; two finished roster entries are deliberately hand-authored to keep that path exercised. `Batch` has **no `title` column** — the client renders `description` as the batch title — so seeded descriptions are distinctive per batch with no shared prefix (unique by authorship, not a DB constraint) and the demo signal lives in `notes`.
- **Batch images are external URLs written by the seeder**: `seed/provenance/batch-harvest-images.json` (the committed trail) maps species → verified harvest photo; `seed-data/batch-images.ts` derives the lookup so no consumer retypes a URL, and `SeedService` writes the `imageUrl` straight into the `images` simple-json column, attribution as a one-line `notes` suffix (`Batch` has no per-image licence column). The upload endpoint's files-only rule (stored filenames, max 5) does NOT apply to this direct-repository write — the asymmetry is deliberate; `buildImageUrls` passes `http(s)` entries through, so `images_url` still renders them.
- **E2E gotcha — class tokens do not survive `jest.resetModules()`**: demo-seeding specs boot the app after a module-registry reset (the `demo-readonly` pattern); `app.get(CustomConfigService)` against the *statically imported* class fails with "Nest could not find … element" because the app registered the same class from the NEW generation. Resolve class-token providers by dynamically importing them inside the launch helper alongside `./test-setup` (see `seedService`/`config` in `test/seed.e2e-spec.ts`); name-based `getRepositoryToken` strings are generation-safe.

## Pass-Through & Response Shape

### Pass-through fields (non-persisted response fields)

Certain fields appear in API responses but are **not stored** in any database column. Two sanctioned approaches exist:

**(a) Entity-attached `@ApiProperty` for shared computed fields**: Used when the field is meaningful across multiple endpoints. `latest_reading` on `PicoUnit` is the prime example — it is added via `@Expose()` getter or service-level enrichment (not a real column, loaded via relation), and returned by `GET /v1/pico-units/:id`, `POST …/poll`, and dashboard summary endpoints. Declare it on the **entity itself** with `@ApiProperty({ nullable: true })` so it appears in every Swagger response that includes the entity.

**(b) Wrapper DTO via `IntersectionType` for endpoint-specific ephemeral fields**: Used when the field is only meaningful on one endpoint. `devices` (live pin mapping from the Pico) is the prime example — it is only returned by `POST /v1/pico-units/:id/poll`. Create a `DevicesMixin` class and merge it with `PicoUnit` via `IntersectionType(PicoUnit, DevicesMixin)` to produce `PollPicoUnitResponseDto`. This keeps the shared `PicoUnit` entity schema untouched while adding the endpoint-specific field.

### Every stored column returned by a controller must carry `@ApiProperty`/`@ApiPropertyOptional`

The Docker image build regenerates the client from the **committed** `spec/openapi.json` (`COPY mushpi-server/spec/openapi.json ./openapi.json` → `yarn gen:client && gen:schemas` → `tsc -b && vite build`). The committed spec is generated from the **compiled** app, so the swagger CLI plugin's `_OPENAPI_METADATA_FACTORY` now synthesises a schema entry for every declared class property — an undecorated field no longer *silently drops* out of the spec; it **arrives with a plugin-inferred shape**: design type from TS reflection (`number` even where `@IsInt()` means integer — e.g. the undecorated `SetpointsDto` fields commit as `type: number`, not `integer`), requiredness from the TS `?`/`!`/initializer rather than intent, and class-validator constraints leaking into the schema. A field the class never declares (a bare getter with no backing property) is still omitted, and an explicit `@ApiProperty` on an optionally-declared (`?`) property no longer forces `required` — the factory supplies that key. **The rule therefore guards shape *intent* (type, requiredness, description, example), not presence**: without the decorator the committed contract carries whatever the plugin guesses, and the client's `strict: true` types inherit the guess. Rule:

- **Any `@Column` field that a controller returns (directly or via `latest_reading`/relations) must be decorated** with `@ApiProperty` or `@ApiPropertyOptional`. Do not blanket-add — only describe fields the client actually consumes (cross-reference `mushpi-client`); since compiled-output generation a *missing* decorator no longer hides a declared property from the client — only `@ApiHideProperty()` does. The never-serialized relation properties `Readings.pico_unit`, `PicoUnit.readings` and `Recipe.batches` are now hidden with `@ApiHideProperty()` (the plugin otherwise inferred them into the contract — `Readings.pico_unit` as *required*, which no endpoint can satisfy); serializing any of them in a future endpoint requires explicitly re-decorating it with `@ApiProperty` at the same time, same rule as a new returned column.
- **Never-serialized TypeORM relation properties must carry `@ApiHideProperty()`** — TypeORM decorators (`@ManyToOne`/`@OneToMany`) are invisible to the swagger CLI plugin, which infers a shape for every declared property from TS reflection alone. Note `IntersectionType` inline-expansion: a hidden source-entity property disappears from derived wrapper schemas too (`PicoUnit.readings` hidden ⇒ `PollPicoUnitResponseDto.readings` gone, since the poll DTO flattens the entity's properties rather than `$ref`-ing it).
- **Match decorator requiredness/nullability to how the client accesses the field** (client is `strict: true`): client uses `field ?? fallback` (null-safe) → `@ApiPropertyOptional({ nullable: true })`; client renders directly or passes to a non-nullable param (e.g. `formatDate(iso: string)`) → required `@ApiProperty` with **no** `nullable: true`.
- **Relations that are conditionally loaded**: if some endpoint omits the relation (e.g. `GET /v1/pico-units/:id/batches` omits `pico_unit`), type it `@ApiPropertyOptional(...)` (optional, not `nullable: true` unless it can genuinely be null — a batch always *has* a `pico_unit_id`, it's just not always *expanded*). Use lazy refs `type: () => PicoUnit` to avoid circular `$ref`s.
- **Regression guards**: `test/openapi-schemas.e2e-spec.ts` boots the app, builds the doc in-process via ts-jest (**no CLI plugin** — so the doc reflects decorator coverage only, i.e. source-level shape intent), and asserts every client-consumed field exists per schema. Add new fields to it when you add new entity fields. `test/openapi-committed-spec.e2e-spec.ts` pins the complementary side: it reads the committed `spec/openapi.json` **from disk** (the compiled-output document where the plugin *does* infer), asserting the hidden relations stay out, `latest_reading`/`Batch.pico_unit`/`Batch.recipe` stay in, and the `required` arrays match.

### `devices` block — not persisted

The `devices` block (`active_high`, `pins.dht`, `pins.humidifier`, `pins.fan`, `pins.heater`) is read directly from the Pico's `GET /` response during polling. It is **validated** via `class-transformer`/`class-validator` but **never persisted** to any database table. It passes through from the Pico to the client via `PollPicoUnitResponseDto`. There is no `devices` column on `PicoUnit` and no migration adding one — the canonical source is the Pico itself, queried fresh on every poll (and, for the setup-proxy pin validation, also queried fresh via `GET /setup` before forwarding a pin change — see §Pin validation for setup proxy).

### Validation pipe safety (`flattenValidationErrors`)

The global `ValidationPipe`'s `exceptionFactory` must **recursively flatten `ValidationError.children`** for nested DTOs annotated with `@ValidateNested()`. Parent-level errors from nested validation have `constraints: undefined` — accessing them directly causes a 500 internal server error instead of a proper 422. The `flattenValidationErrors()` function in `src/common/pipes/validation.pipe.ts` walks the `children` array and only reads `constraints` when defined. Any new `@ValidateNested()` usage must go through this pipe — do not use the default `ValidationPipe.exceptionFactory`.

### Unknown request-body keys are a hard 422 (`forbidNonWhitelisted`) — no silent-drop window

The global pipe runs with `forbidNonWhitelisted: true`: **any key on a `/v1` request body that is not declared on the DTO fails validation**, and the custom `exceptionFactory` returns an `UnprocessableEntityException` → **422**. This is the exact opposite of the polling path's tolerant `DeviceResponseDto` validation (`whitelist: true` + `forbidNonWhitelisted: false` in `validateDeviceResponse()`), which silently drops unknown keys. Consequence: removing or renaming a field on an announce/create/update DTO **immediately** breaks any client still sending the old key with a 422 — there is no compatibility or silent-drop window on request bodies (only on Pico responses). When renaming/removing a DTO field, the firmware/client must stop sending the old key **before or simultaneously with** the server change (the `software_version` → `firmware_version` + `api_version` cutover is the worked example — guarded by `test/pico-units.e2e-spec.ts`).

### Pin validation for setup proxy

`PUT /v1/pico-units/:id/control/setup` guards against two controls landing on one GPIO in two layers:

- **DTO/pipe layer** (`control.dto.ts`): every pin field is checked against `VALID_USER_GPIO_PINS` from `src/common/constants/hardware.constants.ts` — valid user I/O GPIOs are 0–22, 26–28 (GP23/24/25/29 are WiFi-reserved on Pico 2W) — and `NoDuplicatePinsConstraint` rejects a body that assigns two devices to the same GPIO **within the request itself** (422, message contains `'same GPIO pin'`). The constraint is anchored at the **class level** of `ChangeDevicePinsDto`, not on a pin field: `class-validator`'s `@IsOptional()` is a `CONDITIONAL_VALIDATION` that suppresses **all** validators on its property when the value is absent, so a field-anchored `@Validate` silently no-ops whenever that field is missing (`{ humidifier: 6, fan: 6 }` without `dht` used to pass the pipe). Because `@Validate` itself is a `PropertyDecorator` (applied to a class, its `object.constructor` resolves `Function` and the constraint registers against the wrong target — a silent no-op; it also fails to typecheck), the class anchor goes through `registerDecorator` with the constructor as target and no property name; the constraint then receives the whole instance via `args.object`.
- **Service layer** (`ControlService.setup()` pre-flight, `pin-collision.util.ts`): partial updates can still reuse a GPIO the device already holds on a *different* control — pin mappings are not persisted server-side, so the DTO has nothing to compare against. When the body changes at least one pin (`hasSetupPinChanges`), the service fetches the live mapping fresh via `GET /setup` (10 s timeout), merges the partial body over it, and on a conflict throws 422 **before anything is forwarded** — `formatPinConflict` message: `'GPIO <pin> is already assigned to the <holder>'` (holder = the non-requested device; merged-view semantics: same-device re-assign is a no-op, a pin freed by another device in the same request is free, pre-existing out-of-band duplicates pass, in-request duplicates are caught). A rejected change never reaches the device and does **not** increment `failed_calls` (a validation rejection is not a device fault); a failed pre-fetch **does** increment `failed_calls` and rethrows, mirroring `callSilent` so the failure surfaces through the axios filter as the same 417/502/424 class a failed forward POST produces. The **original partial body** is forwarded on success — never a fabricated merged mapping (the device applies only present keys). A body with no pins (`active_high` only) skips the device round trip entirely.

The 422 from the pre-flight passes through `ExceptionsFilter` untouched (`handleHttpError`); the pipe 422 goes through `flattenValidationErrors` (its class-level entry surfaces under a `pins.undefined has wrong value ...` path — cosmetic artifact of class-validator grouping the property-less constraint under an `'undefined'` key; only the substring is load-bearing for assertions).

### Partial PATCH — `Object.assign` semantics (why DTO fields must have no initializers)

`PicoUnitsService.update()` applies a partial PATCH with `Object.assign(unit, dto)`. Fields the request body omitted are **not own-enumerable** on the DTO instance, so `Object.assign` skips them and stored values survive. A default value or property initializer (e.g. `?: string = ''`) makes the field own-enumerable even when omitted — every PATCH would then incorrectly overwrite the stored value with the default. The rule (no initializers in ANY `UpdateXxxDto`) is core (`AGENTS.md` §DTO partial-update contract); the mechanism is here.

## Timezone

All database timestamps are stored **in UTC, in SQLite's native `datetime` format — not as ISO-8601 strings**: `YYYY-MM-DD HH:MM:SS.SSS` when TypeORM binds a `Date`, or whole-second `YYYY-MM-DD HH:MM:SS` when the column's `DEFAULT CURRENT_TIMESTAMP` supplies the value (e.g. `readings.ts` — `createFromDeviceResponse()` omits `ts` and lets the DB default fire). Never any `T` or `Z` in the DB — see [Raw SQL](#raw-sql). What the `TimezoneInterceptor` actually relies on is the **read path**: TypeORM rehydrates every `datetime` column back into a `Date` instance, and response serialization of `Date`s emits UTC ISO (`...Z`) strings that the interceptor's regex matches.

### Settings Module

`GET /v1/settings` and `PATCH /v1/settings` manage the display timezone:

- **Storage**: `Settings` entity — single-row table (`id=1`), upsert-on-write
- **Default**: OS timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone` when no persisted row exists
- **Service**: `SettingsService` with in-memory cache (`getTimezone()` / `setTimezone()` / `resetCache()`) — hits DB only on first read post-boot and after writes
- **Module**: `@Global()` `SettingsModule` so the interceptor can inject `SettingsService`

### TimezoneInterceptor

A global `APP_INTERCEPTOR` that recursively walks all API responses and converts:

- `Date` instances → `dayjs.utc(value).tz(tz).format('YYYY-MM-DDTHH:mm:ss.SSSZ')`
- Strings matching ISO-8601 UTC (`...Z`) → same conversion
- Arrays/Objects → recursed
- Primitive/non-date strings → passthrough

**Fast path**: when `timezone === 'UTC'`, the interceptor is a zero-cost passthrough (`next.handle()` without any body walk). All existing e2e tests pass unchanged.

**Output format**: `2026-07-31T12:30:00.000+02:00` (`.SSS` milliseconds + explicit offset) — unambiguous for clients.

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
- `PicoAnnounceSecretGuard` (validates the `X-Pico-Secret` header against `PICO_ANNOUNCE_SECRET`) — used via `@PicoAnnounceSecret()` composite decorator. **Two profiles**: on every boot but demo it returns 401 on mismatch/missing (byte-for-byte historical behaviour); on `NODE_ENV=demo` it additionally refuses **externally-originated** announces with an explicit-body 403 (`emitter: 'PicoAnnounceSecretGuard'`) **before** comparing the secret — so a refused caller gets no right/wrong oracle and the demo has no brute-force surface to throttle. Internal ⇔ **no non-empty `X-Forwarded-For`** *and* a loopback or own-interface-CIDR peer (after unwrapping `::ffff:` mapped IPv4) — `isInternalCaller(req, interfaces)` in `src/common/utils/internal-caller.util.ts`, resolved at call time from `os.networkInterfaces()`, **fail-closed** (absent/empty/unparseable address ⇒ refused; null `cidr` ⇒ entry skipped). Requiring the header's *absence* is what makes forgery useless: under the demo's `trust proxy = 1` a forged `X-Forwarded-For: 127.0.0.1` would otherwise read as loopback, but forging can then only ever buy a 403. `@ReadOnlyExempt()` on the announce handler **stays** — `DemoReadOnlyGuard` cannot tell an internal caller from a visitor, so removing it would refuse the simulated unit. **No configuration at all**: zero env vars, no budgets, no state — the trust decision is topology-derived; a restart has nothing to lose. **Residual assumption (not closable in code)**: the demo's reverse proxy must present the visitor identity — a proxy that strips `X-Forwarded-For` makes visitor traffic arrive from an in-subnet peer and be classified internal, degrading to secret-only trust; verify on the deployed demo that an external announce returns 403. Gotcha: `net.BlockList`'s `{ isIPv4 }` constructor option exists at runtime but is **absent from the installed `@types/node`** — construct plain and pass the family explicitly to `addSubnet`/`check` (an implicit-family `addSubnet` throws on a v6 base; family-mismatch checks return `false`, never throw).
- `TooManyRequestsGuard` — `@nestjs/throttler` (installed **6.7.0**) rate limiting. All throttler definitions come from `buildThrottlerDefinitions(config)` (`src/common/utils/build-throttler-definitions.ts`), wired as `ThrottlerModule.forRootAsync()`'s factory in `app.module.ts`. **The surface is two deployment profiles with different threat models — read the config as profiles, not as an accretion of demo special cases.**
  - **Self-hosted profile — opt-in, silent.** A hub on a trusted local network: the network itself is the security boundary (the same posture as the optional `APP_SECRET` — LAN/Tailscale, see §Environment Variables). `ThrottlerModule.forRootAsync()` resolves a single `[{ ttl, limit }]` definition only when both `MAX_REQUESTS` and `MAX_REQUESTS_TIME` are positive safe integers, and an **empty definitions array** otherwise — a hub gets no slow-down and no new limits unless its operator explicitly opts in. The empty array is what suppresses the headers: every header write lives inside `ThrottlerGuard.handleRequest()`, which the guard calls from its per-throttler loop, so zero definitions ⇒ the loop body never runs ⇒ no headers and no 429 (`[].every(…)` → `true`). Never hand the library a definition with an `undefined` `ttl`/`limit` — it then emits literally `X-RateLimit-Limit: undefined` with `NaN` in the other two. The `VISITOR_*`/`ABUSE_*`/`GLOBAL_*` limiter vars are **ignored entirely** on this profile: `isDemo` is checked FIRST, so stray limiter values in a hub's env file can never produce a definition, never throw, and never change the historical shape.
  - **Per-visitor limiting is deliberately NOT generalised to hubs.** The visitor identity comes from the forwarded-header chain (`req.ip` under the single-hop trust proxy, below) — sound only behind **exactly one known appending proxy**, which the demo profile has and an arbitrary hub does not (no proxy ⇒ every visitor shares the one socket bucket; an unknown-length chain ⇒ trusting client-chosen headers). That is why the always-on triple lives in the public-demo profile alone.
  - **Public-demo profile — always on.** An internet-exposed, unauthenticated demonstration instance behind exactly one reverse proxy; an unprotected public demo is not an option. Three limiters from the six required env pairs (`VISITOR_*`, `ABUSE_*`, `GLOBAL_*`), in declaration order `[default, demo-global, demo-abuse]`: (1) an **unnamed per-visitor browse-pace** definition filling the `default` slot — tracker is the library default (`req.ip`, the visitor's forwarded identity under the proxy trust below); (2) the named **`demo-global` backstop** on the constant tracker `RATE_LIMIT_GLOBAL_TRACKER` — one instance-wide bucket, so a many-visitor flood slows the whole demo and recovers without a restart; (3) the named **`demo-abuse`** limiter — same visitor identity, its own distinct bucket, enforced **only** on requests the read-only guard would refuse (`skipIf` below). The factory re-checks all six with the positive-safe-integer idiom and on this profile a failed check **throws from the factory** (fail loudly — a public demo never boots unprotected). No limit/window numbers are hardcoded in the product.
  - **What carries profile scope — the required-when-demo rule, not a name prefix.** The old env prefix on these limiter vars is **gone**: they are named `VISITOR_*`/`ABUSE_*`/`GLOBAL_*` and the profile scope is carried instead by the config schema's required-when-`demo` rule (mandatory on the public-demo profile, optional and read by nothing elsewhere). The names that remain load-bearing stay: the two throttler names (`'demo-global'`, `'demo-abuse'`) key the `@SkipThrottle` entries and the `X-RateLimit-*-<name>` / `Retry-After-<name>` suffixes on the wire, and the `security.demo` config group stays.
  - **Flat demo keys**: all three demo definitions share `flatThrottlerKey` → `mushpi-demo-<throttlerName>-<tracker>` — each visitor's browse and refused-change budgets span **ALL** endpoints and the backstop collapses to one bucket. (The library's own default key embeds `Class-handler`, which would scatter these budgets per route.)
  - **ttl-ascending re-sort caveat**: the library re-sorts definitions by **ascending `ttl`** at module init, so with unequal windows which definition throws first is **ttl-order dependent, not declaration-order** — and the blocking definition's suffixed `Retry-After-<name>` is the one a client sees. When a test needs the 429 to come from a specific bucket (e.g. `demo-abuse`), that definition's window must be **strictly smaller** than the others. Equal windows fall back to declaration order (stable sort).
  - **`skipIf` semantics lock**: the abuse gate calls the shared `isReadOnlyRefusal(mark, method)` predicate (`src/common/utils/readonly-refusal.util.ts`) — the same pure function `DemoReadOnlyGuard.canActivate` uses (exempt → false; refused → true; otherwise non-safe method → true). One definition of "a refused change", two consumers; a change to the refusal rule lands in both automatically — the same discipline as the setup duplicate-GPIO rule in the root `AGENTS.md`. The mark is read at **handler level only** (`Reflect.getMetadata(READONLY_MARK, context.getHandler())`, mirroring the guard), so the options factory needs no DI. Consequence: browsing never spends from the abuse bucket, and announce (exempt) is never abuse-limited even without its explicit skip.
  - **Proxy requirement**: per-visitor identity depends on Express `trust proxy` being `1` — applied **only for the public-demo profile** (`isDemo`) by `applySingleHopTrustProxy` (`src/common/utils/trust-proxy.ts`) from **both** `src/main.ts` and `test/test-setup.ts` (production and fixture stay in lockstep, same rule as the shared Helmet factory). One hop is trusted, so `req.ip` is the RIGHTMOST `X-Forwarded-For` entry — the address the proxy itself wrote; a client-spoofed prefix cannot mint a fresh bucket (changing address does not escape a slow-down; visitors behind the same proxy are told apart). Self-hosted profiles keep the Express default — **never enable trust proxy as a side effect**; it rewrites `req.ip` and therefore every bucket (see the §Image Uploads note).
  - **Name-keyed skips are inert outside demo**: `@SkipThrottle` keys its `THROTTLER_SKIP` metadata on throttler NAMES. Health carries `{ default: true, 'demo-global': true, 'demo-abuse': true }` and announce carries `{ 'demo-global': true, 'demo-abuse': true }` — on a non-demo boot the two named keys match no definition, so announce stays fully throttled by the owner's opt-in limiter (pinned in `test/rate-limit-headers.e2e-spec.ts`), while health's plain `default` skip preserves the historical `/health` exemption byte-for-byte (Docker HEALTHCHECK target stays reachable and header-free regardless). Announce **keeps** the visitor browse pace: a flood of announcements from one address is still paced.
  - **Header names are the library's own** (prefix `X-RateLimit`): `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` on every throttled response, plus `Retry-After` **only when blocked** (a `-<name>` suffix appears only for a *named* throttler; the default throttler — including the demo visitor pace — is unsuffixed). A demo boot therefore also carries `X-RateLimit-*-demo-global` / `-demo-abuse`, and blocks on those buckets emit `Retry-After-demo-global` / `-demo-abuse`. Do not set them manually, add an interceptor, or rename them.
  - **Units**: every configured window (`MAX_REQUESTS_TIME`, each `VISITOR_*`/`ABUSE_*`/`GLOBAL_*` `_MAX_REQUESTS_TIME`) / `ttl` is **milliseconds**, while `X-RateLimit-Reset` and `Retry-After` are **relative seconds** (`Math.ceil(ms / 1000)`).
  - **The 429 body branches by deployment profile inside `throwThrottlingException`** — the guard subclass overrides **only** that method and does not bypass header generation. `statusCode: 429`, `error: 'Too many requests'` and `emitter: 'ThrottlerGuard'` are identical on both branches. On a **demo boot** the `message` carries the maintainer-approved slow-down sentence from `rate-limit.constants.ts` (`RATE_LIMIT_SLOW_DOWN_MESSAGE_TEMPLATE` + `formatSlowDownMessage`), stating the real wait as `throttlerLimitDetail.timeToBlockExpire` — the exact seconds the library writes into the blocking bucket's `Retry-After` header immediately before invoking the override, so the figure is the true blocking window by construction, never a fixed number. (`X-RateLimit-Reset` carries `timeToExpire` — the rolling window, not the block; do not use it for wait wording.) On **every other boot** the `message` keeps the historical `'Too many requests'` byte-for-byte — a hub that does not report the demo environment shows no wait sentence. Regression guards: `test/rate-limit-headers.e2e-spec.ts` (non-demo body untouched), `test/demo-rate-limit.e2e-spec.ts` (demo sentence pinned against each blocking bucket's own `Retry-After`, incl. two different windows stating two different waits).
- `DemoReadOnlyGuard` — global demo read-only refusal (`APP_GUARD` in `app.module.ts`, registered **after** `TooManyRequestsGuard`: Nest runs global guards in provider order, so a refused request still spends from the pace budget and its 403 carries the `X-RateLimit-*` headers when throttling is configured). On `NODE_ENV=demo` it refuses every request whose method is not safe (`GET`/`HEAD`/`OPTIONS`) with an explicit-body 403 (`emitter: 'DemoReadOnlyGuard'`) — the refusal decision is the shared `isReadOnlyRefusal` predicate that also gates the abuse throttler's `skipIf` (see the `TooManyRequestsGuard` entry above). Inert on all other boots. Guards run **before** the validation pipe (malformed body on a refused route → 403, not 422); route middleware runs **before** guards (nonexistent `:picoUnitId` on a mutating route → 404 from `PicoUnitByIdMiddleware`, not 403). Server-internal writes (the 60s cron, `@OnEvent` handlers) never pass through guards — demo keeps ingesting readings; the only inbound writer left open is announcement, exempt from *this* guard but gated by `PicoAnnounceSecretGuard`, which on demo additionally origin-gates it (external announces → 403 before the secret check; internal callers still need the secret, 401 without it).
  - Marks are composite decorators under `src/common/decorators/docs/`, each writing `SetMetadata(READONLY_MARK, …)` (read by the guard via `Reflector`) **and** the `x-demo-readonly` OpenAPI extension (read by the spec's 403 injection) — the two projections of one declaration and cannot drift:
    - `@ReadOnlyExempt()` — handler allowed on demo AND the spec omits its 403. The only escape hatch: greppable and deliberate. Today the complete exemption set is `POST /v1/pico-units/announce`.
    - `@ReadOnlyRefused()` — **safe-method-writes convention**: any handler mutating persisted state under a safe method must carry this mark (the method default cannot see it), or demo would let a writer through. Today: `GET /v1/pico-units/:id/ping` (records `last_seen`/`failed_calls`).
  - Adding a new non-safe-method endpoint needs **zero** demo work: the method default refuses it at runtime and the spec injection documents its 403 automatically. Regression guards: `test/demo-readonly.e2e-spec.ts` (runtime), the 403 invariant block in `test/openapi-committed-spec.e2e-spec.ts` (committed spec), injection unit tests in `src/modules/swagger/swagger.module.spec.ts`.
- `AppSecretBearerMiddleware` — optional Bearer token auth from `APP_SECRET`
- `ProtectEventLoopMiddleware` — toobusy-js overload rejection

Every guard must be bundled with its Swagger error responses into a composite decorator under `src/common/decorators/docs/`, regardless of how many methods use it. The extraction criterion is "guard + Swagger bundle" — not reuse count. This keeps controllers pure (endpoint definitions and Swagger docs only, no guard wiring scattered inline). For reference: `@OnlyEnabledPicoUnitsWithControlLoop()` is single-use yet still extracted.

## Demo host-details redaction

- **What a demo boot withholds**: on `NODE_ENV=demo`, `GET /health` omits host identity from the response — the `system.os`, `system.cpu` and `system.disk` keys are **absent** (not `null`, matching the existing query-gated precedent), and `databases.<name>.size.path` is removed from the size block. Everything else stays visible: `server.*` (health status, environment name, `appVersion`/`nodeVersion`, load average, process memory, upTime), `system.memory` and `system.upTime`, `databases.<name>.read`/`write` with the size figures (`totalMb`, `inMemory`, `tables[].*`, `overheadMb`), `services.*`, and `/ping` — so the operator's health check still reports healthy/unhealthy against the demo.
- **The `isDemo`-first rule** (same posture as the throttler factory in [Guards](#guards)): `MonitoringService.checkSystemStatus()` builds only `memory`/`upTime`, checks `configService.isDemo`, and early-returns **before collecting anything host-identifying** — on demo `os.cpus()`/`os.hostname()`/`fs.statfsSync()` are never called, nothing is redacted after the fact. A self-hosted hub's `/health` is byte-for-byte unchanged. The database side is deliberately different: the read/write probe and size figures need `SQLiteHealthService` to run, so `health()` post-processes each status through the private `redactDatabaseStatus()`, which omits only the `path` key. `SQLiteHealthService` itself stays path-aware and untouched.
- **Error-body `emitter` fallback**: with `errorsDetail` on, `exceptions.filter.ts` derives `emitter` from the throwing stack frame when the exception carries none — and a compiled-code frame can be **anonymous** (`at /app/dist/src/foo.js:1:2` → `/app/dist/src/foo`), leaking a filesystem path into a visitor-readable body. On demo the fallback answers `'unknown'` instead; every other boot keeps the historical derivation, and explicitly-set emitters (`'DemoReadOnlyGuard'`, `'database'`, `'ThrottlerGuard'`, …) pass through untouched on all profiles.
- **`errorsDetail` semantics — correction of stale prose**: the enrichment is on whenever `ERRORS_DETAIL !== 'false'` — in **every** environment, `prod` and `demo` included. `CustomConfigService.server.errorsDetail` coerces `get('ERRORS_DETAIL') !== 'false'`, and an unset var is `undefined` (`!== 'false'` → `true`); the `errorsDetail` getter's `undefined ⇒ !is('prod')` branch is **dead code** because that coercion always yields a boolean. `src/common/filters/exceptions.readme.md` and `src/modules/swagger/swagger.readme.md` still claim `NODE_ENV=prod` alone suppresses the detail fields — that wording contradicts the shipped behaviour; treat the code as normative until the docs tier corrects it. The nestjs-backend skill carries the same stale "defaults to `true` in non-prod" phrasing.
- **Contract surface**: the DTO fields went `required: false` (`SystemInfoDto.os`/`cpu`/`disk`, `DatabaseSizeDto.path`), so the committed `spec/openapi.{json,yaml}` lists them as optional with an "Omitted on a public-demo instance" description — the client regenerates them as optional. No new endpoint, env var or module.
- **Regression guards**: `test/demo-host-details.e2e-spec.ts` (demo boot — redacted `/health`, intact query gates, `pong`, path-free `emitter` on 404/422 bodies), the `withholds host details on a demo boot` case in `src/modules/monitoring/monitoring.service.spec.ts`, and `test/monitoring.e2e-spec.ts` unchanged as the self-hosted shape guard.

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
- **Schema-only migrations are the default expectation.** Data-only migrations (no schema change) that `DELETE` or rewrite live rows fall under the root `AGENTS.md` **Data Deletion Prohibition**: they require the user's explicit consent before being authored or run — never write one as a side effect of schema work. If one is consented to and the operation is irreversible, `down()` should be a no-op with a comment explaining why.
- **Generating migrations**: Use `yarn migration:generate src/modules/sqlite/migrations/<DescriptiveName>`. For a baseline migration, target an empty temp DB (`SQLITE_PATH=/tmp/opencode/empty.sqlite yarn migration:generate ...`). For incremental migrations, target the dev DB. The CLI does not load `.env` files — pass env vars explicitly.

## Clean start

The public demo is disposable state: every demo boot resets its volume so the instance comes up pristine and re-seeded. Every other volume keeps the opposite promise — "your data survives restarts and updates" — which is exactly why the mechanism fails closed rather than wiping optimistically.

- **Demo-only, gated at the call site.** `cleanStart()` (`src/common/utils/clean-start.ts`) is invoked only when `configService.isDemo`, and that branch lives in `main.ts`'s bootstrap — the util itself never reads `NODE_ENV`, it receives validated config and decides on on-disk state alone (name-for-content doctrine: the profile never namespaces the unit; `AGENTS.md` §Content-named code).
- **The connect window is load-bearing.** Without `manualInitialization: true` the `@nestjs/typeorm` `DataSource` provider factory connects eagerly: `NestFactory.create()` awaits it and it calls `dataSource.initialize()` itself — verified against the installed package (`@nestjs/typeorm` 11.0.3, `dist/typeorm-core.module.js:190`: `return !dataSource.isInitialized && !options.manualInitialization ? dataSource.initialize() : dataSource;`, reached from the awaited `forRootAsync` DataSource provider factory at lines 69-78 of the same file). `sqlite.module.ts` sets `manualInitialization: true` (next to `synchronize`/`migrationsRun`), so `create()` returns with the DataSource NOT connected and the database file NOT created or opened — no schema, no sidecars, no open handle. `main.ts` runs `cleanStart()` inside that window, immediately before its own explicit `await dataSource.initialize()`: the decision sees true on-disk state, a wipe unlinks a file with no open handle and leaves the database **absent**, and the later connect opens a genuinely fresh one before `listen()` runs the lifecycle hooks (image dirs, cron startup sweep, demo seeding) that need a live connection.
- **`Test.createTestingModule` e2e does not replicate the production bootstrap ordering — the bootstrap spec exists because of it.** The fixture ends up with a live connection either way (eager factory connect, or the explicit `initialize()` in `test-setup.ts` mirroring `main.ts`), so fixture specs pass under both orderings — which is precisely how the first clean-start attempt passed **every** unit and e2e suite while being broken three ways: the eager connect pre-created the file the decision then refused, so the adoption path was unreachable; the refusal wrote a schema into the volume it refused; and the wipe unlinked a file under an open handle, leaving the process serving stale rows from a deleted inode. `test/clean-start.bootstrap.e2e-spec.ts` therefore boots with `NestFactory.create(AppModule)` in `main.ts`'s exact order and asserts `isInitialized === false` immediately after `create()` — an assertion that FAILS the moment `manualInitialization: true` is removed, making the option a test-pinned contract. A wrong bootstrap ordering stays invisible to every fixture-based spec; a demo-profile smoke boot ([Local Verification](#local-verification-smoke-boot-without-disturbing-a-live-instance)) remains the final check.
- **Decision matrix.** The marker is `DEMO_OWNERSHIP_MARKER_FILENAME` (`.demo-owned`), placed **beside the resolved database file** (same directory — never inside the DB, never in the image tree). Marker present → **wipe**: unlink the database plus its `-wal`/`-shm`/`-journal` sidecars (enumerated defensively across journal modes) and recursively remove the image directory (`config.upload.imageDir`); the marker SURVIVES the wipe it authorises, so the next start wipes again. Marker absent, database absent, image dir absent or empty → **adopt**: write the marker; the volume is demo-owned from now on. Marker absent but the database exists or the image dir is non-empty → **refuse**: throw, failing closed — nothing wiped, nothing created.
- **The refusal is fail-closed and its remediation is a one-time ops action, not a normal part of starting.** An unadopted, populated volume is someone else's data (root `AGENTS.md` §Data Deletion Prohibition), so boot stops with the refusal error naming the paths. Remediation: deploy on a fresh volume, or clear a pre-existing demo volume **by hand once** and let the next boot adopt it. An adopted volume never refuses again — its wipe is automatic — so an operator who has cleared once should not have to do it again; a recurring refusal means the volume identity changed, not that this is routine.
- **What is and is not touched.** Removed: the SQLite file, its sidecars, the uploaded-image tree. Never touched: the ownership marker (it must outlive the wipes it authorises) and `LOGS_PATH` — logs are operational records, not demo state; the clean start never deletes or rewrites them.
- **Post-wipe, the demo rebuilds without new code.** The fresh volume starts at zero rows, so the cron startup sweep finds no units to poll; the catalogue, the simulated unit roster and the backdated readings return because seeding is insert-only and default-on under demo (`SEED_ENABLED`; §Seed join contract); and any unit that announces re-registers through `announce()`'s upsert-by-`handle` (root `AGENTS.md` §Pico ↔ Server contract) — demo units come back on their own without re-adding or new code.
- **Regression guards:** `src/common/utils/clean-start.spec.ts` (the three verdicts against real filesystem fixtures, including a SHA-256 tree snapshot proving a refusal leaves the volume byte-for-byte unchanged) and `test/clean-start.bootstrap.e2e-spec.ts` (bootstrap ordering, adopt → populate → restart → sentinel-gone).

## Environment Variables

| Variable               | Default             | Description                                                                   |
| ---------------------- | ------------------- | ----------------------------------------------------------------------------- |
| `PORT`                 | `3000`              | Listen port                                                                   |
| `NODE_ENV`             | `local`             | `demo/dev/local/prod/staging/test`                                            |
| `SQLITE_PATH`          | `./data/app.sqlite` | DB path                                                                       |
| `CLIENT_URL`           | —                   | CORS allowed origin (required in `local`, optional elsewhere)                 |
| `CLIENT_DIST_DIR`      | —                   | Absolute path to the built `mushpi-client` SPA (`dist/`). Required in `prod`; unset = SPA serving disabled (dev uses Vite :5173). Docker sets e.g. `/usr/src/app/client`. |
| `APP_SECRET`           | —                   | Optional Bearer token for human auth (optional in all envs; LAN/Tailscale is the security boundary). A `demo` deployment leaves it unset — setting it would 426 the dashboard. |
| `APP_HTTPS_ENABLED`    | `false`             | Declares the browser-facing deployment is HTTPS (TLS terminated upstream/directly; configures no TLS itself). Gates helmet HSTS + CSP `upgrade-insecure-requests` — keep `false` on plain-HTTP LAN deployments or the SPA breaks off-`localhost`; see [Image Uploads & Static Serving](#image-uploads--static-serving) → HTTPS-only headers |
| `PICO_ANNOUNCE_SECRET` | `mushpi-dev-secret` | Shared secret for `POST /v1/pico-units/announce` (min 6 chars; **required in `prod` and `demo`**). A `demo` instance must set it explicitly **and must not use the public development value `mushpi-dev-secret`, which is rejected at boot**; `prod` accepts any value ≥6 chars, including that one. The `mushpi-dev-secret` default applies only outside `prod`/`demo`. |
| `DOCS_ENDPOINT`        | —                   | Optional non-empty Swagger UI path; unset or empty disables the UI and its `-json` document route. Default `contract` in `local`. |
| `DOCS_UI_URL`          | —                   | Optional CORS origin for Swagger UI when docs are enabled.                  |
| `DOCS_USERNAME`        | —                   | Optional basic-auth username, **in every environment**. A non-empty username requires a matching `DOCS_PASSWORD`. |
| `DOCS_PASSWORD`        | —                   | Optional basic-auth password; must accompany a non-empty username. Absent or empty credentials leave enabled docs unauthenticated. |
| `LOGS_LEVEL`           | `info`              | Pino level                                                                    |
| `READINGS_RETENTION_MONTHS` | `6`              | Months of readings to retain before cleanup                                    |
| `MAX_REQUESTS`             | —                  | **Self-hosted profile**, rate limiting **opt-in**: max requests per window (integer ≥ 1). Must be set **together** with `MAX_REQUESTS_TIME` — a partial pair fails at boot. Neither set ⇒ no throttling **and no `X-RateLimit-*` headers at all**. Ignored on the public-demo profile (which always applies its three `VISITOR_*`/`ABUSE_*`/`GLOBAL_*` limiter pairs); see [Guards](#guards) |
| `MAX_REQUESTS_TIME`        | —                  | **Self-hosted profile**: rate-limit window in **milliseconds** (e.g. `60000`), paired with `MAX_REQUESTS` (integer ≥ 1). Note `X-RateLimit-Reset` / `Retry-After` are emitted in **seconds** |
| `VISITOR_MAX_REQUESTS`    | —             | **Public-demo profile**, always on — per-visitor **browse pace**: max requests per window, spanning all endpoints, bucketed by the visitor's forwarded identity. Integer ≥ 1. **Required in `demo`, ignored in every other environment**; set together with `VISITOR_MAX_REQUESTS_TIME`; a public-demo boot missing it fails at startup rather than serving an unprotected instance; see [Guards](#guards) |
| `VISITOR_MAX_REQUESTS_TIME` | —           | **Public-demo profile**: browse-pace window in **milliseconds**; `X-RateLimit-Reset` / `Retry-After` emit in **seconds**. Required in `demo`, ignored elsewhere; paired with `VISITOR_MAX_REQUESTS` |
| `ABUSE_MAX_REQUESTS`      | —             | **Public-demo profile**, always on — per-visitor **refused-change pace**: max requests the `DemoReadOnlyGuard` would refuse per window (own bucket; browsing never spends from it). Integer ≥ 1. Required in `demo`, ignored elsewhere; paired with `ABUSE_MAX_REQUESTS_TIME` |
| `ABUSE_MAX_REQUESTS_TIME` | —             | **Public-demo profile**: refused-change window in **milliseconds**. Required in `demo`, ignored elsewhere; paired with `ABUSE_MAX_REQUESTS` |
| `GLOBAL_MAX_REQUESTS`     | —             | **Public-demo profile**, always on — **whole-instance backstop**: max requests across ALL visitors per window (constant tracker). A flood slows the entire demo and recovers without a restart; `/health` and Pico announcements are exempt. Integer ≥ 1. Required in `demo`, ignored elsewhere; paired with `GLOBAL_MAX_REQUESTS_TIME` |
| `GLOBAL_MAX_REQUESTS_TIME` | —            | **Public-demo profile**: backstop window in **milliseconds**. Required in `demo`, ignored elsewhere; paired with `GLOBAL_MAX_REQUESTS` |

> **Profile scope is carried by the required-when-`demo` rule**, grouped in the `security.demo` config — not by a name prefix: each limiter pair is mandatory on the public-demo profile and optional (and read by no throttler definition) elsewhere. Full mechanics: [Guards](#guards).

> Unknown env keys are tolerated, never fatal: `CustomConfigModule` passes no `validationOptions`, so @nestjs/config validates with its own defaults (`allowUnknown: true`, `abortEarly: false`). That is why the schemaless legacy `PORT` works and why a key removed from the schema — e.g. `APP_HOST` — survives as an ignored leftover in deployed env files instead of breaking boot (pinned in `config.schema.spec.ts`).

> `READINGS_SAFETY_MAX_ROWS` is **not** an env var — it is a hardcoded module constant in `cron.service.ts` (no Joi key, no `CustomConfigService` getter); see [Cron Polling](#cron-polling) → Readings cleanup.

## Config

`CustomConfigService` exposes typed getters grouped by **domain area** — not by "what kind of value" (string, secret, etc.). The `security` getter is reserved for **cross-cutting/infra** concerns (global auth, HTTPS-only header gating, rate limiting, event-loop protection). Domain-specific secrets belong in their own domain getter (e.g., `pico.announceSecret` for Pico-hardware trust, not `security.picoAnnounceSecret`). The `client` getter holds client-domain config — `clientUrl` (the CORS allowed origin, used in local dev) and `distDir` (the served SPA path) — so CORS lives beside the other client concerns rather than in `security`. This keeps domain concerns colocated and prevents the `security` getter from becoming a grab-bag.

**Joi branch conditions — `valid('')` is not `allow('')`, and an unguarded `is:` matches absence.** Two independent traps in the same `when()` construct, both invisible until a boot:
- **The `is` half.** A condition's `is` schema is validated against the referenced value, and Joi short-circuits `undefined` for a non-required schema — so `is: Joi.string().not('')` also matches an **absent** variable, taking the `then` branch on a stock boot (this is what made docs credentials mandatory in prod with the docs endpoint disabled). Write `is: Joi.string().not('').required()`. `Joi.exist()` also rejects absence but counts an *empty string* as present, so it is only safe where emptiness is not a distinct state.
- **The `switch:` multi-branch form.** `.when(ref, { switch: [{ is, then }, …], otherwise })` evaluates entries in order and applies the **first** matching branch; the same definedness rule governs every `is`, so each carries the `.required()` idiom (e.g. `is: Joi.string().valid('prod').required()`) and an absent reference selects no branch.
- **The `otherwise` half.** A branch meant to permit *only* an empty value must use `.valid('')`; `.allow('')` merely *adds* `''` to the accepted set while still accepting every other string, silently reopening the partial-pair hole the rule exists to close.
- Cover both the **absent** and the **empty** case in the config-schema spec — `docs:env` does not render `when` branches, so nothing else surfaces either trap.

## Dependency Remediation Notes

Gotchas from the production-advisory backlog clearance (recursive lockfile refreshes + one `resolutions` pin). Individual advisory remedies are recorded here whether the fix is a `resolutions` **pin** or a lockfile-only **refresh**. Load when touching dependencies, native builds, or the audit/knip gates.

### Native module builds / `node-gyp`

- `better-sqlite3` normally installs **prebuilt binaries** via `prebuild-install`; `node-gyp` is only the source-build **fallback**, invoked when no prebuilt matches the running Node ABI/platform/arch.
- `better-sqlite3` declares `node-gyp` as `npm:latest`, so that dependency **floats**: it currently resolves to **13.0.2** (was 11.2.0). node-gyp 13 no longer depends on `make-fetch-happen` — that drop is what removed the vulnerable `socks -> ip-address` chain from the tree.
- **What to watch:** arm64 / Raspberry Pi and Docker image builds, where the prebuilt path may differ from x64 dev machines. If there is no prebuilt for the target, install falls back to compiling from source through node-gyp 13, which is **untested here**. Symptoms are install-time, not runtime: a much longer `yarn install`, a missing-prebuilt fallback message, or a native-toolchain/Python error — not a runtime failure.
- **What to check:** the install log on the target platform for `prebuild-install` success vs a `node-gyp rebuild` fallback. **Likely remedies:** pin `node-gyp` via `resolutions` to a known-good version (record it below), ensure a native toolchain (python3, make, g++) exists on the build host, or supply a prebuilt for the target.

### `resolutions` pins are permanent maintenance debt

- `resolutions.multer = "2.3.0"` exists because `@nestjs/platform-express@11.2.5` hard-pins `multer: 2.2.0`, which carries **4 advisories (3 high)** — fixed in 2.3.0. **Removal condition:** drop the pin once Nest permits `>= 2.3.0`.
- A `resolutions` entry overrides parents' declared ranges and does not expire — each one needs its rationale and removal condition recorded here (or in its commit message) the day it is added.

### Lockfile-only refreshes (no pin)

- **2026-10-14 — `GHSA-jqcg-44mw-7w3h` (CVE-2026-90711, critical)**: `proxy-addr` IP spoofing via IPv4-mapped IPv6 trust subnets. Path: `@nestjs/platform-express@^11.1.6` → `express@5.2.1` → `proxy-addr@^2.0.7` (the lockfile's sole `proxy-addr` descriptor). **Remedy:** lockfile-only refresh `yarn up -R proxy-addr`, **2.0.7 → 2.0.8** — in-range for `^2.0.7`, so **no pin was added** and `package.json` stayed untouched (`git diff -- package.json` empty at commit time). **Exposure finding:** the vulnerable `proxyaddr.compile()` trust-subnet path is **unreachable** — Express `trust proxy` is deliberately not enabled and no code in `src/` or `test/` consumes `req.ip`/`req.ips`/`X-Forwarded-For` — so real exposure was the development tree only. No removal condition needed (nothing was pinned to remove).
- **2026-10-21 — `GHSA-q3jh-wrc6-jgq8` + `GHSA-8r9p-f939-6h3c` (both high)**: `follow-redirects` credential handling on redirects — array-form headers bypass cross-origin credential stripping, and `sensitiveHeaders` regex escaping can expose credential headers. Path: `axios@1.20.0` → `follow-redirects@^1.16.0` (the lockfile's sole `follow-redirects` descriptor). **Remedy:** lockfile-only refresh `yarn up -R follow-redirects`, **1.16.0 → 1.16.1** — in-range for `^1.16.0`, so **no pin was added** and `package.json` stayed untouched (`git diff -- package.json` empty at commit time). No removal condition needed (nothing was pinned to remove).

### `knip:ci` in the nested-repo sandbox (gitignore hazard — mitigated)

- Knip has no concept of repo boundaries: it walks ancestor directories from the cwd collecting every `.gitignore` it finds and filters its project-file set against the union. Inside the parent `mushroom-pi` orchestrator checkout — whose root `.gitignore` begins with `*` — that makes **every** `mushpi-server` file look ignored: zero sources analysed, and every production dependency reported as a bogus "unused dependency" (exit 1). Git itself never applies a parent repo's ignore to the nested `mushpi-server` repo; only knip's ignore emulation crosses the boundary.
- **Mitigation (in place):** the `knip:ci` script passes `--no-gitignore` — knip 5.x has no config-file equivalent (CLI-only flag). CI's Prune step and the `pre-push` hook both go through `yarn knip:ci`, so they share the fix. Safe here because `knip.json`'s `project` globs are explicit (`src/**/*.ts`, `test/**/*.ts`) and a clean checkout has no gitignored `.ts` under either. An ad-hoc full scan in this sandbox still needs the flag: `yarn knip --no-gitignore`.
- `knip.json` also declares `test/**/*.e2e-spec.ts` as `entry`: knip's jest plugin only reads `testMatch` (never `testRegex`) and cannot discover `test/jest-e2e.json` by filename, so without it all e2e specs report as unused files and `supertest`/`@types/supertest` as unused devDependencies.
- `knip.json` also declares `src/modules/sqlite/data-source.ts` as `entry`: the TypeORM CLI reaches it only through the **compiled** path in the `typeorm` script (`cli.js -d dist/src/modules/sqlite/data-source.js`), which knip cannot trace from any `src/` import, so without the entry the TypeORM CLI data source reports as an unused file.
- `knip.json` also declares `spec/generators/openapi.generator.ts` as `entry`: it is a real executable entry (the `spec:export` compiled-output run), like `data-source.ts`. Its `project` globs cover only `src/**`/`test/**`, so without this entry anything imported solely by the generator — e.g. `applyThrowawayRuntimePaths()` — reports as an unused file.

## Scripts — Operational Notes

Per-script commentary trimmed from the core Scripts table (the table keeps only the self-documenting tags):

- **`lint`** — `eslint --fix`: rewrites files on every run (autofixing); the glob covers only `.ts`.
- **lint gotcha — Omit-style destructuring**: the repo's `@typescript-eslint/no-unused-vars` options list no `ignoreRestSiblings`, and the plugin default is `false`, so `const { path, ...rest } = x` fails lint with `'path' is defined but never used`. Prefix the dropped binding instead — `const { path: _path, ...size } = x` — the configured `varsIgnorePattern: '^_'` admits it. Worked example: `MonitoringService.redactDatabaseStatus()`.
- **`lint:ci`** — same pass with no `--fix` and `--max-warnings=0`: in CI it fails on warnings, never rewrites.
- **`format`** — `prettier` over `.ts` only; agent instruction `.md` files are deliberately excluded from the write path.
- **`test:debug`** — runs Jest under the Node inspector, in-band (single worker, `--runInBand`).
- **`audit:prod`** — `yarn npm audit` over the production dependency graph, deprecations excluded (`--no-deprecations`). Informational: findings do not fail the script.
- **`audit:ci`** — `audit:prod` plus `--severity high`: the gating variant — Yarn's own exit code fails the run on high-severity production findings (`pre-push` runs it first).
- **`knip:ci`** — unused-production-dependency check; the `--no-gitignore` flag is the nested-repo gitignore-hazard mitigation — full gotcha in [Dependency Remediation Notes](#dependency-remediation-notes).

## Tooling & Style Deviations

Known, deliberate deviations from the loaded skills — do not "fix" them silently, and do not replicate them elsewhere:

- **TypeScript strictness** (vs `nodejs-typescript-base`, which expects full `strict`): `tsconfig.json` sets `strictNullChecks: false` and `noImplicitAny: false` (also `strictBindCallApply: false` and `noFallthroughCasesInSwitch: false`; no `strict` base is enabled). `tsconfig.build.json` only extends it — no override, so build and tests share the loose settings. Consequence: the compiler does **not** flag implicit `undefined` returns or untyped params — e.g. `MonitoringService.checkServiceStatus()`/`checkDatabaseStatus()` fall through their `switch` `default` and resolve to `undefined` despite a declared `Promise<Status>` return type, and `tsc` stays green. Guard nullability explicitly in new code; do not rely on the checker.
- **Thin controllers** (vs `nestjs-backend`, "controllers stay thin"): `settings.v1.controller.ts` `updateSettings()` contains branching dispatch — `if (dto.timezone !== undefined) → svc.setTimezone(...)`, else `→ svc.getSettings()`. Accepted as a known deviation: it is partial-PATCH field routing only, with no persistence logic in the controller. New controllers must still delegate every decision to the service.

## Raw SQL

For **any raw SQL** — `repository.query()` (e.g., window functions like `NTILE`) **and QueryBuilder string predicates** (e.g. `.where('ts < :cutoff', …)`) — the `ts` column (TypeORM `datetime` type) is stored as `YYYY-MM-DD HH:MM:SS.SSS` — no `T` and no `Z`. ISO strings from `Date.toISOString()` compare incorrectly via lexicographic ordering against this format (ASCII `' '` sorts below `'T'`, so a stored datetime on the cutoff calendar day compares less than an ISO cutoff). Any place an ISO/JS string is bound against a `ts`-style SQLite datetime column must be converted first. Always convert:

- **Input**: `Date.toISOString()` → `YYYY-MM-DD HH:MM:SS.SSS` before passing to WHERE clauses.
- **Output**: query result timestamps → ISO string (`replace(' ', 'T') + 'Z'`) before returning to callers.
- **Exempt**: TypeORM `Date` find-operators (`Between`, `LessThan`, `LessThanOrEqual`, `MoreThan`, `MoreThanOrEqual`) bind `Date` objects, which the driver converts safely — prefer them; the trap only exists where a raw *string* is bound or inlined against a datetime column.

The private `toSqliteDatetime()` method in `ReadingsService` (`src/modules/readings/readings.service.ts`) handles input conversion. Raw query results come back with SQLite-native format — convert in the service before returning DTOs. **Concrete regression (readings retention cleanup)**: the nightly retention cleanup `deleteOlderThanMonths()` bound `cutoff.toISOString()` in a QB string predicate and silently deleted the entire cutoff calendar day (up to ~24 h of readings); it now binds `toSqliteDatetime(cutoff)` — pinned by the boundary test in `test/pico-unit-id-readings.e2e-spec.ts`.

**Aggregation response shape** (`GET …/readings`, unit and batch): `AggregatedReadingsResponseDto` { `data`: `AggregatedReadingDto[]` — per-bucket avg/min/max of temperature/humidity, relay on-counts, and the setpoints active in the bucket — `points`: requested bucket count, `actualReadings`: raw row count in the window }. There is **no** `AggregatedReading` class — the bucket DTO is `AggregatedReadingDto` (`readings.dto.ts`).

## Build Output & Entrypoint

`nest build` emits `dist/src/main.js` — **not** `dist/main.js`. Cause: `docs/` and `spec/` (generator sources) are in the tsc compile set, which pushes the inferred `rootDir` to the project root. Both `yarn start:prod` and the Docker `CMD` use that path; the smoke-boot command in [Local Verification](#local-verification-smoke-boot-without-disturbing-a-live-instance) reflects it. Core (`AGENTS.md`) carries the path only in the Scripts table (`start:prod` row); this section owns the *why*.

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
- **Joi-defaulted env vars freeze at first module-graph import — toggling one per-app needs `jest.resetModules()` + dynamic import.** `@nestjs/config` v4 runs `validationSchema` synchronously inside `ConfigModule.forRoot()`, i.e. when `src/modules/config/config.module.ts` is first *imported* — not when an app is created. Keys Joi resolves with a default (e.g. `APP_HTTPS_ENABLED`, `SQLITE_LOG`) are then cached in the validated-env map, so a later `process.env.X = 'true'` + `createTestApp()` still reads the stale import-time value. Keys that are *absent* from validation output (`.optional()` with no default, e.g. `APP_SECRET`, `ERRORS_DETAIL`) fall through to a live `process.env` read and can be flipped with plain mutations. To exercise both states of a defaulted flag, set the env, then re-import the fixture in the same spec (`test/security-headers.e2e-spec.ts` pattern):
  ```ts
  process.env.APP_HTTPS_ENABLED = 'true';
  jest.resetModules();
  const setup = await import('./test-setup');
  const app = await setup.createTestApp();
  ```
- **Per-app rate-limit env flips need the same `jest.resetModules()` + dynamic-import dance, and the value must be set BEFORE the import.** `MAX_REQUESTS`/`MAX_REQUESTS_TIME` are `.optional()` with **no** Joi default, so when absent they are missing from the validated-env map and `ConfigService.get()` falls through to a **live, uncoerced `process.env` read**: a var assigned *after* the first module-graph import reaches the `ThrottlerModule.forRootAsync()` factory as a **string**, which the defensive `Number.isSafeInteger()` check rejects ⇒ the app silently behaves as unconfigured (no headers, no 429). Only a value present at import time goes through Joi validation + numeric conversion. So: set/delete both vars, **then** `jest.resetModules()`, **then** `await import('./test-setup')`; restore originally-absent vars with `delete process.env.X` (never assign `undefined`). Close every fresh app (`closeTestApp`) between cases so the per-app in-memory `ThrottlerStorageService` hit counts reset — see `test/rate-limit-headers.e2e-spec.ts`.
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
- **`expect(value, 'message')` does not exist in Jest 30 — carry failure text in an object key instead.** The Playwright/Chai-style second argument is not Jest's API and the custom message is *never* applied: `@types/jest`'s `Expect` call signature is single-arg, so a 2-arg call fails to compile under ts-jest (`TS2554: Expected 1 arguments, but got 2`), and the installed `expect@30.2.0` throws `Expect takes at most one argument.` at the call itself (verified empirically against the installed package). The idiom the `deleteOlderThanMonths()` boundary test in `test/pico-unit-id-readings.e2e-spec.ts` uses is a boolean-equality assertion whose **keys carry the message**, so the descriptive text surfaces verbatim in the failure diff:
  ```ts
  expect({
    'row at cutoff must survive deleteOlderThanMonths (strict <)':
      (await repo.findOneBy({ id: atCutoff.id })) !== null,
  }).toEqual({ 'row at cutoff must survive deleteOlderThanMonths (strict <)': true });
  ```
- **Plain-`Date` fixtures are byte-faithful for boundary tests.** The better-sqlite3 driver stores a JS `Date` bound to a `datetime` column as exactly `YYYY-MM-DD HH:MM:SS.SSS` — the stored format already documented in [Timezone](#timezone) — which is byte-identical to what `toSqliteDatetime()` emits. That identity is *why* seeding a fixture with a plain `Date` is faithful for boundary tests against `ts`-style columns (e.g. `deleteOlderThanMonths()`'s strict `<` cutoff): the stored row text and the string the query binds land in the same format, with no ISO-`T`-vs-space skew.
- **Fake timers are safe in the e2e path**: better-sqlite3 is fully synchronous and native microtasks (promises) are unaffected by sinon-style fake timers, so `jest.useFakeTimers({ now: ... })` freezes cutoff arithmetic without stalling awaited DB writes or supertest flows — restore with `jest.useRealTimers()` in a `finally`.
- **Editor jest is `on-save`, never `watch`** — `.vscode/settings.json` wires vscode-jest to `yarn test:e2e` with `jest.runMode: "on-save"`. It must not be changed to `watch`: `nest-cli.json`'s `deleteOutDir: true` rewrites `dist/` on every dev-server start/restart (`nest start --watch`), which feeds the jest watch session and auto-runs the full e2e suite at editor session start. `jest-e2e.json`'s `watchPathIgnorePatterns` (`/node_modules/`, `/dist/`, `/coverage/`, `/test/coverage/`, `/test/data-test/`) is watch-mode-only defence-in-depth for manual `--watch` runs — inert for normal `yarn test:e2e` executions.

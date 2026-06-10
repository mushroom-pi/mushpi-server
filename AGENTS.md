# mushpi-server — Agent Instructions

NestJS 11 backend for mushroom growing control system. Runs on Raspberry Pi, polls Pico units via cron, stores readings in SQLite.

## Verification Commands

**After every code change batch, run these in order:**

```bash
yarn build   # Must exit 0
yarn lint    # Must have no new errors
yarn start   # Must boot without exceptions
```

Do not ask permission to run these — just execute them.

## Critical Conventions

### Cross-module imports
Use absolute paths: `import { Recipe } from 'src/modules/recipes/recipes.entity'`
Never use relative `../` paths across module boundaries.

### Type precision
`temperature_target` and `humidity_target` are **always integers**:
- Use `@IsInt()` (not `@IsNumber()`)
- TypeORM column: `{ type: 'integer' }`
- Swagger: `{ type: 'integer' }`
- Never use floats for these fields

### Route parameters
Use `:resourceId` (not `:id`) — consistent with `:picoUnitId`, `:batchId`, `:recipeId`

### Constants
All domain limits (validator min/max, string lengths, pagination defaults) live in `src/common/constants/`. Never use inline magic numbers in DTOs, entities, or services.

### DRY enforcement
If two methods share the same try/catch, loop body, or conditional chain, extract the common part into a private helper method **before finishing the task** — not as a follow-up.

### Controller responsibility
Controllers contain **only** endpoint definitions and Swagger documentation. All business logic (validation, file operations, conditional flows) goes into:
- `*.service.ts` — core business logic
- `*.middleware.ts` — request preprocessing, entity loading
- `*.interceptor.ts` — request/response transformation, file upload handling
- `*.guard.ts` — authorization checks

Never nest logic like `if (condition) { ... }` or private helper methods in controllers.

### Interface and type exports
Export interfaces/types to separate `*.interfaces.ts` or `*.types.ts` files **only** if they're imported by multiple files. Otherwise:
- Inline the type in the method signature: `method(): { isUrl: boolean; value: string }`
- Define it locally within the file if needed for clarity

Never export a type that's only used once in the same file.

## Module Structure

Each feature module has:
- `*.module.ts`, `*.service.ts`, `*.entity.ts`, `*.dto.ts`
- Controllers split into `controllers/` subdirectory:
  - `resource.controller.ts` (collection routes)
  - `resource-id.controller.ts` (single-item routes)
  - `resource-id-sub.controller.ts` (nested sub-resources)

### Service update pattern
`update()` accepts pre-loaded entity + DTO: `update(recipe: Recipe, dto: UpdateRecipeDto)`
Entity is loaded by middleware, passed directly to service.

### Virtual getters
Computed properties (like Batch `status`) need **both** decorators:
```typescript
@Expose()        // For serialization
@ApiProperty()   // For Swagger
```
Neither alone is sufficient.

## E2E Testing

**Jest config constraints** (`test/jest-e2e.json`):
- `forceExit: true` — cron timers survive `app.close()`, Jest hangs without this
- `maxWorkers: 1` — all tests share one SQLite file, parallel writes cause lock contention

**Axios mocking gotcha:**
```typescript
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// In beforeEach:
mockedAxios.isAxiosError = jest.fn(
  (err: any) => err?.isAxiosError === true,
) as any;
```
Auto-mock makes `isAxiosError` return `undefined`, breaking `isNetworkError()` in `http-fallback.ts`.

**ClassSerializerInterceptor required:**
```typescript
app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
```
Without it, `@Expose()` virtual getters are omitted from responses.

**Test isolation:**
- Each test suite uses unique `host:port` for PicoUnit seeds (unique constraint)
- Call `clearX()` fixture helpers in `beforeEach` for every entity type touched

## Batch Status Computation

`status` is computed at runtime from `start_at`/`finish_at`, not stored:
- `'planned'`: `start_at > now`
- `'in-progress'`: `(finish_at IS NULL OR finish_at > now) AND start_at < now`
- `'finished'`: `finish_at < now`

## Entity Registration

New entities must be registered in **both**:
1. `src/modules/sqlite/data-source.ts` (TypeORM CLI)
2. `TypeOrmModule.forFeature([Entity])` in the module (runtime)

Both must stay in sync. `autoLoadEntities: true` alone is insufficient.

## Selective Relation Loading

List methods use different relation configs to avoid redundant data:
- `list()`: loads all relations (general list)
- `listForPicoUnitId()`: loads only `recipe` (pico_unit redundant from URL)
- `listForRecipeId()`: loads only `pico_unit` (recipe redundant from URL)

Implement via private `listInternal()` with optional relation parameters.

## Data Integrity

- Snapshot copy over live reference: when linking template/recipe to record, copy values at creation time
- Editing template must never alter historical records
- FK references used as templates are immutable after creation (omit from UpdateDto)
- SQLite requires `PRAGMA foreign_keys = ON` (already enabled in `sqlite.module.ts`)

import { mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Throwaway base directory for spec-generation runtime artifacts. Lives in
 * the OS temp dir (never `data/`), so nothing here can collide with the
 * configured database or log destinations. Nothing is ever cleaned up —
 * the whole tree is disposable by design.
 */
const THROWAWAY_BASE_DIR = join(tmpdir(), 'mushpi-server-spec-gen');

/**
 * Forces `SQLITE_PATH` and `LOGS_PATH` to throwaway locations under the OS
 * temp dir so booting the app to generate the OpenAPI spec can never open the
 * configured database, never hand real Pico units to the cron startup sweep,
 * and never write into the real log destinations.
 *
 * The assignment is UNCONDITIONAL (not `??=`): spec generation never needs
 * real data, and @nestjs/config merges `process.env` OVER the `envFilePath`
 * values before Joi validation — so assigning before the config snapshot is
 * taken displaces any shell-exported or `.env` live path.
 *
 * `mkdirSync` first: better-sqlite3 fails when the parent directory is
 * missing.
 */
export function applyThrowawayRuntimePaths(): void {
  mkdirSync(THROWAWAY_BASE_DIR, { recursive: true });
  process.env.SQLITE_PATH = join(THROWAWAY_BASE_DIR, 'spec-gen.sqlite');
  process.env.LOGS_PATH = join(THROWAWAY_BASE_DIR, 'logs');
}

// Apply on import too — this is the load-bearing half. @nestjs/config runs
// its Joi validation in the synchronous prefix of `ConfigModule.forRoot()`,
// i.e. at the first IMPORT of `src/modules/config/config.module.ts` (decorator
// metadata evaluation), and the validated snapshot wins over any later
// `process.env` write — same freeze documented in REFERENCE.md §E2E Gotchas.
// A call from the generator's IIFE body runs only after every top-level
// `require` has resolved, which would be too late. Therefore the generator
// MUST keep importing this module BEFORE `src/modules/app.module` (the
// prettier import sorter guarantees it: `src/common/…` sorts before
// `src/modules/…`). See REFERENCE.md §Spec Tooling Internals.
applyThrowawayRuntimePaths();

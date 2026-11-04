import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { applyThrowawayRuntimePaths } from './throwaway-runtime-paths';

const BASE_DIR = join(tmpdir(), 'mushpi-server-spec-gen');

// Sentinel values simulating a live deployment: a `.env`/shell-provided real
// DB path and real log directory. A `??=` variant (or any no-op) would leave
// these in place and every test below would fail — that is what makes this
// spec bite.
const SENTINEL_SQLITE_PATH = join(tmpdir(), 'sentinel-live.sqlite');
const SENTINEL_LOGS_PATH = join(tmpdir(), 'sentinel-logs');

describe('applyThrowawayRuntimePaths', () => {
  const originalSqlitePath = process.env.SQLITE_PATH;
  const originalLogsPath = process.env.LOGS_PATH;

  afterEach(() => {
    // Per-file env containment (REFERENCE.md §E2E Gotchas) — restore whatever
    // this worker observed before the helper ran; delete when absent.
    if (originalSqlitePath === undefined) delete process.env.SQLITE_PATH;
    else process.env.SQLITE_PATH = originalSqlitePath;
    if (originalLogsPath === undefined) delete process.env.LOGS_PATH;
    else process.env.LOGS_PATH = originalLogsPath;
  });

  it('unconditionally displaces a pre-set live SQLITE_PATH to the throwaway temp path', () => {
    process.env.SQLITE_PATH = SENTINEL_SQLITE_PATH;

    applyThrowawayRuntimePaths();

    expect(process.env.SQLITE_PATH).toBe(join(BASE_DIR, 'spec-gen.sqlite'));
  });

  it('unconditionally displaces a pre-set live LOGS_PATH to the throwaway temp path', () => {
    process.env.LOGS_PATH = SENTINEL_LOGS_PATH;

    applyThrowawayRuntimePaths();

    expect(process.env.LOGS_PATH).toBe(join(BASE_DIR, 'logs'));
  });

  it('places both paths under os.tmpdir()/mushpi-server-spec-gen, never a hardcoded /tmp', () => {
    process.env.SQLITE_PATH = SENTINEL_SQLITE_PATH;
    process.env.LOGS_PATH = SENTINEL_LOGS_PATH;

    applyThrowawayRuntimePaths();

    expect(process.env.SQLITE_PATH?.startsWith(`${tmpdir()}/`)).toBe(true);
    expect(process.env.LOGS_PATH?.startsWith(`${tmpdir()}/`)).toBe(true);
    expect(existsSync(BASE_DIR)).toBe(true);
  });

  it('never points at repo-relative live paths (data/ must stay untouched)', () => {
    applyThrowawayRuntimePaths();

    expect(process.env.SQLITE_PATH).not.toContain('data/app.sqlite');
    expect(process.env.LOGS_PATH).not.toBe('data/logs');
  });

  it('applies on IMPORT alone, before any explicit call — the mechanism that beats the config snapshot', async () => {
    // Fresh module registry, sentinel set first: the static import above
    // already ran once, so only a re-import re-fires the module-level side
    // effect. If the guard were only callable-from-body (??= or no
    // side-effect export), the sentinels would survive the import untouched.
    process.env.SQLITE_PATH = SENTINEL_SQLITE_PATH;
    process.env.LOGS_PATH = SENTINEL_LOGS_PATH;

    jest.resetModules();
    await import('./throwaway-runtime-paths');

    expect(process.env.SQLITE_PATH).toBe(join(BASE_DIR, 'spec-gen.sqlite'));
    expect(process.env.LOGS_PATH).toBe(join(BASE_DIR, 'logs'));
  });
});

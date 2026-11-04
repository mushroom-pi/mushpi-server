import { Logger } from '@nestjs/common';

import { createHash } from 'crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';

import { CustomConfigService } from 'src/modules/config/config.service';

import { DEMO_OWNERSHIP_MARKER_FILENAME, cleanStart } from './clean-start';

/**
 * Unit coverage of the clean-start decision matrix (adopt / wipe / refuse)
 * against real filesystem fixtures under `/tmp/opencode/`. Only the
 * validated-config getters are stubbed — the function receives
 * `CustomConfigService` and reads `sqlite.database` / `upload.imageDir`,
 * knowing nothing about profiles; the demo-only gate lives at the call site
 * in `main.ts`, and the bootstrap ordering is pinned end-to-end in
 * `test/clean-start.bootstrap.e2e-spec.ts`.
 */

/** Where throwaway trees live (pre-created, disposable — never `data/`). */
const TMP_BASE = '/tmp/opencode';

/**
 * Byte-for-byte snapshot of a tree: every directory entry and every file's
 * SHA-256. A refusal must leave this list identical — no schema written
 * into the refused volume, no marker created, nothing deleted.
 */
function snapshotTree(root: string): string[] {
  const walk = (dir: string, acc: string[]): string[] => {
    if (!existsSync(dir)) return acc;
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        acc.push(`${full}/`);
        walk(full, acc);
      } else {
        acc.push(`${full}=${sha256(readFileSync(full))}`);
      }
    }
    return acc;
  };
  return walk(root, []);
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** Minimal `CustomConfigService` stand-in: the two getters cleanStart reads. */
function fakeConfig(dbPath: string, imageDir: string): CustomConfigService {
  return {
    sqlite: { database: dbPath },
    upload: { imageDir },
  } as unknown as CustomConfigService;
}

describe('cleanStart', () => {
  let root: string;
  let dataDir: string;
  let dbPath: string;
  let markerPath: string;
  let imageDir: string;
  let config: CustomConfigService;

  beforeAll(() => {
    mkdirSync(TMP_BASE, { recursive: true });
  });

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    root = mkdtempSync(join(TMP_BASE, 'mushpi-clean-start-spec-'));
    dataDir = join(root, 'data');
    mkdirSync(dataDir, { recursive: true });
    dbPath = join(dataDir, 'app.sqlite');
    markerPath = join(dataDir, DEMO_OWNERSHIP_MARKER_FILENAME);
    imageDir = join(dataDir, 'images');
    config = fakeConfig(dbPath, imageDir);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  /** Populate a "demo-owned after a first run" volume: marker + DB + sidecars + images. */
  function seedOwnedVolume(): void {
    mkdirSync(join(imageDir, 'recipes'), { recursive: true });
    writeFileSync(dbPath, 'fake-sqlite-bytes');
    writeFileSync(`${dbPath}-wal`, 'wal-bytes');
    writeFileSync(`${dbPath}-shm`, 'shm-bytes');
    writeFileSync(`${dbPath}-journal`, 'journal-bytes');
    writeFileSync(join(imageDir, 'recipes', 'r1.png'), 'png-bytes');
    writeFileSync(markerPath, 'owned\n');
  }

  describe('adopt', () => {
    it('writes only the marker on a pristine volume', () => {
      cleanStart(config);

      expect(existsSync(markerPath)).toBe(true);
      // Nothing else exists: no database file, no image tree.
      expect(existsSync(dbPath)).toBe(false);
      expect(existsSync(imageDir)).toBe(false);
      expect(readdirSync(dataDir)).toEqual([DEMO_OWNERSHIP_MARKER_FILENAME]);
    });

    it('adopts a volume whose image dir exists but is empty, leaving it untouched', () => {
      mkdirSync(imageDir, { recursive: true });

      cleanStart(config);

      expect(existsSync(markerPath)).toBe(true);
      expect(existsSync(dbPath)).toBe(false);
      expect(existsSync(imageDir)).toBe(true);
      expect(readdirSync(imageDir)).toEqual([]);
      expect([...readdirSync(dataDir)].sort()).toEqual(
        [DEMO_OWNERSHIP_MARKER_FILENAME, 'images'].sort(),
      );
    });
  });

  describe('wipe', () => {
    it('removes the database, every sidecar and the image tree, and keeps the marker', () => {
      seedOwnedVolume();

      cleanStart(config);

      expect(existsSync(dbPath)).toBe(false);
      expect(existsSync(`${dbPath}-wal`)).toBe(false);
      expect(existsSync(`${dbPath}-shm`)).toBe(false);
      expect(existsSync(`${dbPath}-journal`)).toBe(false);
      expect(existsSync(imageDir)).toBe(false);
      // The marker survives so the next start wipes again.
      expect(existsSync(markerPath)).toBe(true);
      expect(readFileSync(markerPath, 'utf8')).toBe('owned\n');
    });

    it('leaves the database file ABSENT afterwards — it creates nothing in its place', () => {
      seedOwnedVolume();

      cleanStart(config);

      // A wipe must not recreate or touch the file: the later initialize()
      // opens a genuinely fresh database. The marker being the ONLY surviving
      // entry pins that nothing else was written in the volume.
      expect(snapshotTree(root)).toEqual([
        `${dataDir}/`,
        `${markerPath}=${sha256(readFileSync(markerPath))}`,
      ]);
    });
  });

  describe('refuse (fail-closed)', () => {
    it('throws on an unmarked pre-existing database and leaves the tree byte-for-byte unchanged', () => {
      mkdirSync(join(imageDir, 'recipes'), { recursive: true });
      writeFileSync(dbPath, 'somebody-elses-data');
      writeFileSync(`${dbPath}-journal`, 'journal');
      writeFileSync(join(imageDir, 'recipes', 'r1.png'), 'png-bytes');
      const before = snapshotTree(root);

      expect(() => cleanStart(config)).toThrow(/Clean start refused/);

      // The regression the first attempt shipped: a refusal must not write a
      // schema into the volume it refused, must not create the marker, and
      // must not delete anything.
      expect(snapshotTree(root)).toEqual(before);
      expect(existsSync(markerPath)).toBe(false);
    });

    it('names the database path and the missing marker in the error', () => {
      writeFileSync(dbPath, 'somebody-elses-data');

      let message = '';
      try {
        cleanStart(config);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain(dbPath);
      expect(message).toContain(markerPath);
    });

    it('throws on an unmarked non-empty image directory even when the database is absent', () => {
      mkdirSync(imageDir, { recursive: true });
      writeFileSync(join(imageDir, 'stray.png'), 'png');
      const before = snapshotTree(root);

      expect(() => cleanStart(config)).toThrow(/Clean start refused/);

      expect(snapshotTree(root)).toEqual(before);
      expect(existsSync(markerPath)).toBe(false);
    });
  });

  describe('consecutive starts', () => {
    it('adopts on the first call and wipes on the second', () => {
      cleanStart(config); // adopt
      expect(existsSync(markerPath)).toBe(true);

      // The boot that adopted creates the database + image tree.
      writeFileSync(dbPath, 'fresh');
      mkdirSync(join(imageDir, 'batches'), { recursive: true });
      writeFileSync(join(imageDir, 'batches', 'b1.png'), 'png');

      cleanStart(config); // wipe — marker was present

      expect(existsSync(dbPath)).toBe(false);
      expect(existsSync(imageDir)).toBe(false);
      expect(existsSync(markerPath)).toBe(true);
    });
  });
});

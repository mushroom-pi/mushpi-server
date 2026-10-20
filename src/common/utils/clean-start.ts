import { Logger } from '@nestjs/common';

import * as fs from 'fs';
import * as path from 'path';

import { CustomConfigService } from 'src/modules/config/config.service';

/**
 * Name of the file that marks a SQLite database + upload volume as
 * demo-owned — i.e. state this server may clear without further consent.
 *
 * The name is content, not a namespace: it asserts ownership of the volume
 * for the demo profile's clean-start, nothing else. Placement is beside the
 * database file (same directory), never inside it or inside the image tree.
 */
export const DEMO_OWNERSHIP_MARKER_FILENAME = '.demo-owned';

/**
 * SQLite sidecar files that must disappear with the database file. Journal
 * mode is `delete` (rollback journal, `-journal`) for better-sqlite3's
 * default configuration — `prepareDatabase` in `sqlite.module.ts` sets only
 * `foreign_keys = ON` — but all three sidecars are enumerated defensively so
 * a future journal-mode change cannot leave a survivor behind the wipe.
 */
const SQLITE_SIDECAR_SUFFIXES = ['-wal', '-shm', '-journal'] as const;

const logger = new Logger('CleanStart');

/**
 * Clean start for a demo volume: wipe the database and the image tree when
 * the volume is demo-owned, adopt a pristine one, and refuse anything else.
 *
 * Currently invoked ONLY under the demo profile (`config.isDemo` — the gate
 * lives at the call site in `main.ts`; this module knows nothing about
 * profiles and reads only validated config getters). The demo instance is
 * public, disposable and re-seeded on every boot: a clean start there is a
 * DELIBERATE EXCEPTION to the promise that self-hosted users make of this
 * server — "your data survives restarts and updates." On every other volume
 * the same promise holds, which is exactly why an UNMARKED volume is refused
 * rather than wiped (fail-closed): nothing here deletes a database the
 * server has not itself claimed.
 *
 * TIMING IS LOAD-BEARING: this must run while TypeORM is NOT yet connected
 * — `manualInitialization: true` (`sqlite.module.ts`) defers
 * `DataSource.initialize()` past `NestFactory.create()`, and `main.ts` calls
 * this function BEFORE its own explicit `initialize()`. That means the
 * decision sees true on-disk state (no provider factory has created or
 * opened the file), and an unlink removes a file with NO open handle. The
 * reverted first attempt ran this after the eager connect and was broken
 * three ways at once: the adoption path was unreachable (boot created the
 * file, then refused its own file), the refusal path wrote a schema into
 * the volume it refused, and the wipe unlinked a file under an open handle,
 * leaving the process serving stale rows from a deleted inode. Every read
 * and write below happens in that deferred window.
 *
 * Decision matrix (marker = `DEMO_OWNERSHIP_MARKER_FILENAME`, beside the
 * resolved database file):
 * - marker present            → WIPE: unlink the database plus its `-wal` /
 *   `-shm` / `-journal` sidecars, recursively remove the image directory.
 *   The marker SURVIVES so the next start wipes again. The database file is
 *   left ABSENT afterwards — nothing here recreates or touches it — so the
 *   later `initialize()` opens a genuinely fresh one.
 * - marker absent, database
 *   absent, image dir absent
 *   or empty                  → ADOPT: write the marker; this volume is now
 *   demo-owned.
 * - marker absent AND (the
 *   database exists OR the
 *   image dir is non-empty)   → REFUSE: throw, failing closed. Wipe
 *   nothing, create nothing. A pre-populated, unclaimed volume is someone
 *   else's data; the caller must surface this and stop.
 */
export function cleanStart(config: CustomConfigService): void {
  const database = config.sqlite.database;
  const imageDir = config.upload.imageDir;

  const dbPath = path.resolve(database);
  const markerPath = path.join(
    path.dirname(dbPath),
    DEMO_OWNERSHIP_MARKER_FILENAME,
  );

  const markerExists = fs.existsSync(markerPath);
  const dbExists = fs.existsSync(dbPath);
  const imageDirPopulated = isPopulatedDir(imageDir);

  if (markerExists) {
    if (dbExists) {
      fs.unlinkSync(dbPath);
      for (const suffix of SQLITE_SIDECAR_SUFFIXES) {
        const sidecar = `${dbPath}${suffix}`;
        if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
      }
    }
    fs.rmSync(imageDir, { recursive: true, force: true });
    logger.warn(
      `Clean start: demo-owned volume wiped — database "${dbPath}" (+ sidecars) and image directory "${imageDir}" removed; "${DEMO_OWNERSHIP_MARKER_FILENAME}" kept for the next start`,
    );
    return;
  }

  if (!dbExists && !imageDirPopulated) {
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(
      markerPath,
      `mushpi-server demo-owned volume marker\n` +
        `Presence authorizes a clean start to wipe this directory's database and image tree.\n`,
    );
    logger.log(
      `Clean start: adopting pristine volume — wrote "${DEMO_OWNERSHIP_MARKER_FILENAME}" next to "${dbPath}"; future starts may wipe it`,
    );
    return;
  }

  const reason =
    `Clean start refused: database "${dbPath}" is ${dbExists ? 'pre-existing' : 'absent'} but the demo ownership marker "${markerPath}" is missing` +
    (imageDirPopulated
      ? ` and the image directory "${imageDir}" is not empty`
      : '') +
    `. This volume was never adopted by this server, so its contents are treated as someone else's data and nothing was wiped or created. Starting clean here would delete persisted state — use a fresh volume, or clear it manually once, and let the next boot adopt it.`;
  logger.error(reason);
  throw new Error(reason);
}

/** True when the directory exists and holds at least one entry. */
function isPopulatedDir(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir).length > 0;
}

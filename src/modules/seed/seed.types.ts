/**
 * Typed shapes for the server-owned demo seed data (`seed-data/*`). The
 * gate (`provenance/provenance.check.ts`) decides which entries actually reach the
 * database; the roster entries describe how a simulated demo deployment
 * should look on first boot.
 */

/**
 * Attribution record for a cultivated source. `verified` is a human
 * verdict on the researched values — an entry that has not been verified
 * is excluded from seeding but kept in the data so the provenance report
 * can name it.
 */
export interface ProvenanceRecord {
  sourceTitle: string;
  sourceUrl: string;
  /** Access date of the research pass, `YYYY-MM-DD`. */
  accessedAt: string;
  license?: string;
  verified: boolean;
  verificationNote?: string;
  /** Species photo hotlinked as the recipe image, with its own licence. */
  image?: { sourceUrl: string; license?: string };
}

export interface RecipeSeedEntry {
  name: string;
  species: string;
  temperatureTarget: number;
  humidityTarget: number;
  durationDays: number;
  notes: string;
  /** Research lineage: carried over from an earlier hand-built catalogue, or added by this dataset. */
  origin?: 'existing' | 'new';
  provenance: ProvenanceRecord;
}

/**
 * A simulated unit in the demo roster. `offline` marks the deliberately
 * unreachable unit (renders via the existing status derivation; never
 * gets readings); `drift` selects the wandering walk profile for the
 * readings history.
 */
export interface UnitSeedEntry {
  handle: string;
  name: string;
  description: string;
  face_color?: string | null;
  mac?: string;
  ip?: string;
  micropython_version?: string;
  /** Strict SemVer (`MAJOR.MINOR.PATCH`) — the announce DTO bound. */
  firmware_version?: string;
  api_version?: number;
  board?: string;
  board_total_mem_byte?: number;
  board_total_fs_byte?: number;
  board_cpu_freq_mhz?: number;
  offline?: boolean;
  drift?: boolean;
  /**
   * Setpoints for the readings walk when the unit has no in-progress
   * batch at seed time; otherwise the active batch's targets are used.
   */
  fallbackSetpoint?: { temperature: number; humidity: number };
}

export type BatchSeedStatus = 'finished' | 'in-progress' | 'planned';

/**
 * Batch offsets are relative to seed time so statuses stay correct after
 * any reset: `finished` supplies `finishOffsetDays` (negative; start is
 * derived as finish − recipe duration), `in-progress` supplies both
 * (start negative, finish positive or null = open-ended), `planned`
 * supplies `startOffsetDays` (positive; finish is derived).
 */
export interface BatchSeedEntry {
  unitHandle: string;
  recipeName: string;
  status: BatchSeedStatus;
  description: string;
  startOffsetDays?: number;
  finishOffsetDays?: number | null;
  /**
   * External harvest-photo URLs attached at module load from the species
   * lookup in `batch-images.ts` (derived from
   * `../provenance/batch-harvest-images.json` — never retyped here).
   * Absent for species the dataset lists as `missing` — no substitution.
   */
  images?: string[];
}

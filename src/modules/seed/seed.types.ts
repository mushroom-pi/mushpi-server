/**
 * Typed shapes for the server-owned demo seed data (`seed-data/*`). The
 * gate (`provenance/provenance.check.ts`) decides which entries actually reach the
 * database; the roster entries describe how a simulated demo deployment
 * should look on first boot.
 */
import type { BatchStatus } from 'src/modules/batches/batches.type';
import type { PicoUnit } from 'src/modules/pico-units/pico-unit.entity';

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
 * A simulated unit in the demo roster. Entity-backed fields derive from
 * `PicoUnit` (type-only, erased at compile time) so an entity rename or
 * type change breaks the seed build instead of drifting silently.
 * `handle`, `name` and `description` are required at seed-authoring time
 * even where the entity allows them to be absent. `offline` marks the
 * deliberately unreachable unit (renders via the existing status
 * derivation; never gets readings); `drift` selects the wandering walk
 * profile for the readings history.
 */
export type UnitSeedEntry = Required<
  Pick<PicoUnit, 'handle' | 'name' | 'description'>
> &
  // Entity-reported metadata. `firmware_version` is strict SemVer
  // (`MAJOR.MINOR.PATCH`) — the announce DTO bound.
  Pick<
    PicoUnit,
    | 'face_color'
    | 'mac'
    | 'ip'
    | 'micropython_version'
    | 'firmware_version'
    | 'api_version'
    | 'board'
    | 'board_total_mem_byte'
    | 'board_total_fs_byte'
    | 'board_cpu_freq_mhz'
  > & {
    offline?: boolean;
    drift?: boolean;
    /**
     * Setpoints for the readings walk when the unit has no in-progress
     * batch at seed time; otherwise the active batch's targets are used.
     */
    fallbackSetpoint?: { temperature: number; humidity: number };
  };

/** Alias of the canonical `BatchStatus` — one source of truth for the status vocabulary. */
export type BatchSeedStatus = BatchStatus;

/**
 * Batch offsets are relative to seed time so statuses stay correct after
 * any reset: `finished` supplies `finishOffsetDays` (negative; start is
 * derived as finish − duration), `in-progress` supplies both
 * (start negative, finish positive or null = open-ended), `planned`
 * supplies `startOffsetDays` (positive; finish is derived).
 *
 * Entries carrying a `recipeName` snapshot the species and both climate
 * targets from the linked recipe and derive window duration from its
 * `duration_days`. Recipe-less (hand-authored) entries omit it — then
 * `species`, `temperatureTarget` and `humidityTarget` MUST be supplied by
 * the entry itself (integer targets within the shared climate bounds),
 * and `durationDays` is required whenever a window edge is derived from
 * duration (finished / planned; both offsets are explicit for in-progress).
 * Recipe-less entries persist with `recipe_id = null` — the settled rule is
 * that no hand-authored entry may masquerade as recipe-derived provenance.
 */
export interface BatchSeedEntry {
  unitHandle: string;
  /** Absent on hand-authored entries — the batch then has no linked recipe. */
  recipeName?: string;
  status: BatchSeedStatus;
  /**
   * Rendered by the client as the batch title (`Batch` has no `title`
   * column) — distinctive human wording per entry, never a shared prefix.
   */
  description: string;
  startOffsetDays?: number;
  finishOffsetDays?: number | null;
  /** Species for recipe-less entries — binomial, already in the catalogue. */
  species?: string;
  /** Integer °C target within [TEMPERATURE_MIN, TEMPERATURE_MAX] (recipe-less). */
  temperatureTarget?: number;
  /** Integer % RH target within [HUMIDITY_MIN, HUMIDITY_MAX] (recipe-less). */
  humidityTarget?: number;
  /** Window length in days for recipe-less entries (no recipe `duration_days`). */
  durationDays?: number;
  /**
   * External harvest-photo URLs attached at module load from the species
   * lookup in `batch-images.ts` (derived from
   * `../provenance/batch-harvest-images.json` — never retyped here).
   * Absent for species the dataset lists as `missing` — no substitution.
   */
  images?: string[];
}

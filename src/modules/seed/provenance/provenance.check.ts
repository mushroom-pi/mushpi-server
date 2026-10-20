import {
  HUMIDITY_MAX,
  HUMIDITY_MIN,
  TEMPERATURE_MAX,
  TEMPERATURE_MIN,
} from 'src/common/constants/climate.constants';

import { RecipeSeedEntry } from '../seed.types';

/** Binomial species name: two alphabetic words, genus + specific epithet. */
const BINOMIAL_SPECIES = /^[A-Za-z]+ [a-z]+$/;

/**
 * Why a recipe entry must NOT enter the demo seed, as human-readable
 * reasons (empty = the entry passes). Pure — no I/O, no logging. The
 * verdict covers the full gate: a binomial species, integer climate
 * targets inside the shared bounds, a positive duration, a non-empty
 * source title/URL, a hotlinked image carrying its own licence, and the
 * human `verified` flag. An entry that fails is excluded from seeding and
 * named in `provenance.report.md` — the researched data is never "fixed"
 * to pass.
 */
export function provenanceFailureReasons(entry: RecipeSeedEntry): string[] {
  const reasons: string[] = [];

  if (!entry.species || !BINOMIAL_SPECIES.test(entry.species.trim())) {
    reasons.push('species is not binomial (genus + epithet)');
  }
  if (
    !Number.isInteger(entry.temperatureTarget) ||
    entry.temperatureTarget < TEMPERATURE_MIN ||
    entry.temperatureTarget > TEMPERATURE_MAX
  ) {
    reasons.push(
      `temperatureTarget ${entry.temperatureTarget} outside climate bounds [${TEMPERATURE_MIN}, ${TEMPERATURE_MAX}]`,
    );
  }
  if (
    !Number.isInteger(entry.humidityTarget) ||
    entry.humidityTarget < HUMIDITY_MIN ||
    entry.humidityTarget > HUMIDITY_MAX
  ) {
    reasons.push(
      `humidityTarget ${entry.humidityTarget} outside climate bounds [${HUMIDITY_MIN}, ${HUMIDITY_MAX}]`,
    );
  }
  if (!Number.isInteger(entry.durationDays) || entry.durationDays < 1) {
    reasons.push(`durationDays ${entry.durationDays} is not an integer >= 1`);
  }

  const prov = entry.provenance;
  if (!prov.sourceTitle || prov.sourceTitle.trim().length === 0) {
    reasons.push('provenance.sourceTitle is empty');
  }
  if (!prov.sourceUrl || prov.sourceUrl.trim().length === 0) {
    reasons.push('provenance.sourceUrl is empty');
  }
  if (!prov.image || !prov.image.sourceUrl) {
    reasons.push('no image sourceUrl for the recipe photo');
  } else if (!prov.image.license || prov.image.license.trim().length === 0) {
    reasons.push('image lacks its own licence/attribution');
  }
  if (prov.verified !== true) {
    reasons.push('provenance.verified is false');
  }

  return reasons;
}

/** The seed gate — an entry enters the demo catalogue only if this passes. */
export function recipePassesProvenance(entry: RecipeSeedEntry): boolean {
  return provenanceFailureReasons(entry).length === 0;
}

/**
 * Attribution footer appended to a seeded recipe's cultivation notes:
 * `\n\nSource: <title> — <url> (accessed <date>, <license>)` — the
 * licence segment is omitted when the source carries none.
 */
export function composeAttributionNote(entry: RecipeSeedEntry): string {
  const { sourceTitle, sourceUrl, accessedAt, license } = entry.provenance;
  const licenseSegment = license ? `, ${license}` : '';
  return `\n\nSource: ${sourceTitle} — ${sourceUrl} (accessed ${accessedAt}${licenseSegment})`;
}

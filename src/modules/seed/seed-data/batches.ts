import { BatchSeedEntry } from '../seed.types';
import { harvestImageForSpecies } from './batch-images';
import { SEED_RECIPES } from './recipes';

/**
 * Demo batch roster — 17 batches (10 finished / 4 in-progress / 3 planned).
 * Every date is a relative offset from seed time so the computed statuses
 * (`planned` / `in-progress` / `finished`) stay correct after any reset:
 *
 * - `finished`: `finishOffsetDays` is negative; `start_at` is derived as
 *   finish − the duration (the linked recipe's `duration_days`, or the
 *   entry's own `durationDays` when hand-authored).
 * - `in-progress`: start negative, finish positive (or null = open-ended).
 * - `planned`: `startOffsetDays` is positive (7..21); finish is derived.
 *
 * The client renders `description` as the batch title (`Batch` has no
 * `title` column), so every entry carries distinctive human wording with no
 * shared prefix. Descriptions are unique by authorship — the column has no
 * DB uniqueness index — and each stays within DESCRIPTION_MAX_LENGTH. The
 * demo signal lives in `notes` ('Seeded for the demonstration catalogue.',
 * composed in `SeedService.batchNotes`), not in the description.
 *
 * Only recipes that pass `recipePassesProvenance` are referenced; the
 * seeder skips an entry whose recipe row is absent. Two finished entries
 * are deliberately recipe-less — hand-authored runs explaining how an
 * untemplated experiment reaches the catalogue with `recipe_id = null`;
 * they reuse species already in the catalogue so the image lookup, species
 * spread and no-dominance rules hold unchanged. In-progress batches sit
 * on four distinct live units including the drifting `tent-three`; the ten
 * finished batches are spread over all five live units (two each); nothing
 * executes on the offline `tent-six`. Species stay spread so no single
 * species dominates (max two batches per species).
 */
const RAW_SEED_BATCHES: BatchSeedEntry[] = [
  // ── finished — two per live unit ────────────────────────────────────────
  {
    unitHandle: 'tent-one',
    recipeName: 'Shiitake on Sawdust Blocks',
    status: 'finished',
    finishOffsetDays: -12,
    description:
      'First shiitake block on the oak-supplement mix — clean pins a week after cold shock.',
  },
  {
    unitHandle: 'tent-one',
    recipeName: 'Maitake on Hardwood Blocks',
    status: 'finished',
    finishOffsetDays: -40,
    description:
      'Frond clusters from the earlier hardwood cycle; slow colonisation, two good flushes.',
  },
  {
    unitHandle: 'tent-two',
    recipeName: 'Lion’s Mane on Hardwood',
    status: 'finished',
    finishOffsetDays: -15,
    description:
      'Hericium kept under low CO2 — tight white teeth, none of the coral branching.',
  },
  {
    // Hand-authored (recipe-less): an untemplated bottle run logged only by
    // its own climate targets — `recipe_id` persists as null.
    unitHandle: 'tent-two',
    status: 'finished',
    finishOffsetDays: -70,
    species: 'Hypsizygus tessellatus',
    temperatureTarget: 15,
    humidityTarget: 90,
    durationDays: 10,
    description:
      'Hand-run bottle experiment with no template — short stems and firm caps, logged only in the tent notes.',
  },
  {
    unitHandle: 'tent-three',
    recipeName: 'Enoki in Bottles',
    status: 'finished',
    finishOffsetDays: -13,
    description:
      'Bottle enoki through the elongation phase behind a neck collar; picked at a clean 25 cm.',
  },
  {
    unitHandle: 'tent-three',
    recipeName: 'Turkey Tail on Sawdust Blocks',
    status: 'finished',
    finishOffsetDays: -55,
    description:
      'Bracket fans dried for tea; strong fresh air gave thin, sharply zoned caps.',
  },
  {
    unitHandle: 'tent-four',
    recipeName: 'Reishi Antler/Conk',
    status: 'finished',
    finishOffsetDays: -45,
    description:
      'Antler-form reishi under elevated CO2 — the white margin had just reddened at harvest.',
  },
  {
    unitHandle: 'tent-four',
    recipeName: 'Button Mushroom on Compost',
    status: 'finished',
    finishOffsetDays: -80,
    description:
      'Casing flush one on phase-II compost, picked before the veil broke.',
  },
  {
    unitHandle: 'tent-five',
    recipeName: 'Pink Oyster on Pasteurized Straw',
    status: 'finished',
    finishOffsetDays: -12,
    description:
      'Fast warm-weather flush on pasteurised straw; harvested young while the pink held.',
  },
  {
    // Hand-authored (recipe-less): spawned straight from the jar with no
    // recipe behind it — `recipe_id` persists as null.
    unitHandle: 'tent-five',
    status: 'finished',
    finishOffsetDays: -50,
    species: 'Volvariella volvacea',
    temperatureTarget: 32,
    humidityTarget: 90,
    durationDays: 12,
    description:
      'Untemplated tropical bed run — spawned straight from the grain jar and chilled at harvest.',
  },

  // ── in-progress — four distinct live units, one drifting ────────────────
  {
    unitHandle: 'tent-one',
    recipeName: 'Grey Oyster on Straw',
    status: 'in-progress',
    startOffsetDays: -10,
    finishOffsetDays: 4,
    description:
      'Pinning now; watching fresh air exchange closely for cap spread.',
  },
  {
    unitHandle: 'tent-two',
    recipeName: 'King Trumpet on Masters Mix',
    status: 'in-progress',
    startOffsetDays: -11,
    finishOffsetDays: 3,
    description:
      'Surface scratched at day four — even pins expected across the bottle.',
  },
  {
    unitHandle: 'tent-three',
    recipeName: 'Chestnut on Sawdust',
    status: 'in-progress',
    startOffsetDays: -9,
    finishOffsetDays: 5,
    description: 'Cool shift done; the golden caps are sizing up in week two.',
  },
  {
    unitHandle: 'tent-four',
    recipeName: 'Pioppino on Supplemented Sawdust',
    status: 'in-progress',
    startOffsetDays: -6,
    finishOffsetDays: 6,
    description:
      'Casing layer holding moisture well; primordia expected after the cool period.',
  },

  // ── planned — three future starts ───────────────────────────────────────
  {
    unitHandle: 'tent-five',
    recipeName: 'Button Mushroom on Compost',
    status: 'planned',
    startOffsetDays: 9,
    description:
      'Second compost run for button mushrooms — cased peat ready when the mycelium knouts.',
  },
  {
    unitHandle: 'tent-two',
    recipeName: 'Turkey Tail on Sawdust Blocks',
    status: 'planned',
    startOffsetDays: 16,
    description:
      'Next cycle of medicinal brackets; fresh-air tent prep already underway.',
  },
  {
    unitHandle: 'tent-one',
    recipeName: 'Maitake on Hardwood Blocks',
    status: 'planned',
    startOffsetDays: 21,
    description:
      'Autumn maitake attempt timed for the cold nights to trigger the frond drop.',
  },
];

/**
 * Species of a recipe-backed entry comes from the linked recipe; hand-authored
 * (recipe-less) entries supply their own — the same binomials the catalogue
 * already carries, so the harvest-image lookup needs no special case.
 */
const speciesOfEntry = (entry: BatchSeedEntry): string | undefined =>
  entry.species ??
  (entry.recipeName
    ? SEED_RECIPES.find((r) => r.name === entry.recipeName)?.species
    : undefined);

/**
 * Attach the dataset's harvest photo to every batch whose species has a
 * verified entry; the three `missing` species (Flammulina filiformis,
 * Pholiota adiposa, Trametes versicolor) keep no image — no portrait or
 * other-species substitution.
 */
export const SEED_BATCHES: BatchSeedEntry[] = RAW_SEED_BATCHES.map((entry) => {
  const img = harvestImageForSpecies(speciesOfEntry(entry));
  return img ? { ...entry, images: [img.imageUrl] } : entry;
});

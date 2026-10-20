import { BatchSeedEntry } from '../seed.types';

/**
 * Demo batch roster — 17 batches (10 finished / 4 in-progress / 3 planned).
 * Every date is a relative offset from seed time so the computed statuses
 * (`planned` / `in-progress` / `finished`) stay correct after any reset:
 *
 * - `finished`: `finishOffsetDays` is negative; `start_at` is derived as
 *   finish − the linked recipe's `duration_days`.
 * - `in-progress`: start negative, finish positive (or null = open-ended).
 * - `planned`: `startOffsetDays` is positive (7..21); finish is derived.
 *
 * Only recipes that pass `recipePassesProvenance` are referenced; the
 * seeder skips an entry whose recipe row is absent. In-progress batches sit
 * on four distinct live units including the drifting `tent-three`; the ten
 * finished batches are spread over all five live units (two each); nothing
 * executes on the offline `tent-six`. Species stay spread so no single
 * species dominates (max two batches per species).
 */
export const SEED_BATCHES: BatchSeedEntry[] = [
  // ── finished — two per live unit ────────────────────────────────────────
  {
    unitHandle: 'tent-one',
    recipeName: 'Shiitake on Sawdust Blocks',
    status: 'finished',
    finishOffsetDays: -12,
    description:
      'Demo run — first shiitake block, clean pins after cold shock.',
  },
  {
    unitHandle: 'tent-one',
    recipeName: 'Maitake on Hardwood Blocks',
    status: 'finished',
    finishOffsetDays: -40,
    description: 'Demo run — frond clusters from an earlier hardwood cycle.',
  },
  {
    unitHandle: 'tent-two',
    recipeName: 'Lion’s Mane on Hardwood',
    status: 'finished',
    finishOffsetDays: -15,
    description: 'Demo run — compact hericium kept under low CO2.',
  },
  {
    unitHandle: 'tent-two',
    recipeName: 'Buna-shimeji in Bottles',
    status: 'finished',
    finishOffsetDays: -70,
    description: 'Demo run — bottle culture, short stems and firm caps.',
  },
  {
    unitHandle: 'tent-three',
    recipeName: 'Enoki in Bottles',
    status: 'finished',
    finishOffsetDays: -13,
    description: 'Demo run — elongation phase with a neck collar.',
  },
  {
    unitHandle: 'tent-three',
    recipeName: 'Turkey Tail on Sawdust Blocks',
    status: 'finished',
    finishOffsetDays: -55,
    description: 'Demo run — bracket fans dried for tea.',
  },
  {
    unitHandle: 'tent-four',
    recipeName: 'Reishi Antler/Conk',
    status: 'finished',
    finishOffsetDays: -45,
    description: 'Demo run — antler form under elevated CO2.',
  },
  {
    unitHandle: 'tent-four',
    recipeName: 'Button Mushroom on Compost',
    status: 'finished',
    finishOffsetDays: -80,
    description: 'Demo run — casing flush one, picked before the veil broke.',
  },
  {
    unitHandle: 'tent-five',
    recipeName: 'Pink Oyster on Pasteurized Straw',
    status: 'finished',
    finishOffsetDays: -12,
    description: 'Demo run — fast warm-weather flush, harvested young.',
  },
  {
    unitHandle: 'tent-five',
    recipeName: 'Paddy Straw Mushroom in Beds',
    status: 'finished',
    finishOffsetDays: -50,
    description: 'Demo run — tropical bed culture, chilled at harvest.',
  },

  // ── in-progress — four distinct live units, one drifting ────────────────
  {
    unitHandle: 'tent-one',
    recipeName: 'Grey Oyster on Straw',
    status: 'in-progress',
    startOffsetDays: -10,
    finishOffsetDays: 4,
    description: 'Demo run — pinning now; watch FAE for cap spread.',
  },
  {
    unitHandle: 'tent-two',
    recipeName: 'King Trumpet on Masters Mix',
    status: 'in-progress',
    startOffsetDays: -11,
    finishOffsetDays: 3,
    description: 'Demo run — scratched the surface; even pins expected.',
  },
  {
    unitHandle: 'tent-three',
    recipeName: 'Chestnut on Sawdust',
    status: 'in-progress',
    startOffsetDays: -9,
    finishOffsetDays: 5,
    description: 'Demo run — cool shift done; golden caps sizing up.',
  },
  {
    unitHandle: 'tent-four',
    recipeName: 'Pioppino on Supplemented Sawdust',
    status: 'in-progress',
    startOffsetDays: -6,
    finishOffsetDays: 6,
    description: 'Demo run — casing layer holding moisture well.',
  },

  // ── planned — three future starts ───────────────────────────────────────
  {
    unitHandle: 'tent-five',
    recipeName: 'Button Mushroom on Compost',
    status: 'planned',
    startOffsetDays: 9,
    description: 'Demo plan — second button compost run.',
  },
  {
    unitHandle: 'tent-two',
    recipeName: 'Turkey Tail on Sawdust Blocks',
    status: 'planned',
    startOffsetDays: 16,
    description: 'Demo plan — medicinal brackets for the next cycle.',
  },
  {
    unitHandle: 'tent-one',
    recipeName: 'Maitake on Hardwood Blocks',
    status: 'planned',
    startOffsetDays: 21,
    description: 'Demo plan — autumn maitake attempt.',
  },
];

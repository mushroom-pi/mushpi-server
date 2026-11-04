import harvestDatasetJson from '../provenance/batch-harvest-images.json';

/**
 * Bridge between the committed harvest-image dataset and the batch seed
 * roster: a species → verified-harvest-image lookup. URLs and licences
 * live ONLY in `../provenance/batch-harvest-images.json` — this module
 * derives from it so no consumer retypes them (the trail and the values
 * can never drift apart).
 */
export interface BatchHarvestImage {
  species: string;
  imageUrl: string;
  pageUrl: string;
  author: string;
  license: string;
  title: string;
  depicts: string;
  verified: boolean;
}

interface HarvestDataset {
  images: BatchHarvestImage[];
  missing: { species: string; reason: string }[];
}

const dataset = harvestDatasetJson as HarvestDataset;

/** Only verified entries qualify; keyed by the species the batch links. */
const bySpecies = new Map<string, BatchHarvestImage>(
  dataset.images.filter((img) => img.verified).map((img) => [img.species, img]),
);

/** The species the dataset could not source an open-licensed harvest photo for. */
export const HARVEST_IMAGE_MISSING_SPECIES: string[] = dataset.missing.map(
  (m) => m.species,
);

export function harvestImageForSpecies(
  species: string | null | undefined,
): BatchHarvestImage | undefined {
  if (!species) return undefined;
  return bySpecies.get(species);
}

/**
 * One-line attribution appended to a batch's notes — `Batch` has no
 * per-image licence column, so attribution lives where a reader of the
 * batch sees it: `Image: <title> by <author>, <license> — <pageUrl>`.
 */
export function composeHarvestImageAttribution(img: BatchHarvestImage): string {
  return `\nImage: ${img.title} by ${img.author}, ${img.license} — ${img.pageUrl}`;
}

import { ProvenanceRecord, RecipeSeedEntry } from '../seed.types';
import {
  composeAttributionNote,
  provenanceFailureReasons,
  recipePassesProvenance,
} from './provenance.check';

/**
 * Pure gate over the seed entry shape. The dataset's two real exclusions
 * are encoded here (Black Poplar's failed verdict, Nameko's out-of-bounds
 * humidity) — the gate excludes, the data is never edited to pass.
 */
const passing: RecipeSeedEntry = {
  name: 'Grey Oyster on Straw',
  species: 'Pleurotus ostreatus',
  temperatureTarget: 20,
  humidityTarget: 90,
  durationDays: 14,
  notes: 'High FAE for fruiting.',
  origin: 'existing',
  provenance: {
    sourceTitle: 'UF/IFAS SS662',
    sourceUrl: 'https://ask.ifas.ufl.edu/publication/SS662',
    accessedAt: '2026-10-19',
    license: 'unknown',
    verified: true,
    image: {
      sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/x.jpg',
      license: 'CC BY-SA 4.0',
    },
  },
};

const withOverrides = (
  over: Omit<Partial<RecipeSeedEntry>, 'provenance'> & {
    provenance?: Partial<ProvenanceRecord>;
  },
): RecipeSeedEntry => ({
  ...passing,
  ...over,
  provenance: { ...passing.provenance, ...(over.provenance ?? {}) },
});

describe('provenance.check', () => {
  it('admits a fully attributed, verified, in-bounds entry', () => {
    expect(recipePassesProvenance(passing)).toBe(true);
    expect(provenanceFailureReasons(passing)).toEqual([]);
  });

  it('rejects a non-binomial species', () => {
    for (const species of ['Oyster', 'Pleurotus ostreatus var. minima', '']) {
      expect(recipePassesProvenance(withOverrides({ species }))).toBe(false);
    }
  });

  it('rejects integer climate targets outside the shared bounds', () => {
    // Nameko's real case: 95 %RH > HUMIDITY_MAX 90 despite being verified.
    expect(recipePassesProvenance(withOverrides({ humidityTarget: 95 }))).toBe(
      false,
    );
    expect(recipePassesProvenance(withOverrides({ humidityTarget: 9 }))).toBe(
      false,
    );
    expect(
      recipePassesProvenance(withOverrides({ temperatureTarget: 51 })),
    ).toBe(false);
    expect(
      recipePassesProvenance(withOverrides({ temperatureTarget: -1 })),
    ).toBe(false);
    const reasons = provenanceFailureReasons(
      withOverrides({ humidityTarget: 95 }),
    );
    expect(reasons.join(' ')).toMatch(
      /humidityTarget 95 outside climate bounds/,
    );
  });

  it('rejects non-integer targets', () => {
    expect(
      recipePassesProvenance(withOverrides({ temperatureTarget: 20.5 })),
    ).toBe(false);
    expect(
      recipePassesProvenance(withOverrides({ humidityTarget: 85.5 })),
    ).toBe(false);
  });

  it('rejects durations below one day', () => {
    expect(recipePassesProvenance(withOverrides({ durationDays: 0 }))).toBe(
      false,
    );
    expect(recipePassesProvenance(withOverrides({ durationDays: 2.5 }))).toBe(
      false,
    );
  });

  it('rejects an empty source title or url', () => {
    expect(
      recipePassesProvenance(
        withOverrides({ provenance: { sourceTitle: '  ' } }),
      ),
    ).toBe(false);
    expect(
      recipePassesProvenance(withOverrides({ provenance: { sourceUrl: '' } })),
    ).toBe(false);
  });

  it('requires an image with its own licence', () => {
    expect(
      recipePassesProvenance(
        withOverrides({ provenance: { image: undefined } }),
      ),
    ).toBe(false);
    expect(
      recipePassesProvenance(
        withOverrides({
          provenance: { image: { sourceUrl: 'https://example.com/x.jpg' } },
        }),
      ),
    ).toBe(false);
  });

  it('excludes an unverified entry — the Black Poplar case', () => {
    const entry = withOverrides({ provenance: { verified: false } });
    expect(recipePassesProvenance(entry)).toBe(false);
    expect(provenanceFailureReasons(entry).join(' ')).toMatch(
      /provenance.verified is false/,
    );
  });

  describe('composeAttributionNote', () => {
    it('appends the footer with title, url, access date and licence', () => {
      expect(composeAttributionNote(passing)).toBe(
        '\n\nSource: UF/IFAS SS662 — https://ask.ifas.ufl.edu/publication/SS662 (accessed 2026-10-19, unknown)',
      );
    });

    it('omits the licence segment when the source carries none', () => {
      const entry = withOverrides({ provenance: { license: undefined } });
      expect(composeAttributionNote(entry)).toBe(
        '\n\nSource: UF/IFAS SS662 — https://ask.ifas.ufl.edu/publication/SS662 (accessed 2026-10-19)',
      );
    });
  });
});

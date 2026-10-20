# Provenance Report — Demo Recipe Seed (`mushpi-server#23` dataset pass)

Human-readable verdict for every entry in the researched recipe dataset
(`dataset.json` alongside, typed as `../seed-data/recipes.ts`). The seed
gate (`provenance.check.ts`) decides
admission: binomial species, integer climate targets inside the shared
bounds (0–50 °C / 10–90 %RH), duration ≥ 1 day, non-empty source title and
URL, a photo hotlink carrying its own licence, and a human `verified`
verdict. Failing entries stay in the data **with their original values and
verdicts** — they are excluded at seed time and named here. Values were
never clamped or edited to pass the gate.

## Verdict summary — 14 of 16 pass

**Admitted to the demo catalogue (14):**

| Recipe | Species | Origin | Verdict |
|---|---|---|---|
| Grey Oyster on Straw | *Pleurotus ostreatus* | existing | ✅ pass |
| Shiitake on Sawdust Blocks | *Lentinula edodes* | existing | ✅ pass |
| Lion’s Mane on Hardwood | *Hericium erinaceus* | existing | ✅ pass |
| Reishi Antler/Conk | *Ganoderma lucidum* | existing | ✅ pass |
| Enoki in Bottles | *Flammulina filiformis* | existing | ✅ pass |
| King Trumpet on Masters Mix | *Pleurotus eryngii* | existing | ✅ pass |
| Pioppino on Supplemented Sawdust | *Agrocybe aegerita* | existing | ✅ pass |
| Chestnut on Sawdust | *Pholiota adiposa* | existing | ✅ pass |
| Pink Oyster on Pasteurized Straw | *Pleurotus djamor* | existing | ✅ pass |
| Maitake on Hardwood Blocks | *Grifola frondosa* | new | ✅ pass |
| Buna-shimeji in Bottles | *Hypsizygus tessellatus* | new | ✅ pass |
| Paddy Straw Mushroom in Beds | *Volvariella volvacea* | new | ✅ pass |
| Button Mushroom on Compost | *Agaricus bisporus* | new | ✅ pass |
| Turkey Tail on Sawdust Blocks | *Trametes versicolor* | new | ✅ pass |

**Excluded (2):**

| Recipe | Failed rule | Reason |
|---|---|---|
| Black Poplar on Straw | `verified` is false | Taxonomy and climate were corrected during research (`A. cylindracea` is a synonym of *Agrocybe aegerita*; fruiting 15–20 °C at 80–90 %RH), but the **18-day straw-cycle duration was never independently sourced**. The entry stays `verified: false` — the verdict is not "fixed". |
| Nameko in Bottles | humidity target outside bounds | `humidityTarget: 95` exceeds the system-wide `HUMIDITY_MAX = 90` (the same bound every DTO enforces). The source genuinely recommends 90–95 %RH, so the value is **kept as researched** — the gate excluding it is the correct outcome, not a data bug. |

## Corrections applied versus the hand-added originals

The ten `existing` entries descend from the earlier hand-added catalogue.
Research corrected the stored values toward the published **fruiting**
range (several originals had captured spawn-run/colonisation temperatures):

| Recipe | Original (hand-added) | Corrected (seeded) | Source finding |
|---|---|---|---|
| Grey Oyster on Straw | 24 °C / 85 % | 20 °C / 90 % | UF/IFAS SS662 gives 20 °C / 90 %RH for fruiting; 24 °C is the spawn-run range. |
| Shiitake on Sawdust Blocks | 22 °C | 18 °C / 85 % | OSU Extension: pinning at 55–65 °F (13–18 °C), ≥ 85 %RH; 22 °C was the colonisation temperature. |
| Pioppino on Supplemented Sawdust | 23 °C | 18 °C | Sources give 15–20 °C fruiting; 23 °C matched colonisation. |
| Chestnut on Sawdust | 21 °C / 9 days | 18 °C / 14 days | Mushroom Mountain: 50–70 °F (10–21 °C) with 2–3 weeks primordia→maturity; 21 °C / 9 d sat at the warm edge and was too short. |
| Black Poplar on Straw | *Agrocybe cylindracea* | *Agrocybe aegerita* + 18 °C / 90 % | Synonym corrected and climate fixed — but the 18-day duration remained unsourced, so the entry is still excluded. |
| Lion’s Mane, Reishi, Enoki, King Trumpet, Pink Oyster | — | values confirmed | Stored targets verified to sit inside the published fruiting ranges; no changes. |

The six `new` entries arrived with researched values already; each was
confirmed against its cited sources except as noted above (Nameko).

## Shortfall risk

The demo e2e asserts **≥ 10 seeded recipes** and the batch roster links to
14 distinct admitted recipes. Today 14 ≥ 10 with 4 entries of headroom, so
the shortfall risk does not trigger. If a future data pass drops the
admitted count below 10 — e.g. by removing a verified entry or tightening
the climate bounds — the catalogue shrinks: species diversity in the demo
charts collapses and `test/seed.e2e-spec.ts` fails loudly rather than
shipping an empty-looking demo. Adding sourced entries restores headroom;
loosening the gate to admit unverifiable data does not (that is the gate
doing its job, as it did for Nameko and Black Poplar).

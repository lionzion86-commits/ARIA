# Juguetes description coverage, 2026-10-25

#443 c.6403135059: toys are in scope at the same priority as perfumes, and the
sweep reports toy coverage explicitly. Counted on what the product pages show
(`assets/pdp/p/`, every record in the toys department: 6,622 records, 6,540 of
them Walmart, 81 Costco, 1 Party City).

| Toys | Before | After this PR |
|---|---:|---:|
| Spanish copy | 559 | 5,156 |
| English copy | 4,648 | 31 (product or franchise names copied into the description, e.g. "Monopoly: The Nightmare Before Christmas RF") |
| No real copy: fragments ("1 2 3", "For Ages 3 & Up", "Doll Fashion Play") | 1,161 | 1,163 |
| No description | 250 | 250 |
| Mixed | 4 | 22 |

The 4,185 distinct English toy texts (4,168 Walmart, 17 Costco) are translated
and stored in `scripts/data/descriptions-es/walmart.json` and `costco.json`,
then written into `juguetes-catalog.json` and `costco-catalog.json` by
`scripts/apply-description-memory.mjs` (the English stays as `description_en`).
The translations keep every fact (ages, piece counts, sizes, batteries, safety
warnings) in short sentences a child can follow; brand, character and set names
are unchanged.

## What translation cannot fix (needs real copy from the source)

- **3,289 of the Spanish toy descriptions stop mid-sentence**: Walmart's copy
  arrives in our catalogue cut at about 200 characters, so the Spanish is cut
  at the same place. A full description needs the pull to keep Walmart's whole
  text.
- **1,413 toys have no real copy at all**: 250 with no description, 1,163
  fragments or bare names. The toy standard says a description must exist on
  every toy; writing one without the product's real copy would mean inventing
  it, so these need their copy pulled from the retailer.

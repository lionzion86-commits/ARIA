# Walmart makeup shade pull — 2026-11-01

Data pull only. No catalog files edited, nothing pushed to GitHub.

## Source

- Walmart beauty items live in `department-cache-walmart.json` on origin/main of
  `lionzion86-commits/ARIA` (blob sha `3d6f3b3427c3b631541c3339aebf65e19f04b044`,
  fetched 2026-11-01): `retailers.walmart.departments.beauty.items` = 553 items.
  (`beauty-catalog.json` on main holds only Sephora + Victoria's Secret.)
- Color-cosmetics selection: name-based classification (include: foundation,
  concealer, lip/eye/face color, nail color, palettes, correctors, tints;
  exclude: skincare, hair color/care, fragrance, bath/oral, tools, primers)
  yielded **301 items** — see `classification.json`. The 2026-11-01 census
  counted 266; the delta is classification breadth on the current main
  snapshot, not missing items (0 items left unclassified).
- URL list with Walmart item id + name per item: `urls.json` (301 entries).

## Actor runs (e-commerce/walmart-product-detail-scraper)

| Run | Purpose | Items in | Cost (actual, from run record) |
|---|---|---|---|
| `FGRWjYckqqhwfYQ5b` | Proof — NYX Lip Lingerie XXL, Warm Up page | 1 | $0.00368 |
| `saBkcHtH3jea5J5bX` | Full run over all 301 selected URLs (cap $2) | 301 → 299 pages | $1.07648 |
| `72phH2bxWt5uOkD55` | Retry of the 2 missing pages (cap $0.10) | 2 → 0 pages | $0.00008 |
| **Total** | | | **$1.08024** |

## Proof result (passed)

The NYX Lip Lingerie XXL Warm Up page returned a `variantList` of 41 entries.
Each variant carries its own `usItemId`, product URL, price and image, plus a
`variants` token list naming the shade, e.g. `actual_color-07warmup`,
`actual_color-peachflirt`, `actual_color-30goindesnuda`. Distinct single-unit
shades: **23** (the rest of the 41 are 2-pack/4-pack multipack listings).
Both shades we already hold — Warm Up (161629972) and Deep Mesh (256290401) —
appear in the family.

## Full-run results (`dataset.json`, 299 pages)

- Distinct variant families (pages linked by shared variant item ids): **274**
- Families with shade (`actual_color`) data: **223**
- Shades per family: min **1**, median **8**, max **51**
- Distinct single-unit shade listings surfaced across all families: **2,562**
  (vs the 301 listings we currently hold)
- Caveat: 41 of 299 returned pages had an empty `variantList`, so 51 families
  show 0 shades even though some are shade-bearing products (notably several
  Revlon items) — the actor returned no variant data for those pages.
- 2 of 301 URLs returned no page in either attempt:
  "NYX Professional Makeup Super Cliquey Matte Lipstick, Obvs" (sku 464138290)
  and "e.l.f. Camo CC Cream, Light 250 W" (sku 1216898163).
  Left as-is; no alternate actor used.

## Examples

1. **Maybelline Color Sensational Cream Finish Lipstick** — 1 listing held →
   family of **51 shades**.
2. **L'Oréal Paris True Match Cream Foundation** — 2 listings held →
   family of **47 shades**.
3. **NYX Lip Lingerie XXL Liquid Lipstick** — 2 listings held (Warm Up,
   Deep Mesh) → **23 single shades** / 41 variant entries incl. multipacks.

## Files in this directory

- `urls.json` — 301 selected Walmart makeup listings (sku, name, url, price)
- `dataset.json` — raw actor output, 299 pages with full `variantList` data
- `proof-dataset.json` — proof-run output (NYX XXL page)
- `families.json` — per-family shade counts + missing/no-variant page lists
- `classification.json` — selected / excluded / unmatched split of the 553
- `fullrun-manifest.json`, `retry-manifest.json`, `*-result.json` — run records

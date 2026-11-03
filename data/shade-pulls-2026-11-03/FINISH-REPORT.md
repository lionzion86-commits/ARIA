# Ulta makeup finishing shade pull — 2026-11-03 (batch 2 of the shades work)

## Bottom line

**293/293 done.** The 293 Ulta makeup products that arrived in today's pull
wave without shade lists (50 lipsticks + 243 eye products — mascaras and
eyeshadows) now all have shade lists: **293 families, 1,368 shades**, in
Chad's ingest shape. Danny authorized this spend explicitly; doctrine:
makeup without shades is never sold.

## Spend (verified from run objects + the usage endpoint)

| run | urls | items | cost |
|---|---:|---:|---:|
| batch 1 `F2OoJsDUAtaj9I5zf` (cap $3.00) | 147 | 145 | $2.5610 |
| batch 2 `UEVDSIZTJUOFUasEd` (cap $3.25) | 146 | 145 | $2.6150 |
| retry `BZ0TFMfcocS2Ii77U` (cap $0.50) | 3 | 3 | $0.0590 |
| **total runs** | **293** | **293** | **$5.2350** |

Cycle usage: $491.4454 before → **$496.7349 after** (all-in delta $5.2895
incl. dataset reads), against the $500 hard limit — never crossed,
$3.27 headroom left. Per-run `maxTotalChargeUsd` caps + live usage checks
between batches enforced the ceiling.

First pass returned 290/293; the 3 misses (Hourglass Unlocked Satin Crème
Lipstick pimprod2037359, Mini MACximal Silky Matte Lipstick
pimprod2045123, Jelly Much Gel Eyeshadow Stick pimprod2059170) all landed
on the single retry.

## Route

Identical to the morning's proven Ulta run: `sian.agency` ulta-product-scraper
(`fodaJXkH20WYW4W94`), detail mode, payload
`{"productUrls": […], "scrapeMode": "detail", "maxResults": N, "categories": [], "categoryUrls": []}`
— the empty-categories trap avoided. Source set extracted from
`pull-wave-2026-11-03/ulta/ulta-makeup-delta.json` (items with
`shadeCount: 0` / empty `shades`): exactly 293, all unique base URLs.

## Deliverables (this folder)

- `normalized/dataset-ulta-makeup-finish.json` — 293 families → for Chad:
  match on base URL / productId against the makeup delta's 293 shadeless
  products and attach each family's `variantList`.
- `worklist-293.json` — the 293 products (url, productId, name, type).
- `raw/ulta-finish-sian.json` — merged raw actor output (293 items);
  `raw/batch{1,2}-sian.json`, `raw/retry3-sian.json`, manifests, `raw/coverage.json`.
- `run_finishing.py`, `normalize_finishing.py` — the runner and normalizer.

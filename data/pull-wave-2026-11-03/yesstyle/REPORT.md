# YesStyle — pull-wave report (2026-11-03)

**Delivered: `yesstyle-catalog-delta.json` — 89 NEW products to merge into the live 1,225-product catalog (→ 1,314 total).**

## Result

- Ran the catalog's original actor (`apify/An2ct0F5li9oecNBE`, yesstyle-product-search-scraper) on three keywords — "sunscreen", "serum", "moisturizer", capped at 100 items each: **300 rows fetched, 89 not already in the catalog** (dedupe on YesStyle product ID).
- **88/89 carry a variant string** (e.g. "50ml") in `availableSizes` with `sizeSource: "yesstyle-search-variant"` — the first variant data in the YesStyle catalog (the existing 1,225 have none). These are the search-row variant names: sizes/volumes for skincare, shade names where the product is makeup.
- 89/89 with brand, USD price, image and estimated weight.

## Cost (verified from the API)

Three runs (IzzvVCWAoBMA8c9dk, mH05LRoQ9AKX3fTgQ, 5p3M4KoEAZaTTnmdL): **$0.2600 each, $0.7800 total** settled.

## What remains

- Only 3 of YesStyle's many categories were sampled. The same keyword pattern extends mechanically (makeup, fashion, hair) at ~$0.0026/row; a +1,000-product wave ≈ $2.60 at today's settled rates. Full variant depth (every size/shade per product) needs PDP-level passes, not this search actor.

---

## Makeup scope addendum (2026-11-03, Danny: "We need makeup")

**Delivered: `yesstyle-makeup-delta.json` — 331 NEW makeup products, 319 with a variant (shade/size) string.** Combined YesStyle growth today: 1,225 → 1,314 (wave 1) → **1,645** with this makeup delta.

- Keywords: lipstick, cushion foundation, eyeshadow palette, blush (100 items each, same actor) — 400 fetched, **331 new** after dedupe against the live catalog and the wave-1 delta by product ID.
- **319/331 (96%) carry the variant string** in `availableSizes` and mirrored in `shades` — for makeup rows this is the shade name (or size for base products).
- Full per-shade families are NOT obtainable for YesStyle today: the shades job proved the PDP route dead across four actors (their 83 gated YesStyle products remain at 0 for the same reason). Search-row variant capture is the ceiling until a custom YesStyle fetcher exists — stated plainly, not papered over.
- Cost (settled): 4 runs × $0.26 = **$1.04**.

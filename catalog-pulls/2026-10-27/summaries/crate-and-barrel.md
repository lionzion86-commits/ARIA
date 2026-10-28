# Crate & Barrel — pull summary (2026-10-27)

**Status: PULLED.** Dataset: `dataset.json` in this folder — **2,024 rows** (2,022 detail-mode products + 2 overview rows), **1,933 unique SKUs** (cross-keyword duplicates removed at normalization).

## Route that worked
- `sian.agency/crate-and-barrel-product-scraper` (actor gGmD4HN4n4qa8ccuu) in **detail mode**, 21 light-home keywords (candle, dinnerware, glassware, serveware, vase, picture frame, sheets, throw blanket, towels, utensils, cookware, bakeware, flatware, mugs, table linens, pillow, wall art, mirror, bath accessories, holiday decor, table lamp), maxResults 2400 (run umlMnOQagXQMYNZNP). **Cost: $30.75 total (~$0.0152/product all-in — under the $0.02/product line).**
- The run ended at 2,022 detail items of the 2,400 requested (keyword pools exhausted / run ended before the cap) — treat as a **near-full light-home pull, not a complete one**; thin spots are possible in the last keywords (bath accessories, holiday decor, table lamp).

## Route that FAILED (do not retry)
- `stealth_mode/crateandbarrel-product-search-scraper` (the dedicated actor): **dead route on this account** — 4 pilot configs (keyword × BUYPROXIES94952 / RESIDENTIAL; URL mode × RESIDENTIAL / SHADER) all returned 0 items with search-fetch failures. ~$0.10 wasted.

## Data quality (2,024 rows)
- **Photos: 100%** — real captured Scene7 URLs (cb.scene7.com); 1,979/2,024 multi-image.
- **Prices: 100%**, USD, range **$1.95 – $3,149**, with `price_max`/`regular_price` ranges where applicable. **Sale flags present: 1,622 flagged on_sale** — Ofertas carousel is buildable.
- **SKUs: 100%** (1,933 unique). Descriptions 2,022; dimensions 1,951 (e.g. "3\"W x 3\"D x 3.5\"H" — usable for freight sanity checks); colors 1,084; breadcrumbs/category paths present (Picture Frames, Bath Towels, Utensils, Candles, Kids Bedding…).
- **Weights: 0%** — C&B does not publish weight in this data. The build order's **5 kg hard cap applies to estimates**: weight comes from the estimado doctrine (similar products, padded, flagged with source); items with no defensible estimate stay OUT of v1. Dimensions coverage (96%) helps the estimator.
- Top collections/brands in data: Marin Tabletop, The Kitchen by Crate, Mercer Tabletop, Le Creuset, Aspen Tabletop, Caraway, Staub — squarely the light-home scope.

## Scope notes for normalization
- Keyword breadth means some out-of-scope items slipped in (anything priced toward $3,149, large mirrors/lamps/furniture-adjacent pieces) — the 5 kg cap + furniture/rug/oversized exclusions cut them at slice time, per the build order.
- Buy activation stays gated on a small Miami test order. (Vetting note from the build order: C&B's FAQ explicitly welcomes freight forwarders.)

## Spend (this store)
Failed dedicated-actor pilots ~$0.10 + sian.agency pilots $0.26 + full pull $30.75. **Store total ≈ $31.11** (cap $40).

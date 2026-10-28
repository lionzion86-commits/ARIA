# Carolina Herrera — pull summary (2026-10-27)

**Status: PULLED (US storefront).** Dataset: `dataset.json` in this folder — 479 rows: **469 products (status ok)** + 10 `not_found` rows (stale sitemap URLs, drop at normalization).

## Route that worked
1. `onescales/sitemap-url-extractor` on the official US product sitemap
   (`api.carolinaherrera.com/puigcommercewebservices/v2/basesites/carolinaHerreraSpUsSite/sitemap/product-en-usd.xml`)
   → **633 real /us/en/ PDP URLs** (run FwwBJ03udvdE4SBhd, ~$0.00).
2. `digital_influx/product-data` in **productUrls mode** over all 633 URLs
   (run EDZIrn0ke6dAuJ6t7) → 469 products captured. **Cost: $2.46 final ($0.004/product; 616 product charges against 633 submitted URLs — the actor charged per attempted URL, including ones that returned not_found).**

## Routes that FAILED (do not retry blindly)
- digital_influx **store mode** on `carolinaherrera.com` (runs 4smT9ruKWwRIZkGjM, dm0ZLWLi9aE52aQiK): reads all 12 locale sitemaps in order and fills the cap with the **UAE/Arabic storefront (/ae/ar/)** — no locale scoping. That data was discarded, NOT saved.
- constructive_calm listing mode on US category pages (run E2B6PbunFwq3uK5BE): FAILED — CH serves empty pages to that actor's fetch ladder (bot wall).
- apify/sitemap-extractor + boxbox10/sitemap-extractor on the sitemap URL: domain-discovery only / 0 items.

## Data quality (469 products)
- **Photos: 468/469 (98%)** — real captured URLs on `medias.carolinaherrera.com` (CH's own media CDN), multiple images per product.
- **Prices: 463/469 (97%)**, all USD, range **$14 – $16,990**. SKUs: 469/469 have sku or id (98%+).
- **Sale pricing: NOT distinguishable** — `listPrice` is null everywhere and `onSale` false everywhere; if a PDP is discounted, `price` presumably already reflects it, but there is no compare-at price captured. The Fashion Sale (up to 50% off) cannot be reconstructed from this dataset alone.
- **Size variants: 0%** — JSON-LD source carries no size runs (same limitation as SNIPES). Sizes must come from a later PDP-level pass or be marked unavailable; do NOT invent them.
- **Weights: 0%** — none published in JSON-LD; estimado doctrine applies at slice time.
- **Category field is null** in the actor output; category is recoverable from the URL pattern `/us/en/p-<category>/<slug>` (ready-to-wear, fragrance, etc.).
- Descriptions present (actor-captured, first 1000 chars).

## Scope notes for normalization
- Assortment matches the order: ready-to-wear/dresses, accessories, shoes, beauty/fragrance incl. site exclusives. All single-brand (Carolina Herrera).
- Most items sit over the $200 FOB line → standard import-tax estimate stack at build time.
- The bridge line (CH Carolina Herrera, chcarolinaherrera.com) was **not** pulled — separate domain, not in this dataset (reported per the build order's instruction).
- Kill-switch lane rules are a build/checkout concern, not a data concern; nothing in the pull affects them.

## Spend (this store)
Pilots + failed routes: ~$0.23. Full pull: $2.46. **Store total ≈ $2.70** (cap $40).

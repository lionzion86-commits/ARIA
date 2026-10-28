# SNIPES — pull summary (2026-10-27) — TIER ONE

**Status: PULLED (core catalog).** Dataset: `dataset.json` in this folder — 5,001 rows: **5,000 products (all status ok)** + 1 store row.

## Route that worked
- `digital_influx/product-data` (actor sdpACak2EEWFG6RMW) in **store mode** on snipesusa.com, maxProductsPerStore 5000 (run N8EvCROSHb5q1GjqM). **Cost: $20.00 total ($0.004/product).** The run hit the 5,000-product cap exactly ($20.00005) — SNIPES' full sitemap pool is larger than 5,000, so this is a **truncated pull in the actor's sitemap order**, not the complete catalog.

## Routes that FAILED (do not retry blindly)
- `constructive_calm/ecommerce-product-scraper-pro` listing mode on /sale/ and /mens-shoes/ (runs GGyskqjmIDjaHeCX2, hgFXXgxJxgv4A1gag): SNIPES serves an **empty grid** ("no results") to that actor's whole fetch ladder (datacenter → residential → browser).
- Same actor in browser/details mode on 3 real PDP URLs (run rldvd36eUPTBtiX8C): product shells returned, **variants still empty** — it does not traverse Salesforce Commerce Cloud variation data.
- No dedicated SNIPES actor exists in the Apify store (search returned only crypto "sniper" noise).

## Data quality (5,000 products)
- **Photos: 5,000/5,000 (100%)** — real captured Demandware hi-res URLs on snipesusa.com; 4,965/5,000 have multiple images.
- **Prices: 4,966/5,000 (99%)**, all USD, range **$0.99 – $380**. SKUs: 5,000/5,000. Descriptions: 5,000/5,000 (first 1000 chars).
- Brands match the order's scope: Nike 972, Jordan 480, PRO STANDARD 401, Smoke Rise 289, adidas 274, New Era 225, New Balance 213, UGG 130, Polo Ralph Lauren 111, plus the long tail (Converse, Timberland, Vans, Puma, FILA, Asics in pilot sample).
- **SIZE RUNS: 0% — THE OPEN GAP.** `variants` is empty on every product and `variantCount` is null. The JSON-LD source this actor reads carries no Salesforce variation/size data. The build order requires full real size runs for footwear — **this dataset does NOT satisfy that gate.** Sizes need a later PDP-level pass against Salesforce variation endpoints or a dedicated actor; do NOT invent them. The store skeleton (rails, brand pages, PDP shells) can be built from this data, but buy activation for footwear should wait on the size pass.
- **SALE PRICING: NOT distinguishable** — `onSale` is false and `listPrice` null on all 5,000 (same JSON-LD limit as Carolina Herrera). If a PDP is discounted, `price` presumably already reflects it, but there is no compare-at price, so the sale wall / Ofertas-first rail cannot be reconstructed from this dataset alone.
- **Weights: 0%** — none published in the source; estimado doctrine applies at slice time.
- **Category field is null** in actor output; category is recoverable from PDP URL patterns at normalization.

## Scope notes for normalization
- Hyped launch/limited-release SKUs could NOT be filtered pre-pull with this actor — the exclusion must happen at slice time (release/limited SKUs identifiable by name/URL patterns, but there is no explicit flag in the data; flag for Chad's judgment, do not guess-delete broadly).
- Truncation: sitemap order front-loads a mix (pilot sample skewed kids/accessories first); with 5,000 of a larger pool captured, some tail categories may be underrepresented. A second pass with a higher cap (~$0.004/product, so each additional 1,000 ≈ $4) can top up if Chad's ingest report shows gaps.

## Spend (this store)
Pilots: ~$0.14. Full pull: $20.00. **Store total ≈ $20.14** (cap $40).

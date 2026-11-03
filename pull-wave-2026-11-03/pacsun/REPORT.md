# PacSun — pull-wave report (2026-11-03)

**Delivered: `pacsun-catalog-delta.json` — 44 NEW products with variant units, to merge into the live 18-product catalog (→ 62 total).**

## Result

- 44 new products (probe 7 + batch A 17 + batch B 22, deduped, none overlapping the existing 18).
- **44/44 carry variant units** — 7 to 26 per product (jeans at the top end), each variant with its own SKU, product URL, price and in-stock flag: 44 products, hundreds of purchasable size units.
- 44/44 with price, images, description and estimated weight. Buckets assigned by what the product actually is (Jeans, Vestidos, Sudaderas, Tops, etc.) into a single `apparel` department ("Ropa").
- ⚠️ **Size labels are the one gap:** the actor returns each size as a variant record but does not extract the size *text* (e.g. "28W X 30L") from PacSun's SFCC pages — variant `options` came back empty on every record. The variant SKUs/URLs are real and purchasable; mapping SKU → size label needs either a PacSun PDP pass that reads SFCC variation attributes, or Chad-side mapping at wiring. Colors need no mapping: PacSun sells each color as its own PDP and the color is in the product name, same as the existing catalog.
- Note for wiring: the existing 18 products sit in a `sporting_goods` department ("Deportes") although they are jeans/hoodies/apparel. The delta uses `apparel` ("Ropa"). Worth Chad normalizing the old 18 into the same bucket.

## Route

- Listing mode (both actors): 0 items — pacsun.com 403s plain fetches (Akamai) and serves listing crawlers shells.
- **What worked: constructive_calm PDP mode** (same route as BBW). URL universe harvested free from the Wayback CDX index: 523 unique PDPs. Batches: probe 7/8 ($0.0335), first 150-URL batch tripped the actor's dead-page circuit breaker for $0.0050 and 0 items (alphabetical order front-loaded dead brand pages), shuffled batch A 17/60 ($0.0520), batch B 22/463 ($0.0570 — breaker tripped again early; the run self-terminates rather than paying for dead fetches).

## Cost (verified from the API)

Total PacSun spend: **$0.1525** across 5 runs (4 PDP-mode + 1 listing probe; ~$0.0035 per delivered product).

## What remains unpulled and what it would cost

- ~440 of the 523 Wayback URLs were never delivered a product (discontinued items + breaker-skipped). A patient re-run in small shuffled batches would likely recover a few dozen more live products for ~$0.10–0.20.
- PacSun's full current catalog (thousands) needs a working listing route or a fresher URL corpus; neither exists today within this setup. The 62-product combined catalog is a real store, not a stub — depth can grow later via the same PDP pattern whenever fresh URLs are available.

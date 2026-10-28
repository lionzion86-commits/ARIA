# Micro Center pull — summary (2026-10-28, Phase 2 of the electronics wave)

**Gate:** SHIP-CLEARED (sourcing audit 2026-10-28: no resale ban, no forwarder ban, published tax-exemption route).
**Final dataset:** `microcenter-catalog.json` — **696 sellable, ship-to-home products**.
**Spend: $28.94 of the $30 cap** (final accounted usage, re-verified per run). Raw rows pulled: 760 detail + 30 overview (pilot).

## The one big finding: detail mode is the only route, and it costs $0.038/item

Actor: `sian.agency/microcenter-product-scraper` (Jfl38WUim7jeflZAT) — the only dedicated Micro Center actor in the store. Two modes:

- **Overview ($0.00475/item)** — search-result data only. Its `availability` is *store* stock at one localized store ("10 IN STOCK" at Westmont IL). It **cannot distinguish ship-to-home from pickup-only**, and it has no UPC, no specs, no weight. Unusable under the ship-to-home-only rule.
- **Detail ($0.038/item)** — full PDP capture: specs, UPC (99.6%), MPN, compare-at price, and per-store stock **including the pseudo-store "029 — Shippable Items"**, which is Micro Center's web-fulfillment pool. An item is ship-to-home eligible iff that pool shows quantity > 0. That is the filter applied.

The wave spec estimated $15–30 for ~5,000 raw / ~3,500 yield at the generic $0.003–0.006/item band. This actor's detail price is **6–8× that band**, so $30 buys ~760 detail products, not 5,000. A full-volume detail pull at the spec's scale would cost **~$190** — over cap, so it was NOT run (per the stop rule). What ran instead: the full $30 cap spent on detail-mode keyword runs across Micro Center's strength categories.

## Shippable share — measured, and much better than feared

The audit assumed the ship-to-home filter would keep ~70%. **Measured: 94.2% of unique products (702/745) had stock in the Shippable Items pool.** Per run: audio 97%, storage 92%, laptops 98%, peripherals 96%, display/network 98%, components 96%, headphone pilot 100%. The pickup-only problem is real but small for the web-listed assortment this actor surfaces: only 29 unique products were pickup-only and were excluded.

## Run log (all detail mode unless noted; per-run maxTotalChargeUsd guardrails set)

| Run | Keywords | Run ID | Items | Cost USD | Notes |
|---|---|---|---|---|---|
| Pilot (overview) | laptop, headphones | Lmo4dACyhRkaQe5ip | 30 | 0.148 | Proved overview can't signal shipping — route rejected |
| Pilot (detail) | headphones | Wees0UdKzdgi3adKu | 10 | 0.385 | Found the "Shippable Items" pool signal; UPC 10/10 |
| A — audio | headphones, earbuds, headset | 6g77EboX1QffAyLyI | 140 | 5.192 | Billed as 136 detail + 4 overview events |
| B — storage v1 | ssd, external hard drive, ddr5 memory | ttCM3fasbcLMhplrl | 0 | 0.005 | Returned empty (ran parallel with A/C) |
| B2 — storage v2 | solid state drive, nvme, computer memory | PAebqLYQvbzsUlgtT | 110 | 4.185 | Retry with rephrased keywords — worked |
| C — laptops v1 | gaming laptop, laptop | cVdinm1Muc59njbVw | 0 | 0.005 | Returned empty (parallel-run window) |
| C2 — laptops v2 | laptop | Mz7B8xCn8RQIEeyrt | 120 | 4.565 | Serial retry — worked |
| D — peripherals | mechanical keyboard, gaming mouse, graphics card | dgoCmtoJwghQ01PNl | 130 | 4.945 | Keyboard results crowded out mouse/GPU (see gaps) |
| E — display/network | monitor, tablet, wifi router, vr headset | 4diaruRvxVoAgse46 | 130 | 4.945 | Monitor results crowded out tablet/router/VR |
| F — components | motherboard, processor, power supply | apdgJ8oeYXYuN0rdF | 120 | 4.565 | Motherboard results dominated |
| **TOTAL** | | | **760 detail** | **$28.940** | Cap $30 — held (final accounted figures, re-verified 2026-10-28) |

Operational note: the two empty runs (B, C) both ran while another run was in flight; serial retries with identical intent succeeded. Future Micro Center runs should be launched one at a time.

## Dataset stats (final, after all filters)

- Raw rows 760 → unique products 745 → **kept 696**.
- Excluded: 29 pickup-only (no Shippable Items stock), 13 monitors with known weight > 7 kg, 6 desktop gaming PCs (freight-dead class: known weights 9.9–21.2 kg), 1 TV.
- Images: **100%** (no-image excluded by rule). UPC/barcode: **99.6%**. Weight (from PDP specs): **47.0%** — remainder falls to the estimado doctrine at ingest. Compare-at price present: **48.6%**; on-sale flag true: **48.6%** (truthful — flag mirrors the retailer's own strikethrough).
- Voltage: 0 items flagged 110V-only by spec text. Note most pulled items are DC/USB/battery or carry universal adapters; PSU/motherboard specs rarely state input voltage in the captured fields — the 220V gate still applies at ingest for mains-powered items.
- **Descriptions:** the actor returns `description = null` even in detail mode. Each record's `description_es` was generated from the PDP title + spec highlights (brand, type, connection, capacity, battery life) — the same downstream pattern as the Oct-27 wave's translation pipeline — and is marked `description_source: generated_from_pdp_title_specs`. No specs were invented; every claim in the text comes from the product's own PDP fields.

## Coverage by category (kept)

| Category | n |
|---|---|
| Headphones & Earbuds | 128 |
| Motherboards | 113 |
| Computer Monitors (≤7 kg only) | 112 |
| Laptops/Notebooks | 106 |
| SSD (Solid State Drives) | 97 |
| Gaming Keyboards | 77 |
| Keyboards | 38 |
| Laptop AC Adapters | 7 |
| Mac Keyboards | 6 |
| Gaming Headsets | 4 |
| Keyboard/Mouse Combo Sets | 4 |
| Computer Build Bundles | 2 |
| iPod/MP3 Misc Accessories | 1 |
| Laptop Cases | 1 |
| **Total** | **696** |

## Gaps (priced fix, NOT run — remaining budget was $1.06, enough for ~27 items only)

The actor's keyword search with "match" sort lets one keyword's results crowd out the others inside a shared maxResults pool. Three in-scope aisles came back thin/absent despite being targeted:

- **Gaming mice** (targeted in Run D — crowded out by keyboards): ~0 dedicated SKUs.
- **Graphics cards** (targeted in Run D — crowded out): ~0 dedicated SKUs.
- **Tablets, WiFi routers, VR headsets** (targeted in Run E — crowded out by monitors): ~0 dedicated SKUs.
- **Processors & power supplies** (targeted in Run F — crowded out by motherboards): only traces.
- **Phones:** Micro Center's phone assortment is thin on the web store; no dedicated phone run was attempted.

Fix: one single-keyword detail run per aisle, serial. ~130 items × $0.038 ≈ **$4.94 per aisle**; all five aisles ≈ **$25**. Recommend as a top-up decision for Danny alongside the Phase-2 verdict — the storefront should not launch with empty mouse/GPU aisles, since components are Micro Center's signature strength (strongest-department doctrine).

## Blocker for the parent

The spec's Micro Center expectation (~3,500 products for $15–30) is unreachable with the only dedicated actor: PDP-grade capture costs $0.038/item, so the spec volume costs ~$190. Delivered instead: 696 fully-verified shippable products for $28.94 — every one with a real photo, 99.6% with UPC, ~half with true compare-at sale pricing. If Danny wants Micro Center at full depth, the number to approve is ~$190 for ~5,000 raw detail pulls (expected ~4,600 shippable at the measured 94% rate), or ~$25 for the five-aisle top-up above.

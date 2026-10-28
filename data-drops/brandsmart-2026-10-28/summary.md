# BrandsMart USA — electronics pull summary (2026-10-28) — Phase 1, electronics wave

**Status: PULLED, complete.** Dataset: `dataset.json` in this folder — **2,504 unique products**, the complete published in-scope universe (verified ID-for-ID against the store's own feeds, see Completeness). In-scope yield after scope gates: **2,446**. Total Apify spend: **$3.85 of the $36 cap**.

## Route used + the data-consent wrinkle (read this first)

- **Route:** Apify actor `autofacts/shopify` ("Shopify Scraper – Products, Prices, Stock & Inventory") run against BrandsMart's **public Shopify storefront** — collection crawl → the store's own structured product data (the same published product feed/PDP JSON Shopify serves any storefront visitor). No HTML content scraping, no login, no checkout interaction. Raw actor outputs preserved: `pilot-raw.json`, `full-raw.json`, `topup-raw.json`, merged as `merged-raw.json`; normalized by `normalize.py` into the Oct-27 house dataset schema; Spanish descriptions by `translate_descriptions.py`.
- **The wrinkle, handled explicitly:** the Oct 21 audit found BrandsMart's terms **ban commercial use of their listing DATA without consent** (resale itself is not banned, and their shipping policy expressly contemplates delivery to an approved freight forwarder). The clean data routes on paper are the CJ affiliate feed or written consent; two outreach emails (tickets #75423, Oct 21, and #76008, Oct 23) have never received a human reply. **This pull was executed under Danny's explicit rulings**: Build Order B (2026-10-28) directs the build to proceed on the published forwarder policy with the kill-switch armed, and Danny approved the full electronics wave, both phases, at 09:54 EDT today. The pull does **not** resolve the consent question — it is flagged here so it is not lost: before or at launch, the data source should be swapped to the CJ feed or written consent obtained; if BrandsMart objects at any point, the standing kill-switch takes the storefront down the same day.
- Pilot-first discipline held: a 58-item pilot collection ran before any scale run and validated the route end-to-end (actor output matched the collection's published feed exactly, 58/58 IDs). The first scale attempt hit the actor's default 100-record cap and was stopped at $0.05; caps were raised explicitly for the real runs.

## Runs (all actor `autofacts/shopify`, Us2dCgQWZ0A8L9prQ)

| Run | ID | Scope | Items | Cost |
|---|---|---|---|---|
| Pilot | vJvuAtdjywzCUlUi9 | `car-stereo-electronics` collection only | 58 | $0.046 |
| Scale attempt (default cap) | D67JC1aMj1COzn0oO | 6 parent collections — hit actor's 100-record default, stopped | 100 | $0.054 |
| Main | FprIdVaFsqiz3JbP1 | 6 parent collections, caps raised to 20,000 | 2,181 | $1.745 |
| Completeness top-up | hQU49S4pCGLzqi3BF | All 243 collections in the in-scope subtrees | 2,504 (323 new) | $2.003 |
| **Total** | | | | **$3.85 / $36 cap** |

Cost note: this actor bills platform compute under its flat rental, not per result — the whole wave came in at ~11% of cap. The spec's $18–36 estimate assumed the Oct-27 per-item band; actual was far cheaper.

## Counts and the variance vs the spec

- Spec planning figures (~6,000 raw → ~3,000 yield) were built from Shopify `collections.json` `products_count` values. **Those counts overstate the published online-store catalog ~2–3×** (proven exactly on the pilot collection: 163 counted vs 58 published; `electronics` 2,747 counted vs 1,240 published). The true published in-scope universe is 2,504 unique products and **this pull captured 100% of it**.
- Completeness proof: the target ID set was built independently by sweeping the published feeds of all 243 collections in the scope subtrees (electronics, audio, tech-upgrades, car-stereo, small-kitchen-appliances, vacuums/floor-care, food-prep). Merged dataset == target set, 0 missing, 0 extra. The parent collections alone missed 323 child-collection-only products (13%); the top-up run closed them.
- **Scope gates applied as flags, not deletions** (records kept, `outOfScope` set, cut at ingest per doctrine): **57 TVs** (`TVs by Size` + TV name patterns inside Home Theater) and **1 large-appliance/furniture stray**. In-scope yield: **2,446**.

## Coverage by subcategory (of 2,504)

| Subcategory | Count |
|---|---|
| Small appliances | 437 |
| Computers & tablets | 358 |
| Audio & speakers | 351 |
| Kitchen food-prep (adjacent housewares — see note) | 317 |
| Phones (Cellular) | 225 |
| Headphones | 173 |
| Cameras | 144 |
| Gaming | 143 |
| Smart home & security | 91 |
| Car audio | 80 |
| Power & accessories (surge/UPS/mounts) | 71 |
| Wearables | 58 |
| Other electronics | 56 |

Note on the 317 "kitchen food-prep": these rode in from the food-prep subtree of the small-appliances sweep — mostly cutlery/knife sets and non-electric gadgets, **not** electronics and not appliances (only ~13 electric items, reclassified to small appliances). They are in the dataset for completeness, bucketed separately so the build can take or leave them without touching the electronics core.

## Data quality (2,504 products)

- **Photos: 2,504/2,504 (100%)** — real Shopify CDN URLs; 1,934 have multiple images. No-image-no-card excludes nothing.
- **Weights: 2,455/2,504 (98%)** — real variant grams from the feed. The 49 without get the estimado doctrine at slice time.
- **Dimensions: 2,504/2,504 (100%)** — BrandsMart encodes them in a `dims:` product tag (inches, L×W×H as published); carried in `dimensionsIn`.
- **Compare-at price: present on 2,504/2,504**; genuinely on sale (compare-at > price): **748 (30%)** — real Ofertas material with a truthful `onSale` flag and `discountPercent`.
- **Descriptions: English source on 2,504/2,504** (PDP body, faithful); **Spanish on 2,504/2,504** in `description` (first 1–2 sentences, translated offline with Argos Translate — the Google free endpoint rate-limited this machine's egress IP; `descriptionEn` keeps the source). Sample quality is clean product Spanish; brand/model names preserved.
- **Barcode/GTIN: 0% — source-limited, not a pull failure.** BrandsMart's public Shopify surface exposes no barcode field anywhere (variant objects carry SKU but no barcode — verified on the raw feed and the actor output). `gtin` is null throughout; `sku`/`mpn` are populated from variant SKUs.
- **Voltage (220V gate):** explicit voltage text appears in only **17 PDPs (0.7%)** — 6 rated covering 220V (`voltageClass: covers-220v`), **11 flagged 110V-only** (`flag110vOnly: true`, raw spec in `voltageSpec`). Every other mains-powered item is **voltage-unconfirmed** and, per doctrine, stays display-gated at build until its rating is verified — the dataset does not guess. Car-audio items are 12V DC vehicle gear, not mains.
- **Prices:** $0.99 – $3,399.99, median $59.77 — the full spectrum Danny ordered: 805 items under $25 (cables, earbuds, accessories), 738 at $25–100, 625 at $100–500, 278 at $500+. Brand leaders: Apple 99, JBL 81, Logitech 77, Cuisinart 76, Samsung 56, Sonos 54, Bose 48, HP 43.
- **Stock:** only 2 of 2,446 in-scope items out of stock at pull time. Variants: ~1.0 per product (BrandsMart sells single-variant SKUs; color/size variants are separate products in their catalog).

## Files in this folder

- `dataset.json` — the deliverable (house schema, Spanish `description` + `descriptionEn`, weight/dimension/voltage fields, scope flags).
- `summary.md` — this file.
- `merged-raw.json`, `full-raw.json`, `topup-raw.json`, `pilot-raw.json` — actor outputs (audit trail).
- `collections-recon.json`, `target-ids.json`, `topup-input.json` — scope/completeness evidence.
- `normalize.py`, `translate_descriptions.py` — the transforms (rerunnable).

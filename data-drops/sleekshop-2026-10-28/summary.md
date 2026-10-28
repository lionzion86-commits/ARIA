# SleekShop hair-treatment pull — summary (2026-10-28)

Danny's named revival against the catalog freeze (approved 2026-10-28 11:39 EDT, budget ~$15–30, hard cap $30).
Lane: 🟡 YELLOW untested (scout 2026-10-28) — data pull only; buy-activation later follows verdict-by-first-order + kill-switch.

## Headline

| | |
|---|---|
| **KERATIN (any label)** | **271 products** (196 keratin treatments/systems + 75 keratin care) — vs **3 in hand before** |
| **ALISADO / straightening (primary)** | **82 products** — vs **0 in hand before** (keratin smoothing systems also sit inside the 196 above) |
| **Final dataset** | **1,437 products** in `dataset.json` |
| **Total spend** | **$0.00 of the $30 cap** (direct-HTTP route; zero Apify runs) |
| In stock (per PDP) | 714 (49.7%) · Out of stock 723 (50.3%) — flagged per record |

## Coverage by treatment type (primary)

| Type | Count |
|---|---|
| Scalp treatments | 226 |
| **Keratin treatments & systems** | **196** |
| Hair masks / masques | 169 |
| Bond repair (Olaplex class) | 150 |
| Leave-in | 116 |
| Argan / treatment oils | 115 |
| Other treatments | 96 |
| Shampoo (pro lines) | 88 |
| **Alisado / straightening** | **82** |
| Keratin care (shampoo/conditioner/serum) | 75 |
| Conditioner | 74 |
| Hair serum | 43 |
| Deep conditioner | 7 |

Top brands (277 distinct): Kérastase 43 · Goldwell 38 · Matrix 37 · Salerm 35 · Keratin Complex 33 · Keune 33 · Schwarzkopf Professional 32 · Milbon 28 · Wella 27 · Redken 23 · Framesi 19 · Rusk 16 · L'Oréal Professionnel 16.
Price spectrum: $1.49–$499.99, median $23.99.

## Field coverage

| Field | Coverage | Note |
|---|---|---|
| Primary image | **1,437/1,437 (100%)** | No-image excluded by rule; 25/25 spot-checked URLs resolve HTTP 200 |
| Price | 100% | JSON-LD offer price, cross-checked vs PDP price block in pilot: 0 mismatches |
| Compare-at / on-sale | 244 (17.0%) / **243 on sale (16.9%)** | Truthful: only where the PDP shows a genuine Was price above the selling price |
| UPC / GTIN | **1,398 (97.3%)** | From PDP detail rows |
| SKU | 1,437 (100%) | |
| Brand | 1,363 (94.9%) | JSON-LD/card brand + title-prefix recovery against the brand sitemap (recovered 261 of 335 initially missing) |
| Spanish description | 1,437 (100%) | 952 translated from the PDP's own "What it does/is" copy (Argos offline, source EN preserved in `description_en`, full PDP text in `description_full_en`); 485 generated from title + type where the PDP carried no usable description (`description_source` marks which) |
| **Weight** | **0 (0%)** | **Blocker:** SleekShop PDPs expose no weight or dimensions anywhere (detail rows carry only SKU/UPC). Falls to the standing estimado doctrine at ingest |
| Size/volume | partial | Captured from product titles where stated (`size` field) |

## Route & run log (all direct HTTP via curl; Apify spend $0)

1. **Recon:** sleekshop.com = Experro headless frontend on BigCommerce. Sitemaps enumerate 26,260 base products; categories paginate client-side only (SSR shows page 1 = 20 products).
2. **Pilot A (keratin category, urllib):** 20 PDPs → 15 full SSR, 5 SPA shells; price parser initially mis-anchored (related-product prices) — fixed by anchoring on the Was:/Now: labels and preferring JSON-LD.
3. **Pilot B (curl):** same slice — 100% field parse on returned pages (image/price/compare-at/SKU/UPC/description all present). Route verified PDP-grade. Cost projection: $0.
4. **Category seed sweep:** 38 in-scope categories (treatments-masques tree, straighteners-relaxers, in-salon treatments, leave-ins, argan oils, smoothing serums, treatment shampoo/conditioner subcats, wellness/hair, K/J-beauty hair masks) → **576 seed products** with verified category membership.
5. **Pull v1 (6 workers, backoff retries):** stalled at ~41 records — the storefront serves a 2.4 KB SPA shell probabilistically under load, and backoff retries serialized the workers. Killed; strategy replaced.
6. **Pull v2 (multi-pass, single-attempt, 4 workers, paced):** queue = 3,826 paths (keratin/alisado slugs first, then category seeds, then the wider treatment slug candidates).
   - **Pass 1: 3,784 attempted → 1,671 fetched (44%)**; success rate rose as the SSR cache warmed, then fell on the long-tail candidates.
   - **Pass 2: sampled 100 → 4 fetched (4%)** — the failed set is shell-resistant; stopped by decision (diminishing returns vs. the strength already banked).
7. **Build:** 1,720 unique raw PDP records → gates → **1,437 kept**. Excluded: 137 not-hair (skincare false positives from slug matching), 126 no treatment label, 11 color chemicals, 5 styling tools/appliances, 4 no price. Hair gate + treatment classification ran on PDP title/description, not slugs alone.
8. **Post-build fixes:** brand recovery (+296 records, 76.7%→94.9%); ES description cleanup (325 size-fragment lead-ins stripped and retranslated; 2 residual records patched to the title fallback).

## Blockers / honest gaps

1. **~2,100 candidate URLs never fetched** — Experro SSR returns shell pages probabilistically (worse under sustained load; pass-2 yield 4%). The treatment core is covered via the 38-category sweep + priority keratin/alisado passes; the un-fetched remainder is mostly long-tail slug candidates (incl. K-beauty skincare noise the gate would have dropped anyway). A future refresh could retry them slowly; expected marginal yield is low.
2. **Weights 0%** — not exposed by this storefront at all; estimado doctrine at ingest (manufacturer-spec lookup + 10%, per Danny's electronics note today).
3. **Half the catalog shows out of stock** on its PDPs (723/1,437). Availability is recorded per record; the build should lead with the 714 in-stock items. Long-tail pro SKUs churn — a stock refresh matters more here than for commodity stores.
4. **Compare-at is thin (17%)** — SleekShop prices near its own list on most items; the 243 on-sale items are the aisle's honest Ofertas material.
5. Variant price ranges exist on some products (card shows a range); the dataset carries the PDP's default-variant price and a `has_variants` flag.

## Files

- `dataset.json` — 1,437 normalized products (store, title, brand, sku, upc, url, price, compare_at_price, on_sale, image/images, category = primary treatment type, treatment_types labels, seed_categories, availability, size, description ES + EN source + full EN, description_source).
- `work/` — extraction/fetch code, category seeds, raw PDP records (`raw_records.jsonl`, 1,720), pass fail lists, translation cache, run logs (`pull.log`, `pull2.log`, `pull3.log`, `build.log`).

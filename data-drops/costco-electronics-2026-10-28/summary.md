# Costco electronics refresh pull — 2026-10-28

Phase 1 of the electronics wave (Danny approved the full wave 2026-10-28 09:54 EDT).
Route: `sian.agency/costco-data-scraper` (actor `fo640kYPPz2M5T4MU`), search mode, US / en-US.
Spec source: `electronics-sourcing-replacement-2026-10-28.md` (Costco line: ~700 raw → ~700 expected, est. $2.10–4.20).

## Headline

| | |
|---|---|
| **Final in-scope products** | **454** |
| Gross raw rows pulled | 1,758 (694 unique item numbers) |
| Excluded at ingest | 240 (TVs 45, freight-dead 7, pharma/non-electronics 50, no/zero price 2, unclassified non-electronics 136) |
| **Total spend** | **$2.4510 of the $5.00 cap** (53 runs, all logged in `runs.json`) |
| vs staged catalog | **437 new + 17 refreshed** (staged file held only 46 items in its electronica department) |

## Runs (all SUCCEEDED unless noted)

- **Pilot:** `laptop` maxPages 2 — run `RDkmfdqELdygeqsCO`, 48 items, $0.0698. Measured $0.00135/search row (SILVER tier) + $0.005 start → full wave projected ≈ $1.5–2.5, inside cap. Proceeded.
- **Wave 1 (30 keywords, maxPages 2):** headphones, wireless earbuds, airpods, bluetooth speaker, soundbar, iphone, samsung galaxy phone, cell phone accessories, chromebook, gaming laptop, desktop computer, computer monitor, tablet, ipad (0 rows), nintendo switch, playstation 5, xbox, video games, smartwatch, apple watch (0 rows), fitbit, camera, gopro, security camera, drone, kindle e-reader, streaming device, wifi router, computer accessories, printer — subtotal incl. pilot **$1.4281**.
- **Details pilots (2 runs, $0.005 total):** `productDetails` by itemNumbers (20) and by startUrls (3) both returned **0 rows**. CORRECTION (schema read after the fact): the actor's details input is a **singular `productId` string — one product per run** — so both pilots were mis-invoked and the route is *untested*, not dead. A correct details pass costs ≈ $0.012/item (start $0.005 + detail row $0.007), i.e. ~$5.45 for all 454 — outside this pull's remaining budget, so it was not run; it remains an available follow-up if weights/dimensions are wanted from source instead of estimates.
- **Wave 2 (20 runs):** brand/broad keywords (apple, samsung, sony — 0 rows each; bose, jbl, nintendo — 0 rows, playstation, meta quest, ring security, projector, home theater, cell phone — 0 rows) + maxPages-4 deepening of headphones, tablet, camera, smartwatch, computer accessories, video games, laptop, bluetooth speaker — subtotal **$1.0179**.

## Subcategory coverage (454)

| Subcategory | Count |
|---|---|
| Laptops & computers | 218 |
| Cameras, security & drones | 66 |
| Audio & speakers | 41 |
| Tablets & e-readers | 41 |
| Consoles & gaming (incl. Meta Quest) | 30 |
| Headphones & earbuds | 19 |
| Computer accessories | 17 |
| Smartwatches | 16 |
| Smart home | 4 |
| Phones | 2 |

## Field coverage

| Field | Coverage | Note |
|---|---|---|
| Primary image | **454/454 (100%)** | No-image items excluded at ingest (7 dropped earlier in pipeline; final set is image-complete) |
| Price | 454/454 (100%) | Range $3.99–$5,199.99; 1 zero-price service listing (Vivint) excluded |
| Spanish description | 454/454 (100%) | Rendered from the product name + the PDP's own marketing features — faithful to source copy, no invented specs; English source text kept in `description_en` |
| Brand | 440/454 (96.9%) | |
| Spec attributes (`*_attr`) | 499→454 products carry PDP spec blocks (screen, processor, storage, battery…) | Stored in `specs` |
| Compare-at price / on-sale | 51/454 (11.2%) | Truthful: only where listPrice > salePrice. Costco mostly sells at one price, so low compare-at is the store's reality, not a capture gap |
| Dimensions | 14/454 (3.1%) | Only where search rows carried dimension attrs |
| **Weight** | **0/454 (0%)** | **Blocker — see below** |
| **GTIN/barcode** | **0/454 (0%)** | Search rows return empty `skus` arrays; the actor exposes no UPC in search mode |
| 110V-only flag | 0 flagged | Search data carries **no voltage specs at all**, so the flag had nothing to bite on — mains-powered items will need the voltage gate applied at slice time from PDP visits |

## Dedupe vs staged `costco-catalog.json`

Matched on `itemNumber` against all 1,396 staged items: **437 new, 17 refreshed**. (`stagedStatus` per product in the dataset.)

## Blockers / honest gaps

1. **Yield 454 vs ~700 expected.** The spec estimate assumed a deeper online electronics bench than Costco.com actually exposes to search: several brand keywords return 0 rows (apple, samsung, sony, nintendo, cell phone, ipad, apple watch), and most category searches exhaust before 48 rows. 454 is the real, deduplicated, in-scope universe this route can see — a ~10× lift over the 46 electronics items the staged file carried, but short of the estimate.
2. **Weight = 0%.** Search-mode rows carry no weight field (only a `variableWeight` boolean). The actor's `productDetails` mode was mis-invoked in this pull (it takes one `productId` per run; see correction above), so source weights were not captured. Options: standing estimate doctrine at ingest (similar-product estimates, flagged), or a correctly-invoked details pass at ≈ $0.012/item (~$5.45 for the full set; less for a subset).
3. **Phones ≈ empty by nature.** Costco sells phones mainly through carrier/mobility arrangements; the "iphone" search returns the Apple ecosystem (iPads, AirPods, Watches) but no sellable iPhone SKUs. Costco cannot fill Aria's phone aisle — that aisle belongs to Walmart/BrandsMart/Micro Center in this wave.
4. **Laptop skew (218).** Costco's online electronics bench is genuinely laptop-heavy (many configurations of the same models). All are distinct SKUs/configurations and were kept; the slice step may want model-level grouping.

## Addendum — DETAILS PASS (2026-10-28, follow-up)

The correctly-invoked details pass was run under the electronics wave ceiling (cap $6.50 for this pass). **Verdict: the route is dead for enrichment — stopped at the pilot gate, cap preserved.**

- **Invocation (schema-verified):** `operation: "productDetails"`, singular `productId` = itemNumber, country US / en-US. Scripts: `run_details.py`, `run_control.py`, `merge_details.py`; raw rows in `details/<itemNumber>.json`; verdict in `details_pilot_verdict.json`; all runs appended to `runs.json` (phases `details-pilot` / `details-control`).
- **Pilot (10 products, $0.0500):** every run SUCCEEDED and returned exactly 1 row in genuine productDetails mode — but the rows are structurally identical to search-mode rows: `skus: []`, `item_manufacturing_skus: null`, the only "weight" keys are the `variableWeight` booleans, no dimension fields, no GTIN/UPC anywhere, no voltage text. Pilot skew noted (8× headphones, HomePod, charging stand, AppleCare), so one **control run on a MacBook laptop (item 2046717, $0.005)** was added: richer `*_attr` specs (screen size, processor, connectivity) but still **no weight value, no dimensions, no GTIN, no voltage, empty skus**. The actor mirrors Costco's catalog API; it does not expose the PDP specifications block at any product class.
- **Spend: $0.055 total for this pass** (11 runs × $0.005 — actual billed cost was the run-start fee only) of the $6.50 cap. The remaining **443 products were NOT run**. (runs.json's details-phase lines total $0.060 because they include the original pull's $0.005 mis-invoked pilot.)
- **Coverage after the pass (unchanged):** weight **0/454 (0%)**, dimensions **14/454 (3.1%)**, GTIN **0/454 (0%)**. Voltage findings: **none** — no voltage spec exists anywhere in the returned data, so the 110V gate still has nothing to bite on from this source.
- **Merge:** nothing to fill. The 11 attempted records carry a `detailsPass` note (fields gained: none) and `dataset.json` carries a top-level `detailsPass` block; all pre-existing fields untouched.
- **Consequence:** source weights/GTINs for Costco electronics must come from elsewhere — the standing estimate doctrine at ingest (similar-product estimates, flagged, comparable source recorded), or a PDP-level route outside this actor. Do not re-run this actor's productDetails mode for enrichment; it cannot return the fields.

## Files

- `dataset.json` — 454 normalized products (name, brand, price, compare-at, on-sale, image/images, ES+EN descriptions, marketing features, specs, subcategory, staged new/refreshed status, source queries, full raw row per product).
- `excluded.json` — 240 excluded items with reasons.
- `raw/` — 51 per-keyword raw dataset files. `runs.json` — every run (actor, run ID, items, cost). `run_wave.py` / `run_wave2.py` / `build_dataset.py` — the exact pipeline.

# Walmart electronics pull — 2026-10-28

Danny's order (2026-10-28 09:53 EDT): a THOROUGH Walmart electronics pull to replace the
140-item skim the general pull produced, and to stock the Electrónica aisles
(headphones / phones / laptops / tablets / consoles / watches / cameras / audio)
for the post-Best-Buy replacement wave (spec:
`../../files/electronics-sourcing-replacement-2026-10-28.md`, Walmart line).

**Result: 5,407 sellable electronics products for $38.51 — under the $45 hard cap
($6.49 to spare), vs the spec's estimate of $22.50–45 for ~5,000 expected yield.**

## Deliverable

- `walmart-electronics-dataset.json` — 5,407 normalized products (Oct-27 schema:
  name, brand, model, price, listPrice, onSale, discountPercent, image(s),
  description, gtin/upc, sku/usItemId/productId, rating, reviewCount, inStock,
  condition, seller/sellerType, categoryPath, variants, url) plus pull extras:
  `subcategory`, `voltageFlag110Only` + `voltageEvidence`, `catalogStatus`
  (NEW/REFRESHED vs the live catalog), `dataSources`.
- `excluded.json` — 591 candidates dropped at classification, with reason.
- `work/` — all raw datasets (discovery/, discovery2/, discovery3/, details-sian/,
  details-ec/), scripts (drive.py, prefilter.py, detail_pass.py, ec_topup.py,
  normalize.py, classify.py), manifests and collector logs.

## Funnel

| Stage | Count |
|---|---|
| Raw discovery rows (category crawls + search + subcategory crawls) | 7,654 |
| Unique products after dedupe (usItemId/productId) | 6,389 |
| Prefilter-excluded as non-electronics noise (food 202, CD/DVD media 119, toys 61, services/beauty 9) | −391 |
| Candidates sent to PDP detail pass | 5,998 |
| Scope-excluded at classification (non-electronics noise 435, freight-risk 108, TVs 30, large appliances 18) | −591 |
| **Final dataset** | **5,407** |

Raw rows landed on the spec's ~7,500 target; final yield beat the ~5,000 expectation.

## Coverage by subcategory (final)

| Subcategory | Items | | Subcategory | Items |
|---|---:|---|---|---:|
| Consoles & gaming | 713 | | Audio | 436 |
| Cameras (incl. security/dash/action, drones) | 664 | | Phones | 427 |
| Headphones | 646 | | Networking | 406 |
| Watches (smartwatches/trackers) | 475 | | Accessories (cables/chargers/cases/PC peripherals) | 358 |
| Laptops & computers | 474 | | Tablets | 321 |
| Monitors (≤27″ only) | 443 | | Other electronics | 44 |

## Data quality (final 5,407)

- **Images: 100%** — no-image items were excluded at the gate (doctrine).
- **Descriptions: 100%** carry the PDP's own short description (faithful source
  text; Spanish rendering is the downstream translation batch, same as the
  Oct-27 wave deliverables).
- **UPC/GTIN: 71.3%** — sian detail pass captured 55.7%; an e-commerce-actor
  top-up over the 2,395-item gap lifted it to 71.3%. The rest are PDPs that
  expose no UPC to either actor (mostly marketplace long-tail).
- **Compare-at price (listPrice): 28.1%**; **onSale (listPrice > price): 1,512
  items**, flags computed from real prices only.
- **In stock: 63.9%** (OOS kept with flags, Oct-27 practice; 93 items are
  variant parents with null price, flagged via availability).
- **Refurbished / open-box / pre-owned: 557 items**, condition carried in data.
- **110V-only flags: 10 items** (see list below) — flagged, not excluded, per spec.
- **Weights/dimensions: 0% captured — neither Walmart actor surfaces PDP spec
  tables.** This is the one pull-standard field the route could not produce;
  weights fall to the standing estimado doctrine at slice time.
- **Dedupe vs existing catalog:** 5,404 NEW / 3 REFRESHED against the 10,849
  Walmart rows in the live search index (title-match method; the old general
  pull's electronics were a different thin skim, so near-total novelty is real).
- Seller mix: 14.1% Walmart.com first-party; the electronics long tail is
  marketplace-heavy. `seller`/`sellerType` are in the data so the slice step
  can prefer first-party for buy-reliability.
- Residual noise: a small share (~2–4% by spot sample) is cross-filed at the
  margins (e.g. a keyboard under Tablets via a bundle path). Category paths
  are preserved per item for the slice step's own routing.

## 110V-flagged items (flag110Only = true)

Pyle PT260A home audio receiver (×4 SKUs, 120V) · Supersonic SC-1424SB soundbar
(110V) · CyberPower CPS1215RM PDU (120V) · Omada 16-port managed switch (120V) ·
Liebert Micro Pod 3kVA PDU (120V) · Rockville RockNGo 800 karaoke system (110V) ·
Singtronic KSP-3500Pro karaoke processor (115V). All other mains items either
show wide-range/dual voltage or carry no voltage text on the PDP.

## Run log (every run; actor, run id, items, cost)

Rates on this account: sian.agency category/search row $0.0014, product detail
$0.0032, start $0.0005; e-commerce PDP $0.0036/item. Every run carried a
maxTotalChargeUsd cap sized to its batch.

| # | Phase | Actor | Run id | Items | Cost USD |
|---|---|---|---|---:|---:|
| P1 | Pilot — Electronics dept crawl, 3 pp | sian.agency/walmart-data-scraper | A0iodPwAQh0ZHhKyj | 130 | 0.1825 |
| P2 | Pilot — PDP details ×9 | sian.agency/walmart-data-scraper | QgwaQQY2w3QQGmU3M | 9 | 0.0293 |
| P3 | Pilot — PDP details ×9 (UPC check) | e-commerce/walmart-product-detail-scraper | jbG1lSO0WbGR8fZpW | 9 | 0.0325 |
| D1 | Category 3944 Electronics, best_seller | sian | xqitiqKMcQdMldhGr | 409 | 0.5731 |
| D2 | Category 3944 Electronics, price_low | sian | SLN9U2gPO5qdmjyP7 | 399 | 0.5591 |
| D3 | Category 976759 Cell Phones | sian | zSE7Mf1cPLG1frVQf | 373 | 0.5227 |
| D4 | Category 2636 Video Games | sian | TafJVIVH5jNv9wU9u | 386 | 0.5409 |
| D5 | Search ×10 queries (smartwatch, security camera, drone, monitor, router, speaker, soundbar, camera, headset, tablet) | sian | cpn4eHDvKzlJ8cbsg | 1,212 | 1.6973 |
| W2 | Search ×28 queries (aisle-targeted) | sian | 8M5KgACstYFUQJ7qH | 3,277 | 4.5880 |
| SC | Subcategory crawls ×4 (smartwatches, monitors, routers, audio) | sian | ag6iRC44qKUE5tEcf | 1,598 | 2.2377 |
| T1-1..4 | PDP details, batch 1 (1,979 ids) | sian | ZVs2tGRySM0NSWfpc / iKLxOMh7JwlqJujdT / UP9sseIEcWKRFNTpu / vWUKokYrWQYpi6gfa | 1,979 | 6.3284 |
| T2-1..6 | PDP details, batch 2 (2,542 ids) | sian | BkEGCaEMLPNN74Svn / 1A5n7nBVBRhdqArdm / ykFbV0mvTp1fMFK3v / J5bOc8a8uxJaNX5wt / ubSFAGN7wkZLWbavR / 7cf4G8VyvHZBL0W5s | 2,539 | 8.1278 |
| T3-1..4 | PDP details, batch 3 (1,442 ids) | sian | BFMur4m0SAKwcZyP2 / oMe1aOv9NjSNHCmD9 / jEVRHMPaqObP9oXWr / 2VSLmzRyXoKO0Nf75 | 1,440 | 4.6100 |
| E1..6 | UPC top-up over UPC-missing items (2,362 urls) | e-commerce | fXfEoqhHglUHgwIgn / bmFT2bisFVdk0PNcE / 2ddbIIedIr9czm2Cy / NbX27ytZFkpdMVtAB / aDbegHgLZNzgcsWnV / VAgboc61E0a851Dex | 2,355 | 8.4785 |
| | **TOTAL** | | | | **38.5078** |

Route findings that shaped the pull: (1) Walmart's own browse caps each
category view at ~400 rows regardless of pages requested — depth came from
many views (departments × sorts, 38 search queries, subcategory paths), not
from paging one view; (2) department pages are polluted with grocery/media/
toy placements — classification was done from each PDP's own category path,
not from the crawl the row arrived on; (3) neither actor returns weight,
dimensions or spec tables for Walmart PDPs.

## What blocked full coverage

- Nothing blocked the pull itself. The spec's ~5,000 yield was exceeded.
- Weights/dimensions are structurally unavailable from Walmart PDP actors
  (noted above) — estimado doctrine at slice time is the path.
- UPC ceiling ~71% is a PDP-exposure limit, not a route failure.

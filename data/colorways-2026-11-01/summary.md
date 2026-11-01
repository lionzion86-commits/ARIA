# Shoe + clothing colorway pulls — summary (2026-11-01)

Data only. No catalog files were edited, nothing pushed to GitHub, no PRs opened.
All files live in this directory (`color-pull-2026-11-01/`). Census detail: `census.md`.

## Money spent (ACTUAL, from Apify run records — never estimated)

| Run | Actor / route | Run id | Items | Actual cost |
|---|---|---|---|---|
| Kohl's pilot (30 URLs) | axlymxp/kohls-product-scraper | 59IMsQqluRnx5BkC9 | 30 | $0.11 |
| Kohl's batch 1 (1,964 URLs) | axlymxp/kohls-product-scraper | Ec64smwFhk8z2KbVc | 1,907 returned | $5.74 |
| Kohl's batch 2 (1,963 URLs) | axlymxp/kohls-product-scraper | sl3c6r2va6Ja3K1th | 1,751 returned | $5.27 |
| All Shopify `/products.json` pulls (21 stores) | store's own public feed (the route the catalogs were built from) | — | 74,163 products | $0 |
| Zumiez GraphQL category + search crawl | zumiez.com/api/graphql (route proven 2026-10-05) | — | 9,340 products | $0 |

**TOTAL ACTUAL SPEND: $11.12** (Kohl's only; every other route was free).

Every Apify run carried a maxTotalChargeUsd cap ($12 per Kohl's batch; $25 ceiling respected —
no batch came close: full Kohl's coverage of all 3,927 shoe/clothing URLs costs ≈ $11.60 total,
well under one $25 cap). Shopify and Zumiez routes are free.

## Proof case — Adidas Samba OG at CCS: PASSED, and the premise needed one correction

The task premise said we hold exactly 1 women's Samba OG listing (CCS, black palette).
The catalog actually holds **3** women's colorways (plus 1 men's, 1 unisex, 1 kids').
The live CCS feed sells **6** women's colorways right now, each with its own photos and a
per-colorway size run (full variant detail in `proof-ccs-samba-og-womens.json`):

| Colorway | Price | Status vs catalog |
|---|---|---|
| Ftwr White / Frozen Purple / Night Indigo | $99.95 | **MISSING from catalog** |
| Ftwr White / Wonder Quartz / Brown | $99.95 | **MISSING from catalog** |
| Supercolor / Wonder Beige / Tent Green | $109.95 | **MISSING from catalog** |
| Supercolor / Off White / Bliss Pink | $109.95 | **MISSING from catalog** |
| Core Black / Wonder White / Silver Metallic | $49.00 (was $99.95) | held |
| Ftwr White / Silver Metallic / Grey | $70.00 (was $99.95) | held |

One held colorway (Cream White / Core Black / Sand Strata) no longer appears in CCS's live
feed. The route enumerates exactly what the doctrine requires: per-colorway price, photos and
sizes. The gap is real even at the proof store — 4 of 6 live colorways were missing.

## Per-store results

### Kohl's — richest route in the fleet (dataset-kohls.json)
The actor returns, per product: `colors[]` (the FULL family color list), `swatches[]`,
`display_color` (which colorway our held listing is), and `sku_ids` — i.e. the complete picker
data for every held listing in one pass, no sibling-hunting needed.
- Batch 1: 1,907 of 1,964 URLs returned; 1,838 carry a color list; 1,258 carry 2+ colorways;
  **8,746 colorways enumerated**; median 5 colorways per multi-color product.
- Batch 2: 1,751 of 1,963 URLs returned; 1,718 with color lists; 1,255 with 2+ colorways;
  6,766 colorways enumerated.
- **Combined: 3,658 of 3,927 URLs returned (269 dead/removed at Kohl's); 3,556 products carry
  a color list; 2,513 carry 2+ colorways; 15,512 colorways enumerated in total.**

### Shopify-feed stores (dataset-<store>.json, full live feeds)
Two kinds of colorway data come back: (a) sibling products per family (skate/DTC model —
each colorway is its own product), and (b) products whose own record carries a multi-value
Color option (in-record picker data). "Extra" = colorways live in the feed beyond the count
we hold for families present in both.

| Store | Feed products | In-record color-option products | Shared families with more colorways live | Extra colorways surfaced |
|---|---|---|---|---|
| ccs | 18,750 | 5 | 527 | **811** |
| surfstation | 7,626 | 25 | 110 | 134 |
| islandwatersports | 9,671 | 2,351 | 84 | 93 |
| silviatcherassi | 951 | 1 | 42 | 55 |
| mainland | 2,331 | 934 | 39 | 49 |
| valsurf | 3,610 | 14 | 38 | 48 |
| hatch | 557 | 0 | 27 | 30 |
| johannaortiz | 723 | 0 | 14 | 20 |
| patbo | 729 | 0 | 5 | 5 |
| vix | 1,716 | 0 | 5 | 5 |
| aguabendita | 369 | 0 | 3 | 3 |
| eberjey | 802 | 0 | 2 | 3 |
| kindredbravely | 982 | 0 | 3 | 3 |
| montce | 1,713 | 31 | 3 | 3 |
| momcozy | 415 | 118 | 2 | 2 |
| tns | 1,502 | 1 | 1 | 1 |
| ancora | 545 | 0 | 0 | 0 |
| capittana | 477 | 0 | 0 | 0 |
| farmrio | 1,493 | 0 | 0 | 0 |
| quietstorm | 451 | 222 | 0 | 0 |
| **Total (20 stores)** | **55,413** | **3,702** | **905** | **1,265** |

Notes: CCS's live feed is far larger than our Sep-26 pull (18,750 products vs 6,565 held) —
12,406 feed families aren't in our catalog at all; that's catalog staleness, separate from
colorways. The swim/latino/maternity DTC stores genuinely sell most styles in a single
colorway/print — their near-zero "extra" matches the census caveat, and the datasets stand as
the verification. quietstorm/islandwatersports/mainland/momcozy carry their colorways INSIDE
the product record (multi-value Color option) — 3,702 such products now have direct picker data.

### Zumiez — done (dataset-zumiez.json, $0)
GraphQL crawl of the full shoe (3,752) + clothing categories plus 15 brand searches:
**9,340 unique products**. Verified en route: Zumiez models colorways as separate products
(color is not a configurable axis — a Samba OG PDP query returned SimpleProduct siblings),
so the family data IS the product set. The feed groups into 634 multi-colorway families;
of the families shared with our catalog, **64 have more colorways live than we hold —
+157 colorways**. (Only 489 of 1,714 held families still match the live assortment by name;
Zumiez rotates stock hard — the dataset is the current family source either way.)

## Census-only stores — no proven variant route (precise negatives)

- **SNIPES (213 suspected gaps, the worst in the census):** both routes in the repo's pull
  history were tried in Oct 2026 and returned **zero variant data** — `digital_influx/product-data`
  (JSON-LD carries no variations) and `constructive_calm/ecommerce-product-scraper-pro` in
  browser mode ("Salesforce variation data not traversed"). A digital_influx rerun
  (~$0.004 × 4,907 shoe/clothing listings ≈ **$19.60**) would buy titles/prices we already
  hold and still no colorways. Not run.
- **Farfetch (38) / SSENSE (25) / Revolve (17):** enterprise feed actors; no variant fields in
  any historical output in the pull history. Not run.
- **Crocs (79):** catalog came from the Algolia product index, but the pull code/keys are not
  in the repo's pull history (only the output survives); the later PDP size-scrape route was
  bot-blocked (crocs-browser-blocked-2026-10-03.json). No substitute route used.
- **Walmart / Macy's / Target / Dick's / Foot Locker / Finish Line / DSW / VS / Skims and the
  remaining feed catalogs:** no proven colorway-detail route in the pull history (their proven
  actors are search/feed class without variant enumeration for apparel; Walmart's proven detail
  actor is being exercised for makeup by the sibling shade-pull job, not here). Census numbers
  for all of them are in `census.md`. DSW's committed catalog is an empty stub (0 items), so
  there is nothing to gap against.

## What this closes and what remains

Closed with data in hand: Kohl's full shoe/clothing color lists (3,658 products, 15,512
colorways enumerated), CCS proof + 811 extra colorways across 527 families, 1,265 extra
sibling colorways across the Shopify fleet, 3,702 in-record color-option products, and the
Zumiez family set (9,340 products, +157 colorways on shared families).
New sibling colorways surfaced beyond what the catalog held, counted without overlap:
**≈13,400** — Kohl's ≈11,956 (15,512 enumerated minus each product's own held colorway) +
1,265 Shopify-fleet siblings (CCS's 811 included) + 157 Zumiez — plus picker-ready
in-record color options for 3,702 products. Total actual spend: **$11.12**.
Still uncovered: SNIPES (needs a route that can traverse Salesforce variation data — a new
actor approval, est. ~$20 for a full rerun that only pays off if the actor exposes
variationAttributes), Farfetch/SSENSE/Revolve, Crocs, and every non-Shopify department-store
catalog. Those remain census-only until a proven route exists.

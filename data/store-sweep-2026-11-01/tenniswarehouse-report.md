# Tennis Warehouse — catalog assembled from already-pulled raw data (2026-11-01)

**Zero new spend.** This catalog was assembled locally from the raw rows pulled
earlier on 2026-11-01 (the $13.37 pull documented in `report.md`). No Apify
actor was run and nothing was scraped for this assembly. Scope note: Danny's
"take Tennis Warehouse out" call was reversed the same evening — the store is
to be STOCKED. This file supersedes the "no catalog will be assembled" line in
`report.md` §3.

- **Output file:** `pulls/tenniswarehouse-catalog.json` (10,551,981 bytes)
- **Envelope:** identical to the validated `pulls/dsw-catalog.json` —
  `generatedAt` / `source` / `declaredProductCount` / `retailers.tenniswarehouse`
  with `label` + `departments`, same item schema and field order as DSW.
- **Assembler:** `work/assemble-tw.py` (adapted from the earlier worker's
  `work/ingest-tw.py` — same pooling/dedupe/department logic — plus the two
  pieces that script lacked: `weightKg` estimation and the accounting below).

## Counts

| | |
|---|---|
| Raw rows in (23 `work/raw-tw-*.json` files) | 6,808 |
| Unique product URLs after dedupe | 5,077 |
| Dropped (no price in any pulled copy — same drop rule as DSW) | 101 |
| **Products published** | **4,976** |
| On sale (with a real was-price in `originalPrice`) | 1,717 |
| Price range | $2.99 – $859.20 |

Declared count in the envelope equals the actual item count (verified by
re-loading the written file). Every item carries: name, real
tennis-warehouse.com PDP URL, USD price, hero image + gallery, and an
estimated `weightKg` (`weightEstimated: true`).

### Per department

| Department key | Label | Items |
|---|---|---|
| raquetas | Raquetas de tenis | 406 |
| zapatos-hombre | Zapatos de hombre | 438 |
| zapatos-mujer | Zapatos de mujer | 376 |
| zapatos-junior | Zapatos de niños | 51 |
| ropa-hombre | Ropa de hombre | 663 |
| ropa-mujer | Ropa de mujer | 1,136 |
| ropa-junior | Ropa de niños | 249 |
| cuerdas | Cuerdas | 850 |
| bolsos | Bolsos y mochilas | 269 |
| pelotas | Pelotas de tenis | 221 |
| grips | Grips y overgrips | 235 |
| accesorios | Accesorios | 82 |

Departments are assigned by what the product IS (harvest page type first,
then product name) — never by brand — same rule as the DSW ingest.

## Field completeness (of the 4,976 published)

| Field | Present | Missing | Note |
|---|---|---|---|
| name / url / price / image | 4,976 | 0 | required for publication |
| images (gallery) | 4,976 | 0 | 3,607 items multi-photo |
| description | 4,955 | 21 | trimmed to first sentences, `descriptionSource: "tenniswarehouse-listing"` |
| availableSizes | 3,155 | 1,821 | `sizeSource: "none"` where absent — unlike DSW, most TW products DO carry real sizes (for shoes these are shoe sizes; for racquets, grip sizes) |
| reviewCount | 3,383 | 1,593 | as exposed by the source |
| rating | 1,921 | 3,055 | as exposed by the source |
| sku | 4,210 | 766 | from the actor's sku / "Stock #" spec where present |
| originalPrice | 1,717 | — | only on sale items; was-prices >10× the sale price were quarantined (repo rule) |

One data repair during assembly: the actor's gallery field mixes plain URL
strings with `{"url": …}` objects (17,866 entries). All were normalized to
plain strings, matching the DSW schema — no URLs were added or invented.

## Weights — estimated, the DSW way

No raw row carries a real weight, so every item's `weightKg` is a
category-based base weight padded by the 1.10× cushion, flagged
`weightEstimated: true` (same method and value scale as the DSW catalog):

| Category | Base → weightKg |
|---|---|
| Shoes (men/women) | 1.0 → 1.10 |
| Shoes (junior) | 0.5 → 0.55 |
| Racquets | 0.5 → 0.55 |
| Apparel | 0.4 → 0.44 |
| Ball cans | 0.4 → 0.44 |
| Bags | 0.9 → 0.99 |
| Strings / grips (sets) | 0.1 → 0.11 |
| Accessories | 0.2 → 0.22 |
| String reels (307 items, name-matched) | 1.5 → 1.65 |
| Ball cases (43 items, name-matched) | 1.5 → 1.65 |

## Known coverage gaps (honest — from the pull, not the assembly)

- The final top-up batch (string reels, ~$0.89) completed on Apify's side but
  its dataset was **never downloaded**, so those rows are not in this catalog.
- Three planned top-up batches (stringing machines / reel categories,
  overgrips, grip facets) were never started: `accesorios` is thin (82 items)
  and contains **no stringing machines**.
- 101 of the 5,077 unique URLs had no price in any downloaded copy and were
  dropped rather than priced by guesswork.

## For Chad — wiring `assets/tienda/tenniswarehouse/`

- Wire from `tenniswarehouse-catalog.json` exactly as DSW was wired from
  `dsw-catalog.json` (storefront data + `assets/tienda/_fn/tenniswarehouse.json`).
- Retailer key: `tenniswarehouse`, label "Tennis Warehouse". The 12 department
  keys/labels are in the table above.
- Sizes are real for 3,155 items — the variant picker has data here (unlike
  DSW); `sizeSource` says where they came from.
- All weights are estimates (`weightEstimated: true`) — the PDP/checkout
  estimator flow should treat them exactly like DSW's.
- Nothing in this delivery touches the repo; the DSW and BBW files were not
  modified.

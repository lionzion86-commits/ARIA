# SNIPES PDP pass — sizes + compare-at prices (2026-10-28)

**Status: COMPLETE.** Both gaps from the 2026-10-27 pull are closed: size runs and
compare-at (sale) prices captured for effectively the full 5,000-product set.

## Headline numbers (verified by independent recount of the raw output)

| Metric | Count | Share |
|---|---:|---:|
| Products in scope (all pulled URLs) | 5,000 | — |
| PDPs fetched successfully | 4,998 | 99.96% |
| Fetch failures | 2 | both HTTP 410 (product gone from snipesusa.com) |
| **With a size run** | **4,946** | **99.0% of fetched** |
| With ≥1 size in stock on the page | 4,900 | 98.0% |
| Size run present, every size out of stock | 46 | 0.9% |
| With a selling price | 4,876 | 97.6% |
| **On sale (compare-at > price)** | **2,464** | **49.3% of fetched** |
| Average discount on sale items | 49.1% | — |
| Price hidden by SNIPES itself ("See Bag For Price") | 111 | flagged, never guessed |
| Neither a size run nor a sale price | 34 | one-size accessories etc. |

Price drift vs the Oct-27 dataset: only **5** products differ (in every case the PDP
price is now *higher* — e.g. Air Griffey Max 1 $139.99 → $170.00 — consistent with
promotions ending after the original pull). For the other 4,871 priced items, the PDP
selling price matches the dataset price exactly.

## Route used — and why

Local HTTP extraction of the **server-rendered** Salesforce Commerce Cloud PDPs
(`extract.py` in this folder). The two actor routes were already disproven for this
data (see the 2026-10-27 pull summary): `digital_influx/product-data` reads JSON-LD
only (that is precisely the blind spot — no variants, no compare-at), and
`constructive_calm/ecommerce-product-scraper-pro` in PDP details mode returned
shells without traversing SFCC variation data. SNIPES PDPs are server-rendered, so
the variation buttons and both price elements are in the initial HTML — an actor
adds cost here, not capability. Total Apify spend for this pass: **$0.00** (cap $25).

### Exact fields (pilot-verified before the full run)

- Selling price: `.sales .value` → its `content` attribute, inside `js-price-container`.
- Compare-at / list price: `.strike-through.list .value` → `content` attribute
  (present only when the item is discounted; `onSale = listPrice > salesPrice`).
- Size run: every `button.size-attribute` → `aria-label="Select Size X"`;
  `availableSizes` = the subset whose button is not `disabled` on the page.

### Pilot evidence (52 PDPs, run before the full sweep, $0)

- 52/52 fetched, 0 errors; both ground-truth products matched hand inspection exactly;
  0/52 selling-price mismatches vs the dataset; 20/52 on sale in the pilot.

### Samples from the final data

1. **Heritage 6-Inch Waterproof Boot** (Timberland) — sizes 7.5, 8, 8.5, 9, 9.5, 10,
   10.5, 11, 11.5, 12, 13, 14 (only 8 in stock) — **$129.99 vs list $250.00**.
2. **Air Jordan 5 Retro** — sizes W6–W13.5 — **$119.99 vs list $205.00** (−41.5%).
3. **Chuck Taylor All Star Lift Platform** (Converse) — sizes W6–W11 —
   **$39.99 vs list $80.00** (−50.0%).
4. **Philadelphia Eagles Mash Up Hoodie** (Pro Standard, not on sale) — sizes
   S, M, L, XL, 2XL, 3XL — $130.00, no compare-at (correctly none).

## Failure classes & incidents (all handled, none silent)

- **HTTP 410 ×2** — product pages gone; recorded as errors, nothing fabricated.
- **HTTP 301 ×18** — original URLs redirect to the same products' canonical PDPs;
  re-fetched following the redirect; sizes/prices captured; each record carries
  `redirectedTo` so the hop is auditable. (9 of the 18 are "See Bag For Price" items.)
- **"See Bag For Price" ×111** — SNIPES hides these prices on the page itself
  (MAP-style). Recorded with `priceNote: "see_bag_for_price"`; the Oct-27 dataset
  price remains the only figure for them — do not treat these as verified on the PDP.
- **Mid-run fetch collapse + recovery:** after ~3,100 PDPs the CDN began truncating
  urllib responses (`IncompleteRead`) under load; ~1,657 fetches failed and were
  initially mis-recorded as empty pages (a parser bug — failure strings were treated
  as HTML; fixed, and the raw pre-clean file is kept as
  `full_results_raw_with_failures.jsonl` for audit). The run was cleaned, the fetcher
  switched to curl (HTTP/2 gets the full body), and the remainder completed at
  ~110/min with zero further errors. Final file independently recounted: 5,000 lines,
  5,000 unique URLs.
- **Price drift ×5** — listed above; the PDP figures are today's page truth.

## Deliverables in this folder

- `dataset.json` — enriched per-product records joined to the Oct-27 pull
  (url, sku, name, brand, datasetPrice, salesPrice, listPrice/compareAtPrice,
  onSale, discountPercent, sizes, availableSizes, priceNote, fetchError).
- `full_results.jsonl` — the raw pass output (one record per PDP).
- `stats.json` — the counts above. `extract.py` / `analyze.py` — the exact tooling
  (resumable; re-running refreshes prices/sizes from the live pages).
- `pilot_results.json` — the 52-PDP pilot evidence.

## Cost log

| Item | Actor / route | Items | Cost |
|---|---|---:|---:|
| Pilot | local curl/urllib extraction | 52 | $0.00 |
| Full sweep + recovery + redirect pass | local curl extraction | 5,000 | $0.00 |
| Apify runs | none | — | $0.00 |
| **Total** | | | **$0.00 of $25 cap** |

## Notes for the build (Chad)

- `sizes` is the full rendered run for the colorway in the URL; `availableSizes` is
  the in-stock subset at fetch time (2026-10-28) — availability will drift.
- The Ofertas rail can now be built for real: 2,464 sale items with verified
  compare-at prices, average −49%.
- Treat the 111 "See Bag For Price" items and the 5 drifted prices as flagged, not
  verified.

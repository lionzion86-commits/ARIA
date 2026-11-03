# Shade data pull — FINAL report, Tue 2026-11-03

## Bottom line

**The full pull ran. 712 product families, 10,499 shades captured, in Chad's
ingest shape, ready to drop.** Total actual spend: **$7.81** (projected
$5–$12 — inside the band, far under the $25 stop line). Account cycle usage:
~$471.19 before → **~$479.00 after**, against the raised $500 hard limit
(limit verified live at $500, ACTORS feature enabled).

| store | worklist | families landed | shades | listings whose own SKU matched | actual cost (settled) |
|---|---:|---:|---:|---:|---:|
| Sephora | 573 | **511** | **7,149** | **505** | ≈ $2.85 |
| Ulta | 180 | **180** | **3,274** | **179** | ≈ $3.30 |
| Walmart | 18 | 8 | 63 | 8 | ≈ $0.10 |
| Costco | 17 | 13 | 13 | 13 | ≈ $0.21 |
| YesStyle | 83 | 0 | 0 | 0 | route failed (see below) |
| Victoria's Secret | 21 | 0 | 0 | 0 | route failed (see below) |
| Macy's | 12 | — | — | — | out of scope (Chad's Route A colorMap) |
| **Total** | **892 pulled at** | **712** | **10,499** | **705 / 892 (79%)** | **$7.81 all-in** |

"Listings matched" = the worklist entry's own shade SKU appears in the pulled
family's variantList — i.e. `ingest-variant-pulls.mjs` will find the family
for that listing and the «Tonos en camino» gate can lift for it.

## Deliverables (this folder)

- `normalized/dataset-sephora.json` — 511 families → drop at `data/shade-pulls-2026-11-03/dataset-sephora.json`
- `normalized/dataset-ulta.json` — 180 families → `dataset-ulta.json` (supersedes last night's 1-family pilot file; pilot evidence stays in `raw/`)
- `normalized/dataset-walmart.json` — 8 families → `data/shades-walmart-2026-11-03/dataset.json`
- `normalized/dataset-costco.json` — 13 families → `dataset-costco.json`
- `raw/` — every actor's raw output, per-run manifests, `final-accounting.json` (all 114 runs with settled costs), `unmatched-listings.json` (the 187 listings that did not match, per store)
- Normalizers: `normalize_sephora.py`, `normalize_ulta.py`, `normalize_costco.py`; runners: `sephora_full.py`, `ulta_full.py`, `costco_full.py`, `small_stores.py`, `canary*.py`

## Per-store notes

### Sephora (573 → 511 families, 7,149 shades, 505 matched)
Actor: `igview-owner/sephora-product-details-scraper`, input `{"productIds": […]}`
— **max 10 IDs per run** (schema rejects more), 58 runs. Two quirks Chad
should know:
1. The actor's `variations` array **never contains the product's own default
   shade** — that shade lives in the item's top-level fields
   (`currentSkuId`, `variationValue`, price, stock, image). The normalizer
   prepends it as a family member. Without this, only ~90 listings would have
   matched; with it, 505 do.
2. **167 products return zero variations, deterministically** (re-pulled all
   167 in a second pass: same result — not flakiness). 105 of them still
   formed single-shade families from the top-level shade. 62 produced no
   family: 52 with no shade data at all (incl. a few empty records, product
   name null) and 10 whose only variation axis at Sephora is **Size**, not
   color (mostly mascaras — Better Than Sex, Lash Idôle, Monsieur Big,
   Perversion…).
- 68 listings unmatched: the 62 above + 6 whose specific shade is neither the
  default nor in a returned variation list.
- A rescue attempt via `sian.agency`'s Sephora extractor was abandoned: it
  defaults to review extraction and its details-mode input key could not be
  confirmed ($0.19 of probes, documented in raw manifests).

### Ulta (180 → 180 families, 3,274 shades, 179 matched)
Actor: `sian.agency` ulta-product-scraper (`fodaJXkH20WYW4W94`), detail mode,
$0.018/product. **Input trap found:** the staged pilot payload inherited the
actor's default category (`/shop/makeup/eyes/mascara`) and would have scraped
100 irrelevant mascaras — the first canary did exactly that and was aborted
at $0.491. The full run passes `"categories": [], "categoryUrls": []` and
pulled exactly the 180 worklist URLs. Every item returned a variant list.
Per-shade prices: Ulta charges one price per product; the actor fills
`list_price` only on the lead variant, so shade prices fall back to the
product's price/sale price (verbatim from the same record). Variant images
use Ulta's canonical per-SKU media URL (verified against all 180 thumbnails).
- 1 unmatched: **Estée Lauder Mini Double Wear foundation** — our listing's
  shade SKU 2657548 is not among the 6 shades the product page lists.
- The NYX Slim Lip Pencil pilot family from last night is inside this pull
  (sian's version, with images) — the gate lifts for Nude Truffle 2226177.

### Walmart (18 → 8 families, 63 shades, 8 matched)
Actor: `e-commerce/walmart-product-detail-scraper` (the 2026-11-01-proven
route), output is natively in the ingest shape. 8 families came back with
full variantLists (COVERGIRL foundations/powder, Revlon Serum Tint,
TRESemmé Root Touch-Up, e.l.f. powders/mascara — 63 shades).
- **10 products returned an empty variantList twice** (deterministic):
  all the L'Oréal hair colors (Excellence ×2, Feria ×2, Preference, INOA),
  Revlon ColorBurst Lipstick, Revlon × Wonder Woman lipstick, e.l.f. Big
  Mood and Lash It Loud mascaras. Walmart groups those page types
  differently and this actor reads no variant data for them. They stay
  gated; listed in `raw/unmatched-listings.json`.

### Costco (17 → 13 families, 13 shades, 13 matched)
Actor: `sian.agency/costco-data-scraper`, `{"operation": "productDetails",
"productId": "<item number>"}` — one product per run. (The e-commerce
vendor's Costco actor was abandoned: Costco's API 403-blocks it outright,
with and without residential proxy.) Costco sells each shade as its own
item number, so families are single-member by the store's own structure:
the shade name comes from the record's `Shade_attr` where present
(e.g. Gucci Rouge Mat = "217 Valeria Rose", Gucci Sheer = "505 Janet Rust",
Tom Ford Soleil = "03 Fireside") or verbatim from the product title;
multipacks carry `multipack_quantity-N` per the README. 4 products have no
price at Costco right now (price-in-cart / not in stock) — their records
carry `priceInfo` only where a price exists.
- 4 failed: Neutrogena Hydro Boost Lip Oil 3-pack and Sacheu Lip Liner
  STAY-N 4-pack (actor returned an empty record twice each); Perricone MD
  No Makeup Mascara and Stila Convertible Color (no shade name exposed in
  the record or the title — nothing invented).

### YesStyle (83 → 0) — route failed
Four actors/routes attempted, all documented in `raw/`:
`abotapi/yesstyle-com-scraper` (4 input variants — it only ever ran its
keyword mode and matched nothing; $0.16 of start fees), `bovi/yesstyle-scraper`
(crashes on URL input), `apify/e-commerce-scraping-tool` (JSON-LD only:
single offer, no variants — the known JSON-LD ceiling), and the pilot's
direct-fetch route (the page renders, but the shade picker options do not).
No actor in the store could be made to return per-variant `pid.` data.
These 83 stay gated; fixing them needs either a custom YesStyle fetcher
(their pages carry the variant pids in page data) or a different vendor.

### Victoria's Secret (21 → 0) — route failed
**No dedicated VS actor exists in the Apify Store** (searched repeatedly).
The generic e-commerce tool sees only microdata (no shades, mostly null
prices); direct fetch hits the same JS wall as the pilot's Ulta pickers.
These 21 stay gated pending a custom route.

## Spend accounting (verified from run objects, `raw/final-accounting.json`)
- Productive store runs: ≈ $6.43
- Route discovery waste (canaries/probes/aborts): ≈ $1.38 — datasaurus
  Sephora canary $0.50 (ignored the URLs, crawled a UK catalog, aborted at
  cap; its variants were name-only strings anyway), sian Ulta category
  canary $0.491 (aborted — see Ulta note), sian Sephora probes $0.19,
  YesStyle probes $0.16, misc $0.03.
- **Grand total: $7.81 across 114 runs.** Baseline cycle usage $471.19 →
  final ≈ **$479.00** of the $500 limit.

## For Chad
Drop the four `normalized/dataset-*.json` files into `data/shade-pulls-2026-11-03/`
(Walmart under its `data/shades-walmart-2026-11-03/` convention), then run
`ingest-variant-pulls.mjs` → `build-pdp-slices.mjs` → `build-price-index.mjs`
→ `build-shade-worklist.mjs`. Expected gate lifts: up to 705 of the 892
pulled listings (Sephora 505, Ulta 179, Walmart 8, Costco 13). The 187 that
stay gated are itemized in `raw/unmatched-listings.json` plus the 83
YesStyle + 21 VS worklist files unchanged. Nothing was pushed or merged;
the website repo was not touched.

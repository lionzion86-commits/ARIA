# FragranceX feed audit — Aria Perfumes ingest prep (2026-10-24)

Scope: identify the authoritative FragranceX wholesale feed, audit it end-to-end, and produce a
cleaned, class-flagged ingest file for the Perfumes section build. Data work only — no repo writes,
no pushes. Zero spend.

**Deliverable:** `aria-perfumes-ingest.json` (this folder) — 10,656 records, 10,653 sellable,
class-flagged, XLS-enriched.

---

## 1. Which file is authoritative — and the pollution verdict

| File | Rows/SKUs | What it is | Verdict |
|---|---|---|---|
| `fragrancex-datafeed-new-2026-10-23.csv` | 10,656 | Full datafeed: description, image, URL, parsed Size / Metric_Size / TYPE, explicit `Wholesale_USD` + MSRP + multi-currency columns | **AUTHORITATIVE — build from this** |
| `fragrancex-enhanced-list-2026-10-23.xls` | 10,706 | FragranceX's own wholesale list ("Updated on 10/23/2026"): Item#, Name, Brand, Size/Type, Gender, Retail, Cost, Discount %, status flags | Verification + enrichment source (no images/descriptions — cannot build PDPs from it) |
| `fragrancex-datafeed-2026-10-23.csv` | 10,653 | Earlier same-day datafeed capture; identical prices, weaker structure (type+size conflated in TITLE, no parsed size) | Superseded duplicate — archive |
| `fragrancex-wholesale-pricelist-2026-10-23.csv` | 9,543 | Lossy transcription of the XLS: dropped Brand, discount % and flags; 1,160 feed SKUs missing | Do not build from it — archive |

**Price verification (the decisive test).** Both known anchors match the true-price session exactly,
in **every** file: Sauvage EDT 3.4 oz = **$150.00**, Aventus EDP 3.3 oz = **$397.00**. Beyond the
anchors, prices were compared pairwise across all four files on every shared SKU:
**30,799 comparisons, 0 disagreements** (10,653 old-feed↔new-feed; 10,650 new-feed↔official XLS;
9,496 pricelist↔new-feed — 100% agreement each).

**Pollution verdict: no file is polluted — there is nothing to quarantine.** The BRL/VAT figures
(Sauvage $314.00 / Aventus $791.99) appear in **zero rows of all four files**. They existed only in
the logged-in web account display documented on Oct 22 and never entered a delivered file. All four
files are price-clean; the new feed is authoritative because it is the only one that is both
price-true **and** PDP-complete.

Enrichment joined from the XLS into the ingest: supplier discount % and status flags for 10,650 of
10,656 SKUs (6 feed SKUs postdate the XLS snapshot; 56 XLS SKUs postdate the feed — normal
same-week drift, no action).

## 2. Audit of the authoritative feed (10,656 rows)

- **SKUs:** 10,656 rows = 10,656 unique ITEM numbers. **Zero duplicate SKU rows.**
- **Near-duplicates:** 119 groups / 238 rows share (brand, name, size, type) under different SKUs —
  e.g. CK One EDT Spray 6.6 oz exists as SKU 400500 @ $23.10 and SKU 400517 @ $25.76. Ingest carries
  a `dup_group` id per group; the write stage should pick a canonical SKU (cheapest sellable) rather
  than render twins.
- **Field coverage:** brand, name, description, type, title, size (oz), metric size, gender,
  wholesale price, image URL, product URL, QTY — **100% on all 10,656 rows.** Missing-image rate: **0%**
  (all images hosted on img.fragrancex.com).
- **MSRP:** present on 6,911 rows (**64.9%**); missing on 3,745 (35.1%).
- **UPC/barcode: 0%** — no UPC column exists in any of the four files.
- **Weight: 0%** — no weight column exists in any of the four files (see §5).
- **Prices (Wholesale_USD):** min $0.00, **max $770.00**, median **$26.00**, mean $47.58.
  - Under $25: 5,157 (48.4%) · $25–49.99: 2,491 → **71.8% of the catalog is under $50 wholesale**
  - $50–99.99: 1,736 · $100–199.99: 937 · $200–1,500: 335 · **Over $1,500: 0** (no band quarantine —
    the single most expensive SKU in the feed is $770)
- **Zero-price rows: 3** — SKUs 551736, 570488, 573359 (all unboxed variants, QTY 1–2, price $0.00).
  Marked `sellable: false` in the ingest; do not list until the supplier prices them.
- **MSRP quirk:** 132 rows have wholesale ≥ MSRP (e.g. Sauvage EDT: feed MSRP $112 < cost $150 — the
  MSRP is stale). Combined with 35.1% MSRP missing, **MSRP must not be rendered as a compare-at price
  without validation**; it is the weakest field in the feed.
- **Stock signal:** QTY = 500 on 6,953 rows (65.3%) — a feed sentinel for "in stock," not a literal
  count; **never display it as a stock number.** Real scarcity exists and is corroborated by two
  systems: feed QTY ≤ 20 on 3,151 rows, and the XLS "S = only a few left" flag on 2,262 feed SKUs,
  99.8% of which have feed QTY ≤ 20 (median 5). XLS letter flags joined (per the sheet's own legend):
  S few-left 2,262 · M >80%-off 586 · B back-in-stock 237 · I price-up >15% 175 · D price-drop >15% 80.
  The M flag checks out: all 584 M-flag SKUs with an MSRP show a computed discount ≥75%.
- **Gender:** Women 6,327 / Men 4,328 (one lowercase "women" normalized). Unisex is encoded in TYPE:
  1,911 rows carry an explicit "(Unisex)" marker (ingest exposes it as a boolean).
- **Concentration** (parsed from TYPE): EDP 5,909 · EDT 2,565 · Parfum/Extrait 679 · EDC/Cologne 547 ·
  none/other 956 (overwhelmingly the fragrance-adjacent forms in §3).
- **Brands: 710.** Top 30 by SKU count:

| # | Brand | SKUs | # | Brand | SKUs |
|---|---|---|---|---|---|
| 1 | Lattafa | 329 | 16 | Montale | 105 |
| 2 | Demeter | 289 | 17 | Xerjoff | 105 |
| 3 | Armaf | 284 | 18 | Hugo Boss | 94 |
| 4 | Al Haramain | 229 | 19 | Risala | 92 |
| 5 | Fragluxe | 194 | 20 | Perry Ellis | 91 |
| 6 | Maison Alhambra | 150 | 21 | Jimmy Choo | 89 |
| 7 | Rasasi | 136 | 22 | Burberry | 82 |
| 8 | Calvin Klein | 133 | 23 | Swiss Arabian | 82 |
| 9 | Hermes | 124 | 24 | Arabiyat Prestige | 81 |
| 10 | Afnan | 120 | 25 | Dumont Paris | 79 |
| 11 | Versace | 118 | 26 | Victoria's Secret | 76 |
| 12 | Carolina Herrera | 115 | 27 | Police Colognes | 76 |
| 13 | Guess | 114 | 28 | Christian Dior | 72 |
| 14 | Paco Rabanne | 113 | 29 | Giorgio Armani | 72 |
| 15 | Dolce & Gabbana | 112 | 30 | Khalis | 72 |

Note the shape: Middle-Eastern houses (Lattafa, Armaf, Al Haramain, Afnan, Rasasi, Maison Alhambra)
dominate SKU count, while the designer brands Peru asks for by name sit deeper in the table — rail
curation should lead with designer recognition, not raw SKU count.

## 3. Classification (every SKU classed; flags non-exclusive, primary class exclusive)

Primary classes — sum = 10,656:

| Primary class | SKUs | Notes |
|---|---|---|
| Retail spray (boxed) | 8,696 | The core lane |
| Fragrance-adjacent | 691 | Lotions, gels, deodorants etc. — classed, not dropped |
| **Tester** | **584** | Own class — see below |
| Mini / travel | 347 | Mini-token 194, travel 22, rollerballs, vials ≤0.34 oz, small non-spray ≤0.5 oz |
| Refill | 130 | 133 flagged; 3 sit under a higher-priority primary |
| Retail non-spray | 98 | Splashes, perfume oils, pure parfum dabs |
| Gift set | 61 | |
| Other | 49 | Mostly supplier title typos ("Eau De Toiette", "Pure Pefume", "Eau Parfumee") + a few antiperspirant/hand-wash — write-stage sweep list |

Flags (non-exclusive): **tester 584 · unboxed 509** · mini 194 · refill 133 · gift set 61 · travel 22.
**Tester discipline:** testers are a separate labeled class in the ingest and are **never merged**
with retail boxes of the same fragrance; they may be sold only with a Tester label on the PDP.
Tester ∩ unboxed = 0 in this feed (unboxed SKUs are their own variants — also labeled, also never
silently merged). Gift set ∩ tester = 0.

Fragrance-adjacent subtypes (741 flagged): body mist 208 · body spray 141 · deodorant 121 ·
shower gel 70 · body lotion 66 · after shave 64 · hair 17 · soap 11 · body cream 11 · powder 8 ·
incense/home 7 · lip 4 · shaving 3 · bath 3 · body wash 2 · body oil 2 · hand cream 1 ·
body butter 1 · candle 1.

## 4. Pricing spot-checks (standing doctrine: tiered margin on source cost; PERFUME PROMO override
= 18% lane-wide for the first 90 days from public launch, then standard; import tax on true goods
value only, never on margin)

Every single-bottle cost in the feed is under $500, so the standard tiered margin is the flat 24%
first bracket per bottle; the promo build is a flat ×1.18. Builds below are **pre-freight** (see §5)
and pre-tax; only Aventus crosses the $200 FOB line.

| Product | SKU | Wholesale | Promo build ×1.18 | Standard ×1.24 | Import tax |
|---|---|---|---|---|---|
| CK One EDT Spray 6.6 oz (200 ml) | 400500 | $23.10 | $27.26 | $28.64 | No (FOB < $200) |
| 1 Million EDT Spray 3.4 oz | 453437 | $54.84 | $64.71 | $68.00 | No |
| Good Girl EDP Spray 2.7 oz (80 ml) | 534193 | $78.11 | $92.17 | $96.86 | No |
| Black Opium EDP Spray 3 oz (90 ml) | 517436 | $87.47 | $103.21 | $108.46 | No |
| Sauvage EDT Spray 3.4 oz (100 ml) | 531619 | $150.00 | $177.00 | $186.00 | No |
| **Aventus EDP Spray 3.3 oz (100 ml)** | 546573 | $397.00 | $468.46 | $492.28 | **Yes — FOB $397 > $200; tax computed on the $397 goods value (+ freight into CIF), never on margin. Oct-23 comparison estimated ~$100 at the checkout model's ~25% CIF estimate** |

## 5. The freight-weight gap (the one real data hole)

- **Weights present: 0 of 10,656 SKUs — in all four files.** UPC likewise 0 of 10,656.
- Freight runs at **$13/kg** and these are glass + liquid: a 100 ml bottle's juice is ~0.1 kg but
  gross shipping weight (glass, cap, box) typically lands at 0.3–0.5 kg → **$3.90–$6.50 of freight
  per bottle** against a $26.00 median wholesale cost. Per-SKU freight **cannot be computed today**;
  the Oct-23 comparison's ~0.4 kg ≈ $5.20 per bottle was a working assumption, not feed data.
- **Fill plan (quantified):** bottle size is a strong weight proxy and the size field is 100%
  populated — 194 distinct sizes, but **45 sizes cover 95% of SKUs** (3.4 oz alone = 4,305 SKUs).
  Size buckets: 2.01–3.4 oz: 6,780 · >3.4 oz: 1,612 · 1.01–2.0 oz: 1,381 · 0.51–1.0 oz: 460 ·
  ≤0.25 oz: 218 · 0.26–0.5 oz: 130 · unparsed: 75.
  1. **Supplier ask:** add per-SKU weight + UPC to the open ticket **#3077845** (the official price
     list requested there is still unanswered; the XLS on file is the periodic wholesale list, not
     that ticket's answer).
  2. **Size-class default table:** weigh or PDP-scrape 3–5 SKUs per each of the 45 core sizes
     (~135–225 sample points) → a default gross weight per (size × form); weigh testers and gift
     sets separately — different packaging.
  3. **Dock calibration:** weigh first real orders at Miami receiving and back-fill actuals.
- Until weights land, the PDP/checkout freight line for perfumes should use the size-class estimate
  (once built) or the conservative per-bottle assumption — that display call belongs to the build,
  but it is flagged here as the section's one open dependency.

## 6. Spanish readiness (write stage does the translating; this is the measured load)

- **Titles:** machine-built from parts (`{Name} {Type} {Size} for {Gender}`) → template translation
  only, zero free text.
- **Names:** 7,242 unique — proper nouns, stay as-is; the "by {Brand}" suffix is a template atom.
- **TYPE strings:** 1,371 unique but fully compositional (~10 concentration/form phrases ×
  modifiers: Tester, Unboxed, Unisex, Gift Set, Refill) → a glossary of ≈40 atoms covers 100%.
- **Gender:** 2 values + the unisex boolean.
- **Descriptions — the only real load:** **7,497 unique texts, 212,851 words** (337,926 words across
  all rows; descriptions repeat across a fragrance's sizes, a ~30% dedupe saving). One one-time
  translation pass, then it is a lookup table.

## 7. Readiness verdict

**READY for the Chad build filing.** Complete: triple-verified true wholesale prices (0 disagreements
in 30,799 comparisons against the supplier's own list), 100% PDP fields (brand, description, image,
size, concentration), testers/unboxed/minis/gift sets/adjacent all class-separated, 3 zero-price SKUs
excluded, 119 duplicate groups flagged, scarcity signals joined. Missing and riding along as build
dependencies, not feed blockers: **per-SKU weights** (freight — §5 fill plan; add weight + UPC to
ticket #3077845), **UPC** (cross-retailer dedupe), **MSRP validation** before any compare-at display
(35.1% missing, 132 inverted), and a standing rule that **QTY=500 is a sentinel, never a displayed
stock count**.

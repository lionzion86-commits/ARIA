# Full #503 no-comparable-tail web-weight harvest — summary

**Date:** 2026-10-26 · **Cost:** $0 (free search/fetch only, no Apify) · **Deliverable:** `weight-tail-full-2026-10-26.csv` (this file's sibling)

## Headline

| | Rows | Unique products |
|---|---|---|
| Tail attempted | 5,773 | 5,771 |
| **Recovered (in the CSV)** | **1,284** | **1,283** |
| Unrecoverable — true "por confirmar" residue | 4,489 | 4,488 |

Overall recovery: **22.2%** of the tail. The sample projected ~41%, but the tail's mix is dominated by lanes that collapsed at full scale (see per-retailer table): fashion (SSENSE 886 rows at 0%, Farfetch 125 at 0%), surf (591 rows at 0.8%), and moto/eyewear, whose catalog rows carry no size/MPN/fitment to pin a variant against. The high-yield lanes matched or beat the sample: B&H 82.5%, Best Buy 70.7%, Walmart Baby 64.3%, Tennis Express 58.6%.

The CSV contains HITs only, one row per `product_id`, columns: `product_id, product_name, retailer, found_weight_raw, found_unit, weight_kind, source_url, source_type, found_weight_kg, estimate_kg_x1.10` where estimate = found × 1.10 (3 dp). `weight_kind` is `item` (746 rows), `shipping` (538 — mostly B&H "Package Weight"), or item with strung/unstrung noted (13 racquets). Every worker fragment is preserved under `harvest/results/b001–b093.csv` for audit; all 93 fragments validate row-for-row against their batch files and cover the tail exactly (0 missing, 0 extra). 1,227+ of the hits' kg conversions were recomputed from raw+unit at merge: **0 mismatches**.

## Failure classes (4,489 miss rows)

| Class | Count | Meaning |
|---|---|---|
| `no_weight_published` | 2,873 | Page(s) found; no weight exists anywhere reachable |
| `ambiguous_variant` | 1,116 | Exact variant unpinnable, per-piece-only, or published figures conflict (incl. 13 Ventura flips, below) |
| `no_page_found` | 500 | No page for the exact product surfaced |
| `blocked` | 0 | — (Walmart.com captcha'd throughout, but mirrors were reachable, so no product died on access alone) |

## Per-retailer results

| Retailer | Attempted | Recovered | Rate |
|---|---|---|---|
| bhphoto | 1020 | 842 | 82.5% |
| ssense | 886 | 0 | 0.0% |
| surfstation | 591 | 5 | 0.8% |
| revzilla | 433 | 12 | 2.8% |
| denniskirk | 296 | 14 | 4.7% |
| smartbuyglasses | 250 | 13 | 5.2% |
| macys | 203 | 39 | 19.2% |
| kohls | 175 | 49 | 28.0% |
| islandwatersports | 162 | 2 | 1.2% |
| costco | 160 | 33 | 20.6% |
| walmart | 154 | 53 | 34.4% |
| farfetch | 125 | 0 | 0.0% |
| newbalance | 108 | 31 | 28.7% |
| miumiu | 95 | 2 | 2.1% |
| montce | 93 | 1 | 1.1% |
| ccs | 91 | 31 | 34.1% |
| revolve | 87 | 10 | 11.5% |
| bestbuy | 75 | 53 | 70.7% |
| parrot | 72 | 1 | 1.4% |
| johannaortiz | 65 | 0 | 0.0% |
| zumiez | 52 | 0 | 0.0% |
| nautilus | 51 | 0 | 0.0% |
| vix | 45 | 0 | 0.0% |
| walmartbaby | 42 | 27 | 64.3% |
| ancora | 42 | 0 | 0.0% |
| valsurf | 41 | 16 | 39.0% |
| boxlunch | 40 | 1 | 2.5% |
| silviatcherassi | 37 | 0 | 0.0% |
| aguabendita | 31 | 0 | 0.0% |
| tennisexpress | 29 | 17 | 58.6% |
| farmrio | 21 | 0 | 0.0% |
| yesstyle | 19 | 0 | 0.0% |
| lillebaby | 14 | 0 | 0.0% |
| capittana | 13 | 0 | 0.0% |
| dicks | 12 | 6 | 50.0% |
| skims | 12 | 0 | 0.0% |
| nanit | 12 | 3 | 25.0% |
| hatch | 12 | 0 | 0.0% |
| samsclub | 10 | 1 | 10.0% |
| *long tail — 20 retailers with <10 rows each* | 97 | 22 | 22.7% |
| **TOTAL** | **5,773** | **1,284** | **22.2%** |

(Row counts; the CSV dedupes the one product_id that appears twice in the tail with a HIT on both copies — the Dream On Me Owen crib — hence 1,283 unique rows shipped. A second duplicated tail id, a Walmart V12 engine kit, missed on both copies.)

## Coordinator reconciliation — Ventura seats (read before wiring)

Batch b040 recorded 13 Picnic Time **Ventura** seat rows as HITs at 6.6 lb (one Amazon ASIN, B004OIAR70, applied across team variants). Batches b041 and b042, working the same Kohl's seat families, found the Ventura's published figures genuinely conflict — 5 lb (Ubuy), 6.6 lb (Amazon), 10 lb (Academy, product weight), 11 lb (manufacturer datasheet) — and failed every Ventura row as `ambiguous_variant` under the method rule *"conflicting published figures for the same exact variant = MISS."* **The strict rule wins: the 13 b040 Ventura rows are EXCLUDED from the CSV** and counted as `ambiguous_variant` above. Kohl's final: 49/175 (28%). The Oniva seat family (consistent 4.35 lb across Dick's + Amazon) is unaffected and stays in. If Danny/Chad prefer b040's item-vs-shipping reading (11 lb = distributor shipping weight), the 13 rows are intact in `harvest/results/b040.csv` and can be re-admitted in one step.

## Caveats Chad should know

1. **B&H bundle SKUs inherit the base product's Packaging Info.** Flagged independently by six B&H workers: for kit/bundle SKUs, the recorded figure is B&H's own published package weight on that SKU's page — in some cases demonstrably the base product's box, not a weighed kit total. The ×1.10 pad applies on top. Disclosed, not hidden.
2. **Weakest single hit:** b019's Bridgestone TW34 (16.6 lb) rests on an MPN 068859 / ASIN match from a Ubuy mirror whose page title reads "TW35". Everything else in the moto lanes failed honestly.
3. **Moto + eyewear residue is a catalog-data problem, not a search failure.** RevZilla (2.8%), Dennis Kirk (4.7%) and SmartBuyGlasses (5.2%) rows carry no size, MPN or fitment, and catalog prices are drifting sale prices (some collide across unrelated products). Several models publish full per-size weight tables — these lanes become recoverable if catalog rows gain size/MPN.
4. **Two retailer labels are not the famous brands:** `parrot` = Parrot Surf & Skate (Mount Pleasant, SC — skate/surf, 1/72) and `nautilus` = Nautilus Spearfishing (dive gear, 0/51; every published weight is flex/size/stiffness-dependent and unpinnable). `zumiez` (0/52) is all sizeless snowboards — real per-size weights exist but catalog rows carry no length and one price for all sizes.
5. **Surf is a write-off by construction:** Surf Station (5/591) and Island Water Sports (2/162) publish volume in liters and rider-weight tables only. All 7 surf hits are NSP manufacturer size-chart Weight rows or a weight stated in a retailer description. Val Surf's 16 hits are mostly Super73 e-bikes and Lift eFoils, not boards.
6. **Generation/revision notes on three hits:** Costco Apple TV 4K weights come from Apple's 3rd-gen (A15) spec pages matching the listings (Apple's current page shows a newer gen at 217 g); the Costco Montecito hot tub uses the manufacturer's 476 lb figure for the exact 45-jet/6-person spec block (a newer manual revision lists 480 lb).
7. **Miu Miu's 2 hits carry an inferred unit.** miumiu.com embeds an Akeneo `Weight` attribute with **no printed unit** (22.0 hair clip, 30.0 claw clip); grams inferred from magnitude. Flagged for re-judgment — drop 2 rows if inferred units are unacceptable.
8. **Single-source hits to spot-check if desired** (exact-variant matches, no contradicting figure found, but one source only): Sam's Club Oversized Candlesticks via an eBay mirror's item specifics (b088); Lorcana Azurite Sea Trove 300 g via a German-edition spec sheet and Pokémon Binder Collection via Target's estimated ship weight (b050); Moved by Bikes Moped Rack via a Ubuy search-result spec table (b069); OC Ramps Manny Pad via a manufacturer search snippet (b060); Kohl's Attic Cherry Bed Step via one eBay item-specifics entry and Chelsea Corner Nook via Amazon.ca (b042).
9. **Traps held everywhere:** Surf Station/GSI rider-weight tables, Shopify `<s:grams>` placeholders (caught live on DITA, Eberjey, ViX — identical 227 g on two different-sized products — and Farm Rio — identical 28 across sizes XXS–XL), content fl oz passed off as weight, max-load/capacity figures duplicated into item-weight fields (Crosley cart 135.3 lb, Safavieh Raven 45 lb), and Amazon/Ubuy pair+box package weights for shoes were all rejected. Fashion's only systematic exception: Revolve's hard goods (10/87 — luggage, a record player, Salomon spec tables).
10. **Fashion shutouts are total, not sampled:** SSENSE 0/886, Farfetch 0/125, Johanna Ortiz 0/65 — capped at 2 sources per the method, but workers cluster-verified across every product family in each batch; these catalogs publish fabric/dimensions only, and many rows are brand-stripped in the catalog itself, degrading even search.

# Walmart write stage — Lucifer's items 1–28 (#443, 2026-10-23)

Rules: `scripts/lib/walmart-write.js`, wired in `scripts/lib/walmart-density.js` and `scripts/build-walmart-catalog.mjs` (the join). Tests: `scripts/test/walmart-write-tests.mjs` (one check per item, on the products the replays named).

| Item | Rule | State |
|---|---|---|
| 1 | Join on the trailing item ID; refuse when the names disagree on the variant (15-pc vs 21-pc) | done |
| 2 | Compressed-gas dusters are aerosols | done |
| 3 | Kettlebell either spelling; fitness weights stated above 15 kg are freight | done (site rule + write stage) |
| 4 | Full-size portable/in-ground hoop systems held; kids/mini hoops ship | done (site rule) |
| 5 | "for home gym" boilerplate no longer holds bands, mats, rollers | done (site rule) |
| 6 | Camp chairs, cots, airbeds enter; rooftop tents stay out | done (write stage + site rule) |
| 7, 18 | "Dishwasher safe", fridge organizers/magnets, toy dryers are not appliances | done (write stage + site rule) |
| 8 | Party/event/glamping tents, inflatable tents and paint booths held | done (site rule) |
| 9 | Tool vocabulary (pistol grip, nail/staple/glue/impact gun) is not a firearm; "AS SEEN ON TV", "for freezer" no longer hold | done |
| 10 | ≥200-piece tool kits flagged `merchReview: mega-kit-weight-check` | flag only — no weight invented |
| 11, 13, 15 | Basics/apparel/shoes routed by age first, then the PDP's gender: kids_baby / womens (fashion for apparel) / mens | done; new buckets need storefront wiring |
| 12, 15, 21, 22 | `variantList` sizes: in-stock tokens only, verbatim, families per department (clothing, shoe, bed; plain size-* never in seasonal); shoe widths kept; hybrid forms to `sizeReview` | done — decoder is shape-tolerant; please confirm on a replay |
| 14, 16 | Bulk lots ("lot of N", ≥20 pairs, wholesale lot) flagged `merchReview: bulk-lot` | done |
| 16 | Water shoes "for kayak" ship | done (site rule) |
| 17, 20 | Lethal bait out (stations with baits, blocks, pellets, killers); repellents, devices (plural-tolerant), empty stations in; a device phrase outranks a brand token | done (Danny's lethal-vs-repellent line) |
| 19, 23 | Decor-destination and sizing wording ("for fireplace", "fits … mattress" on sheets, "sofa blanket") no longer holds | done (site rule) |
| 24 | Per-letter ornament families | not built — collapsing them changes no price, so they still sit under the $2 floor; needs a merchandising call |
| 25, 26 | Voltage gate: verified 220-capable sells (`voltage: dual-220`); 110 V-only excluded; unstated or contradicting held (quarantine, never published); battery/USB/solar untouched | done on text; spec-table capture (`inputVoltage`) needs a source the pull does not return |
| 27 | Supplements need ingestible form; topicals naming vitamins/melatonin/biotin/collagen stay | done |
| 28 + Danny | Refurbished/used/open-box carried as `condition` + `conditionLabel` (Reacondicionado / Usado / Caja abierta); used clothing, footwear and auto parts excluded; locked phones excluded | done; PDP title and boleta display ride the Reacondicionados build |

## The site rule change (app bundle `isShippableItem`) on today's catalogues

Every product in every catalogue checked before and after: **76 now ship that were held, 0 newly held.** The freed set:

- kitchen (dishwasher-safe utensils, fridge bins): 48
- fitness (bands, mats, ropes, rollers): 13
- candle holders/decor: 9
- bedding (sheets, pads, protectors): 5
- covers/throws: 1

## Item 29: fresh and perishable food (2026-10-24)

**Rule:** `perishableFood()` in `scripts/lib/walmart-write.js`. It fires on any of:
- Walmart's grocery marker ("Fresh Produce", "Marketside", "Freshness Guaranteed") as the brand or the department;
- a title that starts with "Fresh" followed by a produce, meat or seafood noun, unless an apparel or decor word follows ("Fresh Pear Tie Dye Tee" stays);
- fresh eggs and milk.

Shelf-stable packaged food is not in this class.

**Where it runs:**
- the write stage (`excluded-perishable-food`);
- the site rule (`isShippableItem` → `isPerishableFood`, the same three patterns, held equal by a test);
- the department-cache scraper (`refresh-department-cache.js`);
- photo search (`visual-search.js`, at query time, because the shards are positional).

**Kill count:** 3 unique products, 4 committed rows.
- `department-cache-walmart.json` (bucket "clearance"): "Fresh Yellow Onions, 3 lb Bag", "Fresh  Whole Celery, 1ea", "Fresh Seedless Watermelon, Each".
- `ofertas-feed.json`: the celery, removed by rebuilding the feed (22,367 → 22,366, Walmart 2,162 → 2,161).

`scripts/scrub-perishable.mjs` cut the rows out of the raw text, so no other byte of the file changed. A census test fails if any committed catalogue or built slice holds a perishable row.

**The rider:** "Más vendidos" is ordered by the store's own review count, not by raw ingest order. The onions led because they carry 86,501 reviews. With fresh food gone, the lead goes to the next most-reviewed product. Re-ranking that rail by sale-first or hero categories is open for Danny.

## Item 30: the $2 floor release (2026-10-24)

`PRICE_BAND_USD` is now `{ min: 0, max: 1500 }`; the ceiling is unchanged. `sub2Verdict()` holds on evidence instead:

| Verdict | Applies to | Audit group |
|---|---|---|
| `price-stuffed-title` | sub-$2 titles that state a price ("Clearance Under $1") | Stage 11 |
| `variant-floor` | under $1.10 with a pack, set or N-piece title | Stage 8 spam, Stage 2 outfit sets |
| `verify-pdp-price` | sub-$2 marketplace apparel | Stage 9 |
| `fragment-letter-variant` | per-letter ornaments | Stage 12 / item 24: held for the parent PDP |

**Write-time scrubs:**
- a was-price over 5× a sub-$2 price is dropped (HARIBO);
- "Clearance 2023!" comes off a title (CWCWFHZH).

**Not done here, because the stage pulls and the audit file are not in the repo:**
- replaying the per-item lists to confirm 118 release / 12 hold / 6 verify / 8 fragment;
- the Kinder Bueno "30 Count" title/price check, which needs its PDP.

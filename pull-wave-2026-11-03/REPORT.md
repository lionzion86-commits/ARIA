# Catalog pull wave — 2026-11-03 (Danny's voice order, ~07:58 EST)

"Pull all of them… make sure that we're pulling colors and sizes."

## Bottom line

| Store | Delivered | Variants | Cost (settled, API-verified) |
|---|---|---|---|
| Bath & Body Works | **143 products — first-ever catalog** | n/a (fragrance/size = separate PDPs at BBW) | $0.1904 |
| PacSun | **44 new products** (18 → 62) | ✅ variant units on 44/44 (7–26 each); size *labels* not extracted — see report | $0.1525 |
| Ulta | **250 new products** (690 → 940) | ✗ search actor returns none (shades are the separate PDP job) | $1.8640 |
| YesStyle | **89 new products** (1,225 → 1,314) | ✅ variant string on 88/89 | $0.7800 |
| DSW | **0 — gate shut (DataDome)** | ✗ impossible today; evidence in dsw/REPORT.md | $0.0217 |
| **Wave total** | **526 products** | | **$3.0086 ≈ $3.00** |

All files are wiring-ready catalog-envelope JSON (same shape as the Nov 1 DSW delivery), weights applied with the repo's own estimator. Nothing was wired live — Chad's lane. Per-store detail: `dsw/REPORT.md`, `bbw/REPORT.md`, `pacsun/REPORT.md`, `ulta/REPORT.md`, `yesstyle/REPORT.md`. Raw actor output, run ledgers and tooling: `work/` (`final-ledger.json` is the settled per-run ledger).

## Budget discipline

- Baseline cycle usage before today: $471.19 (hard limit $500, raised this morning).
- The concurrent shades pull and all other runs today consumed $8.47; this wave consumed $3.00. **Cycle total after the wave: $482.66 — $12.34 under the $495 stop line I was given, $17.34 under the hard cap.** The cap was never at risk.
- Caution for future waves: Apify *settles* usage above mid-run readings (Ulta read $0.636 in flight, settled $1.864). Budget against settled figures, not live ones.

## The pattern that worked

For bot-walled stores (BBW/HUMAN, PacSun/Akamai): harvest product URLs free from the **Wayback Machine CDX index**, then run **constructive_calm/ecommerce-product-scraper-pro in PDP mode** (datacenter/residential/browser tiers, includeVariants). ~$0.001–0.0035 per delivered product. Listing mode fails on all three walled stores; the purpose-built BBW actor (lexis-solutions) is still broken; DSW is the exception — DataDome stops even the browser tier, and the one actor that ever got DSW data returns no sizes in any mode.

## Biggest remaining gaps (for Danny's call)

1. **DSW sizes** — needs a DataDome window or a DataDome-capable actor. 25,138 unique product URLs are already harvested and waiting in `work/`. At today's PDP rates a 5,000-product shoe pull ≈ $15 *if* a route gets through.
2. **BBW depth** — 143 of ~2,000+ live products; blocked on a HUMAN-passing listing route, not money.
3. **PacSun size labels** — variant units captured; the size text (e.g. "28W X 30L") needs an SFCC variation-attribute pass.
4. **Ulta/YesStyle depth** — mechanical and cheap per row (~$0.003–0.008 settled); more waves whenever headroom allows.

---

## Makeup scope addendum (2026-11-03, Danny: "We need makeup")

| Store | Delivered | Shade capture | Cost (settled) |
|---|---|---|---|
| Sephora | **129 new makeup products** (2,003 → 2,132) | **911 shades on 108/129 products** (the 21 without are palettes/single-SKU) | $2.02 |
| Ulta | **473 new makeup products** (940 → 1,413) | **3,332 shades on 180/180 targeted products** (foundations + lipsticks first); 293 products unshaded, ~$5.30 to finish | $5.64 |
| YesStyle | **331 new makeup products** (1,314 → 1,645) | variant/shade string on **319/331 (96%)**; full shade families impossible today (PDP route proven dead by the shades job) | $1.04 |
| **Makeup total** | **933 products, 4,243+ shades** | | **$8.71** |

Coordination with the shades pull: that job (now complete: 712 families, 10,499 shades, $7.81) covered products already in the catalogs. This scope covered only products the catalogs did **not** have — deduped against the shades worklists and both wave deltas; the same proven actors/payloads were reused (igview for Sephora, sian detail for Ulta) so no page was paid for twice.

**Final budget state: cycle $491.37 of the $500 hard cap — $3.63 under the $495 stop line.** Wave 1 ($3.00) + shades job ($7.81) + makeup scope ($8.71) + probes/other today ≈ $20.18 total today. No further runs were started once the remaining headroom dropped below the cost of the next useful step; the one priced remainder is the Ulta shade backlog (293 products ≈ $5.30).

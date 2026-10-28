# JCPenney — pull summary (2026-10-27)

**Status: PULLED — PARTIAL (actor timeout), with ONE blocking data problem (images).** Dataset: `dataset.json` in this folder — **10,104 rows, 9,647 unique product IDs** (cross-keyword duplicates removed at normalization).

## Route that worked
- `stealth_mode/jcpenney-product-search-scraper` (actor 0Tv2FQxSWMT65qcUe, SILVER tier $0.0025/item) in URL mode: 29 search URLs + the verified view-all-women category URL, 450 rows each (run e4sIib6ZuRPk9tLdZ). The run **TIMED OUT** at **$25.23** after capturing 10,086 charged rows. Measured cost across all JCP tests: $0.0025/row as priced.
- Keyword/search mode verified working on this actor (unlike C&B's dedicated actor).

## Coverage — exactly what the timeout cut
Captured in full (450 rows each, 20 terms): dress, blouse, sweater, pants women, skirt, coat women, shirt men, suit men, shoes women, boots women, heels, sneakers men, sandals women, handbag, necklace, earrings, watch women, makeup, fragrance women, sheet set.
Partial: jeans women 434, polo men 337, blazer women 228, lipstick 105.
**Never ran (0 rows): bath towels, dinnerware set, cookware set, kids dress, kids shoes** — the home tail + both kids terms. A top-up run for just those 5 terms ≈ 5 × 450 × $0.0025 ≈ **$5.60** closes the gap whenever the parent wants it.

## Data quality (10,104 rows)
- **⚠ IMAGES: 0% REAL URLs — THE BLOCKER.** Every row's `image_url` / `group_image` / `alt_images` / `swatch_image` is a **Scene7-style asset ID, not a URL** (e.g. `DP70235361-20260805203003M`). Per the standing data rule these were **NOT** converted into constructed URLs. JCP's own PDP HTML embeds full Scene7 URLs for these assets, so the clean fix is a PDP-level image pass (or Chad confirms the canonical Scene7 pattern from a live PDP and resolves IDs server-side at build). **Until images resolve, no-image-no-card suppresses this entire catalog** — the store skeleton, prices, and PDP content can be built, but cards cannot show.
- **Prices: 100% and rich** — original, effective (sale), and coupon price min/max per row; effective range $0–$11,000 (1 row at $0 = noise; the top end is marketplace outliers — slice-time sanity filters apply). **Clearance flags present: 1,307 rows clearance=Y** — Ofertas rail is buildable.
- **Sizes/colors strong: size_range on 6,826 rows (68%), size data on ~94%, color on 9,742 (96%)** — the best variant coverage of the wave (dedicated actor + JCP structured data).
- Full descriptions with specs, plus structured attributes (fit, neckline, sleeve, fabric, occasion, gender, age group).
- **Weights: 0%** — 10 kg general cap applies at slice time via the estimado doctrine.
- Brand noise: "more brands" (795 rows) is a marketplace catch-all value, not a brand.

## Scope notes
- This lane is **untested by design** (build order: paper-hostile terms, verdict by orders, confirm-first checkout) — nothing in the data changes that; buy activation gated on the B2B door / test-order protocol.
- Furniture/appliances/mattresses were excluded by the search-term selection itself (no such terms were pulled); the home slice captured is sheets only — towels/dinnerware/cookware are in the missing top-up above.

## Spend (this store)
Pilot $0.01 + scale test $2.51 (1,000 rows) + keyword test $0.14 + full partial pull $25.23. **Store total ≈ $27.88** (cap $40).

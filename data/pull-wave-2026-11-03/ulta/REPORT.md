# Ulta — pull-wave report (2026-11-03)

**Delivered: `ulta-catalog-delta.json` — 250 NEW products to merge into the live 690-product catalog (→ 940 total).**

## Result

- Ran the catalog's original actor (`apify/1KkWl2GyivYE3ISuJ`, ulta-beauty-search-products-scraper) on three queries — "hair care", "fragrance", "skin care", 2 pages each: **463 rows fetched, 250 not already in the catalog** (dedupe on base product URL). New by query: hair care 127, fragrance 80, skin care 43.
- 250/250 with brand, price, image, rating/review count and estimated weight. Sale items carry a real `originalPrice`; price-range items (e.g. "$18.00 – $32.00") keep the range in `priceRange` with the low end as `price`.
- Sizes/colors: **0%** — same as the existing catalog. This is a search-level actor; it returns no variant data, and Ulta shade/size capture is PDP-level work (the separate shades pull covers shades for the gated beauty products). Nothing was fabricated: `availableSizes: []`, `sizeSource: "none"` on every row.

## Cost (verified from the API)

Run 8nXmljHAk1Akp2m38: **$1.8640** settled (mid-run readings showed $0.636; Apify settled higher — the settled figure is the true one). ~$0.0075 per new product.

## What remains

- The three queries report ~43 total result pages on hair care alone (2,715 results); the full Ulta catalog is far larger. More delta waves are cheap and mechanical: additional queries/pages at ~$0.004–0.008 per row, dedupe the same way. A deeper pass (say +2,000 products) would run roughly $8–16 at today's settled rates — needs fresh budget headroom, not available this cycle alongside the shades pull.

---

## Makeup scope addendum (2026-11-03, Danny: "We need makeup")

**Delivered: `ulta-makeup-delta.json` — 473 NEW makeup products, 180 of them with full shade lists (3,332 shades).** Combined Ulta growth today: 690 → 940 (wave 1) → **1,413** with this makeup delta.

- Search pass (same actor): foundation / lipstick / mascara / eyeshadow, 2 pages each — 596 fetched, **473 new** after dedupe against the live catalog, the wave-1 delta, AND the shades worklist (no product was paid for twice). New by category: eyeshadow 136, lipstick 133, mascara 107, foundation 97.
- Shade pass (sian.agency detail mode — the shades team's proven route and payload, `categories: []` trap avoided): foundations first, then lipsticks, 180 URLs. **180/180 returned shade lists — 3,332 shades** with per-shade SKU, name, price and stock. Shade capture on targeted products: **100%**; on the full makeup delta: 180/473 (38%).
- Cost (settled): search $2.396 + shades $3.245 = **$5.64**.
- NOT shade-pulled (budget): the remaining 50 lipsticks + 107 mascaras + 136 eyeshadows = **293 products, priced at ~$5.30** at the settled $0.018/product sian rate whenever headroom allows. Mascara/eyeshadow are the least shade-critical (palettes are single-SKU color stories; mascara shades are few).

# Pier 1 Imports — pull summary (2026-10-27)

**Status: PULLED (raw, broader than the light slice — slice at normalization).** Dataset: `dataset.json` in this folder — 5,001 rows: **5,000 products (all status ok)** + 1 store row.

## Route that worked
- `digital_influx/product-data` (actor sdpACak2EEWFG6RMW) in **store mode** on pier1.com, maxProductsPerStore 5000 (run JalTyuQVvKKaPzpBG). **Cost: $19.99 total (~$0.004/product).**
- Pier 1 is **Shopify**; the actor found **7,352 product URLs** across 9 sitemaps. The 5,000 cap **truncates the pull in the actor's sitemap order** — 2,352 products were NOT captured. Pilot sample order was candles/fragrance first; the captured 5,000 skew toward the front sitemaps, so some tail categories may be missing entirely. A top-up pass (~$0.004/product) is possible if Chad's ingest report shows gaps.
- No dedicated Pier 1 actor exists. A onescales sitemap-extractor attempt on pier1.com/sitemap.xml returned 0 items and was abandoned (run mrFvufJLaNuCLZSLf, ~$0.00) — the actor's store mode reads the sitemaps itself.

## Data quality (5,000 products)
- **Photos: 5,000/5,000 (100%)** — real captured Shopify CDN URLs. **Single image per product** (0% multi-image in this actor's output) — acceptable for cards; PDP galleries will be thin.
- **Prices: 5,000/5,000 (100%)**, all USD, range **$7.96 – $4,999.95** (the top end is furniture — excluded at slice time).
- **Sale flags WORK here: 1,601 products flagged onSale** (Shopify compare-at data survives, unlike SNIPES/CH) — the Ofertas-first rail is buildable from this dataset.
- **SKUs: 3,360/5,000 (67%)**. Variants present on 100% (Shopify variants; pilot samples were mostly single-variant). Descriptions: 5,000/5,000. Categories populated (Canvas Wall Art 349, Table Runners 215, Placemats 176, Square Pillows 170, Christmas Ornaments 101, Decorative Objects 94…).
- **Weights: 0%** — none in the source; the build order's **5 kg hard cap incl. estimates** applies at slice time, and items with no defensible estimate stay OUT of v1.

## Scope notes for normalization (important)
- **Raw pull is NOT the light slice.** It contains furniture and rugs the build order excludes — Accent Chairs 147, Dining Chairs 142, Side Tables 119, Indoor Rugs 95, outdoor chairs, etc. All of that, plus anything over the 5 kg cap, is cut at slice time. The in-scope core (candles & fragrance, tabletop, pillows & throws, décor, seasonal) is well represented.
- **Brand field is noisy**: the current Pier 1 operator runs a dropship-style catalog; brand values carry internal supplier suffixes (e.g. "Gigacloudtech_DSFabricsCIS" 1,792, "Saro Lifestyle_DSFabricsCES" 792). Treat brand as unreliable metadata — do not build brand rails from it without cleaning; product names/categories are the trustworthy fields.
- Junk to exclude at slice: "Pier 1 Rewards" membership product ($9.99, seen in pilot).
- Buy activation stays gated on a small Miami test order — the operator is a post-2020 digital-only reviver of the brand, and online-only did not prove forwarder tolerance (Target counterexample stands).

## Spend (this store)
Pilot $0.12 + abandoned sitemap probe ~$0.00 + full pull $19.99. **Store total ≈ $20.11** (cap $40).

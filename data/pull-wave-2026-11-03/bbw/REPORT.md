# Bath & Body Works — pull-wave report (2026-11-03)

**Delivered: `bathandbodyworks-catalog.json` — 143 products, wiring-ready. This store had never been pulled before.**

## Result

| Department | Products |
|---|---|
| home-fragrance (Fragancia del Hogar) | 51 |
| body-care (Cuidado Corporal) | 36 |
| hand-care (Cuidado de Manos) | 24 |
| fragrance (Fragancias) | 22 |
| gifts (Regalos) | 9 |
| beauty (Belleza) | 1 |
| **Total** | **143** |

- 143/143 with price, image, description, SKU and a checkout-ready weight (repo estimator; 61 matched a keyword rule, 82 fell to the 0.5 kg default — candles in particular should be re-checked at wiring time).
- 8 on sale with a real was-price. 0 with on-page variants — accurate for BBW: fragrance and size are separate PDPs in their merchandising, so breadth *is* the variant coverage.
- Envelope mirrors the other catalogs: `generatedAt / source / declaredProductCount / retailers.bathandbodyworks.label / departments`.

## Route findings (named plainly)

- The Oct 4 route, `lexis-solutions/bath-and-body-works` (lafhMbu7OrUuDw3tl): retested — SUCCEEDED with **0 products** again ($0.0223). Still broken; do not use.
- apify/e-commerce-scraping-tool on a BBW category listing: 0 items ($0.0001). bathandbodyworks.com is behind **HUMAN (PerimeterX)** — direct fetches return "307 Human BD Forbidden" for every path including robots.txt.
- constructive_calm listing mode on /c/body-care: page "loaded" through all tiers but **no product links found** ($0.0050) — HUMAN serves listings a shell.
- **What worked: constructive_calm PDP mode.** Product URLs were harvested free from the Wayback Machine's CDX index (512 unique PDPs; gift cards excluded). Batches: probe 1/2 ($0.0060) → batch 1: 15/100 ($0.0200) → batch 2: 127/408 before I aborted it ($0.1320) once its yield flatlined on dead historical URLs. Deduped total: **143 unique products for $0.158 of batch spend** (~$0.001/product).

## What remains unpulled and what it would cost

- ~360 Wayback URLs never returned a product (mostly discontinued/seasonal pages; expected yield on a retry is low, maybe +20–40 products for ~$0.05).
- BBW's full live catalog (~2,000+ products) is **not reachable today**: no listing route passes HUMAN, and there is no sitemap access. A full pull needs either a HUMAN-passing listing actor or a bigger URL corpus (e.g., Common Crawl bulk index, which was returning 504s this morning). Estimated cost if a listing route existed: the Oct 4 estimate was $15–35; at today's observed PDP rates the scrape itself would be ~$2–4 — the blocker is access, not money.

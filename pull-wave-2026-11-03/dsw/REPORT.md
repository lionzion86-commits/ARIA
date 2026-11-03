# DSW — pull-wave report (2026-11-03)

**Verdict: full re-pull with colors and sizes was NOT achievable today. DSW's gate is shut. No new catalog delivered; the Nov 1 catalog (171 products) still stands.**

## What was tried (5 runs, $0.0217 total, all charges verified from the Apify API)

| Run | Route | Result | Cost |
|---|---|---|---|
| kjsE0XY9zj4WydqWH | pistachio_implementation/product-page-extractor, 7 PDP URLs, includeVariants | 7/7 `no_product_data` — DSW served data-less shells | $0.0000 |
| EKkYd1DfXgLZu2Jeb | constructive_calm/ecommerce-product-scraper-pro, 4 PDP URLs (datacenter→residential→browser tiers) | FAILED — blocked on every tier; browser tier log records **"datadome"** by name | $0.0050 |
| 4RI4Er3ui77Cn5Uzt | apify/e-commerce-scraping-tool, listing /category/clearance ×20 | SUCCEEDED, **0 items** | $0.0027 |
| abgiw6XkmL3UuHZKx | apify/e-commerce-scraping-tool, listing /category/womens ×20 (retry ~30 min later) | 4 rows, of which 2 were nameless shells, 1 was a timeout.html junk row, and 1 was complete — the UGG Classic Slipper, already in the Nov 1 catalog | $0.0090 |
| 5rVJZLWpxFnG55dae | constructive_calm PDP retry, 6 URLs | FAILED, 0 items — DataDome still up | $0.0050 |

Direct fetches from this machine also return the shell (homepage title, no JSON-LD), same as the actors see.

## Why sizes specifically are impossible right now

- The only actor that has ever extracted DSW data (apify/e-commerce-scraping-tool) returns **no sizes/variants in any mode** — established Nov 1 across listing + details modes and reconfirmed today. Even in a gate-open window it cannot satisfy Danny's colors-and-sizes requirement.
- Every PDP-level actor that *can* return variants is stopped by DataDome today (named in the constructive_calm run log). On Nov 1 the gate opened for the e-commerce tool for roughly 15:44–16:20 EST; no such window appeared this morning (probes at ~08:02 and ~08:33 EST).

## Assets prepared for the next attempt (in ../work/)

- `dsw-sitemap-product-urls.json` — 72,980 sitemap URLs; `dsw-unique-product-urls.json` — **25,138 unique products** by style ID (20,219 shoe-ish). The sitemap itself is still fetchable for free; only PDP/listing content is gated.
- Recommended next route when a window opens or budget allows a DataDome-capable browser actor: sitemap URLs → PDP batches with includeVariants (the PacSun pattern that worked today), not another listing harvest.

## Cost to finish later

Unknown until a route passes DataDome; the PacSun PDP pattern cost ~$0.003/product today, so a 5,000-product DSW shoe pull would be ~$15 **if** a PDP actor gets through. Today none did.

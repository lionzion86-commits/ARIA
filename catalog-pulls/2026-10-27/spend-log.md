# Spend log — pulls wave 2026-10-27 (Apify, account Lion_zion_86)

Caps: per-store ~$40; wave total $150. Stop rule: no route > $0.02/product at scale.

| # | Store | Actor | Run ID | Items | Cost USD | Notes |
|---|-------|-------|--------|-------|----------|-------|
| 1 | Crate & Barrel | stealth_mode/crateandbarrel-product-search-scraper | YzT9wlsPXNkwXKKn8 | 0 | 0.0176 | PILOT keyword "candle", BUYPROXIES94952 — search fetch failed x3 |
| 2 | Crate & Barrel | stealth_mode/crateandbarrel-product-search-scraper | zWSydjMjBpCV1thDP | 0 | 0.0604 | PILOT keyword, RESIDENTIAL — same failure |
| 3 | Crate & Barrel | stealth_mode/crateandbarrel-product-search-scraper | PnG8IIr6RHSiIbbcb | 0 | 0.0109 | PILOT URL mode /furniture/1, RESIDENTIAL — 0 items |
| 4 | Crate & Barrel | stealth_mode/crateandbarrel-product-search-scraper | oIahZSqgeE4hf2Vck | 0 | 0.0122 | PILOT URL mode, SHADER — 0 items. Dedicated actor DEAD ROUTE on this account (4 configs, all empty).
| 5 | SNIPES | constructive_calm/ecommerce-product-scraper-pro | GGyskqjmIDjaHeCX2 | 0 | 0.0050 | PILOT listing /sale/ AUTO — site serves empty grid to all fetch tiers |
| 6 | SNIPES | constructive_calm/ecommerce-product-scraper-pro | hgFXXgxJxgv4A1gag | 0 | 0.0050 | PILOT listing /mens-shoes/ — same empty grid |
| 7 | SNIPES | digital_influx/product-data | szrF86b7qyt7J87Cd | 30 | 0.1200 | PILOT store mode — SUCCESS core data (photos/prices/SKU/brand); 0 variants (no size runs via JSON-LD) |
| 8 | SNIPES | constructive_calm/ecommerce-product-scraper-pro | rldvd36eUPTBtiX8C | 2 | 0.0125 | PILOT detailsUrls BROWSER on 3 PDPs — variants still empty; Salesforce variation data not traversed |
| 9 | Carolina Herrera | digital_influx/product-data | 4smT9ruKWwRIZkGjM | 29 | 0.1080 | PILOT store mode — WRONG LOCALE (ae/ar storefront); data discarded |
| 10 | Carolina Herrera | digital_influx/product-data | dm0ZLWLi9aE52aQiK | 30 | 0.1200 | PILOT store mode /us/en base — actor ignores locale, ae again; discarded |
| 11 | Carolina Herrera | constructive_calm/ecommerce-product-scraper-pro | E2B6PbunFwq3uK5BE | 0 | 0.0050 | PILOT listing mode US categories — FAILED, bot wall (empty pages) |
| 12 | Carolina Herrera | apify/sitemap-extractor | YKzorDyrLyFOsifpq | 0 | 0.0000 | FAILED — domain-discovery only, api host robots 404 |
| 13 | Carolina Herrera | boxbox10/sitemap-extractor | hfwG71XL3BZ6PDVbB | 0 | 0.0007 | SUCCEEDED but 0 items on direct sitemap URL |
| 14 | Carolina Herrera | onescales/sitemap-url-extractor | FwwBJ03udvdE4SBhd | 633 | 0.0001 | SUCCESS — 633 real US (/us/en/) PDP URLs from official US product sitemap |
| 15 | Carolina Herrera | digital_influx/product-data | EDZIrn0ke6dAuJ6t7 | 616 charged (469 ok products saved) | 2.4641 | FULL — productUrls mode, all 633 US URLs. DONE. Dataset saved. (Final confirmed by run GET: $2.46405 — supersedes an interim $2.0001 read.) |
| 16 | JCPenney | stealth_mode/jcpenney-product-search-scraper | E7CebR3dfAUzj1bQ8 | 20 | 0.0100 | PILOT — SUCCESS; rich data + sizes/colors; image fields are Scene7 IDs, not URLs |
| 17 | Pier 1 | digital_influx/product-data | z7YxbHJOIjUatarse | 30 | 0.1200 | PILOT store mode — SUCCESS (Shopify; 7,352 product URLs exist) |
| 18 | Pier 1 | onescales/sitemap-url-extractor | mrFvufJLaNuCLZSLf | 0 | 0.0001 | 0 items on pier1.com/sitemap.xml — route abandoned; actor store mode reads sitemaps itself |
| 19 | Crate & Barrel | sian.agency/crate-and-barrel-product-scraper | uxVRsUqmwSgunHpZL | 20 | 0.1000 | PILOT overview mode — SUCCESS; real Scene7 photo URLs, prices, SKUs |
| 20 | Crate & Barrel | sian.agency/crate-and-barrel-product-scraper | V5snMmbmtc6ElNLrk | 10 | 0.1570 | PILOT detail mode — SUCCESS; $0.0157/product all-in (under $0.02 line); descriptions + dimensions |
| 21 | Pier 1 | digital_influx/product-data | JalTyuQVvKKaPzpBG | 5000 | 19.9921 | FULL store mode DONE — 5,000 products saved (of 7,352 in sitemaps; truncated at cap). Dataset + summary saved. |
| 22 | Crate & Barrel | sian.agency/crate-and-barrel-product-scraper | umlMnOQagXQMYNZNP | 2022 | 30.7500 | FULL detail mode DONE — 2,024 rows saved (1,933 unique SKUs). Dataset + summary saved. |
| 23 | SNIPES | digital_influx/product-data | N8EvCROSHb5q1GjqM | 5000 | 20.0001 | FULL store mode DONE — 5,000 products saved (hit cap exactly). Dataset + summary saved. Size runs 0% (documented gap). |
| 24 | JCPenney | stealth_mode/jcpenney-product-search-scraper | WKreJepNWjgl9qRWH | 1000 | 2.5100 | SCALE TEST FINAL — view-all-women p.2, max 1000 rows: 1,000 rows out, 998 unique products; $0.00251/row (SILVER tier). (An interim mid-run read of 192 rows / $0.133 was superseded by this final.) |
| 26 | JCPenney | stealth_mode/jcpenney-product-search-scraper | w4zADz6eASokSMFIj | 50 | 0.1350 | KEYWORD TEST "dress" — works; $0.0027/row |
| 27 | JCPenney | stealth_mode/jcpenney-product-search-scraper | e4sIib6ZuRPk9tLdZ | 10086 | 25.2250 | FULL — TIMED OUT (partial): 10,104 rows saved, 9,647 unique products. Missing slices: bath towels, dinnerware set, cookware set, kids dress, kids shoes (top-up ≈ $5.60). IMAGES ARE SCENE7 IDs, NOT URLs — see summary. Dataset + summary saved. |

## Wave totals (final)

| Store | Products saved | Store spend USD |
|-------|---------------|-----------------|
| Crate & Barrel | 2,024 rows / 1,933 unique SKUs | 31.11 |
| SNIPES | 5,000 | 20.14 |
| Carolina Herrera | 469 | 2.70 |
| Pier 1 | 5,000 | 20.11 |
| JCPenney | 10,104 rows / 9,647 unique | 27.88 |
| **WAVE TOTAL** | **~22,600 products** | **≈ $101.94** (cap $150; every store under its ~$40 cap) |

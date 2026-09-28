# Luxury affiliate-feed pipeline — Saks Fifth Avenue + Neiman Marcus

## Why this exists (recon 2026-09-28)

Both `saksfifthavenue.com` and `neimanmarcus.com` sit behind **DataDome**
(`x-datadome: protected`, JS challenge via captcha-delivery.com). Every plain
HTTP request — homepage, search, `robots.txt`, even `sitemap.xml` — returns a
403 challenge page on request #1. Direct scraping would require defeating
their bot protection, which we do not do.

**The legitimate channel is the retailers' own affiliate programs.**
Both run open publisher programs that ship full product feeds (name, price,
images, brand, description, deep links):

| Retailer | Network | Status (2026-09-28) |
|---|---|---|
| Saks Fifth Avenue | Rakuten Advertising | Open |
| Neiman Marcus | Sovrn Commerce (ex-VigLink) | Open |
| Neiman Marcus | AWIN | feed format documented |

Affiliate coverage is typically ~60–70% of SKUs, refreshed daily. Luxury
flagship items are usually included; deep clearance sometimes isn't.

## What Danny needs to do (one time per network)

1. **Apply as a publisher** on Rakuten Advertising (join the Saks Fifth
   Avenue program) and on Sovrn Commerce (join Neiman Marcus). Use Aria's
   business details; approval is usually quick for content/comparison sites.
2. **Download the product feed** from the network dashboard
   (Rakuten: advertiser product feed export; Sovrn/AWIN: product data export).
3. **Check the header row** against `mappings/rakuten.json`
   (or `sovrn.json` / `awin.json`). If column names differ, edit the `columns`
   values — the keys on the left are the pipeline's canonical fields.
4. Hand the feed file to the build loop; the script below does the rest.

Note: affiliate-program terms expect publishers to drive referred sales.
Aria buys as a reseller rather than linking out, so keep the publisher
accounts in good standing (regular feed pulls, accurate business info).

## Running the pipeline

```bash
# Saks via Rakuten
node feed-to-catalog.mjs --feed ~/feeds/saks-rakuten.txt \
  --mapping mappings/rakuten.json \
  --store saks --label "Saks Fifth Avenue" \
  --out ../../saks-catalog.json

# Neiman Marcus via Sovrn
node feed-to-catalog.mjs --feed ~/feeds/neiman-sovrn.csv \
  --mapping mappings/sovrn.json \
  --store neimanmarcus --label "Neiman Marcus" \
  --out ../../neimanmarcus-catalog.json

# Options:
#   --min-tier 2   only Tier 1+2 brands (1 = Peru-status only)
#   --limit 5000   cap items (best-sellers-first ordering comes from the feed)
```

Output is a `<store>-catalog.json` matching the repo schema exactly
(`macys-catalog.json` reference): `generatedAt, source, sourceCategory,
declaredProductCount, recoveredProductCount, retailers.<key>.{label,
departments.{women,men}.items[], brands{}}`, with item keys
`name, type, brand, price, image, images, rating, reviewCount, onSale, url,
description, descriptionSource, description_en`.

## Rules enforced by the script

- **Raw USD shelf prices** — no tax, no markup baked in.
- **Spanish descriptions, never invented**: `description_en` keeps the
  retailer's own feed copy; `description` is a neutral one-liner built only
  from visible facts (brand, product type, color). `descriptionSource: 'feed'`
  so the translation-polish pass can upgrade them later.
- **No product without a real image.** No product without a URL.
- **Shippable only**: furniture, TVs, appliances, oversized goods excluded.
- **Best-sellers-first** is inherited from the feed's own ordering; sale
  items are flagged via `onSale` when a was-price is present.
- Brand tiers (`brands.json`): Tier 1 = Peru-status names (Saint Laurent,
  Burberry, Valentino, Gucci, Coach, Michael Kors, Tory Burch, Kate Spade,
  Longchamp). `--min-tier` filters; the report always shows tier hit rates.
- Feeds carry no weight data — the 10% cushion rule has nothing to apply to;
  site estimate tables remain the weight source.

## Files

- `feed-to-catalog.mjs` — parse → normalize → filter → dedupe → type/dept
  inference → validate → export. Prints a full report (tier counts, rejects
  with reasons, top brands).
- `mappings/awin.json` — AWIN column map (field set grounded in AWIN docs).
- `mappings/rakuten.json` — Rakuten publisher-feed map (best-effort default;
  verify header row after download).
- `mappings/sovrn.json` — Sovrn product-export map (best-effort default;
  verify header row after download).
- `brands.json` — tier lists + brand-name aliases
  (YSL/Yves Saint Laurent → Saint Laurent, etc.).
- `selftest.mjs` — 22-assertion end-to-end test on synthetic data in /tmp.
  Run with `node selftest.mjs`. Fixture data is never committed.

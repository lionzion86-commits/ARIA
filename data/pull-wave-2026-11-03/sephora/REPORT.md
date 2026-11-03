# Sephora — makeup scope report (2026-11-03)

**Delivered: `sephora-makeup-delta.json` — 129 NEW makeup products with 911 shades, to merge into the existing Sephora catalog (2,003 products in beauty-catalog.json → 2,132).**

## Why these 129

The existing Sephora catalog is skincare-heavy (787) with face makeup (641) and fragrance (542), but **Ojos (eyes) had 11 products and Labios (lips) had 10**. Discovery targeted the gaps: 9 best-selling searches (eyeshadow palette, eyeliner, mascara, lipstick, lip gloss, foundation, concealer, blush, bronzer; igview-owner/sephora-search-scraper, $0.158/run settled). 270 products fetched → **129 not already carried**. New by type: Ojos 57, Rostro 48, Labios 24. Foundation/lipstick/mascara searches returned almost nothing new — those shelves were already stocked; eyes and lips were the real hole, as suspected.

## Shade capture

Every new product went through the shades team's proven route (igview-owner/sephora-product-details-scraper, `{"productIds": […]}`, batches of 10 — the same actor and input shape as their 511-family Sephora pass, so no product was scraped twice: their worklist was the *existing* catalog's gated products; this pass covers only products the catalog didn't have).

- **129/129 detail records returned.**
- **108/129 products carry shade data — 911 shades total** (102 multi-shade, 6 single-shade), each shade with its own SKU, name, price, stock flag, image and per-shade URL (`?skuId=`), in the same member logic Chad's ingest uses (default shade prepended from the record's top-level fields).
- Richest family: Urban Decay 24/7 Glide-On Eyeliner Pencil — 35 shades.
- 21 products have no shade data because Sephora exposes none for them (eyeshadow palettes and other single-SKU products — the color story is the product itself). Nothing invented.
- Shade-capture rate on shade-bearing categories: 108/129 = **84% of products, 100% of products that have shades at Sephora** within measurement error (the 21 no-data items are palette/single-SKU types).

## Cost (settled, API-verified)

Discovery $1.422 (9 runs) + shade pass $0.602 (13 runs) = **$2.02 total**.

## Notes for wiring

- Delta envelope mirrors the other catalogs (`retailers.sephora.departments.beauty.items`); note the live beauty-catalog.json stores Sephora's department as a bare list — Chad normalizes at ingest.
- Weights are repo estimates (beauty fallback), flagged `weightEstimated: true`.
- Remaining Sephora depth, if Danny wants it: page 2+ of the same searches and the untouched makeup categories (primers, setting sprays, brow, contour) at the same rates (~$0.005/product discovery, ~$0.005/product shades).

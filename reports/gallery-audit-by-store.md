# Picture audit by store (#443, "Zumiez pass")

Every LIVE store (stores on `/off-sale.js` left out), every catalogue the product pages are built from (`sourceFiles()` in `scripts/build-pdp-slices.mjs`), counted with the product page's own photo rule: `producto.html` `normalizeItem` reads each record, and `galleryPhotoKey` / `tidyGallery` (#468) fold a photo saved at several sizes (query string, size folder, size suffix, Scene7 preset) into one. Images that 10 or more products of one store share (size charts, fit guides, banners) are not counted as photos of the product unless they are its card photo. One product = store + title across all its catalogue files (the copy with the most photos).

Regenerate: `node scripts/report-gallery-coverage.mjs --by-store --json` (reads the catalogues only, no network). Measured on main c063e6e (#468 merged).

## Headline

- **81 live stores, 99,220 products. 34 stores are flagged: more than half of their products show a single photo (or none).**
- The flagged stores are pull-side gaps, not rendering gaps: 30 of the 34 carry one image per product (99.5%+ of their products) in their catalogue file; the other 4 (advanceauto, dicks, nautilus, chronicle) are mixed. The product page shows every photo the data has (reports/gallery-coverage.md).
- **Zumiez (before the backfill): 2,492 products, 100.0% on exactly 1 photo, 0.0% on 2-3, 0.0% on 4+, average 1.00 distinct photos.** zumiez-catalog.json keeps one Scene7 `cat_max` image per product. The backfill prep is `scripts/backfill-gallery.mjs` (not run: the sandbox cannot reach Apify).
- Not in the table: AutoZone part results (`auto-cache.json`, the Aria Auto shards), 0 of 1,984 part titles with a second photo (overview-mode pull; see reports/gallery-coverage.md).

## By store (sorted by product count)

Columns are shares of the store's products by number of distinct photos. **Flag** = more than 50% on 0-1 photo.

| store | products | 0 photos | exactly 1 | 2-3 | 4+ | avg distinct photos | flag |
|---|---:|---:|---:|---:|---:|---:|---|
| ccs | 13,735 | 0.6% | 24.3% | 47.8% | 27.4% | 2.60 |  |
| walmart | 10,734 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| islandwatersports | 8,833 | 2.2% | 4.4% | 15.4% | 77.9% | 6.06 |  |
| surfstation | 6,173 | 0.2% | 42.1% | 49.6% | 8.2% | 1.91 |  |
| parrot | 4,018 | 4.6% | 37.0% | 46.6% | 11.8% | 2.04 |  |
| baublebar | 3,551 | 0.0% | 0.4% | 49.9% | 49.7% | 4.11 |  |
| farfetch | 3,279 | 0.0% | 0.1% | 23.0% | 76.9% | 4.40 |  |
| valsurf | 3,207 | 0.0% | 29.1% | 44.8% | 26.1% | 2.69 |  |
| hottopic | 2,538 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| boxlunch | 2,496 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| zumiez | 2,492 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| jwpei | 2,351 | 0.0% | 19.1% | 22.0% | 58.9% | 3.60 |  |
| mainland | 2,238 | 0.0% | 6.9% | 27.2% | 65.9% | 4.91 |  |
| skims | 2,161 | 0.0% | 0.1% | 2.2% | 97.7% | 5.84 |  |
| prosoccer | 2,011 | 0.0% | 16.1% | 14.9% | 69.0% | 4.36 |  |
| sephora | 2,001 | 0.1% | 99.7% | 0.2% | 0.0% | 1.00 | **>50% single** |
| revolve | 1,649 | 0.0% | 0.5% | 25.9% | 73.6% | 4.47 |  |
| vix | 1,602 | 0.0% | 0.1% | 0.7% | 99.2% | 5.80 |  |
| bhphoto | 1,590 | 0.0% | 4.8% | 40.3% | 54.8% | 4.27 |  |
| montce | 1,566 | 0.0% | 8.5% | 28.9% | 62.6% | 4.05 |  |
| tns | 1,518 | 0.0% | 0.2% | 6.7% | 93.1% | 4.33 |  |
| advanceauto | 1,365 | 1.5% | 92.1% | 5.5% | 0.9% | 1.11 | **>50% single** |
| denniskirk | 1,335 | 0.0% | 30.0% | 20.8% | 49.1% | 4.88 |  |
| farmrio | 1,195 | 0.0% | 0.4% | 24.2% | 75.4% | 4.11 |  |
| revzilla | 1,153 | 0.0% | 18.0% | 26.3% | 55.8% | 4.88 |  |
| kindredbravely | 919 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| tennisexpress | 800 | 0.0% | 19.6% | 21.5% | 58.9% | 3.99 |  |
| youngla | 800 | 0.0% | 0.1% | 1.5% | 98.4% | 7.74 |  |
| crocs | 564 | 0.0% | 3.0% | 97.0% | 0.0% | 1.97 |  |
| venum | 554 | 0.0% | 3.1% | 2.3% | 94.6% | 5.42 |  |
| smartbuyglasses | 544 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| partycity | 518 | 0.0% | 36.9% | 34.0% | 29.2% | 3.22 |  |
| dicks | 517 | 0.0% | 59.0% | 34.6% | 6.4% | 1.79 | **>50% single** |
| capittana | 516 | 0.0% | 0.8% | 9.1% | 90.1% | 5.07 |  |
| ancora | 508 | 0.0% | 0.0% | 11.8% | 88.2% | 4.72 |  |
| nautilus | 501 | 1.4% | 53.1% | 30.7% | 14.8% | 1.98 | **>50% single** |
| patbo | 496 | 0.0% | 4.0% | 43.8% | 52.2% | 3.73 |  |
| silviatcherassi | 494 | 0.0% | 15.8% | 80.8% | 3.4% | 2.65 |  |
| johannaortiz | 473 | 0.0% | 1.9% | 45.9% | 52.2% | 3.73 |  |
| quietstorm | 454 | 0.0% | 9.7% | 48.0% | 42.3% | 3.67 |  |
| walmartbaby | 454 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| finishline | 450 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| aguabendita | 417 | 0.0% | 0.0% | 0.0% | 100.0% | 5.94 |  |
| meliebianco | 310 | 0.0% | 4.5% | 38.1% | 57.4% | 5.50 |  |
| hatch | 288 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| abercrombie | 273 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| assouline | 270 | 0.0% | 0.4% | 67.8% | 31.9% | 3.69 |  |
| hollister | 249 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| xtremesoccer | 242 | 0.0% | 0.4% | 2.5% | 97.1% | 5.79 |  |
| momcozy | 238 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| eberjey | 237 | 0.0% | 3.8% | 19.0% | 77.2% | 4.38 |  |
| drbrowns | 215 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| chronicle | 209 | 0.0% | 54.1% | 4.3% | 41.6% | 2.95 | **>50% single** |
| tatami | 168 | 0.0% | 0.0% | 3.6% | 96.4% | 4.79 |  |
| bentgo | 154 | 0.0% | 0.6% | 1.9% | 97.4% | 11.06 |  |
| lanebryant | 150 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| americaneagle | 148 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| munchkin | 128 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| samsclub | 118 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| everlast | 112 | 0.0% | 11.6% | 9.8% | 78.6% | 4.76 |  |
| ezpz | 107 | 0.0% | 0.9% | 3.7% | 95.3% | 11.18 |  |
| gameness | 100 | 0.0% | 2.0% | 4.0% | 94.0% | 6.88 |  |
| elite | 95 | 0.0% | 0.0% | 0.0% | 100.0% | 8.03 |  |
| jujube | 86 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| elvie | 63 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| mmawarehouse | 49 | 0.0% | 0.0% | 4.1% | 95.9% | 5.57 |  |
| mockingbird | 48 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| spectra | 46 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| statebags | 43 | 0.0% | 7.0% | 37.2% | 55.8% | 4.77 |  |
| freshlypicked | 42 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| nanit | 36 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| academy | 33 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| mushie | 33 | 0.0% | 0.0% | 0.0% | 100.0% | 11.94 |  |
| babybrezza | 31 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| lillebaby | 29 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| bellybandit | 27 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| owlet | 26 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| combatcorner | 21 | 0.0% | 0.0% | 14.3% | 85.7% | 5.14 |  |
| dagnedover | 19 | 0.0% | 100.0% | 0.0% | 0.0% | 1.00 | **>50% single** |
| fuji | 4 | 0.0% | 0.0% | 0.0% | 100.0% | 6.00 |  |
| surfworld | 3 | 0.0% | 33.3% | 0.0% | 66.7% | 3.00 |  |

## Flagged stores (34), largest first

- walmart: 10,734 products, 100.0% on 0-1 photo, average 1.00 (department-cache-walmart.json, juguetes-catalog.json)
- hottopic: 2,538 products, 100.0% on 0-1 photo, average 1.00 (hottopic-catalog.json)
- boxlunch: 2,496 products, 100.0% on 0-1 photo, average 1.00 (boxlunch-catalog.json)
- zumiez: 2,492 products, 100.0% on 0-1 photo, average 1.00 (zumiez-catalog.json)
- sephora: 2,001 products, 99.8% on 0-1 photo, average 1.00 (beauty-catalog.json)
- advanceauto: 1,365 products, 93.6% on 0-1 photo, average 1.11 (advanceauto-catalog.json)
- kindredbravely: 919 products, 100.0% on 0-1 photo, average 1.00 (moms-catalog.json)
- smartbuyglasses: 544 products, 100.0% on 0-1 photo, average 1.00 (sunglasses-catalog.json)
- dicks: 517 products, 59.0% on 0-1 photo, average 1.79 (dicks-catalog.json)
- nautilus: 501 products, 54.5% on 0-1 photo, average 1.98 (nautilus-catalog.json)
- walmartbaby: 454 products, 100.0% on 0-1 photo, average 1.00 (moms-catalog.json)
- finishline: 450 products, 100.0% on 0-1 photo, average 1.00 (finishline-catalog.json)
- hatch: 288 products, 100.0% on 0-1 photo, average 1.00 (moms-catalog.json)
- abercrombie: 273 products, 100.0% on 0-1 photo, average 1.00 (abercrombie-catalog.json)
- hollister: 249 products, 100.0% on 0-1 photo, average 1.00 (hollister-catalog.json)
- momcozy: 238 products, 100.0% on 0-1 photo, average 1.00 (moms-catalog.json)
- drbrowns: 215 products, 100.0% on 0-1 photo, average 1.00 (moms-catalog.json)
- chronicle: 209 products, 54.1% on 0-1 photo, average 2.95 (books-catalog.json)
- lanebryant: 150 products, 100.0% on 0-1 photo, average 1.00 (lanebryant-catalog.json)
- americaneagle: 148 products, 100.0% on 0-1 photo, average 1.00 (ae-catalog.json)
- munchkin: 128 products, 100.0% on 0-1 photo, average 1.00 (moms-catalog.json)
- samsclub: 118 products, 100.0% on 0-1 photo, average 1.00 (samsclub-catalog.json)
- jujube: 86 products, 100.0% on 0-1 photo, average 1.00 (moms-catalog.json)
- elvie: 63 products, 100.0% on 0-1 photo, average 1.00 (moms-catalog.json)
- mockingbird: 48 products, 100.0% on 0-1 photo, average 1.00 (moms-catalog.json)
- spectra: 46 products, 100.0% on 0-1 photo, average 1.00 (moms-catalog.json)
- freshlypicked: 42 products, 100.0% on 0-1 photo, average 1.00 (moms-catalog.json)
- nanit: 36 products, 100.0% on 0-1 photo, average 1.00 (moms-catalog.json)
- academy: 33 products, 100.0% on 0-1 photo, average 1.00 (soccer-catalog.json)
- babybrezza: 31 products, 100.0% on 0-1 photo, average 1.00 (moms-catalog.json)
- lillebaby: 29 products, 100.0% on 0-1 photo, average 1.00 (moms-catalog.json)
- bellybandit: 27 products, 100.0% on 0-1 photo, average 1.00 (moms-catalog.json)
- owlet: 26 products, 100.0% on 0-1 photo, average 1.00 (moms-catalog.json)
- dagnedover: 19 products, 100.0% on 0-1 photo, average 1.00 (moms-catalog.json)

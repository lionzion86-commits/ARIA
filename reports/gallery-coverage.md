# Gallery coverage (#443)

Owed per #443 comment 6304525284 ("Gallery coverage") and re-flagged as launch-critical in comment 6324227678. Ale's feedback was that women's products especially need several photos.

Measured on origin/main 43c2c1d (with #444's PDP gallery and the `/off-sale.js` list), over every catalogue the PDP shards are built from: `sourceFiles()` in `scripts/build-pdp-slices.mjs` (70 files, two of them missing on disk), plus `auto-cache.json` for the AutoZone shards.

Regenerate: `node scripts/report-gallery-coverage.mjs --json`. It reads the catalogues only and makes no network calls.

## Headline

- **All on-sale catalogues: 64,172 of 102,661 on-sale products (62.5%) carry more than one real, distinct photo.** 47.5% have 3 or more. The average is 3.15 real photos.
- **Women's apparel: 85.7%** (10,754 of 12,545). Nearly all of the gap is nine stores whose data carries one photo per product: Zumiez 739, Walmart 190, Abercrombie 157, Hollister 123, Finish Line 117, American Eagle 86, BoxLunch 41, Lane Bryant 25 and Hot Topic 17.
- **Lingerie and intimates (women): 73.1%** (1,570 of 2,149). SKIMS (1,044), Eberjey, Revolve, YoungLA, Ancora and Farfetch are at 95-100%. The gap is Kindred Bravely (302 nursing bras and sleepwear), Lane Bryant (118 bras and panties), Zumiez (63), Momcozy (30), Hatch (17), Abercrombie (13) and Hot Topic (11), all at 0%.
- **Swim (women): 94.0%** (4,167 of 4,431). Island Water Sports, Montce, Farfetch, Vix, Capittana, Agua Bendita and SKIMS are at 97-100%. The gap is Zumiez (98), Walmart (49), Hollister (9), Hatch (7) and Abercrombie (5), all at 0%.
- Departments with almost no galleries: Toys 0.0% (Walmart toys, 6,636), Beauty 0.2% (Sephora, 2,555), Home/party/grocery 16.9%, Baby and moms 17.1% (all 17 moms-catalogue stores are at 0%) and Walmart general merchandise 0%.
- **AutoZone parts (auto-cache.json): 0 of 1,984** part titles have a second photo. The cache was pulled in "overview" mode.

The renderer is not the limit. The PDP shows a swipe gallery for every product whose data has one (see the rendering check below). Coverage is low only where the **pull captured a single photo**.

## How it is counted

- Each catalogue row is read by the product page's own `normalizeItem`, lifted from producto.html, so non-http, `.svg`, `placeholder`, `no-image` and spacer files are already excluded.
- **Off-sale retailers are excluded** (`/off-sale.js`: Victoria's Secret, Target, Best Buy, Costco, Nike, Foot Locker, Kohl's, Macy's, Gap, Old Navy, Banana Republic, Athleta, Ulta, SSENSE, YesStyle, New Balance, Gymshark, Alphalete, Miu Miu, Fendi, Golden Goose, PacSun). A catalogue that holds only off-sale stores is listed as not counted.
- One product is one retailer plus its normalised title. A row listed under both a department and a brand counts once.
- **Distinct means resized copies are merged into one photo:**
  - the query string;
  - size folders (`images500x500/`, `290pix/`, Cloudinary `t_...` transforms);
  - size suffixes (`_480x480`, `_1800x1800`, Shopify `_grande`);
  - B&H's per-size copies of one shot (`images500x500/`, `images345x345/`, `images150x150/`, `fb/`).
- **Shared non-product images are excluded:** a photo used by 10 or more different products of one store, unless it is that product's own card photo. These are size charts, font charts, fit guides and promo banners. They occur at SKIMS (10, e.g. `fitseverybody_bra_thong.gif`), BaubleBar (22 font and colour charts), B&H (12), Surf Station (6), Dennis Kirk, Melie Bianco and FARM Rio. The per-store counts printed by the script also include off-sale Macy's and Best Buy.
- "PDP shows >1 slide" is what the page renders today, using normalizeItem's host+path dedupe only. Where it is higher than "share", the gallery repeats a photo (see the dropped/duplicated images section).
- **Departments** are this report's own grouping, built from the title, the catalogue's `type` and the bucket (`deptOf()` in the script). Lingerie and swim are matched first. Gender comes from the title, type or bucket, or from the store for women-only stores. The grouping is approximate at the edges. For example, "Corset Top" goes under lingerie, and a hockey jersey from Hot Topic's untyped `general` bucket goes under "gender not stated". The store-level numbers are exact.

## Rendering check

`scripts/test/pdp-gallery-tests.mjs` is extended. With the test port pinned in 8980-8989, all 11 checks pass:

- **New: every shard record** in `assets/pdp/p/` (all 4,096 shards) is unpacked, and producto.html's own `galleryHTML` is run on it.
  - **113,786 records render a swipe gallery** with exactly one slide and one thumbnail per photo.
  - The other 71,413 records have a single photo and render a plain photo with no gallery.
  - 0 mismatches.
- The existing check still passes: every catalogue item's shard record unpacks to the gallery `normalizeItem` makes of it (185,283 items, 113,842 with 2+ photos), so nothing is lost between catalogue and shard.
- Browser run (headless Chromium, 390px): Agua Bendita (6 of 6 slots), New Balance (9 of 9), Gymshark (7 of 7) and **new: a SKIMS bra (6 of 6)**. In each, swiping reaches and loads every photo.

## Dropped and duplicated images

Places where the data has multiple images but the pipeline drops them before the PDP shard, or the PDP shows them wrong:

1. **`build-pdp-slices.mjs` `autoRecOf` kept only `images[0]` for AutoZone parts.** huntAuto passes `images` to normalizeItem, so a part gallery could never reach the page. **Fixed:** the shard now keeps the whole list, up to 12. No cached part has a second photo yet, so the auto shards are byte-identical after the rebuild. The fix keeps the next detail-mode refresh from losing its galleries.
2. **`refresh-department-cache.js` `slimItem` kept only `images`.** A gallery returned under `imageUrls` or `gallery` was deleted at pull time. These are the field names `scripts/lib/dsw.js imagesOf` already reads. **Fixed:** those fields are merged into `images`, after the actor's own list, one copy each, capped at 8 as before. This takes effect on the next pull, and the image-price-scan gate still applies.
3. **`normalizeItem` (producto.html) does not read `imageUrl`.** Only off-sale caches carry that field (Target 95 rows, Old Navy 168, Foot Locker 726), so no on-sale product is affected. Not changed.
4. **`scripts/image-price-scan.js`** scans a gallery only up to the first clean photo. When it has to swap the card photo, it keeps only the photos already verified and drops the rest of the gallery. This is deliberate under the price-text safety rule, so it was not changed. Scanning every gallery photo would cost more OCR time and needs a decision.
5. **Galleries capped at 12** (`normalizeItem`, by design). 732 on-sale rows have more than 12 distinct photos (BaubleBar, Bentgo, EZPZ, Mushie, Dennis Kirk, RevZilla, Party City, SKIMS, Gameness and others). These products already show 12, so coverage is unaffected.
6. **The PDP repeats a photo at another size (not fixed; customer-facing):**
   - **B&H**: 1,589 products (99.9%), +7,172 duplicate slides. Each shot appears at 500, 345 and 150px plus an `fb/` copy, so a 1-photo product swipes through 4 slides.
   - **RevZilla**: 1,143 products (99.1%). `_480x480` and `_1800x1800` copies of the same image, plus `_thumb` copies.
   - **Dennis Kirk**: 1,283 products. A shared parts diagram and `ina.jpg` repeated across products.
   - **BaubleBar** (341) and **SKIMS** (110): shared font, colour and fit charts shown as product slides.

   `normalizeItem` dedupes on host+path only. Merging size variants in it, or in the builder, would fix these. That changes producto.html and every shard, so it is left for a separate PR that Danny signs off.

No catalogue on main holds a multi-image source that a builder then cut to one. The single-photo catalogues are single-photo in the committed data itself, because their pull captured one image.

## Capture at pull time

| pull / builder | captures | notes |
|---|---|---|
| `scripts/build-macys-catalog.mjs` | **full gallery** (primary + `additionalImageSource`, cap 6) | Macy's is off sale |
| `scripts/build-bestbuy-catalog.mjs` | **full gallery** (`images`, cap 6) | Best Buy is off sale |
| `scripts/build-dsw-catalog.mjs` (+ `lib/dsw.js imagesOf`) | **full gallery** (`images`, `imageUrls`, `gallery`, `image`, `imageUrl`, `thumbnail`, `mainImage`; cap 8) | pull pending; catalogue empty |
| `scripts/refresh-department-cache.js` | was **`images` only**; now `images` + `imageUrls` + `gallery` (cap 8) | writes department-cache.json (Walmart, Target, Old Navy, Foot Locker). Walmart's current data has one photo per row (1,021 rows) |
| `scripts/refresh-sales-cache.js` (+ `lib/sales-sources.js normalizeDeal`) | **full gallery** (`image`, `imageUrl`, `thumbnail`, `images`; cap 8) | Ofertas deals; does not feed the product shards |
| `scripts/refresh-auto-cache.js` | passes the actor row through whole (5 rows per vehicle) | the shard step was the drop (fixed above) |
| Apify `walmart` (devcake/walmart-product-scraper) | **primary only, as returned** | input is `{targets, maxResults}`. The code documents no image or gallery input, and the listing output has one image per row. The field holding more images is unknown from the code. No request change was possible without guessing an input name |
| Apify `autozone` (sian.agency/autozone-product-scraper) | **primary only in the current cache** (overview mode) | `scrapeMode: AUTO_SCRAPE_MODE` ("detail", unverified) is already requested. Detail pages are where any extra photos would be. The field is unknown from the code |
| Apify `target` (rigelbytes/target-scraper) | primary in the data | Target is off sale |
| Apify `gap` (crawlerbros/gap-inc-scraper) | gallery present in gap-catalog (631 of 635) | Gap, Old Navy, BR and Athleta are off sale |
| Apify `footlocker` (crawlerbros/footlocker-product-scraper) | primary in the data | Foot Locker is off sale |
| Apify `dsw` (env `DSW_ACTOR_ID`) | gallery via `imagesOf` | actor unverified |

**Catalogues that capture only the primary image.** The pull script for each of these is not in the repo, so there is no request config to change. Each needs a re-pull of the store's product detail with its gallery, using real retailer photos:

| catalogue | on-sale products | where more photos would come from |
|---|---:|---|
| zumiez-catalog.json | 2,492 | Zumiez GraphQL pull (commit 01b6506; script not committed). The product's media gallery on the same API |
| hottopic-catalog.json / boxlunch-catalog.json | 2,538 / 2,496 | Amplience `.../<id>_hi` is the primary. Alternate views on the same CDN were not captured |
| hollister-catalog.json / abercrombie-catalog.json | 249 / 273 | Scene7 `KIC_<sku>_prod1`. The `prod2...` views were not captured |
| ae-catalog.json | 148 | Scene7 `<sku>_of`. Other views were not captured |
| lanebryant-catalog.json | 150 | Cloudinary `t_pdpMainImage` only |
| finishline-catalog.json | 450 | thumbnail only |
| moms-catalog.json (17 stores, incl. Kindred Bravely, Momcozy, Hatch) | 2,695 | Shopify stores. Their product JSON carries `images[]`, but the pull kept one |
| beauty-catalog.json (Sephora) | 2,001 | `-main-zoom` only. 5 rows carry an `av-1` alternate view |
| juguetes-catalog.json (Walmart) | 6,423 | primary only |
| department-cache-walmart.json | 4,311 | see the Walmart actor above |
| sunglasses-catalog.json (SmartBuyGlasses) | 544 | no `images` field at all |
| samsclub-catalog.json | 118 | primary only |
| advanceauto-catalog.json | 1,365 | 87 rows carry `alt1`/`alt2` views. The rest have the primary only |

For women's products, the stores to re-pull first are Zumiez, Kindred Bravely, Lane Bryant, Abercrombie and Hollister, American Eagle, Hot Topic, Walmart fashion and Hatch.

## Shard size budget

The PDP shard budget is 30 KB gz (`MAX_SHARD_GZ`).

| | before | after |
|---|---:|---|
| largest product shard | `p/e89` **16,168 B gz** | `p/e89` **16,168 B gz** (unchanged) |
| largest auto shard | 4,427 B gz | 4,427 B gz (unchanged) |
| largest rail | `rails/walmart/ropa-1ih0005` 25,731 B gz | 25,731 B gz (unchanged) |

The rebuild changed only `assets/pdp/index.json` (`files` 70 to 71, since dsw-catalog.json is now in the source list). No shard bytes changed.

## Data tables

### Headline

| | on-sale products | >1 real photo | share | 3+ photos | avg real photos | PDP shows >1 slide |
|---|---:|---:|---:|---:|---:|---:|
| **All on-sale catalogues** | 102661 | 64172 | 62.5% | 47.5% | 3.15 | 63.2% |
| auto-cache.json (AutoZone parts, auto shards) | 1984 | 0 | 0.0% | - | - | - |

### By department (women's apparel, lingerie and swim first)

| | on-sale products | >1 real photo | share | 3+ photos | avg real photos | PDP shows >1 slide |
|---|---:|---:|---:|---:|---:|---:|
| **Women's apparel** | 12545 | 10754 | 85.7% | 80.5% | 4.14 | 85.7% |
| **Lingerie & intimates (women)** | 2149 | 1570 | 73.1% | 71.1% | 4.33 | 73.1% |
| **Swim (women)** | 4431 | 4167 | 94.0% | 87.9% | 5.15 | 94.1% |
| Apparel (gender not stated) | 17648 | 12564 | 71.2% | 52.0% | 3.55 | 71.2% |
| Sports & outdoor gear | 14731 | 9306 | 63.2% | 23.2% | 2.26 | 63.3% |
| Jewelry & accessories | 10596 | 8202 | 77.4% | 60.6% | 3.35 | 77.5% |
| Toys | 6636 | 2 | 0.0% | 0.0% | 1.00 | 0.0% |
| Footwear | 6053 | 4616 | 76.3% | 64.7% | 3.84 | 76.3% |
| Bags | 5457 | 3351 | 61.4% | 49.8% | 3.19 | 61.6% |
| Men's apparel | 4338 | 2949 | 68.0% | 51.7% | 3.53 | 68.0% |
| Auto & moto | 3765 | 1967 | 52.2% | 44.1% | 3.48 | 67.9% |
| Baby, kids & moms (non-apparel) | 2562 | 437 | 17.1% | 14.5% | 2.26 | 17.1% |
| Beauty | 2555 | 5 | 0.2% | 0.0% | 1.00 | 0.2% |
| Kids' apparel | 2119 | 1209 | 57.1% | 42.2% | 3.12 | 57.1% |
| Home, party & grocery | 1931 | 326 | 16.9% | 11.9% | 1.59 | 16.9% |
| Other (general merchandise) | 1643 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| Electronics | 1603 | 1513 | 94.4% | 77.2% | 4.25 | 99.2% |
| Underwear & sleepwear (men) | 590 | 363 | 61.5% | 55.3% | 3.78 | 61.5% |
| Books | 479 | 365 | 76.2% | 74.7% | 3.37 | 76.4% |
| Swim (men) | 405 | 284 | 70.1% | 39.3% | 2.50 | 70.4% |
| Swim (kids) | 222 | 174 | 78.4% | 54.5% | 3.85 | 78.4% |
| Underwear & sleepwear (kids) | 115 | 25 | 21.7% | 20.9% | 1.90 | 21.7% |
| Underwear & sleepwear (gender not stated) | 88 | 23 | 26.1% | 25.0% | 2.55 | 26.1% |

#### Women's apparel, by store

| store | on-sale products | >1 real photo | share | 3+ photos | avg real photos | PDP shows >1 slide |
|---|---:|---:|---:|---:|---:|---:|
| farfetch | 1583 | 1580 | 99.8% | 85.0% | 4.37 | 99.8% |
| revolve | 1348 | 1340 | 99.4% | 98.7% | 4.42 | 99.4% |
| vix | 1235 | 1234 | 99.9% | 99.9% | 5.87 | 99.9% |
| tns | 1130 | 1127 | 99.7% | 97.9% | 4.34 | 99.7% |
| farmrio | 936 | 935 | 99.9% | 99.5% | 4.17 | 99.9% |
| zumiez | 739 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| skims | 591 | 589 | 99.7% | 99.5% | 5.74 | 99.7% |
| montce | 492 | 411 | 83.5% | 68.1% | 3.51 | 83.5% |
| silviatcherassi | 412 | 387 | 93.9% | 90.3% | 2.88 | 93.9% |
| patbo | 374 | 360 | 96.3% | 86.6% | 3.79 | 96.3% |
| ancora | 366 | 366 | 100.0% | 100.0% | 4.79 | 100.0% |
| johannaortiz | 347 | 343 | 98.8% | 90.5% | 3.94 | 98.8% |
| surfstation | 329 | 293 | 89.1% | 61.7% | 2.85 | 89.1% |
| capittana | 320 | 317 | 99.1% | 97.5% | 5.02 | 99.1% |
| youngla | 287 | 287 | 100.0% | 99.3% | 7.75 | 100.0% |
| tennisexpress | 227 | 216 | 95.2% | 85.5% | 3.96 | 95.2% |
| aguabendita | 224 | 224 | 100.0% | 100.0% | 5.98 | 100.0% |
| walmart | 186 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| abercrombie | 177 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| valsurf | 147 | 116 | 78.9% | 58.5% | 3.51 | 78.9% |
| hollister | 123 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| eberjey | 118 | 110 | 93.2% | 85.6% | 4.05 | 93.2% |
| finishline | 117 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| venum | 91 | 87 | 95.6% | 95.6% | 5.46 | 95.6% |
| americaneagle | 86 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| prosoccer | 82 | 79 | 96.3% | 90.2% | 5.35 | 96.3% |
| ccs | 67 | 59 | 88.1% | 32.8% | 2.60 | 88.1% |
| dicks | 60 | 42 | 70.0% | 46.7% | 2.20 | 70.0% |
| islandwatersports | 54 | 47 | 87.0% | 83.3% | 6.19 | 87.0% |
| quietstorm | 45 | 44 | 97.8% | 73.3% | 4.29 | 97.8% |
| boxlunch | 42 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| tatami | 41 | 41 | 100.0% | 100.0% | 5.34 | 100.0% |
| everlast | 39 | 38 | 97.4% | 97.4% | 5.23 | 97.4% |
| mainland | 37 | 36 | 97.3% | 97.3% | 5.27 | 97.3% |
| lanebryant | 25 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| parrot | 25 | 20 | 80.0% | 64.0% | 2.76 | 80.0% |
| gameness | 20 | 20 | 100.0% | 100.0% | 7.45 | 100.0% |
| hottopic | 17 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| elite | 5 | 5 | 100.0% | 100.0% | 10.00 | 100.0% |
| nautilus | 1 | 1 | 100.0% | 100.0% | 3.00 | 100.0% |

#### Lingerie & intimates (women), by store

| store | on-sale products | >1 real photo | share | 3+ photos | avg real photos | PDP shows >1 slide |
|---|---:|---:|---:|---:|---:|---:|
| skims | 1044 | 1043 | 99.9% | 98.9% | 5.89 | 99.9% |
| kindredbravely | 302 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| lanebryant | 118 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| eberjey | 98 | 98 | 100.0% | 100.0% | 4.73 | 100.0% |
| revolve | 75 | 75 | 100.0% | 98.7% | 4.37 | 100.0% |
| zumiez | 63 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| youngla | 46 | 46 | 100.0% | 97.8% | 7.76 | 100.0% |
| ancora | 45 | 45 | 100.0% | 100.0% | 4.93 | 100.0% |
| patbo | 38 | 36 | 94.7% | 92.1% | 3.95 | 94.7% |
| farfetch | 34 | 34 | 100.0% | 82.4% | 4.21 | 100.0% |
| jwpei | 30 | 30 | 100.0% | 100.0% | 5.47 | 100.0% |
| momcozy | 30 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| montce | 30 | 29 | 96.7% | 80.0% | 3.93 | 96.7% |
| parrot | 22 | 19 | 86.4% | 63.6% | 2.73 | 86.4% |
| islandwatersports | 21 | 20 | 95.2% | 95.2% | 7.24 | 95.2% |
| hatch | 17 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| quietstorm | 14 | 14 | 100.0% | 28.6% | 2.50 | 100.0% |
| farmrio | 14 | 14 | 100.0% | 100.0% | 4.57 | 100.0% |
| venum | 13 | 13 | 100.0% | 100.0% | 6.00 | 100.0% |
| everlast | 13 | 13 | 100.0% | 100.0% | 4.77 | 100.0% |
| abercrombie | 13 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| tns | 11 | 11 | 100.0% | 81.8% | 3.64 | 100.0% |
| hottopic | 11 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| vix | 9 | 9 | 100.0% | 100.0% | 5.78 | 100.0% |
| tennisexpress | 8 | 8 | 100.0% | 100.0% | 3.63 | 100.0% |
| surfstation | 4 | 4 | 100.0% | 100.0% | 3.00 | 100.0% |
| tatami | 4 | 4 | 100.0% | 100.0% | 5.00 | 100.0% |
| walmart | 3 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| bellybandit | 3 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| advanceauto | 2 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| ccs | 2 | 1 | 50.0% | 0.0% | 1.50 | 50.0% |
| aguabendita | 2 | 2 | 100.0% | 100.0% | 6.00 | 100.0% |
| silviatcherassi | 2 | 1 | 50.0% | 50.0% | 2.00 | 50.0% |
| finishline | 2 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| hollister | 2 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| drbrowns | 1 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| elvie | 1 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| americaneagle | 1 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| capittana | 1 | 1 | 100.0% | 100.0% | 5.00 | 100.0% |

#### Swim (women), by store

| store | on-sale products | >1 real photo | share | 3+ photos | avg real photos | PDP shows >1 slide |
|---|---:|---:|---:|---:|---:|---:|
| islandwatersports | 1365 | 1356 | 99.3% | 98.3% | 7.20 | 99.3% |
| montce | 878 | 852 | 97.0% | 90.3% | 4.38 | 97.0% |
| farfetch | 367 | 367 | 100.0% | 92.4% | 4.64 | 100.0% |
| surfstation | 288 | 265 | 92.0% | 69.8% | 3.34 | 92.0% |
| vix | 220 | 220 | 100.0% | 100.0% | 5.82 | 100.0% |
| capittana | 189 | 189 | 100.0% | 99.5% | 5.23 | 100.0% |
| aguabendita | 183 | 183 | 100.0% | 100.0% | 5.89 | 100.0% |
| valsurf | 180 | 168 | 93.3% | 73.3% | 2.99 | 93.3% |
| skims | 141 | 141 | 100.0% | 100.0% | 5.50 | 100.0% |
| zumiez | 98 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| ccs | 96 | 94 | 97.9% | 79.2% | 4.43 | 97.9% |
| parrot | 84 | 74 | 88.1% | 67.9% | 2.83 | 89.3% |
| ancora | 65 | 65 | 100.0% | 98.5% | 4.51 | 100.0% |
| farmrio | 60 | 60 | 100.0% | 88.3% | 3.52 | 100.0% |
| patbo | 60 | 59 | 98.3% | 73.3% | 3.42 | 98.3% |
| walmart | 49 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| johannaortiz | 42 | 42 | 100.0% | 85.7% | 3.50 | 100.0% |
| dicks | 12 | 10 | 83.3% | 41.7% | 2.33 | 83.3% |
| hollister | 9 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| hatch | 7 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| mainland | 5 | 5 | 100.0% | 100.0% | 5.80 | 100.0% |
| abercrombie | 5 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| lanebryant | 4 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| nautilus | 4 | 4 | 100.0% | 50.0% | 3.00 | 100.0% |
| silviatcherassi | 4 | 2 | 50.0% | 50.0% | 2.00 | 50.0% |
| revolve | 3 | 3 | 100.0% | 100.0% | 3.00 | 100.0% |
| tns | 3 | 3 | 100.0% | 100.0% | 4.33 | 100.0% |
| youngla | 2 | 2 | 100.0% | 100.0% | 8.00 | 100.0% |
| quietstorm | 2 | 2 | 100.0% | 100.0% | 6.00 | 100.0% |
| kindredbravely | 2 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| hottopic | 2 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| eberjey | 1 | 1 | 100.0% | 100.0% | 3.00 | 100.0% |
| boxlunch | 1 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |

### By catalogue (on-sale retailers only)

| catalogue (on-sale stores) | on-sale products | >1 real photo | share | 3+ photos | avg real photos | PDP shows >1 slide |
|---|---:|---:|---:|---:|---:|---:|
| department-cache-walmart.json (walmart) **low** | 4311 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| beauty-catalog.json (sephora) -- excl. victoriassecret **low** | 2001 | 5 | 0.2% | 0.0% | 1.00 | 0.2% |
| lanebryant-catalog.json (lanebryant) **low** | 150 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| dicks-catalog.json (dicks) **low** | 517 | 212 | 41.0% | 22.1% | 1.79 | 41.0% |
| skims-catalog.json (skims) | 2161 | 2158 | 99.9% | 99.0% | 5.84 | 99.9% |
| revolve-catalog.json (revolve) | 1649 | 1640 | 99.5% | 97.9% | 4.47 | 99.5% |
| partycity-catalog.json (partycity) | 518 | 327 | 63.1% | 44.4% | 3.22 | 63.1% |
| samsclub-catalog.json (samsclub) **low** | 118 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| gymrat-catalog.json (youngla) -- excl. gymshark, alphalete | 800 | 799 | 99.9% | 99.1% | 7.74 | 99.9% |
| bhphoto-catalog.json (bhphoto) | 1590 | 1513 | 95.2% | 77.8% | 4.27 | 100.0% |
| advanceauto-catalog.json (advanceauto) **low** | 1365 | 87 | 6.4% | 5.4% | 1.11 | 6.4% |
| nautilus-catalog.json (nautilus) **low** | 501 | 228 | 45.5% | 23.8% | 1.98 | 45.5% |
| islandwatersports-catalog.json (islandwatersports) | 8833 | 8249 | 93.4% | 86.1% | 6.06 | 93.4% |
| quietstorm-catalog.json (quietstorm) | 454 | 410 | 90.3% | 55.1% | 3.67 | 90.3% |
| surfworld-catalog.json (surfworld) | 3 | 2 | 66.7% | 66.7% | 3.00 | 66.7% |
| surfstation-catalog.json (surfstation) | 6173 | 3555 | 57.6% | 19.5% | 1.91 | 57.9% |
| mainland-catalog.json (mainland) | 2238 | 2084 | 93.1% | 77.3% | 4.91 | 93.1% |
| parrot-catalog.json (parrot) | 4018 | 2338 | 58.2% | 26.3% | 2.03 | 58.5% |
| ccs-catalog.json (ccs) | 13735 | 10327 | 75.2% | 37.2% | 2.60 | 75.2% |
| valsurf-catalog.json (valsurf) | 3207 | 2275 | 70.9% | 45.3% | 2.69 | 70.9% |
| venum-catalog.json (venum) | 554 | 536 | 96.8% | 96.2% | 5.41 | 96.9% |
| tatami-catalog.json (tatami) | 168 | 168 | 100.0% | 99.4% | 4.79 | 100.0% |
| everlast-catalog.json (everlast) | 112 | 99 | 88.4% | 85.7% | 4.76 | 88.4% |
| mmawarehouse-catalog.json (mmawarehouse) | 49 | 49 | 100.0% | 98.0% | 5.57 | 100.0% |
| combatcorner-catalog.json (combatcorner) | 21 | 21 | 100.0% | 85.7% | 5.14 | 100.0% |
| fuji-catalog.json (fuji) | 4 | 4 | 100.0% | 100.0% | 6.00 | 100.0% |
| fightclub-catalog.json (elite, gameness) | 195 | 193 | 99.0% | 99.0% | 7.44 | 99.0% |
| crocs-catalog.json (crocs) | 564 | 547 | 97.0% | 0.0% | 1.97 | 97.0% |
| baublebar-catalog.json (baublebar) | 3523 | 3511 | 99.7% | 77.2% | 4.12 | 99.7% |
| jwpei-catalog.json (jwpei) | 2351 | 1902 | 80.9% | 68.1% | 3.60 | 80.9% |
| meliebianco-catalog.json (meliebianco) | 310 | 296 | 95.5% | 70.6% | 5.50 | 97.4% |
| bentgo-catalog.json (bentgo) | 154 | 153 | 99.4% | 97.4% | 11.06 | 99.4% |
| mushie-catalog.json (mushie) | 33 | 33 | 100.0% | 100.0% | 11.94 | 100.0% |
| ezpz-catalog.json (ezpz) | 107 | 106 | 99.1% | 97.2% | 11.18 | 99.1% |
| statebags-catalog.json (statebags) | 43 | 40 | 93.0% | 69.8% | 4.77 | 93.0% |
| books-catalog.json (assouline, chronicle) | 479 | 365 | 76.2% | 74.7% | 3.37 | 76.4% |
| moms-catalog.json (17 stores) **low** | 2695 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| ae-catalog.json (americaneagle) **low** | 148 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| farfetch-catalog.json (farfetch) | 3279 | 3276 | 99.9% | 89.4% | 4.40 | 99.9% |
| soccer-catalog.json (prosoccer, xtremesoccer, academy) | 2286 | 1929 | 84.4% | 73.8% | 4.46 | 84.4% |
| tennis-catalog.json (tennisexpress) | 800 | 643 | 80.4% | 73.6% | 3.99 | 80.4% |
| latino-designers-dtc-catalog.json (11 stores) | 9022 | 8760 | 97.1% | 92.7% | 4.49 | 97.1% |
| jewelry-catalog.json (baublebar) | 3469 | 3451 | 99.5% | 76.3% | 3.82 | 99.7% |
| moto-catalog.json (revzilla, denniskirk) | 2488 | 1880 | 75.6% | 63.7% | 4.68 | 99.3% |
| juguetes-catalog.json (walmart) -- excl. target, costco **low** | 6423 | 1 | 0.0% | 0.0% | 1.00 | 0.0% |
| sunglasses-catalog.json (smartbuyglasses) **low** | 544 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| finishline-catalog.json (finishline) **low** | 450 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| zumiez-catalog.json (zumiez) **low** | 2492 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| hottopic-catalog.json (hottopic) **low** | 2538 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| boxlunch-catalog.json (boxlunch) **low** | 2496 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| hollister-catalog.json (hollister) **low** | 249 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| abercrombie-catalog.json (abercrombie) **low** | 273 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |

Not counted (every record off sale, or no records): /department-cache-target.json (off sale: target); /department-cache-oldnavy.json (no records); /department-cache-footlocker.json (off sale: footlocker); /macys-catalog.json (off sale: macys); /ssense-catalog.json (off sale: ssense); /pacsun-catalog.json (off sale: pacsun); /ulta-catalog.json (off sale: ulta); /yesstyle-catalog.json (off sale: yesstyle); /miumiu-catalog.json (off sale: miumiu); /costco-catalog.json (off sale: costco); /kohls-catalog.json (off sale: kohls); /newbalance-catalog.json (off sale: newbalance); /target-catalog.json (off sale: target); /gap-catalog.json (off sale: gap); /bananarepublic-catalog.json (off sale: bananarepublic); /bestbuy-catalog.json (off sale: bestbuy); /dsw-catalog.json (no records); /nanit-catalog.json (no records); /owlet-catalog.json (no records).

### By store (on sale)

| store | on-sale products | >1 real photo | share | 3+ photos | avg real photos | PDP shows >1 slide |
|---|---:|---:|---:|---:|---:|---:|
| lanebryant | 150 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| samsclub | 118 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| babybrezza | 31 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| bellybandit | 27 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| dagnedover | 19 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| drbrowns | 215 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| elvie | 63 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| freshlypicked | 42 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| hatch | 288 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| jujube | 86 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| kindredbravely | 919 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| lillebaby | 29 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| mockingbird | 48 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| momcozy | 238 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| munchkin | 128 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| nanit | 36 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| owlet | 26 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| spectra | 46 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| walmartbaby | 454 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| americaneagle | 148 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| academy | 33 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| smartbuyglasses | 544 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| finishline | 450 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| zumiez | 2492 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| hottopic | 2538 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| boxlunch | 2496 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| hollister | 249 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| abercrombie | 273 | 0 | 0.0% | 0.0% | 1.00 | 0.0% |
| walmart | 10734 | 1 | 0.0% | 0.0% | 1.00 | 0.0% |
| sephora | 2001 | 5 | 0.2% | 0.0% | 1.00 | 0.2% |
| advanceauto | 1365 | 87 | 6.4% | 5.4% | 1.11 | 6.4% |
| dicks | 517 | 212 | 41.0% | 22.1% | 1.79 | 41.0% |
| nautilus | 501 | 228 | 45.5% | 23.8% | 1.98 | 45.5% |
| chronicle | 209 | 96 | 45.9% | 45.0% | 2.95 | 46.4% |
| surfstation | 6173 | 3555 | 57.6% | 19.5% | 1.91 | 57.9% |
| parrot | 4018 | 2338 | 58.2% | 26.3% | 2.03 | 58.5% |
| partycity | 518 | 327 | 63.1% | 44.4% | 3.22 | 63.1% |
| surfworld | 3 | 2 | 66.7% | 66.7% | 3.00 | 66.7% |
| denniskirk | 1335 | 934 | 70.0% | 60.5% | 4.61 | 99.3% |
| valsurf | 3207 | 2275 | 70.9% | 45.3% | 2.69 | 70.9% |
| ccs | 13735 | 10327 | 75.2% | 37.2% | 2.60 | 75.2% |
| tennisexpress | 800 | 643 | 80.4% | 73.6% | 3.99 | 80.4% |
| jwpei | 2351 | 1902 | 80.9% | 68.1% | 3.60 | 80.9% |
| revzilla | 1153 | 946 | 82.0% | 67.4% | 4.77 | 99.3% |
| prosoccer | 2011 | 1688 | 83.9% | 72.1% | 4.36 | 83.9% |
| silviatcherassi | 494 | 416 | 84.2% | 76.9% | 2.65 | 84.2% |
| everlast | 112 | 99 | 88.4% | 85.7% | 4.76 | 88.4% |
| quietstorm | 454 | 410 | 90.3% | 55.1% | 3.67 | 90.3% |
| montce | 1566 | 1433 | 91.5% | 81.1% | 4.05 | 91.5% |
| statebags | 43 | 40 | 93.0% | 69.8% | 4.77 | 93.0% |
| mainland | 2238 | 2084 | 93.1% | 77.3% | 4.91 | 93.1% |
| islandwatersports | 8833 | 8249 | 93.4% | 86.1% | 6.06 | 93.4% |
| bhphoto | 1590 | 1513 | 95.2% | 77.8% | 4.27 | 100.0% |
| meliebianco | 310 | 296 | 95.5% | 70.6% | 5.50 | 97.4% |
| patbo | 496 | 476 | 96.0% | 84.1% | 3.73 | 96.0% |
| eberjey | 237 | 228 | 96.2% | 92.0% | 4.38 | 96.2% |
| venum | 554 | 536 | 96.8% | 96.2% | 5.41 | 96.9% |
| crocs | 564 | 547 | 97.0% | 0.0% | 1.97 | 97.0% |
| gameness | 100 | 98 | 98.0% | 98.0% | 6.88 | 98.0% |
| johannaortiz | 473 | 464 | 98.1% | 85.6% | 3.73 | 98.1% |
| ezpz | 107 | 106 | 99.1% | 97.2% | 11.18 | 99.1% |
| capittana | 516 | 512 | 99.2% | 98.1% | 5.07 | 99.2% |
| bentgo | 154 | 153 | 99.4% | 97.4% | 11.06 | 99.4% |
| revolve | 1649 | 1640 | 99.5% | 97.9% | 4.47 | 99.5% |
| baublebar | 6992 | 6962 | 99.6% | 76.7% | 3.97 | 99.7% |
| farmrio | 1195 | 1190 | 99.6% | 97.8% | 4.11 | 99.6% |
| xtremesoccer | 242 | 241 | 99.6% | 98.3% | 5.79 | 99.6% |
| assouline | 270 | 269 | 99.6% | 97.8% | 3.69 | 99.6% |
| tns | 1518 | 1515 | 99.8% | 97.9% | 4.33 | 99.8% |
| skims | 2161 | 2158 | 99.9% | 99.0% | 5.84 | 99.9% |
| youngla | 800 | 799 | 99.9% | 99.1% | 7.74 | 99.9% |
| farfetch | 3279 | 3276 | 99.9% | 89.4% | 4.40 | 99.9% |
| vix | 1602 | 1601 | 99.9% | 99.9% | 5.80 | 99.9% |
| tatami | 168 | 168 | 100.0% | 99.4% | 4.79 | 100.0% |
| mmawarehouse | 49 | 49 | 100.0% | 98.0% | 5.57 | 100.0% |
| combatcorner | 21 | 21 | 100.0% | 85.7% | 5.14 | 100.0% |
| fuji | 4 | 4 | 100.0% | 100.0% | 6.00 | 100.0% |
| elite | 95 | 95 | 100.0% | 100.0% | 8.03 | 100.0% |
| mushie | 33 | 33 | 100.0% | 100.0% | 11.94 | 100.0% |
| aguabendita | 417 | 417 | 100.0% | 100.0% | 5.94 | 100.0% |
| ancora | 508 | 508 | 100.0% | 98.0% | 4.70 | 100.0% |

### PDP galleries that repeat a photo (resized copy) or show a shared chart

| store | products affected | extra slides | share of the store's products |
|---|---:|---:|---:|
| bhphoto | 1589 | 7172 | 99.9% |
| denniskirk | 1283 | 2738 | 96.1% |
| revzilla | 1143 | 2149 | 99.1% |
| baublebar | 341 | 581 | 4.9% |
| skims | 110 | 112 | 5.1% |
| surfstation | 40 | 72 | 0.6% |
| parrot | 14 | 32 | 0.3% |
| farmrio | 11 | 11 | 0.9% |
| meliebianco | 10 | 10 | 3.2% |
| patbo | 10 | 10 | 2.0% |
| ancora | 8 | 8 | 1.6% |
| mainland | 6 | 11 | 0.3% |
| montce | 6 | 7 | 0.4% |
| tns | 5 | 8 | 0.3% |
| islandwatersports | 4 | 6 | 0.0% |
| ccs | 4 | 4 | 0.0% |
| vix | 4 | 4 | 0.2% |
| partycity | 2 | 2 | 0.4% |
| venum | 2 | 3 | 0.4% |
| elite | 2 | 2 | 2.1% |
| jwpei | 2 | 2 | 0.1% |
| chronicle | 2 | 2 | 1.0% |
| youngla | 1 | 1 | 0.1% |
| farfetch | 1 | 1 | 0.0% |
| silviatcherassi | 1 | 1 | 0.2% |
| capittana | 1 | 1 | 0.2% |

Shared non-product photos left out (used by 10+ products of one store): macys: 5, skims: 10, bhphoto: 12, surfstation: 6, baublebar: 22, meliebianco: 1, farmrio: 1, denniskirk: 1, bestbuy: 1

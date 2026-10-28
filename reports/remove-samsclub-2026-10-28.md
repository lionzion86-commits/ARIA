# Sam's Club off the site; one wide Walmart tile (2026-10-28)

#443 c.6468346931 (Danny's ruling, 07:56 EDT).

## Why
`samsclub-catalog.json` is 120 products from one 2026-09-26 scrape of a disposables aisle. On the live store page that read as Deportes 1 (a football paper plate), Electrónica 2 (lawn decor), Ropa 18 and Dulces 2. A store that cannot be real is not shown as one.

## What came out

**Data**
- **Bundle:** `CATALOGUE_FILES` and `SOURCE_RETAILERS` no longer list the file, so its 120 items stop appearing everywhere, departments included.
- **Photo search:** 118 rows purged from the index (`purge-store.py`, visual-index step only).
- **Generated data:** rebuilt with the repo's builders. That covers store slices (the `samsclub` storefront is gone), PDP rails (374 files removed), departments, brands, search and price indexes, Ofertas, home shelves and weight comparables.

**Registries**
- **The app bundle:**
  - its retailers mirror, the Tiendas tile list and the store photo, glow, delivery, tax and weight maps;
  - Aria Party's pool and the "Menaje descartable" sub-rail;
  - the image-host pattern and its comment.
- **The pages:** `tienda.html`, `producto.html` (catalogue list, store files, label) and `departamento.html`.
- **`scripts/lib/retailers.js`**, the delivery and weight tables, and the three builders' catalogue lists.

**Markup and copy**
- **Homepage:**
  - the phone and desktop "Tiendas de Estados Unidos" bands;
  - the "Compara precios" demo rows, which now show B&H Photo, a live store;
  - the copy "Walmart, Sam's Club, Zumiez, CCS".
- **Other pages:** the `nosotros.html` copy, the `tiendas.html` card (82 stores now), `sitemap.xml`, and the image-helper comment in ten pages.

**The assistant**
- Its store entry is gone, and its base prompt no longer names the store.
- If a shopper names it, she says it is not available and points to Walmart (`off_sale`, the Surf World pattern).
- Target and Costco no longer list it as their alternative.

## The Walmart tile
- **Layout:** one Walmart tile with `col-span-2` now fills the two-slot grid the Walmart and Sam's pair used. It keeps Walmart's colour and logo treatment, in both the phone and desktop bands.
- **Other tiles:** no other tile moved.

## Shelved, not deleted
- **Kept untouched:** `samsclub-catalog.json`, `logos/samsclub.svg` and `assets/stores/samsclub.jpg`. Nothing references them.
- **Off-sale gate:** `off-sale.js` keeps the key, so a cart saved before today cannot check out a Sam's line.

## The grep
A site-wide search of every served file for "sams club", "sam's club", "samsclub" and "member's mark" finds **0** files, outside the shelved catalogue and the off-sale gate. `closed-store-purge-tests` now holds the repo to that.

## Tests
- **`closed-store-purge` 13/13.** New: Sam's Club is shelved (catalogue kept, no rows or registry, zero names in served files), and the US-stores band is one wide Walmart tile.
- **`assistant-truth` 88/88:** her answer for Sam's Club is off sale, pointing to Walmart.
- **`pdp-weight-truth` 9/9:** the "Por confirmar" page check now uses a live product the resolver holds the same way (Walmart's 12-pack of 80-qt Sterilite bins). The Keter's page left with the store.
- **Also passing:**

| Suite | Result |
|---|---|
| removed-store-merch | 59/59 |
| tienda-thin | 16/16 |
| home-shelves | 5/5 |
| home-order | 9/9 |
| store-pills | 6/6 |
| ofertas-thin | 19/19 |
| departamento-thin | 12/12 |
| pdp-thin | 8/8 |
| marca-thin | 9/9 |
| classification | 8/8 |
| qa-misrouting | 4/4 |
| store-subrails | 6/6 |
| casa-aria | 7/7 |
| store-pulls | 9/9 |
| app-min | 3/3 |
| dsw-store | 36/36 |

- **`realtime-voice`:** 89/14, the same 14 failures as main.

## Screenshots (390px, local; retailer photos blocked in the sandbox)
- `hidden-docs/sams-removal-home-walmart-390.png`: the homepage band with one wide Walmart tile.
- `hidden-docs/sams-removal-tiendas-390.png`: `tiendas.html`, 82 stores, no Sam's Club.

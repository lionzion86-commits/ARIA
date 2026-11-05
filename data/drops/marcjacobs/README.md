# Marc Jacobs direct pull: the drop format

The Marc Jacobs store (#443 c.6643310622, amended c.6643334129) is wired and
gated: it shows nowhere until `marcjacobs-catalog.json` has products. This
folder documents what the drop from Lucifer's lane must look like. The drop
itself is data, not the site; put it anywhere (this folder is fine) and run:

    node scripts/ingest-marcjacobs.mjs --drop <file.json | folder> --regen

`--dry-run` prints the counts and writes nothing. `--base <origin>` sets the
origin used to build product links from Shopify handles (default
`https://www.marcjacobs.com`).

Scope is fashion: bags, shoes, ready-to-wear and accessories. Beauty and
fragrance rows are accepted but left out and counted (they already sell
through Sephora, Ulta, Macy's and Aria Perfumes).

## Accepted files

A drop is one `.json` file or a folder of them. Each file is detected on its
own, so the three shapes can be mixed.

### 1. The standard pull row (preferred)

An array of rows, or `{ "products": [ ...rows ] }`. One row per product (one
colourway = one row):

| field | type | required | meaning |
|---|---|---|---|
| `title` (or `name`) | string | yes | the store's own product name, e.g. `The Leather Medium Tote Bag` |
| `url` | https URL | yes | the product page (kept for the buyer; never linked from the site) |
| `price` | number, USD | yes | the selling price shown on the page, before tax |
| `wasPrice` (or `compareAtPrice`) | number or null | no | the struck-through price; only a value above `price` marks a sale |
| `images` | array of https URLs | yes, 1+ | the store's own photos, first = main photo (`image`, one URL, is also read) |
| `type` | string | yes | the store's own product type / category (`Tote Bags`, `Sneakers`, `Ready-to-Wear`, `Small Leather Goods`) |
| `sizes` | array of strings | for sized kinds | the sizes IN STOCK, as the page labels them |
| `sizesOut` | array of strings | no | the sizes the page shows SOLD OUT |
| `sku` (or `styleNumber`) | string | strongly wanted | the house's style number: lets the Comparador join retailer listings by code |
| `color` | string | no | the colourway; appended to the name (`... - Black`) when the title lacks it |
| `description` | string | no | the page's copy (HTML is stripped) |
| `brand` | string | no | defaults to `Marc Jacobs`; any other brand is left out |
| `currency` | string | no | must be `USD` (default) |
| `inStock` | boolean | no | `false` = left out |
| `gender` | string | no | `women` / `men`, when the page says |

Example:

```json
{ "products": [
  { "title": "The Leather Medium Tote Bag", "url": "https://www.marcjacobs.com/...",
    "price": 495, "wasPrice": null, "images": ["https://.../1.jpg", "https://.../2.jpg"],
    "type": "Tote Bags", "sku": "<style number>", "color": "Black" },
  { "title": "The 400 Bleecker Runner", "url": "https://www.marcjacobs.com/...",
    "price": 275, "images": ["https://.../1.jpg"], "type": "Sneakers",
    "sizes": ["36", "37", "38"], "sizesOut": ["39", "40"], "sku": "<style number>" }
] }
```

### 2. Shopify `/products.json`

`{ "products": [ { title, handle, vendor, product_type, body_html, options, variants, images } ] }`
exactly as Shopify serves it (concatenate the pages into one `products` array,
or drop one file per page).

- link: `<base>/products/<handle>`;
- price: the cheapest AVAILABLE variant's `price`; was-price: that variant's
  `compare_at_price` when above it;
- sizes: the option named `Size` / `Talla` / `Shoe size`; a size is in stock
  when any variant of it has `available: true`, sold out otherwise (`sizesOut`);
- colour: the `Color` option when the product has exactly one value;
- type: `product_type`; style number: the chosen variant's `sku`;
- no available variant = out of stock (left out).

### 3. A JSON-LD Product list

An array of `{"@type": "Product", ...}` objects, or `{ "@graph" | "products" | "items": [...] }`,
as read from each product page's `<script type="application/ld+json">`:

- `name`, `url`, `image` (string, array or ImageObject), `sku` / `mpn` / `productID`,
  `brand.name`, `category` (the type), `color`, `description`;
- `offers`: one `Offer`, an array, or an `AggregateOffer` with `offers`. The
  cheapest in-stock USD offer is the price; a was-price only from a
  `priceSpecification` with `priceType` `ListPrice` or `StrikethroughPrice`;
- sizes: offers that carry `size` (or `itemOffered.size`, or a per-size `name`
  when there are several offers); `InStock` / `LimitedAvailability` /
  `OnlineOnly` / `PreOrder` = in stock, anything else = `sizesOut`.

## What the ingest does with it

The rules are `scripts/lib/marcjacobs.js`; nothing is invented.

- Kept only with a name, an https link, an https photo and a USD price above
  zero. Left out and counted: out of stock, every size sold out, no photo, no
  price, not Marc Jacobs, not USD, duplicate (same link and photo), beauty /
  fragrance (out of scope), no category.
- Aisle (Bolsos / Zapatos / Ropa / Accesorios) from the store's own `type`,
  then the title's own noun. A row neither one places is left out ("no
  category"), never guessed.
- Sizes only from the pull: in-stock sizes in `sizes`, sold-out sizes in
  `sizesOut` (the product page shows the whole run, the sold-out ones marked
  agotada; only `sizes` can be sold). Shoes, clothing and sized accessories
  (belts, rings, gloves) with no sizes in the pull carry `sizesPending`:
  shown, not sold (`scripts/lib/sizes-pending.js`).
- Prices are stored as the store's raw USD, like every catalogue; the pages
  add Aria's margin and the 7% Miami sales tax (`salesTaxRateFor`, the same
  x1.07 every non-exempt store pays).
- Weights: `apply-weight-estimates.py` (+10%, flagged); Spanish
  descriptions from `scripts/data/descriptions-es/marcjacobs.json` when it
  exists (`apply-description-memory.mjs`).
- The store gate (`scripts/lib/store-gate.mjs`, the `AWAITING_CATALOG` line in
  `/off-sale.js`) opens once the catalogue has products; `--regen` then runs
  the one regenerate (store slices, doors, search, brand and department
  indexes, product pages, prices, Ofertas, menus, home pills).
- Report: `reports/marcjacobs-ingest.json`.

## What goes live on the drop

Store page `tienda.html?tienda=marcjacobs` (Ofertas from real was-prices, then
Bolsos, Zapatos, Ropa, Accesorios), its Tiendas tile on the home page, the
all-stores grid and its count, the store door from search and brand pages,
the header menu, search rows, the product pages, the Lujo department, and the
official store's row in the Comparador (every retailer listing whose Marc
Jacobs model key matches an official product).

## Still needed from Lucifer's lane

- the pull itself (with `sku`, `sizes` and `sizesOut` wherever the page shows them);
- the Marc Jacobs logo file (wordmark, SVG or PNG) -- none exists in the repo;
- a banner backdrop (campaign image or storefront photo) for the store header;
- the under-$50 shipping fee, if the house publishes one (the note gives only
  "free UPS Ground over $50"; under it the site says the store calculates it);
- the carrier-matrix row (UPS Ground) and the store's transit days to Miami.

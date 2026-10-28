# Ingest report: SNIPES and Carolina Herrera (2026-10-28)

Source: branch `catalog-pulls-2026-10-27` @ 51671496 (Lucifer's pulls, #443 c.6457579787). Built by `scripts/build-pull-catalogs.mjs`; the rules are `scripts/lib/store-pull-normalize.js`. Raw counts: `reports/store-pulls-2026-10-27.json`.


## SNIPES

- Raw products in the pull: **5000**. Kept: **4907**.
- Left out: 34 no price, 19 out of stock, 40 release SKUs (cut by design, listed below).
- By department: Calzado 938, Calzado de niños 661, Ropa streetwear 2611, Ropa de niños 417, Gorras 250, Accesorios 30.
- By brand (top 12): Nike 953, Jordan 442, PRO STANDARD 397, Smoke Rise 286, adidas 269, New Era 225, New Balance 207, Graphic Tees 198, UGG 130, Polo Ralph Lauren 111, Ethika 107, Mister Tee 100.
- Photos: **4907/4907 (100%)**, the store's own captured URLs; 4874 with more than one photo.
- Prices: 100% of kept items (rows without a price were left out). **Sale prices: none**: the pull carries no compare-at price, so nothing is marked on sale and there is no Ofertas rail.
- Weights: **0% published** (none in the source); 100% *estimado* from `weight-estimates.json` by type, +10%, flagged `weightEstimated`.
- Spanish descriptions: **4906/4907** (the rest had no real copy on their page: shown without a description, nothing written for them).
- Size runs: **0%** in the pull. **4627 items** (footwear and apparel) are `sizesPending`: shown, not sold, until a size pass lands. The product page shows «Tallas por confirmar» and `orders-create` refuses them. Sellable now: **280** (caps, accessories, bags, jewellery, fragrance, makeup).

### Release SKUs cut (40)

Matched by the names sneaker stores give their drops (OG and SP retros, collaborations): `RELEASE_RX` in the normalizer.

- Jordan · Big Kids' Air Jordan 1 Retro Low OG · US$ 39.99
- Nike · Zoom Vomero 5 SE SP · US$ 99.99
- Jordan · Air Jordan 1 Retro High OG · US$ 99.99
- Jordan · Air Jordan 1 Retro High OG · US$ 109.99
- Jordan · Little Kids' Air Jordan 1 Retro High OG · US$ 59.99
- Jordan · Big Kids' Air Jordan 1 Retro Low OG · US$ 79.99
- Jordan · Air Jordan 1 Retro High OG · US$ 185
- Jordan · Air Jordan 1 Retro High OG · US$ 129.99
- Jordan · Air Jordan 1 Retro Low OG · US$ 165
- Jordan · Big Kids' Air Jordan 1 Retro High OG · US$ 79.99
- Jordan · Little Kids' Air Jordan 1 Retro High OG · US$ 59.99
- Jordan · Little Kids' Air Jordan 1 Retro High OG · US$ 69.99
- Jordan · Toddler Air Jordan 1 Retro High OG · US$ 39.99
- Jordan · Big Kids' Air Jordan 5 Retro OG "White Metallic" · US$ 165
- Jordan · Little Kids' Air Jordan 5 Retro OG "White Metallic" · US$ 105
- Jordan · Toddler Air Jordan 5 Retro OG "White Metallic" · US$ 90
- Jordan · Big Kids' Air Jordan 1 Retro High OG "Flight Club" · US$ 99.99
- Jordan · Little Kids' Air Jordan 1 Retro High OG "Flight Club" · US$ 59.99
- Jordan · Toddler Air Jordan 1 Retro High OG "Flight Club" · US$ 49.99
- Jordan · Toddler Air Jordan 1 Retro Low OG "Banned" · US$ 49.99
- Jordan · Big Kids' Air Jordan 1 Retro Low OG "Banned" · US$ 79.99
- Jordan · Little Kids' Air Jordan 1 Retro Low OG "Banned" · US$ 59.99
- Jordan · Air Jordan 1 Retro High OG "Flight Club" · US$ 139.99
- Jordan · Air Jordan 5 Retro OG "White Metallic" · US$ 215
- Jordan · Air Jordan 1 Retro Low OG "Banned" · US$ 109.99
- Jordan · Air Jordan 1 Retro High OG "Love Letter" · US$ 185
- Jordan · Air Jordan 1 Retro Low OG "Garden" · US$ 155
- Jordan · Jordan 1 Retro High OG "Nails and Grails" · US$ 185
- Nike · Air Baltoro SP · US$ 145
- Nike · Air Baltoro SP · US$ 145
- Jordan · Little Kids' Jordan 1 Retro High OG "Nails and Grails" · US$ 85
- Jordan · Toddler Jordan 1 Retro High OG "Nails and Grails" · US$ 70
- Jordan · Little Kids' Air Jordan 1 Retro High OG "Love Letter" · US$ 85
- Jordan · Toddler Air Jordan 1 Retro High OG "Love Letter" · US$ 70
- Jordan · Big Kids' Air Jordan 1 Retro High OG "Love Letter" · US$ 140
- Nike · Air Max Goadome Low SP · US$ 175
- Nike · Air Max Goadome Low SP · US$ 185
- Jordan · Big Kids' Air Jordan 1 Retro Low OG "Phantom and Pine Green" · US$ 120
- Jordan · Air Jordan 1 Retro Low OG "Phantom and Pine Green" · US$ 119.99
- Jordan · Air Jordan 1 Retro Low OG "Howard" · US$ 155

## Carolina Herrera

- Raw products in the pull: **479**. Kept: **234**.
- Left out: 225 out of stock, 6 no price, 3 no category, 1 no photo.
- By department: Zapatos 11, Ready-to-wear 65, Joyas y accesorios 68, Fragancias 87, Maquillaje y accesorios de belleza 3.
- Photos: **234/234 (100%)**, the store's own captured URLs; 0 with more than one photo.
- Prices: 100% of kept items (rows without a price were left out). **Sale prices: none**: the pull carries no compare-at price, so nothing is marked on sale and there is no Ofertas rail.
- Weights: **0% published** (none in the source); 100% *estimado* from `weight-estimates.json` by type, +10%, flagged `weightEstimated`.
- Spanish descriptions: **94/234** (the rest had no real copy on their page: shown without a description, nothing written for them).
- Size runs: **0%** in the pull. **76 items** (footwear and apparel) are `sizesPending`: shown, not sold, until a size pass lands. The product page shows «Tallas por confirmar» and `orders-create` refuses them. Sellable now: **158** (caps, accessories, bags, jewellery, fragrance, makeup).

## Not in this build

- SNIPES men/women split: the pull names no gender on adult items (0 "Women's", 2 "Men's" in 5,000), so adult footwear and apparel are one Calzado and one Ropa rail; kids are split out by the name (Big Kids, Grade School, Toddler...).
- SNIPES Ofertas: no compare-at price in the pull, so the store opens on its brand carousels (Nike, Jordan, adidas, New Balance, then the next six brands).
- Carolina Herrera: the storefront files its 11 shoes under ready-to-wear; they get their own Zapatos aisle, first. 225 out-of-stock pieces were left out.
- CH Carolina Herrera bridge line (chcarolinaherrera.com): not folded in, per the order. Whether it is pullable is not verified from here: this sandbox cannot reach retailer hosts or api.apify.com, so it needs a pull run on Lucifer's side to answer.
- Store hero photos: no real interior photograph of either store is in the repo, so both heroes are the plain dark theme until one is supplied.
- Logos: no logo file for either store; the name is the badge.

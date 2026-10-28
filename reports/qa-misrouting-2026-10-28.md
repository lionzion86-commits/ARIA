# QA mis-routing sweep (2026-10-28)

#443 c.6458236993 (QA): toys in Ropa, plush in Sombreros, a toddler toy in Accesorios, a model kit in Zapatos.

## What was wrong

| Cause | Examples |
|---|---|
| **Names the noun table did not know** | "Fitted Sheet", "Slow Cooker", "Hair Color", "Hairspray", "Knee Brace", "Fitness Mat", "RC Car", "Train Set", "Lorcana starter deck", "4K Ultra HD" |
| **When name and type said nothing, the classifier filed the item under Ropa.** The store's own aisle (Walmart `toys`, `beauty`, `small_home`, `sporting_goods`) was never read. | Walmart's Ropa carousel held 251 items from its toys aisle and 109 from beauty. |
| **"Beanie Boos" and "Beanie Babies" read as hats** | Ty plush in Sombreros |
| **"Doll Wearing ... Outfit" read as clothing** | A Barbie in Ropa |
| **"MOC" (a Lego term) read as a moccasin** | A model engine kit in Zapatos |
| **"Baby and Toddler Toys" after a watch** | A toy watch in Accesorios |

## The fix (one classifier, `product-type.js` from the bundle)

- **New nouns:**
  - **Hogar:** bedding, towels, small kitchen appliances, kitchen tools, wall art, vases, frames, rugs, curtains, lamps, organizers.
  - **Belleza:** hair colour, hairspray, shampoo, nail kits, face, sheet and foot masks, lash glue, wigs, skin patches.
  - **Deportes:** joint braces, fitness and yoga mats, weights, bands.
  - **Juguetes:** RC and remote-control vehicles, train sets, minifigures, trading-card games and starter decks, play dough, blasters, electronic pets, costumes, art kits.
  - **Electrónica:** DVD, Blu-ray, 4K UHD.
- **New garment words**, so sports clothing stays Ropa: tracksuits, tights, sunshirts, walkshorts, tennis crews, "Match/Stadium Home/Away" shirts, jerseys.
- **Cuts and masks:** the main phrase now ends at "wearing". "Beanie Boos/Babies" is masked. "Moc" counts as a shoe only before toe, shoe or slipper words, or at the end of a name.
- **Strong toys:** RC or remote-control vehicles, and "Baby/Toddler/Kids Toys".
- **A new last step before Ropa: the store's own aisle.**
  - It applies only when the name and the type say nothing.
  - A garment noun still outranks it: "Classic Tank" in a beauty aisle stays Ropa.
  - `tienda.html`, `build-brand-index.mjs` and `build-department-slices.mjs` now pass the bucket.

## Effect (storefront type rails, all stores)

| Rail | Before | After |
|---|---:|---:|
| Ropa | 49,562 | 48,915 |
| Juguetes | 7,320 | 7,608 |
| Deportes | 14,104 | 14,350 |
| Belleza | 845 | 963 |
| Hogar | 2,569 | 2,612 |
| Accesorios | 9,572 | 9,549 |
| Zapatos | 9,463 | 9,456 |

- **Walmart's Ropa carousel:** 1,378 → 949.
- **Deportes gains** mostly wetsuits, spearfishing floats and mats that had no noun. Those are Surf & Skate gear under Deportes.

## Still open

- **The bucket is only as true as the store's filing.** Walmart's toys aisle has a carton of eggs, which now reads as Juguetes instead of Ropa. Both are wrong; it needs a grocery family or a re-file.
- **Plush keychains stay in Accesorios** (their head noun is "keychain"). Toy Story-themed BaubleBar jewellery stays Joyas.
- **`ropa-interior-tests`:** 2 feed-staleness failures, identical on main before this change.

## Tests

- **New `qa-misrouting-tests`:** 4/4.
- **Also green:**

| Suite | Result |
|---|---|
| classification | 8/8 |
| reroute-classification | 11/11 |
| store-subrails | 6/6 |
| tienda-thin | 16/16 |
| casa-aria | 7/7 |
| store-pulls | 9/9 |
| departamento-thin | 12/12 |
| pdp-thin | 8/8 |
| marca-thin | 9/9 |
| ofertas-thin | 19/19 |
| home-shelves | 5/5 |
| dsw-store | 36/36 |
| app-min | 3/3 |
| store-pills | 6/6 |
| removed-store-merch | 59/59 |

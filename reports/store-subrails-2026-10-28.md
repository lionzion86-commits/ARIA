# Sub-carousels and store-page sub-aisles (2026-10-28)

#443 c.6458236993 Part 2 (expansion doctrine) and c.6458506223 (store-page sub-aisles).

## What changed

- **Ver todo on a multi-family rail** (Zapatos, Ropa, Accesorios, Joyas, Carteras, Hogar, Trajes de baño, Sombreros) now opens labelled sub-carousels instead of one grid. The order is audience first (Mujer, Hombre, Niños), then type.
  - Zapatos: Zapatillas, Sandalias, Pantuflas y mocasines, Vestir, Botas, Chimpunes.
  - Ropa: Vestidos y faldas, Tops y blusas, Chompas y polerones, Jeans, Pantalones y shorts, Casacas y abrigos, Conjuntos y enterizos, Ropa de baño, Ropa interior y pijamas (last, as in subcategories.js).
  - Joyas: Sets, Relojes, Aretes, Pulseras y tobilleras, Collares y dijes, Anillos, Broches y pines.
  - Accesorios: Lentes de sol, Gorras y sombreros, Cinturones, Billeteras y tarjeteros, Bufandas y guantes, Corbatas y pañuelos, Accesorios para el pelo, Relojes, Medias, Llaveros y charms.
  - Carteras: Mochilas, Viaje y deporte, Loncheras, Billeteras y estuches, Carteras y bolsos.
- **A store's department pill that is mostly one such family** (at least 60%) opens into its aisles in the page. For example, Walmart's Hogar pill shows Ropa de cama, Toallas, Baño, Cocina, Mesa y vajilla, Cestas y organización and Lámparas.
- **Navigation:** under the carousels, "Ver los N juntos" opens the whole set as the grid it used to be. A carousel's own Ver todo opens its grid, and the back arrow returns to the carousels.

## Rules

- **Only aisles the data fills.**
  - An aisle needs 4 products.
  - An audience needs 4 products and at least 5% of the set.
  - A split needs 2 carousels.
  - There is no "Otros" bin: what no aisle names stays in the grid under the carousels.
- **Audience comes from the data.** The title's words come first ("for Women", "Ladies", "Boys"), then the store's gender facet, then the bucket.
  - Unisex shoes sit in both adult carousels (Danny's shoe ruling).
  - Any other piece whose audience the data does not state is left to the grid, never guessed into one.
- **Single-topic sets stay one grid** (Juguetes, Belleza, Electrónica...).

## Numbers (generic storefronts)

| | Count |
|---|---|
| Stores with sub-carousels | 55 |
| Rails that split | 152 (Ropa 46, Zapatos 23, Carteras 23, Accesorios 22, Joyas 14, Hogar 13, Trajes de baño 8, Sombreros 3) |
| Department pills that split | 37 |
| Sub-carousels in all | 943 |

- The sub-carousels' pages are endpoint rails (`assets/tienda/_fn/<store>.json`, key `<rail>~<audience>~<aisle>`). The first screen carries only their names and counts.
- Walmart's index is 20 KB gzipped (was 18 KB; the cap is 30 KB).

## Not in this PR

- **Static-sliced stores** (DSW, Crate & Barrel, Pier 1) keep their own department rails.
- **Misrouted items inside an aisle** come from the family classifier, not from this split. Examples: Gui Gui slime in Walmart Joyas, toys in Walmart's t-ropa. They are part of the QA mis-routing sweep.

## Tests

- `scripts/test/store-subrails-tests.mjs`: 6/6, including the headless walk on Walmart.
- `tienda-thin-tests` 16/16 (a pill with aisles is checked, then its grid).
- Also green: `casa-aria` 7/7, `reroute-classification` 11/11, `classification` 8/8, `store-pills` 6/6, `dsw-store` 36/36, `removed-store-merch` 59/59, `closed-store-purge` 11/11.

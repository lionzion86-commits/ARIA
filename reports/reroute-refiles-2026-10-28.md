# Re-route audit, layer B: the bucket re-files (2026-10-28)

Spec: `reroute-map.json`, `layer: department` (#443 c.6460976249). Stacked on #511, which fixed the rule layers.

**Rule:** a flag is applied only when the site's own classifier (`product-type.js`, by the item's name) agrees with the audit about what the item is, and the destination department admits the item once re-filed. Re-route, never remove. Everything else is held and listed in `reports/reroute-refiles-held.json`. `uncertain.json` is never read.

The re-files live in `scripts/data/reroute-refiles.json` (retailer + name + the bucket it came in), so a re-pull of a catalogue does not undo them; `build-department-slices.mjs` applies them.

**department flags 10524: 5905 re-filed, 4619 held**

| Bucket → destination | Flags | Re-filed | Held |
|---|---:|---:|---:|
| clothing -> joyas_accesorios | 3690 | 751 | 2939 |
| clothing -> shoes | 1323 | 1244 | 79 |
| clothing -> sunglasses | 811 | 734 | 77 |
| clothing -> sporting_goods | 532 | 322 | 210 |
| purses -> clothing | 504 | 501 | 3 |
| clothing -> purses | 440 | 434 | 6 |
| purses -> shoes | 302 | 276 | 26 |
| kids -> joyas_accesorios | 226 | 22 | 204 |
| clothing -> beauty | 223 | 212 | 11 |
| purses -> joyas_accesorios | 217 | 79 | 138 |
| women -> kids | 180 | 180 | 0 |
| clothing -> kids | 172 | 171 | 1 |
| kids -> shoes | 132 | 128 | 4 |
| moms -> electronics | 86 | 0 | 86 |
| men -> sporting_goods | 82 | 13 | 69 |
| kids -> clothing | 82 | 78 | 4 |
| kids -> purses | 69 | 64 | 5 |
| clothing -> home_goods | 67 | 61 | 6 |
| sporting_goods -> purses | 57 | 55 | 2 |
| curvy -> kids | 56 | 56 | 0 |
| kids -> sporting_goods | 52 | 9 | 43 |
| moms -> toys | 49 | 7 | 42 |
| moms -> purses | 43 | 40 | 3 |
| women -> sporting_goods | 42 | 15 | 27 |
| kids -> home_goods | 41 | 29 | 12 |
| gym_rat -> home_goods | 37 | 0 | 37 |
| electronics -> purses | 37 | 21 | 16 |
| home_decor -> electronics | 35 | 1 | 34 |
| men -> kids | 35 | 35 | 0 |
| moms -> home_goods | 35 | 13 | 22 |
| electronics -> toys | 32 | 18 | 14 |
| clothing -> electronics | 32 | 1 | 31 |
| electronics -> sporting_goods | 32 | 8 | 24 |
| clothing -> toys | 31 | 18 | 13 |
| sporting_goods -> toys | 29 | 3 | 26 |
| home_goods -> purses | 29 | 29 | 0 |
| clothing -> books | 29 | 23 | 6 |
| kids -> toys | 27 | 9 | 18 |
| gym_rat -> purses | 25 | 25 | 0 |
| home_goods -> clothing | 24 | 23 | 1 |
| sporting_goods -> home_goods | 23 | 4 | 19 |
| sporting_goods -> joyas_accesorios | 22 | 5 | 17 |
| sporting_goods -> beauty | 21 | 19 | 2 |
| home_decor -> toys | 19 | 3 | 16 |
| women -> home_goods | 19 | 5 | 14 |
| curvy -> sporting_goods | 19 | 1 | 18 |
| sporting_goods -> electronics | 19 | 1 | 18 |
| moms -> clothing | 19 | 19 | 0 |
| kids -> sunglasses | 17 | 16 | 1 |
| beauty -> home_goods | 15 | 6 | 9 |
| beauty -> joyas_accesorios | 15 | 12 | 3 |
| women -> toys | 15 | 5 | 10 |
| beauty -> shoes | 14 | 0 | 14 |
| home_goods -> sporting_goods | 14 | 12 | 2 |
| beauty -> electronics | 13 | 0 | 13 |
| curvy -> moms | 13 | 0 | 13 |
| clothing -> moms | 13 | 3 | 10 |
| kids -> beauty | 13 | 11 | 2 |
| curvy -> toys | 12 | 2 | 10 |
| electronics -> home_goods | 12 | 2 | 10 |
| purses -> beauty | 12 | 0 | 12 |
| purses -> home_goods | 11 | 0 | 11 |
| combat_sports -> purses | 9 | 9 | 0 |
| purses -> auto_parts | 9 | 0 | 9 |
| kids -> moms | 9 | 9 | 0 |
| moms -> joyas_accesorios | 9 | 4 | 5 |
| beauty -> clothing | 8 | 7 | 1 |
| women -> moms | 8 | 0 | 8 |
| sporting_goods -> moms | 8 | 2 | 6 |
| beauty -> candy_chocolate | 7 | 0 | 7 |
| perfumes -> clothing | 7 | 0 | 7 |
| beauty -> purses | 6 | 3 | 3 |
| men -> toys | 6 | 1 | 5 |
| electronics -> clothing | 6 | 1 | 5 |
| purses -> sunglasses | 6 | 6 | 0 |
| home_goods -> kids | 5 | 5 | 0 |
| men -> moms | 5 | 0 | 5 |
| moms -> candy_chocolate | 5 | 0 | 5 |
| moms -> sporting_goods | 5 | 0 | 5 |
| candy_chocolate -> purses | 4 | 0 | 4 |
| home_decor -> sporting_goods | 4 | 0 | 4 |
| men -> home_goods | 4 | 0 | 4 |
| sporting_goods -> books | 4 | 4 | 0 |
| purses -> kids | 4 | 4 | 0 |
| home_decor -> perfumes | 3 | 0 | 3 |
| home_goods -> joyas_accesorios | 3 | 0 | 3 |
| men -> electronics | 3 | 0 | 3 |
| sporting_goods -> auto_parts | 3 | 0 | 3 |
| women -> electronics | 3 | 1 | 2 |
| gym_rat -> joyas_accesorios | 3 | 3 | 0 |
| home_goods -> shoes | 3 | 0 | 3 |
| home_goods -> toys | 3 | 1 | 2 |
| electronics -> shoes | 3 | 0 | 3 |
| electronics -> joyas_accesorios | 3 | 0 | 3 |
| clothing -> perfumes | 3 | 3 | 0 |
| combat_sports -> home_goods | 3 | 1 | 2 |
| purses -> sporting_goods | 3 | 0 | 3 |
| moms -> auto_parts | 3 | 0 | 3 |
| electronics -> beauty | 3 | 2 | 1 |
| perfumes -> sporting_goods | 3 | 0 | 3 |
| men -> auto_parts | 2 | 0 | 2 |
| women -> auto_parts | 2 | 0 | 2 |
| women -> candy_chocolate | 2 | 0 | 2 |
| beauty -> sporting_goods | 2 | 0 | 2 |
| electronics -> moms | 2 | 0 | 2 |
| clothing -> auto_parts | 2 | 1 | 1 |
| clothing -> candy_chocolate | 2 | 0 | 2 |
| curvy -> home_goods | 2 | 1 | 1 |
| kids -> electronics | 2 | 0 | 2 |
| books -> home_goods | 2 | 0 | 2 |
| moms -> shoes | 2 | 0 | 2 |
| moms -> books | 2 | 2 | 0 |
| candy_chocolate -> home_goods | 1 | 0 | 1 |
| home_decor -> joyas_accesorios | 1 | 0 | 1 |
| home_decor -> shoes | 1 | 0 | 1 |
| home_decor -> clothing | 1 | 0 | 1 |
| home_goods -> perfumes | 1 | 1 | 0 |
| beauty -> toys | 1 | 0 | 1 |
| gym_rat -> electronics | 1 | 0 | 1 |
| gym_rat -> beauty | 1 | 0 | 1 |
| curvy -> electronics | 1 | 0 | 1 |
| home_goods -> auto_parts | 1 | 0 | 1 |
| electronics -> candy_chocolate | 1 | 0 | 1 |
| curvy -> books | 1 | 0 | 1 |
| purses -> books | 1 | 0 | 1 |
| books -> toys | 1 | 0 | 1 |
| electronics -> auto_parts | 1 | 0 | 1 |
| perfumes -> candy_chocolate | 1 | 0 | 1 |
| perfumes -> moms | 1 | 0 | 1 |

## Why flags were held, by class (audit truth → site's classifier)

- **clothing -> joyas_accesorios** (2939): accessory → accesorios 2464; accessory → deportes 157; accessory → hogar 120. E.g. "AIR Composite Fins".
- **clothing -> sporting_goods** (210): sports → accesorios 70; sports → hogar 52; sports → ropa 45. E.g. "BILLABONG LE SURF REV AVA TNK".
- **kids -> joyas_accesorios** (204): accessory → accesorios 148; accessory → ropa 24; accessory → zapatos 23. E.g. "Aqua Sphere Seal 2.0 Kids Goggle".
- **purses -> joyas_accesorios** (138): accessory → accesorios 138. E.g. "Fruity Blossom Blueberry Lemon Phone Case - Blue".
- **moms -> electronics** (86): electronics → bebe 82; electronics → carteras 3; electronics → ropa 1. E.g. "Replacement HEPA Filter For The Bottle Washer Pro®".
- **clothing -> shoes** (79): footwear → accesorios 58; footwear → ropa 6; footwear → zapatos 6. E.g. "'47 Clean Up NB Athletic Shoe".
- **clothing -> sunglasses** (77): sunglasses → ropa 74; sunglasses → zapatos 2; sunglasses → hogar 1. E.g. "Blackfin Blue Mirror 580P Tortoise Global Fit Frame".
- **men -> sporting_goods** (69): sports → accesorios 28; sports → trajes_bano 26; sports → ropa 15. E.g. "Black Shared Logo Skate Crewneck Sweatshirt".
- **kids -> sporting_goods** (43): sports → ropa 30; sports → trajes_bano 6; sports → sombreros 4. E.g. "Boys 8-20 Under Armour Bear Kayak Graphic Hoodie".
- **moms -> toys** (42): toy → bebe 32; toy → ropa 7; toy → joyas 3. E.g. "Dr. Brown's® Ridgees™ Cow Teether".
- **gym_rat -> home_goods** (37): home → ropa 37. E.g. "Soft Sculpt Halterneck Tank With Shelf — Black".
- **home_decor -> electronics** (34): electronics → hogar 34. E.g. "Neasyth 530 pcs Glow in The Dark Stars for Ceiling, Space Wa".

Most held flags are audit truths read off a catch-all type: the surf shops type wetsuits, boardshorts, fins and shoes as "Accesorios", and the audit's `type:accessory-noun` evidence called them accessories (clothing → joyas_accesorios, 2,939 held). Baby monitors and bottle warmers the audit sends to Electrónica stay in Bebé y mamá.
## Department sizes (#511 → this branch)

| Department | Before | After |
|---|---:|---:|
| beauty | 554 | 792 |
| books | 479 | 508 |
| clothing | 20422 | 17187 |
| combat_sports | 1103 | 1093 |
| curvy | 6465 | 6432 |
| gym_rat | 800 | 786 |
| home_decor | 911 | 907 |
| home_goods | 24 | 129 |
| kids | 1952 | 1941 |
| men | 10697 | 10656 |
| moms | 2697 | 2629 |
| purses | 2715 | 2439 |
| shoes | 7608 | 7894 |
| sporting_goods | 17543 | 17803 |
| women | 13296 | 13146 |

## Not reached

- **Seven JW PEI dresses** ("Orchid ... Dress - Blush Pink") are not in the map. They stay under purses until a rule-level form check for the bucket departments, or a map entry, reaches them.
- **26 JW PEI slingback pumps** are held: the footwear title rule has no "pumps", and adding it in both footwear mirrors would also catch fuel and water pumps.

# Re-route audit: the rule layer, before and after (2026-10-28)

Spec: Lucifer's audit, `reroute-audit-2026-10-27` @ 2665adf7 (#443 c.6460976249); start order c.6461228058. Each flag in `reroute-map.json` was replayed through the site's own code on this branch (`product-type.js`, `belongsToDept`). "Still reproduces" = the site still puts the item where the audit says it should not be. "Agrees" = the site now puts it where the audit says. "Elsewhere" = neither (most are audit truth errors: §8 of its report puts its precision at about 90%; examples below).

## Layer T: store and category type rails (`product-type.js`)

**39,047 flags → 2,551 still reproduce** (6.5%); 34,708 now agree with the audit, 1,788 land elsewhere.

| Class (was → audit) | Flags | Agrees | Still reproduces | Elsewhere |
|---|---:|---:|---:|---:|
| ropa → deportes | 11119 | 10716 | 232 | 171 |
| ropa → juguetes | 7182 | 6721 | 123 | 338 |
| ropa → zapatos | 2977 | 2757 | 37 | 183 |
| accesorios → ropa | 2149 | 2002 | 59 | 88 |
| ropa → electronica | 1903 | 1639 | 28 | 236 |
| accesorios → deportes | 1708 | 1082 | 442 | 184 |
| ropa → hogar | 1654 | 1479 | 70 | 105 |
| ropa → belleza | 1630 | 1524 | 79 | 27 |
| ropa → bebe | 1517 | 1044 | 392 | 81 |
| ropa → accesorios | 1272 | 1129 | 100 | 43 |
| ropa → repuestos | 1159 | 1145 | 1 | 13 |
| ropa → libros | 498 | 480 | 18 | 0 |
| carteras → joyas | 445 | 443 | 2 | 0 |
| ropa → perfumes | 386 | 346 | 1 | 39 |
| accesorios → sombreros | 363 | 360 | 1 | 2 |
| accesorios → joyas | 357 | 333 | 22 | 2 |
| accesorios → belleza | 228 | 222 | 4 | 2 |
| carteras → accesorios | 153 | 139 | 6 | 8 |
| zapatos → accesorios | 148 | 63 | 84 | 1 |
| accesorios → carteras | 143 | 119 | 17 | 7 |
| ropa → joyas | 124 | 94 | 4 | 26 |
| carteras → juguetes | 114 | 16 | 37 | 61 |
| carteras → bebe | 108 | 48 | 60 | 0 |
| carteras → deportes | 105 | 29 | 73 | 3 |
| trajes_bano → deportes | 100 | 0 | 98 | 2 |
| accesorios → repuestos | 96 | 33 | 47 | 16 |
| carteras → repuestos | 93 | 78 | 15 | 0 |
| ropa → dulces | 90 | 65 | 12 | 13 |
| accesorios → juguetes | 88 | 41 | 6 | 41 |
| joyas → ropa | 86 | 48 | 37 | 1 |

Classes under 40 flags are left out of the table; they are in the totals.

## Layer K: the kind departments (`KIND_MATCH`)

**3,653 flags → 312 still reproduce.** The middle column is the state with #500 alone (this branch is stacked on it; #500 rewrote Zapatos).

| Department | Flags | Still in, #500 only | Still in, this branch |
|---|---:|---:|---:|
| shoes | 2063 | 90 | 90 |
| party | 822 | 822 | 73 |
| toys | 369 | 369 | 13 |
| shoes_men | 181 | 24 | 24 |
| shoes_women | 76 | 20 | 20 |
| sunglasses | 63 | 63 | 54 |
| spearfishing | 39 | 39 | 13 |
| soccer | 24 | 24 | 9 |
| perfumes | 12 | 12 | 12 |
| tennis | 4 | 4 | 4 |

## Department sizes (built slices, #500 → this branch)

| Department | Before | After |
|---|---:|---:|
| joyas_accesorios | 5036 | 8471 |
| toys | 4986 | 7204 |
| party | 1950 | 1074 |
| auto_parts | 834 | 1377 |
| perfumes | 10498 | 10513 |
| soccer | 1157 | 1724 |
| spearfishing | 1277 | 1200 |
| sunglasses | 1865 | 1856 |
| shoes | 7608 | 7608 |

## What still reproduces, and why

Sampled by hand from each large class:

- **Audit truth errors (left as they are):**
  - Nike SB Dunks and Old Skools typed "Accesorios" are shoes, not accessories;
  - gym "shelf" tanks are tops, not home goods;
  - surf bikinis are swimwear, not sporting goods;
  - candy-themed earrings are earrings;
  - picture frames are home goods, not electronics;
  - a "Thrasher Magazine Tee" is a tee;
  - plain sneakers stay in Zapatos.
- **Judgement calls, kept as fashion:** maternity and nursing garments stay Ropa (the audit sends them to Bebé y mamá; they are clothes, and Mama's Fashion is a department). Sport sunglasses stay Accesorios and Lentes de Sol.
- **Names that name nothing** ("Quiksilver Hooked On Ahi", "The Destroyer Hybrid") keep the site's type, as the audit itself does with its uncertain list.

## Not in this PR

- **Layer B (`department`, 10,524 flags):** the bucket re-files from `reroute-map.json`. This is the data PR that follows, per §9: rules first, data second.
- **`uncertain.json` (17,391):** never applied.
- **Perfumes beyond Aria Perfumes:** the rule now admits every true fragrance. The 642 the audit counts are mostly at Macy's, Ulta, Costco, Victoria's Secret and Miu Miu, which are off sale (`off-sale.js`), so 15 reach the page today.

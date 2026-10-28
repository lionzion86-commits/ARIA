# Catalog Mis-Routing Audit — ariashop.pe — 2026-10-27

**Danny's ruling:** bots sweep category by category; anything not matching its category gets put in the CORRECT one. Re-route only — nothing in this audit proposes deleting a product.

**Deliverables in this folder**
- `reroute-map.json` — 53,224 high-confidence re-route flags over **46,003 unique products** (one product can carry flags on more than one surface). Fields per flag: `file, retailer, bucket, id, name, brand, type, price, url`, `layer` (`product-type` | `department` | `kind-rule`), `currentType`/`currentDept`, `toType`/`toDept`, `truthKind`, `evidence`, `signals`, `trapWord` (kind-rule layer), `note`.
- `uncertain.json` — 17,391 items the audit would NOT guess on (composition in §7).
- `audit2.mjs` — the audit itself, rerunnable (§9). `audit-stats.json` — raw counters. `validation-sample-final2.txt` — the judged validation sample.

**Scope.** 157,279 product rows audited across the 67 files the shopper surfaces actually load (the census `CATALOGUE_FILES` + the three department-cache parts + the department builder's `CATALOG_FILES`); 156,561 of them are displayable (name + photo + price). The catalog watchdog's 176,822 counts every `*-catalog.json` on disk, including files no surface loads and the `department-cache.json` aggregate, which duplicates the three split parts — the aggregate was excluded here so Walmart/Old Navy/Foot Locker items are counted once, where shoppers actually meet them.

---

## 1. How a product's category is actually assigned (three different machines)

The audit's first job was finding the real assignment logic. There are **three independent mechanisms**, in three different files, and Danny's screenshots hit all three:

1. **Bucket departments** (`scripts/build-department-slices.mjs` → `DEPT_RULES`). Most department pages (Ropa, Moda Mujer/Hombre/Niños, Carteras, Hogar, Belleza, Libros, Mama's Fashion, Gym Rat, Fight Club, Deportes…) take **every item filed in a list of named buckets**, verbatim. Whatever the puller filed in the bucket is what the department shows.
2. **Kind departments** (same file → `KIND_MATCH`). Juguetes, Joyas y Accesorios, Zapatos, Lentes de Sol, Aria Party, Fútbol, Tenis, Surf & Skate, Pesca Submarina, Repuestos and Lujo ignore buckets and keyword-match `title + brand + type` by **raw substring** (`indexOf`, no word boundaries).
3. **Fashion product-type rails** (`tienda.html`'s `productTypeOf` / `categorias.html`'s `latinoProductTypeOfItem` — one classifier family; store slices built by `scripts/build-store-slices.mjs` `genericRails`). Every store page and the category rails group **all** of a store's items into seven fashion types — Trajes de Baño, Carteras, Joyas, Zapatos, Sombreros, Accesorios, Ropa — with **Ropa as the fallback for anything unrecognized**. This is the machine that put toys in the "Ropa" rail (9,739) Danny screenshotted: it has no toy/sport/home/electronics veto at all.

The audit computed each item's real assignments by **importing the site's own code** (`DEPT_RULES`/`KIND_MATCH`/`belongsToDept` from the slice builder, and the census lift `scripts/census-classification.mjs` for the type classifier), then compared them against an independent "truth" classification of what each product actually is (name first — §8), and flagged disagreements.

## 2. Headline results

| Layer | What it catches | Flags |
|---|---|---|
| `product-type` | Store/category rails group the item under a fashion type it isn't | **39,047** |
| `department` | Item is filed in a bucket whose department it doesn't belong to | **10,524** |
| `kind-rule` | A keyword department admits the item on a substring trap | **3,653** |
| **Total** | over **46,003 unique products** (29% of everything displayable) | **53,224** |

**Where flags point (destination):** Deportes 15,288 · Juguetes 8,373 · Joyas y Accesorios 7,179 · Zapatos 4,869 · Ropa 4,020 · Belleza 2,275 · Electrónica 2,220 · Hogar 2,134 · Mama's Fashion 1,788 · Repuestos 1,372 · Carteras 969 · Lentes de Sol 925 · Moda Niños 641 · Libros 574 · Perfumes 492 · Dulces 139.

**Where they come from (current assignment):** the Ropa rail alone sheds **31,566** items that aren't clothing; the Accesorios rail 5,390; the Ropa *department* (bucket `clothing`) 7,370; Zapatos department 2,063 (substring captives, §4); Carteras rail 1,140; Carteras department 1,069; Aria Party 822.

**Per-department audit table** (membership under the site's own rules vs flags out):

| Department | Items in it (site rules) | Flagged out (bucket + kind layers) |
|---|---|---|
| Ropa (clothing) | 21,810 | 7,370 |
| Moda Mujer (women) | 21,496 | 271 |
| Moda Hombre (men) | 13,360 | 137 |
| Deportes (sporting_goods) | 17,921 | 186 (rest of its mix is by design, §5) |
| Surf & Skate (kind) | 10,883 | — (kind layer, §4) |
| Zapatos (kind, + men/women splits) | 10,647 | 2,063 + 181 + 76 |
| Joyas y Accesorios (kind) | 5,655 | 63 direct + the §4 trap classes |
| Juguetes (kind) | 5,146 | 369 |
| Belleza (beauty) | 5,514 | 81 |
| Carteras (purses) | 2,715 | 1,069 |
| Mama's Fashion (moms) | 3,026 | 258 |
| Moda Niños (kids) | 2,428 | 670 |
| Hogar + Decoración | 1,548 + 911 | 83 + 64 |
| Libros (books) | 481 | 3 |
| Repuestos (kind) | 934 | small |
| Aria Party (kind) | 1,990 | 822 |

## 3. Danny's seed cases — all verified caught

| Danny saw | Audit flag |
|---|---|
| Fisher-Price Little People truck, Toy Story 5 plush, Paw Patrol Play Pack in **Ropa** | `product-type: ropa → toys` (7,182 flags in this class) |
| Barbie Signature Graduation / Día de Muertos / Careers Pilot dolls in **Sombreros** | `product-type: sombreros → toys` — the classifier read "hat/cap" in the dolls' descriptions |
| KBNDIEU Horse Ornaments in **Joyas** (S/ 4.24) | `product-type: joyas → home_goods` — trapped by "Pendant" in the title; the same title also puts them in Aria Party via "Decorations" |
| Winnie the Pooh bodysuit + skirt + headband set in **Accesorios** | `product-type: accesorios → kids` (Moda Niños) — trapped by "Headband" |
| Bemona styrofoam wig head in **Sombreros** | `product-type: sombreros → joyas_accesorios` — a display fixture, not a hat |
| Zapatos expansion = one mixed grid | Not a data defect — the Zapatos department itself is correctly populated by kind rule; the missing sub-carousels are the expansion-doctrine build already filed on #443 |

Bonus catch in the same family: the Barbie Pilot doll's **Spanish** title ("…zapatos y sombrero") also lands the doll in the **Zapatos department** — flagged `kind-rule: shoes → toys`, trap word `zapato`.

## 4. Failure class A — substring traps in the kind departments (3,653 flags)

`KIND_MATCH` matches raw substrings over title + brand + type. The traps, with the trap word counted:

- **`heel` ⊂ `wheels` — 1,447 flags.** Every Hot Wheels car and every skateboard/longboard wheel is a member of the **Zapatos department**. ("Hot Wheels" the brand contains "heel".)
- **`boot` — 268.** "Bootcut" jeans in Zapatos; **`taco`** (cleat) and **`sandal`** put socks ("Long Sandal Socks") in Zapatos.
- **`birthday` / `party` / `decoraci` — 822 Aria Party flags.** CCS's "Birthday" skateboard line (a product line name) fills Aria Party with skateboards; stickers whose retailer type says "Stickers y decoración" join the party too.
- **`toy` in a brand name.** Every Toy Machine product (a skate brand) is in Juguetes, including its socks and hoodies; **`doll`** catches doll-adjacent non-toys.
- **`collar`** (Spanish for necklace) admits polo-collar shirts to Joyas; **`charm`** admits "Charm Hoodie" to Joyas; **`pendant`** admits Christmas ornaments (Danny's case) to Joyas.
- **`battery`** (autoparts) admits RC toy cars ("Battery & Charger Included") to Repuestos; **`brake`** etc. are fine, but the list is short — see §6.

**Fix at the classifier level, not the data level:** word-boundary matching + a form check (what the item IS) before any kind word admits it. Fixing `heel→wheels` alone clears ~1,400 flags without touching a single product.

## 5. Failure class B — the fashion-type fallback (39,047 flags)

The type classifier knows seven fashion types and nothing else; its fallback is Ropa. Consequences, per destination: sporting goods typed Ropa **11,120** (every skateboard/surfboard in CCS, Surf Station, Island Water Sports, Zumiez…), toys typed Ropa **7,182** (Walmart's toy aisle on generalist store pages), footwear the shoe-veto missed **2,982**, electronics **2,015** (B&H's whole catalog), moms/baby **1,558** (strollers, bottles), home **1,551**, auto parts **1,159** (Advance Auto brake rotors as "Ropa"), beauty/fragrance **2,100+**. It also trusts the puller's `type` field, which lies constantly in the other direction: garments filed "Accesorios" by CCS/ProSoccer pullers (2,301 flags `accesorios → ropa`), swimwear bottoms, jerseys, socks.

**Fix at the classifier level:** give the type classifier the vetoes the search stack already has (`isToyItem`, `isShoeItem` exist elsewhere) plus non-fashion detection (sports/home/electronics/moms/auto vocabularies), and stop letting a bare retailer `type` word outrank the product's own name. The map is the item-level spec of what the fixed classifier should produce.

## 6. Failure class C — bucket mis-filings by the pullers (10,524 flags) + coverage gaps

- **JW PEI files its entire store under `purses`** — dresses, shorts, mules, loafers, a pendant necklace (1,069 Carteras flags).
- **Surf/skate retailers file everything under `clothing`** — Pura Vida necklaces/bracelets/anklets, Oakley/Ray-Ban sunglasses, FCS fins, stickers, skate wax (the `clothing` bucket is the single biggest offender: 7,370 flags).
- **Kohl's files both ways** — apparel under `home`, and home goods under type "Ropa" (serving bowls, stools, tents).
- **Macy's** files Finish Line sneakers under `women`; **SSENSE** files jewelry inside gender buckets (absorbed by Moda Mujer/Hombre by design, but see the gap below).

**Coverage gaps (the reverse defect — items that canNOT reach their department):** measured by counting independently-classified items the kind rules don't admit:
- **Joyas y Accesorios misses 5,544 true jewelry and 6,908 true accessories.** The joyas word list has no `ring`, `watch`, `anklet`, `brooch`, `stud`, `tiara`, and **no accessory words at all** — a watch, belt or scarf reaches the department only if a puller happened to file it in a jewelry bucket.
- **Juguetes misses 3,038 true toys** whose titles lack `toy/doll/lego/plush/puzzle` (e.g. "Barbie Signature…" with no "doll" in the title).
- **Zapatos misses 1,863 true footwear** — `zapatilla` does not contain `zapato`; `mule`, `clog`, `sneaker` variants and model-only names ("Ellipse") escape.
- **Repuestos misses 1,233 auto parts** (struts, control arms, water/fuel pumps, sensors, serpentine belts — none in the word list).
- **Perfumes admits only `retailer === "ariaperfumes"`** — 642 true fragrances sold by Victoria's Secret, Macy's, Ulta and Costco can never appear in the Perfumes department.

## 7. The uncertain list (17,391) — never guessed, never deleted

- **15,984** displayable products got **no independent classification** (their names carry no category vocabulary the audit could use — designer product codes, terse luxury names, media/DVDs, long-tail generalist stock). They keep the site's own type; listed for human sampling.
- **1,168** had a truth only from the retailer's `type` field **contradicting the bucket's family** (Kohl's "Ropa" serving bowls) — demoted out of the map on purpose.
- **239** had genuinely conflicting signals (thematic brand signal vs form signal).

## 8. Validation — precision, honestly

Method: the truth classifier classifies from the product's **own name first** (in the validation samples, every name-vs-type-field conflict resolved in the name's favor — the pullers' type fields are the disease), falls back to type+brand only when the name is silent, and applies ~40 context guards the sampling forced (depiction forms — a sneaker *charm* is jewelry; head-noun priority — a skate *shoe* is a shoe; color-word traps — "Chocolate" pants, "Espresso" leggings; `heel` in "Tar Heels"; LEGO-clog vs lacing-sneaker-toy; etc.).

Two stratified random samples, weighted toward the largest flag classes, hand-judged item by item: **131 items → ~86% correct**, then after the guard fixes **112 items → ~91% correct**, and a final regression pass confirmed 7 of that sample's 9 remaining clear errors fixed (the 2 left: a bikini bottom since fixed, and O'Neill's "4211 Epic 3/2" — a wetsuit whose name is a bare product code, unknowable from data). **Estimated overall precision ≈ 90%**, and higher (~95%+) for name-derived flags in the biggest classes (boards, toys, footwear, beauty, auto parts). Residual errors concentrate in type-field-only truths on nameless products and surf/skate "Accesorios"-typed gear. Recall is bounded on purpose: what the audit couldn't classify, it didn't touch (§7).

All five of Danny's seed classes (§3) are caught with the exact current → correct assignments he named.

## 9. How Chad should apply this

1. **Classifier first, data second.** Whole classes die at the rule level: word boundaries + form checks in `KIND_MATCH` (§4), non-fashion vetoes in the type classifier (§5), wider word lists for the coverage gaps (§6). The map then serves as the regression spec: after a rule fix, the corresponding flags should simply stop reproducing.
2. **Layer B (`department`) = bucket re-files** in the catalog JSONs (move the item to a bucket of the destination department). **Layer K (`kind-rule`) = proof the item shows in a department it shouldn't** — fixed by the rule change, not by moving data. **Layer T (`product-type`) = the store/category rail grouping** — fixed by the classifier change; the `toType` field says what the item should group as (null when it shouldn't carry a fashion type at all).
3. `uncertain.json` is **not** auto-appliable — it's the human-sampling queue.
4. Standing rules honored throughout: **re-route, never remove**; Juguetes vs kids' clothing kept mutually exclusive (wearable kids' garments → Moda Niños, dress-up *sets* included; toys stay toys); fragrances never under clothing; no new categories invented — every destination is an existing department/type key.

**Regeneration:** restore a worktree of origin/main and run
`AUDIT_ROOT=<worktree> AUDIT_OUT=<this folder> node audit2.mjs`
(scratch worktree used for this run was removed after delivery; the audit reads only committed catalogues + site code).

*Method note:* local compute only; no Apify, no paid APIs, no external sends; no production files edited, nothing pushed.

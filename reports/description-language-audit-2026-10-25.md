# Product description language audit, 2026-10-25

#443 c.6402691998. Counts are of what the product pages show: every record in `assets/pdp/p/`, classified by `scripts/audit-description-language.mjs` (English function words against Spanish ones). `uniqEN` is the number of distinct English texts, which is the translation work left. "after" is this PR: the whole Aria Perfumes (FragranceX) lane translated and stored in `scripts/data/descriptions-es/ariaperfumes.json`, and the product page no longer falls back to the feed's English copy (`description_en`).

Notes:
- ariaperfumes: after = 0 English prose. The title-only copies ("Light Blue Colonia de Dolce & Gabbana", 3,785 of the 7,437 distinct texts) still count as 'en' in the word test because the fragrance's own name is English; the test (`description-language-tests.mjs`) checks those separately.
- ssense: its English sat in `description_en`, which the page no longer shows: 3,690 English pages became 'none' until its Spanish lands (drop 2).
- Every other store's English is in `description` itself and is unchanged by this PR: that is drop 2.

| store | English before | English after | uniqEN before | uniqEN after | records | no description after |
|---|---:|---:|---:|---:|---:|---:|
| ariaperfumes | 9930 | 78 | 6905 | 59 | 10534 | 0 |
| walmart | 4628 | 4628 | 4168 | 4168 | 10860 | 4570 |
| ssense | 3690 | 0 | 1589 | 0 | 36000 | 36000 |
| baublebar | 3454 | 3454 | 2476 | 2476 | 7012 | 52 |
| bestbuy | 2813 | 2813 | 2540 | 2540 | 2889 | 59 |
| hottopic | 2544 | 2544 | 2538 | 2538 | 2544 | 0 |
| boxlunch | 2519 | 2519 | 2497 | 2497 | 2519 | 0 |
| zumiez | 2493 | 2493 | 2491 | 2491 | 2494 | 0 |
| jwpei | 618 | 618 | 435 | 435 | 2351 | 0 |
| costco | 313 | 313 | 305 | 305 | 1468 | 0 |
| bhphoto | 222 | 222 | 221 | 221 | 1706 | 0 |
| smartbuyglasses | 90 | 90 | 88 | 88 | 545 | 4 |
| walmartbaby | 82 | 82 | 38 | 38 | 916 | 0 |
| islandwatersports | 68 | 68 | 23 | 23 | 8891 | 0 |
| ccs | 52 | 52 | 5 | 5 | 13736 | 0 |
| patbo | 40 | 40 | 7 | 7 | 558 | 0 |
| newbalance | 39 | 39 | 16 | 16 | 1214 | 0 |
| denniskirk | 35 | 35 | 22 | 22 | 1342 | 10 |
| surfstation | 30 | 30 | 4 | 4 | 6173 | 0 |
| montce | 27 | 27 | 19 | 19 | 1566 | 44 |
| kohls | 25 | 25 | 9 | 9 | 4401 | 2503 |
| sephora | 24 | 24 | 24 | 24 | 2003 | 0 |
| momcozy | 24 | 24 | 12 | 12 | 476 | 0 |
| miumiu | 17 | 17 | 11 | 11 | 2468 | 0 |
| revolve | 15 | 15 | 15 | 15 | 1755 | 30 |
| babybrezza | 12 | 12 | 6 | 6 | 62 | 0 |
| drbrowns | 10 | 10 | 3 | 3 | 690 | 0 |
| silviatcherassi | 9 | 9 | 9 | 9 | 713 | 9 |
| farfetch | 9 | 9 | 9 | 9 | 3696 | 1 |
| kindredbravely | 8 | 8 | 4 | 4 | 1838 | 0 |
| crocs | 6 | 6 | 3 | 3 | 1128 | 2 |
| jujube | 6 | 6 | 3 | 3 | 172 | 0 |
| valsurf | 6 | 6 | 2 | 2 | 3207 | 0 |
| hatch | 6 | 6 | 2 | 2 | 936 | 0 |
| lillebaby | 4 | 4 | 2 | 2 | 58 | 0 |
| aguabendita | 3 | 3 | 3 | 3 | 421 | 1 |
| skims | 3 | 3 | 3 | 3 | 2161 | 0 |
| prosoccer | 2 | 2 | 2 | 2 | 2067 | 1 |
| elvie | 2 | 2 | 1 | 1 | 126 | 0 |
| macys | 2 | 2 | 1 | 1 | 2565 | 1811 |
| tatami | 2 | 2 | 1 | 1 | 336 | 0 |
| samsclub | 1 | 1 | 1 | 1 | 120 | 6 |
| bentgo | 1 | 1 | 1 | 1 | 156 | 0 |
| mainland | 1 | 1 | 1 | 1 | 2238 | 0 |
| **total** | **33885** | **20343** | **26515** | **18080** | **179962** | **50224** |

Stores with no English descriptions (before and after): ezpz, americaneagle, eberjey, freshlypicked, abercrombie, quietstorm, gap, gymshark, farmrio, gameness, ancora, hollister, advanceauto, venum, mmawarehouse, chronicle, bellybandit, xtremesoccer, meliebianco, yesstyle, victoriassecret, lanebryant, mushie, youngla, mockingbird, fuji, tns, revzilla, ulta, everlast, parrot, elite, statebags, alphalete, pacsun, footlocker, nanit, munchkin, capittana, bananarepublic, spectra, partycity, johannaortiz, dagnedover, vix, combatcorner, owlet, tennisexpress, finishline, dicks, academy, nautilus, assouline.

Full tables: `node scripts/audit-description-language.mjs --md`.

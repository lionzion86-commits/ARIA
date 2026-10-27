# Product-page description language, 2026-10-26: the rest of the sweep

#443 c.6403123731 item 4 (sweep all 65 catalogs), after the FragranceX, toys
and Hot Topic / BoxLunch drops. Counted on what the product pages show
(`assets/pdp/p/`), by `scripts/audit-description-language.mjs`.

| | Before this PR | After |
|---|---:|---:|
| English descriptions on product pages | 10,723 | 446 |
| Distinct English texts left | 10,401 | 244 |

8,708 distinct texts, mainly Best Buy (2,537), Zumiez (2,491), BaubleBar
(2,476), JW Pei (435), Costco (289) and B&H (221), are translated and stored
in `scripts/data/descriptions-es/<store>.json` (27 stores, 25 of them new),
then written into the catalogues by `scripts/apply-description-memory.mjs`
(the English stays as `description_en`, never shown).

## How the text was treated

- Facts kept: model numbers, sizes and dimensions with their units, specs,
  materials, care and safety notes. Every translation was checked for its
  English numbers; 120 flagged lines went through a second, stricter pass.
- Removed, never translated: HTML and links (Best Buy buying-guide banners,
  nintendo.com), and retailer promotions that do not apply here ("Text
  DISNEY to 72014", "Backed by Best Buy", "Complete your purchase with the
  Insignia cable", pre-order bonuses, carrier plan prices, "Costco Shop Card
  included").
- Cut-off source text (BaubleBar's feed stops at 700 characters; several
  Zumiez and Best Buy texts end in "…"): translated up to the last complete
  phrase. Nothing is invented to finish a sentence.

## What is left (446 records)

Product, fragrance and franchise names inside a Spanish sentence, which the
word test reads as English: "Demuestra que eres fan con The Hunger Games
Sunrise On The Reaping Haymitch Faded T-Shirt." (Hot Topic, 62), "Gucci The
Voice of the Snake Perfume de Gucci" (Aria Perfumes, 78), New Balance "Made in
USA 990v4", Island Water Sports and CCS category lines. Names stay as written.

## Not fixable by translation

- Toys: 3,935 Walmart toys have cut, missing or fragment copy (3,106 cut,
  250 missing, 579 fragments). `scripts/repull-toy-descriptions.mjs` pulls
  each toy's product page again (estimate US$11.89, nothing spent without
  `--confirm-spend`); it needs APIFY_API_KEY and network access to
  api.apify.com, which this build session does not have.
- BaubleBar texts cut at 700 characters at the source: a full text needs the
  pull to keep the whole description.

## Per store, after

| store | records | none | en | es | mixed | short | unknown | uniqEN |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ariaperfumes | 10534 | 0 | 78 | 10150 | 305 | 1 | 0 | 59 |
| islandwatersports | 8891 | 0 | 68 | 4765 | 76 | 3723 | 259 | 23 |
| hottopic | 2544 | 0 | 62 | 2340 | 142 | 0 | 0 | 62 |
| ccs | 13736 | 0 | 52 | 8128 | 93 | 4253 | 1210 | 5 |
| newbalance | 1214 | 0 | 39 | 1163 | 12 | 0 | 0 | 16 |
| surfstation | 6173 | 0 | 30 | 5468 | 65 | 525 | 85 | 4 |
| walmart | 10860 | 4570 | 29 | 5136 | 22 | 345 | 758 | 29 |
| kohls | 4401 | 2503 | 25 | 521 | 67 | 1271 | 14 | 9 |
| costco | 1468 | 0 | 16 | 355 | 38 | 70 | 989 | 15 |
| kindredbravely | 1838 | 0 | 8 | 1766 | 64 | 0 | 0 | 4 |
| walmartbaby | 916 | 0 | 8 | 726 | 182 | 0 | 0 | 4 |
| crocs | 1128 | 2 | 6 | 956 | 2 | 80 | 82 | 3 |
| hatch | 936 | 0 | 6 | 564 | 366 | 0 | 0 | 2 |
| jujube | 172 | 0 | 6 | 156 | 10 | 0 | 0 | 3 |
| valsurf | 3207 | 0 | 6 | 2087 | 17 | 1012 | 85 | 2 |
| lillebaby | 58 | 0 | 4 | 16 | 38 | 0 | 0 | 2 |
| macys | 2565 | 1811 | 2 | 737 | 9 | 1 | 5 | 1 |
| mainland | 2238 | 0 | 1 | 1878 | 2 | 307 | 50 | 1 |
| abercrombie | 416 | 0 | 0 | 416 | 0 | 0 | 0 | 0 |
| academy | 33 | 0 | 0 | 27 | 0 | 0 | 6 | 0 |
| advanceauto | 1365 | 0 | 0 | 490 | 0 | 0 | 875 | 0 |
| aguabendita | 421 | 1 | 0 | 415 | 5 | 0 | 0 | 0 |
| alphalete | 999 | 0 | 0 | 956 | 0 | 43 | 0 | 0 |
| americaneagle | 243 | 59 | 0 | 183 | 0 | 1 | 0 | 0 |
| ancora | 525 | 0 | 0 | 476 | 0 | 0 | 49 | 0 |
| assouline | 270 | 0 | 0 | 270 | 0 | 0 | 0 | 0 |
| babybrezza | 62 | 0 | 0 | 62 | 0 | 0 | 0 | 0 |
| bananarepublic | 827 | 0 | 0 | 825 | 0 | 0 | 2 | 0 |
| baublebar | 7012 | 52 | 0 | 6955 | 5 | 0 | 0 | 0 |
| bellybandit | 54 | 0 | 0 | 48 | 6 | 0 | 0 | 0 |
| bentgo | 156 | 0 | 0 | 156 | 0 | 0 | 0 | 0 |
| bestbuy | 2889 | 59 | 0 | 2810 | 0 | 5 | 15 | 0 |
| bhphoto | 1706 | 0 | 0 | 707 | 2 | 782 | 215 | 0 |
| boxlunch | 2519 | 0 | 0 | 2513 | 6 | 0 | 0 | 0 |
| capittana | 516 | 1 | 0 | 515 | 0 | 0 | 0 | 0 |
| chronicle | 211 | 0 | 0 | 211 | 0 | 0 | 0 | 0 |
| combatcorner | 42 | 0 | 0 | 42 | 0 | 0 | 0 | 0 |
| dagnedover | 46 | 0 | 0 | 46 | 0 | 0 | 0 | 0 |
| denniskirk | 1342 | 10 | 0 | 1311 | 7 | 0 | 14 | 0 |
| dicks | 572 | 272 | 0 | 271 | 0 | 21 | 8 | 0 |
| drbrowns | 690 | 0 | 0 | 656 | 34 | 0 | 0 | 0 |
| eberjey | 734 | 1 | 0 | 733 | 0 | 0 | 0 | 0 |
| elite | 95 | 0 | 0 | 95 | 0 | 0 | 0 | 0 |
| elvie | 126 | 0 | 0 | 118 | 8 | 0 | 0 | 0 |
| everlast | 226 | 0 | 0 | 226 | 0 | 0 | 0 | 0 |
| ezpz | 107 | 0 | 0 | 107 | 0 | 0 | 0 | 0 |
| farfetch | 3696 | 1 | 0 | 3010 | 8 | 111 | 566 | 0 |
| farmrio | 1228 | 20 | 0 | 1205 | 0 | 0 | 3 | 0 |
| finishline | 1099 | 1099 | 0 | 0 | 0 | 0 | 0 | 0 |
| footlocker | 726 | 726 | 0 | 0 | 0 | 0 | 0 | 0 |
| freshlypicked | 84 | 0 | 0 | 84 | 0 | 0 | 0 | 0 |
| fuji | 8 | 0 | 0 | 8 | 0 | 0 | 0 | 0 |
| gameness | 100 | 0 | 0 | 94 | 0 | 1 | 5 | 0 |
| gap | 635 | 0 | 0 | 454 | 0 | 181 | 0 | 0 |
| gymshark | 861 | 0 | 0 | 861 | 0 | 0 | 0 | 0 |
| hollister | 375 | 0 | 0 | 375 | 0 | 0 | 0 | 0 |
| johannaortiz | 646 | 0 | 0 | 646 | 0 | 0 | 0 | 0 |
| jwpei | 2351 | 0 | 0 | 1600 | 18 | 6 | 727 | 0 |
| lanebryant | 169 | 169 | 0 | 0 | 0 | 0 | 0 | 0 |
| meliebianco | 310 | 0 | 0 | 310 | 0 | 0 | 0 | 0 |
| miumiu | 2468 | 0 | 0 | 2094 | 374 | 0 | 0 | 0 |
| mmawarehouse | 98 | 0 | 0 | 98 | 0 | 0 | 0 | 0 |
| mockingbird | 100 | 0 | 0 | 92 | 6 | 2 | 0 | 0 |
| momcozy | 476 | 0 | 0 | 410 | 66 | 0 | 0 | 0 |
| montce | 1566 | 44 | 0 | 1414 | 11 | 6 | 91 | 0 |
| munchkin | 256 | 0 | 0 | 220 | 34 | 2 | 0 | 0 |
| mushie | 33 | 0 | 0 | 33 | 0 | 0 | 0 | 0 |
| nanit | 72 | 0 | 0 | 72 | 0 | 0 | 0 | 0 |
| nautilus | 501 | 0 | 0 | 291 | 0 | 209 | 1 | 0 |
| owlet | 52 | 0 | 0 | 52 | 0 | 0 | 0 | 0 |
| pacsun | 18 | 18 | 0 | 0 | 0 | 0 | 0 | 0 |
| parrot | 4019 | 0 | 0 | 2130 | 0 | 1600 | 289 | 0 |
| partycity | 518 | 0 | 0 | 515 | 0 | 3 | 0 | 0 |
| patbo | 558 | 0 | 0 | 539 | 0 | 18 | 1 | 0 |
| prosoccer | 2067 | 1 | 0 | 1881 | 8 | 4 | 173 | 0 |
| quietstorm | 456 | 0 | 0 | 347 | 0 | 109 | 0 | 0 |
| revolve | 1755 | 30 | 0 | 1647 | 16 | 35 | 27 | 0 |
| revzilla | 1153 | 270 | 0 | 883 | 0 | 0 | 0 | 0 |
| samsclub | 120 | 6 | 0 | 111 | 0 | 0 | 3 | 0 |
| sephora | 2003 | 0 | 0 | 1912 | 89 | 2 | 0 | 0 |
| silviatcherassi | 713 | 9 | 0 | 665 | 12 | 1 | 26 | 0 |
| skims | 2161 | 0 | 0 | 2114 | 47 | 0 | 0 | 0 |
| smartbuyglasses | 545 | 4 | 0 | 541 | 0 | 0 | 0 | 0 |
| spectra | 92 | 0 | 0 | 86 | 6 | 0 | 0 | 0 |
| ssense | 36000 | 36000 | 0 | 0 | 0 | 0 | 0 | 0 |
| statebags | 61 | 0 | 0 | 61 | 0 | 0 | 0 | 0 |
| tatami | 336 | 0 | 0 | 332 | 2 | 0 | 2 | 0 |
| tennisexpress | 814 | 0 | 0 | 814 | 0 | 0 | 0 | 0 |
| tns | 1535 | 0 | 0 | 1534 | 0 | 0 | 1 | 0 |
| ulta | 690 | 690 | 0 | 0 | 0 | 0 | 0 | 0 |
| venum | 1116 | 20 | 0 | 1096 | 0 | 0 | 0 | 0 |
| victoriassecret | 1649 | 542 | 0 | 1107 | 0 | 0 | 0 | 0 |
| vix | 1611 | 8 | 0 | 1602 | 1 | 0 | 0 | 0 |
| xtremesoccer | 460 | 1 | 0 | 454 | 5 | 0 | 0 | 0 |
| yesstyle | 1225 | 1225 | 0 | 0 | 0 | 0 | 0 | 0 |
| youngla | 800 | 0 | 0 | 797 | 2 | 1 | 0 | 0 |
| zumiez | 2494 | 0 | 0 | 2493 | 0 | 1 | 0 | 0 |
| **total** | **179962** | **50224** | **446** | **105636** | **2288** | **14732** | **6636** | **244** |

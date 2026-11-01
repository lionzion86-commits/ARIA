# Phase 1 — Shoe & Clothing Colorway Census (2026-11-01)

Source: every *-catalog.json on origin/main (blobs downloaded 2026-11-01, sizes verified vs the git tree). Retailer keys duplicated across aggregate files (mma-catalog) counted once, from the larger copy.

Definitions: **structured** = the listing record itself carries a non-empty color/variant/option field. **Family** = store + brand + product name with color words and audience words stripped. **Lone** = family with exactly 1 listing at that store. **Suspected gap** = lone listing whose model is multi-listing somewhere else in the fleet or a known multi-colorway model.

## All-stores totals

- Shoe + clothing listings: **79460** (shoes 11251, clothing 68209)
- Listings carrying structured color/variant data on the record: **0**
- Listings with a color named in the title: 36983
- Families: 65065 — multi-listing (colorways present as siblings): 8049; lone: 57016
- Lone listings that are suspected missing-sibling cases: **774**

## Per store

| Store | File | Shoes | Clothing | Structured color data | Color in title | Families | Multi | Lone | Suspected gaps |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ssense | ssense-catalog.json | 2520 | 10109 | 0 | 12374 | 9002 | 2239 | 6763 | 25 |
| islandwatersports | islandwatersports-catalog.json | 380 | 4413 | 0 | 231 | 4692 | 89 | 4603 | 23 |
| ccs | ccs-catalog.json | 953 | 3431 | 0 | 3670 | 4049 | 275 | 3774 | 136 |
| snipes | snipes-catalog.json | 1600 | 2722 | 0 | 169 | 2847 | 727 | 2120 | 213 |
| kohls | kohls-catalog.json | 592 | 3707 | 0 | 292 | 4245 | 53 | 4192 | 17 |
| farfetch | farfetch-catalog.json | 926 | 2265 | 0 | 887 | 2710 | 271 | 2439 | 38 |
| macys | macys-catalog.json | 63 | 2296 | 0 | 228 | 2303 | 34 | 2269 | 3 |
| ryderwear | gym-brands-catalog.json | 0 | 2066 | 0 | 1251 | 1518 | 266 | 1252 | 0 |
| surfstation | surfstation-catalog.json | 209 | 1742 | 0 | 1391 | 1887 | 56 | 1831 | 6 |
| skims | skims-catalog.json | 8 | 1857 | 0 | 638 | 1770 | 94 | 1676 | 1 |
| zumiez | zumiez-catalog.json | 380 | 1407 | 0 | 1575 | 1714 | 64 | 1650 | 62 |
| hottopic | hottopic-catalog.json | 15 | 1550 | 0 | 416 | 1560 | 5 | 1555 | 0 |
| revolve | revolve-catalog.json | 141 | 1358 | 0 | 39 | 1411 | 69 | 1342 | 17 |
| mainland | mainland-catalog.json | 122 | 1345 | 0 | 84 | 1450 | 13 | 1437 | 18 |
| tns | latino-designers-dtc-catalog.json | 29 | 1347 | 0 | 1163 | 1270 | 67 | 1203 | 0 |
| aybl | gym-brands-catalog.json | 0 | 1306 | 0 | 1130 | 827 | 195 | 632 | 0 |
| valsurf | valsurf-catalog.json | 306 | 930 | 0 | 888 | 1193 | 41 | 1152 | 82 |
| newbalance | newbalance-catalog.json | 308 | 916 | 0 | 29 | 413 | 331 | 82 | 4 |
| miumiu | miumiu-catalog.json | 253 | 966 | 0 | 10 | 672 | 248 | 424 | 7 |
| prosoccer | soccer-catalog.json | 339 | 877 | 0 | 238 | 1116 | 97 | 1019 | 0 |
| bornprimitive | gym-brands-catalog.json | 9 | 1142 | 0 | 725 | 994 | 121 | 873 | 0 |
| farmrio | latino-designers-dtc-catalog.json | 92 | 1015 | 0 | 775 | 1052 | 51 | 1001 | 30 |
| finishline | finishline-catalog.json | 0 | 1099 | 0 | 53 | 448 | 396 | 52 | 0 |
| buffbunny | gym-brands-catalog.json | 0 | 1050 | 0 | 577 | 998 | 42 | 956 | 0 |
| vix | latino-designers-dtc-catalog.json | 25 | 954 | 0 | 406 | 931 | 48 | 883 | 0 |
| montce | latino-designers-dtc-catalog.json | 1 | 924 | 0 | 410 | 830 | 64 | 766 | 0 |
| kindredbravely | moms-catalog.json | 0 | 869 | 0 | 582 | 733 | 89 | 644 | 0 |
| bananarepublic | bananarepublic-catalog.json | 5 | 822 | 0 | 23 | 794 | 31 | 763 | 0 |
| jwpei | jwpei-catalog.json | 291 | 520 | 0 | 772 | 581 | 124 | 457 | 0 |
| alphalete | gymrat-catalog.json | 79 | 726 | 0 | 461 | 662 | 84 | 578 | 0 |
| gymshark | gymrat-catalog.json | 1 | 789 | 0 | 773 | 735 | 51 | 684 | 0 |
| tennisexpress | tennis-catalog.json | 358 | 422 | 0 | 538 | 713 | 53 | 660 | 2 |
| paragonfitwear | gym-brands-catalog.json | 0 | 708 | 0 | 220 | 660 | 45 | 615 | 0 |
| fleo | gym-brands-catalog.json | 0 | 656 | 0 | 113 | 113 | 98 | 15 | 0 |
| killcrew | gym-brands-catalog.json | 0 | 642 | 0 | 587 | 259 | 138 | 121 | 0 |
| oneractive | gym-brands-catalog.json | 0 | 636 | 0 | 527 | 540 | 66 | 474 | 0 |
| gap | gap-catalog.json | 2 | 633 | 0 | 20 | 440 | 71 | 369 | 0 |
| gorillawear | gym-brands-catalog.json | 11 | 562 | 0 | 564 | 325 | 160 | 165 | 0 |
| silviatcherassi | latino-designers-dtc-catalog.json | 49 | 483 | 0 | 49 | 387 | 80 | 307 | 0 |
| patbo | latino-designers-dtc-catalog.json | 26 | 492 | 0 | 63 | 462 | 53 | 409 | 0 |
| youngla | gymrat-catalog.json | 3 | 509 | 0 | 40 | 512 | 0 | 512 | 0 |
| crocs | crocs-catalog.json | 508 | 0 | 0 | 424 | 442 | 56 | 386 | 79 |
| tlfapparel | gym-brands-catalog.json | 0 | 479 | 0 | 20 | 138 | 119 | 19 | 0 |
| venum | mma-catalog.json | 2 | 475 | 0 | 431 | 335 | 93 | 242 | 0 |
| hatch | moms-catalog.json | 0 | 464 | 0 | 27 | 286 | 112 | 174 | 0 |
| capittana | latino-designers-dtc-catalog.json | 0 | 443 | 0 | 344 | 347 | 74 | 273 | 5 |
| abercrombie | abercrombie-catalog.json | 0 | 416 | 0 | 7 | 273 | 35 | 238 | 0 |
| johannaortiz | latino-designers-dtc-catalog.json | 33 | 382 | 0 | 21 | 307 | 62 | 245 | 0 |
| dicks | dicks-catalog.json | 241 | 162 | 0 | 17 | 332 | 53 | 279 | 6 |
| hollister | hollister-catalog.json | 0 | 376 | 0 | 13 | 249 | 43 | 206 | 0 |
| aguabendita | latino-designers-dtc-catalog.json | 0 | 350 | 0 | 42 | 347 | 3 | 344 | 0 |
| xtremesoccer | soccer-catalog.json | 250 | 100 | 0 | 31 | 195 | 70 | 125 | 0 |
| quietstorm | quietstorm-catalog.json | 12 | 251 | 0 | 25 | 255 | 7 | 248 | 0 |
| americaneagle | ae-catalog.json | 0 | 242 | 0 | 16 | 147 | 53 | 94 | 0 |
| boxlunch | boxlunch-catalog.json | 6 | 225 | 0 | 71 | 230 | 1 | 229 | 0 |
| ancora | latino-designers-dtc-catalog.json | 3 | 182 | 0 | 75 | 162 | 17 | 145 | 0 |
| lanebryant | lanebryant-catalog.json | 3 | 165 | 0 | 4 | 149 | 16 | 133 | 0 |
| tatami | mma-catalog.json | 0 | 157 | 0 | 109 | 96 | 36 | 60 | 0 |
| momcozy | moms-catalog.json | 0 | 139 | 0 | 30 | 136 | 3 | 133 | 0 |
| eberjey | latino-designers-dtc-catalog.json | 4 | 127 | 0 | 4 | 56 | 40 | 16 | 0 |
| gameness | fightclub-catalog.json | 0 | 99 | 0 | 0 | 85 | 13 | 72 | 0 |
| ironrebel | gym-brands-catalog.json | 0 | 96 | 0 | 69 | 81 | 12 | 69 | 0 |
| costco | costco-catalog.json | 3 | 80 | 0 | 13 | 82 | 1 | 81 | 0 |
| elite | fightclub-catalog.json | 0 | 77 | 0 | 77 | 8 | 5 | 3 | 0 |
| carolinaherrera | carolinaherrera-catalog.json | 12 | 63 | 0 | 9 | 72 | 2 | 70 | 0 |
| everlast | everlast-catalog.json | 4 | 68 | 0 | 1 | 69 | 3 | 66 | 0 |
| elvie | moms-catalog.json | 1 | 61 | 0 | 1 | 62 | 0 | 62 | 0 |
| drbrowns | moms-catalog.json | 4 | 48 | 0 | 36 | 35 | 10 | 25 | 0 |
| athleta | gym-brands-catalog.json | 0 | 47 | 0 | 0 | 47 | 0 | 47 | 0 |
| walmartbaby | moms-catalog.json | 20 | 22 | 0 | 29 | 40 | 2 | 38 | 0 |
| spectra | moms-catalog.json | 0 | 36 | 0 | 6 | 36 | 0 | 36 | 0 |
| academy | soccer-catalog.json | 33 | 0 | 0 | 5 | 33 | 0 | 33 | 0 |
| meliebianco | meliebianco-catalog.json | 0 | 32 | 0 | 25 | 19 | 7 | 12 | 0 |
| bellybandit | moms-catalog.json | 0 | 24 | 0 | 1 | 24 | 0 | 24 | 0 |
| munchkin | moms-catalog.json | 1 | 22 | 0 | 2 | 23 | 0 | 23 | 0 |
| pacsun | pacsun-catalog.json | 0 | 18 | 0 | 12 | 18 | 0 | 18 | 0 |
| yesstyle | yesstyle-catalog.json | 12 | 6 | 0 | 1 | 17 | 1 | 16 | 0 |
| babybrezza | moms-catalog.json | 0 | 3 | 0 | 0 | 3 | 0 | 3 | 0 |
| fuji | mma-catalog.json | 0 | 3 | 0 | 3 | 2 | 1 | 1 | 0 |
| samsclub | samsclub-catalog.json | 1 | 2 | 0 | 1 | 3 | 0 | 3 | 0 |
| mockingbird | moms-catalog.json | 2 | 0 | 0 | 0 | 2 | 0 | 2 | 0 |
| owlet | moms-catalog.json | 0 | 2 | 0 | 0 | 2 | 0 | 2 | 0 |
| lillebaby | moms-catalog.json | 0 | 1 | 0 | 0 | 1 | 0 | 1 | 0 |
| nanit | moms-catalog.json | 0 | 1 | 0 | 0 | 1 | 0 | 1 | 0 |

### snipes — top suspected-gap models
- 574 — model sold in 2 distinct colorways fleet-wide (7 listings)
- LEGO Creativity Clog — model sold in 2 distinct colorways fleet-wide (3 listings)
- Classic Slip-On — model sold in 2 distinct colorways fleet-wide (3 listings)
- Toddler Bluey Best Buddies Classic Clog — model sold in 2 distinct colorways fleet-wide (3 listings)
- Polo Bear Fleece Sweatshirt — model sold in 2 distinct colorways fleet-wide (3 listings)
- Echo Icy RO Clog — model sold in 2 distinct colorways fleet-wide (2 listings)
- Mario Classic Clog — model sold in 2 distinct colorways fleet-wide (2 listings)
- Bowser Classic Clog — model sold in 2 distinct colorways fleet-wide (2 listings)
- Yoshi Classic Clog — model sold in 2 distinct colorways fleet-wide (2 listings)
- Sk8-Hi — model sold in 2 distinct colorways fleet-wide (2 listings)

### ccs — top suspected-gap models
- Polar 93! Work Shorts - Grey Blue — model sold in 2 distinct colorways fleet-wide (2 listings)
- Primitive Dirty P Hoodie - Sand — model sold in 2 distinct colorways fleet-wide (2 listings)
- Roark Passage Boardshorts - Charcoal — model sold in 2 distinct colorways fleet-wide (2 listings)
- Stance Regulation Boxer Brief - Black — model sold in 2 distinct colorways fleet-wide (2 listings)
- Thrasher Flame Hoodie - Maroon — model sold in 2 distinct colorways fleet-wide (2 listings)
- Thrasher Mexico Hoodie - Black — model sold in 2 distinct colorways fleet-wide (2 listings)
- Thrasher Womens Godzilla Hoodie - Black/Pink — model sold in 2 distinct colorways fleet-wide (2 listings)
- Adidas Busenitz Indoor Super Shoes - Ftwr White/Collegiate Navy/Better Scarlet — known multi-colorway shoe model ('busenitz')
- Adidas Busenitz Shoes - Core Black/Chalk White/Gold Metallic — known multi-colorway shoe model ('busenitz')
- Adidas Busenitz Shoes - Core Black/Court Green/Gum — known multi-colorway shoe model ('busenitz')

### valsurf — top suspected-gap models
- Authentic - Navy — model sold in 2 distinct colorways fleet-wide (6 listings)
- Old Skool - Black/White — model sold in 2 distinct colorways fleet-wide (4 listings)
- 93 Work Shorts - Black — model sold in 2 distinct colorways fleet-wide (2 listings)
- Airtex GEN 2 Short - Navy — model sold in 2 distinct colorways fleet-wide (2 listings)
- Back In Hybrid - Black — model sold in 2 distinct colorways fleet-wide (2 listings)
- Classic Bralette Top - Black — model sold in 2 distinct colorways fleet-wide (2 listings)
- Classic Hi Waist Pant - Olive — model sold in 2 distinct colorways fleet-wide (2 listings)
- Classic Holiday Pant - Black — model sold in 2 distinct colorways fleet-wide (2 listings)
- Classic Underwire Top - Black — model sold in 2 distinct colorways fleet-wide (2 listings)
- Country Music Tee - Navy — model sold in 2 distinct colorways fleet-wide (2 listings)

### crocs — top suspected-gap models
- Echo Wave - Black / Black — model sold in 2 distinct colorways fleet-wide (3 listings)
- Mario Classic Clog - Multi — model sold in 2 distinct colorways fleet-wide (2 listings)
- Yoshi Classic Clog - Multi — model sold in 2 distinct colorways fleet-wide (2 listings)
- Bowser Classic Clog - Multi — model sold in 2 distinct colorways fleet-wide (2 listings)
- Echo Icy RO Clog - Black — model sold in 2 distinct colorways fleet-wide (2 listings)
- Fantastic 4 Classic Clog - Multi — known multi-colorway shoe model ('classic clog')
- Toddlers' Harry Potter Slytherin Classic Clog - Multi — known multi-colorway shoe model ('classic clog')
- Toddlers' Harry Potter Gryffindor Classic Clog - Multi — known multi-colorway shoe model ('classic clog')
- IT Chapter 2 Classic Clog - Multi — known multi-colorway shoe model ('classic clog')
- Toddlers' Nightmare Before Christmas Classic Clog - Multi — known multi-colorway shoe model ('classic clog')

### zumiez — top suspected-gap models
- adidas Busenitz Vulc II Black & White Shoes — model sold in 5 distinct colorways fleet-wide (5 listings)
- adidas Samba OG Silver & Gum Shoes — model sold in 4 distinct colorways fleet-wide (4 listings)
- adidas Campus ADV White Olive & White Shoes — model sold in 3 distinct colorways fleet-wide (3 listings)
- New Balance Lifestyle 327 Sea Salt & Black Suede Shoes — known multi-colorway shoe model ('327')
- New Balance Lifestyle 327 Moonbeam & Storm Blue Shoes — known multi-colorway shoe model ('327')
- New Balance Lifestyle 327 Kids Indigo & Nightwatch Shoes — known multi-colorway shoe model ('327')
- Converse Kids Chuck Taylor All Star Sunny Outlook High Top Shoes — known multi-colorway shoe model ('chuck taylor')
- adidas Puig Chalky Brown & Black Shoes — known multi-colorway shoe model ('puig')
- Converse Chuck Taylor All Star Black Loafer Shoes — known multi-colorway shoe model ('chuck taylor')
- Converse Kids Chuck Taylor All Star Flowers White High Top Shoes — known multi-colorway shoe model ('chuck taylor')

### farfetch — top suspected-gap models
- Delicate Ainika Long-Sleeve Belted Mini Dress — model sold in 2 distinct colorways fleet-wide (2 listings)
- Delicate Chintz Ruffled Mini Dress — model sold in 2 distinct colorways fleet-wide (2 listings)
- Garden Scarf V-Neck Midi Dress — model sold in 2 distinct colorways fleet-wide (2 listings)
- Nature Pockets Pants — model sold in 2 distinct colorways fleet-wide (2 listings)
- Embroidered Pockets Richelieu Jacket — model sold in 2 distinct colorways fleet-wide (2 listings)
- Foliage Sketch Maxi Dress — model sold in 2 distinct colorways fleet-wide (2 listings)
- Nature Collared Buttoned Shirt — model sold in 2 distinct colorways fleet-wide (2 listings)
- Paper Boat 3D Maxi Dress — model sold in 2 distinct colorways fleet-wide (2 listings)
- Flower-Print Mini Dress — model sold in 2 distinct colorways fleet-wide (2 listings)
- Artisanal Embroidered Lace Front Bow Maxi Dress — model sold in 2 distinct colorways fleet-wide (2 listings)

### farmrio — top suspected-gap models
- Blue Artisanal Embroidered Lace Front Bow Maxi Dress — model sold in 2 distinct colorways fleet-wide (2 listings)
- Sand Delicate Ainika Long Sleeve Belted Mini Dress — model sold in 2 distinct colorways fleet-wide (2 listings)
- Pink Delicate Chintz Ruffled Mini Dress — model sold in 2 distinct colorways fleet-wide (2 listings)
- Dark Blue Embroidered Pockets Richelieu Jacket — model sold in 2 distinct colorways fleet-wide (2 listings)
- Orange Flower Mini Dress — model sold in 2 distinct colorways fleet-wide (2 listings)
- Soft Pink Garden Scarf V Neck Midi Dress — model sold in 2 distinct colorways fleet-wide (2 listings)
- Multicolor Tropical Painting Cut-Out Buckles Maxi Dress — model sold in 2 distinct colorways fleet-wide (2 listings)
- Off-White Cool Day Embroidered Beaded Mini Dress — model sold in 2 distinct colorways fleet-wide (2 listings)
- Off-White Garden Of Life Scarf Ruffled Mini Dress — model sold in 2 distinct colorways fleet-wide (2 listings)
- Off-White Brazilian Bodega Short Sleeve T-Shirt — model sold in 2 distinct colorways fleet-wide (2 listings)

### ssense — top suspected-gap models
- White Heavyweight Cotton Relaxed T-shirt — model sold in 2 distinct colorways fleet-wide (2 listings)
- Burgundy Cotton Jersey Long Sleeve T-shirt — model sold in 2 distinct colorways fleet-wide (2 listings)
- Green Japan W Sneakers — model sold in 2 distinct colorways fleet-wide (2 listings)
- Blue Arc Jeans — model sold in 2 distinct colorways fleet-wide (2 listings)
- Off-White & Taupe Gazelle Lo Pro W Sneakers — known multi-colorway shoe model ('gazelle')
- Black Pegasus Premium Sneakers — known multi-colorway shoe model ('pegasus')
- Brown Air Max 90 SP Sneakers — known multi-colorway shoe model ('air max')
- Orange Air Force 1 Sneakers — known multi-colorway shoe model ('air force 1')
- Black Air Force 1 '07 Patent Leather Sneakers — known multi-colorway shoe model ('air force 1')
- Black Air Max 95 Big Bubble Premium Sneakers — known multi-colorway shoe model ('air max')

### islandwatersports — top suspected-gap models
- Florence Marine X Airtex Gamma Boardshort — model sold in 3 distinct colorways fleet-wide (3 listings)
- New Balance 480 Shoes — model sold in 3 distinct colorways fleet-wide (3 listings)
- RHYTHM CLASSIC HI CUT PANT — model sold in 3 distinct colorways fleet-wide (3 listings)
- Florence Marine X Airtex GEN 2 Short — model sold in 2 distinct colorways fleet-wide (2 listings)
- Florence Marine X Crew T-Shirt — model sold in 2 distinct colorways fleet-wide (2 listings)
- Florence Marine X Standard Issue Boardshort — model sold in 2 distinct colorways fleet-wide (2 listings)
- O'NEILL SANDERS SHORT — model sold in 2 distinct colorways fleet-wide (2 listings)
- O'NEILL SANDERS TANK — model sold in 2 distinct colorways fleet-wide (2 listings)
- RHYTHM CLASSIC BRALETTE TOP — model sold in 2 distinct colorways fleet-wide (2 listings)
- Rhythm Classic Hi Waist Pant — model sold in 2 distinct colorways fleet-wide (2 listings)

### mainland — top suspected-gap models
- Reef Santa Ana Men's Sandals — model sold in 4 distinct colorways fleet-wide (4 listings)
- Crocs Kids' Classic Clog — model sold in 3 distinct colorways fleet-wide (11 listings)
- Reef Cushion Vista Hi Women's Sandals — model sold in 3 distinct colorways fleet-wide (3 listings)
- Primitive Dirty P Hoodie — model sold in 2 distinct colorways fleet-wide (2 listings)
- Thrasher Flame Hoodie — model sold in 2 distinct colorways fleet-wide (2 listings)
- Thrasher Godzilla Hoodie — model sold in 2 distinct colorways fleet-wide (2 listings)
- Thrasher Mexico Hoodie — model sold in 2 distinct colorways fleet-wide (2 listings)
- Reef Cushion Phantom 2.0 Men's Sandals — model sold in 2 distinct colorways fleet-wide (2 listings)
- Reef Fanning Men's Sandals — model sold in 2 distinct colorways fleet-wide (2 listings)
- Reef Phantom II Men's Sandals — model sold in 2 distinct colorways fleet-wide (2 listings)

### kohls — top suspected-gap models
- Converse Chuck Taylor All Star Adult High-Top Sneakers — known multi-colorway shoe model ('chuck taylor')
- Converse Chuck Taylor All Star Canvas Adult Low-Top Sneakers — known multi-colorway shoe model ('chuck taylor')
- Nike Air Max Alpha Trainer 6 Men's Workout Shoes — known multi-colorway shoe model ('air max')
- Nike Air Max Alpha Trainer 5 Men's Training Shoes — known multi-colorway shoe model ('air max')
- Nike Air Max Torch 4 Men's Shoes — known multi-colorway shoe model ('air max')
- Nike Air Max Nova Little Kids Sneakers — known multi-colorway shoe model ('air max')
- Nike Air Max Invigor Men's Running Shoes — known multi-colorway shoe model ('air max')
- Nike Air Max Nova Big Kids Sneakers — known multi-colorway shoe model ('air max')
- Baby / Toddler Converse Chuck Taylor All Star Sneakers — known multi-colorway shoe model ('chuck taylor')
- Nike Air Max Torch 4 Women's Cushioned Running Shoes — known multi-colorway shoe model ('air max')

### revolve — top suspected-gap models
- Handball Spezial Sneakers — model sold in 12 distinct colorways fleet-wide (15 listings)
- Japan Sneakers — model sold in 5 distinct colorways fleet-wide (6 listings)
- Cotton Jersey T-Shirt — model sold in 5 distinct colorways fleet-wide (5 listings)
- Low Rise Slim Jeans — model sold in 3 distinct colorways fleet-wide (3 listings)
- GT-2160 Sneakers — model sold in 3 distinct colorways fleet-wide (3 listings)
- Arc Jeans — model sold in 2 distinct colorways fleet-wide (2 listings)
- Japan W Sneakers — model sold in 2 distinct colorways fleet-wide (2 listings)
- Cotton Jersey Long Sleeve T-Shirt — model sold in 2 distinct colorways fleet-wide (2 listings)
- Gazelle Pony Sneaker — known multi-colorway shoe model ('gazelle')
- Gel-Kayano 14 Sneaker — known multi-colorway shoe model ('gel kayano')

### miumiu — top suspected-gap models
- New Balance X Miu Miu 530 SL deco' leather ballerinas — known multi-colorway shoe model ('530')
- New Balance X Miu Miu 530 SL délavé suede ballerinas — known multi-colorway shoe model ('530')
- New Balance X Miu Miu 530 SL faded suede mules — known multi-colorway shoe model ('530')
- New Balance X Miu Miu 530 SL metallic leather and mesh mules — known multi-colorway shoe model ('530')
- New Balance X Miu Miu 530 SL crocodile embossed calfskin and technical fabric sneakers — known multi-colorway shoe model ('530')
- New Balance X Miu Miu 530 SL sneakers in printed leather and technical fabric — known multi-colorway shoe model ('530')
- New Balance X Miu Miu 530 SL bleached suede sneaker mules — known multi-colorway shoe model ('530')

### dicks — top suspected-gap models
- adidas Women's Avaflash Tennis Shoes — model sold in 4 distinct colorways fleet-wide (4 listings)
- adidas Men's Defiant Speed 2 Tennis Shoes — model sold in 3 distinct colorways fleet-wide (3 listings)
- adidas Men's Barricade 14 Tennis Shoes — model sold in 3 distinct colorways fleet-wide (3 listings)
- Jordan Tiempo Maestro Elite SE FG Soccer Cleats — known multi-colorway shoe model ('jordan')
- adidas Kids' Samba Messi Indoor Soccer Shoes — known multi-colorway shoe model ('samba')
- Air Jordan 1 Mid SE Shoes — known multi-colorway shoe model ('air jordan')

### surfstation — top suspected-gap models
- Reef Cushion Phantom 2.0 Men's Sandals - Grey/Grey — model sold in 2 distinct colorways fleet-wide (2 listings)
- Reef Fanning Men's Sandals - Brown/Gum — model sold in 2 distinct colorways fleet-wide (2 listings)
- Reef Phantom II Men's Sandals - Black — model sold in 2 distinct colorways fleet-wide (2 listings)
- Reef Rover Men's Sandals - Black — model sold in 2 distinct colorways fleet-wide (2 listings)
- Vans Old Skool Men's Shoes - Black — known multi-colorway shoe model ('old skool')
- Vans Old-Skool 2-Tone Men's Shoes - Navy/Red — known multi-colorway shoe model ('old skool')

### capittana — top suspected-gap models
- Marilei Light Blue Dress — model sold in 2 distinct colorways fleet-wide (3 listings)
- Trinidad Gold Crochet Bikini Top — model sold in 2 distinct colorways fleet-wide (3 listings)
- Trinidad Star Blue Bikini Bottom — model sold in 2 distinct colorways fleet-wide (3 listings)
- Trinidad Star Blue Bikini Top — model sold in 2 distinct colorways fleet-wide (3 listings)
- Rose Beige Crochet Bikini Bottom — model sold in 2 distinct colorways fleet-wide (3 listings)

### newbalance — top suspected-gap models
- 2002R — known multi-colorway shoe model ('2002r')
- 327 Lace — known multi-colorway shoe model ('327')
- 327 NEW-B Hook & Loop — known multi-colorway shoe model ('327')
- 1906 Lace — known multi-colorway shoe model ('1906')

### macys — top suspected-gap models
- Women's 327 Sneakers from Finish Line — known multi-colorway shoe model ('327')
- Women's Zoom Vomero 5 Sneakers from Finish Line — known multi-colorway shoe model ('vomero')
- Women's 574 Core Casual Sneakers from Finish Line — known multi-colorway shoe model ('574')

### tennisexpress — top suspected-gap models
- Women's Pegasus 41 Running Shoes White and Blue Tint — known multi-colorway shoe model ('pegasus')
- Women's Vomero 18 Running Shoes Hot Lava and Black — known multi-colorway shoe model ('vomero')

### skims — top suspected-gap models
- HEAVYWEIGHT COTTON MENS RELAXED T-SHIRT | BLUE BLACK — model sold in 2 distinct colorways fleet-wide (2 listings)

Stores with zero shoe/clothing listings in scope: combatcorner, dagnedover, dsw, freshlypicked, jujube, mmawarehouse, tenniswarehouse

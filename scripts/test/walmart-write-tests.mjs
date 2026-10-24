/* ==================================================================
   THE WALMART WRITE STAGE (#443, Lucifer's ingest-replay items 1-28 and
   Danny's rulings, 2026-10-23). One check per finding, each on the
   product names the replays reported. Fixtures only; no network.

     node scripts/test/walmart-write-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import * as W from "../lib/walmart-write.js";
import * as D from "../lib/walmart-density.js";
import { mergePull } from "../build-walmart-catalog.mjs";
import { loadShippable } from "../build-store-slices.mjs";
import { specWeightKg } from "../../netlify/functions/_weight-resolve.js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${String(e.stack).split("\n").slice(0, 2).join(" | ")}`); console.log("    FAIL " + name); }
}
const ship = loadShippable(ROOT);
const ctx = { band: D.PRICE_BAND_USD, isShippableItem: ship, specWeightKg: (x) => specWeightKg(x), generatedAt: "2026-01-01T00:00:00.000Z" };
const img = (n) => `https://i5.walmartimages.example.test/seo/fixture-${n}.jpeg`;
/* TEST FIXTURE detail row in the trial's shape. */
const row = (name, over = {}) => ({ name, price: 19.99, currency: "USD", images: [img(1), img(2)], description: "A fixture product.", url: "https://www.walmart.com/ip/fixture/1", ...over });
const drop = (name, dept = "home", over = {}) => D.ingestRow(row(name, over), { dept, bucket: "home_decor", maxItems: 1 }, ctx);

console.log("\n  Walmart write stage -- the join");

await check("item 1: a detail row with a different slug joins on the item ID; rider (a): never across variants", () => {
  assert.equal(W.itemIdOf("https://www.walmart.com/ip/Some-Slug/5012345678?athbdg=L1"), "5012345678");
  const run = { dept: "home", bucket: "home_decor", maxItems: 5 };
  const pulled = mergePull([{ run, items: [
    { name: "CAROTE 21-pc Cookware Set Black", price: 139.99, productUrl: "https://www.walmart.com/ip/carote-21pc-black/111111" },
    { name: "Fixture Lamp", price: 20, productUrl: "https://www.walmart.com/ip/old-slug-lamp/222222" },
  ] }], [
    { name: "CAROTE 15 Piece Cookware Set Cream White", url: "https://www.walmart.com/ip/carote-cream/111111", allImages: [img(1), img(2)] },
    { name: "Fixture Lamp Brushed Nickel", url: "https://www.walmart.com/ip/new-slug-lamp/222222", allImages: [img(3), img(4), img(5)] },
  ]);
  assert.equal(pulled[0].rows[0].images.length, 0, "the 15-pc detail joined the 21-pc listing");
  assert.equal(pulled[0].rows[0].name, "CAROTE 21-pc Cookware Set Black");
  assert.equal(pulled[0].rows[1].images.length, 3, "the slug-miss did not join on the item ID");
});

console.log("\n  Walmart write stage -- exclusions (items 2-9, 17-20, 27)");

await check("item 2: compressed-gas dusters are aerosols", () => {
  assert.equal(drop("Dust-Off Compressed Gas Duster 2 Pack").drop, "excluded-dangerous-goods");
  assert.equal(drop("Falcon Spray X Electronics Duster Canned Air").drop, "excluded-dangerous-goods");
  assert.notEqual(drop("OXO Microfiber Hand Duster").drop, "excluded-dangerous-goods");
});
await check("item 3: a kettlebell is caught by its stated weight, either spelling; apparel brands are not", () => {
  assert.equal(drop("Sporzon! Kettle Bell Set 75 lb", "sporting").drop, "excluded-heavy-by-title");
  assert.equal(drop("CAP Barbell Cast Iron Kettlebell 50 lb", "sporting").drop, "excluded-heavy-by-title");
  assert.ok(drop("CAP 15 lb Kettlebell", "sporting").item, "a 15 lb kettlebell is a parcel");
  assert.ok(ship({ name: "Kettle Bell S/S Tee - White" }), "a T-shirt brand was held as a kettlebell");
});
await check("items 4/8: full-size hoop systems, party tents, inflatable booths and glamping tents are held; kids' hoops ship", () => {
  for (const n of ["Lifetime Portable Basketball Hoop System 54 in Backboard", "Bullenfity 20 x 50 ft Outdoor Party Tent", "KFFKFF Inflatable Paint Booth 33x20x13 ft", "VEVOR Inflatable Glamping Tent 8 Person"]) assert.equal(ship({ name: n }), false, n);
  assert.equal(ship({ name: "Costway Portable 2 in 1 Kids Basketball Hoop Stand w/Ring Toss" }), true);
  assert.equal(ship({ name: "Costway 6-In-1 Large Slide for Kids Toddler Climber Slide Playset w/ Basketball Hoop" }), false, "a playset was freed");
});
await check("items 5/9/16/19/23: boilerplate and use-words no longer hold small goods (site rule)", () => {
  for (const n of ["NIUTA Resistance Bands Set for Home Gym", "THAILE Yoga Mat 10mm for Home Gym", "Official Rotorazer 301-Piece Drill Bit Set AS SEEN ON TV",
    "toolant Waterproof Winter Work Gloves for Freezer, Cold Storage", "WateLves Water Shoes for Kayak Beach", "Christmas Stocking for Fireplace Mantel",
    "Nestl Deep Pocket Queen Sheets Set Fits 18-24 in Mattress", "Sofa Blanket Throw Sherpa", "Bed Bug Glue Trap for Futon"]) assert.equal(ship({ name: n }), true, n);
  for (const n of ["Delta Children Emmie Convertible Crib, Fits Standard Full-Size Crib Mattress", "3-Seat Sofa with Cushions", "Queen Mattress Memory Foam 12 in", "7x4 ft Storage Shed", "Portable Camping Generator 2000W"]) assert.equal(ship({ name: n }), false, n);
});
await check("item 6: camp chairs, cots and airbeds enter; rooftop tents stay out", () => {
  for (const n of ["VILLEY Double Camping Chair Loveseat Folding", "Intex 10 in Twin Airbed Air Mattress", "Folding Camping Cot Car Bed", "18 in Self-Inflating Air Mattress"]) assert.ok(drop(n, "outdoors").item, n + ": " + JSON.stringify(drop(n, "outdoors").drop));
  assert.equal(drop("VEVOR Hard Shell Rooftop Tent", "outdoors").drop, "excluded-furniture");
});
await check("items 7/18: cookware and fridge accessories are not appliances", () => {
  for (const n of ["CAROTE 24-pc Cookware Set Dishwasher Safe", "Ninja Air Fryer Basket Dishwasher Safe", "Fridge Organizer Bins for Refrigerator", "Diamond Art Fridge Magnets Kit"]) {
    assert.notEqual(drop(n).drop, "excluded-large-appliance", n);
  }
  assert.equal(drop("Frigidaire Mini Fridge 3.1 cu ft").drop, "excluded-large-appliance");
});
await check("item 9: tool vocabulary is not a firearm; the hard line holds", () => {
  for (const n of ["SKIL 4V Rechargeable Screwdriver with Pistol Grip", "Cordless Impact Gun Wrench", "Hot Glue Gun Kit", "Heavy Duty Staple Gun"]) assert.notEqual(drop(n, "hardware").drop, "excluded-firearm", n);
  assert.equal(drop("Crosman Air Rifle .177", "hardware").drop, "excluded-firearm");
});
await check("items 17/20 + Danny: lethal bait out; repellents, devices and empty stations in; a device outranks a brand", () => {
  for (const n of ["d-CON Bait Station with 10 Baits", "Tomcat Mouse Killer with 16 Bait Blocks", "MouseX Rodent Killer Bait Pellets", "Starbar QuikStrike Fly Bait"]) assert.equal(drop(n).drop, "excluded-dangerous-goods", n);
  for (const n of ["Vamose All-Natural Rodent Repellent Pouches", "Raid Fly Ribbons 4 Pack", "Raid Fly Ribbon", "Catchmaster Glue Boards 10 Pack", "Tomcat Empty Bait Station", "Insecticide Free Sticky Traps"]) assert.ok(drop(n).item, n + ": " + drop(n).drop);
  assert.equal(drop("Raid Ant and Roach Killer Aerosol Spray").drop, "excluded-dangerous-goods");
});
await check("item 27: a supplement needs ingestible form; topicals with ingredient names stay", () => {
  for (const n of ["Olay Vitamin C Face Cream", "Dr Teal's Melatonin Sleep Lotion", "eos Shea Better Body Lotion Vitamin E", "Biotin Shampoo for Thinning Hair"]) assert.ok(drop(n, "personal_care").item, n);
  for (const n of ["Nature Made Melatonin Gummies 90 Count", "Centrum Multivitamin for Women", "Optimum Nutrition Whey Protein Powder"]) assert.equal(drop(n, "personal_care").drop, "excluded-supplement", n);
});

console.log("\n  Walmart write stage -- sizes, routing, flags");

await check("items 12/15/21/22: sizes from variantList, in stock, verbatim, by department families", () => {
  const vl = [{ variant: "clothing_size-xs", availabilityStatus: "IN_STOCK" }, { variant: "clothing_size-xl", availabilityStatus: "OUT_OF_STOCK" }, { attributes: ["clothing_size-2xl", "color-red"], availabilityStatus: "IN_STOCK" }];
  assert.deepEqual(W.decodeVariantSizes(vl, "apparel").sizes, ["XS", "2XL"]);
  const shoes = [{ v: "shoe_size-9women/7men", availabilityStatus: "IN_STOCK" }, { v: "shoe_size-13littleboy", availabilityStatus: "IN_STOCK" }, { v: "shoe_width-wide", availabilityStatus: "IN_STOCK" }, { v: "size-8usw(eu39)", availabilityStatus: "IN_STOCK" }];
  const s = W.decodeVariantSizes(shoes, "shoes");
  assert.deepEqual(s.sizes, ["9women/7men", "13littleboy"]);
  assert.deepEqual(s.widths, ["wide"]);
  assert.deepEqual(s.review, ["size-8usw(eu39)"], "the hybrid form must go to review, not be decoded");
  assert.deepEqual(W.decodeVariantSizes([{ v: "bed_size-queen" }, { v: "bed_size-california king" }], "home").sizes, ["queen", "california king"]);
  assert.deepEqual(W.decodeVariantSizes([{ v: "size-12 x 18 in" }], "seasonal").sizes, [], "a seasonal dimension was read as a size");
  const v = D.ingestRow(D.detailToRow({ name: "Fixture Women's Tee", priceInfo: { price: "$9.99" }, allImages: [img(1), img(2)], variantList: vl, gender: "Female", url: "https://www.walmart.com/ip/x/9" }), { dept: "apparel", bucket: "fashion", maxItems: 1 }, ctx);
  assert.ok(v.item, JSON.stringify(v));
  assert.deepEqual(v.item.sizes || v.item.availableSizes, ["XS", "2XL"]);
});
await check("items 11/13/15: age first, then the PDP's gender; never by the plan bucket", () => {
  const basics = { dept: "basics", bucket: "mens" };
  assert.equal(W.routeBucket(basics, "Hanes Originals Women's Boxer Briefs", ""), "womens");
  assert.equal(W.routeBucket(basics, "Wonder Nation Boys' Crew Socks 10 Pack", ""), "kids_baby");
  assert.equal(W.routeBucket(basics, "Fruit of the Loom Men's Briefs", ""), "mens");
  assert.equal(W.routeBucket(basics, "Crew Socks 6 Pack", ""), "basics", "unworded basics fell into men's");
  assert.equal(W.routeBucket({ dept: "apparel", bucket: "fashion" }, "Graphic Tee", "Male"), "mens");
  assert.equal(W.routeBucket({ dept: "apparel", bucket: "fashion" }, "Toddler Girls Dress 3T", "Female"), "kids_baby");
  assert.equal(W.routeBucket({ dept: "shoes", bucket: "shoes" }, "Toddler Light-Up Sneakers", "Male"), "kids_baby");
  assert.equal(W.routeBucket({ dept: "toys", bucket: "toys_games" }, "Girls Doll House", ""), "toys_games", "a non-gendered department was rerouted");
});
await check("items 10/14/16: bulk lots and mega-kits are flagged for review, not dropped", () => {
  assert.deepEqual(W.merchFlags("Bundle Lot of 5 New Men's T-Shirts"), ["bulk-lot"]);
  assert.deepEqual(W.merchFlags("Flip Flops 50 Pairs Wholesale"), ["bulk-lot"]);
  assert.deepEqual(W.merchFlags("Crew Socks 6 Pairs"), []);
  assert.deepEqual(W.merchFlags("UBesGoo 1000-Piece Tool Set Trolley Case"), ["mega-kit-weight-check"]);
  assert.deepEqual(drop("Bundle Lot of 5 Men's T-Shirts", "apparel").item.merchReview, ["bulk-lot"]);
});

console.log("\n  Walmart write stage -- the voltage gate (items 25/26)");

await check("verified dual voltage sells; 110 V-only is excluded; unstated and contradicting are held; battery/USB untouched", () => {
  const v = (n, d) => W.voltageVerdict(n, d);
  assert.equal(v("Hair Dryer 1875W Dual Voltage 110-240V"), "verified");
  assert.equal(v("Digital Piano", "Input AC 100-240V 50/60Hz"), "verified");
  assert.equal(v("Kisportee Hot Air Brush", "Only 100V-120V"), "excluded-110v");
  assert.equal(v("Travel Steamer 1000W", "100-120V"), "excluded-110v");
  assert.equal(v("iMeshbean 61-Key Electric Keyboard", "Power: AC100-220V. Spec: AC110V"), "held-contradicting");
  assert.equal(v("Ninja Air Fryer 4 qt"), "held-unstated");
  assert.equal(v("SUGIFT 61 Key Digital Piano", "Adapter output DC 12V"), "held-unstated");
  assert.equal(v("LED String Lights USB Powered"), "not-mains");
  assert.equal(v("Battery Operated Toy Keyboard"), "not-mains");
  assert.equal(drop("Kisportee Hot Air Brush", "personal_care", { description: "Only 100V-120V" }).drop, "excluded-110v-only");
  assert.equal(drop("Ninja Air Fryer 4 qt").quarantine, "voltage-unstated");
  assert.equal(drop("Hair Dryer Dual Voltage 110-240V", "personal_care").item.voltage, "dual-220");
});

console.log("\n  Walmart write stage -- condition (item 28 + Danny)");

await check("refurbished electronics enter labeled; used clothing, footwear, auto parts and locked phones never do", () => {
  const r = drop("Apple iPhone 12 128GB Unlocked Renewed", "electronics").item;
  assert.equal(r.condition, "refurbished");
  assert.equal(r.conditionLabel, "Reacondicionado");
  assert.equal(drop("Open Box RockJam Acoustic Guitar", "instruments").item.conditionLabel, "Caja abierta");
  assert.equal(drop("Nike Air Max Pre-Owned Sneakers", "shoes").drop, "excluded-used-clothing-footwear");
  assert.equal(drop("Levi's 501 Jeans Used", "apparel").drop, "excluded-used-clothing-footwear");
  assert.equal(drop("Refurbished Brake Caliper Front", "hardware").drop, "excluded-used-auto-part");
  assert.equal(drop("Apple iPhone 11 Straight Talk Locked Refurbished", "electronics").drop, "excluded-locked-phone");
  assert.equal(drop("Mixing Bowl Set Used for Baking", "home").item.condition, undefined, "'used for' read as a used product");
});

await check("item 29: fresh produce, meat, seafood, eggs and milk never publish; look-alikes stay", () => {
  const out = ["Fresh Yellow Onions, 3 lb Bag", "Fresh  Whole Celery, 1ea Premium Quality, Rich in antioxidants", "Fresh Seedless Watermelon, Each",
    "Fresh Boneless Skinless Chicken Breasts, 2.5 lb", "Fresh Atlantic Salmon Fillet, 1 lb", "Great Value Large White Eggs, 12 Count", "Great Value Whole Milk, 1 Gallon"];
  for (const n of out) {
    assert.equal(D.exclusionOf(n), "excluded-perishable-food", n);
    assert.equal(ship({ name: n, price: 3 }), false, "site rule: " + n);
  }
  assert.equal(D.exclusionOf("Celery Hearts", "", "Fresh Produce"), "excluded-perishable-food");
  assert.equal(D.exclusionOf("Bananas, each", "Food Fresh Produce Fresh Fruit"), "excluded-perishable-food");
  assert.equal(ship({ name: "Celery Hearts", brand: "Fresh Produce", price: 2 }), false);
  assert.equal(D.ingestRow(row("Fresh Yellow Onions, 3 lb Bag", { brand: "Fresh Produce" }), { dept: "home" }, ctx).drop, "excluded-perishable-food");
  const stay = ["Fresh Pear Tie Dye Tee", "Fresh Strawberry Scented Candle", "Better Homes & Gardens 5-Wick 100 oz Glass Jar Candle, Fresh Cut Frasier",
    "Toddler Girls' Disney Minnie Fresh Strawberries Toddler Short Sleeve Graphic T-Shirt", "MIKE AND IKE SOUR Watermelon Chewy Candy, 4.25 ounce Theater Box",
    "Great Value Bowties, 12 oz", "Little Spoon Kid's YoGos, Organic Whole Milk Greek Yogurt Pouches, Variety 35 Pack", "Fresh Kidz Boys Blue Roll-On Deodorant - 1.86 fl oz"];
  for (const n of stay) {
    assert.notEqual(D.exclusionOf(n), "excluded-perishable-food", n);
    assert.equal(ship({ name: n, price: 3 }), true, "site rule: " + n);
  }
  assert.equal(ship({ name: "Classic Diaper Bag", brand: "Freshly Picked", price: 60 }), true);
});

await check("item 29: the site rule and the write stage hold the same perishable patterns", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const f = readdirSync(ROOT + "build").find((n) => /^app-[0-9a-f]{16}\.js$/.test(n));
  const src = readFileSync(ROOT + "build/" + f, "utf8");
  for (const k of ["PERISHABLE_TITLE_RX", "PERISHABLE_BRAND_RX", "PERISHABLE_DAIRY_RX"]) {
    const m = src.match(new RegExp("const " + k + " = (/.*/i);"));
    assert.ok(m, k + " in the bundle");
    assert.equal(m[1], W[k].toString(), k);
  }
  assert.ok(!/\(\?<[=!]/.test(src.match(/const PERISHABLE_TITLE_RX = .*/)[0]), "no lookbehind (older iOS Safari)");
});

await check("item 29 census: no committed catalogue or built slice holds fresh food", async () => {
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const { catalogueFiles, perishableTitles } = await import("../scrub-perishable.mjs");
  const files = catalogueFiles(ROOT).map((f) => ROOT + f);
  const walk = (d) => { for (const n of readdirSync(d)) { const p = d + "/" + n; if (statSync(p).isDirectory()) walk(p); else if (n.endsWith(".json")) files.push(p); } };
  for (const d of ["assets/tienda", "assets/ofertas", "assets/sections", "assets/home", "assets/pdp", "assets/search"]) walk(ROOT + d);
  const found = [];
  for (const f of files) {
    const raw = readFileSync(f, "utf8");
    if (!/fresh|eggs|milk/i.test(raw)) continue;
    let data; try { data = JSON.parse(raw); } catch { continue; }
    for (const t of perishableTitles(data)) found.push(f.slice(ROOT.length) + ": " + t);
    /* Compact card shapes ({ t, b }) the generic walk does not read as products. */
    (function cards(o) { if (Array.isArray(o)) return o.forEach(cards); if (o && typeof o === "object") { if (typeof o.t === "string" && W.perishableFood(o.t, typeof o.b === "string" ? o.b : "")) found.push(f.slice(ROOT.length) + ": " + o.t); else Object.values(o).forEach(cards); } })(data);
  }
  assert.deepEqual(found, []);
});

await check("item 30: no $2 floor; sub-$2 junk held on evidence, real sub-$2 products publish", () => {
  assert.equal(D.PRICE_BAND_USD.min, 0);
  assert.equal(D.PRICE_BAND_USD.max, 1500, "the ceiling is unchanged");
  const v = (name, price, extra = {}) => W.sub2Verdict({ name, price, ...extra });
  assert.equal(v("Boovnll Clearance Under $1 Hand Towels", 0.69).hold, "price-stuffed-title");
  assert.equal(v("Women 3 Pack Panties Seamless Hipster", 0.49).hold, "variant-floor");
  assert.equal(v("Swuxness Toddler Girl 2-Piece Outfit Set", 0.69).hold, "variant-floor");
  assert.equal(v("Bovxnpu Toddler Boys Graphic Tee", 1.75, { seller: "Bovxnpu" }).hold, "verify-pdp-price");
  assert.equal(v("Personalized Letter A Christmas Ornament", 1.5).hold, "fragment-letter-variant");
  assert.equal(v("Christmas Ornament, Initial B Glitter", 1.2).hold, "fragment-letter-variant");
  assert.deepEqual(v("HARIBO Unicorn-i-licious Gummi Candy, 4 oz Peg Bag", 1.28, { wasPrice: 10 }), { dropWasPrice: true });
  assert.deepEqual(v("CWCWFHZH Mini Dinosaur Toy Car Clearance 2023!", 1.58), { name: "CWCWFHZH Mini Dinosaur Toy Car" });
  for (const [n, p, extra] of [["Catchmaster Glue Board Mouse Trap", 1.47, { seller: "Walmart.com" }], ["Hot Wheels Basic Car", 1.24, { seller: "Walmart.com" }],
    ["Victor Mouse Traps, 2 Pack", 1.97, { seller: "Walmart.com" }], ["Hello Kitty Toddler Tee", 6.5, { seller: "Zz" }], ["Fly Ribbon, 4 Pack", 1.48, {}]]) {
    assert.equal(v(n, p, extra), null, n);
  }
  const held = D.ingestRow(row("Boovnll Clearance Under $1 Hand Towels", { price: 0.69 }), { dept: "home" }, ctx);
  assert.equal(held.quarantine, "price-stuffed-title");
  const pub = D.ingestRow(row("Hot Wheels Basic Car 1:64", { price: 1.24, seller: "Walmart.com" }), { dept: "toys" }, ctx);
  assert.ok(pub.item, JSON.stringify(pub).slice(0, 200));
  const scrub = D.ingestRow(row("HARIBO Unicorn-i-licious Gummi Candy, 4 oz Peg Bag", { price: 1.28, originalPrice: 10, seller: "Walmart.com" }), { dept: "candy" }, ctx);
  assert.ok(scrub.item, JSON.stringify(scrub).slice(0, 200));
  assert.equal(scrub.item.originalPrice, undefined);
  assert.equal(scrub.item.onSale, false);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

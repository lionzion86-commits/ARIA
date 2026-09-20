/* ============================================================
   THE WEIGHT AND PRICING HARNESS.

   Several comments in this codebase promise a test — "test-freight
   asserts row-for-row agreement", "test-item-weight asserts the two
   agree", "test-sales-parity asserts both agree" — and none of them
   existed as a file anyone could run. The page/module mirrors those
   comments describe are the most fragile thing here: index.html cannot
   import, so the weight tables live twice, and a drift between the two
   copies means the card and the checkout quote disagree about what a
   product weighs. That is a silent money bug.

   Run it with:  node scripts/test/run-tests.mjs
   ============================================================ */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadPageWeightSlice, loadPageTileSlice, loadPageQuerySlice } from "./_page-script.mjs";

import * as beauty from "../lib/beauty-weight.js";
import * as itemWeight from "../lib/item-weight.js";
import { estimateWeightDetail, categoryWeightKg } from "../lib/sales-sources.js";
import * as salesSources from "../lib/sales-sources.js";
import { resolveItemWeight, resolveCartWeights } from "../../netlify/functions/_weight-resolve.js";
import { smallOrderFeePen, SMALL_ORDER_FEE_PEN, SMALL_ORDER_THRESHOLD_PEN } from "../../weight-data.js";
import { RETAILERS, searchableRetailers, isBeautyRetailer } from "../lib/retailers.js";
import * as ondemand from "../lib/ondemand-policy.js";
import * as refreshTiers from "../lib/refresh-tiers.js";
import * as translate from "../lib/query-translate.js";
import { CHARGE_PER_KG as chargePerKg } from "../../weight-data.js";

const root = (p) => fileURLToPath(new URL("../../" + p, import.meta.url));

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`${name}\n      ${err.message}`);
  }
}

function eq(actual, expected, what) {
  if (actual !== expected) throw new Error(`${what ?? "value"}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

function group(title) {
  console.log(`\n  ${title}`);
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const page = loadPageWeightSlice();
const pageQuery = loadPageQuerySlice();

/* ------------------------------------------------------------------
   P1.1 — the beauty table, row by row, against the brief's own figures.
   ------------------------------------------------------------------ */
group("P1.1 beauty weight estimator");

const BRIEF_TABLE = [
  ["Lipstick (bullet)", "Revlon Super Lustrous Lipstick - Fire & Ice", 0.05],
  ["Liquid lipstick / gloss", "NYX Butter Gloss Lip Gloss", 0.05],
  ["Mascara", "Maybelline Lash Sensational Mascara", 0.05],
  ["Eyeliner pencil (wooden)", "Rimmel Scandaleyes Eyeliner Pencil", 0.02],
  ["Liquid eyeliner pen", "Stila Stay All Day Liquid Eyeliner", 0.03],
  ["Concealer (tube/wand)", "Maybelline Instant Age Rewind Concealer", 0.05],
  ["Eyeshadow single", "Urban Decay Eyeshadow Single - Half Baked", 0.03],
  ["Eyeshadow palette, small", "NYX Ultimate Shadow Palette 12 Colors", 0.10],
  ["Eyeshadow palette, large", "Morphe 35O Eyeshadow Palette 35 Colors", 0.30],
  ["Foundation 30 ml", "Estee Lauder Double Wear Foundation 30 ml", 0.15],
  ["Powder/blush/bronzer", "Milani Baked Blush Compact", 0.08],
  ["Nail polish", "OPI Nail Polish - Big Apple Red", 0.05],
  ["Serum 30 ml", "The Ordinary Niacinamide Serum 30ml", 0.10],
  ["Moisturizer 50 ml jar", "CeraVe Moisturizing Cream 50ml", 0.20],
  ["Setting spray", "Urban Decay All Nighter Setting Spray", 0.15],
  ["Perfume 30 ml", "Dior Sauvage Eau de Toilette 30ml", 0.15],
  ["Perfume 50 ml", "Chanel Coco Mademoiselle Eau de Parfum 50ml", 0.25],
  ["Perfume 100 ml", "Versace Eros Eau de Toilette 100ml", 0.35],
];

for (const [label, title, expected] of BRIEF_TABLE) {
  check(`brief row: ${label}`, () => {
    eq(beauty.beautyWeightKg(title), expected, "module");
    eq(page.beautyWeightDetail(title, {})?.kg, expected, "index.html mirror");
    eq(estimateWeightDetail(title).kg, expected, "estimate chain");
    eq(resolveItemWeight({ title }).weightKg, expected, "checkout resolver");
  });
}

check("Spanish titles hit the same rows as English", () => {
  eq(beauty.beautyWeightKg("Labial mate rojo"), 0.05);
  eq(beauty.beautyWeightKg("Rímel volumen extremo"), 0.05);
  eq(beauty.beautyWeightKg("Delineador líquido negro"), 0.03);
  eq(beauty.beautyWeightKg("Corrector de ojeras"), 0.05);
  eq(beauty.beautyWeightKg("Base de maquillaje líquida"), 0.15);
  eq(beauty.beautyWeightKg("Rubor en polvo"), 0.08);
  eq(beauty.beautyWeightKg("Esmalte de uñas rojo"), 0.05);
  eq(beauty.beautyWeightKg("Crema hidratante facial"), 0.20);
  eq(beauty.beautyWeightKg("Colonia para hombre 100ml"), 0.35);
});

check("an unrecognised beauty title falls to 0.05 kg, never the 1.08 generic", () => {
  const generic = itemWeight.withBuffer(0.8, "reasoned");   // the old fallback
  eq(generic, 1.08, "the generic fallback is still 1.08");
  const r = resolveItemWeight({ title: "Beautyblender Original Sponge", retailer: "sephora" });
  eq(r.weightKg, 0.05, "sephora item with no matching row");
  eq(r.source, "beauty");
  eq(beauty.beautyWeightKg("Sombra de ojos en crema, edición limitada"), 0.03);
});

check("a retailer-stated weight still wins over the beauty table", () => {
  // weightEstimated: false is how a line says "this came from the store".
  const r = resolveItemWeight({ title: "Dior Sauvage Eau de Toilette 100ml", weightKg: 0.42, weightEstimated: false });
  eq(r.weightKg, 0.42);
  eq(r.source, "spec");
  eq(r.estimated, false);
});

check("every beauty weight is an estimate and reaches the review queue", () => {
  const detail = estimateWeightDetail("MAC Matte Lipstick");
  eq(detail.estimated, true, "estimated");
  // Its own queue: a beauty row is a conservative figure awaiting
  // calibration, not a defect. Folding it in with the genuine gaps would
  // bury them AND delist the whole beauty catalogue from Ofertas.
  eq(detail.reviewKind, "calibration", "review queue it lands in");
  eq(detail.flagged, false, "not a defect, so it still sells and still features");
  if (!detail.reason) throw new Error("no line for the calibration queue");
  eq(resolveItemWeight({ title: "MAC Matte Lipstick" }).estimated, true);
});

check("non-beauty titles are untouched by the beauty table", () => {
  for (const title of [
    "Optimum Nutrition Gold Standard Whey Protein Powder, 2 lb",
    "Tide Laundry Detergent Powder 40 oz",
    "Johnson's Baby Powder 22 oz",
    "Samsung 55\" QLED 4K Smart TV",
    "Mainstay 4-Shelf TV Stand",
  ]) {
    eq(beauty.beautyWeightKg(title), null, title);
  }
});

check("a fragrance brand that is also a shoe brand reads as fragrance", () => {
  eq(beauty.beautyWeightKg("Puma Energy Eau de Toilette 50ml"), 0.25);
  eq(categoryWeightKg("Puma Energy Eau de Toilette 50ml"), 0.25, "not routed into footwear");
});

check("the 4-fragrance shipment limit counts quantities", () => {
  eq(beauty.MAX_FRAGRANCES_PER_SHIPMENT, 4);
  const under = beauty.fragranceLimitState([{ title: "Dior Sauvage EDT", qty: 4 }]);
  eq(under.count, 4);
  eq(under.overLimit, false, "exactly 4 is allowed");
  const over = beauty.fragranceLimitState([{ title: "Dior Sauvage EDT", qty: 4 }, { title: "Chanel No 5 Eau de Parfum", qty: 1 }]);
  eq(over.count, 5);
  eq(over.overLimit, true, "5 is not");
  eq(beauty.fragranceLimitState([{ title: "MAC Lipstick", qty: 12 }]).count, 0, "lipsticks are not fragrances");
  eq(resolveCartWeights([{ title: "Dior Sauvage EDT", qty: 5 }]).fragrance.overLimit, true, "the resolver answers it too");
});

check("packaging is config, and currently adds nothing", () => {
  eq(beauty.BEAUTY_PACK_ALLOWANCE_KG.polybag, 0);
  eq(beauty.BEAUTY_PACK_ALLOWANCE_KG.carton, 0);
  // Turning the dial must move every carton row and no polybag row.
  const before = beauty.beautyWeightKg("OPI Nail Polish");
  beauty.BEAUTY_PACK_ALLOWANCE_KG.carton = 0.05;
  const after = beauty.beautyWeightKg("OPI Nail Polish");
  const polybag = beauty.beautyWeightKg("Revlon Lipstick");
  beauty.BEAUTY_PACK_ALLOWANCE_KG.carton = 0;
  eq(before, 0.05);
  eq(after, 0.10, "carton rows follow the dial");
  eq(polybag, 0.05, "polybag rows do not");
});

/* ------------------------------------------------------------------
   P1.2 — actual scale weight only.
   ------------------------------------------------------------------ */
group("P1.2 actual scale weight only");

const SOURCE_FILES = [
  "scripts/lib/item-weight.js",
  "scripts/lib/sales-sources.js",
  "scripts/lib/beauty-weight.js",
  "netlify/functions/_weight-resolve.js",
  "index.html",
];


check("no volumetric code path survives anywhere", () => {
  for (const file of SOURCE_FILES) {
    const code = stripComments(readFileSync(root(file), "utf8"));
    for (const banned of ["dimensionalWeightKg", "billableWeightKg", "DIM_DIVISOR", "boxCm", "dimCm"]) {
      if (code.includes(banned)) throw new Error(`${file} still references ${banned}`);
    }
  }
});

check("footwear quotes what a pair weighs, not what its box measures", () => {
  // Every one of these used to be the larger, dimensional figure.
  eq(itemWeight.footwearWeightKg("Nike Air Force 1 Low Men's"), 1.30);
  eq(itemWeight.footwearWeightKg("Timberland 6-Inch Premium Boots"), 2.24);
  eq(itemWeight.footwearWeightKg("Nike Baby Crib Shoe"), 0.28);
});

check("the sandals polybag fix from PR #2 is intact", () => {
  eq(itemWeight.footwearWeightKg("Reef Men's Sandals"), 0.6);
  eq(itemWeight.footwearWeightKg("Old Navy Flip-Flops for Women"), 0.6);
  eq(page.footwearWeightKg("Reef Men's Sandals"), 0.6, "index.html mirror");
});

check("balls quote real mass times count", () => {
  eq(itemWeight.ballWeightKg("Rawlings Official League Baseball"), 0.24);
  eq(itemWeight.ballWeightKg("Titleist Golf Balls (12 pack)"), 0.7);
});

check("a retailer's published DIMENSIONS are no longer a weight source", () => {
  const r = resolveItemWeight({ title: "Anker Soundcore Speaker", dimensions: "25 x 22 x 12 cm" });
  if (r.source === "spec") throw new Error("dimensions still resolving as a spec weight");
});

/* ------------------------------------------------------------------
   P1.5 — the money-bleed fixes.
   ------------------------------------------------------------------ */
group("P1.5 weight estimator money-bleed fixes");

check("a cellular generation is never parsed as grams", () => {
  // Reported live: "5G" read as five grams, freight quoted on 0.065 kg.
  for (const title of [
    "5G WiFi Bluetooth Projector 1080P",
    "Portable 4G LTE Mobile Hotspot",
    "Samsung Galaxy S24 5G 256GB",
    "Unlocked 3G/4G Smartphone",
    "6G Ready Router Dual Band",
  ]) {
    eq(itemWeight.titleWeight(title), null, title);
    eq(page.titleWeight(title), null, `${title} (page mirror)`);
  }
});

check("a WiFi standard is not 802 grams of router", () => {
  eq(itemWeight.titleWeight("802.11g Wireless Router"), null);
  eq(itemWeight.titleWeight("802.11ac Dual Band Access Point"), null);
  eq(page.titleWeight("802.11g Wireless Router"), null, "page mirror");
});

check("a unit must start its own token", () => {
  // A version or model number may not donate its digits to a weight.
  eq(itemWeight.titleWeight("Model X-500g Mount Bracket")?.kg ?? null, null, "hyphenated model code");
  eq(itemWeight.titleWeight("v2.5kg Firmware Bundle")?.kg ?? null, null, "dotted version");
});

check("real stated weights still parse, in every form the catalogue uses", () => {
  const cases = [
    ["Great Value Gummy Bears Chewy Candy, 4 oz", 0.173],
    ["BUBS Swedish Candy 10 oz", 0.343],
    ["Protein Bar, 60 g", 0.12],
    ["Coffee 1,5 kg", 1.56],
    ["(4 pack) Chips 5.5 oz", 0.684],
  ];
  for (const [title, kg] of cases) {
    eq(itemWeight.titleWeight(title)?.kg, kg, title);
    eq(page.titleWeight(title)?.kg, kg, `${title} (page mirror)`);
  }
  eq(itemWeight.titleWeight("Tire rated load up to 300 lb"), null, "a limit is not a weight");
});

check("the projector that started this now lands on a real category row", () => {
  const d = estimateWeightDetail("5G WiFi Bluetooth Projector 1080P");
  eq(d.kg, 2.97, "weight");
  eq(d.needsReview, false, "quotable");
  eq(d.bound, "proyector", "banded");
  eq(estimateWeightDetail("Mini Portable Projector 720p").kg, 1.35, "a pocket unit is not a home-theatre one");
});

check("an estimate ABOVE its category band fails closed", () => {
  // The reported case: a men's leather sneaker at 1.94 kg against a
  // plausible 0.8-1.6 — half a kilo of air, ~S/ 22 of phantom freight.
  const over = itemWeight.weightSanity("Nike Air Force 1 Low Men's Leather Sneakers", 1.94);
  eq(over.ok, false);
  eq(over.outOfBand, true, "flagged for manual review");
  eq(over.minKg, 0.8);
  eq(over.maxKg, 1.6);
  eq(over.kg, 1.94, "the original is kept: clamping DOWN would cost real money");
  eq(page.weightSanity("Nike Air Force 1 Low Men's Leather Sneakers", 1.94).outOfBand, true, "page mirror");
});

check("an estimate BELOW its category band fails closed", () => {
  // Same bug class as the 0 kg TV stand.
  const under = itemWeight.weightSanity("5G WiFi Bluetooth Projector", 0.065);
  eq(under.ok, false);
  eq(under.outOfBand, true);
  eq(under.minKg, 0.5, "a projector under half a kilo is not a projector");
  eq(itemWeight.weightSanity('Samsung 55" QLED TV', 0.12).outOfBand, true, "the TV-stand class");
  eq(itemWeight.weightSanity("Mainstay 4-Shelf TV Stand", 0).outOfBand, true, "a zero weight is a missing measurement");
});

check("the band is per footwear TIER, not one band for all shoes", () => {
  // 0.28 kg is right for an infant shoe and absurd for a men's boot.
  eq(itemWeight.footwearBandKg("Nike Baby Crib Shoe").join("-"), "0.1-0.6");
  eq(itemWeight.footwearBandKg("Nike Air Force 1 Low Men's").join("-"), "0.8-1.6");
  eq(itemWeight.footwearBandKg("Timberland 6-Inch Boots").join("-"), "0.9-3.2");
  eq(itemWeight.weightSanity("Nike Baby Crib Shoe", 0.28).outOfBand, false, "infant shoe in band");
  eq(itemWeight.weightSanity("Nike Air Force 1 Low Men's", 0.28).outOfBand, true, "same weight, wrong tier");
  eq(itemWeight.footwearBandKg("New Balance 204L").join("-"), "0.4-2", "a shoe listed by model alone is still banded");
});

check("every current estimate sits inside its own band", () => {
  const drift = [];
  for (const title of [
    "Nike Air Force 1 Low Men's", "Timberland 6-Inch Boots", "Reef Men's Sandals",
    "Nike Baby Crib Shoe", "Toddler Nike Revolution", "Crocs Classic Clog",
    "Women's Ankle Boots", "Adidas Samba Women's", "Nike Kids Air Max",
    'Samsung 55" QLED 4K Smart TV', "5G WiFi Bluetooth Projector", "Mini Portable Projector",
    "MAC Matte Lipstick", "Dior Sauvage Eau de Toilette 100ml",
    "Queen Size Mattress", "6 Drawer Dresser", "Franklin Soccer Goal 12 x 6FT",
    "Agility Ladder 20 ft Speed Training", "Trek Mountain Bike 27.5",
  ]) {
    const d = estimateWeightDetail(title);
    if (d.needsReview) drift.push(`${title}: ${d.kg} kg — ${d.reason}`);
  }
  if (drift.length) throw new Error(drift.join("\n      "));
});

check("a retailer-published weight is a fact, and is never band-checked", () => {
  const r = resolveItemWeight({ title: "Nike Air Force 1 Low Men's", weightKg: 1.94, weightEstimated: false });
  eq(r.source, "spec");
  eq(r.needsReview, false, "a measurement is not an estimate");
  eq(r.weightKg, 1.94);
  eq(resolveItemWeight({ title: "Some Item", shippingWeight: "3 lb" }).source, "spec", "a raw scrape field is still a spec");
});

check("the cart's own estimate is not mistaken for a retailer spec", () => {
  /* The resolver used to read a cart line's weightKg as a published
     measurement. It is our own title estimate, written by addToCart —
     so checkout echoed it back as "confirmado por la tienda" and skipped
     the bands at the one place money changes hands. */
  const line = resolveItemWeight({ title: "Nike Air Force 1 Low Men's Sneakers, 4.5 lb", weightKg: 2.04 });
  if (line.source === "spec") throw new Error("our own estimate is still read as a retailer spec");
  eq(line.needsReview, true, "and it is now band-checked");
  // An older cart with no provenance flag falls the same, safe way.
  eq(resolveItemWeight({ title: "Mainstay 4-Shelf TV Stand", weightKg: 0.6 }).source !== "spec", true);
});

check("the page marks every cart line's weight as its own estimate", () => {
  const html = readFileSync(root("index.html"), "utf8");
  const fn = html.slice(html.indexOf("function addToCart(item)"), html.indexOf("function removeFromCartByKey"));
  if (!/weightEstimated/.test(fn)) throw new Error("addToCart does not record where the weight came from");
});

check("checkout refuses the whole quote when one line is out of band", () => {
  const fine = resolveCartWeights([
    { title: "MAC Matte Lipstick", qty: 1 },
    { title: "Nike Air Force 1 Low Men's", qty: 1 },
  ]);
  eq(fine.needsReview, false, "believed weights quote normally");
  eq(fine.reviewItems.length, 0);

  const bad = resolveCartWeights([
    { title: "MAC Matte Lipstick", qty: 1 },
    { title: "Nike Air Force 1 Low Men's Sneakers, 4.5 lb", qty: 1 },
  ]);
  eq(bad.needsReview, true, "one bad line stops the whole quote");
  eq(bad.reviewItems.length, 1, "and names only the line that needs a human");
  if (!bad.reviewItems[0].reason) throw new Error("no reason given for the reviewer");
});

/* ------------------------------------------------------------------
   P1.5 addendum — the Ofertas quality gate.
   ------------------------------------------------------------------ */
group("P1.5 addendum: Ofertas quality gate");

// normalizeDeal needs a real on-sale signal, not just two prices —
// Ofertas only ever carries genuine markdowns.
const deal = (title, price, original) =>
  salesSources.normalizeDeal(
    { title, price, originalPrice: original, onSale: true, image: "https://example.com/y.jpg" },
    "walmart",
  );

check("a flagged weight is not featured as a deal", () => {
  // No category row: quotable elsewhere, never promoted here.
  eq(deal("Totally Unknown Widget XYZ", 40, 80), null, "no category row");
  // Out of band: not quotable at all.
  eq(deal("Nike Air Force 1 Low Men's Sneakers, 4.5 lb", 90, 160), null, "out of band");
});

check("the same products stay available outside Ofertas", () => {
  // They still resolve to a usable weight for search and the category
  // feed — being kept out of Ofertas is not being delisted.
  const r = resolveItemWeight({ title: "Totally Unknown Widget XYZ" });
  if (!(r.weightKg > 0)) throw new Error("the gap case lost its weight entirely");
  eq(r.needsReview, false, "a gap is quotable; only out-of-band is not");
});

check("a beauty estimate is still featured", () => {
  const d = deal("MAC Matte Lipstick - Ruby Woo", 25, 50);
  if (!d) throw new Error("beauty was excluded from Ofertas");
  eq(d.weightSource, "beauty");
  eq(d.weightKg, 0.05);
});

check("the two freight lines are 50% and 100%, module and page", () => {
  eq(itemWeight.FREIGHT_BADGE_SHARE, 0.5);
  eq(itemWeight.FREIGHT_FEATURE_CEILING, 1.0);
  eq(page.FREIGHT_BADGE_SHARE, 0.5, "page mirror, badge");
  eq(page.FREIGHT_FEATURE_CEILING, 1.0, "page mirror, ceiling");
  // The ambiguous alias is gone: with two thresholds, a name that does
  // not say which one it means is how they drift apart.
  const src = stripComments(readFileSync(root("scripts/lib/item-weight.js"), "utf8"));
  if (/MAX_FREIGHT_SHARE/.test(src)) throw new Error("the ambiguous MAX_FREIGHT_SHARE alias is back");
});

check("the badge fires strictly above 50%, and nowhere below", () => {
  // freightShare = kg * $13 / price.
  const share = (kg, price) => itemWeight.freightIsHigh(kg, price, 13);
  eq(share(1, 26), false, "exactly 50% — no badge");
  eq(share(1.01, 26), true, "just over 50%");
  eq(share(0.5, 26), false, "25%");
});

check("the feature ceiling fires strictly above 100%, and nowhere below", () => {
  const over = (kg, price) => itemWeight.freightAboveFeatureCeiling(kg, price, 13);
  eq(over(1.5, 26), false, "58% — featurable");
  eq(over(2, 26), false, "exactly 100% — still featurable");
  eq(over(2.01, 26), true, "just over 100% — not featurable");
});

check("50-100% is featured AND badged", () => {
  /* A 74 kg dresser: ~$965 of freight against a card price of ~$1,469 —
     66%. The share is measured against the price the CARD PRINTS, which
     over the $200 threshold carries the import tax, so the fixture is
     priced from that number and not from the raw scrape. */
  const heavy = deal("6 Drawer Dresser", 900, 1600);
  if (!heavy) throw new Error("a heavy item inside the ceiling was suppressed instead of badged");
  eq(heavy.freightHigh, true, "carries the Flete alto badge");
  if (!(heavy.freightShare > 0.5 && heavy.freightShare <= 1)) {
    throw new Error(`fixture drifted out of the 50-100% band: ${heavy.freightShare}`);
  }
  const light = deal("Levi's 501 Original Fit Jeans", 60, 100);
  if (!light) throw new Error("an ordinary deal was dropped");
  eq(light.freightHigh, false);
});

check("over 100% is not featurable as a deal", () => {
  // The same dresser at $180: ~$965 of freight, five times the price.
  eq(deal("6 Drawer Dresser", 180, 320), null, "freight over the product's own price");
  // …and it is the CEILING doing it, not the weight gate: the weight is
  // believed, and the item is fine at a price that can carry the freight.
  const d = estimateWeightDetail("6 Drawer Dresser");
  eq(d.flagged, false, "the weight itself is believed");
  if (!deal("6 Drawer Dresser", 900, 1600)) throw new Error("the same product is featurable at a price that carries the freight");
});

check("an item over the ceiling is still listed everywhere else", () => {
  // Not featurable is not delisted: it still resolves to a real weight
  // for search, the category feed and checkout.
  const r = resolveItemWeight({ title: "6 Drawer Dresser" });
  if (!(r.weightKg > 0)) throw new Error("the item lost its weight entirely");
  eq(r.needsReview, false, "and it is perfectly quotable");
});

check("the cache sanitizer enforces the same ceiling", () => {
  const cache = stripComments(readFileSync(root("netlify/functions/sales-cache.js"), "utf8"));
  if (!/share > FREIGHT_FEATURE_CEILING\) return null/.test(cache)) {
    throw new Error("a heavy item could re-enter Ofertas through the cache");
  }
  if (/FREIGHT_BADGE_SHARE\) return null/.test(cache)) {
    throw new Error("the badge threshold is suppressing items again");
  }
});

check("the page applies both Ofertas rules on the one load path left", () => {
  const html = readFileSync(root("index.html"), "utf8");
  for (const fn of ["passesOfertasWeightGate", "passesOfertasFreightCeiling", "passesOfertasGate"]) {
    if (!new RegExp(`function ${fn}`).test(html)) throw new Error(`${fn} is missing`);
  }
  // There used to be two: the cache read and a browser-side live scan.
  // The live scan is gone (the $88 fix), so the cache read is the only
  // way a deal reaches the feed, and it must be gated.
  const uses = (html.match(/\.filter\(passesOfertasGate\)/g) || []).length;
  if (uses !== 1) throw new Error(`the gate is applied ${uses} time(s); expected exactly the cache read`);
  const loader = html.slice(html.indexOf("async function runSalesScan"));
  if (!/\.filter\(passesOfertasGate\)/.test(loader.slice(0, 2000))) {
    throw new Error("the cache read is not gated");
  }
});

check("a card with an unconfirmed weight shows no freight figure", () => {
  const html = readFileSync(root("index.html"), "utf8");
  const card = html.slice(html.indexOf("function productCardHTML"), html.indexOf("function renderSalesGrid"));
  if (!/weightUnderReview/.test(card)) throw new Error("the card does not check the review state");
  if (!/Flete por confirmar/.test(card)) throw new Error("the card has no honest stand-in for the freight line");
});

check("the cart and checkout both refuse to quote an unconfirmed weight", () => {
  const index = readFileSync(root("index.html"), "utf8");
  if (!/function cartWeightReviewItems/.test(index)) throw new Error("the cart does not detect it");
  if (!/blockedByWeight/.test(index)) throw new Error("the cart does not block checkout on it");
  const checkout = readFileSync(root("checkout.html"), "utf8");
  if (!/weightReview\.needsReview/.test(checkout)) throw new Error("checkout does not read the resolver's verdict");
  if (!/Confirmando el peso del pedido/.test(checkout)) throw new Error("Pagar is not closed on it");
});

/* ------------------------------------------------------------------
   ON-DEMAND STORE SEARCH — the spend guards.
   ------------------------------------------------------------------ */
group("on-demand store search");

check("one question is one cache key, however it is typed", () => {
  const k = ondemand.ondemandCacheKey("oldnavy", "camison azul");
  eq(ondemand.ondemandCacheKey("OldNavy", "  Camisón   AZUL!! "), k, "case, accents, padding, punctuation");
  eq(ondemand.ondemandCacheKey("oldnavy", "camison-azul"), k, "hyphens");
  // Paying for three Apify runs to answer one question three times is
  // the exact waste the cache exists to stop.
  if (ondemand.ondemandCacheKey("target", "camison azul") === k) {
    throw new Error("different stores share a key");
  }
  if (ondemand.ondemandCacheKey("oldnavy", "jeans") === k) throw new Error("different queries share a key");
});

check("a long query cannot grow the key without bound", () => {
  const key = ondemand.ondemandCacheKey("walmart", "a".repeat(500));
  if (key.length > 100) throw new Error(`key is ${key.length} chars`);
});

check("cache freshness is six hours", () => {
  eq(ondemand.ONDEMAND_TTL_MS, 6 * 60 * 60 * 1000);
  const now = Date.now();
  const at = (ms) => new Date(now - ms).toISOString();
  eq(ondemand.ondemandCacheIsFresh(at(60 * 1000), now), true, "a minute old");
  eq(ondemand.ondemandCacheIsFresh(at(ondemand.ONDEMAND_TTL_MS - 1000), now), true, "just inside");
  eq(ondemand.ondemandCacheIsFresh(at(ondemand.ONDEMAND_TTL_MS + 1000), now), false, "just outside");
  eq(ondemand.ondemandCacheIsFresh("not a date", now), false, "garbage is never fresh");
  eq(ondemand.ondemandCacheIsFresh(undefined, now), false);
});

check("the spend cap is two runs in flight per user", () => {
  eq(ondemand.MAX_CONCURRENT_PER_USER, 2);
  eq(ondemand.canStartAnotherRun(0), true);
  eq(ondemand.canStartAnotherRun(1), true);
  eq(ondemand.canStartAnotherRun(2), false, "the third is refused");
  eq(ondemand.canStartAnotherRun(99), false);
});

check("a dead browser frees its slot on its own", () => {
  // Without an expiry, a shopper who closes the tab mid-poll would be
  // capped out forever.
  const now = Date.now();
  const record = { runs: {
    live: now - 1000,
    alsoLive: now - (ondemand.LEASE_TTL_MS - 1000),
    expired: now - (ondemand.LEASE_TTL_MS + 1000),
    ancient: now - 86400000,
    junk: "not a number",
  } };
  const alive = ondemand.liveLeases(record, now);
  eq(Object.keys(alive).sort().join(","), "alsoLive,live");
  eq(Object.keys(ondemand.liveLeases(null, now)).length, 0, "no record is no leases");
  eq(Object.keys(ondemand.liveLeases({}, now)).length, 0);
});

check("index.html mirrors the policy numbers exactly", () => {
  const html = readFileSync(root("index.html"), "utf8");
  const num = (name) => {
    const m = new RegExp(`const ${name} = (\\d+)`).exec(html);
    if (!m) throw new Error(`${name} missing from index.html`);
    return Number(m[1]);
  };
  eq(num("ON_DEMAND_THIN_RESULTS"), ondemand.THIN_RESULT_COUNT, "thin threshold");
  eq(num("ON_DEMAND_MAX_ITEMS"), ondemand.ON_DEMAND_MAX_ITEMS, "items per on-demand run");
  eq(num("ON_DEMAND_MAX_CONCURRENT"), ondemand.MAX_CONCURRENT_PER_USER, "concurrency cap");
});

check("an on-demand run goes deeper than the fan-out that came back thin", () => {
  if (!(ondemand.ON_DEMAND_MAX_ITEMS > 5)) {
    throw new Error("on-demand asks for no more than the shallow scan already did");
  }
});

check("the browser can neither pick the cache key nor fill the cache", () => {
  /* The obvious design — let the page POST what it scraped — is a cache
     poisoning hole. The key comes from what apify-scrape-START recorded
     and the contents from what apify-scrape-STATUS fetched from Apify. */
  const start = stripComments(readFileSync(root("netlify/functions/apify-scrape-start.js"), "utf8"));
  if (!/recordOndemandRun\(runId, \{ retailer, query/.test(start)) {
    throw new Error("the start call does not record what the run is for");
  }
  const status = stripComments(readFileSync(root("netlify/functions/apify-scrape-status.js"), "utf8"));
  if (!/writeOndemandCache\(meta\.retailer, meta\.query, items\)/.test(status)) {
    throw new Error("the cache is not written from the recorded key + Apify's own items");
  }
  const html = stripComments(readFileSync(root("index.html"), "utf8"));
  if (/writeOndemandCache|ondemand-cache|ondemandCacheKey/.test(html)) {
    throw new Error("the page has a way to write the shared cache");
  }
});

check("the cap is enforced server side, not only in the button", () => {
  const start = stripComments(readFileSync(root("netlify/functions/apify-scrape-start.js"), "utf8"));
  if (!/ondemandInFlight\(userKey\)/.test(start)) throw new Error("no server-side in-flight check");
  if (!/statusCode: 429/.test(start)) throw new Error("the server does not refuse an over-cap request");
  // A guard the client can skip is not a guard.
  if (!/MAX_CONCURRENT_PER_USER/.test(start)) throw new Error("the server does not use the shared cap");
});

check("a failed run still hands its slot back", () => {
  const status = stripComments(readFileSync(root("netlify/functions/apify-scrape-status.js"), "utf8"));
  const failBranch = status.slice(status.indexOf("TERMINAL_FAILURE_STATUSES.includes(status)"));
  if (!/settleOndemandRun\(runId, null\)/.test(failBranch)) {
    throw new Error("a dead run would keep its lease and cap the shopper out");
  }
});

check("on-demand results go through the same weight guards as everything else", () => {
  /* These are the least-vetted titles on the site — nobody has seen them
     before. Rendering them through a shortcut would be a live money bug. */
  const html = readFileSync(root("index.html"), "utf8");
  const fn = html.slice(html.indexOf("async function runOnDemandSearch"), html.indexOf("async function scrapeRetailerOnDemand"));
  if (!/normalizeLiveItem\(raw, \{ retailer \}\)/.test(fn)) {
    throw new Error("on-demand results bypass normalizeLiveItem, and with it the beauty table and the category bands");
  }
  // The same titles that P1.5 covers, answered the same way.
  eq(estimateWeightDetail("5G WiFi Bluetooth Projector 1080P").kg, 2.97, "the 5G bug stays fixed for on-demand titles");
  eq(estimateWeightDetail("Dior Sauvage Eau de Toilette 100ml").kg, 0.35);
});

check("the category search bar that called nothing now exists", () => {
  // Its input and button both called catalogSearchSubmit() and the
  // function was never defined — Enter threw a ReferenceError and did
  // nothing. It is the entry point the upsell needs a query FROM.
  const html = readFileSync(root("index.html"), "utf8");
  if (!/function catalogSearchSubmit\(\)/.test(html)) throw new Error("catalogSearchSubmit is still undefined");
  const refs = (html.match(/catalogSearchSubmit\(\)/g) || []).length;
  if (refs < 3) throw new Error(`expected the definition plus both call sites, found ${refs}`);
});

/* ------------------------------------------------------------------
   P1.6 — the Apify burn.
   ------------------------------------------------------------------ */
group("P1.6 Apify spend controls");

check("browsing never starts an Apify run", () => {
  /* THE $88 BUG. Ofertas ran a twelve-actor live scan from the VISITOR'S
     browser whenever the cache was stale — which, with a daily refresh
     against a 6h TTL, was most of the day. */
  const html = readFileSync(root("index.html"), "utf8");
  const code = stripComments(html);
  if (/revalidateSalesInBackground/.test(code)) throw new Error("the background rescan is back");
  if (/showSalesColdLoading/.test(code)) throw new Error("the cold-scan loading state is back");
  // liveSalesScan survives for exactly one caller: the admin's explicit
  // "Actualizar ofertas" button. Anything else is a visitor paying.
  const callers = (code.match(/liveSalesScan\(\)/g) || []).length;
  if (callers > 2) throw new Error(`liveSalesScan has ${callers} references; only the admin button may call it`);
  const loader = code.slice(code.indexOf("async function runSalesScan"), code.indexOf("function discountPct"));
  if (/liveSalesScan/.test(loader)) throw new Error("the Ofertas loader still scrapes");
});

check("three tiers, three clocks, and the workflow agrees with them", () => {
  const yml = readFileSync(root(".github/workflows/refresh-sales-cache.yml"), "utf8");
  const crons = [...yml.matchAll(/- cron: "([^"]+)"/g)].map((m) => m[1]);
  eq(crons.length, 3, "one cron per tier");
  for (const tier of Object.values(refreshTiers.REFRESH_TIERS)) {
    if (!crons.includes(tier.cron)) throw new Error(`${tier.key} cron "${tier.cron}" is not in the workflow`);
    eq(refreshTiers.tierForCron(tier.cron), tier.key, `cron maps back to ${tier.key}`);
  }
  eq(refreshTiers.REFRESH_TIERS.sale.cadence, "daily");
  eq(refreshTiers.REFRESH_TIERS.catalog.cadence, "every 3 days");
  eq(refreshTiers.REFRESH_TIERS.auto.cadence, "weekly (Monday)");
});

check("no Apify-side schedules are created", () => {
  // The GitHub workflow is the only scheduler, on purpose: one place to
  // look when spend moves, one place to change it.
  for (const f of ["netlify/functions/apify-scrape-start.js", "scripts/refresh-sales-cache.js"]) {
    const src = stripComments(readFileSync(root(f), "utf8"));
    if (/actor-schedules|\/v2\/schedules/.test(src)) throw new Error(`${f} creates an Apify-side schedule`);
  }
});

check("a cycle over budget skips the non-essential tiers, loudly", () => {
  const tight = { costPerRun: 0.06, budgetUsd: 0.5 };
  const sale = refreshTiers.spendDecision("sale", tight);
  eq(sale.allowed, true, "Ofertas is essential and still runs");
  eq(sale.overBudget, true, "but it says so");
  if (!/SOBRE PRESUPUESTO/.test(sale.reason)) throw new Error("the overage is not announced");
  for (const key of ["catalog", "auto"]) {
    const d = refreshTiers.spendDecision(key, tight);
    eq(d.allowed, false, `${key} yields`);
    if (!/SOBRE PRESUPUESTO/.test(d.reason)) throw new Error(`${key} skipped silently — the exact $88 failure mode`);
  }
});

check("a cycle inside budget runs everything, quietly", () => {
  const roomy = { costPerRun: 0.06, budgetUsd: 10 };
  for (const key of ["sale", "catalog", "auto"]) {
    const d = refreshTiers.spendDecision(key, roomy);
    eq(d.allowed, true, key);
    eq(d.reason, null, `${key} says nothing when nothing is wrong`);
  }
});

check("the projection uses the TOP of the observed cost range", () => {
  // A spend guard that under-projects is not a guard.
  eq(refreshTiers.DEFAULT_COST_PER_RUN_USD, 0.06);
  eq(refreshTiers.projectedCostUsd("sale", 0.06), 0.72);
  eq(refreshTiers.projectedCostUsd("catalog", 0.06), 1.26);
});

check("every refresh script is guarded before it spends", () => {
  for (const [file, tier] of [
    ["scripts/refresh-sales-cache.js", "sale"],
    ["scripts/refresh-department-cache.js", "catalog"],
    ["scripts/refresh-auto-cache.js", "auto"],
  ]) {
    const src = stripComments(readFileSync(root(file), "utf8"));
    if (!new RegExp(`guardSpend\\("${tier}"\\)`).test(src)) throw new Error(`${file} does not guard its spend`);
  }
});

/* ------------------------------------------------------------------
   PAGE / MODULE PARITY — the whole reason this harness exists.
   ------------------------------------------------------------------ */
group("index.html mirrors agree with the modules");

const PARITY_CORPUS = [
  ...BRIEF_TABLE.map(([, title]) => title),
  "Labial mate rojo", "Perfume Carolina Herrera Good Girl 80ml",
  "Victoria's Secret Bombshell Fragrance Mist 250ml",
  "Nike Air Force 1 Low Men's", "Jordan AJ 1 Retro High", "New Balance 204L",
  "Reef Men's Sandals", "Crocs Classic Clog", "Toddler Nike Revolution",
  "Rawlings Official League Baseball", "Titleist Golf Balls (12 pack)",
  "Wilson NCAA Basketball", "Franklin Soccer Goal 12 x 6FT",
  "Mainstay 4-Shelf TV Stand", "Queen Size Mattress", "6 Drawer Dresser",
  "Samsung 55\" QLED 4K Smart TV", "Roku 40\" Smart TV with Voice Remote",
  "4ft HDMI Cable for TV", "Apple AirPods Max 2 - Starlight",
  "Great Value Gummy Bears Chewy Candy, 4 oz", "BUBS Swedish Candy 10 oz",
  "Levi's 501 Original Fit Jeans", "Hanes Men's Crewneck T-Shirt",
  "Optimum Nutrition Whey Protein Powder, 2 lb",
  "Nature Made Vitamin D3 250 Count Tablets",
  "Queen Comforter Set", "Blackout Curtains 84 inch",
  "Agility Ladder 20 ft Speed Training",
];

check(`estimateRetailWeightKg matches the module for all ${PARITY_CORPUS.length} corpus titles`, () => {
  const drift = [];
  for (const title of PARITY_CORPUS) {
    const pageKg = page.estimateRetailWeightKg(title);
    const moduleKg = estimateWeightDetail(title).kg;
    if (pageKg !== moduleKg) drift.push(`${title}: page ${pageKg} vs module ${moduleKg}`);
  }
  if (drift.length) throw new Error(drift.join("\n      "));
});

check("the estimate SOURCE agrees too, not just the number", () => {
  const drift = [];
  for (const title of PARITY_CORPUS) {
    const a = page.estimateRetailWeightDetail(title, {}).source;
    const b = estimateWeightDetail(title).source;
    if (a !== b) drift.push(`${title}: page "${a}" vs module "${b}"`);
  }
  if (drift.length) throw new Error(drift.join("\n      "));
});

check("the beauty table is mirrored row for row", () => {
  eq(page.BEAUTY_FALLBACK_KG.length, beauty.BEAUTY_FALLBACK_KG.length, "row count");
  page.BEAUTY_FALLBACK_KG.forEach((row, i) => {
    const mod = beauty.BEAUTY_FALLBACK_KG[i];
    eq(row.key, mod.key, `row ${i} key`);
    eq(row.kg, mod.kg, `row ${i} kg`);
    eq(String(row.match), String(mod.match), `row ${i} pattern`);
  });
  eq(page.MAX_FRAGRANCES_PER_SHIPMENT, beauty.MAX_FRAGRANCES_PER_SHIPMENT);
});

/* ------------------------------------------------------------------
   P1.3 — retailers.
   ------------------------------------------------------------------ */
group("P1.3 retailers");

check("Sephora and Victoria's Secret are real registry rows", () => {
  for (const key of ["sephora", "victoriassecret"]) {
    const r = RETAILERS[key];
    if (!r) throw new Error(`${key} missing from the registry`);
    if (!r.label || !r.color || !r.tagline) throw new Error(`${key} is missing display data`);
    eq(isBeautyRetailer(key), true, `${key} is a beauty catalogue`);
  }
});

check("a store with no scraper stays out of the live search fan-out", () => {
  const searchable = searchableRetailers();
  for (const key of ["walmart", "target", "oldnavy", "footlocker"]) {
    if (!searchable.includes(key)) throw new Error(`${key} should be searchable`);
  }
  for (const key of ["sephora", "victoriassecret", "autozone", "bestbuy", "nordstrom"]) {
    if (searchable.includes(key)) throw new Error(`${key} should not be in the general search fan-out`);
  }
});

check("index.html's registry mirror matches the module", () => {
  const html = readFileSync(root("index.html"), "utf8");
  for (const r of Object.values(RETAILERS)) {
    if (!html.includes(`key: '${r.key}'`)) throw new Error(`${r.key} missing from the index.html mirror`);
    if (!html.includes(r.color)) throw new Error(`${r.key}'s colour ${r.color} missing from the index.html mirror`);
  }
});

check("adding a retailer needs no new scraper code", async () => {
  // The point of INPUT_SHAPES: a new store declares a spelling, not a function.
  const src = readFileSync(root("netlify/functions/apify-scrape-start.js"), "utf8");
  if (!src.includes("INPUT_SHAPES")) throw new Error("INPUT_SHAPES missing");
  if (!src.includes("config.inputShape")) throw new Error("the handler does not honour inputShape");
});

/* ------------------------------------------------------------------
   P1.4 — the small-order fee, at the boundary.
   ------------------------------------------------------------------ */
group("P1.4 small-order fee");

check("the threshold and the fee are the brief's numbers", () => {
  eq(SMALL_ORDER_THRESHOLD_PEN, 50);
  eq(SMALL_ORDER_FEE_PEN, 10);
});

check("the fee applies strictly below S/ 50 and never at or above it", () => {
  eq(smallOrderFeePen(0), 0, "an empty basket is not a small order");
  eq(smallOrderFeePen(0.01), 10);
  eq(smallOrderFeePen(30), 10);
  eq(smallOrderFeePen(49.99), 10, "just under the threshold");
  eq(smallOrderFeePen(50), 0, "exactly at the threshold — no fee");
  eq(smallOrderFeePen(50.01), 0);
  eq(smallOrderFeePen(500), 0);
});

check("a bad subtotal never invents a fee", () => {
  eq(smallOrderFeePen(null), 0);
  eq(smallOrderFeePen(undefined), 0);
  eq(smallOrderFeePen(NaN), 0);
  eq(smallOrderFeePen(-5), 0);
});

check("the fee is config, never inlined in a template", () => {
  for (const file of ["index.html", "checkout.html"]) {
    const code = stripComments(readFileSync(root(file), "utf8"));
    // The one place each page is allowed to state the numbers is its
    // mirrored config block (index.html) or its import (checkout.html).
    const literalRows = code.split("\n").filter((l) => /Pedido peque/.test(l) && /S\/\s*10/.test(l));
    if (literalRows.length) throw new Error(`${file} hardcodes the fee amount in copy: ${literalRows[0].trim()}`);
  }
});

check("the server recomputes the fee rather than trusting the browser", () => {
  const src = readFileSync(root("netlify/functions/orders-create.js"), "utf8");
  if (!src.includes("smallOrderFeePen(productsPen)")) {
    throw new Error("orders-create.js does not recompute the fee from the real subtotal");
  }
});

/* ------------------------------------------------------------------
   P2.2 / P2.3 — category tiles.
   ------------------------------------------------------------------ */
group("P2.2 / P2.3 category tiles");

const tiles = loadPageTileSlice();

check("category tiles carry no retailer logos at all", () => {
  /* Reversed 2026-09-20: the cap (3 logos + "+N") is gone because the
     logos are gone. A category tile answers "what is this", not "who
     sells it" — the store is named on every product card, in the store
     chips and on Tiendas. */
  const html = readFileSync(root("index.html"), "utf8");
  const tile = html.slice(html.indexOf("function deptTileHTML"), html.indexOf("function handleDeptThumbError"));
  if (/retailerBadgeHTML|tileRetailerRowHTML|TILE_MAX_LOGOS/.test(tile)) {
    throw new Error("the category tile still renders store marks");
  }
  if (!/producto\$\{count === 1/.test(tile)) throw new Error("the product count was dropped with the logos");
});

check("tiles fit the image rather than cropping it", () => {
  const html = readFileSync(root("index.html"), "utf8");
  const tile = html.slice(html.indexOf("function deptTileHTML"), html.indexOf("function handleDeptThumbError"));
  if (/object-cover/.test(tile)) throw new Error("the tile still crops with object-cover");
  if (!/object-fit:contain/.test(tile)) throw new Error("the tile does not contain-fit its image");
  if (!/object-position:center/.test(tile)) throw new Error("the tile image is not centred");
});

check("selection prefers the face of a category over its peripherals", () => {
  const better = (key, win, lose) => {
    const a = tiles.scoreTileCandidate(win, key);
    const b = tiles.scoreTileCandidate(lose, key);
    if (!(a > b)) throw new Error(`${key}: "${win}" (${a}) should outrank "${lose}" (${b})`);
  };
  better("electronics", 'TCL 55" QLED 4K Smart TV', "Sanus Full-Motion TV Wall Mount");
  better("electronics", 'TCL 55" QLED 4K Smart TV', "6ft HDMI Cable, Black");
  better("pharmacy", "Nature Made Multivitamin Tablets - 120ct", "Celsius Sparkling Energy Drink 12 oz");
  better("sporting_goods", "Spalding NBA Street Basketball", "Johnson & Johnson First Aid Kit, 140 pieces");
  better("home_goods", "Queen Comforter Set, Microfiber", "LANE LINEN 24 Pack Bulk Dish Towels for Kitchen");
  better("candy_chocolate", "M&M'S Milk Chocolate Candy, Party Size", "Assorted Variety Pack Candy Bundle");
  better("women", "Floral Midi Dress", "Replacement Bra Strap Extender, 3 Pack");
});

check("a bare count is not treated as a multipack", () => {
  // Penalising "90ct" ranked a weight-loss pill above a multivitamin.
  const vit = tiles.scoreTileCandidate("OLLY Women's Multivitamin Gummies - Berry - 90ct", "pharmacy");
  const pill = tiles.scoreTileCandidate("PharmaPure Sugar Blocker Weight Loss Supplement, 90 Capsules", "pharmacy");
  if (!(vit > pill)) throw new Error(`multivitamin (${vit}) should outrank the weight-loss pill (${pill})`);
});

check("a pinned image overrides scoring entirely", () => {
  const candidates = [{ title: 'TCL 55" QLED 4K Smart TV', image: "scraped.jpg" }];
  eq(tiles.pickTileImage("electronics", candidates), "scraped.jpg", "unpinned");
  tiles.CATEGORY_IMAGE_PIN.electronics = "assets/category/electronics.jpg";
  eq(tiles.pickTileImage("electronics", candidates), "assets/category/electronics.jpg", "pinned");
  // A pin works even when there is nothing scraped at all.
  eq(tiles.pickTileImage("electronics", []), "assets/category/electronics.jpg", "pinned with no candidates");
  delete tiles.CATEGORY_IMAGE_PIN.electronics;
});

check("a candidate with no image never wins", () => {
  eq(tiles.pickTileImage("electronics", [{ title: 'TCL 55" TV', image: "" }, { title: "USB Cable", image: "c.jpg" }]), "c.jpg");
  eq(tiles.pickTileImage("electronics", []), null);
});

check("Ofertas is a designed tile, not a scraped product image", () => {
  const html = readFileSync(root("index.html"), "utf8");
  if (!/function ofertasTileArtHTML/.test(html)) throw new Error("the Ofertas tile art is missing");
  const art = html.slice(html.indexOf("function ofertasTileArtHTML"), html.indexOf("function deptTileHTML"));
  if (!/ariaNavyBand/.test(art)) throw new Error("the Ofertas tile is not on the Precio Honesto navy field");
  if (!/Precio Honesto/.test(art)) throw new Error("the Ofertas tile does not carry the Precio Honesto language");
  const tile = html.slice(html.indexOf("function deptTileHTML"), html.indexOf("function handleDeptThumbError"));
  if (!/ofertasTileArtHTML\(\)/.test(tile)) throw new Error("deptTileHTML does not use it");
});

/* ------------------------------------------------------------------
   P2.1 — Nosotros copy.
   ------------------------------------------------------------------ */
group("P2.1 Nosotros copy");

check("the daughter line appears once, as the headline", () => {
  const html = readFileSync(root("index.html"), "utf8");
  const about = html.slice(html.indexOf('<div id="aboutView"'), html.indexOf('<div id="returnsView"'));
  const prose = about.replace(/<!--[\s\S]*?-->/g, "");
  const hits = prose.match(/Aria lleva el nombre de mi hija/g) || [];
  eq(hits.length, 1, "occurrences of the daughter line");
  if (!/<h2[^>]*>\s*\n?\s*Aria lleva el nombre de mi hija\./.test(prose)) {
    throw new Error("the surviving occurrence is not the headline");
  }
});

check("the body and Nuestro porqué open on the lines the brief specifies", () => {
  const html = readFileSync(root("index.html"), "utf8");
  const about = html.slice(html.indexOf('<div id="aboutView"'), html.indexOf('<div id="returnsView"'));
  const prose = about.replace(/<!--[\s\S]*?-->/g, "");
  if (!/>\s*\n?\s*Nació como una promesa: que ningún peruano vuelva a pagar de más/.test(prose)) {
    throw new Error("the story body does not open on 'Nació como una promesa…'");
  }
  if (!/>\s*\n?\s*Es para ella\. Para que crezca en un mundo donde la honestidad sea/.test(prose)) {
    throw new Error("'Nuestro porqué' does not open on 'Es para ella…'");
  }
});

check("the sign-off the brief put out of scope is untouched", () => {
  const html = readFileSync(root("index.html"), "utf8");
  // It was never on the page; this asserts nobody added it by accident.
  if (/Soy el papá de Aria/.test(html)) throw new Error("the deferred sign-off was added");
});


/* ------------------------------------------------------------------
   FOLLOW-UPS TO THE BIG BATCH (2026-09-20), all five reported live.
   ------------------------------------------------------------------ */
group("follow-up 1: the Flete alto badge fires only at 0.50");

check("the badge is measured against the price the card prints", () => {
  // Over the $200 import-tax threshold the card prints 23% more than the
  // scrape did. Dividing by the raw figure was giving the badge a
  // smaller denominator than the shopper's own arithmetic.
  eq(itemWeight.shownPriceUsd(199), 199, "under the threshold, unchanged");
  eq(itemWeight.shownPriceUsd(200), 200, "at the threshold, unchanged");
  eq(itemWeight.shownPriceUsd(250), 307.5, "over the threshold, tax included");
  for (const usd of [5, 60, 199.99, 200, 200.01, 250, 1000]) {
    eq(page.displayPriceUsd(usd), itemWeight.shownPriceUsd(usd), `page mirror at $${usd}`);
  }
  // 10 kg is $130 of freight: 52% of $250, but only 42% of the $307.50
  // the card shows. The shopper's number is the one that decides.
  eq(itemWeight.freightIsHigh(10, 250, 13), false, "not high against the printed price");
  eq(page.freightSharePct(10, 250) > page.FREIGHT_BADGE_SHARE, false, "page agrees");
  eq(
    Math.round(page.freightSharePct(10, 250) * 1000),
    Math.round(itemWeight.freightShare(10, 250, 13) * 1000),
    "page and module compute the same share",
  );
});

check("the reported Hello Kitty T-shirt carries no badge", () => {
  /* LIVE REPORT: S/ 25.29 product, S/ 10.07 freight — 39.8%, comfortably
     under the 0.50 line, and it was wearing "Flete alto" anyway. The
     ratio is currency-free, so the sole figures are reproduced exactly
     by picking the dollar price that yields the same share. */
  const kg = estimateWeightDetail("Hello Kitty and Friends Girls T-Shirt").kg;
  const freight = itemWeight.freightUsd(kg, 13);
  const priceUsd = freight * (25.29 / 10.07);        // the reported ratio
  const share = page.freightSharePct(kg, priceUsd);
  if (Math.abs(share - 10.07 / 25.29) > 0.002) {
    throw new Error(`share drifted from the reported 39.8%: ${share}`);
  }
  eq(share > page.FREIGHT_BADGE_SHARE, false, "no badge at 40%");
  eq(itemWeight.freightIsHigh(kg, priceUsd, 13), false, "module agrees");
  // And the line it must fire on, either side of exactly 50%.
  eq(itemWeight.freightIsHigh(kg, freight / 0.5, 13), false, "exactly 50% — no badge");
  eq(itemWeight.freightIsHigh(kg, freight / 0.4999, 13), false, "just under 50%");
  eq(itemWeight.freightIsHigh(kg, freight / 0.5001, 13), true, "just over 50%");
});

check("no threshold other than the two named ones is left in the badge path", () => {
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const card = src.slice(src.indexOf("function productCardHTML("), src.indexOf("function renderSalesGrid("));
  if (/0\.3\b|\b30\s*%/.test(card)) throw new Error("a stray 30% threshold is back in the card");
  if (!/FREIGHT_BADGE_SHARE/.test(card)) throw new Error("the card stopped reading the named constant");
});

group("follow-up 2: $13/kg is the customer-facing rate, and stays");

check("every customer-facing copy of the rate is 13", () => {
  eq(chargePerKg, 13, "weight-data.js, the module checkout imports");
  eq(page.CHARGE_PER_KG_USD, 13, "index.html");
  eq(salesSources.CHARGE_PER_KG_USD, 13, "scripts/lib/sales-sources.js");
  const cache = readFileSync(root("netlify/functions/sales-cache.js"), "utf8");
  if (!/const CHARGE_PER_KG_USD = 13;/.test(cache)) throw new Error("sales-cache.js drifted off 13");
});

check("the freight line still shows the rate to the shopper", () => {
  const html = readFileSync(root("index.html"), "utf8");
  // The per-item card and the cart total both spell the arithmetic out.
  if (!/kg × \$\$\{CHARGE_PER_KG_USD\}\/kg/.test(html)) {
    throw new Error("the card's '× $13/kg' freight line is gone");
  }
  if (!/kg × \$\$\{CHARGE_PER_KG_USD\}\/kg`/.test(html)) {
    throw new Error("the cart total's '× $13/kg' line is gone");
  }
  // The one place the rate is prose rather than interpolated. It cannot
  // read the constant (it is declared thousands of lines later and the
  // array is built at load), so this is what keeps the two in step.
  if (!/kilos × \$13\/kg/.test(html)) {
    throw new Error("the Precio Honesto promise no longer states $13/kg");
  }
});

check("the internal contract cost never reaches a browser", () => {
  /* $9/kg is what the courier charges US; $13/kg is what the shopper
     pays. Every file the browser downloads is walked from the two HTML
     entry points, so a new import cannot quietly widen the set. */
  const seen = new Set();
  const queue = ["index.html", "checkout.html"];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const src = readFileSync(root(rel), "utf8");
    for (const m of src.matchAll(/from\s+["'](\.\/[^"']+)["']|src=["'](\.\/[^"']+)["']/g)) {
      const dep = (m[1] || m[2]).replace(/^\.\//, "");
      queue.push(dep);
    }
  }
  if (seen.size < 4) throw new Error(`the browser-served walk found only ${seen.size} files — the matcher broke`);
  for (const rel of seen) {
    /* Comments are stripped first: weight-data.js's own header explains
       at length why COST_PER_KG left, and that explanation is the reason
       nobody puts it back. A named figure in prose is the thing to
       forbid; the word in a warning is not. */
    const src = stripComments(readFileSync(root(rel), "utf8"));
    if (/COST_PER_KG|PROFIT_PER_KG|AVI_COST_PER_KG|AVI_PROFIT_PER_KG/.test(src)) {
      throw new Error(`${rel} references the internal courier economics`);
    }
    if (/\$\s?9\s?\/\s?kg|9 USD\/kg|\$\s?4\s?\/\s?kg/.test(src)) {
      throw new Error(`${rel} prints an internal per-kg figure`);
    }
  }
  // And the server-only module is still server-only.
  const econ = root("netlify/functions/_courier-economics.js");
  if (!/COST_PER_KG/.test(readFileSync(econ, "utf8"))) {
    throw new Error("the internal economics module moved — re-point this guard");
  }
});

group("follow-up 3: a colouring book is not a kilo of paper");

check("the reported 64-page colouring book", () => {
  const title = "Hello Kitty and Friends Coloring Book, 64 Pages";
  const d = estimateWeightDetail(title);
  eq(d.source, "category", "it has a real row now, not the generic guess");
  eq(d.reviewKind, null, "and so it is no longer a gap");
  eq(d.bound, "libro", "judged against the book band");
  if (!(d.kg > 0 && d.kg <= 0.3)) throw new Error(`a colouring book came out at ${d.kg} kg`);
  // The live figure: 1.08 kg, which produced S/ 47.29 of freight on a
  // S/ 4.48 book. The band is what catches it.
  const sanity = itemWeight.weightSanity(title, 1.08);
  eq(sanity.outOfBand, true, "1.08 kg is refused for a colouring book");
  eq(sanity.key, "libro");
  eq(page.weightSanity(title, 1.08).outOfBand, true, "page mirror refuses it too");
  // Freight on the believed weight, against the freight on the old guess.
  const now = itemWeight.freightUsd(d.kg, 13);
  if (!(now < itemWeight.freightUsd(1.08, 13) / 3)) {
    throw new Error(`the quote barely moved: $${now}`);
  }
});

check("the book tiers are banded by kind of book", () => {
  const band = (t) => itemWeight.bookBandKg(t);
  eq(JSON.stringify(band("Hello Kitty Coloring Book")), JSON.stringify([0.05, 0.6]));
  eq(JSON.stringify(band("The Silent Patient Paperback")), JSON.stringify([0.1, 1.2]));
  eq(JSON.stringify(band("Joy of Cooking Hardcover")), JSON.stringify([0.3, 3.5]));
  // A textbook at 2.5 kg is fine; a paperback at 2.5 kg is not.
  eq(itemWeight.weightSanity("Campbell Biology Textbook Hardcover", 2.5).outOfBand, false);
  eq(itemWeight.weightSanity("The Silent Patient Paperback", 2.5).outOfBand, true);
});

check("things that merely contain the word 'book' are not books", () => {
  for (const t of ["JanSport Book Bag Backpack", "5 Shelf Bookcase", "MacBook Air 13-inch", "Magnetic Bookmark Set"]) {
    eq(itemWeight.bookTierFor(t), null, t);
  }
  // …and none of them lost the row it used to have.
  eq(itemWeight.bandFor("5 Shelf Bookcase").key, "muebles");
});

check("the page mirrors the book table row for row", () => {
  eq(page.BOOK_TIERS.length, itemWeight.BOOK_TIERS.length, "row count");
  itemWeight.BOOK_TIERS.forEach((row, i) => {
    const mirror = page.BOOK_TIERS[i];
    eq(mirror.key, row.key, `row ${i} key`);
    eq(mirror.kg, row.kg, `row ${i} kg`);
    eq(String(mirror.match), String(row.match), `row ${i} regex`);
    eq(JSON.stringify(mirror.bandKg), JSON.stringify(row.bandKg), `row ${i} band`);
  });
  eq(JSON.stringify(page.BOOK_DEFAULT), JSON.stringify(itemWeight.BOOK_DEFAULT), "default row");
  for (const t of ["Hello Kitty Coloring Book", "Joy of Cooking Hardcover", "Composition Notebook 100 Sheets"]) {
    eq(page.bookWeightKg(t), itemWeight.bookWeightKg(t), t);
  }
});

group("follow-up 4: no internal labels on the storefront");

check("the BETA pill is gone from Aria Smart Search", () => {
  const html = readFileSync(root("index.html"), "utf8");
  const prose = html.replace(/<!--[\s\S]*?-->/g, "");
  if (/BETA/.test(prose)) throw new Error("a BETA label is still rendered");
  if (!/Aria Smart Search/.test(prose)) throw new Error("the row itself was removed with it");
});

group("follow-up 5: Spanish in, English out, before the retailer sees it");

check("the reported query", () => {
  eq(translate.translateSearchQuery("celular"), "cell phone");
  eq(pageQuery.translateSearchQuery("celular"), "cell phone", "page mirror");
  eq(translate.translateSearchQuery("celulares"), "cell phone", "plurals fall back to the singular");
  eq(translate.translateSearchQuery("CELULAR"), "cell phone", "case");
});

check("the words the brief named, and the ones a shopper actually types", () => {
  const cases = [
    ["zapatillas", "sneakers"],
    ["cartera", "handbag"],
    ["audífonos", "headphones"],
    ["televisor", "tv"],
    ["chompa", "sweater"],
    ["juguetes", "toy"],
    ["plancha de cabello", "hair straightener"],
    ["audifonos inalambricos", "wireless earbuds"],
    ["zapatillas negras para hombre", "sneakers black mens"],
    ["chompa para mujer", "sweater womens"],
  ];
  for (const [es, en] of cases) {
    eq(translate.translateSearchQuery(es), en, es);
    eq(pageQuery.translateSearchQuery(es), en, `${es} (page)`);
  }
});

check("a phrase beats its own words", () => {
  // "plancha" alone is a clothes iron; the phrase is a hair straightener.
  eq(translate.translateSearchQuery("plancha"), "plancha", "no row for the bare word, so untouched");
  eq(translate.translateQuery("plancha de cabello").query, "hair straightener");
});

check("anything we do not recognise goes out exactly as typed", () => {
  for (const q of ["The North Face jacket", "iPhone 15 Pro Max 256GB", "Levi's 501", "PS5 DualSense", "nintendo switch oled"]) {
    eq(translate.translateSearchQuery(q), q, q);
    eq(pageQuery.translateSearchQuery(q), q, `${q} (page)`);
    eq(translate.translateQuery(q).translated, false, `${q} reports no translation`);
  }
});

check("translating twice changes nothing", () => {
  // scrapeRetailer() translates, and the chat path has already translated
  // once before it gets there.
  for (const q of ["celular", "plancha de cabello", "The North Face jacket", "zapatillas negras"]) {
    const once = translate.translateSearchQuery(q);
    eq(translate.translateSearchQuery(once), once, q);
  }
});

check("every query that leaves for a retailer is translated first", () => {
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const calls = src.match(/fetch\('\/\.netlify\/functions\/apify-scrape-start'[\s\S]{0,400}?\}\);/g) || [];
  if (calls.length !== 2) throw new Error(`expected 2 scrape entry points, found ${calls.length}`);
  for (const call of calls) {
    if (!/query: translateSearchQuery\(/.test(call)) {
      throw new Error("a scrape call sends the raw Spanish query to the retailer");
    }
  }
  // The old word-by-word table is gone, not shadowed by the new one.
  if (/SPANISH_SYNONYMS\s*[=\[]/.test(src)) throw new Error("the old synonym table is still live");
});

check("the page mirrors the whole vocabulary", () => {
  eq(
    Object.keys(pageQuery.ES_EN_WORDS).length,
    Object.keys(translate.ES_EN_WORDS).length,
    "single-word row count",
  );
  for (const [es, en] of Object.entries(translate.ES_EN_WORDS)) {
    eq(pageQuery.ES_EN_WORDS[es], en, es);
  }
  eq(pageQuery.ES_EN_PHRASES.length, translate.ES_EN_PHRASES.length, "phrase row count");
  translate.ES_EN_PHRASES.forEach(([es, en], i) => {
    eq(pageQuery.ES_EN_PHRASES[i][0], es, `phrase ${i} key`);
    eq(pageQuery.ES_EN_PHRASES[i][1], en, `phrase ${i} value`);
  });
});


/* ------------------------------------------------------------------
   STORE LOGOS — the retailer's art, rendered as they published it.
   ------------------------------------------------------------------ */
group("store logos on Tiendas");

check("every logo a store row names actually exists", () => {
  for (const r of Object.values(RETAILERS)) {
    if (!r.logo) continue;
    if (!existsSync(root(r.logo))) throw new Error(`${r.key} points at a missing file: ${r.logo}`);
  }
});

check("a real logo is never greyed out, however pending the store", () => {
  /* The muted plate and the "Conectando el catálogo" badge are how a
     card says the catalogue is still being wired up. Greying the logo
     with them would ship Victoria's Secret's pink and Bath & Body
     Works' blue as grey — a retailer's mark is not ours to recolour. */
  const src = readFileSync(root("index.html"), "utf8");
  for (const fn of ["function storeCardHTML(", "function homeStoreChipHTML("]) {
    const from = src.indexOf(fn);
    if (from < 0) throw new Error(`${fn} is gone`);
    // Comments first: the note explaining why the filter is gone names
    // it in prose, and prose is not code.
    const body = stripComments(src.slice(from, src.indexOf("\n}", from)))
      .replace(/<!--[\s\S]*?-->/g, "");
    for (const m of body.matchAll(/grayscale\(1\)/g)) {
      const guard = body.slice(Math.max(0, m.index - 120), m.index);
      if (!/pending && !r\.logo/.test(guard)) {
        throw new Error(`${fn} greys out a real logo file`);
      }
    }
  }
});

check("every store mark is contain-fit and capped, never stretched", () => {
  const src = readFileSync(root("index.html"), "utf8");
  // Each <img> that draws a store mark: a height cap, a width cap, and
  // contain — which is what lets a 1200x631 banner and a square file
  // share a tile without either being distorted.
  const imgs = src.match(/<img src="\$\{r\.logo\}"[\s\S]{0,320}?>/g) || [];
  if (imgs.length !== 2) throw new Error(`expected 2 store-mark <img> tags, found ${imgs.length}`);
  for (const img of imgs) {
    if (!/object-fit:\s*contain/.test(img)) throw new Error("a store mark is not contain-fit");
    if (!/max-height:\s*\d+px/.test(img)) throw new Error("a store mark has no height cap");
    if (!/max-width:\s*\d+px/.test(img)) throw new Error("a store mark has no width cap");
    if (/\bfilter:/.test(img)) throw new Error("a store mark carries a CSS filter");
    // Never a bare width/height, which would ignore the file's own ratio.
    if (/style="[^"]*[;\s]height:\s*\d/.test(img)) throw new Error("a store mark sets a fixed height");
    if (!/onerror=/.test(img)) throw new Error("a store mark has no fallback if the file is missing");
  }
});

check("the three beauty stores are still listed and still honest", () => {
  for (const key of ["sephora", "victoriassecret", "bathandbodyworks"]) {
    const r = RETAILERS[key];
    if (!r) throw new Error(`${key} left the registry`);
    eq(r.search, false, `${key} is still pending`);
    eq(r.pendingNote, "Conectando el catálogo", `${key} status badge`);
  }
});

/* ------------------------------------------------------------------ */
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.log(`  FAIL  ${f}\n`);
process.exit(failures.length ? 1 : 0);

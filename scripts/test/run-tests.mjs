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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadPageWeightSlice, loadPageTileSlice } from "./_page-script.mjs";

import * as beauty from "../lib/beauty-weight.js";
import * as itemWeight from "../lib/item-weight.js";
import { estimateWeightDetail, categoryWeightKg } from "../lib/sales-sources.js";
import * as salesSources from "../lib/sales-sources.js";
import { resolveItemWeight, resolveCartWeights } from "../../netlify/functions/_weight-resolve.js";
import { smallOrderFeePen, SMALL_ORDER_FEE_PEN, SMALL_ORDER_THRESHOLD_PEN } from "../../weight-data.js";
import { RETAILERS, searchableRetailers, isBeautyRetailer } from "../lib/retailers.js";

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
  // A 74 kg dresser at $1,200: ~$965 of freight, 60% of the price.
  const heavy = deal("6 Drawer Dresser", 1200, 2000);
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
  if (!deal("6 Drawer Dresser", 1200, 2000)) throw new Error("the same product is featurable at a price that carries the freight");
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

check("the page applies both Ofertas rules on both load paths", () => {
  const html = readFileSync(root("index.html"), "utf8");
  for (const fn of ["passesOfertasWeightGate", "passesOfertasFreightCeiling", "passesOfertasGate"]) {
    if (!new RegExp(`function ${fn}`).test(html)) throw new Error(`${fn} is missing`);
  }
  const uses = (html.match(/\.filter\(passesOfertasGate\)/g) || []).length;
  if (uses < 2) throw new Error(`the gate is applied ${uses} time(s); both the cache and the live path need it`);
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

check("a tile shows at most 3 logos and counts the rest", () => {
  const html = readFileSync(root("index.html"), "utf8");
  if (!/const TILE_MAX_LOGOS = 3;/.test(html)) throw new Error("TILE_MAX_LOGOS is not 3");
  if (!/slice\(0, TILE_MAX_LOGOS\)/.test(html)) throw new Error("the logo row does not cap the list");
  if (!/\+\$\{hidden\}/.test(html)) throw new Error('the "+N" badge is missing');
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

/* ------------------------------------------------------------------ */
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.log(`  FAIL  ${f}\n`);
process.exit(failures.length ? 1 : 0);

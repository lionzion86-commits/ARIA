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
import { loadPageWeightSlice, loadPageTileSlice, loadPageQuerySlice, loadPageShippingSlice, loadPageSupportSlice, loadPageFeeSlice, loadPageFitmentSlice, loadPageAutoSourcesSlice } from "./_page-script.mjs";

import * as beauty from "../lib/beauty-weight.js";
import * as itemWeight from "../lib/item-weight.js";
import { estimateWeightDetail, categoryWeightKg } from "../lib/sales-sources.js";
import * as salesSources from "../lib/sales-sources.js";
import { resolveItemWeight, resolveCartWeights } from "../../netlify/functions/_weight-resolve.js";
import { smallOrderFeePen, SMALL_ORDER_FEE_PEN, SMALL_ORDER_THRESHOLD_PEN, SMALL_ORDER_FEE_NOTE } from "../../weight-data.js";
import { RETAILERS, searchableRetailers, isBeautyRetailer } from "../lib/retailers.js";
import * as ondemand from "../lib/ondemand-policy.js";
import * as refreshTiers from "../lib/refresh-tiers.js";
import * as translate from "../lib/query-translate.js";
import { CHARGE_PER_KG as chargePerKg } from "../../weight-data.js";
import * as shippingStatus from "../lib/shipping-status.js";
import * as support from "../lib/support.js";
import * as shippingProvider from "../../netlify/functions/_shipping/provider.js";
import * as shippingRegistry from "../../netlify/functions/_shipping/registry.js";
import * as shippingService from "../../netlify/functions/_shipping/service.js";
import { makeAviTracking } from "../../netlify/functions/_shipping/avi-adapter.js";
import { COST_PER_KG as courierCostPerKg } from "../../netlify/functions/_courier-economics.js";
import * as fitment from "../lib/fitment.js";
import * as autoSources from "../lib/auto-sources.js";
import * as supplements from "../lib/supplement-weight.js";
import * as chatModel from "../../netlify/functions/_aria-chat-model.js";

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
const pageShipping = loadPageShippingSlice();
const pageSupport = loadPageSupportSlice();
const pageFee = loadPageFeeSlice();
const pageFitment = loadPageFitmentSlice();
const pageAuto = loadPageAutoSourcesSlice();

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
  const src = stripComments(readFileSync(root("netlify/functions/orders-create.js"), "utf8"));
  // Recomputed from the server's own order base, never read off the request.
  if (!/smallOrderFeePen\(orderBasePen\)/.test(src)) {
    throw new Error("orders-create.js does not recompute the fee from its own order base");
  }
  if (/body\.smallOrderFeePen|quote\.smallOrderFeePen/.test(src)) {
    throw new Error("orders-create.js trusts a browser-supplied fee");
  }
  // …and that base is products + freight, not products alone.
  if (!/priceUsdTotal \+ freightUsdQuoted/.test(src)) {
    throw new Error("the server fee base is not products + freight");
  }
});

check("the fee is measured against the order, not the products alone", () => {
  /* REPORTED LIVE: S/ 44.69 of shirt plus S/ 10.07 of freight — S/ 54.76
     all in — charged the S/ 10 fee under a label promising no charge
     from S/ 50. */
  eq(smallOrderFeePen(44.69 + 10.07), 0, "the reported cart pays no fee");
  eq(smallOrderFeePen(44.69), SMALL_ORDER_FEE_PEN, "products alone would still have charged it");
  // The line itself: at the threshold is free, a cent under is not.
  eq(smallOrderFeePen(SMALL_ORDER_THRESHOLD_PEN), 0, "exactly S/ 50 is not a small order");
  eq(smallOrderFeePen(SMALL_ORDER_THRESHOLD_PEN - 0.01), SMALL_ORDER_FEE_PEN, "a cent under still pays");
  // A genuinely small order still pays it — the fee keeps its job.
  eq(smallOrderFeePen(30 + 5), SMALL_ORDER_FEE_PEN, "a S/ 35 order all in");
});

check("the note states the basis the code actually uses", () => {
  // The bug was a label that said "pedidos" over code that measured
  // products. Whatever the note claims, it now says which.
  if (!/productos \+ flete/i.test(SMALL_ORDER_FEE_NOTE)) {
    throw new Error(`the note does not state its basis: "${SMALL_ORDER_FEE_NOTE}"`);
  }
  eq(pageFee.SMALL_ORDER_FEE_NOTE, SMALL_ORDER_FEE_NOTE, "index.html mirror");
  // Every surface that charges it measures the same thing.
  const cart = stripComments(readFileSync(root("index.html"), "utf8"));
  if (!/smallOrderFeePen\(orderBasePen\)/.test(cart)) {
    throw new Error("the cart does not use the products+freight base");
  }
  const checkout = stripComments(readFileSync(root("checkout.html"), "utf8"));
  if (!/currentValor\(\) \+ currentFreightUsd\(\)/.test(checkout)) {
    throw new Error("checkout does not use the products+freight base");
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
  /* 2026-09-20: the tile no longer carries its own image markup — it
     renders through cardPhotoHTML, the same helper the Ofertas card
     uses, which is the point of the rebuild. So the rule is asserted
     where it now lives, plus the fact that the tile really does go
     through it. */
  const html = readFileSync(root("index.html"), "utf8");
  const tile = html.slice(html.indexOf("function deptTileHTML"), html.indexOf("function handleDeptThumbError"));
  if (!/cardPhotoHTML\(/.test(tile)) throw new Error("the tile stopped using the shared photo helper");
  const photo = html.slice(html.indexOf("function cardPhotoHTML"), html.indexOf("function ofertasTileArtHTML"));
  if (/object-cover|object-fit:\s*cover/.test(photo)) throw new Error("the shared photo crops with cover");
  if (!/object-fit:\s*contain/.test(photo)) throw new Error("the shared photo does not contain-fit");
  if (!/object-position:\s*center/.test(photo)) throw new Error("the shared photo is not centred");
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


/* ------------------------------------------------------------------
   A — THE MULTI-COURIER SHIPPING SEAM (Phase 1)
   ------------------------------------------------------------------ */
group("A. shipping: the provider contract");

const aviDeps = { readShipmentByTracking: async () => null };

function sampleShipment(over = {}) {
  return {
    orderIds: ["ARIA-20260920-A1B2C3"],
    recipient: {
      name: "Ana Quispe", address: "Av. Arequipa 1234, Dpto 502",
      city: "Lima", phone: "+51 999 888 777", idNumber: "45678912",
    },
    weightKg: 2.4,
    declaredValueUsd: 120,
    ...over,
  };
}

check("every courier in the registry implements all five operations", () => {
  for (const key of Object.keys(shippingRegistry.PROVIDER_REGISTRY)) {
    const adapter = shippingRegistry.buildProvider(key, aviDeps);
    // buildProvider asserts internally; this also pins the list itself,
    // so removing an operation from the contract is a deliberate act.
    for (const op of shippingProvider.PROVIDER_OPERATIONS) {
      if (typeof adapter[op] !== "function") throw new Error(`${key} has no ${op}()`);
    }
  }
  eq(shippingProvider.PROVIDER_OPERATIONS.length, 5, "the contract is five operations");
});

check("a half-written adapter is refused with its own name", () => {
  let msg = "";
  try {
    shippingProvider.assertImplementsProvider({ quote() {}, track() {} }, "medio-courier");
  } catch (e) { msg = e.message; }
  if (!/medio-courier/.test(msg)) throw new Error("the error does not name the courier");
  for (const op of ["createShipment", "confirmDelivery", "cancel"]) {
    if (!msg.includes(op)) throw new Error(`the error does not name the missing ${op}`);
  }
});

check("provider jargon cannot leave an adapter", () => {
  // The guard that keeps a courier's own wording off a customer's screen.
  eq(shippingProvider.assertNormalized("in_customs", "avi"), "in_customs");
  let threw = false;
  try { shippingProvider.assertNormalized("EN_RUTA_LIMA", "avi"); } catch { threw = true; }
  eq(threw, true, "a raw provider status is refused");
});

group("A. shipping: the shipment model");

check("a complete shipment validates", () => {
  const { shipment, errors } = shippingProvider.normalizeShipment(sampleShipment());
  eq(errors.length, 0, `unexpected: ${errors.join(" | ")}`);
  eq(shipment.weightKg, 2.4);
  eq(shipment.declaredValueUsd, 120);
});

check("every recipient field is required", () => {
  for (const field of ["name", "address", "city", "phone", "idNumber"]) {
    const recipient = { ...sampleShipment().recipient, [field]: "" };
    const { errors } = shippingProvider.normalizeShipment(sampleShipment({ recipient }));
    if (!errors.length) throw new Error(`a shipment with no ${field} was accepted`);
  }
});

check("the de minimis is enforced, not merely recorded", () => {
  const { shipment, errors } = shippingProvider.normalizeShipment(sampleShipment({ declaredValueUsd: 240 }));
  if (!errors.some((e) => /de minimis/i.test(e))) throw new Error("no de minimis error");
  if (!shipment.restrictedFlags.includes(shippingProvider.RESTRICTION_OVER_DE_MINIMIS)) {
    throw new Error("the shipment is not flagged");
  }
  eq(shippingProvider.DE_MINIMIS_USD, 200);
  // Exactly at the line is fine; the rule is "over".
  eq(shippingProvider.normalizeShipment(sampleShipment({ declaredValueUsd: 200 })).errors.length, 0);
});

check("the fragrance limit is the beauty table's, not a second copy", () => {
  eq(shippingProvider.normalizeShipment(sampleShipment({ fragranceCount: 4 })).errors.length, 0, "4 is allowed");
  const over = shippingProvider.normalizeShipment(sampleShipment({ fragranceCount: 5 }));
  if (!over.errors.some((e) => /fragancias/i.test(e))) throw new Error("5 fragrances was accepted");
  // Under the limit still flags: the courier is told there is perfume.
  const under = shippingProvider.normalizeShipment(sampleShipment({ fragranceCount: 1 }));
  if (!under.shipment.restrictedFlags.includes(shippingProvider.RESTRICTION_FRAGRANCE_LIMIT)) {
    throw new Error("perfume in the box was not declared to the courier");
  }
});

check("a shipment consolidates at most five orders", () => {
  const ids = (n) => Array.from({ length: n }, (_, i) => `ARIA-2026092${i}-AAA`);
  eq(shippingProvider.normalizeShipment(sampleShipment({ orderIds: ids(5) })).errors.length, 0);
  if (!shippingProvider.normalizeShipment(sampleShipment({ orderIds: ids(6) })).errors.length) {
    throw new Error("six orders went into one box");
  }
  if (!shippingProvider.normalizeShipment(sampleShipment({ orderIds: [] })).errors.length) {
    throw new Error("a shipment with no orders was accepted");
  }
});

check("volumetric weight has no way in", () => {
  // The contract bills actual scale weight. Nothing on the model reads a
  // dimension, and no dimensional helper survives in the codebase.
  const { shipment } = shippingProvider.normalizeShipment(
    sampleShipment({ boxCm: [40, 30, 20], dimCm: [40, 30, 20], volumetricKg: 9 }),
  );
  eq(shipment.weightKg, 2.4, "the scale weight is what is kept");
  for (const k of ["boxCm", "dimCm", "volumetricKg", "billableWeightKg"]) {
    if (k in shipment) throw new Error(`the shipment model carries ${k}`);
  }
  const src = stripComments(readFileSync(root("netlify/functions/_shipping/provider.js"), "utf8"));
  if (/volumetric|dimensional|dimCm|boxCm/i.test(src)) {
    throw new Error("a dimensional-weight concept is back in the shipment model");
  }
});

group("A. shipping: routing, and failing closed");

check("Phase 1 routes to the primary and says why", () => {
  const routed = shippingRegistry.selectProvider(shippingRegistry.DEFAULT_SHIPPING_SETTINGS);
  eq(routed.key, "avi");
  if (!routed.reason) throw new Error("no routingReason was produced");
  // AVI is classed secondary; with nothing else enabled the reason must
  // say so rather than reading as though a primary had been chosen.
  if (!/único courier activo/i.test(routed.reason)) {
    throw new Error(`the reason hides that the only courier is the overflow one: ${routed.reason}`);
  }
});

check("no courier enabled means no shipment, with a clear error", () => {
  let err = null;
  try { shippingRegistry.selectProvider({ enabled: { avi: false }, primary: "avi" }); }
  catch (e) { err = e; }
  if (!err) throw new Error("a shipment was routed with every courier disabled");
  eq(err.name, "NoProviderError");
  eq(err.code, "NO_PROVIDER_ENABLED");
  if (!/activ/i.test(err.message)) throw new Error("the error does not say what to do");
});

check("an override onto a disabled courier is refused, not honoured", () => {
  let threw = false;
  try {
    shippingRegistry.selectProvider({ enabled: { avi: false }, primary: "avi" }, { override: "avi" });
  } catch (e) { threw = e instanceof shippingRegistry.NoProviderError; }
  eq(threw, true, "the misroute this whole system exists to prevent");
  // A valid override is honoured, and recorded as manual.
  const routed = shippingRegistry.selectProvider(shippingRegistry.DEFAULT_SHIPPING_SETTINGS, { override: "avi" });
  if (!/override manual/i.test(routed.reason)) throw new Error("a manual override is not recorded as one");
});

check("an unknown courier is refused", () => {
  let threw = false;
  try { shippingRegistry.buildProvider("fedex-imaginario", aviDeps); } catch { threw = true; }
  eq(threw, true);
});

group("A. shipping: normalized statuses");

check("the vocabulary is exactly the five plus two", () => {
  eq(shippingStatus.SHIPPING_FLOW.join(" "), "created in_transit in_customs out_for_delivery delivered");
  eq(shippingStatus.SHIPPING_STATUSES.length, 7);
  for (const s of ["exception", "cancelled"]) {
    if (!shippingStatus.SHIPPING_STATUSES.includes(s)) throw new Error(`${s} is missing`);
  }
  // Every one of them has customer-facing Spanish.
  for (const s of shippingStatus.SHIPPING_STATUSES) {
    if (!shippingStatus.SHIPPING_STATUS_ES[s]?.label) throw new Error(`${s} has no Spanish label`);
  }
});

check("index.html mirrors the vocabulary word for word", () => {
  eq(pageShipping.SHIPPING_STATUSES.join(","), shippingStatus.SHIPPING_STATUSES.join(","), "status list");
  eq(pageShipping.SHIPPING_FLOW.join(","), shippingStatus.SHIPPING_FLOW.join(","), "flow order");
  for (const s of shippingStatus.SHIPPING_STATUSES) {
    eq(pageShipping.statusLabelEs(s), shippingStatus.statusLabelEs(s), `${s} label`);
    eq(pageShipping.SHIPPING_STATUS_ES[s].note, shippingStatus.SHIPPING_STATUS_ES[s].note, `${s} note`);
  }
});

check("a parcel never walks backwards on a customer's screen", () => {
  const { canTransition } = shippingStatus;
  eq(canTransition(null, "created"), true);
  eq(canTransition("created", "in_transit"), true);
  eq(canTransition("in_transit", "delivered"), true, "skipping ahead is real: some parcels clear customs unseen");
  eq(canTransition("delivered", "in_transit"), false, "a re-sent old event must not un-deliver a parcel");
  eq(canTransition("cancelled", "in_transit"), false);
  eq(canTransition("in_transit", "exception"), true);
  eq(canTransition("exception", "out_for_delivery"), true, "an exception can be worked back onto the path");
});

check("a rejected event is still recorded, just not applied", () => {
  let s = { status: "delivered", statusHistory: [{ status: "delivered", at: "2026-09-20T10:00:00Z" }] };
  const r = shippingService.applyStatusUpdate(s, { status: "in_transit", by: "courier-replay" });
  eq(r.changed, false, "it did not move the parcel");
  eq(r.shipment.status, "delivered", "the customer still sees delivered");
  eq(r.shipment.statusHistory.length, 2, "ops can still see the event arrived");
  if (!r.rejected) throw new Error("no explanation for ops");
});

group("A. shipping: what the customer may see");

check("the public view leaks nothing, by construction", () => {
  const stuffed = {
    shipmentId: "ARIA-SHIP-260920-AB", status: "in_transit",
    orderIds: ["ARIA-20260920-A1B2C3"],
    // Everything that must never reach a shopper:
    provider: "avi", trackingNumber: "AVI-260920-AF278B",
    providerShipmentId: "avi-manual-AVI-260920-AF278B",
    internalCostUsd: 21.6, chargedFreightUsd: 31.2,
    routingReason: "AVI Courier es el único courier activo",
    recipient: { name: "Ana Quispe", phone: "+51 999 888 777", idNumber: "45678912" },
    aFieldAddedNextMonth: "secreto",
    statusHistory: [{ status: "in_transit", at: "2026-09-20T10:00:00Z", by: "ops@aria.pe", raw: "EN_RUTA_LIMA" }],
  };
  const view = shippingService.publicTrackingView(stuffed);
  const json = JSON.stringify(view);
  for (const secret of [
    "avi", "AVI", "21.6", "31.2", "ops@aria.pe", "EN_RUTA_LIMA",
    "45678912", "999 888 777", "secreto", "routingReason",
  ]) {
    if (json.includes(secret)) throw new Error(`the customer view leaks "${secret}": ${json}`);
  }
  eq(view.status, "in_transit");
  eq(view.label, "En camino", "and it says it in Aria's own words");
});

check("the customer's reference is Aria's, not the courier's", () => {
  const id = shippingService.makeShipmentId("2026-09-20", "ab12");
  if (!/^ARIA-SHIP-/.test(id)) throw new Error(`a customer-facing id that is not ours: ${id}`);
  // AVI's own number is the one that names a courier, and it stays in ops.
  if (!/^AVI-/.test(makeAviTracking(new Date("2026-09-20T12:00:00Z")))) {
    throw new Error("the AVI tracking format changed — check nothing renders it");
  }
});

check("no courier is named anywhere a shopper can reach", () => {
  // The acceptance criterion, asserted rather than eyeballed: adding
  // courier #2 must not require touching checkout, and courier #1 must
  // not be visible at checkout today.
  for (const rel of ["index.html", "checkout.html"]) {
    const src = readFileSync(root(rel), "utf8");
    if (/AVI\s*Courier|avi-courier/i.test(src)) throw new Error(`${rel} names a courier`);
  }
  const shippingSrc = readFileSync(root("scripts/lib/shipping-status.js"), "utf8");
  if (/AVI|courier name/i.test(shippingSrc.replace(/courier/gi, ""))) {
    throw new Error("the browser-facing status module names a courier");
  }
});

group("A. shipping: the AVI adapter and the manifest");

const aviQuote = await shippingRegistry.buildProvider("avi", aviDeps).quote({ weightKg: 2 });
check("AVI quotes from the contract rate and says it is an estimate", () => {
  const q = aviQuote;
  // 2 kg at the internal contract rate. Never the customer's rate.
  eq(q.costUsd, Math.round(2 * courierCostPerKg * 100) / 100);
  eq(q.estimated, true, "a contract calculation is not a live quote");
  if (!(q.transitDaysMin > 0 && q.transitDaysMax >= q.transitDaysMin)) {
    throw new Error("the transit window is not a window");
  }
});

check("the margin is the spread, and an unknown charge is not zero", () => {
  const day = "2026-09-20";
  const base = { createdAt: `${day}T12:00:00Z`, provider: "avi", weightKg: 2, status: "in_transit" };
  const known = shippingService.dailyRollup([
    { ...base, internalCostUsd: 18, chargedFreightUsd: 26 },
  ])[0];
  eq(known.marginUsd, 8, "$13/kg charged less $9/kg cost, on 2 kg");
  eq(known.chargedComplete, true);

  const partial = shippingService.dailyRollup([
    { ...base, internalCostUsd: 18, chargedFreightUsd: 26 },
    { ...base, internalCostUsd: 18, chargedFreightUsd: null },
  ])[0];
  eq(partial.marginUsd, null, "a missing charge makes the margin unknown, never zero");
  eq(partial.chargedComplete, false);

  // A cancelled box is not volume and not cost.
  eq(shippingService.dailyRollup([{ ...base, status: "cancelled", internalCostUsd: 18 }]).length, 0);
});

check("the manifest carries what a courier needs and no money of ours", () => {
  const csv = shippingService.manifestCsv([{
    shipmentId: "ARIA-SHIP-260920-AB", trackingNumber: "AVI-260920-AF278B",
    orderIds: ["ARIA-20260920-A1B2C3"],
    recipient: { name: "Ana Quispe", address: 'Av. "Arequipa", 1234', city: "Lima", phone: "999888777", idNumber: "45678912" },
    weightKg: 2.4, declaredValueUsd: 120, restrictedFlags: ["fragrance_limit"],
    status: "created", notes: "",
    internalCostUsd: 21.6, chargedFreightUsd: 31.2,
  }]);
  for (const needed of ["ARIA-SHIP-260920-AB", "Ana Quispe", "45678912", "Lima", "2.4", "120", "fragrance_limit"]) {
    if (!csv.includes(needed)) throw new Error(`the manifest omits ${needed}`);
  }
  for (const secret of ["21.6", "31.2"]) {
    if (csv.includes(secret)) throw new Error(`the manifest hands the courier our margin (${secret})`);
  }
  if (!csv.startsWith("﻿")) throw new Error("no BOM — Lima addresses will open mangled in Excel");
  if (!csv.includes('"Av. ""Arequipa"", 1234"')) throw new Error("a comma/quote in an address breaks the CSV");
});

check("internal courier cost is served only behind the admin gate", () => {
  const publicSrc = readFileSync(root("netlify/functions/shipment-track.js"), "utf8");
  if (/COST_PER_KG|internalCostUsd|courier-economics/.test(stripComments(publicSrc))) {
    throw new Error("the public tracking endpoint touches internal cost");
  }
  const adminSrc = readFileSync(root("netlify/functions/admin-shipping.js"), "utf8");
  if (!/isAdmin\(email\)/.test(adminSrc)) throw new Error("the admin shipping endpoint is not gated");
});

/* ------------------------------------------------------------------
   B — CATEGORY TILES ARE OFERTAS CARDS
   ------------------------------------------------------------------ */
group("A. shipping: a test order, end to end");

/* THE ACCEPTANCE CRITERION, RUN. An order goes through the interface to
   AVI: routed, manifest generated, tracking recorded, delivery confirmed
   — over the same five operations any future courier will implement, with
   an in-memory stand-in for the Blobs store so it runs anywhere. */
const e2e = await (async () => {
  const saved = new Map();
  const deps = { readShipmentByTracking: async (t) => saved.get(t) || null };
  const adapter = shippingRegistry.buildProvider(
    shippingRegistry.selectProvider(shippingRegistry.DEFAULT_SHIPPING_SETTINGS).key, deps);

  const routed = shippingRegistry.selectProvider(shippingRegistry.DEFAULT_SHIPPING_SETTINGS);
  const { shipment: model, errors } = shippingProvider.normalizeShipment(sampleShipment({ fragranceCount: 2 }));
  const quote = await adapter.quote(model);
  const created = await adapter.createShipment(model);

  let ship = {
    ...model,
    shipmentId: shippingService.makeShipmentId("2026-09-20", "e2e1"),
    createdAt: "2026-09-20T12:00:00Z",
    provider: routed.key, routingReason: routed.reason,
    providerShipmentId: created.providerShipmentId, trackingNumber: created.trackingNumber,
    internalCostUsd: quote.costUsd, chargedFreightUsd: 31.2,
    transitDaysMin: quote.transitDaysMin, transitDaysMax: quote.transitDaysMax,
    status: null, statusHistory: [],
  };
  const save = () => saved.set(ship.trackingNumber, ship);

  const steps = [];
  for (const status of shippingStatus.SHIPPING_FLOW) {
    const r = shippingService.applyStatusUpdate(ship, { status, by: "ops@ariashop.pe" });
    ship = r.shipment; save();
    steps.push({ status, changed: r.changed });
  }

  const csv = shippingService.manifestCsv([ship]);
  const tracked = await adapter.track(ship.trackingNumber);
  const delivery = await adapter.confirmDelivery(ship.trackingNumber);
  return { errors, routed, created, ship, steps, csv, tracked, delivery, quote };
})();

check("the order was routed to a courier, with the reason recorded", () => {
  eq(e2e.errors.length, 0, `model errors: ${e2e.errors.join(" | ")}`);
  eq(e2e.ship.provider, "avi");
  if (!e2e.ship.routingReason) throw new Error("no routingReason on the shipment");
  if (!e2e.ship.shipmentId.startsWith("ARIA-SHIP-")) throw new Error("no Aria reference");
});

check("a manifest was generated for the courier", () => {
  if (!e2e.created.manifestRequired) throw new Error("AVI did not ask for a manifest");
  eq(e2e.created.labelUrl, null, "no API, so no label URL is invented");
  if (!e2e.csv.includes(e2e.ship.shipmentId)) throw new Error("the shipment is not on the manifest");
  if (!e2e.csv.includes(e2e.ship.trackingNumber)) throw new Error("the tracking number is not on the manifest");
});

check("tracking was recorded through every normalized state", () => {
  eq(e2e.steps.every((s) => s.changed), true, "a step was rejected");
  eq(e2e.steps.map((s) => s.status).join(","), shippingStatus.SHIPPING_FLOW.join(","));
  eq(e2e.tracked.found, true);
  eq(e2e.tracked.status, "delivered");
  eq(e2e.tracked.events.length, 5);
  for (const ev of e2e.tracked.events) {
    if (!shippingStatus.SHIPPING_STATUSES.includes(ev.status)) throw new Error(`jargon leaked: ${ev.status}`);
  }
});

check("delivery was confirmed, with a real audit trail", () => {
  if (!e2e.delivery.deliveredAt) throw new Error("no delivery confirmation");
  eq(e2e.delivery.proof.kind, "ops_confirmation", "honest about how it was confirmed");
  eq(e2e.delivery.proof.by, "ops@ariashop.pe");
});

check("the customer sees the whole journey and none of the plumbing", () => {
  const view = shippingService.publicTrackingView(e2e.ship);
  eq(view.label, "Entregado");
  eq(view.history.length, 5, "the full journey, in Aria's words");
  eq(view.history.map((h) => h.label).join(" → "),
     "Pedido registrado → En camino → En aduana → En reparto → Entregado");
  const json = JSON.stringify(view);
  for (const secret of ["avi", "AVI", String(e2e.quote.costUsd), "ops@ariashop.pe"]) {
    if (json.includes(secret)) throw new Error(`the customer view leaks "${secret}"`);
  }
});

group("B. no little squares anywhere");

check("the category tile is built from the Ofertas card's own parts", () => {
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const tile = src.slice(src.indexOf("function deptTileHTML("), src.indexOf("function handleDeptThumbError("));
  for (const part of ["CARD_SHELL_CLASS", "cardImageFrameHTML"]) {
    if (!tile.includes(part)) throw new Error(`the category tile does not use ${part}`);
  }
  // …and so is the product card, so there is one style rather than two.
  const card = src.slice(src.indexOf("function productCardHTML("), src.indexOf("function renderSalesGrid("));
  for (const part of ["CARD_SHELL_CLASS", "cardImageFrameHTML", "cardPhotoHTML"]) {
    if (!card.includes(part)) throw new Error(`the Ofertas card does not use ${part}`);
  }
});

check("both category grids are the Ofertas grid, two across", () => {
  const src = readFileSync(root("index.html"), "utf8");
  for (const id of ["categoriesGrid", "catGrid"]) {
    const at = src.indexOf(`id="${id}"`);
    if (at < 0) throw new Error(`#${id} is gone`);
    // The <div> that carries the id, class attribute and all.
    const tag = src.slice(src.lastIndexOf("<div", at), src.indexOf(">", at) + 1);
    if (!/grid-cols-1 md:grid-cols-2/.test(tag)) {
      throw new Error(`#${id} is not on the two-across Ofertas grid: ${tag}`);
    }
    if (/grid-cols-[34]|sm:grid-cols-3|md:grid-cols-4|lg:grid-cols-4/.test(tag)) {
      throw new Error(`#${id} still has a small-square column count: ${tag}`);
    }
  }
  // Ofertas' own grid, for comparison: the same class, from one constant.
  const listing = src.match(/const LISTING_GRID_CLASS = '([^']+)'/)?.[1];
  eq(listing, "grid grid-cols-1 md:grid-cols-2 gap-5", "the shared grid class");
});

check("no product image on any grid is cropped", () => {
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const frame = src.slice(src.indexOf("function cardImageFrameHTML("), src.indexOf("function deptTileHTML("));
  if (!/object-fit:\s*contain/.test(frame)) throw new Error("the shared photo is not contain-fit");
  if (/object-fit:\s*cover/.test(frame)) throw new Error("a cover fit is back — it crops people in half");
  if (!/aspect-ratio:4\/5/.test(frame)) throw new Error("the shared 4:5 field is gone");
});

/* ------------------------------------------------------------------
   C — SUPPORT REACHES A PERSON
   ------------------------------------------------------------------ */
group("C. contactar soporte opens email");

check("the returns CTA is a mailto with the subject pre-filled", () => {
  const src = readFileSync(root("index.html"), "utf8");
  const returns = src.slice(src.indexOf('<div id="returnsView"'), src.indexOf('<!-- ============ TERMS VIEW'));
  const cta = returns.match(/<[^>]*>\s*Contactar soporte\s*<\/[^>]+>/)?.[0] || "";
  if (!cta) throw new Error("the Contactar soporte CTA is gone");
  if (/<button/i.test(cta)) throw new Error("it is still a <button>, not a link");
  if (!/href="mailto:/.test(cta)) throw new Error("it has no mailto href");
  if (/onclick=/.test(cta)) throw new Error("it still carries a JS handler");
  if (!cta.includes(encodeURIComponent(support.SUPPORT_SUBJECT_RETURNS))) {
    throw new Error(`the subject is not pre-filled: ${cta}`);
  }
  if (!cta.includes(support.SUPPORT_EMAIL)) throw new Error("it does not reach the support address");
  eq(support.SUPPORT_EMAIL, "daniel.leon@ariashop.pe");
  eq(support.SUPPORT_SUBJECT_RETURNS, "Ayuda con una devolución");
});

check("no support CTA anywhere loops back into the chatbot alone", () => {
  for (const rel of ["index.html", "checkout.html"]) {
    const src = readFileSync(root(rel), "utf8").replace(/<!--[\s\S]*?-->/g, "");
    // Any element whose visible text is a support/contact CTA must carry
    // a mailto. The chat may be offered BESIDE one, never instead of it.
    const re = /<(button|a)\b[^>]*>\s*([^<]*\b(?:Contactar soporte|contactar soporte)\b[^<]*)\s*<\/\1>/g;
    for (const m of src.matchAll(re)) {
      if (!/href="mailto:/.test(m[0])) throw new Error(`${rel}: "${m[2].trim()}" does not reach a person`);
    }
  }
});

check("every authored address matches its constant", () => {
  // The markup carries a real href so the link works with JS off; this
  // is what stops that copy drifting from scripts/lib/support.js.
  const expected = {
    returns: support.SUPPORT_LINKS.returns(),
    order: support.SUPPORT_LINKS.order(),
    general: support.SUPPORT_LINKS.general(),
  };
  let seen = 0;
  for (const rel of ["index.html", "checkout.html"]) {
    const src = readFileSync(root(rel), "utf8");
    for (const m of src.matchAll(/<a\s[^>]*data-support="(\w+)"[^>]*href="([^"]+)"[^>]*>/g)) {
      const [, kind, href] = m;
      if (!expected[kind]) throw new Error(`${rel}: unknown data-support="${kind}"`);
      if (decodeURIComponent(href) !== decodeURIComponent(expected[kind])) {
        throw new Error(`${rel}: data-support="${kind}" href is ${href}, constant says ${expected[kind]}`);
      }
      seen++;
    }
  }
  if (seen < 3) throw new Error(`only ${seen} tagged support links found`);
});

check("index.html mirrors the support constants", () => {
  eq(pageSupport.SUPPORT_EMAIL, support.SUPPORT_EMAIL);
  eq(pageSupport.GENERAL_CONTACT_EMAIL, support.GENERAL_CONTACT_EMAIL);
  eq(pageSupport.SUPPORT_SUBJECT_RETURNS, support.SUPPORT_SUBJECT_RETURNS);
  for (const kind of ["returns", "order", "general"]) {
    eq(pageSupport.SUPPORT_LINKS[kind](), support.SUPPORT_LINKS[kind](), kind);
  }
});


/* ------------------------------------------------------------------
   ARIA AUTO — the YMM picker filters, or it says nothing
   ------------------------------------------------------------------ */
group("auto: fitment matching");

const SONATA = { year: "2020", make: "Hyundai", model: "Sonata" };
const COROLLA = { year: "2014", make: "Toyota", model: "Corolla" };

check("the reported compatibility list matches the reported car", () => {
  // Danny's live example, verbatim.
  const text = "fits Hyundai Sonata, Hyundai Tucson, Kia K5, Kia Sportage 2020–2024";
  const vehicles = fitment.parseFitmentText(text);
  if (vehicles.length !== 4) throw new Error(`parsed ${vehicles.length} vehicles, expected 4`);
  eq(fitment.matchesVehicle(vehicles, SONATA), true, "the Sonata is on the list");
  eq(fitment.matchesVehicle(vehicles, { ...SONATA, model: "Tucson" }), true, "so is the Tucson");
  eq(fitment.matchesVehicle(vehicles, COROLLA), false, "the Corolla is not");
  // The trailing range applies to every entry that has no year of its own.
  eq(fitment.matchesVehicle(vehicles, { ...SONATA, year: "2019" }), false, "a year below the range");
  eq(fitment.matchesVehicle(vehicles, { ...SONATA, year: "2025" }), false, "a year above it");
});

check("the second test case from the brief", () => {
  const vehicles = fitment.parseFitmentText("Fits: 2014-2019 Toyota Corolla");
  eq(fitment.matchesVehicle(vehicles, COROLLA), true);
  eq(fitment.matchesVehicle(vehicles, SONATA), false);
  eq(fitment.matchesVehicle(vehicles, { ...COROLLA, year: "2013" }), false);
});

check("two-word makes and hyphenated models survive parsing", () => {
  // An earlier cut stripped every range separator wherever it appeared,
  // which ate the hyphen in "Mercedes-Benz" and the "a" inside "Toyota".
  const mb = fitment.parseFitmentText("Compatible with Mercedes-Benz C-Class 2018-2022");
  eq(fitment.matchesVehicle(mb, { year: "2020", make: "Mercedes-Benz", model: "C-Class" }), true);
  const f150 = fitment.parseFitmentText("Fits Ford F-150 2015-2020");
  eq(fitment.matchesVehicle(f150, { year: "2018", make: "Ford", model: "F-150" }), true);
  eq(fitment.matchesVehicle(f150, { year: "2022", make: "Ford", model: "F-150" }), false);
  const toyota = fitment.parseFitmentText("Fits Toyota Corolla");
  eq(fitment.matchesVehicle(toyota, COROLLA), true, "a list with no year still names the model line");
});

check("a trim is not a different car", () => {
  const v = fitment.parseFitmentText("Fits Hyundai Sonata SE 2020-2024");
  eq(fitment.matchesVehicle(v, SONATA), true);
});

check("the verdict has three values and no maybe", () => {
  // No list at all is an ABSENCE, never a soft yes.
  eq(fitment.fitmentVerdict({ vehicle_fitment: "VEHICLE_SPECIFIC", specs: { "Pad Type": "Ceramic" } }, SONATA), "unknown");
  eq(fitment.fitmentVerdict({ specs: { Fits: "Hyundai Sonata 2020-2024" } }, SONATA), "fits");
  eq(fitment.fitmentVerdict({ specs: { Fits: "Hyundai Sonata 2020-2024" } }, COROLLA), "does-not-fit");
  eq(fitment.fitmentVerdict({ fitment: [{ make: "Hyundai", model: "Sonata", yearFrom: 2020, yearTo: 2024 }] }, SONATA), "fits");
  eq(fitment.fitmentVerdict(null, SONATA), "unknown");
});

check("VEHICLE_SPECIFIC alone never earns a fit", () => {
  /* It was the only signal the old code had, and it means "sold per
     vehicle" — not "fits YOUR vehicle". Every one of the 9,285 cached
     AutoZone items carries it, which is exactly why the picker did
     nothing. */
  for (const raw of [
    { vehicle_fitment: "VEHICLE_SPECIFIC" },
    { vehicle_fitment: "UNIVERSAL" },
    { vehicle_fitment: "VEHICLE_SPECIFIC", location: "Front", part_type: "Brake Pads" },
  ]) {
    eq(fitment.fitmentVerdict(raw, SONATA), "unknown", JSON.stringify(raw));
  }
});

check("index.html mirrors the matcher", () => {
  const cases = [
    ["fits Hyundai Sonata, Hyundai Tucson, Kia K5, Kia Sportage 2020–2024", SONATA],
    ["Fits: 2014-2019 Toyota Corolla", COROLLA],
    ["Fits Ford F-150 2015-2020", { year: "2018", make: "Ford", model: "F-150" }],
    ["Fits Honda Civic 2016-2021", SONATA],
  ];
  for (const [text, v] of cases) {
    eq(
      pageFitment.matchesVehicle(pageFitment.parseFitmentText(text), v),
      fitment.matchesVehicle(fitment.parseFitmentText(text), v),
      `${text} / ${v.make} ${v.model}`,
    );
  }
  eq(pageFitment.fitmentVerdict({ specs: { Fits: "Hyundai Sonata 2020-2024" } }, SONATA), "fits", "page verdict");
});

group("auto: the banned middle ground is gone");

check("no 'verifica el calce' copy is rendered anywhere", () => {
  const html = readFileSync(root("index.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const code = stripComments(html);
  for (const banned of ["Verifica el calce", "verifícalo antes de pedir", "La tienda no confirma el calce"]) {
    if (code.includes(banned)) throw new Error(`the banned disclaimer survives: "${banned}"`);
  }
});

check("the badge has one branch, and it is green", () => {
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const fn = src.slice(src.indexOf("function fitmentBadgeHTML("), src.indexOf("function vehicleFittedItems("));
  if (!/if \(!verified\) return '';/.test(fn)) throw new Error("the badge still renders an unverified state");
  if (/8A6B1F/.test(fn)) throw new Error("the amber 'verify it yourself' badge is back");
  if (!/1E7A43/.test(fn)) throw new Error("the green confirmed badge is gone");
});

check("the results path filters on fitment, not on VEHICLE_SPECIFIC", () => {
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  if (/vehicle_fitment/.test(src)) throw new Error("the old VEHICLE_SPECIFIC gate is still live code");
  const block = src.slice(src.indexOf("function renderAutoPartBlock("), src.indexOf("async function searchAutoParts("));
  if (!/vehicleFittedItems\(rawItems, vehicle\)/.test(block)) {
    throw new Error("the block does not filter to confirmed-fit items");
  }
  if (!/hasFitmentData\(rawItems, vehicle\)/.test(block) || !/fitmentGapHTML\(/.test(block)) {
    throw new Error("the honest empty state is not the no-data outcome");
  }
});

group("auto: sources are a registry, and not Tiendas");

check("RockAuto is a source, O'Reilly is excluded, Advance is unprobed", () => {
  eq(autoSources.AUTO_SOURCES.rockauto.label, "RockAuto");
  eq(autoSources.AUTO_SOURCES.oreilly.excluded, true, "O'Reilly stays out");
  if (!autoSources.AUTO_SOURCES.oreilly.excludedReason) throw new Error("no reason recorded for O'Reilly");
  eq(autoSources.AUTO_SOURCES.advanceauto.probe, "not-run", "Advance Auto could not be probed from here");
  // An excluded or unprobed source is never shown to a shopper.
  const visible = autoSources.visibleAutoSources().map((s) => s.key);
  if (visible.includes("oreilly")) throw new Error("O'Reilly is being shown");
  if (visible.includes("advanceauto")) throw new Error("an unprobed source is being shown");
  if (!visible.includes("rockauto")) throw new Error("RockAuto is not shown");
  if (!visible.includes("autozone")) throw new Error("AutoZone is not shown");
});

check("the parts sources never enter the Tiendas grid", () => {
  // The grid stays at its symmetric eight.
  const tiendas = Object.keys(RETAILERS).filter((k) => !RETAILERS[k].retired);
  eq(tiendas.length, 8, `Tiendas shows ${tiendas.length} stores`);
  for (const key of Object.keys(autoSources.AUTO_SOURCES)) {
    if (key === "autozone") continue;   // predates the split, and Aria Auto's own source
    if (tiendas.includes(key)) throw new Error(`${key} leaked into the Tiendas grid`);
  }
});

check("a source with no verified actor is not queried", () => {
  // Same rule as the beauty stores: a guessed actor returns an empty run,
  // which reads as "this store has nothing for your car" — a lie.
  eq(autoSources.AUTO_SOURCES.rockauto.search, false);
  eq(autoSources.searchableAutoSources().map((s) => s.key).join(","), "autozone");
});

check("index.html mirrors the source registry", () => {
  eq(Object.keys(pageAuto.AUTO_SOURCES).join(","), Object.keys(autoSources.AUTO_SOURCES).join(","), "rows");
  for (const [key, row] of Object.entries(autoSources.AUTO_SOURCES)) {
    eq(pageAuto.AUTO_SOURCES[key].label, row.label, `${key} label`);
    eq(pageAuto.AUTO_SOURCES[key].search, row.search, `${key} search`);
    eq(Boolean(pageAuto.AUTO_SOURCES[key].excluded), Boolean(row.excluded), `${key} excluded`);
  }
});

check("the auto scrape asks for the mode that carries fitment", () => {
  /* The cache was built in "overview" mode, which returns no
     description, no features and a two-key specs object — an audit of
     all 9,285 cached items found zero compatibility lists. */
  const src = readFileSync(root("netlify/functions/apify-scrape-start.js"), "utf8");
  if (!/const AUTO_SCRAPE_MODE = process\.env\.AUTO_SCRAPE_MODE \|\| "detail"/.test(src)) {
    throw new Error("auto scrapes no longer request the detail mode");
  }
  const autozone = src.slice(src.indexOf("  autozone: {"), src.indexOf("  nordstrom:"));
  if (/scrapeMode: "overview"/.test(autozone)) throw new Error("autozone is pinned back to overview mode");
});

/* ------------------------------------------------------------------
   WEIGHT — the 0.68 and the 1.08
   ------------------------------------------------------------------ */
group("weight: the reported vitamin bottles");

check("no single number serves two unrelated products", () => {
  /* REPORTED LIVE: a 180-softgel bottle and a 5 fl oz liquid both quoted
     0.68 kg. It was not the generic fallback — 0.68 is withBuffer(0.5,
     "reasoned"), the one `vitamins|supplement` row that covered the
     whole aisle. */
  const d3 = estimateWeightDetail("Nature Made Vitamin D3 2000 IU, 180 Softgels");
  const liquid = estimateWeightDetail("Soapbox Vitamin Booster Hair Serum, 5 fl oz");
  const gummies = estimateWeightDetail("Nature's Way Sambucus Elderberry Gummies, 60 Count");
  if (d3.kg === liquid.kg) throw new Error("two unrelated products still share one number");
  for (const [name, d] of [["D3", d3], ["liquid", liquid], ["gummies", gummies]]) {
    if (d.kg === 0.68) throw new Error(`${name} still quotes the 0.68 constant`);
    if (!(d.kg > 0 && d.kg < 0.4)) throw new Error(`${name} is not a plausible small bottle: ${d.kg} kg`);
  }
  // …and the coarse row that produced it is gone from both tables.
  for (const rel of ["scripts/lib/sales-sources.js", "index.html"]) {
    const src = stripComments(readFileSync(root(rel), "utf8"));
    if (/vitamins\?\\b\|multivitamin/.test(src)) throw new Error(`${rel} still has the coarse vitamins row`);
  }
});

check("the freight these bottles earn no longer manufactures a badge", () => {
  // S/ 46.88 at the FX in the screenshot is about $12.
  const d3 = estimateWeightDetail("Nature Made Vitamin D3 2000 IU, 180 Softgels");
  const share = itemWeight.freightShare(d3.kg, 12, 13);
  if (share > itemWeight.FREIGHT_BADGE_SHARE) {
    throw new Error(`a vitamin bottle still reads as high-freight: ${Math.round(share * 100)}%`);
  }
  // The old number did, which is the bug the badge was faithfully reporting.
  if (!(itemWeight.freightShare(0.68, 12, 13) > itemWeight.FREIGHT_BADGE_SHARE)) {
    throw new Error("the fixture no longer reproduces the reported badge");
  }
});

check("count, form and volume each change the answer", () => {
  const kg = (t) => supplements.supplementWeightKg(t);
  // Gummies are dense: 60 of them are not 60 tablets.
  if (!(kg("Elderberry Gummies, 60 Count") > kg("Vitamin C Tablets, 60 Count"))) {
    throw new Error("form is being ignored");
  }
  // More count, more weight.
  if (!(kg("Vitamin D3, 300 Softgels") > kg("Vitamin D3, 60 Softgels"))) {
    throw new Error("count is being ignored");
  }
  // A stated volume is read directly.
  eq(kg("Elderberry Syrup, 5 fl oz"), 0.203, "5 fl oz = 148 ml + container");
  // Sold by mass, not by count: the title's own weight wins upstream.
  eq(kg("Gold Standard Whey Protein Powder, 2 lb"), null, "protein is not a handful of capsules");
  // A dose is not a count.
  if (kg("Vitamin D3 2000 IU") > 0.3) throw new Error("an IU dose was read as a pill count");
});

check("a vitamin bottle over half a kilo fails closed", () => {
  const band = itemWeight.bandFor("Nature Made Vitamin D3, 180 Softgels");
  eq(band.key, "suplemento");
  eq(band.maxKg, 0.5);
  eq(itemWeight.weightSanity("Nature Made Vitamin D3, 180 Softgels", 0.68).outOfBand, true,
     "the old number would now be refused outright");
});

check("a stated volume beats a beauty row's flat figure", () => {
  // The serum row is calibrated for a 30 ml dropper bottle; answering
  // 0.10 kg for a 148 ml bottle under-quoted by half.
  eq(beauty.beautyWeightDetail("The Ordinary Niacinamide Serum 30ml", {}).kg, 0.1, "the reference size is unchanged");
  const big = beauty.beautyWeightDetail("Hair Serum, 5 fl oz", {});
  if (!(big.kg > 0.18 && big.kg < 0.26)) throw new Error(`a 148 ml bottle came out at ${big.kg} kg`);
  // And the band follows the size, so the honest answer is not flagged.
  eq(itemWeight.weightSanity("CeraVe Moisturizing Cream 16 oz", 0.62).outOfBand, false,
     "a 473 ml tub really does weigh this much");
});

group("weight: one generic fallback, and it does not reach a cart");

check("the 1.08 generic is dead everywhere", () => {
  eq(itemWeight.GENERIC_FALLBACK_KG, 0.6, "one constant");
  const unknown = "Totally Unknown Widget XYZ";
  eq(estimateWeightDetail(unknown).kg, itemWeight.GENERIC_FALLBACK_KG, "the module");
  eq(page.estimateRetailWeightDetail(unknown).kg, itemWeight.GENERIC_FALLBACK_KG, "index.html");
  eq(resolveItemWeight({ title: unknown }).weightKg, itemWeight.GENERIC_FALLBACK_KG, "the checkout resolver");
  // The number itself must not survive as a literal anywhere it could
  // become an estimate again.
  for (const rel of ["scripts/lib/sales-sources.js", "netlify/functions/_weight-resolve.js"]) {
    const src = stripComments(readFileSync(root(rel), "utf8"));
    if (/DEFAULT_RETAIL_WEIGHT_KG/.test(src)) throw new Error(`${rel} still has a second generic constant`);
  }
});

check("the page and the checkout resolver agree on an unclassified item", () => {
  /* They did not: the page said 1.08 and the resolver said 0.6, under a
     comment in the resolver asserting they matched. An unclassified item
     got heavier between the cart and the payment page. */
  for (const title of ["Totally Unknown Widget XYZ", "Mystery Gadget 3000", "Unbranded Thing"]) {
    eq(page.estimateRetailWeightDetail(title).kg, resolveItemWeight({ title }).weightKg, title);
  }
});

check("the PDP and the cart tell the same story", () => {
  /* REPORTED LIVE: a conditioner's page said "Flete por confirmar — lo
     cotizamos antes de que pagues" and the cart charged S/ 47.29 of
     freight on the same S/ 40.18 item. The card had the rule; the cart
     and checkout had half of it. */
  const cases = [
    { title: "Totally Unknown Widget XYZ", priceUsd: 4, quotable: false },
    { title: "Totally Unknown Widget XYZ", priceUsd: 60, quotable: true },
    { title: "Nature Made Vitamin D3 2000 IU, 180 Softgels", priceUsd: 12, quotable: true },
    { title: "By Veira Hydrating Conditioner, 10 fl oz", priceUsd: 10.6, quotable: true },
  ];
  for (const c of cases) {
    const moduleVerdict = itemWeight.freightQuotable(estimateWeightDetail(c.title), c.priceUsd, 13).quotable;
    const pageVerdict = page.freightQuotable(page.estimateRetailWeightDetail(c.title), c.priceUsd).quotable;
    const cart = resolveCartWeights([{ title: c.title, priceUsd: c.priceUsd, qty: 1 }]);
    eq(moduleVerdict, c.quotable, `module: ${c.title} at $${c.priceUsd}`);
    eq(pageVerdict, c.quotable, `page: ${c.title} at $${c.priceUsd}`);
    // The cart's verdict is the inverse: unquotable means it stops.
    eq(!cart.needsReview, c.quotable, `cart: ${c.title} at $${c.priceUsd}`);
  }
});

check("a blocked checkout gives the shopper somewhere to go", () => {
  // "Lo cotizamos antes de que pagues" is only honest if checkout stops
  // AND there is a way to reach a person from the stopped state.
  const src = readFileSync(root("checkout.html"), "utf8");
  const notice = src.slice(src.indexOf("function renderWeightReviewNotice()"), src.indexOf("function renderFragranceNotice()"));
  if (!/data-support="order"/.test(notice)) throw new Error("the blocked state offers no way to write to us");
  if (!/href="mailto:/.test(notice)) throw new Error("the contact is not a real mailto");
  // …and Pagar really is disabled on that path.
  if (!/weightReview\.needsReview[\s\S]{0,200}payBtn\.disabled = true/.test(src)) {
    throw new Error("checkout does not actually stop before payment");
  }
});

check("the retailer's own weight is no longer dropped at ingestion", () => {
  /* AUDITED: all 144 products in department-cache.json carry eight
     fields and not one weight-shaped key, because slimItem()'s allowlist
     had none — layer 1 of the pipeline was deleted one step before the
     extractor that reads it. */
  const src = readFileSync(root("scripts/refresh-department-cache.js"), "utf8");
  const resolver = readFileSync(root("netlify/functions/_weight-resolve.js"), "utf8");
  const wanted = resolver.match(/const WEIGHT_FIELDS = \[([\s\S]*?)\]/)[1]
    .match(/"([^"]+)"/g).map((s) => s.replace(/"/g, ""));
  for (const field of wanted) {
    if (!src.includes(`"${field}"`)) throw new Error(`the cache still drops ${field}`);
  }
  if (!src.includes('"specifications"')) throw new Error("the specifications array is still dropped");
  // And every run reports whether layer 1 actually produced anything.
  if (!/specWeightKg\(/.test(src)) throw new Error("no spec-weight coverage is reported");
});

/* ------------------------------------------------------------------
   STREAMING THE CHAT — the reply arrives as it is written
   ------------------------------------------------------------------ */
group("aria chat: the reply streams, and it is the same reply");

check("both endpoints build the identical model request", () => {
  /* THE RISK THIS PINS is not a crash, it is a personality. Two
     endpoints answering the same question could drift on model,
     temperature or reply-length cap, and a shopper would meet a
     different Aria depending on whether streaming happened to work that
     day. The brief forbids exactly that, so the request is built once
     and both endpoints send it verbatim. */
  const body = {
    message: "¿tienen zapatillas?",
    history: [{ role: "user", content: "hola" }, { role: "assistant", content: "¡Hola!" }],
    products: [{ title: "Nike Air", retailer: "Foot Locker", priceLabel: "S/ 400" }],
    recipient: { gender: "women", ageBand: "adult", label: "una mujer" },
  };
  const req = chatModel.chatRequestBody(body);
  eq(req.model, chatModel.GROQ_MODEL);
  eq(req.temperature, chatModel.TEMPERATURE);
  eq(req.max_tokens, chatModel.MAX_TOKENS);
  eq(req.messages[0].role, "system");
  eq(req.messages[req.messages.length - 1].content, body.message, "the question is last");
  // History really travels — it was silently dropped once, and every
  // turn was answered with no memory of the one before.
  eq(req.messages.length, 4, "system + two history turns + the question");
  // The grounding the prose must not contradict.
  if (!req.messages[0].content.includes("Nike Air")) throw new Error("products are not in the system prompt");

  const groq = stripComments(readFileSync(root("netlify/functions/aria-chat-groq.js"), "utf8"));
  const stream = stripComments(readFileSync(root("netlify/functions/aria-chat-stream.js"), "utf8"));
  for (const [name, src] of [["aria-chat-groq", groq], ["aria-chat-stream", stream]]) {
    if (!/chatRequestBody\(body\)/.test(src)) throw new Error(`${name} builds its own request again`);
    // Nothing about the answer may be set locally in either file.
    for (const knob of ["temperature", "max_tokens", "model:"]) {
      if (src.includes(knob)) throw new Error(`${name} sets ${knob} itself — it belongs in _aria-chat-model.js`);
    }
    if (/buildSystemPrompt/.test(src)) throw new Error(`${name} builds its own system prompt`);
  }
  // …and the ONLY difference is the flag that makes it a stream.
  if (!/stream: true/.test(stream)) throw new Error("the streaming endpoint does not ask Groq to stream");
  if (/stream: true/.test(groq)) throw new Error("the buffered endpoint is asking for a stream");
});

check("Groq's event lines are parsed, and a bad one never ends the reply", () => {
  const line = (obj) => "data: " + JSON.stringify(obj);
  eq(chatModel.deltaFromLine(line({ choices: [{ delta: { content: "Hola" } }] })), "Hola");
  eq(chatModel.deltaFromLine(line({ choices: [{ delta: { content: " envío" } }] })), " envío");
  // The end marker is not a delta, and it is recognised for what it is.
  eq(chatModel.isDoneLine("data: [DONE]"), true);
  eq(chatModel.deltaFromLine("data: [DONE]"), null);
  /* EVERYTHING ELSE YIELDS null AND IS SKIPPED. A keep-alive, a comment,
     a half-written line, a chunk with no content — none of them may end
     a reply halfway through a sentence, which is what throwing here
     would do. */
  for (const bad of ["", ":ping", "data:", "data: {", "data: null", "event: message",
                     line({}), line({ choices: [] }), line({ choices: [{ delta: {} }] }),
                     line({ choices: [{ delta: { content: "" } }] }), null, undefined]) {
    eq(chatModel.deltaFromLine(bad), null, `skipped: ${JSON.stringify(bad)}`);
  }
  /* THE MARKER IS TRIMMED BEFORE COMPARING, and that is deliberate: an
     SSE stream is CRLF-delimited on plenty of intermediaries, so
     "data: [DONE]\r" is the same marker and refusing it would leave the
     reader waiting for an end that already came. Only the text has to
     match exactly. */
  eq(chatModel.isDoneLine("data: [DONE]\r"), true, "a CRLF stream still ends");
  eq(chatModel.isDoneLine("  data: [DONE]  "), true);
  eq(chatModel.isDoneLine("data: [DONEX]"), false, "a near-miss is not the end");
  eq(chatModel.isDoneLine("data: done"), false);
});

check("the streaming endpoint is a v2 function and cannot be buffered quietly", () => {
  const src = readFileSync(root("netlify/functions/aria-chat-stream.js"), "utf8");
  /* V1's `export async function handler(event)` returns a COMPLETE
     response object — there is nowhere to put a body that is still
     arriving, which is why this is a new file rather than a flag on the
     old one. */
  if (!/export default async function handler\(req\)/.test(src)) {
    throw new Error("not a Netlify v2 handler, so it cannot stream at all");
  }
  if (!/new ReadableStream\(/.test(src)) throw new Error("the response body is not a stream");
  const nostrip = stripComments(src);
  for (const header of ["text/event-stream", "no-cache, no-transform", "X-Accel-Buffering"]) {
    if (!nostrip.includes(header)) throw new Error(`the response is missing ${header}`);
  }
  /* FAIL BEFORE THE FIRST BYTE, NOT DURING. A model error returned as a
     status code lets the client fall back cleanly; the same error sent
     as the first event would leave an apology in the bubble with no way
     back to the endpoint that still works. */
  if (!/if \(!upstream\.ok \|\| !upstream\.body\)/.test(nostrip)) {
    throw new Error("an upstream failure is not caught before the stream opens");
  }
  // A dropped connection keeps what the shopper is already reading.
  if (!/truncated: true/.test(nostrip)) throw new Error("a mid-stream failure discards the partial reply");
  // The decoder must be told chunks continue, or a split "í" becomes a
  // replacement character — Spanish is full of them.
  if (!/decoder\.decode\(value, \{ stream: true \}\)/.test(nostrip)) {
    throw new Error("multi-byte characters split across reads will be mangled");
  }
});

check("the page streams into the same bubble, and falls back without double-rendering", () => {
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  for (const fn of ["function beginAssistantReply(", "async function streamAssistantReply(",
                    "function speakAssistantReply(", "function rememberAssistantTurn("]) {
    if (!src.includes(fn)) throw new Error(`${fn} is missing`);
  }

  const sink = src.slice(src.indexOf("function beginAssistantReply("), src.indexOf("async function streamAssistantReply("));
  /* SAME BUBBLE, SAME CLASSES. "Change only how the response appears"
     is enforced by the markup being identical to addAssistantMessage's,
     not by remembering to keep two copies in step. */
  const bubbleClass = "max-w-[85%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-[13px] leading-relaxed";
  eq(sink.includes(bubbleClass), true, "the streaming bubble is the standard bot bubble");
  eq(src.split(bubbleClass).length - 1 >= 2, true, "addAssistantMessage still uses it too");
  // NO JANK: one DOM write per frame, whatever the token rate.
  if (!/requestAnimationFrame\(flush\)/.test(sink)) throw new Error("tokens are written to the DOM unbatched");
  if (!/cancelAnimationFrame/.test(sink)) throw new Error("a pending frame is not cancelled on finish");
  // NO LAYOUT SHIFT: the indicator is removed in the same frame the
  // bubble appears, and the scroll is only pinned if already at bottom.
  if (!/hideAssistantTyping\(\);\s*\n\s*wrap\.appendChild\(bubble\)/.test(sink)) {
    throw new Error("the typing indicator and the bubble can coexist");
  }
  if (!/assistantAtBottom\(wrap\)/.test(sink)) throw new Error("streaming scrolls even when the shopper scrolled up");

  const reader = src.slice(src.indexOf("async function streamAssistantReply("), src.indexOf("function addAssistantProductCard("));
  /* Every reason a deploy might not stream has to end as a clean null:
     the function is not deployed, the browser cannot read a stream, or
     what came back is not an event stream at all. */
  for (const guard of ["typeof ReadableStream === 'undefined'", "!res.ok", "getReader !== 'function'", "event-stream"]) {
    if (!reader.includes(guard)) throw new Error(`the stream does not fall back on: ${guard}`);
  }
  if (!/if \(sink\.started\) return \{ reply: sink\.text/.test(reader)) {
    throw new Error("a stream that dies after rendering would be re-asked and answered twice");
  }
  if (!/await reader\.cancel\(\)/.test(reader)) throw new Error("cancel is not awaited — a dead socket logs an uncaught TypeError");

  const brain = src.slice(src.indexOf("async function runAssistantBrain("), src.indexOf("/* --- Voice input"));
  /* ONE PAYLOAD FOR BOTH ENDPOINTS, or which one answered could change
     what Aria was told. */
  eq((brain.match(/JSON\.stringify\(payload\)/g) || []).length, 1, "the fallback posts the same payload object");
  if (!/streamAssistantReply\(payload, sink\)/.test(brain)) throw new Error("the page never tries the stream");
  if (!/sink\.discard\(\)/.test(brain)) throw new Error("a failed stream leaves an empty bubble above the real answer");
  if (!/aria-chat-groq/.test(brain)) throw new Error("the buffered fallback is gone");
  // The turn is recorded exactly once on each path.
  eq((brain.match(/rememberAssistantTurn\(text, reply\)/g) || []).length, 2, "both paths record the turn");
  // And nothing about WHICH retailers are searched moved into this change.
  if (!/CHAT_RETAILERS/.test(src)) throw new Error("the chat's retailer routing was removed");
});

/* ------------------------------------------------------------------ */
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.log(`  FAIL  ${f}\n`);
process.exit(failures.length ? 1 : 0);

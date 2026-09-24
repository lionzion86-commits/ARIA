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
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadPageTierSlice, loadPageBudgetSlice, loadPageSubcategorySlice, loadPageWeightSlice, loadPageTileSlice, loadPageQuerySlice, loadPageShippingSlice, loadPageSupportSlice, loadPageFeeSlice, loadPageFitmentSlice, loadPageAutoSourcesSlice, loadPageEnvelopeSlice, loadPageImageUrlSlice, loadPageBrandSlice, loadPageDealSpreadSlice, loadPageRelatedSlice, loadPageFootwearSlice, loadPageCatalogSearchSlice, loadPageSizeSlice, loadPageCurvySlice } from "./_page-script.mjs";

import * as beauty from "../lib/beauty-weight.js";
import * as itemWeight from "../lib/item-weight.js";
import { estimateWeightDetail, categoryWeightKg } from "../lib/sales-sources.js";
import * as salesSources from "../lib/sales-sources.js";
import { resolveItemWeight, resolveCartWeights } from "../../netlify/functions/_weight-resolve.js";
import * as weightResolve from "../../netlify/functions/_weight-resolve.js";
import { smallOrderFeePen, SMALL_ORDER_FEE_PEN, SMALL_ORDER_THRESHOLD_PEN, SMALL_ORDER_FEE_NOTE,
         importTaxEstimateUsd, TAX_ESTIMATE_RATE, TAX_ESTIMATE_THRESHOLD_USD,
         TAX_ESTIMATE_LABEL, TAX_ESTIMATE_NOTE } from "../../weight-data.js";
import { RETAILERS, searchableRetailers, isBeautyRetailer } from "../lib/retailers.js";
import * as retailers from "../lib/retailers.js";
import * as deptMap from "../lib/department-map.js";
import { CATALOG_QUOTAS } from "../lib/catalog-quotas.js";
import { inkCoverage } from "./_png.mjs";
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
import * as subcats from "../lib/subcategories.js";
import * as brandIndex from "../lib/brand-index.js";
import * as footwear from "../lib/footwear.js";
import * as payments from "../../netlify/functions/_payments-model.js";
import * as stripeVerify from "../../netlify/functions/_stripe-verify.js";
import * as ledger from "../../netlify/functions/_ledger.js";
import { createHmac } from "node:crypto";

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

/* index.html's RETAILERS mirror, read for its logo paths only. A vm slice
   would drag in the whole registry block and everything it references;
   the mirror rows are single-line object literals, so a regex reads them
   safely and cannot be broken by unrelated code moving around. */
const pageRetailers = Object.fromEntries(
  [...readFileSync(root("index.html"), "utf8")
    .matchAll(/^\s*\w+:\s*\{\s*key: '(\w+)',[^\n]*?logo: (?:null|'([^']+)')/gm)]
    .map((m) => [m[1], m[2] ?? null]),
);

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

check("one freight line is left, and it is the feature ceiling", () => {
  eq(itemWeight.FREIGHT_FEATURE_CEILING, 1.0);
  eq(page.FREIGHT_FEATURE_CEILING, 1.0, "page mirror, ceiling");
  const src = stripComments(readFileSync(root("scripts/lib/item-weight.js"), "utf8"));
  if (/MAX_FREIGHT_SHARE/.test(src)) throw new Error("the ambiguous MAX_FREIGHT_SHARE alias is back");
  // The badge threshold is gone, not renamed.
  if (/FREIGHT_BADGE_SHARE/.test(src)) throw new Error("the badge threshold is back in the module");
  if (itemWeight.FREIGHT_BADGE_SHARE !== undefined) throw new Error("FREIGHT_BADGE_SHARE is exported again");
  if (typeof itemWeight.freightIsHigh === "function") throw new Error("freightIsHigh() is back");
});

check("the feature ceiling fires strictly above 100%, and nowhere below", () => {
  const over = (kg, price) => itemWeight.freightAboveFeatureCeiling(kg, price, 13);
  eq(over(1.5, 26), false, "58% — featurable");
  eq(over(2, 26), false, "exactly 100% — still featurable");
  eq(over(2.01, 26), true, "just over 100% — not featurable");
});

check("a heavy item inside the ceiling is featured, and carries no verdict", () => {
  /* A 74 kg dresser: ~$965 of freight against a card price of ~$1,469 —
     66%, which used to earn a "Flete alto" badge. It is featured now
     with its freight itemised and nothing labelling it. */
  const heavy = deal("6 Drawer Dresser", 900, 1600);
  if (!heavy) throw new Error("a heavy item inside the ceiling was suppressed");
  if (!(heavy.freightShare > 0.5 && heavy.freightShare <= 1)) {
    throw new Error(`fixture drifted out of the 50-100% band: ${heavy.freightShare}`);
  }
  // The share survives as data for calibration; the verdict does not.
  if ("freightHigh" in heavy) throw new Error("deals still publish a freightHigh verdict");
  const light = deal("Levi's 501 Original Fit Jeans", 60, 100);
  if (!light) throw new Error("an ordinary deal was dropped");
  if ("freightHigh" in light) throw new Error("deals still publish a freightHigh verdict");
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
  if (/FREIGHT_BADGE_SHARE/.test(cache)) {
    throw new Error("the badge threshold is back in the cache sanitizer");
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
group("category covers are curated art, not scraped inventory");

const covers = loadPageTileSlice();

/* WHY THIS GROUP REPLACED THE SCORING ONE (2026-09-22). Three rounds of
   choosing a cover from the scraper feed — first cached item, then a
   scored selection, then denylists plus a cross-tile de-duplicator — and
   a live phone still showed a USB stick for Electrónica, a bag of
   parasite cleanse for Salud y Farmacia and a headless torso for Ropa.

   The reason is structural and no tuning reaches it: the scorer reads
   TITLES. "Cargo Pants With Stretch" is a good title and a photo of a
   decapitated mannequin. So the cover is art now, and these checks pin
   the two things that keeps true. */

check("a cover is only ever a local curated asset", () => {
  /* The permanent rule, enforced by construction rather than by
     pattern-matching a price out of a photo: a remote URL is a scraper
     feed by definition, and that feed is what put a parasite cleanse on
     the pharmacy tile. */
  eq(covers.assertCuratedCover("electronics", "assets/category/electronics.jpg"),
     "assets/category/electronics.jpg", "a local path is fine");
  for (const remote of [
    "https://i5.walmartimages.com/seo/thing.jpeg",
    "http://target.scene7.com/is/image/Target/GUEST_x",
    "//content.gapinc.com/b/0056/cn56750941.png",
    "data:image/png;base64,iVBORw0KGgo=",
  ]) {
    eq(covers.assertCuratedCover("electronics", remote), null, `rejected: ${remote.slice(0, 40)}`);
  }
  eq(covers.assertCuratedCover("electronics", ""), null, "nothing configured");
  eq(covers.assertCuratedCover("electronics", undefined), null, "no entry at all");
});

check("every department has a curated photograph, and every one is on disk", () => {
  /* THE COVERS LANDED (2026-09-22). Until they did, an empty map was the
     correct state and the drawn brand field was what the homepage
     showed. Ten photographs later the fallback is a fallback again --
     and the thing to guard is that a configured cover is real. A key
     pointing at a file that is not committed renders a broken image on
     the first card a shopper sees, and nothing else in the pipeline
     would notice: the path is a string, and a string is always valid. */
  for (const [key, path] of Object.entries(covers.CATEGORY_COVERS)) {
    if (covers.categoryCoverFor(key) !== path) {
      throw new Error(`${key} is configured with something that is not a local asset: ${path}`);
    }
    if (!existsSync(root(path))) throw new Error(`${key} points at ${path}, which is not committed`);
    if (!/^assets\/category\//.test(path)) throw new Error(`${key} lives outside assets/category: ${path}`);
    // The filename IS the key, so a typo is a missing file rather than
    // the wrong picture on the right card.
    if (!new RegExp(`/${key}\\.(jpg|jpeg|png|webp)$`).test(path)) {
      throw new Error(`${key} is wired to ${path} — the filename must match the key`);
    }
  }
  /* EVERY COVER BELONGS TO A REAL DEPARTMENT. The reverse is not
     required — a department with no entry gets the drawn brand field,
     which is a deliberate treatment — but a cover for a key that does
     not exist is a file nobody will ever see. */
  for (const key of Object.keys(covers.CATEGORY_COVERS)) {
    if (!deptMap.DEPARTMENT_SPEC[key]) throw new Error(`${key} has a cover but is not a department`);
  }

  /* EVERY DEPARTMENT HAS A PHOTOGRAPH NOW. This assertion read "beauty"
     for a few hours: ten covers were delivered, and beauty had become a
     real department that same morning when Sephora, Ulta and YesStyle
     landed with 197 products between them, so it rendered the drawn
     field beside ten photographs. Naming the gap by key rather than
     tolerating it is what got the eleventh shot.

     The empty string was the load-bearing part, and it did its job
     again: a new department added without a cover is NOT a failure — it
     gets the drawn brand field, which is a deliberate treatment — but
     this line changes, and whoever changes it has to decide on purpose.

     It read "shoes" for half an hour on 2026-09-23, between Zapatos
     shipping with 539 real pairs and its photograph arriving. Back to
     "" now that shoes.jpg is on disk — twelve departments, twelve
     photographs. */
  const uncovered = Object.keys(deptMap.DEPARTMENT_SPEC).filter((k) => !covers.CATEGORY_COVERS[k]);
  eq(uncovered.join(), "", "a department is on the drawn cover — give it a photo or accept it here");
});

check("Ofertas takes a photograph but keeps its gold sign", () => {
  /* The drawn gold board exists because the two things before it were
     worse: a scraped collage (meaningless) and the navy field (identical
     to every other card). A CURATED photo is neither, so it wins — but
     only the art in the window changes. The band, its gold gradient and
     its navy type are what mark this as the sale card. */
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const tile = src.slice(src.indexOf("function deptTileHTML("), src.indexOf("function initDepartmentTiles("));
  if (!/isOfertas[\s\S]{0,120}categoryCoverFor\(t\.key\)/.test(tile)) {
    throw new Error("Ofertas cannot take a curated cover");
  }
  if (!/ofertasTileArtHTML\(\)/.test(tile)) throw new Error("the drawn board is gone, not kept as the fallback");
  // The sign is untouched: gold band, navy type, gold window backing.
  for (const rule of ["#F7CE72", "var\\(--navy\\)", "var\\(--amber\\)"]) {
    if (!new RegExp(rule).test(tile)) throw new Error(`the Ofertas sign lost ${rule}`);
  }
});

check("the cover never comes from the cache again", () => {
  /* collectTiles decides which categories EXIST and how many products
     they hold. What a category LOOKS like is art. If cover selection
     creeps back into the cache read, the junk drawer comes with it. */
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const fn = src.slice(src.indexOf("function collectTiles("));
  const body = fn.slice(0, fn.indexOf("\nfunction "));
  if (/candidates|scoreTileCandidate|pickTileImage|assignTileImages|\.thumb/.test(body)) {
    throw new Error("collectTiles is choosing cover images from the cache again");
  }
  if (/it\.image/.test(body)) throw new Error("collectTiles is reading scraped image URLs again");
  // And the retired machinery is gone, not merely unused.
  for (const dead of ["scoreTileCandidate", "pickTileImage", "assignTileImages", "TILE_IMAGE_HERO", "DEPARTMENT_THUMB_EXCLUDE"]) {
    if (new RegExp(`\\b${dead}\\b`).test(src)) throw new Error(`${dead} is still in index.html — dead code that looks live`);
  }
});

check("the fallback cover is abstract art — never a glyph, never clip-art", () => {
  /* THE BUG THIS EXISTS FOR, and it shipped to QA (2026-09-22, round 2).
     designedCoverHTML drew a 64px EMOJI in a navy ring. On an iPhone
     those are full-colour Apple glyphs, so Electronica rendered a
     cartoon laptop and Ropa a cartoon t-shirt, and Danny rejected the
     round. The brief had already ruled it out in as many words --
     "nunca un emoji como sustituto" -- and the old test here passed
     anyway, because it only asked whether the cover was drawn rather
     than fetched. It never asked WHAT was drawn.

     So this asks. Any glyph in the cover fails: the emoji ranges, the
     misc-symbols and dingbat blocks, and the variation selector that
     turns a bare character into an emoji. */
  const src = readFileSync(root("index.html"), "utf8");
  if (!/function designedCoverHTML/.test(src)) throw new Error("there is no fallback cover");
  const designed = src.slice(src.indexOf("function designedCoverHTML"), src.indexOf("function categoryCoverFallback"));
  const code = stripComments(designed);

  if (/<img/.test(code)) throw new Error("the fallback cover fetches an image — it must be drawn");

  /* Emoji and pictographs, by codepoint rather than by listing the ones
     we happen to have used: astral pictographs, misc symbols, dingbats,
     and FE0F (the emoji presentation selector).

     ESCAPE SEQUENCES COUNT. The source may spell an emoji as a literal
     \\uD83D\\uDCBB, which is not a pictograph in the FILE but is one in
     the DOM — and the version of this guard written first missed
     exactly that, because it scanned the raw text. So the escapes are
     decoded before the scan, the same way the JS engine would. */
  const decoded = code.replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
                      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const GLYPH = /[\u{1F300}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}\u{1F000}-\u{1F2FF}]/u;
  if (GLYPH.test(decoded)) {
    const hit = decoded.match(GLYPH)[0];
    throw new Error(`the fallback cover contains a pictograph (U+${hit.codePointAt(0).toString(16).toUpperCase()}) — it must be abstract, not clip-art`);
  }
  /* And no <text> at all. A pictograph is the failure that happened;
     ANY typography in the cover is the same category of mistake, since
     the category's name is already on the navy sign underneath it. */
  if (/<text[\s>]/.test(code)) throw new Error("the fallback cover is drawing type — the sign underneath carries the name");
  // And it must not reach for the icon field, which is where the emoji came from.
  if (/\.icon\b/.test(code)) throw new Error("the fallback cover is reading the category icon again — that field is emoji");

  // It is real drawn geometry, not an empty rectangle.
  if (!/<svg/.test(code)) throw new Error("the fallback cover is no longer drawn as SVG");
  if (!/<circle|<path|<rect/.test(code)) throw new Error("the fallback cover has no geometry in it");

  /* The LIGHT end of the navy family, per the brief's "tinte de la
     familia azul-claro". Drawn dark first, which put a dark window above
     a dark sign and made the whole card one blue slab. */
  /* The light end of the navy family. Matched loosely on purpose: this
     pinned four exact hex values once and broke the moment the
     composition was retuned, which taught nothing. What matters is that
     the FIELD is pale and cool, so the navy sign underneath has
     something to contrast with. */
  const fieldStops = (code.match(/stop-color="#([0-9A-Fa-f]{6})"/g) || [])
    .map((m) => m.slice(-7, -1));   // the six hex digits, without the "#"
  const pale = fieldStops.filter((hex) => {
    const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    return r > 0xB0 && g > 0xB0 && b > 0xE0 && b >= r;   // pale, and cooler than it is warm
  });
  if (pale.length < 2) throw new Error(`the fallback cover is not on a pale cool field (found ${pale.length} pale stops)`);
  if (/F4C463|--yellow|--amber/.test(code)) throw new Error("the fallback cover borrowed the discount gold");
  // Navy has to be present, or "azul/navy" is just a pale rectangle.
  if (!/0A1F44/.test(code)) throw new Error("the fallback cover has no navy in it");

  /* SVG ids are document-global and several tiles render at once, so a
     shared id makes every tile paint with the FIRST tile's gradients.
     The ids have to be per-tile. */
  const ids = code.match(/id="\$\{id\}|id="[a-z]/g) || [];
  if (!/id="\$\{id\}/.test(code)) throw new Error("SVG ids are not per-tile — every cover would paint with the first tile's gradients");

  // A curated file that 404s falls back to it rather than to alt text.
  const fb = src.slice(src.indexOf("function categoryCoverFallback"), src.indexOf("/** The art for one category"));
  if (!/designedCoverHTML/.test(fb)) throw new Error("a 404 on a curated cover no longer falls back to the drawn one");
  if (!/onerror=/.test(src.slice(src.indexOf("function categoryCoverArtHTML")))) {
    throw new Error("a curated cover has no error path");
  }
});

check("the same cover is drawn every time, and tiles do not collide", () => {
  /* The seed makes a tile stable across re-renders — a cover that
     reshuffled when the grid repainted would read as a glitch — and
     different enough between categories that a column is not six
     identical rectangles. */
  const { coverSeed } = covers;
  eq(typeof coverSeed, "function", "coverSeed is exported from the page");
  eq(coverSeed("electronics"), coverSeed("electronics"), "the same key seeds the same cover");
  const keys = ["electronics", "clothing", "men", "women", "kids", "home_goods", "candy_chocolate", "sporting_goods", "beauty"];
  const rotations = new Set(keys.map((k) => (coverSeed(k) % 25) - 12));
  if (rotations.size < 4) {
    throw new Error(`only ${rotations.size} distinct rotations across ${keys.length} categories — the set reads as identical tiles`);
  }
  // Bounded, so every tile keeps the same reading. The brief asked for
  // "mismo tratamiento de luz y recorte en todas las categorias".
  for (const k of keys) {
    const rot = (coverSeed(k) % 25) - 12;
    if (Math.abs(rot) > 12) throw new Error(`${k} rotates ${rot}deg — past the bound that keeps the set coherent`);
  }
  eq(coverSeed(""), coverSeed(""), "an empty key still seeds deterministically");
});

check("the tile carries no retailer logos and still states its count", () => {
  /* Reversed 2026-09-20: the cap (3 logos + "+N") is gone because the
     logos are gone. A category tile answers "what is this", not "who
     sells it". */
  const html = readFileSync(root("index.html"), "utf8");
  const tile = html.slice(html.indexOf("function deptTileHTML"), html.indexOf("function initDepartmentTiles"));
  if (/retailerBadgeHTML|tileRetailerRowHTML|TILE_MAX_LOGOS/.test(tile)) {
    throw new Error("the category tile still renders store marks");
  }
  if (!/producto\$\{count === 1/.test(tile)) throw new Error("the product count was dropped with the logos");
  if (!/categoryCoverArtHTML\(t\)/.test(tile)) throw new Error("the tile is not drawing the curated cover");
});

check("Ofertas is a designed tile, not a scraped product image", () => {
  const html = readFileSync(root("index.html"), "utf8");
  if (!/function ofertasTileArtHTML/.test(html)) throw new Error("the Ofertas tile art is missing");
  const art = html.slice(html.indexOf("function ofertasTileArtHTML"), html.indexOf("function deptTileHTML"));
  /* 2026-09-21: Ofertas moved from the navy field to the GOLD one. On a
     run of navy category signs, the one card that means SALE was reading
     exactly like the other eleven. Gold board, navy type — what a sale
     sign looks like in any shop. It still carries the Precio Honesto
     language, because the claim has not changed, only the colour. */
  if (/ariaNavyBand/.test(art)) throw new Error("the Ofertas tile is back on the navy field — it is the sale card");
  if (!/F4C463|var\(--amber\)/.test(art)) throw new Error("the Ofertas tile is not on the gold sale field");
  if (!/var\(--navy\)/.test(art)) throw new Error("the Ofertas type is not navy on the gold");
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
group("the Flete alto badge is gone, and cannot come back");

/* WHY IT WENT. Two rounds were spent calibrating this badge — first the
   threshold (30% -> 50%), then the denominator (raw price -> the price
   the card prints). Both were real bugs and both were fixed, and the
   badge was still wrong, because the quantity it thresholded was wrong:
   freight as a SHARE OF PRICE fires on CHEAP items, not HEAVY ones. The
   0.23 kg t-shirt below is the proof — S/ 10.07 of freight is not a high
   freight bill, the shirt is just inexpensive.

   These checks are written so that a future calibration pass cannot
   quietly reintroduce it. A heavy-item indicator may return, but on
   ABSOLUTE freight and as neutral information. */

check("no surface renders a freight verdict on a product card", () => {
  const src = readFileSync(root("index.html"), "utf8");
  const card = src.slice(src.indexOf("function productCardHTML("), src.indexOf("function renderSalesGrid("));
  /* Comments are stripped first: the card carries a note explaining what
     the badge was and why it went, and that note naming it is not the
     card rendering it. */
  const code = stripComments(card);
  if (/Flete alto/.test(code)) throw new Error("the card renders a Flete alto badge again");
  if (/FREIGHT_BADGE_SHARE|freightHeavy|freightIsHigh/.test(code)) {
    throw new Error("the card is thresholding freight as a share of price again");
  }
  if (/0\.3\b|\b30\s*%/.test(code)) throw new Error("a stray 30% threshold is back in the card");
});

check("the disclosure line the badge sat on top of is still there", () => {
  /* Killing the badge is only defensible because this line says
     everything the badge was gesturing at, in the shopper's own
     arithmetic: the cost, the weight and the rate. If it ever goes, the
     freight stops being disclosed at all. */
  const src = readFileSync(root("index.html"), "utf8");
  const card = src.slice(src.indexOf("function productCardHTML("), src.indexOf("function renderSalesGrid("));
  if (!/de flete/.test(card)) throw new Error("the card stopped itemising freight");
  if (!/CHARGE_PER_KG_USD\}\/kg/.test(card)) throw new Error("the card stopped printing the per-kg rate");
  if (!/String\(weightKg\)\)\} kg/.test(card)) throw new Error("the card stopped printing the weight");
});

check("the reported t-shirt keeps its freight line and gains no label", () => {
  /* LIVE REPORT: S/ 25.29 product, S/ 10.07 freight — 39.8%. The ratio is
     currency-free, so the sole figures are reproduced exactly by picking
     the dollar price that yields the same share. */
  const kg = estimateWeightDetail("Hello Kitty and Friends Girls T-Shirt").kg;
  const freight = itemWeight.freightUsd(kg, 13);
  const priceUsd = freight * (25.29 / 10.07);        // the reported ratio
  const share = page.freightSharePct(kg, priceUsd);
  if (Math.abs(share - 10.07 / 25.29) > 0.002) {
    throw new Error(`share drifted from the reported 39.8%: ${share}`);
  }
  // The share is still computable — the ceiling needs it — it just no
  // longer decides anything a shopper can see.
  eq(
    Math.round(page.freightSharePct(kg, priceUsd) * 1000),
    Math.round(itemWeight.freightShare(kg, priceUsd, 13) * 1000),
    "page and module still agree on the share",
  );
  // And a cheap light item is nowhere near the one line that remains.
  eq(itemWeight.freightAboveFeatureCeiling(kg, priceUsd, 13), false, "well inside the feature ceiling");
});

check("the displayed price is still what any share divides by", () => {
  // The denominator fix outlives the badge: the feature ceiling uses it.
  eq(itemWeight.shownPriceUsd(199), 199, "under the threshold, unchanged");
  eq(itemWeight.shownPriceUsd(200), 200, "at the threshold, unchanged");
  eq(itemWeight.shownPriceUsd(250), 307.5, "over the threshold, tax included");
  for (const usd of [5, 60, 199.99, 200, 200.01, 250, 1000]) {
    eq(page.displayPriceUsd(usd), itemWeight.shownPriceUsd(usd), `page mirror at $${usd}`);
  }
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

check("every store mark fills its zone, contain-fit, never stretched", () => {
  const src = readFileSync(root("index.html"), "utf8");
  /* Each <img> that draws a store mark gets a ZONE — a width, a height
     cap and a width cap — and contains inside it. That is what lets a
     1200x631 banner and a square file share a tile without either being
     distorted, AND what makes them read at the same size. */
  const imgs = src.match(/<img src="\$\{r\.logo\}"[\s\S]{0,400}?>/g) || [];
  if (imgs.length !== 2) throw new Error(`expected 2 store-mark <img> tags, found ${imgs.length}`);
  for (const img of imgs) {
    if (!/object-fit:\s*contain/.test(img)) throw new Error("a store mark is not contain-fit");
    if (!/max-height:\s*\d+px/.test(img)) throw new Error("a store mark has no height cap");
    /* px OR %. The Tiendas card's width cap became a percentage on
       2026-09-21: a fixed 130px filled 71% of a phone card and 50% of a
       desktop one, which is why the 4-across grid read as microscopic
       while the phone looked fine. A fluid card cannot hold a proportion
       with a fixed number. */
    if (!/max-width:\s*\d+(px|%)/.test(img)) throw new Error("a store mark has no width cap");
    if (/\bfilter:/.test(img)) throw new Error("a store mark carries a CSS filter");
    // Never a bare width/height, which would ignore the file's own ratio.
    if (/style="[^"]*[;\s]height:\s*\d/.test(img)) throw new Error("a store mark sets a fixed height");
    if (!/onerror=/.test(img)) throw new Error("a store mark has no fallback if the file is missing");

    /* WITHOUT width:100% THE CAPS ARE A CEILING, NOT A ZONE. max-* only
       clamps a file that is too big; it never grows one that is small,
       so a mark can sit well inside its plate with nothing pushing it
       out. This is the half of the fix that is easy to drop in a later
       edit and impossible to see in a diff. */
    if (!/[";\s]width:\s*100%/.test(img)) throw new Error("a store mark does not fill its zone (no width:100%)");

    /* THE ZONE'S SHAPE DECIDES WHO GETS STARVED. Contain-fit means a
       square mark uses the zone's height and a wordmark uses its width,
       so a zone shaped like a wordmark hands the wordmark several times
       the ink area. Sephora shipped 24px wide beside Walmart's 130px
       under a 130x34 zone (aspect 3.8) for exactly this reason.

       Equal area for a square mark and a w:1 wordmark needs
       width/height = sqrt(w). Walmart, our widest real wordmark, is
       5.26:1, so the target is 2.29 and anything past 2.5 is starving
       square marks again. */
    /* A PERCENTAGE CAP CANNOT BE CHECKED HERE, because the zone's real
       aspect depends on the card's rendered width. Where both caps are
       still pixels the shape is checked statically; where the width is a
       share of a fluid card, the equal-area guarantee is asserted in
       browser-tests.mjs against measured pixels instead — which is the
       stronger check, not a weaker one. */
    const maxH = Number(/max-height:\s*(\d+)px/.exec(img)[1]);
    const pxWidth = /max-width:\s*(\d+)px/.exec(img);
    if (pxWidth) {
      const maxW = Number(pxWidth[1]);
      const aspect = maxW / maxH;
      if (aspect > 2.5) {
        throw new Error(
          `store-mark zone is ${maxW}x${maxH} (aspect ${aspect.toFixed(2)}): too wordmark-shaped, ` +
          `square marks like Sephora and Target render a fraction of Walmart's area`,
        );
      }
    }
  }
});

check("the three beauty stores show their own logo", () => {
  /* They shipped on the wordmark treatment until their files arrived
     (2026-09-20). A regression to `logo: null` would silently put the
     text pills back, which is what Danny rejected. */
  for (const key of ["sephora", "victoriassecret", "bathandbodyworks"]) {
    const row = RETAILERS[key];
    if (!row.logo) throw new Error(`${key} is back on the wordmark pill`);
    if (!/^logos\/.+\.(png|svg)$/.test(row.logo)) throw new Error(`${key} logo path looks wrong: ${row.logo}`);
    if (!existsSync(root(row.logo))) throw new Error(`${key} points at a missing file: ${row.logo}`);
    // The page mirror has to agree, or Tiendas and the rest of the site
    // disagree about what the store looks like.
    eq(pageRetailers[key], row.logo, `${key} index.html mirror`);
  }
});

check("the beauty stores say exactly which of them has a catalogue", () => {
  /* 2026-09-22: beauty-catalog.json landed and Sephora is in it. The
     other two are not, and the point of this test is that the three
     stopped being interchangeable: "sells beauty" and "we can show you
     its products" are different claims and the registry has to make
     them separately. */
  for (const key of ["victoriassecret", "bathandbodyworks"]) {
    const r = RETAILERS[key];
    if (!r) throw new Error(`${key} left the registry`);
    eq(r.search, false, `${key} is still pending`);
    eq(r.browse, undefined, `${key} has no catalogue file`);
    eq(r.pendingNote, "Conectando el catálogo", `${key} status badge`);
  }
  const sephora = RETAILERS.sephora;
  if (!sephora) throw new Error("sephora left the registry");
  eq(sephora.search, false, "Sephora still has no actor");
  eq(sephora.browse, true, "Sephora has a catalogue now");
  eq(sephora.pendingNote, undefined, "a store with a catalogue is not 'conectando'");
});

check("the store count in the Tiendas heading is computed, not remembered", () => {
  /* It said "Ocho tiendas, todas reales" from the day eight stores fit
     a 4x2 grid, and was still saying it at twelve — Macy's, SSENSE and
     the three beauty stores all landed without touching it. A number in
     prose that nothing recomputes goes wrong quietly, which is exactly
     what this section claims not to do. */
  const src = readFileSync(root("index.html"), "utf8");
  if (/Ocho tiendas, todas reales/.test(src)) throw new Error("the heading still hardcodes eight stores");
  if (!/data-store-count/.test(src)) throw new Error("there is no slot for the real count");
  if (!/function spanishCount\(/.test(src)) throw new Error("the count has no words to render in");
});

check("the three beauty catalogue stores are registered and browsable", () => {
  // 197 products across these three, from beauty-catalog.json. All are
  // browse-without-scrape, and all must be flagged beauty so the
  // four-per-shipment banner heads their pages.
  for (const key of ["sephora", "ulta", "yesstyle"]) {
    const r = RETAILERS[key];
    if (!r) throw new Error(`${key} is not in the registry`);
    eq(r.browse, true, `${key} is browsable`);
    eq(r.search, false, `${key} stays out of the live fan-out`);
    eq(r.catalog, "beauty", `${key} is a beauty store`);
    eq(retailers.isBrowseOnlyRetailer(key), true, `${key} is browse-only`);
    if (!retailers.browsableRetailers().includes(key)) throw new Error(`${key} is not browsable`);
  }
  /* A TAGLINE MAY NOT NAME A BRAND — the SSENSE rule. The card paints a
     brand line read from the catalogue, so a hand-written name is both
     a duplicate and a promise nobody re-checks when the export moves. */
  for (const key of ["sephora", "ulta", "yesstyle"]) {
    for (const brand of ["NARS", "Rare Beauty", "Estée Lauder", "Clinique", "Anua"]) {
      if (RETAILERS[key].tagline.includes(brand)) {
        throw new Error(`${key}'s tagline names ${brand} — let topBrandsFor read it from the data`);
      }
    }
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

check("both category runs are one full-width column at every width", () => {
  /* 2026-09-21: categories went from two-across to ONE column at every
     width — "full-width, one big bold image per category, vertical
     scroll", so the page reads as a row of shopfronts rather than a
     spreadsheet. Two-up halved the image, which was the whole problem.

     PRODUCT grids are untouched and stay two-across: a product card is a
     product, not a storefront, and twelve full-width products would be a
     mile of scrolling. */
  const src = readFileSync(root("index.html"), "utf8");
  for (const id of ["categoriesGrid", "catGrid"]) {
    const at = src.indexOf(`id="${id}"`);
    if (at < 0) throw new Error(`#${id} is gone`);
    const tag = src.slice(src.lastIndexOf("<div", at), src.indexOf(">", at) + 1);
    if (!/grid-cols-1/.test(tag)) throw new Error(`#${id} has no single-column base: ${tag}`);
    if (/(?:sm|md|lg|xl):grid-cols-\d/.test(tag)) {
      throw new Error(`#${id} splits into columns at a breakpoint again: ${tag}`);
    }
  }
  /* THE PRODUCT GRID IS TWO-ACROSS, AND NOW IT ACTUALLY IS. This check's
     own comment has said "product grids stay two-across" since it was
     written, while the literal it froze was `grid-cols-1 md:grid-cols-2`
     -- one column on a phone, two only from 768px up. The comment
     described the intent and the assertion pinned the opposite, and a
     frozen string cannot tell you that.

     It asserts the SHAPE now: a two-column base, no single-column base
     hiding under it, and a gutter of at least the brief's 16px. */
  const listing = src.match(/const LISTING_GRID_CLASS = '([^']+)'/)?.[1];
  if (!listing) throw new Error("LISTING_GRID_CLASS is gone");
  if (!/\bgrid-cols-2\b/.test(listing)) throw new Error(`the product grid is not two-across on a phone: ${listing}`);
  if (/\bgrid-cols-1\b/.test(listing)) throw new Error(`the product grid is one column on a phone again: ${listing}`);
  const gutter = Number((listing.match(/\bgap-(\d+)\b/) || [])[1]);
  if (!(gutter >= 4)) throw new Error(`the product grid's gutter is ${gutter * 4}px, under the 16px the brief asks for`);

  /* AND THE SAME SHAPE ON THE THREE GRIDS WRITTEN AS LITERALS, so a
     shopper does not meet a two-across catalogue and a one-across
     Ofertas feed on the same phone. */
  for (const id of ["salesGrid", "storeResultsGrid", "liveResultsWrap"]) {
    const at = src.indexOf(`id="${id}"`);
    if (at < 0) throw new Error(`#${id} is gone`);
    const tag = src.slice(src.lastIndexOf("<div", at), src.indexOf(">", at) + 1);
    if (!/\bgrid-cols-2\b/.test(tag)) throw new Error(`#${id} is not two-across on a phone: ${tag}`);
    if (/\bgrid-cols-1\b/.test(tag)) throw new Error(`#${id} is one column on a phone again: ${tag}`);
  }
});

check("a category card is a shopfront: big window, signed, with an edge", () => {
  /* The verdict this answers: "white-on-white reads as database, not a
     place". A card needs a hard edge against the page and something you
     can read walking past — so the name sits on a navy sign (gold for
     Ofertas) under a wide window, not as navy text on white. */
  const src = readFileSync(root("index.html"), "utf8");
  const tile = src.slice(src.indexOf("function deptTileHTML("), src.indexOf("function handleDeptThumbError"));
  const code = stripComments(tile);
  /* Pinned HEIGHT, not an aspect: an aspect on a full-bleed card is a
     function of the viewport, so 16:10 came out 238px tall on a phone
     (smaller than the 4:5 it replaced) and 775px tall on a desktop. */
  if (!/heightClass:\s*'h-\[\d+px\]/.test(code)) throw new Error("the category window is not pinned to a height");
  if (/aspect:\s*'16\/10'/.test(code)) throw new Error("the category window is back on a viewport-dependent aspect");
  if (!/signBg/.test(code)) throw new Error("the category name is no longer on a sign");
  if (!/linear-gradient\(160deg, #0A1F44/.test(code)) throw new Error("the department sign is not the brand navy");
  if (!/F4C463|--amber/.test(code)) throw new Error("Ofertas no longer gets the gold version of the sign");

  /* THE WINDOW IS A LIGHT BLUE IN THE NAVY FAMILY, and specifically not
     yellow: gold is this site's discount treatment and nothing else may
     borrow it. The one gold window is Ofertas, which is the discount
     card. A grey window was the bug — #F7F8FA sat a hair from the page's
     own #FAFAF8, so the card had no edge against the page. */
  const frameCall = code.slice(code.indexOf("cardImageFrameHTML({"), code.indexOf("</button>"));
  if (!/background:\s*isOfertas \? 'var\(--amber\)' : 'var\(--sky\)'/.test(frameCall)) {
    throw new Error(`the category window is not on --sky: ${frameCall.slice(0, 160)}`);
  }
  if (/#F7F8FA|#FAFAF8/.test(frameCall)) throw new Error("the category window is back on a page-coloured grey");
  if (/--yellow/.test(frameCall)) throw new Error("the category window borrowed the discount yellow");
  // The name has to be ON the sign, i.e. light type, not navy-on-white.
  if (!/nameColor/.test(code)) throw new Error("the category name does not invert with its sign");
});

check("no image on any grid is cropped, whatever shape its frame is", () => {
  /* The frame's aspect became a parameter when categories went to a wide
     16:10 window (products stay 4:5). That makes the no-cropping rule
     MORE important, not less: a wide window with cover-fit would slice
     the top and bottom off every portrait apparel shot, which is the
     exact "half-object" failure the tile-scoring rebuild was written to
     end. A bigger window may make a contained product bigger; it never
     licences cropping it. */
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const frame = src.slice(src.indexOf("function cardImageFrameHTML("), src.indexOf("function deptTileHTML("));
  if (!/object-fit:\s*contain/.test(frame)) throw new Error("the shared photo is not contain-fit");
  if (/object-fit:\s*cover/.test(frame)) throw new Error("a cover fit is back — it crops people in half");
  if (!/aspect-ratio:\$\{aspect\}/.test(frame)) throw new Error("the frame no longer takes an aspect");
  if (!/aspect = '4\/5'/.test(frame)) throw new Error("the default frame is no longer the 4:5 product field");
  if (!/heightClass/.test(frame)) throw new Error("the frame can no longer be pinned to a height");
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
  const block = src.slice(src.indexOf("function renderAutoPartBlock("), src.indexOf("function autoPartNumberHTML("));
  if (!/vehicleFittedItems\(rawItems, vehicle\)/.test(block)) {
    throw new Error("the block does not filter to confirmed-fit items");
  }
  if (!/hasFitmentData\(rawItems, vehicle\)/.test(block)) {
    throw new Error("the block does not ask whether fitment data exists");
  }
});

check("the empty state is the fallback, not the default view", () => {
  /* CORRECTION (2026-09-20): the first cut showed the empty state
     whenever fitment could not be confirmed, which hid genuinely
     Sonata-fitting pads and killed the section. The empty state is now
     reached ONLY when the source returned nothing at all. */
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const block = src.slice(src.indexOf("function renderAutoPartBlock("), src.indexOf("function autoPartNumberHTML("));
  const gapCall = block.indexOf("fitmentGapHTML(");
  if (gapCall < 0) throw new Error("the empty state is unreachable");
  // The only guard above the empty state is "nothing came back".
  const guard = block.slice(0, gapCall);
  if (!/if \(!rawItems\.length\)/.test(guard)) {
    throw new Error("the empty state is not gated on an empty result set");
  }
  if (/hasFitmentData[^;]*\{\s*logFitmentGap/.test(block)) {
    throw new Error("missing fitment data still routes to the empty state");
  }
});

check("unconfirmed parts are shown, with the part number and no green badge", () => {
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const block = src.slice(src.indexOf("function renderAutoPartBlock("), src.indexOf("function autoPartNumberHTML("));
  // The green badge is conditional on having data; the part number is not.
  if (!/hasData \? fitmentBadgeHTML\(vehicle, true\) : ''/.test(block)) {
    throw new Error("the green badge is not gated on confirmed fitment");
  }
  if (!/extraHTML: autoPartNumberHTML\(/.test(block)) {
    throw new Error("the part number is not on the card");
  }
  // And the honest line has to say we could not confirm it.
  if (!/no podemos confirmarlo nosotros/.test(block)) {
    throw new Error("the unconfirmed branch does not say so");
  }
});

check("the empty state claims no cause it has not established", () => {
  /* It used to assert "Ese modelo no se vendió en Estados Unidos" — false
     for the 2020 Sonata, which is a US-market car. Claiming a cause we
     have not established is the same error as the badge, reversed. */
  const html = readFileSync(root("index.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const gap = html.slice(html.indexOf("function fitmentGapHTML("), html.indexOf("function askAriaForPart("));
  if (/Ese modelo no se vendió en Estados Unidos/.test(gap)) {
    throw new Error("the empty state still states a cause as fact");
  }
  if (!/No tenemos datos de calce para tu/.test(gap)) {
    throw new Error("the standard honest line is gone");
  }
  // A hedged possibility is fine; an assertion is not.
  if (/no se haya vendido/.test(gap) && !/Puede ser que/.test(gap)) {
    throw new Error("the US-market line is not hedged");
  }
});

check("the part number a buyer cross-checks is read from the payload", () => {
  // The exact shape the cache holds.
  const raw = { part_number: "D2076", line_code: "EPA", brand: "Duralast", oem_part_number: null };
  eq(autoSources.partNumberOf(raw).partNumber, "D2076");
  eq(autoSources.partNumberLabel(raw), "EPA D2076");
  eq(autoSources.partNumberLabel({ brand: "Bosch", part_number: "BC1234" }), "Bosch BC1234");
  eq(autoSources.partNumberLabel({ oem_part_number: "58101-C1A00" }), "58101-C1A00", "OEM alone still answers");
  eq(autoSources.partNumberLabel({ title: "no numbers here" }), null);
  eq(pageAuto.partNumberLabel(raw), autoSources.partNumberLabel(raw), "index.html mirror");
});

check("every cached auto part can show a number to cross-check", () => {
  /* The diligence path only works if the number is actually there. It is
     the one fitment-adjacent field the overview scrape DOES return. */
  const cache = JSON.parse(readFileSync(root("auto-cache.json"), "utf8"));
  let items = 0;
  let numbered = 0;
  for (const entry of Object.values(cache.partSearches)) {
    for (const raw of entry.autozone || []) {
      items++;
      if (autoSources.partNumberLabel(raw)) numbered++;
    }
  }
  if (!items) throw new Error("the auto cache is empty");
  const pct = Math.round((numbered / items) * 100);
  if (pct < 95) throw new Error(`only ${pct}% of cached parts carry a part number`);
});

check("the named test vehicle is in the refresh list", () => {
  /* "2020 Hyundai Sonata + pastillas de freno" is the brief's own test
     case, and the Sonata was never in AUTOZONE_VEHICLES — so it missed
     the cache and went out as a live scrape on every search. */
  const src = readFileSync(root("scripts/refresh-auto-cache.js"), "utf8");
  if (!/\{ make: "Hyundai", model: "Sonata" \}/.test(src)) {
    throw new Error("the Sonata is still not cached by the refresh script");
  }
  // And the run reports whether fitment actually arrived.
  if (!/function reportFitmentCoverage\(\)/.test(src)) {
    throw new Error("the refresh does not report fitment coverage");
  }
  if (!/AUTO_SCRAPE_MODE/.test(src)) {
    throw new Error("the coverage report does not point at the scrape mode");
  }
});

check("no layer of the auto pipeline drops fields", () => {
  /* The weight bug was an allowlist in refresh-department-cache.js. The
     same hypothesis for auto does NOT hold, and that is worth pinning:
     refresh-auto-cache.js stores what it got, and apify-scrape-status.js
     passes the dataset through. If a slimming step ever appears here, it
     must not be the thing that eats fitment. */
  const refresh = stripComments(readFileSync(root("scripts/refresh-auto-cache.js"), "utf8"));
  if (!/\.autozone = items\.slice\(0, 5\)/.test(refresh)) {
    throw new Error("the auto refresh no longer stores items verbatim — check it keeps fitment fields");
  }
  const status = stripComments(readFileSync(root("netlify/functions/apify-scrape-status.js"), "utf8"));
  if (!/JSON\.stringify\(\{ status, items \}\)/.test(status)) {
    throw new Error("the scrape status endpoint no longer passes items through verbatim");
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
  /* WHAT THIS RULE IS ACTUALLY FOR. It was written as "the grid stays at
     its symmetric eight", which is how it was phrased at the time, but
     the rule being protected is narrower and it is about PARTS SOURCES:
     RockAuto and Advance Auto live inside Aria Auto as places we buy
     car parts, and must never appear as storefront tiles a shopper can
     walk into. AutoZone predates the split and is Aria Auto's own
     source, so it is the one row in both.

     The count was a proxy for that, and it stopped being a good one the
     moment a real ninth STORE arrived: Macy's (2026-09-22), added on
     Danny's explicit instruction. Asserting 8 forever would have blocked
     every future store the shop signs, which is the opposite of what
     anyone wanted. So the rule is asserted directly. */
  const tiendas = Object.keys(RETAILERS).filter((k) => !RETAILERS[k].retired);
  for (const key of Object.keys(autoSources.AUTO_SOURCES)) {
    if (key === "autozone") continue;   // predates the split, and Aria Auto's own source
    if (tiendas.includes(key)) throw new Error(`${key} leaked into the Tiendas grid`);
  }
  // And the grid is the registry, never a hand-written list.
  const src = readFileSync(root("index.html"), "utf8");
  if (!/storefrontRetailers\(\)|activeRetailers\(\)/.test(src)) {
    throw new Error("the Tiendas grid is no longer rendered from the registry");
  }
});

check("a browsable store is not treated as one still being connected", () => {
  /* Macy's arrived as a FILE, not an actor, which split an assumption
     this registry was built on: `search` meant both "browsable" and
     "queryable live". A store with a catalogue and no scraper was
     showing the "Conectando el catálogo" holding message over 754 real
     products, and wearing the muted plate on Tiendas. */
  eq(retailers.isBrowseOnlyRetailer("macys"), true, "Macy's is browse-only");
  eq(retailers.searchableRetailers().includes("macys"), false, "Macy's must stay out of the live fan-out");
  if (!retailers.browsableRetailers().includes("macys")) throw new Error("Macy's is not browsable");
  // A store with no catalogue at all is still pending. (Sephora used to
  // be this example and stopped being one when beauty-catalog.json
  // landed — which is the distinction working, not a regression.)
  eq(retailers.isBrowseOnlyRetailer("victoriassecret"), false, "Victoria's Secret has no catalogue yet");

  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  // Both the card and the chip must read BOTH flags, or Macy's is muted.
  // Scoped to those two functions: "pending" is a common local name.
  for (const fn of ["storeCardHTML", "homeStoreChipHTML"]) {
    const at = src.indexOf(`function ${fn}(`);
    if (at < 0) throw new Error(`${fn} is gone`);
    const body = src.slice(at, at + 600);
    const line = /const pending = [^;]+;/.exec(body)?.[0];
    if (!line) throw new Error(`${fn} no longer computes a pending state`);
    if (!/r\.search \|\| r\.browse/.test(line)) {
      throw new Error(`${fn} still reads search alone: ${line}`);
    }
  }
  // The storefront gate too.
  if (!/!\(meta\.search \|\| meta\.browse\)/.test(src)) {
    throw new Error("openStore still shows the holding message for a browse-only store");
  }
  // Catalogue paths read the browsable list; search paths must not.
  if (!/const CATALOG_RETAILERS = /.test(src)) throw new Error("index.html has no browsable-retailer list");
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

check("the freight these bottles earn is a small slice of the price", () => {
  /* The badge that reported this is gone, but the WEIGHT bug it exposed
     is the thing this check exists for: 0.68 kg on a $12 bottle was a
     63% freight ratio manufactured out of one coarse category row. The
     old 0.50 line is used here as a fixed yardstick, not as a threshold
     the code still consults. */
  const OLD_BADGE_LINE = 0.5;
  const d3 = estimateWeightDetail("Nature Made Vitamin D3 2000 IU, 180 Softgels");
  const share = itemWeight.freightShare(d3.kg, 12, 13);      // S/ 46.88 is about $12
  if (share > OLD_BADGE_LINE) {
    throw new Error(`a vitamin bottle still reads as high-freight: ${Math.round(share * 100)}%`);
  }
  if (!(itemWeight.freightShare(0.68, 12, 13) > OLD_BADGE_LINE)) {
    throw new Error("the fixture no longer reproduces the reported weight bug");
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
   IMPORT TAX AT CHECKOUT (2026-09-21) — threshold on FOB, math on CIF.
   ------------------------------------------------------------------ */
group("checkout: the import-tax estimate");

const round2 = (n) => Math.round(n * 100) / 100;

check("the threshold is FOB and the base is CIF — they are different numbers", () => {
  /* THE TRAP THIS EXISTS FOR. Getting these the same way round is the
     classic way to be wrong in both directions at once:
       - thresholding on CIF taxes a $180 order whose freight pushed the
         total over $200, which the customer would be right to dispute;
       - computing on FOB under-collects on every heavy parcel, and Aria
         eats the difference on the orders where it is largest. */
  eq(importTaxEstimateUsd(180, 60), 0, "FOB under the line, CIF over it — no tax");
  eq(importTaxEstimateUsd(250, 0), round2(250 * TAX_ESTIMATE_RATE), "no freight: CIF is just the goods");
  eq(importTaxEstimateUsd(250, 40), round2(290 * TAX_ESTIMATE_RATE), "freight is in the base");
  // And the base really is bigger than the goods alone whenever there is freight.
  if (!(importTaxEstimateUsd(250, 40) > importTaxEstimateUsd(250, 0))) {
    throw new Error("freight stopped counting toward the tax base");
  }
});

check("the line is drawn strictly above $200, and nowhere below", () => {
  eq(importTaxEstimateUsd(199.99, 50), 0, "just under");
  eq(importTaxEstimateUsd(200, 50), 0, "exactly $200 is not over $200");
  if (!(importTaxEstimateUsd(200.01, 50) > 0)) throw new Error("a cent over the line owes nothing");
  eq(TAX_ESTIMATE_THRESHOLD_USD, 200, "the de minimis figure");
});

check("nothing is owed on an order with no goods, or a nonsense one", () => {
  for (const bad of [0, -5, null, undefined, NaN, "abc"]) {
    eq(importTaxEstimateUsd(bad, 40), 0, `FOB ${String(bad)}`);
  }
  // A broken freight figure must not poison a real tax: fall back to
  // goods-only rather than returning NaN into a customer's total.
  eq(importTaxEstimateUsd(250, NaN), round2(250 * TAX_ESTIMATE_RATE), "unusable freight");
  eq(importTaxEstimateUsd(250, -10), round2(250 * TAX_ESTIMATE_RATE), "negative freight");
});

check("the rate is configuration, not arithmetic scattered through the UI", () => {
  /* Danny asked for a configurable constant precisely so the first real
     SUNAT document can calibrate it. If a literal rate reappears in a
     surface, changing the constant stops changing the charge. */
  for (const rel of ["checkout.html", "netlify/functions/orders-create.js"]) {
    const src = stripComments(readFileSync(root(rel), "utf8"));
    if (/0\.25\b/.test(src)) throw new Error(`${rel} hardcodes the 25% rate instead of reading TAX_ESTIMATE_RATE`);
    if (/\bDUTY_RATE\b/.test(src)) throw new Error(`${rel} still uses the old courier DUTY_RATE`);
  }
  const wd = readFileSync(root("weight-data.js"), "utf8");
  if (/export const DUTY_RATE/.test(wd)) throw new Error("two competing tax rates are exported again");
});

check("the estimate is labelled an estimate, with the refund promise on it", () => {
  /* The promise is the whole reason Aria may own this number instead of
     passing the courier's through: over-estimate refunds as saldo,
     under-estimate is absorbed. Copy that drops it turns a promise into
     a surcharge. */
  if (!/estimado/i.test(TAX_ESTIMATE_LABEL)) throw new Error("the tax line no longer says estimado");
  if (!/saldo Aria/.test(TAX_ESTIMATE_NOTE)) throw new Error("the refund promise is gone from the note");
  const checkout = readFileSync(root("checkout.html"), "utf8");
  if (!/TAX_ESTIMATE_NOTE/.test(checkout)) throw new Error("checkout stopped rendering the promise");
  if (!/TAX_ESTIMATE_LABEL/.test(checkout)) throw new Error("checkout hardcodes the label instead of reading it");
});

check("checkout stops deriving the tax out of the courier's total", () => {
  /* It used to read `total_usd - valor - flete_usd`, which made the
     figure a residual of AVI's arithmetic: unpredictable in advance, and
     different again whenever the local fallback ran instead. */
  const checkout = stripComments(readFileSync(root("checkout.html"), "utf8"));
  if (/total_usd\s*-\s*valor\s*-\s*\w*flete/.test(checkout)) {
    throw new Error("the tax is being derived from the courier total again");
  }
  if (!/importTaxEstimateUsd\(/.test(checkout)) throw new Error("checkout no longer computes its own estimate");
  // The fallback quote must not add a second tax of its own.
  const fb = checkout.slice(checkout.indexOf("function fallbackQuote("));
  const body = fb.slice(0, fb.indexOf("\n  }") + 4);
  if (/duty/i.test(body)) throw new Error("the fallback quote is adding its own duty again");
});

check("the policy note is generated from the constants that decide the charge", () => {
  /* It read "~23% ... sobre el valor declarado" while the code charged a
     different rate on a different base. Copy and rule come from the same
     two constants now, or they drift apart again. */
  const checkout = readFileSync(root("checkout.html"), "utf8");
  // Comments are stripped: the code carries a note explaining what the
  // old copy said and why it went, and that is not the page saying it.
  const code = stripComments(checkout);
  if (/~23%|23% de aranceles/.test(code)) throw new Error("the stale 23% policy copy is back");
  if (!/TAX_ESTIMATE_RATE \* 100/.test(code)) throw new Error("the policy note no longer reads the rate");
});

/* ------------------------------------------------------------------
   THE PERSON WHO ACTUALLY RECEIVES THE BOX
   ------------------------------------------------------------------ */
check("every surface that describes the charge quotes the charged rate", () => {
  /* The cart's tax-zone bar used to alias IMPORT_TAX_RATE — the rate the
     CARDS price with — which was correct while checkout also charged 23%
     on declared value. It would now promise "~23% adicional" on an order
     the payment page bills at 25%. A bar that states a government charge
     has to state the one we actually bill, so it mirrors
     TAX_ESTIMATE_RATE and this pins the mirror. */
  const page = readFileSync(root("index.html"), "utf8");
  const mirrored = page.match(/const TAX_ZONE_RATE = ([\d.]+)/)?.[1];
  if (!mirrored) throw new Error("TAX_ZONE_RATE is gone from index.html");
  eq(Number(mirrored), TAX_ESTIMATE_RATE, "cart tax-zone bar vs weight-data.js");
  // The threshold is the goods, on both surfaces — the bar's own comment
  // is emphatic that freight must not enter this base, and so is
  // importTaxEstimateUsd().
  const zoneThreshold = page.match(/const TAX_ZONE_THRESHOLD_USD = (\w+)/)?.[1];
  eq(zoneThreshold, "IMPORT_TAX_THRESHOLD_USD", "the bar still measures the de minimis on goods");

  /* And the assistant, which speaks to customers in its own words: it
     was telling them ~23% on declared value, and that the checkout line
     was already inside the card price. */
  const prompt = readFileSync(root("netlify/functions/_aria-prompt.js"), "utf8");
  const rules = prompt.slice(prompt.indexOf("SHIPPING_RULES_ES"));
  if (/aproximadamente 23%/.test(rules)) throw new Error("the assistant still quotes 23% for the checkout charge");
  if (!/aproximadamente 25%/.test(rules)) throw new Error("the assistant does not quote the charged rate");
  if (!/ESTIMADO/.test(rules)) throw new Error("the assistant no longer calls the figure an estimate");
  if (!/saldo Aria/.test(rules)) throw new Error("the assistant no longer knows the refund promise");
  // It must not tell a shopper the freight can push them over the line.
  if (!/el umbral se mide sobre los productos/.test(rules)) {
    throw new Error("the assistant no longer states that the threshold is on the goods");
  }
});

group("checkout: someone else receives the parcel");

check("the recipient fields are required only while they are visible", () => {
  /* A `required` field inside a hidden block makes the form
     permanently unsubmittable AND unfocusable — the browser refuses to
     submit and then cannot scroll to what it is complaining about. So
     required-ness is toggled with the checkbox, never authored in the
     markup. */
  const checkout = readFileSync(root("checkout.html"), "utf8");
  const block = checkout.slice(checkout.indexOf('id="altRecipientFields"'), checkout.indexOf("</section>", checkout.indexOf('id="altRecipientFields"')));
  if (/\brequired\b/.test(block)) throw new Error("a recipient field is hard-coded required inside the hidden block");
  const code = stripComments(checkout);
  if (!/el\.required = on/.test(code)) throw new Error("required-ness is no longer toggled with the checkbox");
  for (const id of ["recName", "recDoc", "recRelation"]) {
    if (!new RegExp(`'${id}'`).test(code)) throw new Error(`${id} is not in the required set`);
  }
});

check("all four fields the brief asked for are on the form", () => {
  const checkout = readFileSync(root("checkout.html"), "utf8");
  for (const [id, label] of [
    ["recName", /Nombre del receptor/],
    ["recDoc", /Documento \(DNI \/ CE\)/],
    ["recRelation", /Relaci[óo]n con el comprador/],
    ["recInstructions", /Instrucciones de entrega/],
  ]) {
    if (!new RegExp(`id="${id}"`).test(checkout)) throw new Error(`${id} is missing from checkout`);
    if (!label.test(checkout)) throw new Error(`${id} has lost its label`);
  }
  if (!/No ser[ée] yo quien reciba el paquete/.test(checkout)) throw new Error("the toggle copy is gone");
});

check("a nominated recipient without a document is refused server-side", () => {
  /* The form marks it required, but a form can be bypassed, and a box
     that reaches Lima addressed to a name with no document is a failed
     delivery we have already paid freight on. Aduanas and the courier
     both check ID at handoff. */
  const src = stripComments(readFileSync(root("netlify/functions/orders-create.js"), "utf8"));
  if (!/function normalizeRecipient/.test(src)) throw new Error("the server does not normalize the recipient");
  if (!/!recipient\.name \|\| !recipient\.idNumber/.test(src)) {
    throw new Error("the server accepts a recipient with no name or no document");
  }
  if (!/statusCode: 400/.test(src.slice(src.indexOf("recipientAsked")))) {
    throw new Error("an invalid recipient no longer rejects the order");
  }
});

check("the recipient reaches the courier on the manifest", () => {
  const cols = shippingService.MANIFEST_COLUMNS;
  for (const col of ["Destinatario", "Documento", "Relación", "Instrucciones de entrega"]) {
    if (!cols.includes(col)) throw new Error(`the manifest lost its "${col}" column`);
  }
  const row = shippingService.manifestRow({
    shipmentId: "ENV-1", recipient: {
      name: "María Q.", idNumber: "12345678", relationship: "Mi mamá",
      phone: "+51 900", address: "Av. 1", city: "Lima",
      deliveryInstructions: "Dejar con el portero",
    },
  });
  eq(row.length, cols.length, "row and header disagree on width");
  eq(row[cols.indexOf("Relación")], "Mi mamá", "relación column");
  eq(row[cols.indexOf("Instrucciones de entrega")], "Dejar con el portero", "instructions column");
  // Still no cost column on the sheet handed to the courier.
  if (cols.some((c) => /costo|cost|margen/i.test(c))) throw new Error("a cost column reached the courier manifest");
});

check("the order record has somewhere to put the real tax from day one", () => {
  /* taxActual and sunatDocRef exist before the reconciliation UI does,
     so an order placed today is still resolvable later. A field added
     afterwards leaves every earlier order permanently unreconcilable. */
  const src = readFileSync(root("netlify/functions/orders-create.js"), "utf8");
  for (const field of ["taxEstimatedUsd", "taxEstimatedPen", "taxActualUsd", "sunatDocRef", "taxReconciledAt", "recipient"]) {
    if (!new RegExp(`\\b${field}\\b`).test(src)) throw new Error(`the order record has no ${field}`);
  }
  const code = stripComments(src);
  // Recomputed, never accepted: the same rule the small-order fee follows.
  if (!/importTaxEstimateUsd\(priceUsdTotal, freightUsdQuoted\)/.test(code)) {
    throw new Error("the server takes the browser's tax figure instead of recomputing it");
  }
  if (/taxEstimatedUsd\s*[:=]\s*(Number\()?body\./.test(code)) {
    throw new Error("the charged tax comes from the request body");
  }
  // The customer's total is goods + freight + Aria's tax, not AVI's total.
  if (!/priceUsdTotal \+ freightUsdQuoted \+ taxEstimatedUsd/.test(code)) {
    throw new Error("the customer total is no longer built from Aria's own numbers");
  }
  if (!/courierTotalUsd/.test(code)) throw new Error("the courier's own total is no longer recorded for margin");
});

/* ------------------------------------------------------------------
   MACY'S (2026-09-22) — the first store browsable from a file.
   ------------------------------------------------------------------ */
group("Macy's: a catalogue without a scraper");

const macysCatalog = JSON.parse(readFileSync(root("macys-catalog.json"), "utf8"));
const macysItems = macysCatalog.retailers.macys.departments.women.items;

check("the catalogue is real, and says how complete it is", () => {
  /* THE FIRST EXPORT WAS SHORT and this is the guard that made that
     visible rather than silent. It arrived at exactly 2 MiB — an upload
     cap, not corrupt data — so the builder recovers complete products
     and records what it could not reach. A catalogue quietly claiming
     960 while serving 431 is the thing being prevented.

     The complete file landed on 2026-09-22 (data/macys-catalog-
     2026-09-21.json, 960 products, parses whole), so the recovery path
     is no longer load-bearing. It is still asserted, because the next
     export can be short again and the catalogue must keep saying so. */
  if (!(macysItems.length > 300)) throw new Error(`only ${macysItems.length} items published`);
  eq(macysCatalog.declaredProductCount, 960, "what the export claimed");
  if (!(macysCatalog.recoveredProductCount <= macysCatalog.declaredProductCount)) {
    throw new Error("recovered more products than the export declared");
  }
  eq(typeof macysCatalog.truncatedExport, "boolean", "truncation is recorded either way");
  /* And what is SERVED today is the whole export. If a future build
     regresses to a partial one this fails, which is the point: the
     difference between 754 items and 431 is half the store. */
  eq(macysCatalog.recoveredProductCount, macysCatalog.declaredProductCount,
     "every declared product was recovered");
  eq(macysCatalog.truncatedExport, false, "the served catalogue is built from a complete export");
  eq(macysCatalog.retailers.macys.label, "Macy's");
});

check("prices are RAW USD — the margin is applied by the page, once", () => {
  /* Baking 1.07 x 1.24 into the file would be the drift: Macy's cards
     would stop moving when the constants move, and nobody would see it
     until the two retailers disagreed on screen. normalizeLiveItem()
     owns the chain for every store. */
  const src = readFileSync(root("scripts/build-macys-catalog.mjs"), "utf8");
  if (/1\.24|1\.07|SALES_TAX_RATE|LIVE_PRICE_MARKUP/.test(src)) {
    throw new Error("the builder is applying the markup — that belongs to normalizeLiveItem");
  }
  for (const it of macysItems) {
    if (!(typeof it.price === "number" && it.price > 0)) throw new Error(`bad price on "${it.name}"`);
    if (!it.name) throw new Error("an item has no name");
    // A US clothing price over $2000 would mean a marked-up or bad figure.
    if (it.price > 2000) throw new Error(`implausible raw price ${it.price} on "${it.name}"`);
    if (it.originalPrice != null && !(it.originalPrice > it.price)) {
      throw new Error(`"${it.name}" claims a discount that is not one`);
    }
  }
});

check("every image URL is built from one base, so one fix reaches all", () => {
  /* The export ships Scene7 path fragments and no host, so the URL is
     constructed — and it could not be verified from the build container,
     whose egress proxy refuses every host outside a small allowlist. The
     value of one base is that a wrong guess is a one-line fix and a
     re-run, not 754 edits. */
  const bases = new Set(macysItems.filter((i) => i.image).map((i) => i.image.split("/products/")[0]));
  eq(bases.size, 1, `images come from ${bases.size} different bases`);
  for (const it of macysItems) {
    for (const url of it.images || []) {
      if (!/^https:\/\//.test(url)) throw new Error(`non-https image on "${it.name}"`);
    }
  }
  // And a URL that 404s must degrade to the placeholder, not a broken icon.
  const page = stripComments(readFileSync(root("index.html"), "utf8"));
  const photo = page.slice(page.indexOf("function cardPhotoHTML"), page.indexOf("function cardPhotoFallback"));
  if (!/onerror=/.test(photo)) throw new Error("a product photo has no error path");
  if (!/function cardPhotoFallback/.test(page)) throw new Error("there is no photo fallback");
});

check("the catalogue never claims its images were screened", () => {
  /* scripts/image-price-scan.js is what clears an image of rendered
     price text, and it fetches every image — impossible from the build
     container. So no Macy's item carries imageReview: "clean", because
     that would be a claim nobody made. Omitting the field is the
     documented "live scrape, unscreened" state normalizeLiveItem
     already handles, and is how every other retailer's items arrive. */
  for (const it of macysItems) {
    if (it.imageReview === "clean") throw new Error(`"${it.name}" claims a screening that never ran`);
  }
});

check("Juniors is womenswear, not childrenswear", () => {
  /* 19 Macy's items — sequined corset gowns, strapless ball gowns,
     wide-leg jeans — landed in Moda Niños because KID_MARKER matched
     "Juniors". In US retail that is a young women's size range. */
  const women = "Juniors' Strapless Lace Corset Midi Dress";
  eq(deptMap.genderFromTitle(women), null, "no positive gender marker in a Juniors title");
  eq(deptMap.genderOfItem({ name: women }, "women"), "women", "so it inherits the women bucket");
  // Real childrenswear markers still work.
  for (const kid of ["Boys' Graphic Tee", "Girls' Denim Jacket", "Toddler Sneakers", "Kids' Hoodie"]) {
    eq(deptMap.genderFromTitle(kid), "kids", kid);
  }
  // And the page mirror agrees, or the two disagree about the same item.
  const page = readFileSync(root("index.html"), "utf8");
  const pageKid = /const KID_MARKER = (.+)/.exec(page)?.[1];
  const modKid = /const KID_MARKER = (.+)/.exec(readFileSync(root("scripts/lib/department-map.js"), "utf8"))?.[1];
  eq(pageKid, modKid, "KID_MARKER mirror");
  if (/junior/i.test(pageKid || "")) throw new Error("Juniors is back in the kids matcher");
});

check("Macy's is browsable but never queried, and its logo fills the zone", () => {
  const row = RETAILERS.macys;
  eq(row.browse, true, "browse");
  eq(row.search, false, "search — there is no actor for Macy's");
  eq(row.kind, "general");
  if (!existsSync(root(row.logo))) throw new Error(`missing logo file: ${row.logo}`);
  /* The supplied PNG was 800x600 with the mark occupying 24% of the
     height — in the Tiendas zone that renders about 19px tall, the exact
     "microscopic logo" bug. The empty canvas is cropped out (colours
     untouched), which makes it a wordmark shape like Old Navy's and lets
     the shared zone do its job. */
  const png = readFileSync(root(row.logo));
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  const aspect = w / h;
  if (aspect < 2) {
    throw new Error(`macys.png is ${w}x${h} (aspect ${aspect.toFixed(2)}): the empty canvas is back, so the mark will render tiny`);
  }
});

/* ==================================================================
   THE OPS DASHBOARD, AND THE PAYMENT TRUTH IT RESTS ON (2026-09-22)
   ------------------------------------------------------------------ */
group("payments: an order may not claim money that never arrived");

check("orders-create never writes a paid-looking status", () => {
  /* THE BUG THIS PINS. orders-create.js wrote status "confirmed" on
     every order the checkout form posted, and nothing had charged
     anybody: a search of the whole repo for "stripe" returned zero
     hits, there was no card form and no webhook. "Confirmed" meant
     "the browser posted a form" on the one field ops would reconcile a
     bank statement against. */
  const src = stripComments(readFileSync(root("netlify/functions/orders-create.js"), "utf8"));
  if (/status:\s*["']confirmed["']/.test(src)) {
    throw new Error('orders-create is writing status "confirmed" again — nothing there takes money');
  }
  if (!/status:\s*["']pending_payment["']/.test(src)) throw new Error("orders start somewhere other than pending_payment");
  if (!/paymentStatus:\s*["']unpaid["']/.test(src)) throw new Error("orders-create no longer records paymentStatus: unpaid");
});

check("only the verified webhook can move an order to paid", () => {
  /* The whole guarantee in one assertion: grep every file that writes
     paymentStatus and prove the list is exactly the two files allowed
     to — the model that decides, and the store-facing shell. Anything
     else writing it (an admin endpoint, a browser-reachable function)
     would be a path to "paid" that Stripe never confirmed. */
  /* _ledger.js is on this list because it copies an order's
     paymentStatus onto a REPORT ROW. It writes no order record, and a
     ledger that could not name a payment state would be useless. The
     rule being protected is "nothing else may DECIDE that an order is
     paid", and a report cannot. */
  const allowed = new Set(["_payments-model.js", "_payments.js", "_ledger.js"]);
  const dir = root("netlify/functions");
  const offenders = [];
  const walk = (d, prefix = "") => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const rel = prefix + entry.name;
      if (entry.isDirectory()) { walk(`${d}/${entry.name}`, rel + "/"); continue; }
      if (!entry.name.endsWith(".js")) continue;
      const src = stripComments(readFileSync(`${d}/${entry.name}`, "utf8"));
      // An assignment or object key, not a read.
      if (/paymentStatus\s*[:=]\s*(?!=)/.test(src) && !allowed.has(entry.name)) {
        // orders-create sets the honest initial value; that is not a claim.
        if (entry.name === "orders-create.js" && !/paymentStatus:\s*["'](?!unpaid)/.test(src)) continue;
        offenders.push(rel);
      }
    }
  };
  walk(dir);
  if (offenders.length) {
    throw new Error(`these write paymentStatus but must not: ${offenders.join(", ")}`);
  }
  // And the webhook refuses outright with no secret, rather than 200.
  const hook = stripComments(readFileSync(root("netlify/functions/stripe-webhook.js"), "utf8"));
  if (!/503/.test(hook)) throw new Error("the webhook no longer fails closed when unconfigured");
});

check("a Stripe signature is verified, not trusted", () => {
  const secret = "whsec_unit_test";
  const raw = '{"id":"evt_1","type":"payment_intent.succeeded"}';
  const t = Math.floor(Date.now() / 1000);
  const good = createHmac("sha256", secret).update(`${t}.${raw}`, "utf8").digest("hex");

  const v = (header, opts = {}) => stripeVerify.verifyStripeSignature({ rawBody: raw, header, secret, ...opts });
  eq(v(`t=${t},v1=${good}`).ok, true, "a correct signature passes");
  eq(v(`t=${t},v1=${"0".repeat(64)}`).ok, false, "a wrong signature fails");
  eq(stripeVerify.verifyStripeSignature({ rawBody: raw + " ", header: `t=${t},v1=${good}`, secret }).ok, false,
     "one extra byte in the body fails");
  eq(v("").ok, false, "a missing header fails");
  eq(v(`v1=${good}`).ok, false, "no timestamp fails");
  eq(v(`t=${t}`).ok, false, "no v1 fails");
  eq(v(`t=${t},v1=zzz`).ok, false, "non-hex fails rather than throwing");
  eq(v(`t=${t},v1=${good.slice(0, 20)}`).ok, false, "a short signature fails rather than throwing");
  // Replay: a captured request re-sent an hour later.
  const old = t - 3600;
  const oldSig = createHmac("sha256", secret).update(`${old}.${raw}`, "utf8").digest("hex");
  eq(v(`t=${old},v1=${oldSig}`).ok, false, "a stale timestamp fails even with a valid signature");
  // Rotation: two v1s, one of them ours.
  eq(v(`t=${t},v1=${"1".repeat(64)},v1=${good}`).ok, true, "any matching v1 passes, so a secret can be rotated");
  // No secret at all must never pass.
  eq(stripeVerify.verifyStripeSignature({ rawBody: raw, header: `t=${t},v1=${good}`, secret: "" }).ok, false,
     "an unset secret can never verify");
});

check("a refund is not a cancellation, and a partial one is not a refund", () => {
  /* Ops reconciling a SUNAT over-estimate would read a S/ 20 goodwill
     refund as the whole order coming back, and chase money that is
     still ours. */
  const base = payments.applyPaymentEvent(null, {
    paymentId: "pi_1", type: "payment_intent.succeeded", currency: "pen",
    amount: 500, orderId: "ARIA-1", occurredAt: "2026-09-22T10:00:00Z", eventId: "e1",
  });
  eq(base.status, "succeeded");
  const partial = payments.applyPaymentEvent(base, {
    paymentId: "pi_1", type: "charge.refunded", currency: "pen",
    amount: 500, amountRefunded: 20, occurredAt: "2026-09-22T11:00:00Z", eventId: "e2",
  });
  eq(partial.status, "partially_refunded", "20 of 500 back is not a refund");
  const full = payments.applyPaymentEvent(partial, {
    paymentId: "pi_1", type: "charge.refunded", currency: "pen",
    amount: 500, amountRefunded: 500, occurredAt: "2026-09-22T12:00:00Z", eventId: "e3",
  });
  eq(full.status, "refunded", "all of it back is a refund");
  eq(full.orderId, "ARIA-1", "a later event without metadata must not orphan a matched payment");
  eq(full.events.length, 3, "the history is append-only");
});

check("fulfilment follows payment and never walks backwards", () => {
  const paid = { paymentId: "pi_1", provider: "stripe", status: "succeeded", currency: "pen", amount: 100, paidAt: "2026-09-22T10:00:00Z" };
  const fresh = payments.orderPatchForPayment({ orderId: "A", status: "pending_payment", pricePenCharged: 100 }, paid);
  eq(fresh.paymentStatus, "paid");
  eq(fresh.status, "confirmed", "a paid order moves out of pending_payment");
  eq(fresh.amountMismatchPen, 0, "an exact amount is not a mismatch");

  // An order ops already moved on is not dragged back to "confirmed".
  const shipped = payments.orderPatchForPayment({ orderId: "A", status: "cancelled", pricePenCharged: 100 }, paid);
  eq(shipped.status, undefined, "a status ops set by hand is left alone");

  // Failure never reads as paid.
  const failed = payments.orderPatchForPayment({ orderId: "A", status: "pending_payment", pricePenCharged: 100 },
    { paymentId: "pi_1", status: "failed", currency: "pen", amount: 0 });
  eq(failed.paymentStatus, "failed");
  eq(failed.status, undefined, "a failed payment does not confirm anything");

  // The mismatch that ops must see.
  const short = payments.orderPatchForPayment({ orderId: "A", status: "pending_payment", pricePenCharged: 364.04 },
    { paymentId: "pi_1", status: "succeeded", currency: "pen", amount: 200 });
  if (!(short.amountMismatchPen < -100)) throw new Error("a short payment is not flagged");
  // Unknowable is null, never 0 — a 0 reads as "checked, and they agree".
  const noFx = payments.orderPatchForPayment({ orderId: "A", status: "pending_payment" },
    { paymentId: "pi_1", status: "succeeded", currency: "usd", amount: 50 });
  eq(noFx.amountMismatchPen, null, "an uncheckable amount is null, not zero");
});

check("a payment nobody can explain is flagged, never dropped", () => {
  const order = { orderId: "ARIA-1", pricePenCharged: 100 };
  eq(payments.needsAttention({ paymentId: "p", orderId: "ARIA-1", amount: 100, currency: "pen" }, order), null,
     "a clean payment needs nothing");
  if (!payments.needsAttention({ paymentId: "p", orderId: null, amount: 100, currency: "pen" }, null)) {
    throw new Error("a payment with no order id is not flagged");
  }
  if (!payments.needsAttention({ paymentId: "p", orderId: "ARIA-GHOST", amount: 100, currency: "pen" }, null)) {
    throw new Error("a payment naming a missing order is not flagged");
  }
  if (!payments.needsAttention({ paymentId: "p", orderId: "ARIA-1", amount: 40, currency: "pen" }, order)) {
    throw new Error("a wrong amount is not flagged");
  }
  if (!payments.needsAttention({ paymentId: "p", orderId: "ARIA-1", amount: 100, currency: "usd" }, order)) {
    throw new Error("a foreign currency is not flagged");
  }
  // Both metadata spellings, because whoever creates the intent picks one.
  eq(payments.orderIdFromMetadata({ orderId: "A" }), "A");
  eq(payments.orderIdFromMetadata({ order_id: "B" }), "B");
  eq(payments.orderIdFromMetadata({}), null);
  eq(payments.orderIdFromMetadata(null), null);
});

check("Stripe's differently-shaped objects all flatten to one record", () => {
  const at = Math.floor(Date.parse("2026-09-22T10:00:00Z") / 1000);
  const pi = stripeVerify.normalizeStripeEvent({
    id: "e1", type: "payment_intent.succeeded", created: at, livemode: true,
    data: { object: { id: "pi_1", currency: "PEN", amount: 12000, amount_received: 11900, metadata: { orderId: "A" } } },
  });
  eq(pi.paymentId, "pi_1");
  eq(pi.amount, 119, "amount_received wins — it is what actually cleared");
  eq(pi.currency, "pen", "currency is lowercased once, here");

  const charge = stripeVerify.normalizeStripeEvent({
    id: "e2", type: "charge.refunded", created: at,
    data: { object: { id: "ch_1", payment_intent: "pi_1", currency: "pen", amount: 12000, amount_refunded: 2000 } },
  });
  eq(charge.paymentId, "pi_1", "a charge event keys on its payment intent, not the charge");
  eq(charge.amountRefunded, 20);

  const session = stripeVerify.normalizeStripeEvent({
    id: "e3", type: "checkout.session.completed", created: at,
    data: { object: { id: "cs_1", payment_intent: "pi_9", currency: "pen", amount_total: 5000, metadata: { orderId: "B" } } },
  });
  eq(session.paymentId, "pi_9");
  eq(session.orderId, "B");

  // Nothing to key on: recorded as ignored rather than crashing.
  eq(stripeVerify.normalizeStripeEvent({ id: "e4", type: "customer.created", data: { object: { id: "cus_1" } } }), null);
});

check("the raw body is what gets hashed, base64 or not", () => {
  /* Netlify hands some bodies back base64-encoded. Hashing the encoded
     string instead of the bytes Stripe signed rejects every genuine
     event, which looks exactly like an attack and is not one. */
  const body = '{"a":1}';
  eq(stripeVerify.rawBodyOf({ body, isBase64Encoded: false }), body);
  eq(stripeVerify.rawBodyOf({ body: Buffer.from(body).toString("base64"), isBase64Encoded: true }), body);
  eq(stripeVerify.rawBodyOf({}), "");
});

/* ------------------------------------------------------------------ */
group("ledger: a blank is not a zero");

check("an explicit null stays blank all the way into the CSV", () => {
  /* THE BUG THIS PINS, and it is subtle: Number(null) is 0 and finite,
     so the obvious coercion turns every deliberately-null field into a
     measured zero. orders-create.js writes explicit nulls, so every
     unpaid order reported "cobrado real S/ 0.00" and every unreconciled
     one "impuesto real SUNAT S/ 0.00" — a blank rendered as a fact, in
     the file that goes to an accountant. It survived an earlier test
     because that test used a record with the keys MISSING (undefined),
     which coerces to NaN and behaved correctly. */
  const order = {
    orderId: "ARIA-20260922-NULL01", createdAt: "2026-09-22T00:00:00Z",
    customer: { name: "Sin conciliar" }, items: [], fxRateUsed: 3.8,
    pricePenCharged: 50, paymentStatus: "unpaid", status: "pending_payment",
    taxActualPen: null, taxActualUsd: null, amountCapturedPen: null,
    amountRefundedPen: null, freteChargedUsd: null, smallOrderFeePen: null,
    gatewayFeeEstimatePen: null, orderTotalPen: null, walletAppliedPen: null,
  };
  const row = ledger.ledgerRow(order, null, null);
  for (const field of ["taxActualPen", "amountCapturedPen", "capturedPen", "refundedPen",
                       "freightPen", "smallOrderFeePen", "gatewayFeeEstimatePen", "marginPen"]) {
    if (row[field] === 0) throw new Error(`${field} came back as 0 for a null input — a blank became a measurement`);
  }
  const csv = ledger.ledgerCsv([row]);
  const [header, body] = csv.replace(/^﻿/, "").trim().split("\r\n");
  const cols = header.split('","').map((c) => c.replace(/^"|"$/g, ""));
  const cells = body.split('","').map((c) => c.replace(/^"|"$/g, ""));
  for (const label of ["Impuesto real SUNAT (PEN)", "Cobrado real pasarela (PEN)", "Margen Aria (PEN)",
                       "Flete cobrado (PEN)", "Reembolsado (PEN)"]) {
    eq(cells[cols.indexOf(label)], "", `"${label}" must be blank, not a number`);
  }
});

check("margin is blank until BOTH real costs exist, then it is arithmetic", () => {
  const order = {
    orderId: "ARIA-1", createdAt: "2026-09-22T00:00:00Z", customer: { name: "X" },
    items: [{ name: "a", priceUsd: 240, qty: 1 }], fxRateUsed: 3.8,
    pricePenCharged: 1251.15, amountCapturedPen: 1251.15, amountRefundedPen: 0,
    walletAppliedPen: 0, gatewayFeeEstimatePen: 50.42,
    taxEstimatedPen: 250.23, taxActualPen: 197.6,
    freteChargedUsd: 23.4, buyerEmail: "m@x.pe",
  };
  eq(ledger.ledgerRow(order, null, null).marginPen, null, "no actuals, no margin");
  eq(ledger.ledgerRow({ ...order, actuals: { precioRealPagadoUsd: 190 } }, null, null).marginPen, null,
     "half the actuals is still no margin");

  const full = { ...order, actuals: { precioRealPagadoUsd: 190, costoRealCourierUsd: 17.1 } };
  const row = ledger.ledgerRow(full, null, null);
  // 1251.15 - (190*3.8) - (17.1*3.8) - 50.42 - 197.6
  eq(row.marginPen, 216.15, "margin is revenue minus the real costs");

  /* Saldo issued is a COST. Leaving it out overstated margin by exactly
     the amount of every tax refund: we collect 250.23, pay SUNAT 197.60
     and hand 52.63 back, which should net to zero, not to profit. */
  const wallet = { txns: [{ kind: "credit", amountPen: 52.63, orderId: "ARIA-1" }] };
  eq(ledger.ledgerRow(full, null, wallet).marginPen, 163.52, "issued saldo comes off the margin");
  eq(ledger.ledgerRow(full, null, wallet).creditIssuedPen, 52.63);
  // A credit for a DIFFERENT order must not land on this row.
  const other = { txns: [{ kind: "credit", amountPen: 99, orderId: "ARIA-OTHER" }] };
  eq(ledger.ledgerRow(full, null, other).creditIssuedPen, null);
});

check("a guest order's saldo still reaches its ledger row", () => {
  /* buyerEmail is only set for a signed-in checkout. A guest's tax
     refund is still issued to the address they typed, so keying the
     wallet on buyerEmail alone left those credits issued, owed, and
     invisible in the ledger. */
  eq(ledger.walletEmailFor({ buyerEmail: "a@x.pe", customer: { email: "b@x.pe" } }), "a@x.pe");
  eq(ledger.walletEmailFor({ buyerEmail: null, customer: { email: "b@x.pe" } }), "b@x.pe");
  eq(ledger.walletEmailFor({ customer: {} }), null);
});

check("the CSV cannot be made to shift a column or run a formula", () => {
  /* Customer names and ops notes are free text. A cell beginning "=" is
     executed by Excel, and an unescaped quote shifts every column after
     it — in the one file that leaves the building. */
  eq(ledger.csvCell('=cmd|"/c calc"!A0'), '"\t=cmd|""/c calc""!A0"', "a formula is neutered and its quotes doubled");
  eq(ledger.csvCell("+1"), '"\t+1"');
  eq(ledger.csvCell("-1"), '"\t-1"');
  eq(ledger.csvCell("@SUM(1)"), '"\t@SUM(1)"');
  eq(ledger.csvCell('O"Brien, Lima'), '"O""Brien, Lima"', "quotes and commas cannot shift a column");
  eq(ledger.csvCell(null), '""', "null is an empty cell, never the text null");
  eq(ledger.csvCell(0), '"0"', "a real zero still prints");

  const csv = ledger.ledgerCsv([]);
  eq(csv.charCodeAt(0), 0xFEFF, "a BOM, or Excel renders every accented heading as mojibake");
  // Header and body are generated from ONE list, so they cannot drift.
  const header = csv.replace(/^﻿/, "").trim();
  eq(header.split('","').length, ledger.LEDGER_COLUMNS.length, "one column per declared column");
});

check("the ledger carries every column the brief asked for", () => {
  const labels = ledger.LEDGER_COLUMNS.map(([l]) => l).join(" | ");
  for (const want of [/Producto/, /Flete cobrado/, /Impuesto estimado/, /Impuesto real SUNAT/,
                      /Margen Aria/, /Reembolsado/, /Saldo Aria emitido/]) {
    if (!want.test(labels)) throw new Error(`the ledger lost a required column: ${want}`);
  }
  // Every declared field is one a row actually produces.
  const row = ledger.ledgerRow({ orderId: "A", items: [], customer: {} }, null, null);
  for (const [label, field] of ledger.LEDGER_COLUMNS) {
    if (!(field in row)) throw new Error(`column "${label}" reads row.${field}, which no row has`);
  }
});

/* ------------------------------------------------------------------ */
group("the ops dashboard is admin-only, and says what it cannot know");

check("every admin endpoint gates on a session AND the allowlist", () => {
  /* isAdmin(email) alone is not a check — a caller can claim any email.
     It is only a check paired with getSessionEmail(event), which reads
     the httpOnly cookie server-side. */
  for (const f of ["admin-dashboard.js", "admin-orders-list.js", "admin-orders-update.js",
                   "admin-settings.js", "admin-shipping.js", "admin-wallet-credit.js"]) {
    const src = stripComments(readFileSync(root(`netlify/functions/${f}`), "utf8"));
    if (!/getSessionEmail\(event\)/.test(src)) throw new Error(`${f} does not read the session`);
    if (!/isAdmin\(/.test(src)) throw new Error(`${f} does not check the allowlist`);
    if (!/403/.test(src)) throw new Error(`${f} has no refusal path`);
  }
});

check("the dashboard never serves a secret, only whether one is set", () => {
  const src = readFileSync(root("netlify/functions/admin-dashboard.js"), "utf8");
  // Boolean(...) only — never the value, never a prefix, never a length.
  if (/STRIPE_WEBHOOK_SECRET(?!\s*\))/.test(src.replace(/Boolean\(process\.env\.STRIPE_WEBHOOK_SECRET\)/g, ""))) {
    // A mention in a comment or a message is fine; a read that is not
    // wrapped in Boolean() is not.
    const reads = src.match(/process\.env\.STRIPE_WEBHOOK_SECRET/g) || [];
    const wrapped = src.match(/Boolean\(process\.env\.STRIPE_WEBHOOK_SECRET\)/g) || [];
    if (reads.length !== wrapped.length) throw new Error("the dashboard reads the signing secret's value");
  }
  const page = readFileSync(root("admin.html"), "utf8");
  if (/whsec_/.test(page)) throw new Error("a signing secret is hardcoded in the admin page");
});

check("the dashboard pages its reads instead of fetching every order", () => {
  /* admin-orders-list.js does one Blobs GET per order, for every order,
     on every load — 3,600 reads a quarter in a function with a
     10-second budget, and the whole history including PII over a phone's
     mobile data. The dashboard lists keys once and fetches a page. */
  const src = stripComments(readFileSync(root("netlify/functions/admin-dashboard.js"), "utf8"));
  if (!/slice\(offset,\s*offset \+ limit\)/.test(src)) throw new Error("the orders page is no longer a slice");
  if (!/MAX_PAGE/.test(src)) throw new Error("there is no page ceiling");
  if (!/SUMMARY_SCAN_MAX/.test(src)) throw new Error("the summary scan is unbounded again");
  // And an unreadable record must not take the whole view down.
  if (!/unreadable/.test(src)) throw new Error("a failed read is no longer counted");
});

check("the admin page is not customer-facing and pulls no CDN", () => {
  const page = readFileSync(root("admin.html"), "utf8");
  if (!/noindex/.test(page)) throw new Error("the ops dashboard is indexable");
  // An ops tool must load on bad mobile data, not on a CDN's good day.
  const external = page.match(/https?:\/\/[^"')\s]+/g) || [];
  const offsite = external.filter((u) => !/ariashop\.pe/.test(u));
  if (offsite.length) throw new Error(`admin.html loads from off-site: ${offsite.join(", ")}`);
  // Every interpolation of server data has to go through esc().
  if (!/function esc\(/.test(page)) throw new Error("there is no escaper");
  const redirects = readFileSync(root("_redirects"), "utf8");
  if (!/^\/admin\s+\/admin\.html\s+200/m.test(redirects)) throw new Error("/admin does not resolve");
});

check("a real zero is recordable, because a waived fee is a measurement", () => {
  /* `Number(x) || null` was turning a genuine 0 into "unknown": a
     courier that waived its fee costs 0, and a parcel that arrived the
     same day is 0 days. Both were being stored as though nobody had
     measured them, which is the one thing the actuals record is for. */
  const src = stripComments(readFileSync(root("netlify/functions/admin-orders-update.js"), "utf8"));
  if (/Number\(actuals\.\w+\)\s*\|\|\s*null/.test(src)) {
    throw new Error("a real zero is being recorded as unknown again");
  }
  if (!/taxActual/.test(src)) throw new Error("there is no SUNAT reconciliation path");
  if (!/creditDuePen/.test(src)) throw new Error("the over-collected difference is not reported back");
  /* And recording the figure must not MOVE money on its own — issuing
     saldo stays a named, deliberate act through admin-wallet-credit. */
  if (/postTransaction|wallet/i.test(src)) {
    throw new Error("the data-entry endpoint is moving money");
  }
});

/* ==================================================================
   SUBCATEGORIES — the aisle inside a department (2026-09-22)
   ------------------------------------------------------------------ */
group("subcategories: a department is aisles, not a wall");

const pageSubs = loadPageSubcategorySlice();

check("the page's aisle table is the module's, to the letter", () => {
  /* index.html is a plain <script> and cannot import, so the table is
     duplicated there. Every mirror in this codebase is pinned the same
     way — a table that drifts is a shopper seeing different aisles on
     two surfaces of the same site. */
  const mine = subcats.SUBCATEGORY_SPEC.map((r) => `${r.key}|${r.label}|${r.types.join(",")}`);
  const theirs = pageSubs.SUBCATEGORY_SPEC.map((r) => `${r.key}|${r.label}|${r.types.join(",")}`);
  eq(theirs.length, mine.length, "aisle count");
  for (let i = 0; i < mine.length; i++) {
    if (mine[i] !== theirs[i]) throw new Error(`aisle ${i} differs\n  module: ${mine[i]}\\n  page:   ${theirs[i]}`);
  }
  // And the split thresholds, which decide whether aisles appear at all.
  eq(pageSubs.SPLIT_MIN_ITEMS, subcats.SPLIT_MIN_ITEMS, "SPLIT_MIN_ITEMS");
  eq(pageSubs.SPLIT_MIN_TYPED_SHARE, subcats.SPLIT_MIN_TYPED_SHARE, "SPLIT_MIN_TYPED_SHARE");
  eq(pageSubs.SPLIT_MIN_AISLES, subcats.SPLIT_MIN_AISLES, "SPLIT_MIN_AISLES");
});

check("the order is editorial, and lingerie is last", () => {
  /* THE BUG, AND THE FIX, IN ONE ASSERTION. Macy's "Women" was 754
     products in one price-sorted feed whose first several phone screens
     were bras and panties; 228 dresses were sitting behind them. Sorting
     aisles by size would put lingerie second and rebuild the problem, so
     the order is declared, and this is what stops anyone "improving" it
     into a count sort. */
  /* ONE TABLE, TWO FLOORS (2026-09-22). The beauty aisles were appended
     when beauty-catalog.json landed, so "last in the array" is no
     longer the same question as "last on the womenswear floor". The
     rule was always per-department: lingerie last among the apparel
     aisles, fragancia last among the beauty ones. Both are asserted,
     because both are the same fix. */
  const keys = subcats.SUBCATEGORY_SPEC.map((r) => r.key);
  const BEAUTY_AISLES = ["face", "lips", "eyes", "skincare", "nails", "fragrance"];
  const apparel = keys.filter((k) => !BEAUTY_AISLES.includes(k));
  const beauty = keys.filter((k) => BEAUTY_AISLES.includes(k));
  eq(apparel[0], "dresses", "dresses lead");
  eq(apparel[apparel.length - 1], "lingerie", "lingerie is last on the apparel floor");
  eq(beauty[beauty.length - 1], "fragrance", "fragancia is last on the beauty floor");
  // The two blocks do not interleave: an apparel aisle after a beauty
  // one would put "Rostro" in the middle of a womenswear department the
  // day some store reports both.
  eq(keys.slice(0, apparel.length).join(), apparel.join(), "the apparel block is contiguous and first");
  // The grouping the brief asked for, exactly.
  const lingerie = subcats.SUBCATEGORY_SPEC.find((r) => r.key === "lingerie").types;
  for (const t of ["BRA", "PANTY", "UNDERWEAR", "LINGERIE", "SHAPEWEAR", "SLEEPWEAR"]) {
    if (!lingerie.includes(t)) throw new Error(`${t} is not in the lingerie aisle`);
  }
  // No type may sit in two aisles — an item would then be in two places
  // and the counts would not add up to the department.
  const seen = new Map();
  for (const row of subcats.SUBCATEGORY_SPEC) {
    for (const t of row.types) {
      const norm = subcats.normalizeType(t);
      if (seen.has(norm)) throw new Error(`type ${norm} is in both ${seen.get(norm)} and ${row.key}`);
      seen.set(norm, row.key);
    }
  }
});

check("a type nobody mapped is not lost, and not guessed at", () => {
  eq(subcats.subcategoryForType("DRESS"), "dresses");
  eq(subcats.subcategoryForType("dress"), "dresses", "case does not matter");
  eq(subcats.subcategoryForType("Backpack / Messenger"), "bags", "punctuation does not matter");
  eq(subcats.subcategoryForType("BACKPACK_MESSENGER"), "bags");
  // The honest null: unknown, not a guess and not a junk aisle.
  eq(subcats.subcategoryForType("KAYAK"), null);
  eq(subcats.subcategoryForType(""), null);
  eq(subcats.subcategoryForType(null), null);
  eq(subcats.subcategoryForType(undefined), null);

  /* AN UNKNOWN AISLE KEY YIELDS NOTHING, NEVER EVERYTHING. A stale URL
     pointing at a renamed aisle must not quietly serve the flat list the
     aisle was built to replace. */
  const items = [{ type: "DRESS" }, { type: "BRA" }];
  eq(subcats.itemsInSubcategory(items, "dresses").length, 1);
  eq(subcats.itemsInSubcategory(items, "nope").length, 0, "an unknown key is empty, not everything");
  eq(subcats.itemsInSubcategory(items, null).length, 2, "no key means the whole department");

  // And it is reported, so a new type is noticed rather than buried.
  const orphans = subcats.unmappedTypes([{ type: "KAYAK" }, { type: "KAYAK" }, { type: "DRESS" }]);
  eq(orphans.length, 1);
  eq(orphans[0].type, "KAYAK");
  eq(orphans[0].count, 2);
});

check("splitting is refused when it would not help", () => {
  /* Three guards, all about not making navigation worse than the flat
     list it replaces. */
  const many = (type, n) => Array.from({ length: n }, () => ({ type }));

  // Too few items: a flat list is not the problem yet.
  const small = subcats.groupBySubcategory([...many("DRESS", 10), ...many("BRA", 10), ...many("JEANS", 10)]);
  eq(subcats.shouldSplit(small), false, "30 items do not need aisles");

  // Too few aisles: one aisle plus "Ver todo" is two routes to one page.
  const narrow = subcats.groupBySubcategory(many("DRESS", 200));
  eq(subcats.shouldSplit(narrow), false, "a single aisle is not a split");

  // Mostly untyped: the aisles would be a veneer over a list that is
  // still mostly unreachable except through "Ver todo".
  const thin = subcats.groupBySubcategory([
    ...many("DRESS", 20), ...many("BRA", 20), ...many("JEANS", 20), ...many("", 200),
  ]);
  eq(subcats.shouldSplit(thin), false, "a mostly untyped feed does not split");

  // And the real shape does split.
  const real = subcats.groupBySubcategory([
    ...many("DRESS", 228), ...many("BRA", 141), ...many("PANTS", 87), ...many("JACKET", 76),
  ]);
  eq(subcats.shouldSplit(real), true, "a big, typed, multi-aisle department splits");
  eq(real.rows[0].key, "dresses", "and the rows come back in editorial order");
  eq(real.rows[real.rows.length - 1].key, "lingerie");
  eq(real.typed, real.total, "everything typed is placed");
});

check("the counts an aisle promises are the counts it can deliver", () => {
  /* A list promising 228 and delivering 12 is worse than no list. The
     group counts and the filter have to agree, item for item. */
  const items = [
    ...Array.from({ length: 5 }, (_, i) => ({ type: "DRESS", id: `d${i}` })),
    ...Array.from({ length: 3 }, (_, i) => ({ type: "BRA", id: `b${i}` })),
    ...Array.from({ length: 2 }, (_, i) => ({ type: "KAYAK", id: `k${i}` })),
  ];
  const g = subcats.groupBySubcategory(items);
  for (const row of g.rows) {
    eq(subcats.itemsInSubcategory(items, row.key).length, row.count, `${row.key} delivers what it promised`);
  }
  eq(g.total, 10, "total counts the untyped too");
  eq(g.typed, 8);
  eq(g.untyped, 2, "the unmapped two are still in the department");
  // "Ver todo" is the whole thing, orphans included.
  eq(subcats.itemsInSubcategory(items, null).length, 10);
});

check("Macy's ships a type on every item, and all of them map", () => {
  /* The export carries detail.typeName on 100% of products and the
     builder was throwing it away, which is the whole reason Women could
     only be one flat bucket. */
  const items = macysCatalog.retailers.macys.departments.women.items;
  const missing = items.filter((it) => !it.type);
  if (missing.length) throw new Error(`${missing.length} Macy's items carry no type`);
  const orphans = subcats.unmappedTypes(items);
  if (orphans.length) {
    throw new Error(`Macy's types with no aisle: ${orphans.map((o) => `${o.type}(${o.count})`).join(", ")}`);
  }
  const g = subcats.groupBySubcategory(items);
  eq(subcats.shouldSplit(g), true, "Macy's Women splits");
  if (!(g.rows.length >= 8)) throw new Error(`only ${g.rows.length} aisles`);
  // Dresses really are the biggest, which is why leading with underwear
  // was so costly.
  const dresses = g.rows.find((r) => r.key === "dresses");
  if (!(dresses && dresses.count > 200)) throw new Error("the dresses aisle lost its dresses");
});

check("the page routes an aisle instead of swapping it silently", () => {
  /* An aisle has to get its own URL, or back goes out of the category
     and a shopper cannot share what they are looking at. Same rule the
     store chips already follow. */
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  if (!/params:\s*\['kind',\s*'catKey',\s*'retailerFilter',\s*'subKey'\]/.test(src)) {
    throw new Error("subKey is not part of the catalogue route");
  }
  if (!/function setCatalogSub\(/.test(src)) throw new Error("there is no aisle navigation");
  if (!/pushRoute\(\{ view: 'catalogView', kind, catKey: key, retailerFilter, subKey \}\)/.test(src)) {
    throw new Error("openCatalog no longer pushes the aisle onto the route");
  }
  /* THE RULE THE BRIEF SET: no aisle may be the default. The landing
     renders the LIST when nothing is chosen — if this branch ever starts
     picking an aisle, the biggest one buries the rest exactly the way
     underwear buried the dresses. */
  if (!/splittable && !catalogState\.subKey/.test(src)) {
    throw new Error("the aisle landing is no longer the default for a splittable department");
  }
  // And "Ver todo" survives as a real destination.
  if (!/SUB_ALL/.test(src)) throw new Error("Ver todo is gone");
});

/* ==================================================================
   TIERS, THE UNIVERSAL DEALS FEED, AND BUDGET (2026-09-22)
   ------------------------------------------------------------------ */
group("tiers group the directory and gate nothing");

check("a tier is presentation, never a filter", () => {
  /* THE RULE THAT MATTERS. Danny's call is that the directory shows a
     high-end section; his other three calls all say the opposite of a
     gate — Ofertas aggregates every store "sin importar el tier", and
     search compares SSENSE against Foot Locker. So a tier decides a
     HEADING and nothing else, and this is what stops it quietly
     becoming a filter. */
  const grouped = retailers.retailersByTier();
  const inTiers = grouped.flatMap((t) => t.stores.map((s) => s.key)).sort();
  const active = retailers.activeRetailers().map((r) => r.key).sort();
  eq(inTiers.join(","), active.join(","), "every active store appears in exactly one tier");
  eq(new Set(inTiers).size, inTiers.length, "and no store appears twice");

  // The capability lists must not read `tier` at all.
  const src = stripComments(readFileSync(root("scripts/lib/retailers.js"), "utf8"));
  const searchable = src.slice(src.indexOf("export function searchableRetailers"));
  const browsable = src.slice(src.indexOf("export function browsableRetailers"));
  for (const [name, body] of [["searchableRetailers", searchable.slice(0, 300)], ["browsableRetailers", browsable.slice(0, 300)]]) {
    if (/tier/.test(body)) throw new Error(`${name} reads tier — a tier must never decide capability`);
  }
});

check("the default tier is written down, not inferred by accident", () => {
  /* A row with no tier lands in `everyday` deliberately. Leaving that
     implicit is how a new store ends up under whichever heading the
     code happened to check first. */
  eq(retailers.tierOf({ key: "x" }), "everyday");
  eq(retailers.tierOf({ key: "x", kind: "auto" }), "auto", "a parts source is its own section");
  eq(retailers.tierOf({ key: "x", tier: "luxury" }), "luxury");
  eq(retailers.tierOf(null), "everyday", "a missing row still resolves");
  // An empty tier renders no heading rather than an empty band.
  const keys = retailers.retailersByTier().map((t) => t.key);
  for (const t of retailers.retailersByTier()) {
    if (!t.stores.length) throw new Error(`tier ${t.key} came back empty`);
  }
  if (!keys.includes("luxury")) throw new Error("the high-end tier has no stores in it");
});

check("SSENSE replaces Nordstrom, and says what it actually is", () => {
  const ssense = retailers.RETAILERS.ssense;
  if (!ssense) throw new Error("SSENSE is not in the registry");
  eq(ssense.tier, "luxury");
  eq(Boolean(ssense.retired), false);
  /* THE BRANDS, NOT THE NAME — BUT FROM THE DATA, NOT FROM A STRING.

     This row was written from the brief as "Gucci, Prada, Balenciaga"
     and the export that arrived carries NEITHER Gucci NOR Prada. The
     tagline had been promising two labels the store does not stock, and
     nothing would ever have caught it, because a hand-written brand
     list is a claim no test can check against reality.

     So the rule inverted and got stronger: the tagline names NO brand,
     and the card derives its brand line from the catalogue. A card can
     now only ever name a label the store is actually carrying. */
  const NAMED_BRANDS = /Gucci|Prada|Balenciaga|Rick Owens|Moncler|Stone Island|Adidas/i;
  if (NAMED_BRANDS.test(ssense.tagline || "")) {
    throw new Error("the SSENSE tagline hardcodes a brand — brands come from the catalogue, or they are a promise nobody checks");
  }
  const page = stripComments(readFileSync(root("index.html"), "utf8"));
  if (!/function topBrandsFor\(/.test(page)) throw new Error("the store card no longer derives its brands");
  if (!/data-brandline/.test(page)) throw new Error("the store card has no brand slot");

  /* BROWSABLE NOW, because the catalogue file landed (2026-09-22). The
     Macy's rule still holds in the other direction: a store may only
     claim to be browsable when a file actually backs it, and the test
     below proves this one does. */
  eq(ssense.browse, true, "SSENSE is browsable — its catalogue is committed");
  eq(ssense.search, false, "and still has no actor, so it stays out of the live fan-out");
  if (!existsSync(root("ssense-catalog.json"))) {
    throw new Error("SSENSE claims to be browsable with no catalogue file behind it");
  }
  if (!retailers.browsableRetailers().includes("ssense")) {
    throw new Error("SSENSE has a catalogue but is not in the browsable list");
  }
  // Nordstrom stays retired, with the reason recorded.
  eq(retailers.RETAILERS.nordstrom.retired, true);
  if (!/bot protection/i.test(retailers.RETAILERS.nordstrom.retiredNote || "")) {
    throw new Error("Nordstrom's retirement no longer records why");
  }
});

check("SSENSE's catalogue is real, and every type finds an aisle", () => {
  /* THE SECOND STORE IS THE TEST OF THE FIRST STORE'S DESIGN. Macy's
     said "JACKET"; SSENSE says "JACKETS", "SLIPPERS & LOAFERS",
     "HOODIES & ZIPUPS". If the aisle map had only ever been written
     against Macy's, SSENSE Men would have arrived as one flat bucket of
     2,426 — the exact bug the aisles were built to fix, on the store
     where it would hurt most. */
  const cat = JSON.parse(readFileSync(root("ssense-catalog.json"), "utf8"));
  const items = cat.retailers.ssense.departments.men.items;
  if (!(items.length > 2000)) throw new Error(`only ${items.length} SSENSE items`);
  eq(cat.truncatedExport, false, "the export is complete");
  eq(cat.recoveredProductCount, cat.declaredProductCount, "every declared product recovered");

  const orphans = subcats.unmappedTypes(items);
  if (orphans.length) {
    throw new Error(`SSENSE types with no aisle: ${orphans.map((o) => `${o.type}(${o.count})`).join(", ")}`);
  }
  const g = subcats.groupBySubcategory(items);
  eq(g.typed, g.total, "every SSENSE item is placed");
  eq(subcats.shouldSplit(g), true, "SSENSE Men splits into aisles");

  // Menswear, so no dresses aisle — and that is correct, not a gap.
  if (g.rows.some((r) => r.key === "dresses")) throw new Error("a menswear department grew a dresses aisle");

  // Prices stay raw USD, like every other catalogue file.
  for (const it of items) {
    if (!(typeof it.price === "number" && it.price > 0)) throw new Error(`bad price on "${it.name}"`);
    if (it.originalPrice != null && !(it.originalPrice > it.price)) {
      throw new Error(`"${it.name}" claims a discount that is not one`);
    }
  }
  const src = readFileSync(root("ssense-catalog.json"), "utf8");
  if (/"currency"\s*:\s*"(?!USD)/.test(src)) throw new Error("a non-USD price is in the catalogue");
});

check("the singular fallback places plurals without mangling real ones", () => {
  /* The fallback is only tried after an exact miss, so a token that
     genuinely ends in S is never chopped. This is what keeps "PANTS"
     out of the "PANT" that does not exist, and "JEANS" out of "JEAN". */
  eq(subcats.subcategoryForType("JACKETS"), "outerwear", "plural falls back");
  eq(subcats.subcategoryForType("JACKET"), "outerwear", "singular still exact");
  eq(subcats.subcategoryForType("PANTS"), "pants", "a real trailing S is matched exactly first");
  eq(subcats.subcategoryForType("JEANS"), "jeans");
  eq(subcats.subcategoryForType("SHORTS"), "pants");
  // Compound tokens are written out, not guessed.
  eq(subcats.subcategoryForType("SLIPPERS & LOAFERS"), "shoes");
  eq(subcats.subcategoryForType("LACE UPS & OXFORDS"), "shoes");
  eq(subcats.subcategoryForType("HOODIES & ZIPUPS"), "knitwear");
  eq(subcats.subcategoryForType("PYJAMAS & LOUNGEWEAR"), "lingerie");
  // And the fallback must not invent a match out of nothing.
  eq(subcats.subcategoryForType("KAYAKS"), null, "an unknown plural is still unknown");
});

check("both catalogue files load, and neither can take the other down", () => {
  /* A browse-only store is one line in CATALOGUE_FILES. Each fetch
     catches its own failure, so a missing or broken file leaves that
     store empty and every other store working — the alternative is one
     bad JSON taking the whole site's categories with it. */
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const fn = src.slice(src.indexOf("function loadDepartmentCache("), src.indexOf("const DEPARTMENT_META"));
  for (const file of ["macys-catalog.json", "ssense-catalog.json", "beauty-catalog.json"]) {
    if (!fn.includes(file)) throw new Error(`${file} is not loaded`);
    if (!existsSync(root(file))) throw new Error(`${file} is referenced but not committed`);
  }
  const catches = (fn.match(/\.catch\(/g) || []).length;
  if (catches < 2) throw new Error("a catalogue file can take the scraped cache down with it");
  /* EVERY file goes through the envelope adapter, not just the one that
     needed it. beauty-catalog.json shipped its departments as bare
     arrays; the next export will be shaped its own way too, and an
     adapter applied to one file is an adapter somebody forgets. */
  if (!/\.then\(normalizeCatalogueEnvelope\)/.test(fn)) {
    throw new Error("catalogue files are not normalized at the load boundary");
  }
});

check("the page's tier table is the module's", () => {
  const page = loadPageTierSlice();
  const mine = retailers.TIERS.map((t) => `${t.key}|${t.label}|${t.blurb}`);
  const theirs = page.TIERS.map((t) => `${t.key}|${t.label}|${t.blurb}`);
  eq(theirs.join("\n"), mine.join("\n"), "TIERS");
  eq(page.DEFAULT_TIER, retailers.DEFAULT_TIER, "DEFAULT_TIER");
});

/* ------------------------------------------------------------------ */
group("Ofertas aggregates every store, scraped or filed");

check("a store with a FILE and no actor still reaches the deals feed", () => {
  /* THE GAP (2026-09-22). SALES_SOURCES is a hand-written list of
     retailer+department pairs and every entry is a store with an actor.
     Macy's has no actor — its catalogue is a committed file — so its 405
     discounted items, a median 40% off, were invisible in Ofertas while
     sitting in plain view inside the store. Nobody broke anything; the
     feed had no way to see a store that is not scraped. */
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  if (!/function fileBackedDeals\(/.test(src)) throw new Error("file-backed stores no longer feed Ofertas");
  const fn = src.slice(src.indexOf("async function fileBackedDeals("), src.indexOf("async function runSalesScan("));
  /* NO DOUBLE COUNTING, BY CONSTRUCTION: only browse-only stores are
     read here, because a scraped store is already in the cache. */
  if (!/isBrowseOnlyRetailer/.test(fn)) throw new Error("the deals feed would double-count a scraped store");
  /* THE SAME NORMALIZER as every other surface, so a deal card and a
     category card cannot disagree about the price of one item. */
  if (!/normalizeLiveItem/.test(fn)) throw new Error("file-backed deals use a second pricing path");
  // And the union must survive a cold scraper cache.
  const scan = src.slice(src.indexOf("async function runSalesScan("), src.indexOf("function discountPct("));
  if (!/cached\?\.items\?\.length \|\| fromFiles\.length/.test(scan)) {
    throw new Error("a cold scraper cache empties Ofertas again, even with file deals available");
  }
  /* THE STORE FILTER has to list every store whose deals are in the
     feed, or a shopper cannot switch one off. */
  if (/salesStoreFilters'\)\.innerHTML = GENERAL_RETAILERS/.test(src)) {
    throw new Error("the Ofertas store filter is back to the searchable-only list");
  }
});

check("Macy's really has deals worth showing, and the gate still applies", () => {
  const items = macysCatalog.retailers.macys.departments.women.items;
  const onSale = items.filter((i) => i.onSale && i.originalPrice > i.price);
  if (!(onSale.length > 300)) throw new Error(`only ${onSale.length} Macy's markdowns`);
  for (const it of onSale) {
    if (!(it.originalPrice > it.price)) throw new Error(`"${it.name}" claims a discount that is not one`);
  }
  /* Ofertas promotes, so its weight and freight gates still decide what
     is FEATURED — a file-backed store gets no exemption from them. The
     live count lands well under the raw 405 for exactly that reason. */
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const scan = src.slice(src.indexOf("async function runSalesScan("), src.indexOf("function discountPct("));
  if (!/passesOfertasGate/.test(scan)) throw new Error("file-backed deals bypass the Ofertas gate");
});

/* ------------------------------------------------------------------ */
group("budget: what you can spend, door to door");

check("the budget is the DELIVERED total, never the sticker", () => {
  /* A budget that filtered on the product price would be a lie the size
     of the freight: a S/ 90 top with S/ 40 of shipping does not belong
     in "menos de S/ 100". */
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const fn = src.slice(src.indexOf("function doorToDoorPen("), src.indexOf("function budgetChipsHTML("));
  if (!/doorToDoorUsd/.test(fn)) throw new Error("the budget no longer uses the door-to-door total");
  if (/\bp\.price\b/.test(fn)) throw new Error("the budget is reading the sticker price");
  /* An item whose total cannot be computed is EXCLUDED, not quietly
     kept: a budget filter that leaks unpriced items is one a shopper
     stops trusting the first time one appears. */
  if (!/if \(pen == null\) return false/.test(src)) {
    throw new Error("an item with no computable total leaks through the budget filter");
  }
  // No soles without a rate — same rule as fmtPEN.
  if (!/if \(!fxRate\) return null/.test(fn)) throw new Error("the budget invents soles with no exchange rate");
});

check("the bands are fixed and round, and only live ones render", () => {
  const page = loadPageBudgetSlice();
  const bands = page.BUDGET_BANDS;
  eq(bands.length, 5, "band count");
  // Contiguous and non-overlapping, or an item falls in two bands or none.
  for (let i = 0; i < bands.length - 1; i++) {
    eq(bands[i].max, bands[i + 1].min, `band ${bands[i].key} must end where ${bands[i + 1].key} begins`);
  }
  eq(bands[0].min, 0, "the first band starts at zero");
  eq(bands[bands.length - 1].max, Infinity, "the last band is open-ended");
  eq(page.budgetBandFor("nope"), null, "an unknown band is null, not a silent match-all");
  /* And an unknown key must not become "no filter" — inBudget returns
     true only for a REAL absence of a band, which is what `null` means. */
  eq(page.budgetBandFor(null), null);
});


/* ------------------------------------------------------------------
   BELLEZA — 197 products, three stores, one file
   ------------------------------------------------------------------ */
group("belleza: the beauty catalogue is reachable, not just committed");

const beautyCatalog = JSON.parse(readFileSync(root("beauty-catalog.json"), "utf8"));
const beautyItems = Object.values(beautyCatalog.retailers)
  .flatMap((r) => Object.values(r.departments || {}))
  .flatMap((d) => (Array.isArray(d) ? d : d?.items || []));

check("the bare-array envelope is reshaped, so the products are visible at all", () => {
  /* THE BUG THIS PINS, and it would have shipped silently. Every reader
     on the page walks retailers.<key>.departments.<dept>.items. This
     file's departments.beauty is a BARE ARRAY. `bucket?.items || []` on
     an array is undefined, so nothing throws and nothing renders: three
     stores on Tiendas with empty catalogues and no error anywhere. */
  const raw = JSON.parse(readFileSync(root("beauty-catalog.json"), "utf8"));
  eq(Array.isArray(raw.retailers.sephora.departments.beauty), true,
    "the committed file is still the shape the adapter exists for");
  eq(deptMap.departmentItems(raw.retailers.sephora, "beauty").length, 0,
    "…and reading it unadapted really does yield nothing");

  const { normalizeCatalogueEnvelope } = loadPageEnvelopeSlice();
  const fixed = normalizeCatalogueEnvelope(raw);
  eq(deptMap.departmentItems(fixed.retailers.sephora, "beauty").length, 80, "Sephora after the adapter");
  eq(deptMap.departmentItems(fixed.retailers.ulta, "beauty").length, 77, "Ulta after the adapter");
  eq(deptMap.departmentItems(fixed.retailers.yesstyle, "beauty").length, 40, "YesStyle after the adapter");

  // A PURE RESHAPE: no field invented, none dropped.
  const before = raw.retailers.sephora.departments.beauty[0];
  const after = fixed.retailers.sephora.departments.beauty.items[0];
  eq(JSON.stringify(after), JSON.stringify(before), "an item passes through untouched");
  eq(JSON.stringify(fixed.retailers.sephora.brands), JSON.stringify(raw.retailers.sephora.brands), "brands untouched");

  // And a file ALREADY in the right shape must pass through unharmed,
  // or adapting every file would break the two that were already fine.
  const ssense = JSON.parse(readFileSync(root("ssense-catalog.json"), "utf8"));
  const passed = normalizeCatalogueEnvelope(ssense);
  for (const key of Object.keys(ssense.retailers)) {
    for (const dept of Object.keys(ssense.retailers[key].departments)) {
      eq(passed.retailers[key].departments[dept].items.length,
         ssense.retailers[key].departments[dept].items.length, `${key}/${dept} unchanged`);
    }
  }
  // Rubbish in, empty out — never a throw that takes the cache down.
  eq(JSON.stringify(normalizeCatalogueEnvelope(null)), '{"retailers":{}}');
  eq(JSON.stringify(normalizeCatalogueEnvelope({})), '{"retailers":{}}');
});

check("the catalogue itself is whole: 197 products, no missing photo, no missing weight", () => {
  eq(beautyItems.length, 197, "product count");
  const noImage = beautyItems.filter((i) => !i.image);
  eq(noImage.length, 0, "every product has a photo (the aisle tiles need one)");
  const noWeight = beautyItems.filter((i) => !(Number(i.specWeightKg) > 0));
  eq(noWeight.length, 0, "every product carries a weight");
  /* A DEAL MUST BE A REAL MARKDOWN. onSale with no higher originalPrice
     is the "trivial deal" bug Ofertas already has a gate for; this
     checks the data never asks it to. */
  const onSale = beautyItems.filter((i) => i.onSale);
  eq(onSale.length, 44, "discounted products");
  for (const i of onSale) {
    if (!(Number(i.originalPrice) > Number(i.price))) {
      throw new Error(`${i.name} is flagged onSale with no markdown`);
    }
  }
});

check("beauty splits into aisles, and the leftovers are declared rather than buried", () => {
  const grouped = subcats.groupBySubcategory(beautyItems);
  eq(subcats.shouldSplit(grouped), true, "197 products must not render as one wall");
  const byKey = Object.fromEntries(grouped.rows.map((r) => [r.key, r.count]));
  eq(byKey.face, 64, "Rostro");
  eq(byKey.eyes, 35, "Ojos");
  eq(byKey.lips, 25, "Labios");
  eq(byKey.skincare, 25, "Cuidado de la piel");
  eq(byKey.fragrance, 11, "Fragancia");
  /* THE 37 THE EXPORT CALLS "Belleza" — a lip gloss, an undereye patch,
     a pencil sharpener and a gift set all wear it, so no aisle claims
     them. They are in "Ver todo" and the card says how many, which is
     the difference between a remainder and a disappearance. */
  eq(grouped.untyped, 37, "unplaced products");
  eq(grouped.typed + grouped.untyped, 197, "nothing is lost either way");
  eq(subcats.unmappedTypes(beautyItems).map((u) => u.type).join(), "BELLEZA",
    "only the export's own catch-all is unplaced");
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  if (!/grouped\.untyped > 0/.test(src)) throw new Error("the Ver todo card no longer says where the remainder is");
});

check("an aisle tile wears a real product photo", () => {
  /* Danny sent the category covers back twice for being emoji and
     cartoon art. An aisle card that is a word and a bar is the same
     failure one level down, so each row carries the image of the first
     product it holds — a real photo from the store's own CDN, of
     something that is actually one tap away. */
  const grouped = subcats.groupBySubcategory(beautyItems);
  for (const row of grouped.rows) {
    if (!row.image) throw new Error(`the ${row.key} aisle has no photo`);
    if (!/^https?:\/\//.test(row.image)) throw new Error(`${row.key}'s photo is not a real URL`);
  }
  /* THE PHOTO IS THE FIRST ITEM'S, and it must be an item that aisle
     really holds — a tile promising a lipstick that is not in "Labios"
     is worse than no tile. */
  for (const row of grouped.rows) {
    const first = subcats.itemsInSubcategory(beautyItems, row.key)[0];
    eq(row.image, first.image, `${row.key}'s photo comes from its own first item`);
  }
  // Both mirrors carry it, or the page renders the text-only card.
  const pageGrouped = pageSubs.groupBySubcategory(beautyItems);
  eq(pageGrouped.rows.map((r) => r.image).join("\n"),
     grouped.rows.map((r) => r.image).join("\n"), "the page mirror picks the same faces");
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const card = src.slice(src.indexOf("function catalogAisleCardHTML("), src.indexOf("function catalogAisleListHTML("));
  if (!/row\.image/.test(card)) throw new Error("the aisle card ignores the photo");
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(card)) throw new Error("an emoji is back on an aisle card");
  // A store with no images must still get a working card, not a grey box.
  const noPhotos = beautyItems.map(({ image, images, ...rest }) => rest);
  for (const row of subcats.groupBySubcategory(noPhotos).rows) {
    eq(row.image, null, `${row.key} has no invented photo`);
  }
});

check("accents survive normalisation, so Spanish types map at all", () => {
  /* "Uñas" hit the [^A-Z0-9] rule as U + (dropped Ñ) + AS -> "U_AS",
     a token nobody would write. Folding, not deleting. */
  eq(subcats.normalizeType("Uñas"), "UNAS");
  eq(subcats.normalizeType("Cuidado de la piel"), "CUIDADO_DE_LA_PIEL");
  eq(subcats.subcategoryForType("Uñas"), "nails");
  eq(subcats.subcategoryForType("Cuidado de la piel"), "skincare");
  eq(pageSubs.normalizeType("Uñas"), "UNAS", "the page mirror folds too");
  // No ASCII token moved: Macy's and SSENSE must map exactly as before.
  for (const t of ["DRESS", "JACKETS", "BACKPACK_MESSENGER", "PYJAMAS & LOUNGEWEAR", "PANTS"]) {
    eq(pageSubs.subcategoryForType(t), subcats.subcategoryForType(t), t);
  }
});

check("the catalogue's own weight beats our guess, and still reads as an estimate", () => {
  /* beauty-catalog.json ships specWeightKg on all 197 AND
     weightEstimated:true beside it. That is not a spec weight — a spec
     weight renders as "Peso confirmado por la tienda" and skips the
     sanity bands. It is a better-sourced estimate, so it wins over our
     title table and is banded like any other estimate. */
  const item = { title: "CC+ Cream with SPF 50+", retailer: "ulta", department: "beauty",
    specWeightKg: 0.2, weightEstimated: true };
  const got = weightResolve.resolveItemWeight(item);
  eq(got.weightKg, 0.2, "the catalogue's number is used");
  eq(got.source, "catalog");
  eq(got.estimated, true, "it must never read as confirmed by the store");
  // Without it we fall back to our own table, which reads LIGHTER here —
  // under-reading a weight is the direction that costs money.
  const without = weightResolve.resolveItemWeight({ title: item.title, retailer: "ulta", department: "beauty" });
  eq(without.source, "beauty");
  if (!(without.weightKg < got.weightKg)) throw new Error("the eight disputed creams are no longer disputed");
  // A REAL published measurement still outranks it.
  const spec = weightResolve.resolveItemWeight({ title: "x", specWeightKg: 0.2, weightKg: 0.9, weightEstimated: false });
  eq(spec.source, "spec");
  eq(spec.weightKg, 0.9, "an explicit spec is not overridden by a catalogue estimate");
  // Junk is declined rather than believed.
  for (const bad of [0, -1, null, "", "heavy", undefined]) {
    eq(weightResolve.catalogWeightKg({ specWeightKg: bad }), null, `specWeightKg=${JSON.stringify(bad)}`);
  }
});

check("the card's weight reaches checkout instead of being re-guessed", () => {
  /* The cart's weightKg is deliberately marked estimated, and the server
     resolver re-estimates an estimate rather than echoing it back as a
     store measurement. That rule is right and it would have thrown the
     catalogue's number away: a BB cream showing 0.20 kg on the card and
     billed at 0.05 kg. So the figure rides on the line under the name
     the resolver reads. */
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  if (!/function catalogWeightDetail\(/.test(src)) throw new Error("the page no longer prefers the catalogue weight");
  if (!/catalogWeightDetail\(item, title\) \|\| estimateRetailWeightDetail\(/.test(src)) {
    throw new Error("normalizeLiveItem no longer consults the catalogue weight first");
  }
  const add = src.slice(src.indexOf("function addToCartFromProduct("), src.indexOf("function addToCartFromProduct(") + 2000);
  if (!/specWeightKg: p\.catalogWeightKg/.test(add)) throw new Error("the catalogue weight does not reach the cart line");
});

check("a fragrance the store flags is limited even if its title is silent", () => {
  /* 11 items carry restricted:"fragancia-max-4" — the courier clause as
     data rather than inferred from a title. Measured: the flag and
     isFragrance() agree on all 197 today, which is the point. The flag
     is what keeps the limit on the card the day an export marks
     something whose name does not say "parfum". */
  const flagged = beautyItems.filter((i) => i.restricted === "fragancia-max-4");
  eq(flagged.length, 11, "restricted products");
  for (const i of flagged) eq(i.type, "Fragancia", `${i.name} is in the fragrance aisle`);
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  if (!/item\.restricted === 'fragancia-max-4' \|\| isFragrance\(title\)/.test(src)) {
    throw new Error("the store's own restriction flag is ignored");
  }
});

check("every beauty markdown reaches Ofertas, tier and file notwithstanding", () => {
  /* The universal-sales rule: Ofertas aggregates every store regardless
     of tier or of whether it is scraped or filed. These three are
     browse-only, so fileBackedDeals() is their only route in. */
  for (const key of ["sephora", "ulta", "yesstyle"]) {
    eq(retailers.isBrowseOnlyRetailer(key), true, `${key} must be read by fileBackedDeals`);
    if (!retailers.browsableRetailers().includes(key)) throw new Error(`${key} is not in CATALOG_RETAILERS`);
  }
  /* And the department map has to agree these are sale items, which is
     what fileBackedDeals filters on downstream. 43 of the 44, not all
     44: a 3% markdown on one Ulta setting mist ($13.00 -> $12.60) is
     below the 5% floor every surface of this site uses. That is the
     trivial-deal gate doing its job, not a product going missing — it
     is still in the Belleza category and in the store, it is just not
     something to call an oferta. */
  const onSale = beautyItems.filter((i) => deptMap.itemBelongsToDepartment(i, "beauty", "sale"));
  eq(onSale.length, 43, "beauty markdowns worth featuring");
  const thin = beautyItems.filter((i) => i.onSale && !deptMap.itemBelongsToDepartment(i, "beauty", "sale"));
  eq(thin.length, 1, "exactly one markdown is below the floor");
  if (Math.round((1 - thin[0].price / thin[0].originalPrice) * 100) >= 5) {
    throw new Error("a real markdown is being gated out of Ofertas");
  }
});


/* ------------------------------------------------------------------
   SHININESS — a virtual mall, not a database
   ------------------------------------------------------------------ */
group("images: the shop looks like a shop");

check("no logo file is mostly empty canvas", () => {
  /* THE BUG THIS PINS, and nothing else in the pipeline could see it.
     logos/ssense.png was a valid 29,954-byte PNG, correctly wired and
     correctly referenced, and it rendered as what Danny called "plain
     styled text". The file was 2501x250 with the wordmark in the middle
     685x146 of it: 84% empty white. object-fit: contain fits the
     CANVAS, so the letters drew a sixth the size every other mark got,
     and no CSS could have fixed it. It decoded, it had a sane aspect
     ratio on paper, and it was broken. Only the pixels say so. */
  const FLOOR = 0.35;
  const files = readdirSync(root("logos")).filter((f) => f.endsWith(".png"));
  if (files.length < 4) throw new Error(`only ${files.length} PNG logos found`);
  for (const f of files) {
    const info = inkCoverage(root(`logos/${f}`));
    if (!info) throw new Error(`${f} is not a PNG`);
    if (info.unsupported) throw new Error(`${f}: ${info.unsupported} — the coverage check cannot read it`);
    if (info.coverage < FLOOR) {
      throw new Error(
        `${f} is ${(info.coverage * 100).toFixed(0)}% mark and ${(100 - info.coverage * 100).toFixed(0)}% empty canvas ` +
        `(${info.w}x${info.h}, ink ${info.inkW}x${info.inkH}). Contain-fit sizes the canvas, so it will render tiny. Crop it.`,
      );
    }
  }
  /* A TRANSPARENT BACKGROUND IS NOT AN EMPTY ONE (2026-09-22). The
     coverage reader took the top-left pixel as the background colour,
     which is right on a flat-white file and badly wrong on an alpha
     one: a transparent corner decodes as (0,0,0,0), so the reference
     RGB is black, every black letterform matches it, and a perfectly
     cropped logo reports 0% ink — failing the floor it exists to pass.
     Found on the first alpha PNG to arrive, which would have blocked a
     whole batch of clean files. Six of the logos below are alpha. */
  const alpha = files.map((f) => inkCoverage(root(`logos/${f}`))).filter((i) => i.transparent);
  if (alpha.length < 3) throw new Error("no transparent logos left to guard the alpha path");
  for (const info of alpha) {
    if (info.blank) throw new Error("a transparent logo reads as blank — the alpha background bug is back");
    if (!(info.coverage > 0.5)) throw new Error(`a transparent logo reads ${(info.coverage * 100).toFixed(0)}% ink`);
  }

  // And the one that was broken is specifically fixed, with its real
  // proportions — a 4.7:1 wordmark, in Macy's and Walmart's company.
  const ssense = inkCoverage(root("logos/ssense.png"));
  if (ssense.coverage < 0.7) throw new Error(`SSENSE is back to ${(ssense.coverage * 100).toFixed(0)}% coverage`);
  if (!(ssense.aspect > 3 && ssense.aspect < 7)) throw new Error(`SSENSE is ${ssense.aspect.toFixed(1)}:1 — the padding is back`);
});

check("every registered logo file exists and is wired from the registry", () => {
  for (const r of retailers.activeRetailers()) {
    if (!r.logo) continue;
    if (!existsSync(root(r.logo))) throw new Error(`${r.key} points at ${r.logo}, which is not committed`);
  }
  /* One badge function, reading the registry — a store whose logo is
     wired in one place and missing in another is the drift this
     registry exists to stop. SSENSE renders through the same path as
     the other nine, on Tiendas and on its own store header. */
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  if (!/const RETAILER_LOGO_FILE = Object\.fromEntries\(Object\.values\(RETAILERS\)/.test(src)) {
    throw new Error("logo files are no longer derived from the registry");
  }
  if (!/storeViewHero'\)\.innerHTML = retailerBadgeHTML\(retailer, 44\)/.test(src)) {
    throw new Error("the store page header no longer renders the registry's logo");
  }
});

check("retailer photos are requested at the largest size the CDN offers", () => {
  const { upgradeImageUrl, imageRetryUrl, MACYS_IMAGE_WIDTH } = loadPageImageUrlSlice();
  eq(MACYS_IMAGE_WIDTH, 1200);

  /* Pinned against URLs taken from the committed catalogues, not from
     examples typed into a test — a rule that works on an invented URL
     and not on the real one is the failure mode here. */
  const macys = JSON.parse(readFileSync(root("macys-catalog.json"), "utf8"));
  const macysItems = Object.values(macys.retailers).flatMap((r) =>
    Object.values(r.departments || {}).flatMap((d) => (Array.isArray(d) ? d : d.items || [])));
  eq(macysItems.length > 700, true, "Macy's catalogue is loaded");
  for (const it of macysItems.slice(0, 200)) {
    const up = upgradeImageUrl(it.image);
    if (/[?&]wid=/.test(it.image) && !/[?&]wid=1200\b/.test(up)) throw new Error(`not upgraded: ${up}`);
    // Only the size changes — a mangled path is a dead photo on 754 cards.
    eq(up.replace(/wid=\d+/, "wid=X"), it.image.replace(/wid=\d+/, "wid=X"), "only wid changed");
  }

  const beauty = JSON.parse(readFileSync(root("beauty-catalog.json"), "utf8"));
  const ys = beauty.retailers.yesstyle.departments.beauty;
  eq(ys.length, 40, "YesStyle items");
  for (const it of ys) {
    const up = upgradeImageUrl(it.image);
    if (!/\/L_[^/]+$/.test(up)) throw new Error(`YesStyle not upgraded to the large variant: ${up}`);
    /* THE UPGRADE IS A GUESS AND CARRIES ITS OWN UNDO. The L_ variant
       could not be probed from the build environment — every retailer
       CDN answers 403 through the egress proxy — so the medium travels
       with it and one 404 swaps back with no broken frame. */
    eq(imageRetryUrl(up), it.image, "the medium is recoverable from the large");
  }

  // A store whose URLs already carry a full-size asset is left alone.
  const ssense = JSON.parse(readFileSync(root("ssense-catalog.json"), "utf8"));
  const one = Object.values(ssense.retailers)[0].departments;
  const sample = Object.values(one)[0].items[0].image;
  eq(upgradeImageUrl(sample), sample, "SSENSE URLs are untouched");
  eq(imageRetryUrl(sample), "", "a non-speculative URL has no retry");
  // Junk in, junk out — never a throw on the render path.
  for (const bad of ["", null, undefined, 42]) eq(upgradeImageUrl(bad), typeof bad === "string" ? bad : "");
});

check("a deal with no photo is not featured, and a missing photo is branded", () => {
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  if (!/function passesOfertasPhotoGate\(/.test(src)) throw new Error("Ofertas still features photoless tiles");
  const gate = src.slice(src.indexOf("function passesOfertasGate("), src.indexOf("function passesOfertasGate(") + 300);
  if (!/passesOfertasPhotoGate/.test(gate)) throw new Error("the photo gate is defined but not applied");

  /* MEASURED BEFORE GATING, because a gate that empties a feed is worse
     than the tiles it removes. Every committed product carries an
     image, so this can only ever act on the live deals cache. */
  for (const [file, expected] of [["macys-catalog.json", 754], ["ssense-catalog.json", 2426], ["beauty-catalog.json", 197]]) {
    const cat = JSON.parse(readFileSync(root(file), "utf8"));
    const items = Object.values(cat.retailers).flatMap((r) =>
      Object.values(r.departments || {}).flatMap((d) => (Array.isArray(d) ? d : d.items || [])));
    eq(items.length, expected, `${file} item count`);
    eq(items.filter((i) => !i.image).length, 0, `${file} products with no photo`);
  }
  const scraped = JSON.parse(readFileSync(root("department-cache.json"), "utf8"));
  const scrapedItems = Object.values(scraped.retailers).flatMap((r) =>
    Object.values(r.departments || {}).flatMap((d) => d.items || []));
  eq(scrapedItems.filter((i) => !(i.image || i.imageUrl || i.thumbnail)).length, 0, "scraped products with no photo");

  // The placeholder is the brand's own frame, and it is DRAWN — a
  // placeholder that is itself a file can fail the way the photo did.
  if (!/function photoPlaceholderHTML\(/.test(src)) throw new Error("there is no branded placeholder");
  const ph = src.slice(src.indexOf("function photoPlaceholderHTML("), src.indexOf("function cardPhotoHTML("));
  if (/<img/.test(ph)) throw new Error("the placeholder is an image, so it can fail too");
  if (!/var\(--sky\)/.test(ph) || !/ARIA/.test(ph)) throw new Error("the placeholder is not branded");
  if (/Sin imagen/.test(src)) throw new Error("the grey 'Sin imagen' box is back");
  // Both render paths retry a speculative URL once before giving up.
  for (const fn of ["function cardPhotoFallback(", "function handleProductImgError("]) {
    const body = src.slice(src.indexOf(fn), src.indexOf(fn) + 700);
    if (!/data-img-fallback/.test(body)) throw new Error(`${fn} does not honour the retry URL`);
    if (!/removeAttribute\('data-img-fallback'\)/.test(body)) throw new Error(`${fn} can loop on a dead fallback`);
  }
});

check("every browse grid is photographs, and no grid is emoji", () => {
  /* The store page's department list — the first screen of Macy's,
     SSENSE or Sephora — was a 26px emoji over a label and a count. It
     is the same tile the aisle list uses now. */
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  if (!/function browseTileHTML\(/.test(src)) throw new Error("there is no shared browse tile");
  const tile = src.slice(src.indexOf("function browseTileHTML("), src.indexOf("function catalogAisleCardHTML("));
  if (!/<img/.test(tile)) throw new Error("the browse tile shows no photograph");
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(tile)) throw new Error("an emoji is on the browse tile");

  // Both grids go through it — that is what stops the next one being
  // invented as text again.
  const aisle = src.slice(src.indexOf("function catalogAisleCardHTML("), src.indexOf("function catalogAisleListHTML("));
  if (!/browseTileHTML\(/.test(aisle)) throw new Error("the aisle card no longer uses the shared tile");
  const store = src.slice(src.indexOf("async function openStore("), src.indexOf("async function openStoreResults("));
  if (!/browseTileHTML\(/.test(store)) throw new Error("the store's department grid is not the shared tile");
  if (/meta\.icon/.test(store)) throw new Error("the store's department grid still renders an emoji");
  if (!/deptPhoto\(/.test(store)) throw new Error("the store's department tiles carry no product photo");

  /* And a real store really produces one. Macy's departments have to
     yield a photo per tile from the committed export, or the grid is a
     row of text cards on the busiest storefront on the site. */
  const macys = JSON.parse(readFileSync(root("macys-catalog.json"), "utf8"));
  for (const key of ["women", "clothing"]) {
    const items = deptMap.departmentItems(macys.retailers.macys, key);
    if (!items.length) continue;
    if (!items.some((i) => i.image)) throw new Error(`Macy's ${key} tile would have no photo`);
  }

  /* NO TILE WEARS ANOTHER TILE'S PHOTO. Ofertas is not a shelf of its
     own — it is whatever is marked down across the other shelves — so
     on Macy's, whose only two departments are Moda Mujer and Ofertas,
     one product can be the first item of both and the naive "first item
     with an image" would print it twice.

     IT DOES NOT TODAY, and this test says so rather than pretending it
     caught a live bug: Macy's first women's item simply happens not to
     be marked down. That is data, not structure — the overlap below is
     what makes the collision possible, and a re-export is all it takes.
     The guard is cheap and the failure is ugly, so it stays. */
  if (!/usedPhotos/.test(store)) throw new Error("department tile photos are no longer deduped");
  const women = deptMap.departmentItems(macys.retailers.macys, "women").map((i) => i.image).filter(Boolean);
  const sale = deptMap.departmentItems(macys.retailers.macys, "sale").map((i) => i.image).filter(Boolean);
  if (!sale.length) throw new Error("Macy's has no sale department to collide with");
  // The overlap is real — every Ofertas item is also a Moda Mujer item —
  // which is exactly why two tiles can land on one photo.
  const inWomen = new Set(women);
  if (!sale.every((u) => inWomen.has(u))) throw new Error("Ofertas is no longer a subset of Moda Mujer");
  // And there is a second photo to move to when they do collide.
  if (new Set(sale).size < 2) throw new Error("Ofertas has no second photo to fall back to");
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
group("The A-Z brand index (and the wall it replaced)");

const brandPage = loadPageBrandSlice();
const ssenseBrands = JSON.parse(readFileSync(root("ssense-catalog.json"), "utf8")).retailers.ssense.brands;

check("the page's brand index and the module agree, brand for brand", () => {
  /* THE MIRROR. index.html is a plain <script> and cannot import, so
     these five functions exist twice. Compared over the real 192-brand
     export rather than over examples someone typed: the list on the
     page is built from this file, so this file is the fixture. */
  const pageRows = brandPage.brandRows(ssenseBrands);
  const modRows = brandIndex.brandRows(ssenseBrands);
  eq(JSON.stringify(pageRows), JSON.stringify(modRows), "brandRows drifted between page and module");
  eq(
    JSON.stringify(brandPage.brandGroups(pageRows).map((g) => [g.letter, g.brands.length])),
    JSON.stringify(brandIndex.brandGroups(modRows).map((g) => [g.letter, g.brands.length])),
    "brandGroups drifted",
  );
  for (const raw of ["Séfr", "sacai", "424", "MM6 Maison Margiela", "  ", "Ünde"]) {
    eq(brandPage.foldBrand(raw), brandIndex.foldBrand(raw), `foldBrand(${raw})`);
    eq(brandPage.brandLetter(raw), brandIndex.brandLetter(raw), `brandLetter(${raw})`);
  }
  for (const q of ["margiela", "SEFR", "séfr", "", "zzz"]) {
    eq(brandPage.brandMatches("Séfr", q), brandIndex.brandMatches("Séfr", q), `brandMatches(Séfr, ${q})`);
  }
  /* The routing slug is mirrored too, and it is the one that must not
     drift by even a character: it is the address in the URL bar. */
  for (const raw of ["Courrèges", "Maison Kitsuné", "MM6 Maison Margiela", "A.P.C.", "424", "a.v. vattev"]) {
    eq(brandPage.brandKeyOf(raw), brandIndex.brandKeyOf(raw), `brandKeyOf(${raw})`);
  }
  const sample = ssenseBrands.driesvannoten.items.concat(ssenseBrands.apc.items);
  eq(
    JSON.stringify(Object.keys(brandPage.brandBucketsFromItems(sample))),
    JSON.stringify(Object.keys(brandIndex.brandBucketsFromItems(sample))),
    "brandBucketsFromItems drifted",
  );
});

check("every one of SSENSE's 192 brands is in the list, exactly once", () => {
  /* The whole point of pulling the wall down is that nothing behind it
     is lost. 192 cards left the home page; 192 rows have to arrive in
     the panel, with no key appearing twice and none of them invented. */
  const rows = brandIndex.brandRows(ssenseBrands);
  eq(rows.length, Object.keys(ssenseBrands).length, "brand count changed between the export and the panel");
  eq(new Set(rows.map((r) => r.key)).size, rows.length, "a brand key is listed twice");
  for (const r of rows) {
    if (!ssenseBrands[r.key]) throw new Error(`the panel invented a brand: ${r.key}`);
    eq(r.count, ssenseBrands[r.key].items.length, `${r.key} count`);
  }
  // And every row lands in exactly one section.
  const groups = brandIndex.brandGroups(rows);
  eq(groups.reduce((n, g) => n + g.brands.length, 0), rows.length, "a brand fell out of its section");
  eq(new Set(groups.map((g) => g.letter)).size, groups.length, "a letter has two sections");
});

check("a brand is named by its catalogue, never by title-casing its slug", () => {
  /* THE BUG THIS PINS: metaFor() turns an unknown key into a
     title-cased slug, so `driesvannoten` came out "Driesvannoten" and
     `mm6maisonmargiela` came out "Mm6Maisonmargiela". That was already
     on the brand cards; a 192-row alphabetical list makes it
     unmissable, and an A-Z of mangled names is not a directory. */
  const byKey = Object.fromEntries(brandIndex.brandRows(ssenseBrands).map((r) => [r.key, r.label]));
  eq(byKey.driesvannoten, "Dries Van Noten", "Dries Van Noten");
  eq(byKey.mm6maisonmargiela, "MM6 Maison Margiela", "MM6 Maison Margiela");
  eq(byKey.paulsmith, "Paul Smith", "Paul Smith");

  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  if (!/function brandLabelFor\(/.test(src)) throw new Error("brandLabelFor is gone");
  /* The tiles used to need this too. They do not any more — a brand is
     never a tile — so the one surface left that names a brand from a
     key is its own catalogue page, and that is where it is asserted. */
  const catalog = src.slice(src.indexOf("async function openCatalog("), src.indexOf("function setCatalogStore("));
  if (!/brandLabelFor\(/.test(catalog)) throw new Error("a brand's catalogue page is titled from its slug again");
});

check("the list reads like a directory: # first, then A-Z, case-blind", () => {
  const rows = brandIndex.brandRows(ssenseBrands);
  eq(rows[0].letter, "#", "the numbered brands come first");
  eq(brandIndex.brandLetter("424"), "#", "424");
  eq(brandIndex.brandLetter("1017 ALYX 9SM"), "#", "1017 ALYX 9SM");
  eq(brandIndex.brandLetter("sacai"), "S", "a lower-case name still files under its letter");
  eq(brandIndex.brandLetter("Séfr"), "S", "an accented name files under the unaccented letter");

  // Letters only ever move forward through the list.
  const letters = brandIndex.brandGroups(rows).map((g) => g.letter);
  eq(JSON.stringify(letters.slice(1)), JSON.stringify([...letters.slice(1)].sort()), "the sections are out of order");
  // And inside a section, case never decides the order.
  for (const g of brandIndex.brandGroups(rows)) {
    const names = g.brands.map((b) => brandIndex.foldBrand(b.label));
    eq(JSON.stringify(names), JSON.stringify([...names].sort((a, b) => a.localeCompare(b, "es"))), `section ${g.letter}`);
  }
});

check("search finds the part of the name you remember", () => {
  /* A 192-row list is searched by the word that stuck, which is very
     often not the first one — nobody types "MM6" to find Margiela. */
  const rows = brandIndex.brandRows(ssenseBrands);
  const hit = (q) => rows.filter((r) => brandIndex.brandMatches(r.label, q)).map((r) => r.key);
  if (!hit("margiela").includes("mm6maisonmargiela")) throw new Error("a mid-name search finds nothing");
  if (!hit("MARGIELA").includes("mm6maisonmargiela")) throw new Error("search is case-sensitive");
  eq(hit("").length, rows.length, "an empty box hides brands");
  eq(hit("zzzzz").length, 0, "a nonsense query still matches");
  // Accents fold both ways: the phone keyboard and the catalogue can
  // disagree about them and the shopper must not pay for it.
  eq(brandIndex.brandMatches("Séfr", "sefr"), true, "unaccented query against an accented name");
  eq(brandIndex.brandMatches("Sefr", "séfr"), true, "accented query against an unaccented name");
});

check("a brand with nothing behind it is not listed", () => {
  // A row that opens an empty page is worse than no row.
  const rows = brandIndex.brandRows({ real: { label: "Real", items: [{}] }, empty: { label: "Empty", items: [] }, broken: { label: "Broken" } });
  eq(rows.map((r) => r.key).join(), "real", "an empty brand made it into the list");
});

check("a brand list can be counted off a store's own stock", () => {
  /* WHY THIS EXISTS. "Wire it into every storefront that carries
     multiple brands" cannot be answered from `retailers.<key>.brands`.
     SSENSE ships 192 real buckets; Foot Locker ships 1; Macy's ships
     NONE while every one of its 754 items names its brand; and the
     beauty three ship a bare ARRAY OF NAMES with no items behind it,
     which decodes as brands called "0", "1", "2".

     THE INVARIANT THAT MAKES DERIVING SAFE: run the derivation over
     SSENSE's own items and it reproduces SSENSE's own export — same
     192 keys, same labels, same counts. The rule is not ours, it is
     theirs, which is why a Macy's brand and an SSENSE brand can share
     one route. */
  const ssense = JSON.parse(readFileSync(root("ssense-catalog.json"), "utf8")).retailers.ssense;
  const derived = brandIndex.brandBucketsFromItems(ssense.departments.men.items);
  eq(Object.keys(derived).length, Object.keys(ssense.brands).length, "derived brand count");
  for (const [key, bucket] of Object.entries(ssense.brands)) {
    if (!derived[key]) throw new Error(`deriving lost SSENSE's own key: ${key}`);
    eq(derived[key].label, bucket.label, `${key} label`);
    eq(derived[key].items.length, bucket.items.length, `${key} count`);
  }

  /* ACCENTS ARE DROPPED, NOT FOLDED, and that is the whole reason the
     keys line up: SSENSE slugs "Courreges" with the accent DELETED.
     Folding would have minted a second key for eight brands and broken
     every saved link to them. */
  eq(brandIndex.brandKeyOf("Courr\u00e8ges"), "courrges", "an accented brand keeps the key that shipped");
  eq(brandIndex.brandKeyOf("Maison Kitsun\u00e9"), "maisonkitsun", "Maison Kitsune");
  eq(brandIndex.brandKeyOf("MM6 Maison Margiela"), "mm6maisonmargiela", "MM6");
  // ...while the SEARCH still folds, because a phone keyboard does not.
  eq(brandIndex.brandMatches("Courr\u00e8ges", "courreges"), true, "an unaccented search finds an accented brand");

  // Macy's: no brands bucket at all, and a real list behind its stock.
  const macys = JSON.parse(readFileSync(root("macys-catalog.json"), "utf8")).retailers.macys;
  eq(Object.keys(macys.brands || {}).length, 0, "Macy's suddenly has a brands bucket — read it instead of deriving");
  const macysRows = brandIndex.brandRows(brandIndex.brandBucketsFromItems(macys.departments.women.items));
  if (macysRows.length < 50) throw new Error(`Macy's derived only ${macysRows.length} brands`);
  if (!macysRows.some((r) => r.label === "Wacoal")) throw new Error("Macy's biggest brand is not in its list");

  /* The beauty three's `brands` really is a list of NAMES. Deriving is
     the only way they get a panel, and the bogus numeric keys must not
     reach a shopper. */
  const beautyFile = JSON.parse(readFileSync(root("beauty-catalog.json"), "utf8"));
  for (const key of ["sephora", "ulta", "yesstyle"]) {
    const store = beautyFile.retailers[key];
    const items = Array.isArray(store.departments.beauty) ? store.departments.beauty : store.departments.beauty.items;
    const rows = brandIndex.brandRows(brandIndex.brandBucketsFromItems(items));
    if (rows.length < 2) throw new Error(`${key} derived ${rows.length} brands — it would lose its panel`);
    if (rows.some((r) => /^[0-9]+$/.test(r.key))) throw new Error(`${key} is listing a brand called "0"`);
  }
});

check("an explicit brand bucket still wins — Foot Locker keeps Nike", () => {
  /* Foot Locker's 24 shoes live in `brands.nike` and its department
     items name no brand at all, so a purely derived list would drop
     Nike and break a link that exists today. The page's merge is what
     stops that, so the page's merge is what is read here. */
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const merge = src.slice(src.indexOf("function retailerBrandBuckets("), src.indexOf("function departmentItemsFor("));
  if (!/Object\.entries\(retailerData\.brands \|\| \{\}\)/.test(merge)) throw new Error("the explicit buckets are no longer read");
  if (!/if \(!out\[key\]\) out\[key\] = bucket;/.test(merge)) throw new Error("a derived bucket now overwrites the catalogue's own");
  // A bucket with no items behind it (the beauty three's name list)
  // must not shadow the derived one.
  if (!/Array\.isArray\(bucket\?\.items\) && bucket\.items\.length/.test(merge)) throw new Error("an empty brands bucket can shadow the real list again");

  const cache = JSON.parse(readFileSync(root("department-cache.json"), "utf8")).retailers.footlocker;
  eq(Object.keys(cache.brands).join(), "nike", "Foot Locker's brand bucket");
  if (!cache.brands.nike.items.length) throw new Error("Foot Locker's Nike bucket is empty");
  // And its items really do carry no brand, which is why the bucket matters.
  const derived = brandIndex.brandBucketsFromItems(Object.values(cache.departments).flatMap((d) => d.items || []));
  eq(Object.keys(derived).length, 0, "Foot Locker's items now name their brand — the fallback may be enough");
});

check("no grid anywhere can build a wall of brands", () => {
  /* THE WALL: eleven department covers followed by 193 brand cards,
     each ~340px tall, as the first thing anyone met on the home page.
     Danny's word for it was "a wall" — and pulling it off the home page
     only moved it to Categorías, which carried the same 204 tiles on
     the one page whose job is to show what we sell.

     SO THE GUARD IS ON THE BUILDER, NOT THE TWO CALLERS. collectTiles
     took a `kind` and would make a tile per brand as readily as a tile
     per department; the parameter is gone, so there is no longer a code
     path that turns 192 brands into a grid, whoever calls it next.

     Brands are not gone from the site — the panel, the route,
     departmentItemsFor's brand branch and brandLabelFor are all live.
     What went is the tiling. */
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const tiles = src.slice(src.indexOf("function collectTiles("), src.indexOf("function deptTileHTML("));
  if (/brand/i.test(tiles)) throw new Error("collectTiles can make a brand tile again");
  if (!/DEPARTMENT_SPEC/.test(tiles)) throw new Error("collectTiles lost the department taxonomy");

  for (const [label, from, to] of [
    ["the home page", "function initDepartmentTiles(", "window.addEventListener('DOMContentLoaded', initDepartmentTiles)"],
    ["Categorías", "function renderCategoriesGrid(", "async function liveSalesScan("],
  ]) {
    const grid = src.slice(src.indexOf(from), src.indexOf(to));
    if (/kind: 'brand'/.test(grid)) throw new Error(`${label} is tiling brands again`);
    if (!/collectTiles\(\)/.test(grid)) throw new Error(`${label} lost its department tiles`);
  }

  // And the route a brand still travels is untouched.
  if (!/openCatalog\('brand'/.test(src)) throw new Error("the brand route is gone with the tiles");
  const items = src.slice(src.indexOf("function departmentItemsFor("), src.indexOf("function collectTiles("));
  if (!/kind === 'brand'/.test(items)) throw new Error("a brand's products are no longer reachable");
});

check("the store's brand panel is navigable, and keeps today's route", () => {
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const panel = src.slice(src.indexOf("function storeBrandPanelHTML("), src.indexOf("function filterBrandPanel("));
  if (!panel) throw new Error("there is no brand panel");

  /* SAME ROUTE AS THE CARDS. This is the one line that decides whether
     192 brand links kept working when their cards were deleted. */
  if (!/openCatalog\('brand','\$\{jsAttr\(b\.key\)\}'\)/.test(panel)) {
    throw new Error("a brand row no longer opens openCatalog('brand', key)");
  }
  // Search box, letter jumps, and a section anchor for each to land on.
  if (!/id="brandPanelSearch"/.test(panel)) throw new Error("the panel has no search box");
  if (!/oninput="filterBrandPanel\(\)"/.test(panel)) throw new Error("typing no longer filters");
  if (!/jumpToBrandLetter\(/.test(panel)) throw new Error("the letter jump is gone");
  if (!/data-brand-letter=/.test(panel)) throw new Error("the letters have nothing to jump to");

  /* BOTH VIEWPORTS OUT OF ONE MARKUP: the index wraps into a bar on a
     phone and stacks into a column at md. Two copies of a 192-row list
     is how one of them goes stale. */
  eq((panel.match(/<nav/g) || []).length, 1, "there is more than one letter index");
  if (!/flex flex-wrap/.test(panel)) throw new Error("the letter index no longer wraps into a bar on a phone");
  if (!/md:w-\[/.test(panel)) throw new Error("the letter index does not become a column on a laptop");
  eq(panel.match(/data-brand-name=/g).length, 1, "the brand list is rendered more than once");

  // Navy and gold, not a grey database table.
  if (!/var\(--navy\)/.test(panel)) throw new Error("the panel left the navy palette");
  if (!/244,196,99/.test(panel) && !/var\(--amber\)/.test(panel)) throw new Error("the panel has no gold in it");
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(panel)) throw new Error("an emoji is standing in for the panel's furniture");

  /* ONE COMPONENT, ONE BEHAVIOUR. An earlier cut stripped the search box
     and the index off short lists; a shopper who learns this panel on
     SSENSE has to meet the same panel on Ulta. */
  if (/compact/.test(panel)) throw new Error("the panel has grown a second, quieter version of itself");

  // And the store page draws it off its own stock, for multi-brand
  // stores only.
  const store = src.slice(src.indexOf("async function openStore("), src.indexOf("async function openStoreResults("));
  if (!/brandRows\(retailerBrandBuckets\(retailerData\)\)/.test(store)) throw new Error("the store page reads no brands");
  if (!/brandList\.length > 1/.test(store)) throw new Error("a single-brand store is being offered a brand search");
  if (!/brandPanel/.test(store)) throw new Error("the store page never draws the panel");
});


/* ==================================================================
   THE PHONE'S THREE RAILS.

   The browser suite deliberately boots the page with the Tailwind CDN
   blocked, so it measures an UNSTYLED document: it can count the cards
   in each rail and read the order of their discounts, but it cannot see
   that the rails scroll, that they snap, or that they are hidden on a
   desktop. Everything that a stylesheet decides is pinned here, by the
   class that decides it.
   ================================================================== */
group("The mobile shopfront");

const shopfrontSrc = readFileSync(root("index.html"), "utf8");
const shopfront = shopfrontSrc.slice(
  shopfrontSrc.indexOf('<div id="mobileShopfront"'),
  shopfrontSrc.indexOf('<div class="relative overflow-hidden" style="background:linear-gradient(180deg, #0A1F44 0%, #0D2555 100%)">'),
);

check("nothing but the hero comes before the shopfront, and it is phone-only", () => {
  if (!shopfront) throw new Error("there is no mobile shopfront");

  /* THIS RULE CHANGED ON 2026-09-23, DELIBERATELY, AND THE OLD ONE IS
     WORTH KEEPING IN VIEW. It read: the shopfront is the FIRST child of
     #homeView, because "a shopper who scrolls -- and they all scroll --
     meets the deals before anything else. One element moved above this
     and the rails are below the fold again." That came out of a real
     user test and it was right.

     Danny then asked for a photographic hero at the top of the home
     page. A hero is exactly the "one element moved above this", and on
     a 393x852 phone it does push the Ofertas rail off the first screen.
     That is a trade he made knowingly and it is recorded here rather
     than quietly deleted: the protection now is that the hero is the
     ONLY thing allowed above the rails. A third element between the
     header and the shopfront still fails, which is what the original
     check was really guarding. */
  const home = shopfrontSrc.slice(shopfrontSrc.indexOf('<div id="homeView"'));
  const body = home.slice(home.indexOf(">") + 1);
  const tags = [...body.matchAll(/<(?!!--)[a-zA-Z][^>]*>/g)].map(m => m[0]);
  const first = tags[0] || "";
  if (!/class="ariaHero"/.test(first)) {
    throw new Error(`the first thing in #homeView is not the hero: ${first.slice(0, 70)}`);
  }
  const afterHero = body.slice(body.indexOf("</section>") + "</section>".length);
  const nextTag = (afterHero.match(/<(?!!--)[a-zA-Z][^>]*>/) || [""])[0];
  if (!nextTag.startsWith('<div id="mobileShopfront"')) {
    throw new Error(`something sits between the hero and the shopfront: ${nextTag.slice(0, 70)}`);
  }

  /* lg:hidden, NOT md:hidden. The nav is `hidden lg:flex`, so every
     width below 1024px -- tablets included -- has its shopping paths
     behind the hamburger. The shopfront has to appear exactly where the
     menu takes over, or a tablet gets the menu AND no rails. */
  const open = shopfront.slice(0, shopfront.indexOf(">") + 1);
  if (!/\blg:hidden\b/.test(open)) throw new Error("the shopfront is not hidden on a desktop");
  if (/\bmd:hidden\b/.test(open)) throw new Error("the shopfront disappears at md, leaving tablets with neither rails nor nav");
});

check("Ofertas, then Categorías, then Tiendas", () => {
  /* THE ORDER IS THE FALLBACK CHAIN, and Danny settled it in his own
     words: "in case they don't find the ofertas they're looking for,
     they know categories is right underneath". Deals first because they
     are what makes someone stop; departments second because that is
     where you go when the deals did not have it; stores last, for the
     shopper who already knows where they want to shop.

     (The written brief numbered Tiendas second. He was asked which, and
     chose the spoken one — this is that decision, not a drift from it.) */
  const order = [...shopfront.matchAll(/<section aria-label="([^"]+)"/g)].map(m => m[1]);
  eq(order.join(" > "), "Ofertas > Categorías > Tiendas", "the shopfront's scroll order");
  // Each section owns exactly one rail, and the rails are the ids the
  // renderers write into.
  for (const id of ["mobileDealsRow", "mobileStoresRow", "mobileCatsRow"]) {
    eq((shopfront.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, `${id} is declared once`);
  }
});

check("a rail scrolls sideways and snaps, and the page does not", () => {
  /* .ariaRail is hand-written CSS, not a Tailwind utility, for the same
     reason .brandList is: the page is built to boot with the CDN
     blocked, and a rail that loses its overflow becomes a row of cards
     running off the side of the phone. */
  const style = shopfrontSrc.slice(shopfrontSrc.indexOf("<style>"), shopfrontSrc.indexOf("</style>"));
  const rail = style.slice(style.indexOf(".ariaRail{"), style.indexOf(".brandList{"));
  if (!/scroll-snap-type:\s*x mandatory/.test(rail)) throw new Error("a swipe no longer lands on a card");
  if (!/scroll-snap-align:\s*start/.test(rail)) throw new Error("the cards have nothing to snap to");
  if (!/scrollbar-width:\s*none/.test(rail)) throw new Error("the rail grew a desktop scrollbar");

  for (const id of ["mobileDealsRow", "mobileStoresRow", "mobileCatsRow"]) {
    const tag = shopfront.slice(shopfront.indexOf(`id="${id}"`));
    const cls = tag.slice(0, tag.indexOf(">"));
    if (!/\bariaRail\b/.test(cls)) throw new Error(`${id} is not a rail`);
    if (!/\boverflow-x-auto\b/.test(cls)) throw new Error(`${id} cannot be swiped`);
  }
});

check("nothing in the shopfront moves on its own", () => {
  /* THE ONE RULE DANNY WROTE TWICE: "no auto-play on any carousel --
     user swipes, nothing moves on its own". A carousel that advances on
     a timer takes the card you were reading away from you, and on a
     phone you cannot get it back without guessing. */
  const js = stripComments(shopfrontSrc.slice(
    shopfrontSrc.indexOf("let mobileDealsRendered = []"),
    shopfrontSrc.indexOf("window.addEventListener('DOMContentLoaded', renderPrecioHonestoCards)"),
  ));
  if (!js) throw new Error("the rails' renderers are gone");
  for (const banned of ["setInterval", "requestAnimationFrame", "scrollBy(", "scrollTo(", "scrollIntoView(", "scrollLeft ="]) {
    if (js.includes(banned)) throw new Error(`the rails moved on their own: ${banned}`);
  }
  if (/setTimeout/.test(js)) throw new Error("the rails are on a timer");
  // ...and the markup carries no autoplay attribute or animation either.
  if (/animation:|autoplay|data-autoplay/i.test(shopfront)) throw new Error("the shopfront markup animates itself");
});

check("the deals rail is the Ofertas feed, sorted by discount, never a second list", () => {
  const js = shopfrontSrc.slice(
    shopfrontSrc.indexOf("function renderMobileDealsRail("),
    shopfrontSrc.indexOf("function renderMobileStoresRail("),
  );

  /* saleItemsCache IS what renderSalesGrid() paints. Reading anything
     else is how the banner in the superseded PR came to advertise 1,358
     ofertas over a feed that held 1,066. */
  if (!/saleItemsCache/.test(js)) throw new Error("the rail no longer reads the feed's own set");
  if (/loadDepartmentCache|departmentItems|fetch\(/.test(js)) throw new Error("the rail is building its own list of deals");

  // Biggest discount first -- "80% off first" is the brief.
  if (!/\.sort\(\(a, b\) => discountPct\(b\) - discountPct\(a\)\)/.test(js)) {
    throw new Error("the rail is no longer sorted by discount, descending");
  }
  /* ...and then ONE STORE PER CARD across the opening run, so the rail
     cannot lead on three near-identical markdowns from one shop. The
     spread is applied to the SORTED list, never instead of sorting it. */
  if (!/spreadDealsByStore\(priced, MOBILE_RAIL_LEAD\)/.test(js)) {
    throw new Error("the rail can lead on five cards from one store again");
  }
  // A card with no price, no markdown or no photo is not a deal.
  if (!/Number\.isFinite\(Number\(p\.price\)\)/.test(js)) throw new Error("a priceless line can reach the rail");
  if (!/Number\(p\.originalPrice\) > Number\(p\.price\)/.test(js)) throw new Error("a card with no markdown can claim a discount");
  if (!/p\.image/.test(js)) throw new Error("a card with no photo can reach the rail");

  // And the tail counts the feed it opens, not a department.
  if (!/saleItemsCache\.length\.toLocaleString/.test(js)) throw new Error("'Ver todo' is counting something other than the feed");
  if (!/goSales\(\)/.test(js)) throw new Error("'Ver todo' does not open Ofertas");
});

check("the opening five deals come from five different stores, and nothing is lost", () => {
  const { spreadDealsByStore, MOBILE_RAIL_LEAD } = loadPageDealSpreadSlice();
  eq(MOBILE_RAIL_LEAD, 5, "the size of the opening run");
  const deal = (retailer, pct, id) => ({ retailer, pct, id });
  const stores = list => list.slice(0, MOBILE_RAIL_LEAD).map(d => d.retailer);

  /* THE CASE THAT PROMPTED IT: one shop owns the deepest markdowns, and
     sorted by discount alone the rail opened on three near-identical
     Macy's puffer coats. */
  const macysHeavy = [
    deal("macys", 86, "coat-a"), deal("macys", 86, "coat-b"), deal("macys", 85, "coat-c"),
    deal("ssense", 80, "pants"), deal("macys", 85, "coat-d"), deal("yesstyle", 50, "serum"),
    deal("ulta", 20, "cream"), deal("ssense", 75, "shirt"),
  ];
  const spread = spreadDealsByStore(macysHeavy, MOBILE_RAIL_LEAD);
  eq(new Set(stores(spread)).size, 4, "the opening run repeats a store while another still has a deal");
  eq(stores(spread).slice(0, 4).join(), "macys,ssense,yesstyle,ulta", "the opening run is not one deal per store, deepest first");

  /* NOTHING IS DROPPED AND NOTHING IS INVENTED. A held-back deal keeps
     its place in the queue rather than losing its slot on the rail. */
  eq(spread.length, macysHeavy.length, "the spread changed how many deals there are");
  eq(new Set(spread.map(d => d.id)).size, macysHeavy.length, "the spread duplicated or lost a deal");

  /* AND THE QUEUE BEHIND THE OPENING RUN IS STILL IN DISCOUNT ORDER --
     the spread reorders the lead, it does not re-rank the rail. */
  const rest = spread.slice(MOBILE_RAIL_LEAD).map(d => d.pct);
  for (let i = 1; i < rest.length; i++) {
    if (rest[i] > rest[i - 1]) throw new Error(`the tail lost its discount order: ${rest.join(",")}`);
  }

  /* IT DEGRADES RATHER THAN COMING UP SHORT. Two stores with deals today
     must still fill five cards: five from two shops beats two cards. */
  const twoStores = [
    deal("macys", 90, "a"), deal("macys", 80, "b"), deal("ssense", 70, "c"),
    deal("macys", 60, "d"), deal("macys", 50, "e"), deal("ssense", 40, "f"),
  ];
  const thin = spreadDealsByStore(twoStores, MOBILE_RAIL_LEAD);
  eq(thin.length, twoStores.length, "a thin day lost deals");
  eq(thin.slice(0, 2).map(d => d.id).join(), "a,c", "the two stores did not each lead");
  eq(thin.slice(0, MOBILE_RAIL_LEAD).length, MOBILE_RAIL_LEAD, "the opening run came up short on a thin day");
  eq(thin.map(d => d.id).sort().join(), "a,b,c,d,e,f", "a thin day dropped or duplicated a deal");

  // One store and nothing else is still a rail.
  const solo = [deal("macys", 90, "a"), deal("macys", 80, "b")];
  eq(spreadDealsByStore(solo, MOBILE_RAIL_LEAD).map(d => d.id).join(), "a,b", "a single-store day stopped working");
  eq(spreadDealsByStore([], MOBILE_RAIL_LEAD).length, 0, "an empty feed broke the spread");
});

check("the other two rails reuse what the page already draws", () => {
  const stores = shopfrontSrc.slice(
    shopfrontSrc.indexOf("function renderMobileStoresRail("),
    shopfrontSrc.indexOf("function mobileCatCardHTML("),
  );
  /* The same chip as the home page's store grid. Restyled instead of
     reused, a store's mark, its colour and its honest "próximamente"
     dot could differ between the rail and the grid below it. */
  if (!/homeStoreChipHTML\(r\)/.test(stores)) throw new Error("the stores rail has grown its own chip");
  if (!/activeRetailers\(\)/.test(stores)) throw new Error("the stores rail is not reading the registry");
  /* The chip carries no width of its own -- in the home grid its cell
     supplies one -- so the rail's wrapper has to stretch it, or the
     tiles come out at three different widths. */
  if (!/w-\[118px\] grid/.test(stores)) throw new Error("the store tiles are no longer a uniform width");

  const cats = shopfrontSrc.slice(
    shopfrontSrc.indexOf("function initDepartmentTiles("),
    shopfrontSrc.indexOf("window.addEventListener('DOMContentLoaded', initDepartmentTiles)"),
  );
  /* THE SAME `tiles`, not a second collectTiles() call. This is what
     makes a new department -- Zapatos, and whatever follows it --
     appear in the rail with no second change anywhere. */
  if (!/renderMobileCatsRail\(tiles\)/.test(cats)) throw new Error("the categories rail is not fed the grid's own tiles");
});

check("the rails' images are lazy, and its covers are the curated ones", () => {
  const card = shopfrontSrc.slice(
    shopfrontSrc.indexOf("function mobileCatCardHTML("),
    shopfrontSrc.indexOf("function renderMobileCatsRail("),
  );
  if (!/categoryCoverFor\(t\.key\)/.test(card)) throw new Error("the rail stopped using the photographic covers");
  if (!/loading="lazy"/.test(card)) throw new Error("the third rail's photos load before the deals");
  /* The gradient fallback is still there for a department with no
     photograph -- an emoji on grey beats a broken image box. */
  if (!/t\.icon/.test(card)) throw new Error("a department with no cover now renders nothing");
});

check("the shopfront fills itself when a window is dragged across lg", () => {
  const init = shopfrontSrc.slice(
    shopfrontSrc.indexOf("const MOBILE_SHOPFRONT_MQ"),
    shopfrontSrc.indexOf("window.addEventListener('DOMContentLoaded', renderPrecioHonestoCards)"),
  );
  // One query, used by both the guard and the listener, so the point at
  // which the rails appear and the point at which they fill cannot drift.
  eq((init.match(/MOBILE_SHOPFRONT_MQ/g) || []).length, 3, "the breakpoint is read from one place");
  eq(shopfrontSrc.includes("(max-width: 1023px)"), true, "the shopfront's breakpoint moved off lg");
  if (!/addEventListener\('change', initMobileShopfront\)/.test(init)) throw new Error("a resize no longer fills the rails");
  if (!/mq\.addListener/.test(init)) throw new Error("older iOS Safari never fills the rails on rotation");
  // Filled once, not on every crossing: a drag across the breakpoint
  // must not re-fetch the whole sales cache.
  if (!/if \(mobileShopfrontStarted\) return;/.test(init)) throw new Error("crossing the breakpoint re-runs the sales scan");
});

check("the shopfront's gold is the brand's, and no emoji is doing an image's job", () => {
  /* House rules, both of them. Gold (#F4C463) is the orb-and-logo
     colour and is what the OFERTAS wordmark and the discount badge are
     painted in; yellow anywhere else on a card would be a sale badge
     lying about a product. And an emoji is decoration, never the
     picture of a thing being sold. */
  if (!/#F4C463/.test(shopfront)) throw new Error("the Ofertas rail lost its gold");
  /* RE-POINTED AT THE SHARED CARD, not loosened. The card's body moved
     into railCardHTML so the product page's "También te puede interesar"
     rail could use the SAME component rather than a second copy of it;
     mobileDealCardHTML is now a one-line caller. What is asserted is
     unchanged -- gold badge, shared photo, no emoji -- it is just
     asserted where the markup now lives. */
  const badge = shopfrontSrc.slice(
    shopfrontSrc.indexOf("function railCardHTML("),
    shopfrontSrc.indexOf("function mobileDealCardHTML("),
  );
  if (!/railCardHTML\(p, `openMobileDeal\(\$\{idx\}\)`/.test(shopfrontSrc)) {
    throw new Error("the Ofertas rail stopped using the shared card");
  }
  if (!/background:#F4C463[\s\S]{0,40}-\$\{pct\}%/.test(badge)) throw new Error("the discount badge is no longer the gold one");
  if (!/cardPhotoHTML\(/.test(badge)) throw new Error("a deal card is not using the shared product photo");
  if (/[\u{1F300}-\u{1FAFF}]/u.test(badge)) throw new Error("an emoji is standing in for a product photo");
});


/* ==================================================================
   THE IMAGE LIGHTBOX — six ways out, and none of them coverable.
   ================================================================== */
group("The lightbox is not a trap");

const lbSrc = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
const lbStyle = lbSrc.slice(lbSrc.indexOf("<style>"), lbSrc.indexOf("</style>"));
const lbMarkup = lbSrc.slice(lbSrc.indexOf('<div id="imageLightbox"'), lbSrc.indexOf('<div id="toast"'));

check("the photograph is contained on BOTH axes", () => {
  /* THE BUG. `max-w-none` with `width:auto` caps only the HEIGHT, which
     is not containment: measured at 393px, a 1600x900 photo rendered
     1393px wide and hung 952px off the right-hand side. */
  if (/max-w-none/.test(lbMarkup)) throw new Error("the lightbox image is back to an uncapped width");
  const rule = lbStyle.slice(lbStyle.indexOf("#lightboxImg{"), lbStyle.indexOf("#imageLightbox[data-zoom"));
  if (!rule) throw new Error("the lightbox image has no sizing rule");
  for (const needed of ["max-width:100%", "max-height:100%", "object-fit:contain"]) {
    if (!rule.includes(needed)) throw new Error(`the image is not contained: missing ${needed}`);
  }
  if (/max-width:\s*none/.test(rule)) throw new Error("the image's width cap was removed again");
  // And the stage does not scroll unless we have deliberately zoomed.
  const stage = lbStyle.slice(lbStyle.indexOf("#lightboxStage{"), lbStyle.indexOf("#lightboxImg{"));
  if (!/overflow:hidden/.test(stage)) throw new Error("the stage scrolls at rest — the image can leave the frame");
});

check("the way out cannot be moved off screen", () => {
  const btn = lbMarkup.slice(lbMarkup.indexOf("data-lightbox-close"));
  const tag = lbMarkup.slice(lbMarkup.lastIndexOf("<button", lbMarkup.indexOf("data-lightbox-close")), lbMarkup.indexOf(">", lbMarkup.indexOf("data-lightbox-close")));
  /* ABSOLUTE INSIDE A FIXED LAYER -- AND THIS TEST USED TO ASSERT THE
     OPPOSITE. It read `fixed` and called the job done, which is exactly
     the belief the second bug report killed: `fixed` anchors to the
     LAYOUT viewport, and a pinch does not move the layout viewport, it
     shrinks the VISUAL one into a window onto it. Measured at 393px:
     page scale 2 leaves a 197px-wide window with the button still at
     x=333, i.e. off screen, which is the whole complaint.

     So the FIXED thing is now #lightboxChrome, which is parked on the
     visual viewport by syncLightboxChrome(); the button is positioned
     against THAT and so must be absolute. Asserting `fixed` here again
     would restore the bug. */
  if (!/\babsolute\b/.test(tag)) throw new Error("the close button is not positioned against the chrome layer");
  if (/\bfixed\b/.test(tag)) throw new Error("the close button is fixed to the LAYOUT viewport again — a pinch will carry it off screen");
  if (!/w-11 h-11/.test(tag)) throw new Error("the close button is under the 44px minimum");
  // Above the image layer.
  const z = Number((tag.match(/z-\[(\d+)\]/) || [])[1]);
  const boxZ = Number((lbMarkup.match(/id="imageLightbox"[^>]*z-\[(\d+)\]/) || [])[1]);
  if (!(z > boxZ)) throw new Error(`the close button (z ${z}) is not above the overlay (z ${boxZ})`);
  if (!/aria-label="Cerrar"/.test(tag)) throw new Error("the close button is unlabelled");
});

check("six ways out, and the photo covers none of them", () => {
  // backdrop, button, Escape, swipe, back gesture, double-tap reset
  if (!/id="imageLightbox"[^>]*onclick="closeImageLightbox\(event\)"/.test(lbMarkup)) throw new Error("the backdrop no longer dismisses");
  if (!/onclick="closeImageLightbox\(\)"/.test(lbMarkup)) throw new Error("the close button no longer dismisses");
  const js = lbSrc.slice(lbSrc.indexOf("let lightboxScrollY = 0;"), lbSrc.indexOf("/* Handed from an auto card"));
  if (!js) throw new Error("the lightbox's behaviour is gone");
  if (!/e\.key === 'Escape'/.test(js)) throw new Error("Escape no longer dismisses");
  if (!/SWIPE_CLOSE_PX/.test(js)) throw new Error("swipe-down no longer dismisses");
  if (!/setLightboxZoom\(box\.getAttribute\('data-zoom'\) !== '1'\)/.test(js)) throw new Error("double-tap no longer toggles the zoom");

  /* A TAP ON THE PHOTO IS NOT A DISMISSAL -- the shopper is looking at
     it -- but a DOWNWARD SWIPE on it is, and only when not zoomed,
     where the same gesture is how the photograph is panned. */
  if (!/event\.target\.id === 'lightboxImg'\) return;/.test(js)) throw new Error("tapping the photo closes it");
  if (!/!zoomed && dy > SWIPE_CLOSE_PX && Math\.abs\(dy\) > Math\.abs\(dx\)/.test(js)) {
    throw new Error("a swipe closes in the wrong direction, or while zoomed");
  }
  // Two fingers is a pinch and none of our business.
  if (!/e\.touches\.length === 1/.test(js)) throw new Error("a two-finger gesture is being read as a swipe");
});

check("zoom can never take the way out with it", () => {
  /* NATIVE PINCH WAS THE MECHANISM. touch-action:pinch-zoom on the
     stage let iOS zoom the layout viewport, which is what carried the
     close button away. The zoom is a transform we set, so we always
     know the state and can always reset it. */
  const stage = lbStyle.slice(lbStyle.indexOf("#lightboxStage{"), lbStyle.indexOf("#lightboxImg{"));
  if (/pinch-zoom/.test(stage)) throw new Error("the stage hands the pinch back to the browser");
  if (!/touch-action:none/.test(stage)) throw new Error("the stage does not own its gestures");
  if (!/#imageLightbox\[data-zoom="1"\] #lightboxImg\{ transform:scale/.test(lbStyle)) throw new Error("the zoom is not a transform we control");
  const js = lbSrc.slice(lbSrc.indexOf("function setLightboxZoom("), lbSrc.indexOf("function lightboxHintText("));
  if (!/box\.removeAttribute\('data-zoom'\)/.test(js)) throw new Error("the zoom cannot be reset");
  // Closing always resets it, so it can never be reopened zoomed.
  /* SLICED FORWARD FROM THE FUNCTION, not back to a marker that moved.
     The popstate listeners were deliberately moved up beside the
     router's (order is their whole mechanism), so an end marker of
     "window.addEventListener('popstate'" now finds the EARLIER one and
     produces a backwards, empty slice -- which read as "closing leaves
     the zoom on" about code that removes it. */
  const dismissAt = lbSrc.indexOf("function dismissLightbox(){");
  const dismiss = lbSrc.slice(dismissAt, lbSrc.indexOf("document.addEventListener('keydown'", dismissAt));
  if (!dismiss) throw new Error("dismissLightbox is gone");
  if (!/removeAttribute\('data-zoom'\)/.test(dismiss)) throw new Error("closing leaves the zoom on");
  const open = lbSrc.slice(lbSrc.indexOf("function openImageLightbox(){"), lbSrc.indexOf("function closeImageLightbox("));
  if (!/setLightboxZoom\(false\)/.test(open)) throw new Error("it can reopen zoomed");
});

check("the page behind is pinned, and put back exactly", () => {
  const lock = lbSrc.slice(lbSrc.indexOf("function lockPageBehind(){"), lbSrc.indexOf("function lightboxIsOpen(){"));
  /* `body{overflow:hidden}` alone does not hold on iOS and loses where
     the shopper was. The negative offset IS the scroll position, so the
     restore is not a guess. */
  if (!/b\.position = 'fixed'/.test(lock)) throw new Error("the page behind is not pinned");
  if (!/b\.top = `-\$\{lightboxScrollY\}px`/.test(lock)) throw new Error("the lock does not record where the shopper was");
  if (!/window\.scrollTo\(0, lightboxScrollY\)/.test(lock)) throw new Error("the scroll position is never restored");
  // Idempotent in both directions: anything at all may call unlock.
  if (!/if \(lightboxLocked\) return;/.test(lock)) throw new Error("locking twice would lose the scroll position");
  if (!/if \(!lightboxLocked\) return;/.test(lock)) throw new Error("unlocking when nothing is locked is not safe");

  /* THE HALF OF THE BUG THAT OUTLIVED THE OVERLAY: navigate away with
     it open and the lock stayed on the body forever. */
  if (!/window\.addEventListener\('popstate', \(\) => \{ if \(!lightboxIsOpen\(\)\) unlockPageBehind\(\); \}\);/.test(lbSrc)) {
    throw new Error("a route change can leave the page behind permanently unscrollable");
  }
});

check("the overlay is hidden by our own stylesheet, not by the CDN's", () => {
  /* MEASURED WITH THE CDN BLOCKED: #imageLightbox computed to
     display:block and occupied 49px of the document, because the only
     thing hiding it was Tailwind's `hidden` -- a class from a
     stylesheet fetched over the network. Any load where that request
     fails rendered a dark panel across the shop. The page's own
     stylesheet now decides the default. */
  const rule = lbStyle.slice(lbStyle.indexOf("#imageLightbox{"), lbStyle.indexOf("#lightboxChrome{"));
  if (!rule) throw new Error("the overlay has no rule of its own — it is back to trusting the CDN");
  if (!/#imageLightbox\{ display:none \}/.test(rule)) throw new Error("the overlay is not hidden by default");
  if (!/#imageLightbox:not\(\.hidden\)\{ display:flex \}/.test(rule)) throw new Error("the overlay can no longer open");
  /* Keyed off the same class lightboxIsOpen() reads. Keying the CSS off
     `.flex` and the JS off `.hidden` is two sources of truth. */
  /* SLICE FORWARD FROM THE FUNCTION, not to the next "/* ====" -- that
     marker's first occurrence is thousands of lines ABOVE this, so the
     slice ran backwards and came back empty. A short bounded window is
     enough for a three-line function. */
  const openAt = lbSrc.indexOf("function lightboxIsOpen(){");
  if (openAt < 0) throw new Error("lightboxIsOpen is gone");
  if (!/!box\.classList\.contains\('hidden'\)/.test(lbSrc.slice(openAt, openAt + 400))) {
    throw new Error("lightboxIsOpen no longer reads .hidden — the CSS and the JS now disagree about what open means");
  }
});

check("the close button lives above the zoom layer, not inside it", () => {
  /* STRUCTURAL, NOT COSMETIC. Whatever transform the photograph is
     wearing must be unable to reach the chrome -- and the only way to
     guarantee that is for the chrome not to be a descendant of the
     thing being transformed. A z-index would not do it: a transformed
     ancestor becomes the containing block for everything inside it. */
  const stageAt  = lbMarkup.indexOf('id="lightboxStage"');
  const chromeAt = lbMarkup.indexOf('id="lightboxChrome"');
  const closeAt  = lbMarkup.indexOf("data-lightbox-close");
  if (chromeAt < 0) throw new Error("the chrome layer is gone — the close button is back in the layout viewport");
  if (!(closeAt > chromeAt)) throw new Error("the close button is outside the chrome layer");
  // The stage is closed before the chrome opens: siblings, not nested.
  const stageTag = lbMarkup.slice(stageAt);
  const stageEnd = stageAt + stageTag.indexOf("</div>") + 6;
  if (!(chromeAt > stageEnd)) throw new Error("the chrome layer is nested inside the zoom stage — the image transform will carry it");
  // And the layer itself is the fixed one.
  const rule = lbStyle.slice(lbStyle.indexOf("#lightboxChrome{"), lbStyle.indexOf("#lightboxChrome > *"));
  if (!rule) throw new Error("the chrome layer has no rule of its own");
  if (!/position:fixed/.test(rule)) throw new Error("the chrome layer is not fixed");
  if (!/transform-origin:0 0/.test(rule)) throw new Error("the counter-scale would resolve from the centre, not the corner");
  // It covers the screen, so it must not eat the backdrop tap.
  if (!/pointer-events:none/.test(rule)) throw new Error("the chrome layer swallows the backdrop tap");
  if (!/#lightboxChrome > \*\{ pointer-events:auto \}/.test(lbStyle)) throw new Error("nothing inside the chrome layer can be tapped");
});

check("the chrome is parked on the VISUAL viewport, at any zoom", () => {
  const fn = lbSrc.slice(lbSrc.indexOf("function syncLightboxChrome(){"), lbSrc.indexOf("let lightboxChromeBound"));
  if (!fn) throw new Error("nothing syncs the chrome to the visual viewport");
  if (!/window\.visualViewport/.test(fn)) throw new Error("the chrome is not measured against the visual viewport");
  /* THE TWO HALVES, AND NEITHER IS OPTIONAL. The translate follows a
     pinched page being panned (measured: a real pinch to 2.5x left the
     visual viewport at offset 118,240). The counter-scale is what keeps
     44px a real 44px on glass instead of a box the zoom inflates. */
  if (!/translate\(\$\{vv\.offsetLeft\}px, \$\{vv\.offsetTop\}px\)/.test(fn)) {
    throw new Error("the chrome does not follow the visual viewport's offset — panning a pinched page loses it");
  }
  if (!/scale\(\$\{1 \/ s\}\)/.test(fn)) throw new Error("the chrome is not counter-scaled — the touch target changes size with the zoom");
  if (!/vv\.width\s*\*\s*s/.test(fn) || !/vv\.height\s*\*\s*s/.test(fn)) {
    throw new Error("the layer is not sized in its own pre-scale units, so the counter-scale shrinks it off the viewport");
  }
  if (!/if \(!vv\)/.test(fn)) throw new Error("a browser with no visualViewport is not handled");
});

check("the sync runs while the lightbox is open, and only then", () => {
  const open = lbSrc.slice(lbSrc.indexOf("function openImageLightbox(){"), lbSrc.indexOf("/* Everything that dismisses ends up here."));
  const dis  = lbSrc.slice(lbSrc.indexOf("function dismissLightbox(){"), lbSrc.indexOf("document.addEventListener('keydown'"));
  if (!/bindLightboxChrome\(true\)/.test(open)) throw new Error("opening does not start tracking the visual viewport");
  /* The page can already be pinched when the lightbox opens, so the
     first sync cannot wait for the next resize event. */
  if (!/syncLightboxChrome\(\)/.test(open)) throw new Error("opening onto an already-pinched page leaves the chrome misplaced");
  if (!/bindLightboxChrome\(false\)/.test(dis)) throw new Error("closing leaves visualViewport listeners bound for good");
  const bind = lbSrc.slice(lbSrc.indexOf("function bindLightboxChrome(on){"), lbSrc.indexOf("/* ZOOM IS OURS"));
  for (const ev of ["'resize'", "'scroll'"]) {
    if (!bind.includes(ev)) throw new Error(`the chrome does not track the visual viewport's ${ev}`);
  }
  if (!/lightboxChromeBound === on/.test(bind)) throw new Error("binding twice would leave a listener behind");
});

check("two zooms never stack", () => {
  /* THE 'SNAPS BACK TO ZOOMED-IN' IN THE REPORT. iOS keeps pinch-zoom
     as an accessibility gesture that page CSS cannot disable, so our
     double-tap transform and the browser's page zoom are both live. Let
     both be on and releasing the pinch returns the PAGE to scale 1 with
     the photo still at 2.4 -- zoomed in, with no obvious way out. The
     browser's is the one the shopper can always pinch back out of, so
     a real two-finger gesture takes ours off. */
  const g = lbSrc.slice(lbSrc.indexOf("(function bindLightboxGestures(){"), lbSrc.indexOf("/* Handed from an auto card"));
  if (!g) throw new Error("the lightbox's gestures are gone");
  const start = g.slice(g.indexOf("'touchstart'"), g.indexOf("'touchmove'"));
  if (!/if \(!single\)\{/.test(start)) throw new Error("a two-finger gesture is no longer noticed");
  if (!/setLightboxZoom\(false\)/.test(start)) throw new Error("pinching on top of our own zoom stacks the two");
});

check("the back gesture closes the lightbox and nothing else", () => {
  /* ORDER IS THE WHOLE MECHANISM. popstate fires ON window, so window
     IS the target -- and at the target, listeners run in REGISTRATION
     order, capture flag or not. Registered after the router's, a
     capture listener runs second and stopImmediatePropagation() is far
     too late. Measured before this was fixed: tapping the X on a
     product page landed the shopper on Ofertas. */
  const ours = lbSrc.indexOf("if (lightboxPopPending){");
  const router = lbSrc.indexOf("routeDepth = Math.max(0, routeDepth - 1);");
  if (ours < 0) throw new Error("the lightbox no longer handles the back gesture");
  if (!(ours < router)) throw new Error("the lightbox's popstate listener is registered after the router's — it will never run first");
  if (!/e\.stopImmediatePropagation\(\);/.test(lbSrc.slice(ours, router))) throw new Error("the router still sees the lightbox's own pop");

  /* AND ONE POP PER DISMISSAL. history.back() is asynchronous and the
     close button sits INSIDE the overlay, so one tap ran
     closeImageLightbox twice -- and the second call, with the flag not
     yet cleared, popped a second entry. */
  const close = lbSrc.slice(lbSrc.indexOf("function closeImageLightbox(event){"), lbSrc.indexOf("function dismissLightbox(){"));
  if (!/if \(lightboxHistoryPushed && !lightboxPopPending\)/.test(close)) throw new Error("two handlers on one tap can pop two history entries");
  if (!/lightboxHistoryPushed = false;\s*\n\s*lightboxPopPending = true;/.test(close)) {
    throw new Error("the flag is not cleared before the asynchronous back()");
  }
  if (!/if \(!lightboxIsOpen\(\) && !lightboxHistoryPushed\) return;/.test(close)) throw new Error("a second dismissal is not a no-op");
});


/* ==================================================================
   "TAMBIÉN TE PUEDE INTERESAR" — the product page's rail.
   ================================================================== */
group("The related-products rail");

const relSrc = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");

check("the rules are the brief's, and they are run rather than read", () => {
  const { relatedProducts, RELATED_RAIL_MIN, RELATED_RAIL_MAX, RELATED_PRICE_BAND } = loadPageRelatedSlice();
  eq(RELATED_RAIL_MIN, 8, "the backfill threshold");
  eq(RELATED_RAIL_MAX, 10, "the card cap");
  eq(RELATED_PRICE_BAND, 0.5, "the price band");

  const it = (id, retailer, departments, price, extra) =>
    ({ title: id, retailer, departments, price, image: "x.jpg", ...extra });
  const anchor = it("ANCHOR", "macys", ["women"], 100);

  /* 1. SAME DEPARTMENT, ±50%, NEVER ITSELF. 50 and 150 are the edges and
     they are IN; a penny outside either is out. */
  const band = [
    it("lowEdge", "macys", ["women"], 50),
    it("highEdge", "macys", ["women"], 150),
    it("tooCheap", "macys", ["women"], 49.99),
    it("tooDear", "macys", ["women"], 150.01),
    it("otherDept", "macys", ["men"], 100),
    anchor,
  ];
  /* min:0 isolates RULE ONE. Left at its real threshold this pool has
     only two department matches, so the same-store backfill fires and
     legitimately pulls `otherDept` in -- which is the rules working, not
     the band leaking. Rule two is tested on its own below. */
  eq(relatedProducts(anchor, band, { min: 0 }).map(p => p.title).join(), "lowEdge,highEdge",
    "rule one: the ±50% band, its edges, the wrong department, and the anchor itself");
  // Both edges are IN; a penny past either is out.
  eq(relatedProducts({ ...anchor, price: 100 }, [it("e50", "macys", ["women"], 50)], { min: 0 }).length, 1, "the low edge is excluded");
  eq(relatedProducts({ ...anchor, price: 100 }, [it("e150", "macys", ["women"], 150)], { min: 0 }).length, 1, "the high edge is excluded");
  /* And with the real threshold the SAME pool grows, because two matches
     is under eight -- the backfill is not optional politeness, it is
     what the brief asks for. */
  eq(relatedProducts(anchor, band).map(p => p.title).join(), "lowEdge,highEdge,otherDept",
    "rule two did not backfill a thin department from the same store");

  /* 2. FAIL CLOSED ON PRICE. The cache really does carry priceless
     records, and a card with no price is a promise the page it opens
     cannot keep. */
  const priceless = [
    it("nullPrice", "macys", ["women"], null),
    it("zero", "macys", ["women"], 0),
    it("empty", "macys", ["women"], ""),
    it("nan", "macys", ["women"], NaN),
    it("negative", "macys", ["women"], -100),
    it("good", "macys", ["women"], 100),
  ];
  eq(relatedProducts(anchor, priceless).map(p => p.title).join(), "good", "a priceless candidate reached the rail");

  /* ...and if the PRODUCT BEING VIEWED has no price there is no band to
     compute from, so the rail draws nothing rather than guessing. */
  for (const bad of [null, 0, -5, NaN, "", undefined]) {
    eq(relatedProducts({ ...anchor, price: bad }, band).length, 0, `an anchor priced ${JSON.stringify(bad)} still produced a rail`);
  }
  eq(relatedProducts(undefined, band).length, 0, "no anchor at all still produced a rail");
  eq(relatedProducts(anchor, []).length, 0, "an empty catalogue produced a rail");

  // A candidate with no photograph is a grey box, not a card.
  eq(relatedProducts(anchor, [it("noPhoto", "macys", ["women"], 100, { image: "" }), it("ok", "macys", ["women"], 100)])
    .map(p => p.title).join(), "ok", "a card with no photograph reached the rail");

  /* 3. BACKFILL FROM THE SAME STORE when the department is thin — and
     only then, and only inside the same band. */
  const thin = [
    it("dept1", "macys", ["women"], 100),
    it("sameStoreA", "macys", ["home_goods"], 90),
    it("sameStoreB", "macys", ["home_goods"], 110),
    it("otherStore", "target", ["home_goods"], 100),   // wrong store, wrong dept
    it("sameStoreOutOfBand", "macys", ["home_goods"], 400),
  ];
  const filled = relatedProducts(anchor, thin).map(p => p.title);
  eq(filled.join(), "dept1,sameStoreA,sameStoreB", "the backfill is same-store, same-band, department first");

  // With eight already in the department, the backfill never runs.
  const plenty = Array.from({ length: 9 }, (_, i) => it("d" + i, "macys", ["women"], 100));
  plenty.push(it("sameStoreFiller", "macys", ["home_goods"], 100));
  const full = relatedProducts(anchor, plenty).map(p => p.title);
  if (full.includes("sameStoreFiller")) throw new Error("the backfill ran with nine department matches already found");

  // 4. TEN AT MOST.
  const many = Array.from({ length: 40 }, (_, i) => it("m" + i, "macys", ["women"], 100));
  eq(relatedProducts(anchor, many).length, RELATED_RAIL_MAX, "the rail is capped at ten");

  /* THE SAME PRODUCT IS NEVER OFFERED TWICE, however many buckets of the
     cache it sits in — Old Navy's `clothing` is a merge of its gendered
     ones, so a naive pass shows the same jeans twice. */
  const dupe = [it("jeans", "oldnavy", ["women", "clothing"], 100), it("jeans", "oldnavy", ["clothing"], 100)];
  eq(relatedProducts({ ...anchor, retailer: "oldnavy", departments: ["women"] }, dupe).length, 1, "the same product was offered twice");
  // And an anchor matches on ANY bucket it belongs to, not just the first.
  eq(relatedProducts({ title: "A", retailer: "x", departments: ["clothing"], price: 100 },
    [it("viaSecondBucket", "y", ["women", "clothing"], 100)]).length, 1, "a department match was missed on a second bucket");
});

check("the rail is deterministic — no model, no score, no timer", () => {
  const rail = relSrc.slice(relSrc.indexOf("const RELATED_RAIL_MIN = 8;"), relSrc.indexOf("/* ONE STORE PER CARD IN THE OPENING RUN."));
  if (!rail) throw new Error("the related rail's code is gone");
  const js = stripComments(rail);
  /* "Deterministic, no AI" was the brief's first word on sourcing. A
     fetch to a model, a random tiebreak or a similarity score would all
     make the rail something a shopper could not check by hand. */
  for (const banned of ["fetch(", "Math.random", "embedding", "similarity", "aria-chat"]) {
    if (js.includes(banned)) throw new Error(`the rail is no longer deterministic: ${banned}`);
  }
  // Manual swipe only.
  for (const banned of ["setInterval", "setTimeout", "requestAnimationFrame", "scrollBy(", "scrollTo(", "scrollIntoView(", "scrollLeft ="]) {
    if (js.includes(banned)) throw new Error(`the rail moves on its own: ${banned}`);
  }
});

check("the rail sits below the details and above the footer, on a rail that snaps", () => {
  const view = relSrc.slice(relSrc.indexOf('<div id="productView"'), relSrc.indexOf('<!-- ============ SALES / DEALS VIEW'));
  const buyAt = view.indexOf('id="addToCartBtn"');
  const railAt = view.indexOf('id="relatedRail"');
  if (railAt < 0) throw new Error("the product page has no related rail");
  if (!(buyAt >= 0 && buyAt < railAt)) throw new Error("the rail is not below the product's details");
  // Inside the product view, so it cannot outlive the page it belongs to.
  if (railAt < 0 || railAt > view.length) throw new Error("the rail escaped the product view");

  if (!/<h2 id="relatedRailTitle"[^>]*>También te puede interesar<\/h2>/.test(view)) {
    throw new Error("the rail is not titled 'También te puede interesar'");
  }
  /* HIDDEN UNTIL IT HAS SOMETHING HONEST TO SHOW. A heading over an
     empty row is worse than no heading. */
  if (!/<section id="relatedRail"[^>]*\shidden\b/.test(view)) throw new Error("the rail starts visible and empty");
  const row = view.slice(view.indexOf('id="relatedRailRow"'));
  const cls = row.slice(0, row.indexOf(">"));
  if (!/\bariaRail\b/.test(cls)) throw new Error("the row is not a snapping rail");
  if (!/\boverflow-x-auto\b/.test(cls)) throw new Error("the row cannot be swiped");
});

check("the cards are the Ofertas component, and they route back through showProduct", () => {
  /* REUSED, NOT REDRAWN. One component means the discount badge, the
     struck price and the store mark cannot come to differ between the
     home page's rail and this one. */
  const render = relSrc.slice(relSrc.indexOf("async function renderRelatedRail("), relSrc.indexOf("/* ONE STORE PER CARD IN THE OPENING RUN."));
  if (!/railCardHTML\(p, `openRelatedProduct\(\$\{i\}\)`/.test(render)) throw new Error("the rail draws its own card instead of the shared one");
  const card = relSrc.slice(relSrc.indexOf("function railCardHTML("), relSrc.indexOf("function mobileDealCardHTML("));
  if (!/w-\[172px\]/.test(card)) throw new Error("the card is no longer 172px");
  if (!/cardPhotoHTML\(/.test(card)) throw new Error("the card lost the shared product photo");
  if (!/retailerBadgeHTML\(/.test(card)) throw new Error("the card lost the store mark");
  if (!/background:#F4C463[\s\S]{0,40}-\$\{pct\}%/.test(card)) throw new Error("the card lost the gold discount badge");
  if (!/line-through/.test(card)) throw new Error("the card lost the struck original price");

  /* TAPPING A CARD OPENS THAT PRODUCT'S PAGE, WHICH RENDERS ITS OWN
     RAIL — true because the tap goes back through showProduct(), the
     one door onto this page, and showProduct() is what draws the rail. */
  const open = relSrc.slice(relSrc.indexOf("function openRelatedProduct("), relSrc.indexOf("async function renderRelatedRail("));
  if (!/showProduct\(/.test(open)) throw new Error("a card does not open the product page");
  const show = relSrc.slice(relSrc.indexOf("function showProduct("), relSrc.indexOf("function productBackHref") >= 0 ? relSrc.indexOf("function productBackHref") : relSrc.indexOf("function showProduct(") + 12000);
  /* THE CALL HAS TO BE LIVE, not merely present. A text match sees
     `if (0) renderRelatedRail(...)` and reports it as wired, so the
     statement is required to START its line -- no guard, no `&&`, no
     comment in front of it. */
  if (!/\n  renderRelatedRail\(\{ retailer, title: name, brand: [^,]+, price: totalUsd/.test(show)) {
    throw new Error("showProduct no longer draws the rail unconditionally — a product opened any other way gets none");
  }
});


group("Search answers from the catalogue first");

{
  const cs = loadPageCatalogSearchSlice();
  const P = (title, brand, retailer) => ({ title, brand: brand || "", retailer: retailer || "macys", price: 20 });

  check("a token matches a word, never a substring inside one", () => {
    /* THE BUG THIS PINS. Scoring on haystack.includes(token) ranked
       "Vanity Fair ... Contour Bra" above Nike trainers for "Nike Air
       Force", because "air" is inside "Fair". Measured, and the reason
       matching is on whole words now. */
    const bra = P("Beauty Back Smoothing Full-Figure Contour Bra", "Vanity Fair Lingerie");
    const shoe = P("Zoom Vomero 5 Sneakers", "Nike");
    const toks = cs.searchTokens("nike air force");
    if (cs.scoreCatalogItem(bra, toks) > 0) throw new Error('"air" matched inside "Fair" — substring matching is back');
    if (!(cs.scoreCatalogItem(shoe, toks) > 0)) throw new Error("a Nike product no longer matches the word Nike");
    /* Compare by title, not identity: ranked items are copies now, so
       the match score can ride along with each one and survive the
       feed's own sort. */
    const { items } = cs.rankCatalogMatches([bra, shoe], "nike air force", {});
    if (items[0].title !== shoe.title) throw new Error("the bra outranks the Nike trainers again");
    if (!Number.isFinite(items[0].matchScore)) throw new Error("the match score is not carried on the item — any re-sort loses the ranking");
  });

  check("a pluralised translation still finds the singular title", () => {
    /* translateQuery("Vitamina D3") returns "vitamins D3" -- the Spanish
       layer pluralises -- while the catalogue says "Vitamin D3".
       Measured before the fix: 0 full matches on 5 correct products, on
       one of the four queries the brief names. */
    const item = P("Nature Made Extra Strength Vitamin D3 5000 IU", "Nature Made");
    const res = cs.rankCatalogMatches([item], "vitamins d3", {});
    if (res.exact !== 1) throw new Error(`"vitamins d3" did not fully match "Vitamin D3" (exact ${res.exact})`);
    // ...and the stem floor still keeps short tokens from matching everything.
    if (cs.catalogTokenHits(new Set(["sneakers"]), ["a"]) !== 0) throw new Error('"a" matched a word that starts with it');
    if (cs.catalogTokenHits(new Set(["de"]), ["desodorante"]) !== 0) throw new Error("a 2-letter word matched a long token");
  });

  check("matching every token outranks matching some, and a brand hit outranks a title hit", () => {
    const toks = cs.searchTokens("nike shorts");
    const both = P("Pro 3in Shorts", "Nike");
    const brandOnly = P("Zoom Vomero 5 Sneakers", "Nike");
    const titleOnly = P("Cargo Shorts With Stretch", "");
    const s1 = cs.scoreCatalogItem(both, toks), s2 = cs.scoreCatalogItem(brandOnly, toks), s3 = cs.scoreCatalogItem(titleOnly, toks);
    if (!(s1 > s2)) throw new Error("a full match does not outrank a brand-only match");
    if (!(s2 > s3)) throw new Error("a brand hit does not outrank an incidental title word");

    /* AND THE ORDERING THE BRAND BONUS WOULD OTHERWISE BREAK. Coverage
       alone puts a brand-only partial (0.5 + 0.75 brand = 1.25) ABOVE a
       product that matched every word (1.0). Something that answers the
       whole question must never rank below something that answered half
       of it loudly, which is what the full-match bonus is for. */
    const everyWord = P("Nike Pro Shorts", "");            // both tokens, no brand field
    const brandHalf = P("Zoom Vomero 5 Sneakers", "Nike"); // half the tokens, brand hit
    if (!(cs.scoreCatalogItem(everyWord, toks) > cs.scoreCatalogItem(brandHalf, toks))) {
      throw new Error("a brand-only partial match outranks a product that matched every word");
    }
  });

  check("thin is counted in FULL matches, never in the total", () => {
    /* The catalogue holds no Air Force and twelve Nikes. Twelve results
       with zero full matches is exactly when the live offer has to be
       loud, so the count that decides it cannot be the total. */
    const pool = Array.from({ length: 12 }, (_, i) => P(`Nike thing ${i}`, "Nike"));
    const res = cs.rankCatalogMatches(pool, "nike air force", {});
    if (res.exact !== 0) throw new Error("something matched all of 'nike air force'");
    if (res.partial !== 12) throw new Error(`expected 12 partial matches, got ${res.partial}`);
    if (!cs.catalogResultsAreThin(res)) throw new Error("12 partial matches and 0 full ones did not read as thin");
    const solid = cs.rankCatalogMatches(Array.from({ length: 4 }, (_, i) => P(`Cargo Pants ${i}`)), "pants", {});
    if (cs.catalogResultsAreThin(solid)) throw new Error("4 full matches read as thin");
  });

  check("an accented word is one token, not two", () => {
    /* THE BUG, AND IT IS THE SUBSTRING BUG WEARING A DIFFERENT HAT.
       `[a-z0-9]+` treats "ú" as a separator, so "búscame" tokenised to
       ["b","scame"] -- and a ONE-CHARACTER token was then allowed to
       prefix-match every word starting with b. Measured on the real
       catalogue for "búscame unos tenis Nike": 2,144 partial matches,
       televisions and a gift box ranked as answers about trainers.
       After: 19, all footwear. */
    if (cs.searchTokens("búscame").join(",") !== "buscame") throw new Error("an accented word still splits into pieces");
    if (cs.searchTokens("Niños").join(",") !== "ninos") throw new Error("ñ splits the word");
    // ...and a short token may no longer wildcard its way across the shelf.
    const tv = P("onn 32 in Class 720p HD Smart TV", "");
    if (cs.scoreCatalogItem(tv, ["b"]) > 0) throw new Error('"b" matched a word merely beginning with b');
    if (cs.scoreCatalogItem(tv, ["sm"]) > 0) throw new Error('a two-letter prefix still wildcards');
    // An EXACT word of any length is still a match: "tv", "d3", "5k".
    if (!(cs.scoreCatalogItem(tv, ["tv"]) > 0)) throw new Error('"tv" no longer matches the word TV');
  });

  check("the rare word outranks the common one", () => {
    /* "sneakers nike" put a generic running shoe exactly level with a
       Nike trainer -- each matched one of two words, so each scored
       0.5. Hundreds of sneakers are in the catalogue and a few dozen
       Nikes, so "nike" carried nearly all of the intent. Tokens are
       weighted by how many items they match. */
    const pool = [
      ...Array.from({ length: 60 }, (_, i) => P(`Everyday Backpack model ${i}`, "")),
      P("Nike Brasilia Backpack", ""),
    ];
    /* Deliberately NOT a category word: "sneakers" now carries a
       footwear intent, and this check is about rarity weighting, not
       about category filtering. */
    const { items } = cs.rankCatalogMatches(pool, "backpack nike", {});
    if (!/Nike/.test(items[0].title)) throw new Error(`the common word still wins: "${items[0].title}"`);
    const w = cs.catalogTokenWeights(pool, ["backpack", "nike"]);
    if (!(w[1] > w[0])) throw new Error("the rarer token is not weighted higher");
  });

check("a category query is answered by category, not by wording", () => {
    /* TRACED AGAINST PRODUCTION. "María, búscame zapatos para niño"
       ranked women's jeans first (the leaked "María" prefix-matched
       "Mariah", and rarity weighting made that junk token the most
       valuable thing in the query), then a dress shoe, then vitamin
       gummies and T-shirts that matched nothing but "boys".

       Worse, the real answer could not appear at all: "zapatos"
       translates to "shoes" and no Foot Locker title contains that
       word -- they read "Jordan Retro 4 - Boys' Grade School". */
    const shoe = (title, retailer) => ({ title, retailer: retailer || "footlocker", price: 90, departments: ["kids"] });
    const notShoe = (title) => ({ title, retailer: "target", price: 10, departments: ["pharmacy"] });
    // categoryOf is injected here; in the page it is catalogItemCategory,
    // which reads sizeCategoryFor -- the size picker's own rule.
    const categoryOf = (it) => (it.retailer === "footlocker" || /shoe|sneaker/i.test(it.title) ? "footwear" : null);

    const pool = [
      notShoe("Juniors' Mariah High-Rise Baggy Wide-Leg Jeans"),
      notShoe("One A Day Teen Multivitamin Gummies for Boys"),
      notShoe("Short-Sleeve Graphic T-Shirt for Boys"),
      shoe("Jordan Retro 4 - Boys' Grade School"),
      shoe("New Balance 9060 - Boys' Grade School"),
    ];
    const res = cs.rankCatalogMatches(pool, "shoes boys", { categoryOf });
    // 1. Cross-category noise is not a candidate at all.
    for (const it of res.items) {
      if (/Mariah|Gummies|T-Shirt/.test(it.title)) throw new Error(`cross-category noise came back: "${it.title}"`);
    }
    // 2. A title that never says "shoes" still answers a shoe query.
    if (!res.items.some((i) => /Jordan Retro 4/.test(i.title))) {
      throw new Error("Foot Locker's inventory is still invisible to a shoe query");
    }
    // ...and it counts as a FULL match, not a partial one.
    if (res.exact < 2) throw new Error(`the category words were not credited to the item (exact ${res.exact})`);
  });

check("an item's own category is read three ways, and each one matters", () => {
    /* The ranking checks above inject categoryOf, so this exercises the
       REAL catalogItemCategory. In this sandbox sizeCategoryFor does
       not exist -- that is deliberate, and it isolates the two rules
       that do not need it. */
    if (cs.catalogItemCategory({ title: "Jordan Retro 4", retailer: "footlocker", departments: ["shoes"] }) !== "footwear") {
      throw new Error("a footwear DEPARTMENT no longer settles it");
    }
    if (cs.catalogItemCategory({ title: "Running Sneakers, Wide Width", retailer: "walmart", departments: ["clothing"] }) !== "footwear") {
      throw new Error("a title that names footwear no longer settles it");
    }
    if (cs.catalogItemCategory({ title: "Graphic T-Shirt for Boys", retailer: "oldnavy", departments: ["kids"] }) !== null) {
      throw new Error("a T-shirt reads as footwear");
    }
    /* And the boot caveat holds on the item side too, or every pair of
       bootcut jeans becomes a candidate for a shoe query. */
    if (cs.catalogItemCategory({ title: "725 High-Waist Stretch Bootcut Jeans", retailer: "macys", departments: ["women"] }) !== null) {
      throw new Error("bootcut jeans read as footwear");
    }
  });

    check("a query with no category intent is left alone", () => {
    /* The filter must not fire on everything -- "vitamin d3" has no
       category, so nothing is excluded and the old behaviour stands. */
    const categoryOf = () => "footwear";
    const pool = [P("Nature Made Vitamin D3 Softgels", ""), P("Something Else", "")];
    const res = cs.rankCatalogMatches(pool, "vitamin d3", { categoryOf });
    if (!res.items.length) throw new Error("a query with no category intent was filtered anyway");
    if (cs.queryCategoryIntent("vitamin d3")) throw new Error("'vitamin d3' reads as a category query");
    if (cs.queryCategoryIntent("zapatos") ) throw new Error("the intent is read from the Spanish, not the translated query");
    if (cs.queryCategoryIntent("shoes") !== "footwear") throw new Error("'shoes' no longer names a category");
  });

    check("an empty query matches nothing at all", () => {
    // Otherwise a stray submit would render the whole catalogue as "results".
    for (const q of ["", "   ", "!!!"]) {
      const res = cs.rankCatalogMatches([P("Cargo Pants")], q, {});
      if (res.items.length) throw new Error(`"${q}" returned ${res.items.length} results`);
    }
  });

  check("the feed is capped, and the cap keeps the best", () => {
    const pool = [...Array.from({ length: 200 }, (_, i) => P(`Pants ${i}`)), P("Cargo Pants", "Nike")];
    const res = cs.rankCatalogMatches(pool, "nike pants", {});
    if (res.items.length !== cs.CATALOG_SEARCH_LIMIT) throw new Error(`cap is ${cs.CATALOG_SEARCH_LIMIT}, got ${res.items.length}`);
    if (res.items[0].brand !== "Nike") throw new Error("the cap dropped the best match");
  });
}

check("Aria reads the catalogue before she ever calls a store", () => {
  /* THE BUG. runAssistantBrain fanned straight out to Apify on every
     product question. With the account over its limit the shopper sat
     through four timeouts, read "Tuve un problema buscando eso", and
     the model -- handed no products -- said we had none. We had them. */
  const src = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
  const brainAt = src.indexOf("async function runAssistantBrain(text){");
  const brain = src.slice(brainAt, src.indexOf("/* ONE PAYLOAD, TWO ENDPOINTS.", brainAt));
  if (!brain) throw new Error("runAssistantBrain is gone");
  if (/scrapeRetailer\s*\(/.test(brain)) throw new Error("Aria scrapes again on every question — billable, and dead when Apify is");
  if (!/await catalogSearch\(searchQuery/.test(brain)) throw new Error("Aria no longer asks the catalogue");
  if (!/addAssistantLiveOffer\(searchQuery\)/.test(brain)) throw new Error("there is no way to ask for a live search from the chat");
  // The live fan-out still exists — it just waits to be asked.
  const liveAt = src.indexOf("async function runAssistantLiveSearch(query){");
  if (liveAt < 0) throw new Error("the chat's live search is gone entirely");
  const live = src.slice(liveAt, src.indexOf("async function runAssistantBrain(text){", liveAt));
  if (!/scrapeRetailer\s*\(/.test(live)) throw new Error("the chat's live search no longer scrapes");
  /* Every store failing is our fault and must not be worded as an
     answer about the product — same rule as the results page. */
  if (!/failedStores\.length === CHAT_RETAILERS\.length/.test(live)) throw new Error("a partial failure now reads as total");
  if (!/La búsqueda en vivo no está disponible en este momento/.test(live)) throw new Error("the honest wording is gone from the chat");
});

check("her own name is not part of the order", () => {
  const src = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
  const fnAt = src.indexOf("function stripAriaVocative(raw){");
  if (fnAt < 0) throw new Error("the vocative is back in the query");
  const build = src.slice(src.indexOf("function buildChatSearchQuery(text, recipient){"), src.indexOf("const extra = [];"));
  if (!/stripAriaVocative\(String\(text \|\| ''\)\)/.test(build)) throw new Error("the retail query still carries the name");
  const ack = src.slice(src.indexOf("function chatAckEs(text){"), src.indexOf("const short = clampWords"));
  if (!/stripAriaVocative\(text\)/.test(ack)) throw new Error("the status line still echoes the name back");
  /* THE MISHEARD NAMES ARE ALSO REAL WORDS. "area rug" is a product and
     "Maria Tash" is a jewellery house, so these are only stripped when
     what follows settles it -- punctuation, or a request verb. Asserted
     by RUNNING the function: this used to pin the regex's source text,
     which broke the moment the pattern was rewritten to cover "María"
     even though every behaviour it cared about still held. */
  const strip = new Function(src.slice(src.indexOf("const ARIA_GREETED_VOCATIVE_RE"), src.indexOf("function buildChatSearchQuery"))
    + ";return stripAriaVocative;")();
  for (const [input, want] of [
    ["Aria, búscame unos tenis", "búscame unos tenis"],
    ["hey Aria zapatos", "zapatos"],
    ["Area, busca zapatillas", "busca zapatillas"],
    ["María, búscame zapatos para niño", "búscame zapatos para niño"],
    ["Maria busca zapatos", "busca zapatos"],
    ["area rug", "area rug"],
    ["Maria Tash earrings", "Maria Tash earrings"],
    ["Aria", "Aria"],
  ]) {
    const got = strip(input);
    if (got !== want) throw new Error(`stripAriaVocative(${JSON.stringify(input)}) = ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
  }
});

check("the live offer is refined before it is spent", () => {
  const src = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
  const offer = src.slice(src.indexOf("function liveSearchOfferHTML()"), src.indexOf("function renderLiveChipsOnly()"));
  if (!offer) throw new Error("the live-search offer is gone");
  for (const copy of ["¿No lo encuentras aquí? Búscalo en vivo.", "Buscamos en este momento en tiendas de EE. UU."]) {
    if (!offer.includes(copy)) throw new Error(`the agreed copy is gone: "${copy}"`);
  }
  if (!/data-live-refine/.test(offer)) throw new Error("there is no box to refine the query in");
  if (!/value="\$\{escapeHtml\(current\)\}"/.test(offer)) throw new Error("the box is not prefilled with the shopper's query");
  if (/readonly|disabled/i.test(offer)) throw new Error("the box is not editable");
  /* 16px MINIMUM. Anything smaller and mobile Safari zooms the page in
     on focus, stranding the shopper zoomed on a panel they were only
     correcting a word in. */
  if (!/text-\[16px\]/.test(offer)) throw new Error("the refine box is under 16px — iOS will zoom the page on focus");
  if (!/liveRefineChipsHTML\(current\)/.test(offer)) throw new Error("the category chips are gone");
  // The scan must go out with what is in the box, not the original words.
  const runAt = src.indexOf("async function runLiveSearch(){");
  const run = src.slice(runAt, runAt + 900);
  if (!/const query = liveRefineValue\(\)\.trim\(\);/.test(run)) {
    throw new Error("the live scan ignores the refined query — every chip and correction would be a lie");
  }
  // Yellow means a discount here, and this is not one.
  if (/var\(--yellow/.test(offer)) throw new Error("the offer is wearing the discount colour");
});

check("a trouser cut is not a shoe", () => {
  /* \bboot MATCHED "Bootcut". Bootcut is a trouser leg, and the
     catalogue is full of them -- measured, 23 of the 148 items the
     catalogue classified as footwear were trousers, every one of them
     offered SHOE sizes by the PDP's picker. */
  const sz = loadPageSizeSlice();
  /* "Bootcut Corduroy" carries NO garment noun, so the precedence rule
     cannot rescue it -- only the closing \\b and the lookahead can. */
  if (sz.sizeCategoryFor("macys", "Bootcut Corduroy") !== "clothing") throw new Error("'Bootcut Corduroy' is sized as footwear");
  if (sz.sizeCategoryFor("macys", "Boot-Cut Corduroy") !== "clothing") throw new Error("'Boot-Cut Corduroy' is sized as footwear");
  for (const t of ["Regular Fit Boot Cut Jeans", "Women's Mid-Rise Bootcut Pants",
                   "725 High-Waist Classic Stretch Bootcut Jeans", "Women's 725 High-Rise Kick Boot Jeans",
                   "Green Boot-Cut Track Pants", "Premium Women's Wedgie Boot High-Rise Jeans"]) {
    if (sz.sizeCategoryFor("macys", t) !== "clothing") throw new Error(`"${t}" is sized as footwear`);
  }
  /* And real boots still are shoes -- including the singular, which is
     how SSENSE writes them, and which carries no garment word. */
  for (const t of ["Ankle Boots", "Chelsea Boot", "Booties", "Dress Shoes", "Leather Sneakers"]) {
    if (sz.sizeCategoryFor("macys", t) !== "shoe") throw new Error(`"${t}" stopped being footwear`);
  }
});

check("searching never starts an Apify run on its own", () => {
  /* THE COST LEAK AND THE OUTAGE, WHICH ARE THE SAME LINE. showResults()
     used to fan out to every retailer on every submit: a bill per
     search, and a blank page the moment Apify stopped answering. The
     fan-out lives in runLiveSearch() now, which only a click reaches. */
  const src = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
  const show = src.slice(src.indexOf("async function showResults(query, opts = {})"), src.indexOf("async function runLiveSearch()"));
  if (!show) throw new Error("showResults or runLiveSearch is gone");
  if (/scrapeRetailer\s*\(/.test(show)) throw new Error("showResults scrapes again — every search is billable and dies with Apify");
  if (!/await catalogSearch\(/.test(show)) throw new Error("showResults no longer asks the catalogue");
  const liveFrom = src.indexOf("async function runLiveSearch()");
  const live = src.slice(liveFrom, src.indexOf("// RULE: every product card on the site", liveFrom));
  if (!/scrapeRetailer\s*\(/.test(live)) throw new Error("the live scan no longer scrapes anything");
  if (!/onclick="runLiveSearch\(\)"/.test(src)) throw new Error("nothing in the page can start a live search");
});

check("the shopper is told the truth when live search cannot run", () => {
  const src = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
  const offer = src.slice(src.indexOf("function liveSearchOfferHTML()"), src.indexOf("function renderLiveSearchOffer()"));
  if (!offer) throw new Error("the live-search offer is gone");
  for (const copy of ["¿No lo encuentras aquí? Búscalo en vivo.", "Buscamos en este momento en tiendas de EE. UU.", "La búsqueda en vivo no está disponible en este momento."]) {
    if (!offer.includes(copy)) throw new Error(`the agreed copy is gone: "${copy}"`);
  }
  /* "Unavailable" is OUR failure and must not be worded as an answer
     about the product -- and it must be reachable only when every store
     failed, not when they all answered "nothing". */
  /* SLICE FORWARDS. liveSearchOfferHTML() is declared ABOVE
     runLiveSearch(), so slicing from the one to the other ran backwards
     and handed this check an empty string -- which passed every regex
     put to it while measuring nothing. End on something that genuinely
     follows the function. */
  const liveAt = src.indexOf("async function runLiveSearch()");
  const live = src.slice(liveAt, src.indexOf("// RULE: every product card on the site", liveAt));
  if (!live) throw new Error("runLiveSearch's end marker moved");
  if (!/failures\.length === GENERAL_RETAILERS\.length \? 'unavailable' : 'done'/.test(live)) {
    throw new Error("a partial failure now reads as 'live search is unavailable'");
  }
  // Yellow means a discount on this site. The offer is not one.
  if (/var\(--yellow/.test(offer)) throw new Error("the live-search offer is wearing the discount colour");
});

check("every store that can appear in the feed can also be ticked", () => {
  /* Measured: "pants" matched 46 Macy's products and 2 Walmart ones and
     the page rendered 2, because the filter list was GENERAL_RETAILERS
     -- the four scrapeable stores -- so activeSearchStores() silently
     excluded every browse-only store the catalogue had just found. */
  const src = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
  const init = src.slice(src.indexOf("function initResultsFilters()"), src.indexOf("// Runs a real live search"));
  if (!/CATALOG_RETAILERS\.map/.test(init)) throw new Error("the results filter is built from the live retailers again — browse-only stores get filtered out of their own results");
});


/* ==================================================================
   THE FARFETCH TREATMENT.

   The thesis of the reference is that the luxury look is not a palette:
   it is the photography carrying the design and the UI getting out of
   its way. Everything below is the UI getting out of the way, pinned by
   the rules that decide it -- the browser suite boots with the CDN
   blocked and would be measuring an unstyled page.
   ================================================================== */
group("The Farfetch treatment");

const ffSrc = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
const ffStyle = ffSrc.slice(ffSrc.indexOf("<style>"), ffSrc.indexOf("</style>"));
const ffCard = ffSrc.slice(ffSrc.indexOf("function productCardHTML(p, opts){"), ffSrc.indexOf("function productCardOpenExpr(") > 0 ? ffSrc.length : ffSrc.length);
const productCard = (() => {
  const from = ffSrc.indexOf("function productCardHTML(p, opts){");
  return ffSrc.slice(from, ffSrc.indexOf("\n}", ffSrc.indexOf("return `", from)) + 2);
})();

check("a product card is a photograph, not a plate", () => {
  const shell = (ffSrc.match(/const CARD_SHELL_CLASS = '([^']*)'/) || [])[1];
  if (shell == null) throw new Error("CARD_SHELL_CLASS is gone");
  /* THE ANTI-PATTERNS, NAMED: no borders, no drop shadows, no grey
     pills, no bland white cards. The shell keeps layout and gives up
     chrome. */
  for (const banned of ["border", "shadow", "bg-white", "bg-zinc", "bg-gray", "bg-slate"]) {
    if (shell.includes(banned)) throw new Error(`the product card's shell is chrome again: "${banned}" in "${shell}"`);
  }
  if (/style="border-color/.test(productCard)) throw new Error("the card is drawing a border inline");
  if (/shadow-\[/.test(productCard)) throw new Error("the card has a drop shadow again");

  /* THE WHITE MOVED, IT DID NOT GO. Retail photography is shot on white
     and a tint draws a seam around the product, so the PHOTO field is
     still white -- and with the shell no longer clipping, the photo has
     to round and clip itself. */
  const frame = ffSrc.slice(ffSrc.indexOf("function cardImageFrameHTML("), ffSrc.indexOf("function cardPhotoHTML("));
  if (!/background = '#fff'/.test(frame)) throw new Error("the photo field is no longer white");
  if (!/round = true/.test(frame)) throw new Error("the photo field no longer rounds itself");
  if (!/rounded-2xl overflow-hidden/.test(frame)) throw new Error("the photo field does not clip its own overflow");

  /* AND NO BRAND CHROME ON THE PRODUCT. Navy and gold live at page
     level -- header bands, section fields, the orb -- and off the card.
     The one exception is the sale badge, which is the next check. */
  const body = productCard.slice(productCard.indexOf("return `"));
  const withoutBadge = body.replace(/background:#F4C463[^"]*/g, "");
  if (/background:var\(--navy\)|background:var\(--blue\)|background:var\(--amber\)/.test(withoutBadge)) {
    throw new Error("the product card is wearing brand chrome again");
  }
});

check("the category banner is NOT a product card, and kept its own shell", () => {
  /* THE REGRESSION THIS EXISTS FOR. Stripping the product card's plate
     silently squared every department tile on the home page, because
     both read the same constant: the tile relied on the shell's
     `rounded-2xl overflow-hidden` to hold its photograph and its navy
     sign band together as one object. The reference says these are a
     DIFFERENT thing -- full-bleed lifestyle imagery with text over it --
     so they get a different constant. */
  const cat = (ffSrc.match(/const CATEGORY_SHELL_CLASS = '([^']*)'/) || [])[1];
  if (cat == null) throw new Error("CATEGORY_SHELL_CLASS is gone — the banners are sharing the product shell again");
  for (const needed of ["rounded-2xl", "overflow-hidden", "bg-white"]) {
    if (!cat.includes(needed)) throw new Error(`the category banner lost "${needed}"`);
  }
  const tile = ffSrc.slice(ffSrc.indexOf("function deptTileHTML("), ffSrc.indexOf("function railCardHTML("));
  if (!/\$\{CATEGORY_SHELL_CLASS\}/.test(tile)) throw new Error("the department tile is not using the category shell");
  if (/\$\{CARD_SHELL_CLASS\}/.test(tile)) throw new Error("the department tile is back on the product shell");
  // Its own frame must NOT round, or it would round inside a rounded box.
  if (!/round: false/.test(tile)) throw new Error("the banner's photo rounds inside an already-rounded box");
  // And the navy sign band — page-level brand presence — stays.
  if (!/ariaGoldHair/.test(tile)) throw new Error("the banner lost its gold hairline");
});

check("information whispers and photography shouts", () => {
  const body = productCard.slice(productCard.indexOf("return `"));
  /* The reference's sizes: store mark small, product name small, price
     small. What was here was a 20px mark over a 15px bold navy title
     over a 22px extrabold price -- three lines competing with the
     product for the eye. */
  if (!/retailerBadgeHTML\(p\.retailer, 16\)/.test(body)) throw new Error("the store mark is not 16px");
  if (!/text-\[13px\] leading-snug[^"]*line-clamp-2/.test(body)) throw new Error("the product name is not 13px");
  if (!/text-\[14px\] font-bold tabular/.test(body)) throw new Error("the price is not 14px");
  for (const loud of ["text-[22px]", "text-[20px]", "text-[18px]", "text-[17px]"]) {
    if (body.includes(loud)) throw new Error(`the card is shouting again: ${loud}`);
  }
});

check("one sale colour on the whole site", () => {
  /* The big card drew its discount in #C0392B under a drop shadow while
     the phone's rails drew the same fact in the sale yellow. Two badges
     in two colours is two different claims to a shopper, and the
     standing rule is that yellow is for sale badges and for nothing
     else. */
  /* SCOPED TO DISCOUNT BADGES, not to the colour. #C0392B is also the
     site's error red -- a failed login, a negative margin in the admin
     ledger, a cancel button -- and banning it outright made this check
     fail on nine places that have nothing to do with a sale. What must
     not come back is a DISCOUNT drawn in it. */
  for (const slice of [productCard, ffSrc.slice(ffSrc.indexOf("function railCardHTML("), ffSrc.indexOf("function mobileDealCardHTML("))]) {
    const pct = slice.slice(Math.max(0, slice.indexOf("discountPct(") - 400), slice.indexOf("discountPct(") + 200);
    if (/#C0392B|background:\s*red|background:#[eE][0-9a-fA-F]{2}[0-3]/.test(pct)) {
      throw new Error("a discount badge is drawn in red again");
    }
  }
  const body = productCard.slice(productCard.indexOf("const badgeHTML"));
  if (!/background:#F4C463; color:var\(--navy\)/.test(body)) throw new Error("the card's discount badge is not the sale yellow");
  if (/shadow-\[/.test(body.slice(0, body.indexOf("return `")))) throw new Error("the badge has a drop shadow again");
  // The rails draw the same badge in the same colour.
  const rail = ffSrc.slice(ffSrc.indexOf("function railCardHTML("), ffSrc.indexOf("function mobileDealCardHTML("));
  if (!/background:#F4C463; color:var\(--navy\)/.test(rail)) throw new Error("the rail's badge drifted from the card's");
});

check("'Explora más' is outlined, and the card's CTA is the same quiet shape", () => {
  const rule = ffStyle.slice(ffStyle.indexOf(".ariaExploraMas{"), ffStyle.indexOf(".ariaExploraMas:hover"));
  if (!rule) throw new Error("the outlined button style is gone");
  if (!/background:transparent/.test(rule)) throw new Error("the outlined button grew a fill");
  if (!/border:1px solid/.test(rule)) throw new Error("the outlined button lost its outline");
  if (/box-shadow/.test(rule)) throw new Error("the outlined button grew a shadow");
  if (!/color:var\(--navy\)/.test(rule)) throw new Error("the outlined button is not navy");

  // Under the section, not beside its heading.
  /* SLICED FORWARD. This ended at "<!-- WHY SHOP WITH US -->", which
     now sits ABOVE the tiles rather than below them -- the explainer
     was moved so the category list stops interrupting the brand story.
     A slice that runs backwards returns "" and then passes every regex
     put to it while measuring nothing. End on what actually follows. */
  const catsAt = ffSrc.indexOf('<div id="cats"');
  const cats = ffSrc.slice(catsAt, ffSrc.indexOf("GARANTÍA DE PRECIO HONESTO", catsAt));
  if (!cats) throw new Error("the Categorías section's end marker moved again");
  /* MATCHED AS A WHOLE ATTRIBUTE. `indexOf("data-explora")` also matches
     `data-exploraX`, so renaming the hook away still read as present --
     a substring is not an attribute. */
  const gridAt = cats.indexOf('id="catGrid"'), btnAt = cats.search(/data-explora(?![\w-])/);
  if (btnAt < 0) throw new Error("there is no Explora más button");
  if (!/>Explora más</.test(cats)) throw new Error("the button no longer says Explora más");
  if (!(gridAt < btnAt)) throw new Error("Explora más is still above the section it belongs to");
  if (!/aria-label="Ver todas las categorías"/.test(cats)) throw new Error("Explora más does not say where it goes");

  /* THE CARD'S CTA IS THE SAME SHAPE. A full-width filled blue button
     was the loudest thing on a 169px card -- louder than the photo. It
     was not removed, because it carries the Comprar / Ver detalle
     distinction that keeps a card from promising a purchase the page
     behind it cannot complete. */
  const body = productCard.slice(productCard.indexOf("return `"));
  if (!/class="ariaExploraMas w-full focus-ring"/.test(body)) throw new Error("the card's CTA is not the quiet outlined shape");
  if (/background:var\(--blue\)/.test(body)) throw new Error("the card's CTA is a filled blue slab again");
  /* ASSERTED AS THE CONDITIONAL IT IS. This read `/>Comprar</` -- a
     literal label -- while the comment right above it describes the
     Comprar / Ver detalle distinction. The visual brief was written on
     a base where that distinction did not exist yet, so its code
     hardcoded "Comprar" and its test matched the hardcoding rather
     than the rule it had just written down. Both labels, through the
     price test, is what the comment means. */
  if (!/>\$\{hasPrice \? 'Comprar' : 'Ver detalle'\}</.test(body)) {
    throw new Error("the card's CTA no longer switches on whether there is a price — it can promise a purchase the product page cannot complete");
  }
});

check("the image-quality gate survived the restyle", () => {
  /* THE BRIEF ASKS FOR THIS AND IT ALREADY EXISTS -- what it does NOT
     yet have is anything to act on (see the PR: not one item in any
     committed catalogue carries an imageReview field, so nothing is
     actually screened). The gate itself must not be weakened by a
     visual change, because it is the rule that keeps an image with a US
     sticker price on it off a card whose price is ~24% higher. */
  if (!/if \(item\.imageReview && item\.imageReview !== 'clean'\) images = \[\];/.test(ffSrc)) {
    throw new Error("the image-quality gate is gone — a priced image can reach a card");
  }
  if (!existsSync(root("scripts/image-price-scan.js"))) throw new Error("the scanner that sets imageReview is gone");
});


/* ------------------------------------------------------------------ */

group("The designer's name, and the size that goes with it");

check("the brand is an eyebrow above the title, and absent when there is none", () => {
  /* item.brand was in the data and rendered nowhere: the "Brown Curved
     Vent Blazer" at $1,790 -> $537 is EGONlab and no surface said so.
     For a premium or marked-down piece the label IS the decision. */
  const src = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
  const fn = src.slice(src.indexOf("function brandEyebrowHTML(brand, opts){"), src.indexOf("/** The standard card for any listed product"));
  if (!fn) throw new Error("the brand eyebrow is gone");
  if (!/if \(!name\) return '';/.test(fn)) throw new Error("an empty brand still renders an element — a hole above every unbranded title");
  if (!/uppercase/.test(fn)) throw new Error("the eyebrow is not small caps");
  if (!/var\(--navy\)/.test(fn)) throw new Error("the eyebrow is not navy");
  if (!/escapeHtml\(name\)/.test(fn)) throw new Error("a retailer's brand string reaches innerHTML unescaped");

  /* ABOVE THE TITLE on all three surfaces, and a <span> in the rail's
     card because a <div> inside a <button> is not valid content. */
  const rail = src.slice(src.indexOf("function railCardHTML(p, onclick, attr){"), src.indexOf("function mobileDealCardHTML"));
  const railBrand = rail.indexOf("brandEyebrowHTML"), railTitle = rail.indexOf("escapeHtml(p.title)");
  if (railBrand < 0) throw new Error("the rail card lost the brand");
  if (!(railBrand < railTitle)) throw new Error("the rail card puts the brand below the title");
  if (!/tag: 'span'/.test(rail)) throw new Error("the rail card emits a <div> inside its <button>");

  const card = src.slice(src.indexOf("function productCardHTML(p, opts){"), src.indexOf("function productCardHTML(p, opts){") + 9000);
  const cardBrand = card.indexOf("brandEyebrowHTML"), cardTitle = card.indexOf("escapeHtml(p.title)");
  if (cardBrand < 0) throw new Error("the listing card lost the brand");
  if (!(cardBrand < cardTitle)) throw new Error("the listing card puts the brand below the title");

  const pdp = src.slice(src.indexOf('id="productViewBrand"'), src.indexOf('id="productViewTitle"'));
  if (!pdp) throw new Error("the PDP's brand element is gone, or moved below the title");
});

check("normalization does not drop the designer", () => {
  /* normalizeLiveItem builds a NEW object from a hand-written field
     list, and every card and PDP on the site reads its output -- so a
     field left off that list is dropped once and lost everywhere. That
     is exactly what happened to `brand`. */
  const src = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
  const fn = src.slice(src.indexOf("function normalizeLiveItem(item, hints){"), src.indexOf("  return { title, brand,"));
  if (!fn) throw new Error("normalizeLiveItem no longer returns a brand");
  if (!/const brand = String\(item\.brand \|\| item\.designer \|\| ''\)\.trim\(\);/.test(fn)) {
    throw new Error("the brand is no longer read from the catalogue record");
  }
  // The other hand-written field lists that build card or PDP data.
  if (!/renderRelatedRail\(\{ retailer, title: name, brand:/.test(src)) {
    throw new Error("the related rail's anchor drops the brand again");
  }
  if (!/\$\{item\.brand \? `<div class="text-\[9\.5px\]/.test(src)) {
    throw new Error("the chat's product card drops the brand");
  }
});

check("the PDP is told the brand, and cannot inherit the last one", () => {
  const src = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
  if (!/function showProduct\(retailer, name, totalUsd, weightKg, imageUrl, sizes, needsSize, sizeCategory, rating, images, catalogWeightKg, opts\)/.test(src)) {
    throw new Error("showProduct no longer takes the options object the brand travels in");
  }
  const body = src.slice(src.indexOf("  const brandEl = document.getElementById('productViewBrand');"), src.indexOf("document.getElementById('productViewTitle').textContent"));
  if (!body) throw new Error("the PDP never sets its brand");
  /* textContent, not innerHTML: this is a retailer's string. And it is
     ALWAYS written, so a product with no brand clears the one before it
     rather than inheriting it -- the same leak pendingAutoPartNumber
     guards against two lines below. */
  if (!/brandEl\.textContent = brand;/.test(body)) throw new Error("the brand reaches the page as HTML, or is not cleared between products");
  if (!/brandEl\.hidden = !brand;/.test(body)) throw new Error("an empty brand still occupies space above the title");
  // Every card surface hands it over.
  const expr = src.slice(src.indexOf("function productCardOpenExpr(p, retailer){"), src.indexOf("/** The standard card for any listed product"));
  if (!/brand: p\.brand/.test(expr)) throw new Error("the shared card's onclick does not pass the brand");
});

{
  const sz = loadPageSizeSlice();

  check("a blazer has a size, and a television does not", () => {
    /* REPORTED FROM A REAL FITTING. Sizes did not come up on most of
       the designer catalogue: measured, 906 of SSENSE's garments and
       187 of Macy's offered no size at all, because the rule keys off
       words in the TITLE and "blazer" was not one of them. Old Navy and
       Foot Locker were never affected -- they match by RETAILER -- which
       is exactly why the gap survived spot-checks. */
    for (const t of ["Brown Curved Vent Blazer", "Men's Every Wear Polo Shirt", "Black Wool Trousers",
                     "Cashmere Cardigan", "Merino Pullover", "Silk Blouse", "Quilted Vest", "Wool Overshirt"]) {
      if (!sz.needsSizeSelection("ssense", t)) throw new Error(`no size picker for "${t}"`);
      if (sz.sizeCategoryFor("ssense", t) !== "clothing") throw new Error(`"${t}" was sized as footwear`);
    }
    for (const t of ["Leather Loafers", "Suede Sandals", "Shearling Slippers", "Leather Mules"]) {
      if (!sz.needsSizeSelection("ssense", t)) throw new Error(`no size picker for "${t}"`);
      if (sz.sizeCategoryFor("ssense", t) !== "shoe") throw new Error(`"${t}" was sized as clothing`);
    }
  });

  check("a size picker never appears on something without a size", () => {
    /* THE OTHER DIRECTION, and the reason the added words stop where
       they do. The catalogue really holds a "SKLZ Star Kick Sports
       Trainer", so "trainer" is not a shoe word here; "pump" is a bike
       and a breast pump before it is a heel; a bare "top" is a table
       top. A missing size picker is a bad checkout — one on a toaster
       is a worse one. */
    for (const t of ["onn 50 in Class 4K UHD Smart Television", "Nature Made Vitamin D3 Softgels",
                     "SKLZ Star Kick Sports Trainer", "Breast Pump Electric", "Glass Table Top 90cm",
                     "Oxford English Dictionary", "Stand Mixer 5qt"]) {
      if (sz.needsSizeSelection("ssense", t)) throw new Error(`"${t}" was given a size picker`);
    }
  });

  check("there is ONE list of size words, not three", () => {
    /* THE CAUSE OF THE BUG, not just the symptom. The PDP's picker read
       APPAREL_SIZE_KEYWORDS, needsSizeSelection() read APPAREL_KEYWORDS
       and standardSizeOptions() read PRODUCT_SHOE_KEYWORDS -- three
       overlapping copies hundreds of lines apart, so a word added to
       one was missing from the others. "Blazer" was in none. */
    const src = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "");   // comments may still name the dead constants
    for (const dead of ["APPAREL_SIZE_KEYWORDS", "PRODUCT_SHOE_KEYWORDS"]) {
      if (code.includes(dead)) throw new Error(`${dead} is back — a second list of size words will drift from the first`);
    }
    // And the two places that used them read the shared list now.
    if (!/needsSize \|\| \(name && APPAREL_KEYWORDS\.test\(name\)\)/.test(code)) {
      throw new Error("the PDP's size picker no longer reads the shared list");
    }
    if (!/sizeCategory === 'shoe' : SHOE_KEYWORDS\.test\(title\)/.test(code)) {
      throw new Error("standardSizeOptions no longer reads the shared shoe list");
    }
  });

  check("Spanish names the same garments", () => {
    // The catalogue is English today; the shopper is not, and a live
    // scrape or a hand-added item can arrive either way.
    for (const [t, cat] of [["Traje de lana", "clothing"], ["Suéter de cachemira", "clothing"],
                            ["Sueter sin tilde", "clothing"], ["Chaleco acolchado", "clothing"],
                            ["Blusa de seda", "clothing"], ["Pantalón de vestir", "clothing"],
                            ["Zapatillas de cuero", "shoe"], ["Botas de lluvia", "shoe"]]) {
      if (!sz.needsSizeSelection("ssense", t)) throw new Error(`no size picker for "${t}"`);
      if (sz.sizeCategoryFor("ssense", t) !== cat) throw new Error(`"${t}" sized as the wrong category`);
    }
  });

  check("a garment cannot be bought without a size, even if we failed to offer one", () => {
    /* FAIL CLOSED. The old guard read `!sizeWrap.hidden && ...`: it only
       refused when a picker was already on screen, so the one case that
       matters -- a garment the word list did not recognise, therefore no
       picker -- completed with no size at all. A S/ 2,946 blazer could
       be bought sizeless. */
    const src = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
    const fn = src.slice(src.indexOf("function addToCartFromProduct(){"), src.indexOf("  addToCart({"));
    if (!fn) throw new Error("the add-to-cart guard is gone");
    if (/if \(!sizeWrap\.hidden && sizeSelect\.required && !sizeSelect\.value\)\{/.test(fn)) {
      throw new Error("the guard is fail-open again — it only refuses when a picker is already showing");
    }
    if (!/const wantsSize = apparelNeedsSize\(p\.retailer, p\.name\);/.test(fn)) {
      throw new Error("the buy path no longer asks whether the product is a garment");
    }
    if (!/if \(wantsSize && sizeWrap\.hidden\)\{/.test(fn)) {
      throw new Error("a garment with no picker is no longer stopped");
    }
    if (!/revealStandardSizePicker\(p\.name, p\.sizeCategory\)/.test(fn)) {
      throw new Error("the shopper is refused without being given the picker they were missing");
    }
    // The recovery picker must carry the same honest note as the page's.
    const rev = src.slice(src.indexOf("function revealStandardSizePicker(title, sizeCategory){"), src.indexOf("function addToCartFromProduct(){"));
    if (!/No pudimos confirmar las tallas exactas/.test(rev)) {
      throw new Error("the recovered picker drops the disclaimer that these are reference sizes");
    }
  });

  check("the two apparel-only stores still match by retailer, not by wording", () => {
    // Their titles often carry no garment word at all ("Jordan Retro 8").
    for (const r of ["oldnavy", "footlocker"]) {
      if (!sz.needsSizeSelection(r, "Jordan Retro 8")) throw new Error(`${r} stopped sizing everything it sells`);
    }
    if (sz.needsSizeSelection("walmart", "Jordan Retro 8")) throw new Error("the retailer rule leaked to a general store");
  });
}

group("Zapatos: a department made of other people's buckets");

const shoePage = loadPageFootwearSlice();

function everyCatalogueItem() {
  const rows = [];
  for (const file of ["department-cache.json", "macys-catalog.json", "ssense-catalog.json", "beauty-catalog.json"]) {
    const data = JSON.parse(readFileSync(root(file), "utf8"));
    for (const [retailer, bucket] of Object.entries(data.retailers || {})) {
      for (const [, entry] of Object.entries(bucket.departments || {})) {
        for (const item of (Array.isArray(entry) ? entry : entry.items) || []) rows.push({ retailer, item });
      }
    }
  }
  return rows;
}

check("the page's footwear detector and the module agree, item for item", () => {
  // Compared over all 3,990 real items rather than over examples: the
  // whole department is this one predicate, twice.
  let checked = 0;
  for (const { retailer, item } of everyCatalogueItem()) {
    const a = shoePage.isFootwear(item, retailer);
    const b = footwear.isFootwear(item, retailer);
    if (a !== b) throw new Error(`drifted on ${retailer}: ${JSON.stringify(item).slice(0, 90)}`);
    checked++;
  }
  if (checked < 3000) throw new Error(`only compared ${checked} items`);
});

check("Zapatos is populated, priced, and spread across real stores", () => {
  /* ACCEPTANCE: "opens to real priced footwear; Foot Locker items show
     here". Asserted as a floor per store, not an exact total, so a
     re-scrape does not break the build — but a store falling to zero
     does, because that is the signal a detector stopped working. */
  const files = ["department-cache.json", "macys-catalog.json", "ssense-catalog.json"].map((f) =>
    JSON.parse(readFileSync(root(f), "utf8")));
  const counts = {};
  let priced = 0, total = 0;
  for (const data of files) {
    for (const [retailer, bucket] of Object.entries(data.retailers || {})) {
      const items = deptMap.departmentItems(bucket, "shoes", retailer);
      if (!items.length) continue;
      counts[retailer] = items.length;
      for (const it of items) {
        total++;
        const n = Number(it.price);
        if (Number.isFinite(n) && n > 0) priced++;
      }
    }
  }
  if (!counts.footlocker) throw new Error("Foot Locker, the anchor shoe store, has nothing in Zapatos");
  for (const [store, floor] of [["footlocker", 50], ["ssense", 300], ["macys", 15], ["walmart", 3]]) {
    if (!(counts[store] >= floor)) throw new Error(`${store} dropped to ${counts[store] || 0} shoes (floor ${floor})`);
  }
  if (total < 400) throw new Error(`Zapatos holds only ${total} pairs`);
  // Priceless records exist site-wide (see the no-price guards); the
  // department must still be overwhelmingly buyable.
  if (priced / total < 0.98) throw new Error(`only ${priced}/${total} pairs carry a price`);
});

check("Foot Locker is found by its badge, not by its words", () => {
  /* THE FINDING THAT SHAPED THIS. Foot Locker's titles are model names
     — "New Balance 9060 - Men's", "ASICS GEL-1130 - Women's", "Nike KD
     19". A keyword list catches 2 of its 65 products, so the brief's
     title-keyword approach alone would have missed the anchor store
     almost entirely. The STORE is the signal. */
  const cache = JSON.parse(readFileSync(root("department-cache.json"), "utf8"));
  const titles = new Set();
  for (const entry of Object.values(cache.retailers.footlocker.departments || {})) {
    for (const item of entry.items || []) titles.add(deptMap.titleOf(item));
  }
  const byTitle = [...titles].filter((t) => footwear.isFootwearTitle(t));
  if (byTitle.length > 10) throw new Error(`${byTitle.length}/${titles.size} Foot Locker titles now name footwear — the store rule may be redundant`);
  if (!footwear.FOOTWEAR_RETAILERS.has("footlocker")) throw new Error("Foot Locker is no longer a footwear store");
  // ...and every one of them lands anyway.
  eq(deptMap.departmentItems(cache.retailers.footlocker, "shoes", "footlocker").length,
     deptMap.departmentItems(cache.retailers.footlocker, "shoes", "footlocker").length, "sanity");
  if (deptMap.departmentItems(cache.retailers.footlocker, "shoes", "footlocker").length < 50) {
    throw new Error("the store rule is not reaching Foot Locker's catalogue");
  }
});

check("the words that look like shoes and are not", () => {
  /* Every one of these was a real hit on the real catalogue before it
     was excluded — this is the regression net for the whole detector. */
  for (const notShoe of [
    "Wrangler Rustler Men's Regular Fit Boot Cut Cotton Jeans",
    "Classic Fit Everyday Oxford Shirt",
    "Men's Hanes Crew Socks with FreshIQ 8pk",
    "NEWZILL Plantar Fasciitis Socks with Arch Support",
    "SKLZ Star Kick Sports Trainer - Yellow",
    "SKLZ Recoil 360 Resistance Trainer - Black",
    "Taco Seasoning Mix, 1 oz",
    "3-Tier Shoe Rack Organizer",
    "Memory Foam Insoles for Running",
  ]) {
    if (footwear.isFootwearTitle(notShoe)) throw new Error(`"${notShoe}" was filed as footwear`);
  }
  // ...while the real thing still matches, in both languages.
  for (const shoe of [
    "Men's 5000 Athletic Running Sneakers, Wide Width Available",
    "Josmo Boys Wingtip Oxford Lace Dress Shoes - Black, 10",
    "Purcolt Women's Mid Heel Slingback Pumps Dress Shoes",
    "Zapatillas de cuero para hombre",
    "Botas de lluvia para niña",
    "Sandalias planas de verano",
    "Tacones altos de fiesta",
  ]) {
    if (!footwear.isFootwearTitle(shoe)) throw new Error(`"${shoe}" was not recognised as footwear`);
  }
});

check("a retailer's own type outranks our keyword, both ways", () => {
  /* "Oxford" is a shoe and a cloth. SSENSE's "Gray Oxford Single
     Blazer" matched the keyword while SSENSE's own type field said
     BLAZERS. The retailer was right. */
  eq(footwear.isFootwear({ name: "Gray Oxford Single Blazer", type: "BLAZERS" }), false, "an oxford-cloth blazer");
  eq(footwear.isFootwear({ name: "Green Oxford Nylon-TC Jacket", type: "JACKETS" }), false, "an oxford-cloth jacket");
  eq(footwear.isFootwear({ name: "Black Suede Boat Shoes", type: "BOAT SHOES & MOCCASINS" }), true, "a typed shoe");
  eq(footwear.isFootwear({ name: "Women's 327 Sneakers", type: "SHOE" }), true, "Macy's typed shoe");
  // A typed garment stays out even from a footwear store.
  eq(footwear.isFootwear({ productName: "Nike Club Fleece Hoodie", type: "HOODIES & ZIPUPS" }, "footlocker"), false,
     "a typed hoodie escaped through the store rule");
  // And an untyped garment at a footwear store is caught by its title.
  eq(footwear.isFootwear({ productName: "Nike Everyday Crew Socks 3pk" }, "footlocker"), false,
     "socks from a shoe store are still not shoes");
});

check("Zapatos is a department with a name and a place in the taxonomy", () => {
  eq(deptMap.DEPARTMENT_SPEC.shoes.footwearOnly, true, "the shoes spec");
  eq(deptMap.DEPARTMENT_SPEC.shoes.anyCategory, true, "shoes must scan every bucket, not one named bucket");
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  if (!/shoes: \{ label: 'Zapatos'/.test(src)) throw new Error("the department has no Spanish name");
  // The page's spec mirrors the module's.
  const spec = src.slice(src.indexOf("const DEPARTMENT_SPEC = {"), src.indexOf("const BUCKET_SPEC = {"));
  if (!/shoes:\s+\{ anyCategory: true, footwearOnly: true \}/.test(spec)) throw new Error("the page's taxonomy has no shoes");
});
group("no price, no buy button");

check("a priceless record is a real thing in the cache, not a hypothesis", () => {
  /* REPORTED FROM THE LIVE SITE: "Farmhouse Stripe Bedding Collection",
     a Target home_goods record cached with price: null, rendered
     "Precio no disponible" beside a live "Agregar al carrito" button.
     Tapping it wrote priceUsd: 0 into the cart.

     This asserts the INPUT still exists, so the guards below are never
     mistaken for dead code. If a future cache really has a price for
     everything, this line is the one that says so out loud. */
  const cache = JSON.parse(readFileSync(root("department-cache.json"), "utf8"));
  const priceless = [];
  for (const [retailer, data] of Object.entries(cache.retailers || {})) {
    for (const [dept, bucket] of Object.entries(data.departments || {})) {
      for (const item of bucket.items || []) {
        const n = Number(item.price);
        if (!(Number.isFinite(n) && n > 0)) priceless.push(`${retailer}/${dept}`);
      }
    }
  }
  if (!priceless.length) throw new Error("no priceless records left — re-check whether these guards are still needed");
  // Both flavours the scrapers produce: an explicit null and an empty string.
  if (priceless.length < 10) throw new Error(`only ${priceless.length} priceless records — verify this is still the live shape`);
});

check("the guard is at the funnel, not only at the button", () => {
  /* THREE LAYERS, ON PURPOSE. A disabled button is a courtesy — the
     console, a stale page and a second entry point all route around it.
     addToCart() is where every caller passes, which is why the weight
     guard already lives there, and it is where the price guard belongs
     too. The cross-sell rail was the proof: it passed `priceUsd:
     it.price` straight through and never looked at it. */
  const src = stripComments(readFileSync(root("index.html"), "utf8"));

  const funnel = src.slice(src.indexOf("function addToCart(item){"), src.indexOf("function removeFromCartByKey("));
  if (!/Number\.isFinite\(usd\) && usd > 0/.test(funnel)) throw new Error("addToCart no longer refuses a priceless line");
  if (!/return false/.test(funnel)) throw new Error("addToCart no longer tells its caller it refused");
  if (!/return true/.test(funnel)) throw new Error("addToCart no longer confirms the line landed");

  const fromProduct = src.slice(src.indexOf("function addToCartFromProduct(){"), src.indexOf("LIVE APIFY SCRAPING") >= 0 ? src.indexOf("LIVE APIFY SCRAPING") : src.length);
  if (!/Number\.isFinite\(p\.totalUsd\) && p\.totalUsd > 0/.test(fromProduct)) throw new Error("the product page no longer checks its own price");
  /* THE LINE THAT CAUSED IT. `priceUsd: Number.isFinite(...) ? ... : 0`
     is how a priceless product became a $0 line; there must be no zero
     fallback left anywhere near a cart line. */
  if (/priceUsd:\s*Number\.isFinite\([^)]*\)\s*\?[^:]*:\s*0/.test(src)) {
    throw new Error("a cart line can still fall back to priceUsd: 0");
  }

  // Both callers stop claiming a success that did not happen.
  eq((src.match(/if \(!addToCart\(/g) || []).length, 2, "callers that check addToCart's answer");

  // And the button's two states are set in one place.
  if (!/function setProductBuyable\(/.test(src)) throw new Error("the buy button's states are no longer set in one place");
  const buyable = src.slice(src.indexOf("function setProductBuyable("), src.indexOf("function addToCartFromProduct("));
  for (const [what, re] of [["disabled", /btn\.disabled = !hasPrice/], ["relabelled", /btn\.textContent = hasPrice/], ["greyed", /btn\.style\.background/]]) {
    if (!re.test(buyable)) throw new Error(`the disabled buy button is not ${what}`);
  }
});

check("a card with no price does not say Comprar", () => {
  // The card's button only ever navigates, so the fix is what it CLAIMS:
  // "Comprar" over "Precio no disponible" is a promise the page it opens
  // cannot keep. Browsing a priceless record stays possible.
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const card = src.slice(src.indexOf("function productCardHTML(p, opts){"), src.indexOf("function renderSalesGrid("));
  if (!/hasPrice \? 'Comprar' : 'Ver detalle'/.test(card)) throw new Error("the card still promises a purchase without a price");
  if (!/Precio no disponible/.test(card)) throw new Error("the card no longer says the price is missing");
});

/* ------------------------------------------------------------------ */
group("The home page tells the story once");

check("the explainer is photography and type, not clip-art boxes", () => {
  const src = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
  const why = src.slice(src.indexOf('<div id="whyUs"'), src.indexOf("<!-- HOW IT WORKS -->"));
  if (!why) throw new Error("the explainer section is gone");

  /* THE THUMBNAILS ARE GONE, not swapped. Five 48px stock cartoons sat
     above five headings, directly over the photographic category tiles,
     and read like a slide deck next to them. */
  if (/src="data:image/.test(why)) throw new Error("the clip-art thumbnails are back in the explainer");
  if (/ariaCard--light/.test(why)) throw new Error("the promises are white boxes again");
  if (!/assets\/portal-girl-bg\.jpg/.test(why)) throw new Error("the brand photograph is not the background");
  if (!/class="ariaWhyScrim"/.test(why)) throw new Error("there is no scrim over the photograph");

  /* IT MUST SURVIVE THE PHOTO NOT LOADING. The image is a separate
     asset; a section whose legibility depends on a file that may 404 is
     one that eventually renders white-on-white. */
  if (!/onerror="this\.remove\(\)"/.test(why)) throw new Error("a missing photo would leave a broken image over the text");
  const css = src.slice(src.indexOf("<style>"), src.indexOf("</style>"));
  const sec = css.slice(css.indexOf("#whyUs{"), css.indexOf(".ariaWhyPhoto{"));
  if (!/background:var\(--navy\)/.test(sec)) throw new Error("the navy is not on the section — with no photo there is nothing behind the text");

  /* THE SCRIM'S TOP STOP IS ITS THINNEST POINT, and the number was
     computed, not chosen: at 0.62 the kicker measured 3.12:1 over a
     pure-white photo pixel. Anything lighter than 0.72 fails again. */
  const stop = Number((css.match(/\.ariaWhyScrim[\s\S]*?rgba\(4,12,28,([0-9.]+)\)\s*0%/) || [])[1]);
  if (!(stop >= 0.72)) throw new Error(`the scrim's top stop is ${stop} — below 0.72 the kicker drops under 4.5:1`);

  // The copy is carried over untouched; this was a redesign, not a rewrite.
  for (const promise of ["Productos que no existen en Perú", "Comparamos varias tiendas a la vez",
                         "Acceso a las grandes ofertas de EE. UU.", "Precio final, sin sorpresas",
                         "Seguimiento de tu pedido"]) {
    if (!why.includes(promise)) throw new Error(`the redesign lost a promise: "${promise}"`);
  }
  if ((why.match(/ariaWhyPromise/g) || []).length < 5) throw new Error("a promise was dropped in the redesign");
  // ...and the card removed earlier stays removed.
  if (why.includes("Compara con el precio en Perú")) throw new Error("the Peru promise came back with the redesign");
});

check("the page promises nothing we cannot do", () => {
  /* "Cuando el producto también existe en tiendas peruanas, te
     mostramos ambos precios…" was a card in Por qué Aria, and the
     function behind it does not exist: there is no Peru price source
     and no matching. It is a parked idea, and a parked idea on the
     home page is a claim.

     Asserted on the whole page, not just that section, so it cannot
     come back somewhere else. */
  const src = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
  for (const claim of ["Compara con el precio en Perú", "tiendas peruanas, te mostramos ambos precios"]) {
    if (src.includes(claim)) throw new Error(`the Peru price-comparison promise is back: "${claim}"`);
  }
  /* The rest of Por qué Aria is untouched -- this was a removal of one
     card, not a trim of the section. */
  const why = src.slice(src.indexOf('id="whyUs"'), src.indexOf('id="cats"'));
  for (const kept of ["Acceso a las grandes ofertas de EE. UU.", "Precio final, sin sorpresas",
                      "marcas y modelos que nunca llegan a las tiendas peruanas"]) {
    if (!why.includes(kept)) throw new Error(`the removal took more than the one card: "${kept}" is gone`);
  }
});

check("the explainer follows the logo, and the category tiles follow the explainer", () => {
  /* THE PHONE USED TO READ: Ofertas -> Categorías (the compact
     carousel) -> Tiendas -> the ARIA logo -> "Comprar por categoría"
     (the long tiles). The visitor met the categories, scrolled past
     them to reach the brand and how any of this works, and met the
     categories AGAIN -- the same list twice with the story wedged
     between its two halves.

     Asserted on SOURCE ORDER, not on measured positions: the browser
     harness blocks the CDN, so nothing there has a reliable y. */
  const src = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
  const home = src.slice(src.indexOf("<!-- ============ HOME VIEW ============ -->"), src.indexOf("<!-- ============ RESULTS VIEW ============ -->"));
  if (!home) throw new Error("the home view is gone");

  const at = (needle, what) => {
    const i = home.indexOf(needle);
    if (i < 0) throw new Error(`${what} is gone from the home page`);
    return i;
  };
  const deals  = at('id="mobileDealsRow"', "the Ofertas rail");
  const cats   = at('id="mobileCatsRow"', "the Categorías rail");
  const stores = at('id="mobileStoresRow"', "the Tiendas rail");
  const logo   = at('src="aria-full-logo.png"', "the ARIA logo");
  const why    = at('id="whyUs"', "the Por qué Aria explainer");
  const tiles  = at('id="cats"', "the Comprar por categoría tiles");

  // Unchanged, and the brief says so explicitly.
  if (!(deals < cats && cats < stores)) throw new Error("the three rails are no longer Ofertas -> Categorías -> Tiendas");
  if (!(stores < logo)) throw new Error("the rails no longer come before the logo");
  // The move itself.
  if (!(logo < why)) throw new Error("the explainer no longer follows the ARIA logo it belongs to");
  if (!(why < tiles)) throw new Error("the category tiles interrupt the brand story again");

  /* NOTHING WAS DELETED. The tiles are still there and still built by
     the same code -- this was a move, and a test that only checked the
     order would pass just as well if they had been dropped. */
  if (!/id="catGrid"/.test(home)) throw new Error("the category tile grid is gone, not moved");
  if (!/initDepartmentTiles/.test(src)) throw new Error("nothing fills the category tiles any more");
});

group("cómo funciona: the shopper is the one doing the buying");

check("step 3 never makes us the buyer", () => {
  /* DANNY'S READ (2026-09-22): "Al confirmar tu pedido, NOSOTROS LO
     COMPRAMOS directamente en la tienda de origen" sounded like a person
     taking the customer's money and going shopping on their behalf. That
     is a glorified Miami locker, not a shop, and it is the opposite of
     what the site is: the customer buys here, from the official store.

     THE RULE, NOT THE WORDING. Copy gets rewritten and should; what must
     not come back is the SUBJECT flipping to us in this step. So this
     asserts the grammar of the promise rather than freezing a sentence
     — the phrasings below can all be reworded freely as long as the
     shopper stays the one doing the buying.

     SCOPED TO STEP 3 ON PURPOSE. Step 4 is "Consolidamos en Miami", and
     there the first person is correct and true: we really do consolidate
     the parcel. The slice stops at the STEP 4 marker so this can never
     start policing a sentence it was not written for. */
  const html = readFileSync(root("index.html"), "utf8");
  const from = html.indexOf('<div class="ariaKicker mb-3">Compra directa</div>');
  const to = html.indexOf("<!-- STEP 4 -->");
  if (from < 0) throw new Error("the Compra directa section is gone — this check needs re-anchoring");
  if (to < 0 || to <= from) throw new Error("the STEP 4 marker moved — re-anchor before trusting this check");
  const step3 = html.slice(from, to);

  // Us as the buyer, in the forms that actually appeared or nearly did.
  for (const phrase of [
    "nosotros lo compramos",
    "nosotros compramos",
    "lo compramos",
    "compramos por ti",
    "compramos en la tienda",
    "compramos el producto",
  ]) {
    if (step3.toLowerCase().includes(phrase)) {
      throw new Error(`step 3 says "${phrase}" — the shopper buys here, we are not their shopper`);
    }
  }

  // And the shopper really is the subject, not merely absent.
  if (!/\bcompras\b/i.test(step3)) throw new Error("step 3 no longer says the shopper buys at all");

  /* The trust point survives the rewrite, moved to the shopper's side:
     no resellers, and the store's own guarantee. */
  if (!/revendedores|revendedor/i.test(step3)) throw new Error("the no-resellers promise fell out of step 3");
  if (!/garant[ií]a/i.test(step3)) throw new Error("the store's own guarantee is no longer named");

  // Step 4 is untouched and still ours to do, which is why it is excluded.
  const step4 = html.slice(to, to + 1200);
  if (!/Consolidamos/i.test(step4)) throw new Error("step 4 lost its first person — that one was correct");
});

/* ------------------------------------------------------------------ */
group("Tiendas is a photograph of a street, not a white strip");

/* A slice helper that REFUSES to run backwards. src.slice(indexOf(A),
   indexOf(B)) returns "" when B sits earlier than A, and an empty string
   satisfies every negative assertion below while measuring nothing. */
function forwardSlice(src, a, b, what){
  const i = src.indexOf(a);
  if (i < 0) throw new Error(`${what}: cannot find the opening anchor ${JSON.stringify(a)}`);
  const j = src.indexOf(b, i + a.length);
  if (j < 0) throw new Error(`${what}: cannot find ${JSON.stringify(b)} after the opening anchor`);
  return src.slice(i, j);
}

/* COMMENTS COME OUT BEFORE ANYTHING IS ASSERTED. The markup in this
   area explains itself at length — which colours were rejected and at
   what ratio, which class carries the breakpoint. A check reading the
   raw slice therefore finds "#7FB8FF" inside a sentence saying never to
   use it, and "ariaSectionShot--lg" inside a note pointing at it, and
   passes on its own documentation. Two of these checks did exactly that
   until a mutation run said so. Strip the prose, then read the code. */
const stripHtmlComments = (s) => s.replace(/<!--[\s\S]*?-->/g, "");

const HOME_SRC = () => readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
const SECTION_PHOTO = "assets/sections/tiendas-mall-row.jpg";

check("the mall photograph is committed, and small enough to send to a phone", () => {
  if (!existsSync(root(SECTION_PHOTO))) throw new Error(`${SECTION_PHOTO} is missing — the sections fall back to flat navy`);
  const bytes = readFileSync(root(SECTION_PHOTO)).length;
  /* 200 KB is the budget, and the shipped file is ~114 KB. The delivered
     original was 443 KB at 2576x859 — a third of it a baked-in navy wash
     that had to come off anyway. This asserts the compression step was
     not quietly skipped the next time the picture is replaced. */
  if (bytes > 200 * 1024) throw new Error(`${SECTION_PHOTO} is ${(bytes/1024).toFixed(0)} KB — over the 200 KB budget for a background nobody came to look at`);
});

check("both Tiendas surfaces carry the photo, the scrim and a way to lose the photo safely", () => {
  const src = HOME_SRC();
  const surfaces = {
    "the phone's shopfront rail": stripHtmlComments(forwardSlice(src, '<section aria-label="Tiendas"', "</section>", "Tiendas rail")),
    "the laptop's retailers strip": stripHtmlComments(forwardSlice(src, "<!-- RETAILERS STRIP", 'id="homeStoresRow"', "retailers strip")),
  };
  for (const [name, html] of Object.entries(surfaces)){
    if (!html.includes(SECTION_PHOTO)) throw new Error(`${name} does not reference the photograph`);
    if (!/class="ariaSectionPhoto"/.test(html)) throw new Error(`${name} does not use the shared photo layer`);
    if (!/class="ariaSectionScrim"/.test(html)) throw new Error(`${name} has no scrim — text straight onto a golden-hour sky`);
    /* Below the fold, both of them: the page must not spend a phone's
       first bytes on a picture behind a logo strip. */
    if (!/loading="lazy"/.test(html)) throw new Error(`${name}'s photo is not lazy-loaded`);
    /* A 404 must leave navy + scrim, not a broken-image glyph over the
       heading. Same guard the explainer carries. */
    if (!/onerror="this\.remove\(\)"/.test(html)) throw new Error(`${name} would render a broken image if the file went missing`);
    /* Decorative: the heading already says "Tiendas en EE. UU." and a
       screen reader repeating a mall row adds nothing. */
    if (!/alt=""/.test(html) || !/aria-hidden="true"/.test(html)) throw new Error(`${name}'s photo is not marked decorative`);
  }
});

check("the photo cannot escape when the Tailwind CDN does", () => {
  /* THE TRAP THIS PINS. .ariaSectionPhoto is position:absolute. Its
     containing block is the section, which is only positioned because
     something says so — and if that something is a Tailwind `relative`
     utility, then on the day the CDN is blocked (which is exactly how
     the browser suite runs, deliberately) the containing block becomes
     the viewport and a 1760px photograph lies across the whole page.
     The declaration therefore lives in the inline stylesheet. */
  const src = HOME_SRC();
  const css = forwardSlice(src, "<style>", "</style>", "the inline stylesheet");
  const shot = forwardSlice(css, ".ariaSectionShot{", "}", ".ariaSectionShot");
  if (!/position:relative/.test(shot)) throw new Error(".ariaSectionShot no longer establishes a containing block in the inline CSS");
  if (!/overflow:hidden/.test(shot)) throw new Error(".ariaSectionShot no longer clips the photo to the section");
  if (!/background:var\(--navy\)/.test(shot)) throw new Error("the navy moved off the section — with no photo there is nothing behind the text");

  for (const surface of [
    stripHtmlComments(forwardSlice(src, '<section aria-label="Tiendas"', "</section>", "Tiendas rail")),
    stripHtmlComments(forwardSlice(src, "<!-- RETAILERS STRIP", 'id="homeStoresRow"', "retailers strip")),
  ]){
    /* The opening tag only. Without stripComments above, the strip's
       slice begins with a comment and this lands on its prose instead. */
    const tag = surface.slice(0, surface.indexOf(">") + 1);
    if (/\brelative\b/.test(tag) || /\boverflow-hidden\b/.test(tag)){
      throw new Error("a Tiendas surface positions itself with Tailwind utilities — those vanish with the CDN and the photo goes with them");
    }
    if (!/\bariaSectionShot\b/.test(tag)) throw new Error("a Tiendas surface is not using .ariaSectionShot");
  }
});

check("exactly one Tiendas section is photographic at any width", () => {
  /* Both surfaces exist on a phone: the shopfront rail and, far below
     it, the retailers grid. The grid is ten rows tall at 393px, so a
     4.29:1 photograph cropped into it shows the middle eleventh of the
     frame — a dark blur, and the same picture twice on one page. The
     strip therefore only takes the photograph at lg, which is precisely
     where #mobileShopfront hides. If one of those two numbers is ever
     changed without the other, a width exists that has two photographic
     Tiendas sections, or none. */
  const src = HOME_SRC();
  const css = forwardSlice(src, "<style>", "</style>", "the inline stylesheet");
  const shopfront = forwardSlice(src, 'id="mobileShopfront"', ">", "#mobileShopfront");
  if (!/\blg:hidden\b/.test(shopfront)) throw new Error("#mobileShopfront no longer hides at lg — the breakpoint story below is stale");

  if (!/@media \(max-width:1023\.98px\)/.test(css)) throw new Error("the strip's phone rule is gone or moved off Tailwind's lg breakpoint (1024px)");
  const phoneRule = forwardSlice(css, "@media (max-width:1023.98px){", "@media (min-width:1024px)", "the phone rule");
  if (!/\.ariaSectionShot--lg > \.ariaSectionPhoto/.test(phoneRule)) throw new Error("the retailers strip keeps its photo on a phone — that crop is the blur this rule exists to prevent");
  if (!/display:none/.test(phoneRule)) throw new Error("the strip's phone rule no longer hides anything");
  if (!/background:var\(--paper\)/.test(phoneRule)) throw new Error("with its photo hidden the strip has no background of its own left");

  const strip = stripHtmlComments(forwardSlice(src, "<!-- RETAILERS STRIP", 'id="homeStoresRow"', "retailers strip"));
  if (!/ariaSectionShot--lg/.test(strip)) throw new Error("the retailers strip is not opted into the lg-only treatment");
  const rail = stripHtmlComments(forwardSlice(src, '<section aria-label="Tiendas"', "</section>", "Tiendas rail"));
  if (/ariaSectionShot--lg/.test(rail)) throw new Error("the phone's own rail went lg-only — now no width shows the photograph on a phone");
});

check("the type over the photograph was measured, not eyeballed", () => {
  /* Every number here came off rendered pixels: the glyphs are hidden,
     the brightest pixel actually behind each text run is sampled, and
     the ratio is computed against it. The site's usual on-navy blue
     (#7FB8FF) measured 3.73:1 over a lit shop window and #9FC5FF 4.35:1
     — both under the 4.5 floor, both plausible-looking choices. */
  const src = HOME_SRC();
  const rail = stripHtmlComments(forwardSlice(src, '<section aria-label="Tiendas"', "</section>", "Tiendas rail"));
  const h2 = forwardSlice(rail, "<h2", "</h2>", "the rail heading");
  if (!/color:#fff/.test(h2)) throw new Error("the Tiendas heading is no longer white over the photograph");
  if (/var\(--navy\)/.test(h2)) throw new Error("the Tiendas heading is navy again — navy type on a navy scrim");
  if (!/#C3D9FF/.test(rail)) throw new Error('"Ver todas" lost its measured colour');
  for (const tooDark of ["#7FB8FF", "#9FC5FF", "var(--blue)"]){
    if (rail.includes(tooDark)) throw new Error(`"Ver todas" is back to ${tooDark}, which measured under 4.5:1 over this photograph`);
  }
  const strip = stripHtmlComments(forwardSlice(src, "<!-- RETAILERS STRIP", 'id="homeStoresRow"', "retailers strip"));
  if (/text-zinc-500/.test(strip)) throw new Error("the strip's caption is grey again — unreadable over the photo at lg");
  if (!/ariaSectionCaption/.test(strip)) throw new Error("the strip's caption no longer switches colour with the breakpoint");

  const css = forwardSlice(src, "<style>", "</style>", "the inline stylesheet");
  const scrim = forwardSlice(css, ".ariaSectionScrim{", "}", ".ariaSectionScrim");
  /* The top stop is the scrim's thinnest point and therefore the one
     that decides legibility. 0.55 measured 4.39:1 against this asset's
     brightest pixel; 0.60 cleared at 5.22:1; 0.66 ships for 6.50:1
     because this type is 12.5-15px, not display size. */
  const top = scrim.match(/rgba\(4,12,28,([\d.]+)\) 0%/);
  if (!top) throw new Error("the scrim's top stop is gone — cannot tell what the text sits on any more");
  if (Number(top[1]) < 0.6) throw new Error(`the scrim opens at ${top[1]}; anything under 0.60 measured below 4.5:1 on this photograph`);
});

check("every category cover named in the page is actually on disk", () => {
  /* The covers and this photograph are the same kind of promise: a path
     in the source that a file has to answer. A missing cover degrades to
     the designed brand field and is survivable; a missing one that
     nobody noticed for a week is not. */
  const src = HOME_SRC();
  const table = forwardSlice(src, "const CATEGORY_COVERS = {", "};", "CATEGORY_COVERS");
  const paths = [...table.matchAll(/'([^']+\.(?:jpg|jpeg|png|webp))'/g)].map(m => m[1]);
  if (paths.length < 11) throw new Error(`CATEGORY_COVERS lists only ${paths.length} covers — a department lost its photograph`);
  const missing = paths.filter(p => !existsSync(root(p)));
  if (missing.length) throw new Error(`covers named in the page but not committed: ${missing.join(", ")}`);
});

/* ------------------------------------------------------------------ */
group("A department is never a dead page");

check("the catalogue knows the difference between broken and empty", () => {
  /* THE BUG. loadDepartmentCache catches every fetch failure into
     { retailers: {} } AND memoises the merged promise. So a first load
     that fails — offline, a 404 mid-deploy, bad JSON — looked exactly
     like a department with no stock, and stayed that way for the life of
     the page because the failed promise was the cached one. Zapatos
     showed "Sin resultados por ahora." with 539 pairs in the file. */
  const src = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
  const loader = forwardSlice(src, "function loadDepartmentCache(){", "\nconst DEPARTMENT_META", "loadDepartmentCache");
  if (!/departmentCacheFailed\s*=\s*loaded === 0/.test(loader)) {
    throw new Error("nothing records whether the catalogue actually loaded");
  }
  /* A silent 503 is the case that started this: r.json() on a 503 body
     throws, but a 200 carrying an error page would not, so the status is
     checked rather than trusted. */
  const okChecks = (loader.match(/if \(!r\.ok\) throw new Error/g) || []).length;
  if (okChecks < 2) throw new Error(`only ${okChecks} fetch(es) check response.ok — a non-200 would be counted as a load`);
});

check("a retry can actually succeed", () => {
  /* A retry that re-awaits the memoised promise replays the same failure
     and reads as a dead button. Clearing the memo IS the fix, so this
     asserts it rather than the button's existence. */
  const src = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
  const retry = forwardSlice(src, "function retryCatalog(kind, key, retailerFilter){", "}", "retryCatalog");
  if (!/departmentCachePromise\s*=\s*null/.test(retry)) {
    throw new Error("retryCatalog does not clear the memoised promise — the button would replay the cached failure");
  }
  if (!/openCatalog\(/.test(retry)) throw new Error("retryCatalog never re-opens the category");
});

check("the empty state offers a way on, and never fires a scrape by itself", () => {
  const src = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
  const feed = forwardSlice(src, "function renderCatalogFeed(){", "const filterHasStock", "renderCatalogFeed");
  if (/subtitle\.textContent = 'Sin resultados por ahora\.'/.test(feed)) {
    throw new Error("the bare dead-end string is back");
  }
  if (!/catalogEmptyStateHTML\(\)/.test(feed)) throw new Error("the empty branch no longer renders a state");
  if (/sections\.innerHTML = ''/.test(feed)) throw new Error("the empty branch still blanks the container");

  const state = forwardSlice(src, "function catalogEmptyStateHTML(){", "\nfunction retryCatalog", "catalogEmptyStateHTML");
  if (!/retryCatalog\(/.test(state)) throw new Error("the empty state has no retry");
  if (!/categoriesView/.test(state)) throw new Error("the empty state has no way back to the categories");
  /* LIVE SEARCH IS A SHOPPER ACTION. It may be OFFERED here, but the
     department must not start a scrape on its own — that is the
     behaviour this whole area exists to reverse. */
  if (!/showResults\(/.test(state)) throw new Error("the empty state does not offer a live search at all");
  const opener = forwardSlice(src, "async function openCatalog(kind, key, opts = {}){", "renderCatalogFeed();", "openCatalog");
  for (const scrape of ["startOnDemand", "runLiveSearch", "scrapeRetailer"]) {
    if (new RegExp("\\b" + scrape + "\\s*\\(").test(opener)) {
      throw new Error(`openCatalog calls ${scrape}() — the department is scraping on load again`);
    }
  }
});

/* ------------------------------------------------------------------ */
group("The trust cards are photographs, not white boxes");

const TRUST_PHOTOS = {
  "Precio transparente": "assets/trust/trust-precio.jpg",
  "Pagos seguros": "assets/trust/trust-pagos.jpg",
  "Aduana resuelta": "assets/trust/trust-aduana.jpg",
  "Entrega puerta a puerta": "assets/trust/trust-entrega-v2.jpg",
};

check("each card carries its own photograph, its scrim and its escape hatch", () => {
  const src = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
  const strip = forwardSlice(src, "<!-- FEATURE STRIP -->", "</div>\n  </div>", "the feature strip");
  const cards = strip.split('<div class="ariaTrustCard">').slice(1);
  if (cards.length !== 4) throw new Error(`expected 4 photographic trust cards, found ${cards.length}`);

  for (const [title, path] of Object.entries(TRUST_PHOTOS)) {
    const card = cards.find(c => c.includes(`>${title}</div>`));
    if (!card) throw new Error(`no trust card titled "${title}"`);
    if (!card.includes(path)) throw new Error(`"${title}" does not point at ${path}`);
    if (!/class="ariaTrustScrim"/.test(card)) throw new Error(`"${title}" has no scrim`);
    if (!/loading="lazy"/.test(card)) throw new Error(`"${title}" loads its photo eagerly — the strip is below the fold`);
    if (!/onerror="this\.remove\(\)"/.test(card)) throw new Error(`"${title}" would show a broken image if its file is missing`);
    if (!/alt=""/.test(card) || !/aria-hidden="true"/.test(card)) throw new Error(`"${title}"'s photo is not marked decorative`);
    /* THE COPY AND THE ROUNDEL ARE UNTOUCHED — only the colour of the
       type changes, because it now sits on a photograph. */
    if (!/width="64" height="64"/.test(card)) throw new Error(`"${title}" lost its icon chip`);
    if (!/color:#fff/.test(card)) throw new Error(`"${title}"'s title is not white over the photo`);
    if (/text-zinc-500/.test(card)) throw new Error(`"${title}"'s description is still grey — unreadable on a photo`);
  }
});

check("the trust photo cannot escape its card when the CDN is gone", () => {
  const src = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
  const css = forwardSlice(src, "<style>", "</style>", "the inline stylesheet");
  const card = forwardSlice(css, ".ariaTrustCard{", "}", ".ariaTrustCard");
  if (!/position:relative/.test(card)) throw new Error(".ariaTrustCard no longer establishes a containing block in the inline CSS");
  if (!/overflow:hidden/.test(card)) throw new Error(".ariaTrustCard no longer clips its photo");
  if (!/background:var\(--navy\)/.test(card)) throw new Error("the navy left the card — a missing photo would leave white type on white");

  /* THE SCRIM'S FLOOR BEHIND THE TYPE. Content is bottom-anchored, so
     the stop that matters is the one nearest the bottom. Measured
     against a pure white pixel — the worst case any photograph can
     present — 0.55 is 4.39:1 and fails; 0.60 clears at 5.22:1. */
  const scrim = forwardSlice(css, ".ariaTrustScrim{", "}", ".ariaTrustScrim");
  const stops = [...scrim.matchAll(/rgba\(4,12,28,([\d.]+)\)/g)].map(m => Number(m[1]));
  if (stops.length < 2) throw new Error("the scrim is no longer a gradient");
  if (Math.max(...stops) < 0.72) throw new Error(`the scrim's heaviest stop is ${Math.max(...stops)} — the type sits there and needs at least 0.72`);
  if (Math.min(...stops) > 0.4) throw new Error("the scrim is a flat wash — that is the muddy version the photos exist to avoid");
});

check("a trust card never borrows a category cover", () => {
  /* WHY THIS EXISTS. Before the real photographs arrived I rendered the
     trust strip with four CATEGORY covers dropped in, purely to show the
     treatment, and sent the picture. It was labelled a stand-in and it
     still read as the build — soap, a couch and gym gear under
     "Pagos seguros" and "Aduana resuelta".

     The photographs are right now, but "right now" is not a guarantee.
     The two sets live one directory apart and are the same shape and
     size, so a copy in the wrong direction is a plausible slip and an
     invisible one: nothing about assets/trust/trust-pagos.jpg being a
     picture of face cream would fail a build. This compares the bytes. */
  const hash = (p) => createHash("sha1").update(readFileSync(root(p))).digest("hex");
  const covers = new Map();
  for (const f of readdirSync(root("assets/category"))) {
    if (!/\.(jpe?g|png|webp)$/i.test(f)) continue;
    covers.set(hash(`assets/category/${f}`), f);
  }
  if (!covers.size) throw new Error("no category covers found to compare against — this check is not looking at anything");

  for (const [title, path] of Object.entries(TRUST_PHOTOS)) {
    if (!existsSync(root(path))) continue;   // absence is the other check's business
    const borrowed = covers.get(hash(path));
    if (borrowed) {
      throw new Error(`"${title}" is the category cover ${borrowed} — the trust cards get their own photographs`);
    }
  }
});

check("all four trust photographs are committed, and small enough to send to a phone", () => {
  /* This check was written while the four files were still missing, and
     only asserted that the strip was never HALF photographed. The files
     landed; it asserts the whole set now. A half-photographed strip is
     still the one state nobody chose, so that stays covered by the
     count being exactly four. */
  const missing = Object.entries(TRUST_PHOTOS).filter(([, p]) => !existsSync(root(p)));
  if (missing.length) {
    throw new Error(`trust photos named in the page but not committed: ${missing.map(([t]) => t).join(", ")}`);
  }
  /* 200 KB each, same budget as the Tiendas mall row. The four arrived
     at 1920x1280 and 1.5 MB the set; they ship at 1200x800 and 390 KB.
     This asserts nobody quietly re-adds a full-size original. */
  for (const [title, path] of Object.entries(TRUST_PHOTOS)) {
    const kb = readFileSync(root(path)).length / 1024;
    if (kb > 200) throw new Error(`${title} is ${kb.toFixed(0)} KB — over the 200 KB budget for a background`);
  }
});
group("The header fits the phone it is read on");

function fwd(src, a, b, what){
  const i = src.indexOf(a);
  if (i < 0) throw new Error(`${what}: cannot find ${JSON.stringify(a)}`);
  const j = src.indexOf(b, i + a.length);
  if (j < 0) throw new Error(`${what}: cannot find ${JSON.stringify(b)} after it`);
  return src.slice(i, j);
}
const hdrSource = () => readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");

check("nothing in the header is unshrinkable at a phone's width", () => {
  /* THE BUG. The header's inner row is justify-between with BOTH children
     flex-shrink-0: the wordmark (155px) and the right cluster (203.5px).
     358.5px that cannot shrink, inside 393 - 40 of padding = 353px. The
     page scrolled sideways 11px at 393, 44px at 360 and 83px at 320, and
     the words nearest the edge were cut until you dragged.

     These are SOURCE assertions, not geometry: browser-tests.mjs blocks
     the Tailwind CDN on purpose, so measuring a Tailwind-driven layout
     there compares one unstyled number to another. */
  const src = hdrSource();

  /* The wordmark scales rather than overflowing, and the size lives in
     our own stylesheet — a text-[22px] utility is gone with the CDN. */
  const css = fwd(src, "<style>", "</style>", "the inline stylesheet");
  const wm = fwd(css, ".ariaWordmark{", "}", ".ariaWordmark");
  if (!/clamp\(/.test(wm)) throw new Error("the wordmark is a fixed size again — it cannot shrink on a small phone");
  const floor = wm.match(/clamp\(\s*(\d+(?:\.\d+)?)px/);
  if (!floor) throw new Error("cannot read the wordmark's minimum size");
  if (Number(floor[1]) > 17) throw new Error(`the wordmark's floor is ${floor[1]}px — too wide to fit a 320px header`);

  const logo = fwd(src, 'aria-label="Aria Shop™ — inicio"', "</button>", "the wordmark button");
  if (/text-\[22px\]/.test(logo)) throw new Error("the wordmark is back on a fixed text-[22px] utility");
  if (!/ariaWordmark/.test(logo)) throw new Error("the wordmark is not using .ariaWordmark");

  // and the header's own padding gives the phone its margin back
  if (!/px-3 sm:px-5 h-\[68px\]/.test(src)) throw new Error("the header no longer tightens its padding below sm");
});

check("the header's auth buttons are responsive in BOTH places that write them", () => {
  /* THE TRAP THIS PINS, and it nearly shipped: the markup in the header
     is only the logged-out default. renderAuthUI() rewrites #authArea
     from its own template on load and on every login/logout. Fixing the
     padding in the markup alone looks correct in the file and reverts
     the moment the page runs. */
  const src = hdrSource();
  const header = fwd(src, 'aria-label="Aria Shop™ — inicio"', 'id="mobileMenu"', "the header");
  const render = fwd(src, "function renderAuthUI(", "document.getElementById('authAreaMobile')", "renderAuthUI");
  for (const [where, slice] of [["the header markup", header], ["renderAuthUI", render]]) {
    const bare = [...slice.matchAll(/h-9 px-4 rounded-full/g)].length;
    if (bare) throw new Error(`${where} still has ${bare} auth button(s) on fixed px-4 — they overflow a 360px header`);
    if (!/px-2\.5 sm:px-4/.test(slice)) throw new Error(`${where} has no responsive auth-button padding`);
  }
});

check("below 360px the header CTA moves into the menu rather than off the screen", () => {
  /* A 320px header cannot hold a wordmark, a cart, a signup button AND a
     menu button. Scaling type and shaving padding cleared 393 and 360 and
     still left 320 five pixels over; the next shave would have been the
     third in a row. The button moves to where it already exists —
     renderAuthUI writes #authAreaMobile inside the hamburger — so nothing
     is lost, only relocated. */
  const src = hdrSource();
  const css = fwd(src, "<style>", "</style>", "the inline stylesheet");
  if (!/@media \(max-width:359\.98px\)\{[\s\S]*?#authArea\{ display:none \}/.test(css)) {
    throw new Error("the sub-360px rule that moves the header CTA into the menu is gone");
  }
  /* It may only be hidden because the menu really does carry it. */
  if (!/id="authAreaMobile"/.test(src)) throw new Error("#authAreaMobile is gone — hiding the header CTA would now lose it");
  if (!/getElementById\('authAreaMobile'\)\.innerHTML/.test(src)) {
    throw new Error("nothing fills #authAreaMobile any more — the relocated CTA would be an empty div");
  }
});


check("Si sobra, es tuyo sits where it argues, and says it in Spanish", () => {
  /* ITS OWN CHECK, DELIBERATELY, and the reason is the bug that nearly
     shipped with it: the first version of these assertions lived inside
     "the explainer is photography and type" and silently never ran. A
     mutation that put the word "cashback" on the card passed the whole
     suite. An assertion wedged into someone else's test inherits their
     slice, their variables and their early exits; this one reads the
     file and answers for itself. */
  const src = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
  const why = src.slice(src.indexOf('id="whyUs"'), src.indexOf('id="cats"'));
  if (!why) throw new Error("the explainer section is gone");
  if (!/Si sobra, es tuyo/.test(why)) throw new Error("the saldo promise card is gone");

  /* THE ORDER IS THE ARGUMENT: here is the final price, and here is what
     happens when the real one comes in lower. Pinned by position, not
     merely by presence. */
  const order = ["Precio final, sin sorpresas", "Si sobra, es tuyo", "Seguimiento de tu pedido"]
    .map((t) => why.indexOf(t));
  if (order.some((i) => i < 0) || order[0] > order[1] || order[1] > order[2]) {
    throw new Error("the saldo card is no longer between the final price and the tracking promise");
  }

  const at = why.indexOf("Si sobra, es tuyo");
  const cardBody = why.slice(at, why.indexOf("</div>", why.indexOf("</p>", at)));

  /* SPANISH ONLY, and this card is where an English word is most
     tempting: "cashback", "refund" and "wallet" each say it in one. */
  for (const english of [/cashback/i, /refund/i, /wallet/i, /\bcredit\b/i, /\bbalance\b/i]) {
    if (english.test(cardBody)) throw new Error(`the card slipped into English: ${english}`);
  }

  /* And the copy is the approved copy, not a paraphrase of it. */
  for (const phrase of ["Estimamos impuestos y flete antes de comprar",
                        "la diferencia vuelve a tu cuenta como saldo Aria",
                        "la diferencia la pagamos nosotros"]) {
    if (!cardBody.includes(phrase)) throw new Error(`the approved copy changed: "${phrase}" is gone`);
  }
});

check("the saldo promise is one the product actually keeps", () => {
  /* THE POINT OF THIS CHECK, and it is the same rule that took the Peru
     price-comparison card off this section: a promise on the home page
     is a claim, and a claim needs something behind it.

     "saldo Aria" is not a coined phrase here — it is the wallet balance
     checkout already applies to an order. If that machinery is ever
     ripped out, this card has to go with it, and this fails first. */
  const src = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
  const co = readFileSync(root("checkout.html"), "utf8").replace(/\r\n/g, "\n");
  if (!/saldo Aria/.test(src)) throw new Error("the page no longer mentions saldo Aria at all");
  if (!/walletAppliedPen|saldo/.test(co)) {
    throw new Error("checkout no longer applies a saldo — the home page is promising a balance that does not exist");
  }
  /* And the policy is stated in the one place it was already stated,
     so the card is a restatement rather than a second, drifting rule. */
  if (!/la diferencia vuelve a ti como saldo Aria/.test(src)) {
    throw new Error("the freight half of this promise is gone from Precio Honesto — the two statements have drifted");
  }
});

check("the new card is built from the same parts as its neighbours", () => {
  /* NO NEW VISUAL LANGUAGE was the brief's word. The card must be the
     same glass shell and the same two type ramps as the five beside it
     -- asserted against a SIBLING rather than against a hardcoded class
     list, so restyling the section restyles this too instead of leaving
     one card behind. */
  const src = readFileSync(root("index.html"), "utf8").replace(/\r\n/g, "\n");
  const why = src.slice(src.indexOf('id="whyUs"'), src.indexOf('id="cats"'));
  const classesOf = (title) => {
    const at = why.indexOf(title);
    const h3 = why.lastIndexOf("<h3 ", at), p = why.indexOf("<p ", at);
    return [why.slice(h3, at).match(/class="([^"]+)"/)[1], why.slice(p, why.indexOf(">", p)).match(/class="([^"]+)"/)[1]];
  };
  const mine = classesOf("Si sobra, es tuyo");
  const sibling = classesOf("Precio final, sin sorpresas");
  eq(mine[0], sibling[0], "the headline does not match its neighbours");
  eq(mine[1], sibling[1], "the body text does not match its neighbours");
  /* No colour of its own, in either half. */
  const at = why.indexOf("Si sobra, es tuyo");
  const card = why.slice(why.lastIndexOf('<div class="ariaWhyPromise">', at), why.indexOf("</div>", why.indexOf("</p>", at)));
  const colours = [...card.matchAll(/color:(#[0-9A-Fa-f]{3,6})/g)].map((m) => m[1]);
  eq([...new Set(colours)].sort().join(","), "#D7E0F4,#fff", `the card introduced a colour: ${colours.join()}`);
});
group("No vitamins, and no way back to them");

/* ==================================================================
   VITAMINS AND SUPPLEMENTS ARE OFF THE SITE (2026-09-24).

   They need a DIGEMID import permit in Peru. We do not hold one, so
   this is a liability rule, not a merchandising preference -- which is
   why these checks pin the ABSENCE rather than the tidiness. A vitamin
   that reappears is not an ugly tile, it is an order we cannot legally
   fulfil.

   The `pharmacy` bucket in the Walmart and Target caches was 100%
   supplements: 48 products, every one a multivitamin, a mineral, a
   collagen, a cleanse or a weight-loss pill. It is gone, and so is
   every route that could put it back.
   ================================================================== */

const RESTRICTED = "pharmacy";

check("no committed catalogue carries a pharmacy bucket", () => {
  for (const file of ["department-cache.json", "macys-catalog.json",
                      "ssense-catalog.json", "beauty-catalog.json"]) {
    const data = JSON.parse(readFileSync(root(file), "utf8"));
    for (const [retailer, bucket] of Object.entries(data?.retailers || {})) {
      const depts = Object.keys(bucket?.departments || {});
      if (depts.includes(RESTRICTED)) {
        throw new Error(`${file}: ${retailer} still carries a ${RESTRICTED} department`);
      }
    }
  }
});

check("no supplement survives anywhere in the committed catalogues", () => {
  /* THE BUCKET IS NOT THE RULE, THE PRODUCT IS. Deleting a department
     named "pharmacy" would be cosmetic if a multivitamin sat in
     home_goods -- so this reads every title in every file. It is written
     against product names rather than departments for the same reason.

     THE PATTERN IS DELIBERATELY NARROW. "tablets" and "capsules" are in
     the weight estimator's supplement regex and are NOT here: an iPad is
     a tablet. Matching them would fail this suite on electronics and
     teach whoever hits it to loosen the rule, which is the opposite of
     what it is for. Every word below names a supplement and nothing
     else. Verified against the real files: two beauty products mention
     "Vitamin C" and "Electrolytes" as INGREDIENTS -- a foundation and a
     plumping serum -- and neither matches, because the words here are
     the product, not what is in it. */
  const SUPPLEMENT = /\b(multivitamins?|dietary supplements?|suplementos?|probiotics?|melatonin|biotin|elderberry|ashwagandha|glucosamine|prenatal vitamins?|vitamin d3|vitamin b12|fish oil|weight loss pills?|fat burner|parasite (?:cleanse|support)|intestinal cleanse)\b/i;
  const found = [];
  const walk = (node, where) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, where));
    if (!node || typeof node !== "object") return;
    const title = node.title || node.name || node.productTitle || node.productName;
    if (typeof title === "string" && SUPPLEMENT.test(title)) found.push(`${where}: ${title.slice(0, 60)}`);
    for (const v of Object.values(node)) walk(v, where);
  };
  for (const file of ["department-cache.json", "macys-catalog.json",
                      "ssense-catalog.json", "beauty-catalog.json"]) {
    walk(JSON.parse(readFileSync(root(file), "utf8")), file);
  }
  eq(found.join(" | "), "", `supplements are still in the catalogue data: ${found.slice(0, 3).join(" | ")}`);
});

check("the department is out of every map that could draw it", () => {
  /* Four tables decide whether a department exists, is labelled, is
     matched and is illustrated. One left behind is a half-removal: the
     tile comes back the moment a bucket does. */
  if (deptMap.DEPARTMENT_SPEC[RESTRICTED]) throw new Error("DEPARTMENT_SPEC still declares pharmacy — it would get a tile again");
  if (deptMap.BUCKET_SPEC[RESTRICTED]) throw new Error("BUCKET_SPEC still maps the pharmacy bucket into a category");

  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  for (const table of ["DEPARTMENT_META", "DEPARTMENT_SPEC", "BUCKET_SPEC", "CATEGORY_COVERS"]) {
    const from = src.indexOf(`const ${table} = {`);
    if (from < 0) throw new Error(`${table} is gone from index.html`);
    const body = src.slice(from, src.indexOf("\n};", from));
    if (/^\s*pharmacy\s*:/m.test(body)) throw new Error(`${table} still has a pharmacy row`);
  }
  if (/Salud y Farmacia/.test(src)) throw new Error("the Salud y Farmacia label is still in the page");
});

check("the cover file stays on disk and stays unwired", () => {
  /* Danny's instruction exactly: leave the art, do not use it. Asserting
     BOTH halves, because deleting the file would be a different decision
     and wiring it back would be the bug this PR exists to prevent. */
  if (!existsSync(root("assets/category/pharmacy.jpg"))) {
    throw new Error("assets/category/pharmacy.jpg was deleted — it was meant to stay, just unused");
  }
  eq(Boolean(covers.CATEGORY_COVERS[RESTRICTED]), false, "the pharmacy cover is wired up again");
});

check("nothing points a scrape at the vitamins aisle any more", () => {
  /* The quota rows are what spend Apify credit, and the browse URLs are
     what a run would land on. Leaving either would refill the bucket on
     the next refresh and bill us for the privilege. */
  for (const [retailer, quotas] of Object.entries(CATALOG_QUOTAS)) {
    for (const q of quotas) {
      if (q.department === RESTRICTED || q.category === RESTRICTED) {
        throw new Error(`${retailer} still has a ${RESTRICTED} quota — the next refresh re-scrapes vitamins`);
      }
      if (/\bvitamins?\b|\bsupplements?\b/i.test(q.query || "")) {
        throw new Error(`${retailer} still queries "${q.query}"`);
      }
    }
  }
  const scrape = readFileSync(root("netlify/functions/apify-scrape-start.js"), "utf8");
  if (/pharmacy\s*:/.test(scrape)) throw new Error("apify-scrape-start still has a pharmacy browse URL");
  if (/vitamins-supplements|\/health\/vitamins/.test(scrape)) {
    throw new Error("apify-scrape-start still points at a vitamins aisle");
  }
});

check("a pharmacy bucket that arrives anyway is dropped at the load boundary", () => {
  /* THE PART THAT ACTUALLY PROTECTS THE SHOPPER, and the reason this is
     not just four deleted table rows.

     Ofertas is { anyCategory: true, onSaleOnly: true }, and
     itemBelongsToDepartment() returns on onSaleOnly BEFORE it consults
     BUCKET_SPEC. So a discounted multivitamin would have stayed in the
     deals feed with every map entry removed. relatedPool() and
     retailerItemsFor() walk the buckets directly too, which is search
     and the brand panels. The gate has to be on the DATA, once, where
     all of them read it. */
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const gate = src.slice(src.indexOf("function withoutRestrictedDepartments("),
                         src.indexOf("function loadDepartmentCache("));
  if (!gate) throw new Error("withoutRestrictedDepartments is gone");
  if (!/RESTRICTED_DEPARTMENTS\.has\(/.test(gate)) throw new Error("the gate no longer consults RESTRICTED_DEPARTMENTS");
  if (!/const RESTRICTED_DEPARTMENTS = new Set\(\['pharmacy'\]\)/.test(src)) {
    throw new Error("RESTRICTED_DEPARTMENTS no longer lists pharmacy");
  }

  /* It must run over EVERY part of the merge -- the scraped cache and
     each catalogue file -- not just the first. */
  const loader = src.slice(src.indexOf("function loadDepartmentCache("),
                           src.indexOf("const DEPARTMENT_META"));
  if (!/parts\.map\(withoutRestrictedDepartments\)/.test(loader)) {
    throw new Error("the merge no longer strips restricted departments from every catalogue");
  }
});


group("Curvy promises only the sizes a store actually publishes");

const curvy = loadPageCurvySlice();

/* ==================================================================
   CURVY (2026-09-24), and the one rule it cannot bend.

   A shopper who wears a 2X is underserved everywhere in Peru. The way
   to insult her is to fill a page with "Plus Size" in the product name
   and let her find out at checkout. So the filter reads the retailer's
   own size list and nothing else, and these checks pin that rather than
   the tidiness of the section.
   ================================================================== */

check("curvy is a size filter over apparel, not a category a store scrapes into", () => {
  const spec = deptMap.DEPARTMENT_SPEC.curvy;
  if (!spec) throw new Error("curvy is not a department");
  eq(spec.category, "apparel", "curvy is not scoped to apparel");
  eq(spec.extendedSizesOnly, true, "curvy no longer filters on the size run");
  /* It must NOT be a bucket: no retailer scrapes a "curvy" aisle, and
     declaring one would make the page depend on a bucket name instead
     of on the data. */
  if (deptMap.BUCKET_SPEC.curvy) throw new Error("curvy became a scrape bucket — it is a filter, not an aisle");
});

check("curvy took the slot pharmacy left, and kept its own cover", () => {
  eq(Boolean(covers.CATEGORY_COVERS.curvy), true, "curvy has no curated cover");
  eq(covers.CATEGORY_COVERS.curvy, "assets/category/curvy.jpg", "the cover is not the approved file");
  if (!existsSync(root("assets/category/curvy.jpg"))) throw new Error("assets/category/curvy.jpg is not committed");
  if (deptMap.DEPARTMENT_SPEC.pharmacy) throw new Error("pharmacy is back — curvy was meant to replace it");
});

check("the name is Danny's, and the supporting line carries the search words", () => {
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const meta = src.slice(src.indexOf("const DEPARTMENT_META = {"), src.indexOf("\n};", src.indexOf("const DEPARTMENT_META = {")));
  if (!/curvy:\s*\{\s*label:\s*'Curvy'/.test(meta)) throw new Error("the department is no longer labelled Curvy");
  /* NEVER "Big & Tall", and never English beyond the one word Danny
     chose. The supporting copy is where the Spanish lives. */
  if (/big\s*&?\s*tall/i.test(src)) throw new Error('"Big & Tall" is on the page');
  if (!/const CURVY_BLURB = 'Tallas grandes y extendidas'/.test(src)) {
    throw new Error("the supporting line no longer says tallas grandes y extendidas");
  }
});

check("a product name can never put an item in Curvy", () => {
  /* THE WHOLE POINT. This is the shape of the bug the section exists to
     avoid: marketing copy in a title is not a size the store will ship. */
  const { hasExtendedSizes, extendedSizesOf } = curvy;
  eq(hasExtendedSizes({ name: "Plus Size Curvy Tunic 3X 4X", availableSizes: ["s", "m", "l"] }), false,
     "a title full of size words got in with no extended size published");
  eq(hasExtendedSizes({ name: "Plus Size Tunic" }), false, "an item with NO size list at all got in");
  eq(hasExtendedSizes({ name: "Plain Tee", availableSizes: ["s", "m", "l", "xl"] }), false,
     "a standard run counted as extended");
  eq(hasExtendedSizes({ name: "Plain Tee", availableSizes: ["s", "3x"] }), true, "a real 3X was rejected");
  eq(extendedSizesOf({ availableSizes: ["xs", "s", "m", "l", "xl", "xxl", "3x"] }).join(","), "xxl,3x",
     "the extended subset is wrong");
  /* A malformed list must not throw and must not qualify. */
  for (const bad of [undefined, null, "xxl", 3, {}, [1, 2], [null]]) {
    eq(hasExtendedSizes({ availableSizes: bad }), false, `a ${typeof bad} size list qualified an item`);
  }
});

check("the size run is printed biggest-last and deduped", () => {
  const { sizeRunLabels } = curvy;
  eq(sizeRunLabels({ availableSizes: ["xxxxl", "xxl", "l", "xxxl"] }).join(" "), "XXL XXXL XXXXL",
     "the run is out of order");
  eq(sizeRunLabels({ availableSizes: ["3X", "3x", "xxl"] }).join(" "), "XXL 3X", "the run repeats a size");
  eq(sizeRunLabels({ availableSizes: ["s", "m"] }).join(" "), "", "a standard run printed a size chip");
});

check("kidswear never reaches Curvy", () => {
  /* A child's XXL is not an extended adult size, and a boys' tee on this
     page would be the exact insult the section undoes. Excluded through
     genderOfItem — the site's existing rule — not a new word list. */
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const fn = src.slice(src.indexOf("function itemBelongsToDepartment("), src.indexOf("\n}", src.indexOf("function itemBelongsToDepartment(")));
  if (!/extendedSizesOnly/.test(fn)) throw new Error("itemBelongsToDepartment no longer handles the size filter");
  if (!/genderOfItem\(item, bucketName\) === 'kids'\) return false/.test(fn)) {
    throw new Error("kidswear is no longer excluded from the size filter");
  }
});

check("every item Curvy would show in the real catalogue has a published extended size", () => {
  /* Driven over the committed data, not a fixture: whatever the page
     would list today, every one of them must carry the size that put it
     there. Also records the honest shape of the section -- one retailer,
     because it is the only one that publishes sizes at all. */
  const { hasExtendedSizes } = curvy;
  const cache = JSON.parse(readFileSync(root("department-cache.json"), "utf8"));
  const eligible = [];
  const sizedRetailers = new Set();
  for (const [retailer, data] of Object.entries(cache.retailers || {})) {
    for (const [bucket, entry] of Object.entries(data.departments || {})) {
      for (const it of entry.items || []) {
        if (Array.isArray(it.availableSizes) && it.availableSizes.length) sizedRetailers.add(retailer);
        if (bucket === "kids") continue;
        if (hasExtendedSizes(it)) eligible.push({ retailer, name: it.name || it.title || "" });
      }
    }
  }
  for (const e of eligible) {
    if (!e.name) throw new Error(`${e.retailer} would list a nameless item in Curvy`);
  }
  /* THE FINDING THIS SECTION WAS BUILT AROUND, pinned so it is noticed
     the day it changes: Old Navy is the only store publishing sizes. The
     day a second one does, this fails and Curvy gets deeper — which is a
     good failure, and the message says so. */
  eq([...sizedRetailers].sort().join(","), "oldnavy",
     "a second retailer now publishes size data — widen Curvy and update this");
  if (!eligible.length) throw new Error("no item qualifies at all — the filter is reading the wrong field");
});

check("a thin section says so, in its own voice", () => {
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const notice = src.slice(src.indexOf("function curvyNoticeHTML("), src.indexOf("\n}", src.indexOf("function curvyNoticeHTML(")));
  if (!/Pr[óo]ximamente/.test(notice)) throw new Error("the thin state lost its próximamente");
  if (!/estamos cargando tallas/i.test(notice)) throw new Error("the thin state no longer says tallas are still loading");
  if (!/No estimamos ni completamos tallas/.test(notice)) throw new Error("the notice no longer states the never-invent rule");
  /* DIGNIFIED, NOT APOLOGETIC. Danny's word. A section for a shopper who
     is underserved everywhere must not open by apologising to her. */
  for (const grovel of [/lo sentimos/i, /disculpa/i, /desafortunadamente/i, /perd[óo]n/i, /lamentablemente/i]) {
    if (grovel.test(notice)) throw new Error(`the notice apologises: ${grovel}`);
  }
  if (!/CURVY_THIN_THRESHOLD/.test(src)) throw new Error("the thin threshold is gone");
});

check("the size run only prints where a page asked for it", () => {
  /* It is real data and it is honest everywhere, but on a page that is
     not about sizes it is one more line of small type between the
     photograph and the price. Curvy asks; nothing else does. */
  const src = stripComments(readFileSync(root("index.html"), "utf8"));
  const fn = src.slice(src.indexOf("function sizeRunHTML("), src.indexOf("\n}", src.indexOf("function sizeRunHTML(")));
  if (!/opts\.showSizeRun/.test(fn)) throw new Error("the size run renders whether or not a surface asked");
  if (!/showSizeRun: catalogState\.key === 'curvy'/.test(src)) {
    throw new Error("the catalogue feed no longer turns the size run on for Curvy");
  }
});
/* ------------------------------------------------------------------ */
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.log(`  FAIL  ${f}\n`);
process.exit(failures.length ? 1 : 0);

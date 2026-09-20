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
import { loadPageWeightSlice } from "./_page-script.mjs";

import * as beauty from "../lib/beauty-weight.js";
import * as itemWeight from "../lib/item-weight.js";
import { estimateWeightDetail, categoryWeightKg } from "../lib/sales-sources.js";
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
  const r = resolveItemWeight({ title: "Dior Sauvage Eau de Toilette 100ml", weightKg: 0.42 });
  eq(r.weightKg, 0.42);
  eq(r.source, "spec");
  eq(r.estimated, false);
});

check("every beauty weight is flagged as an estimate and reaches the review queue", () => {
  const detail = estimateWeightDetail("MAC Matte Lipstick");
  eq(detail.estimated, true, "estimated");
  eq(detail.flagged, true, "flagged for the weight review queue");
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

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

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

/* ------------------------------------------------------------------ */
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.log(`  FAIL  ${f}\n`);
process.exit(failures.length ? 1 : 0);

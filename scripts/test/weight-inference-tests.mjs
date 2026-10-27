/* ==================================================================
   #449 SIBLING WEIGHT INFERENCE -- PRICING. Regression battery.

   Signed off on #449 (Lucifer, 2026-10-20): a product under $75 that no
   weight row recognises is quoted at its verified siblings' median x
   1.10 (same department, same kind), capped at 2 kg, flagged
   `inferred`; the flagged clusters carry the fixes Chad proposed; the
   live >20 kg misfires on cheap items are gone; and Danny's 889 ruling
   holds -- a truthful quote is not held because the freight costs more
   than the product.

   UNIT (the resolver checkout and orders-create share, the Node
   estimator, and the app bundle's mirror):
     - the data: the server's module and the page's JSON are one object,
       cluster level only, and every figure sits in its type's range;
     - representative clusters (diecast 0.37, action figure 0.33, ...);
     - the pinned types (trading cards, jewellery, surf leash / traction
       pad / rash guard, dirt-bike tyres by size, above the cap);
     - the moms placeholder stamps are no weight;
     - the former misfires (resistance bands 121.5 kg, kitchen storage
       40.5, desk lamps and LEGO 54, Play-Doh playsets 74.25, ...) quote
       a sane weight and are not held, and $75+ quotes are as on main;
     - a cheap inferred line whose freight exceeds its price is NOT held,
       while the unpriced generic guess still is;
     - the Dreamhouse is still 14.5 kg, the dolls unchanged, the $75+
       band unchanged;
     - PDP / checkout / server parity: the page's estimator, the Node
       estimator and the server agree title by title.
   BROWSER (if Chromium is available): product page -> cart -> checkout
   for an inferred toy and for a tyre whose freight exceeds its price:
   checkout reads the server's weight and shows no hold.

   RUN: node scripts/test/weight-inference-tests.mjs
   Starts its own static server on WEIGHT_INFERENCE_PORT (default 8922).
   WEIGHT_INFERENCE_SKIP_BROWSER=1 runs the unit checks only.
   ================================================================== */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCartWeights, resolveItemWeight } from "../../netlify/functions/_weight-resolve.js";
import { estimateWeightDetail } from "../lib/sales-sources.js";
import * as W from "../lib/item-weight.js";
import DATA from "../lib/inferred-weights-data.js";
import { loadPageWeightSlice } from "./_page-script.mjs";
import { CHARGE_PER_KG } from "../../weight-data.js";

/* The department ceiling below is the machinery behind
   ARIA_NO_WEIGHT_POLICY=ceiling. Since the #443 weight ruling
   (2026-10-26) the default holds a product with no weight, no rule and
   no comparable instead ("por confirmar"; pdp-weight-truth-tests.mjs
   pins that default). This suite pins the ceiling itself, so it runs
   under the switch. */
process.env.ARIA_NO_WEIGHT_POLICY = "ceiling";
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let passed = 0, failed = 0;
async function check(name, fn) {
  try { const note = await fn(); passed++; console.log("  ok   " + name + (note ? "  -- " + note : "")); }
  catch (e) { failed++; console.log("  FAIL  " + name + "\n         " + String(e && e.message).split("\n")[0]); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }
const eq = (a, b, msg) => assert(a === b, `${msg}: got ${a}, want ${b}`);
const line = (title, retailer, priceUsd, extra = {}) => ({ title, retailer, priceUsd, qty: 1, weightKg: 0.2, weightEstimated: true, ...extra });
const one = (l) => resolveCartWeights([l]);
const P = loadPageWeightSlice();

console.log("weight inference (#449 pricing): unit");

await check("the data: the server module and the page's JSON are the same object, cluster level only, and small", () => {
  const json = JSON.parse(readFileSync(join(ROOT, "assets/weight/inferred-weights.json"), "utf8"));
  assert(JSON.stringify(json) === JSON.stringify(DATA), "assets/weight/inferred-weights.json differs from scripts/lib/inferred-weights-data.js");
  const keys = Object.keys(DATA).sort().join(",");
  eq(keys, "capKg,catalog,clusters,depts,generatedBy,issue,pins,ranges,stores,types,underUsd", "top-level keys");
  eq(DATA.underUsd, 75, "under $75 only"); eq(DATA.capKg, 2, "2 kg cap");
  const bytes = Buffer.byteLength(JSON.stringify(DATA));
  assert(bytes < 64 * 1024, `the data is ${bytes} bytes`);
  return `${(bytes / 1024).toFixed(1)} KB, ${Object.keys(DATA.stores).length} stores`;
});

await check("physical sanity: every cluster, department and catalogue figure is inside its type's range and the cap", () => {
  let n = 0;
  for (const [dept, types] of Object.entries(DATA.clusters)) {
    for (const [type, kg] of Object.entries(types)) {
      n++;
      const r = DATA.ranges[type];
      if (r) assert(kg >= r[0] && kg <= r[1], `${dept}/${type} ${kg} kg outside ${r}`);
      const inf = W.inferredWeightKg("", { retailer: "x", priceUsd: 10 }, { ...DATA, types: [[type, "^"]], stores: { x: [dept] } });
      assert(inf.kg > 0 && inf.kg <= DATA.capKg, `${dept}/${type} quotes ${inf.kg} kg`);
    }
  }
  for (const [d, kg] of Object.entries(DATA.depts)) assert(kg > 0, d + " median");
  assert(DATA.catalog > 0 && DATA.catalog <= DATA.capKg, "catalogue median");
  /* Grams-class goods stay grams-class whatever pool they land in. */
  for (const type of ["earrings", "necklace", "bracelet", "ring", "trading cards", "sticker / decal", "keychain / lanyard"]) {
    for (const dept of [...Object.keys(DATA.depts), "nowhere"]) {
      const inf = W.inferredWeightKg("", { retailer: "x", priceUsd: 10 }, { ...DATA, types: [[type, "^"]], stores: { x: [dept] } });
      assert(inf.kg <= 0.6, `${dept}/${type} quotes ${inf.kg} kg`);
    }
  }
  return `${n} clusters`;
});

const CLUSTERS = [
  ["Hot Wheels Cars, 5-Pack of Die-Cast Toy Cars or Trucks in 1:64 Scale (Styles & Colors May Vary, Items May Not Be Pictured)", "walmart", 6.97, 0.37, "toys/diecast vehicle"],
  ["The Super Mario Galaxy Movie – set diorama Gateway Galaxy con figuras de Princess Peach de 1.5” y Captain Toad exclusivas", "target", 12.92, 0.33, "toys/action figure / collectible figure"],
  ["Form Ocean Blue 54mm 103a Skateboard Wheels", "zumiez", 19.89, 0.55, "skate_snow/skateboard wheels"],
  ["Black Front Shield Snap for Mission AMS Helmets", "denniskirk", 2.37, 0.22, "motos/helmet part"],
];
await check("representative clusters: diecast 0.37, action figure 0.33, skate wheels via sporting goods, helmet parts", () => {
  for (const [t, store, price, kg, key] of CLUSTERS) {
    const r = one(line(t, store, price)).items[0];
    eq(r.weightKg, kg, t);
    eq(r.source, "inferred", "source " + t);
    assert(r.inferred === true, "not flagged inferred: " + t);
    eq(r.inferredKey, key, "cluster " + t);
    assert(!r.needsReview, "held: " + t);
  }
  eq(W.inferredWeightKg("Matchbox die-cast car", { retailer: "walmart", priceUsd: 5 }).kg, 0.37, "diecast by type");
  return CLUSTERS.length + " titles";
});

await check("pinned types: trading cards 0.05 (boxes 0.45), jewellery 0.05, surf leash / rash guard 0.3", () => {
  const cases = [
    ["Ravensburger Disney Lorcana: Rise of the Floodborn TCG mazo inicial Amber & Sapphire, coleccionable", "walmart", 14.86, 0.05],
    ["Collectible Pokemon Trading Card Games Scarlet & Violet 9 Journey Together Booster Bundle", "walmart", 55.74, 0.45],
    ["Statement Hoop Earrings, Gold Tone", "walmart", 5.22, 0.05],
    ["Womens Thick Gold-Tone Hoop Earrings, 1 Pair", "walmart", 7.29, 0.05],
    ["Channel Islands Surfboards Hex Comp Leash", "islandwatersports", 50.42, 0.3],
    ["Roxy Women's Whole Hearted Long Sleeve Rashguard", "dicks", 38.44, 0.3],
  ];
  for (const [t, store, price, kg] of cases) {
    const r = one(line(t, store, price)).items[0];
    eq(r.weightKg, kg, t); eq(r.inferredBasis, "pinned", "basis " + t);
    assert(!r.needsReview, "held: " + t);
  }
});

await check("dirt-bike tyres are pinned by size and may exceed the 2 kg cap (real tyre weights)", () => {
  eq(one(line("IRC NR77U Tires", "revzilla", 71.21)).totalKg, 5, "NR77U");
  eq(one(line("IRC MX IX Kids Tires", "revzilla", 38.26)).totalKg, 3, "kids tyre");
  eq(one(line("Front Or Rear HF319 3.00-18 Blackwall Tire", "denniskirk", 52.91)).totalKg, 4, "3.00-18");
  eq(one(line("Dunlop Geomax MX34 120/80-19 Rear Tire", "revzilla", 67.65)).totalKg, 6, "120/80-19 rear");
  eq(one(line("Shinko SR 400 Scooter Tires", "revzilla", 47.31)).totalKg, 3, "scooter");
  /* A tyre tool is not a tyre. */
  assert(one(line("Motion Pro Tire Iron Set", "revzilla", 30)).totalKg < 2, "tyre irons");
});

await check("the moms 4.0 kg placeholder is no weight (and the 12 / 25 kg stamps only stay on a stroller / crib)", () => {
  assert(W.isCatalogPlaceholder(4, "kindredbravely", "Organic Muslin Swaddle | Sage Stripe"), "4.0 swaddle");
  assert(W.isCatalogPlaceholder(12, "kindredbravely", "Stroller Party™ Clips (2-Pack) | Leopard"), "12 on stroller clips");
  assert(W.isCatalogPlaceholder(25, "momcozy", "Momcozy Muslin Fitted Crib Sheets - 2 sizes - Blue"), "25 on crib sheets");
  assert(!W.isCatalogPlaceholder(25, "walmartbaby", "Graco Olivia 3-in-1 Convertible Baby Crib, Driftwood"), "a crib keeps 25");
  assert(!W.isCatalogPlaceholder(12, "walmartbaby", "Graco Modes Travel System Stroller"), "a stroller keeps 12");
  assert(!W.isCatalogPlaceholder(4, "sephora", "Some Big Gift Set"), "other stores' 4.0 is untouched");
  /* End to end: the card no longer carries it, and checkout does not bill it. */
  const t = "Organic Muslin Swaddle | Sage Stripe";
  eq(P.catalogWeightDetail({ specWeightKg: 4, weightEstimated: true }, t, { retailer: "kindredbravely", priceUsd: 26.51 }), null, "page catalogue weight");
  const r = one(line(t, "kindredbravely", 26.51, { specWeightKg: 4 })).items[0];
  eq(r.source, "inferred", "source"); assert(r.weightKg < 1, "swaddle quotes " + r.weightKg);
  /* A real catalogue figure still wins. */
  eq(one(line(t, "kindredbravely", 26.51, { specWeightKg: 0.21 })).totalKg, 0.21, "a real 0.21 kg");
});

const FORMER_MISFIRES = [
  ["Set of 3 Resistance Exercise Loop Bands Fitness Home Gym Yoga Glutes Trainer", "walmart", 12.33, 121.5],
  ["NIUTA Resistance Bands Set, 150 lbs TPE Exercise Bands with Handles, 11 PCS Workout Bands Resistance Bands for Working Out with Door Anchor, Ankle Straps & Carry Bag, Fitness Bands for Home Gym", "walmart", 27.27, 121.5],
  ["11‑Piece Resistance Bands Set (30–50 lb) – Durable Elastic Bands for Rehab, Physical Therapy & Mobility", "walmart", 24.79, 22.74],
  ["2 Pack Pull Out Spice Rack Organizer for Cabinet, AOKIWO Multi-Purpose Kitchen Storage Cabinet Organizer, Fits 12\"H x 11", "walmart", 23.55, 40.5],
  ["Sorbus 4 Pack Clear Small Plastic Storage Bins - for Kitchen Organization and Storage, Pantry, Fridge, Cabinets", "target", 52.63, 121.5],
  ["LEGO Botanicals Daisies Building Toy - Birthday Gift for Kids & Adults, Ages 9+ - Kids Room Decor for Shelf or Desk, Gir", "walmart", 12.26, 54],
  ["Mainstays LED Desk Lamp with Catch-All Base & AC Outlet, Matte Black", "walmart", 10.27, 54],
  ["Play-Doh Kitchen Creations Lil Noodle Playset with 2 Cans, Walmart Exclusive", "walmart", 9.88, 74.25],
  ["Mini Brands Fill the Fridge Mini Series 1: cápsula de ZURU, juguete coleccionable sorpresa para desempaquetar para niños", "walmart", 9.88, 121.5],
  ["3pc Silicone Mini Turner Basting Brush and Tongs Set Blue - Figmint™: Kitchen Utensils, Dishwasher-Safe, Adult Use", "target", 9.87, 121.5],
  ["DEORAB 2x3 Small Vintage Floral Area Rugs – Machine Washable Rugs for Living Room, Non Slip Rubber Backing, Floral Rug f", "walmart", 17.65, 21.6],
  ["Volcom Recliner Mens Sandal", "islandwatersports", 55.73, 24.3],
  ["Disney Junior Minnie Mouse Fab Food Bucket, 25-Pieces, Pretend Kitchen Playset Baby and Toddler Toys", "walmart", 12.4, 21.5],
  ["Oben Magnetic Mount with 1/4\"-20 Mounting Screw (44 lb)", "bhphoto", 15.91, 20.02],
];
await check("the live >20 kg misfires on cheap items are gone (rules fixed, no product special-cased), and none is held", () => {
  for (const [t, store, price, was] of FORMER_MISFIRES) {
    const r = one(line(t, store, price));
    assert(r.totalKg < 20, `${r.totalKg} kg (was ${was}) for ${t}`);
    assert(!r.needsReview, "held: " + t);
    const page = P.estimateRetailWeightDetail(t, { retailer: store, priceUsd: price }).kg;
    eq(page, r.totalKg, "page vs server: " + t);
  }
  const bands = one(line(FORMER_MISFIRES[0][0], "walmart", 12.33)).totalKg;
  return `resistance bands ${bands} kg (was 121.5)`;
});

await check("$75+ lines keep main's rows: a real pantry cabinet, a grill tool set, a complete skateboard, a play kitchen", () => {
  const cases = [
    ["LauKingdom Triangle Tall Storage Cabinet with 3 Drawers and Floating Shelves, Pantry Organizers and Storage fo", "target", 449.14, W.withBuffer(30, "reasoned")],
    ["ZWILLING BBQ+ 5-pc Stainless Steel Grill Tool Set", "target", 246.77, W.withBuffer(50, "reasoned")],
    ["Toy Machine Templeton Glob Skateboard Complete - 9.00\"", "ccs", 189.67, W.withBuffer(2.5, "reasoned")],
    ["Kids Wooden Play Kitchen con accesorios realistas, pretende cocinar juguete con horno microhondas cafetera sin", "target", 246.77, 21.5],
  ];
  for (const [t, store, price, kg] of cases) {
    eq(one(line(t, store, price)).totalKg, kg, t);
    eq(P.estimateRetailWeightDetail(t, { retailer: store, priceUsd: price }).kg, kg, "page: " + t);
  }
  /* The same skateboard under $75 is still a skateboard: a brand word
     ("Toy Machine") does not knock a 2.5 kg row out. */
  eq(one(line("Toy Machine Fists Skateboard Complete - 8.00\"", "ccs", 70)).totalKg, W.withBuffer(2.5, "reasoned"), "cheap complete");
});

await check("a $90+ baby monitor is not a screen: checkout, the Node estimator and the page agree (2 kg band, not the 7.43 kg monitor row)", () => {
  for (const [t, store, price] of [["Momcozy 5-Inch Dual-mode Smart Baby Monitor-BM04", "momcozy", 252.08],
    ["1080p Full HD Camera for Video Baby Monitor BM03 Black", "momcozy", 119.4],
    ["Smart Baby Monitor System", "nanit", 384.76]]) {
    const r = one(line(t, store, price)).items[0];
    eq(r.weightKg, 2, t); eq(r.source, "department", "source " + t);
    assert(!r.needsReview, "held: " + t);
    eq(estimateWeightDetail(t, { retailer: store, priceUsd: price }).kg, 2, "Node: " + t);
    eq(P.estimateRetailWeightDetail(t, { retailer: store, priceUsd: price }).kg, 2, "page: " + t);
  }
  /* A screen is still a screen, and a $75+ moms line keeps its catalogue stamp as on main. */
  eq(one(line("Dell 27 Inch Monitor S2721H", "target", 199)).totalKg, W.withBuffer(5.5, "reasoned"), "a real monitor");
  eq(one(line("Momcozy 5-Inch Dual-mode Smart Baby Monitor-BM04", "momcozy", 252.08, { specWeightKg: 4 })).totalKg, 4, "$75+ stamp");
  assert(!W.isCatalogPlaceholder(4, "momcozy", "Playard & Smart Baby Monitor BM04 Bundle", { priceUsd: 552.59 }), "$75+ playard keeps 4");
});

await check("Danny's 889 ruling: a cheap inferred line whose freight exceeds its price is NOT held", () => {
  const tyre = one(line("IRC MX IX Kids Tires", "revzilla", 38.26));
  assert(tyre.totalKg * CHARGE_PER_KG > 38.26, "the tyre's freight should exceed its price");
  assert(!tyre.needsReview, "the kids tyre is held");
  const cheap = one(line("CURAD® Performance Series® Infrared Elastic Pull-Over Ankle Support, Large/ X-Large, Powered by CELLIANT®", "walmart", 3.97));
  eq(cheap.items[0].source, "inferred", "source");
  assert(cheap.totalKg * CHARGE_PER_KG > 3.97, "freight should exceed the price");
  assert(!cheap.needsReview, "a $3.97 inferred line is held");
  /* The rule, directly: an inferred estimate quotes; the generic guess
     with the same weight and price (unknown weight) is still held, and an
     out-of-band weight (a misfire) is still held. */
  assert(W.freightQuotable({ kg: 0.6, source: "inferred", reviewKind: "inferred" }, 3, CHARGE_PER_KG).quotable, "inferred held");
  assert(!W.freightQuotable({ kg: 0.6, source: "fallback", reviewKind: "gap" }, 3, CHARGE_PER_KG).quotable, "generic released");
  assert(!W.freightQuotable({ kg: 121.5, needsReview: true }, 30, CHARGE_PER_KG).quotable, "out-of-band released");
  assert(P.freightQuotable(P.estimateRetailWeightDetail("IRC MX IX Kids Tires", { retailer: "revzilla", priceUsd: 38.26 }), 38.26).quotable, "the card holds the tyre");
  /* No price on the line: no inference, the generic and its rule stand. */
  eq(resolveItemWeight({ title: "Zorblax Quantum Widget" }).source, "fallback", "unpriced");
  return `tyre ${tyre.totalKg} kg on $38.26`;
});

const DREAMHOUSE_T = "Barbie Dreamhouse Pool Party Doll House with 75+ pc, 3 Story Slide: Adult Assembly, Fits 12 Inch Dolls";
const DREAMHOUSE_W = "Barbie Dreamhouse Pool Party Doll House and Playset with 75+ Pieces, 45 in, Slide & Puppy Elevator";
await check("the Dreamhouse is still 14.5 kg and the dolls are unchanged", () => {
  eq(one(line(DREAMHOUSE_T, "target", 138.27)).totalKg, 14.5, "Target Dreamhouse");
  eq(one(line(DREAMHOUSE_W, "walmart", 372.5)).totalKg, 14.5, "Walmart Dreamhouse");
  eq(one(line(DREAMHOUSE_T, "target", 60)).totalKg, 14.5, "Dreamhouse at a sale price under $75");
  for (const [t, kg] of [["Barbie Brunette Doll with Logo Print Purple Dress", 0.48], ["Barbie Royal Doll with Brightly Highlighted Hair, Butterfly-Print Skirt and Accessories", 0.48],
    ["Barbie Fashionistas Doll #215 with Blonde Hair", 0.3], ["Marvel Legends Spider-Man Action Figure", 0.3]]) {
    eq(one(line(t, "target", 26.4)).totalKg, kg, t);
    eq(one(line(t, "target", 26.4)).items[0].source, "category", "still a row: " + t);
  }
});

await check("the $75+ band is unchanged: a no-match line at $75+ takes its band top, never inference", () => {
  const t = "Zorblax Quantum Widget Deluxe";
  eq(one(line(t, "target", 120)).totalKg, W.GENERAL_FALLBACK_BAND.bandKg[1], "general band");
  eq(one(line(t, "target", 120)).items[0].source, "department", "source");
  eq(one(line(t, "target", 120, { department: "toys" })).totalKg, 2, "toys band");
  eq(one(line(t, "advanceauto", 120)).totalKg, 5, "auto-parts band");
  eq(one(line(t, "skims", 120)).totalKg, 1, "apparel band");
  eq(W.inferredWeightKg(t, { retailer: "target", priceUsd: 75 }), null, "$75 exactly is not inferred");
  assert(W.inferredWeightKg(t, { retailer: "target", priceUsd: 74.99 }) != null, "$74.99 is");
});

/* Earrings and necklaces are not in this list: the page carries a
   jewellery row (0.12 kg) that the checkout module never had, a
   divergence older than this PR (it was 0.12 against the 0.6 kg generic
   before). Rings fall outside that row, so they stand in for jewellery. */
const PARITY = [...CLUSTERS.map((c) => [c[0], c[1], c[2]]), ...FORMER_MISFIRES.map((c) => [c[0], c[1], c[2]]),
  ["IRC MX IX Kids Tires", "revzilla", 38.26], ["Sterling Silver Stackable Rings Set", "walmart", 9.5],
  ["Organic Muslin Swaddle | Sage Stripe", "kindredbravely", 26.51], ["Zorblax Quantum Widget", "target", 30],
  ["Zorblax Quantum Widget", "unknownstore", 30], [DREAMHOUSE_T, "target", 138.27]];
await check("PDP / checkout / server parity: the page, the Node estimator and the server agree title by title", async () => {
  for (const [t, store, price] of PARITY) {
    for (const p of [price, 120]) {
      const server = resolveItemWeight({ title: t, retailer: store, priceUsd: p });
      const page = P.estimateRetailWeightDetail(t, { retailer: store, priceUsd: p });
      const node = estimateWeightDetail(t, { retailer: store, priceUsd: p });
      eq(page.kg, server.weightKg, `page vs server ($${p}) ${t}`);
      eq(node.kg, server.weightKg, `Node vs server ($${p}) ${t}`);
      eq(page.source, server.source, `page source ($${p}) ${t}`);
      eq(!!page.needsReview, !!server.needsReview, `page hold ($${p}) ${t}`);
    }
  }
  /* The resolve-weight endpoint the product page and checkout call. */
  const { handler } = await import("../../netlify/functions/resolve-weight.js");
  const res = await handler({ httpMethod: "POST", body: JSON.stringify({ items: [line(CLUSTERS[0][0], "walmart", 6.97)] }) });
  const body = JSON.parse(res.body);
  eq(body.totalKg, 0.37, "resolve-weight totalKg");
  eq(body.items[0].inferred, true, "resolve-weight carries the inferred flag");
  return `${PARITY.length} titles x 2 prices`;
});

/* ---------------- browser: product page -> cart -> checkout ---------------- */
let chromium = null;
if (!process.env.WEIGHT_INFERENCE_SKIP_BROWSER) {
  try { ({ chromium } = await import("playwright")); }
  catch { try { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); } catch { chromium = null; } }
}
if (!chromium) {
  console.log("  (browser checks skipped: no Playwright)");
} else {
  console.log("weight inference (#449 pricing): browser");
  const TYPES = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp" };
  const PIXEL = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
  async function fnHandler(name, req, body) {
    if (name === "exchange-rate") return { statusCode: 200, body: JSON.stringify({ compra: 3.72, venta: 3.75, fecha: "2026-10-21" }) };
    if (name === "wallet-get" || name === "cart-save" || name === "cart-get") return { statusCode: 401, body: JSON.stringify({ error: "No autenticado" }) };
    if (name === "founders-status") return { statusCode: 200, body: JSON.stringify({}) };
    if (name === "shipping-quote") {
      const { handler } = await import(join(ROOT, "netlify/functions/shipping-quote.js"));
      const realFetch = globalThis.fetch;
      globalThis.fetch = async (url, init) => {
        const b = JSON.parse(init.body);
        const flete = Math.round(Math.max(1, b.peso_kg) * 9 * 100) / 100;
        const total = Math.round((b.valor_usd + flete) * 100) / 100;
        return new Response(JSON.stringify({ total_usd: total, total_pen: Math.round(total * 3.75 * 100) / 100, flete_usd: flete }), { status: 200 });
      };
      try { return await handler({ httpMethod: req.method, headers: req.headers, body }); }
      finally { globalThis.fetch = realFetch; }
    }
    if (name === "resolve-weight" || name === "search") {
      const { handler } = await import(join(ROOT, "netlify/functions/" + name + ".js"));
      const u = new URL(req.url, "http://x");
      return handler({ httpMethod: req.method, headers: req.headers, body, queryStringParameters: Object.fromEntries(u.searchParams) }, {});
    }
    return { statusCode: 404, body: JSON.stringify({ error: "no function " + name }) };
  }
  const PORT = Number(process.env.WEIGHT_INFERENCE_PORT || 8922);
  const cache = new Map();
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", async () => {
      try {
        const u = new URL(req.url, "http://x");
        const fm = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
        if (fm) {
          const r = await fnHandler(fm[1], req, body);
          res.writeHead(r.statusCode, { "Content-Type": "application/json" });
          return res.end(r.body);
        }
        let p = join(ROOT, decodeURIComponent(u.pathname));
        if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
        if (!existsSync(p)) { res.writeHead(404); return res.end("nf"); }
        if (!cache.has(p)) cache.set(p, readFileSync(p));
        res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
        res.end(cache.get(p));
      } catch (e) { res.writeHead(500); res.end(String(e && e.message)); }
    });
  });
  await new Promise((ok) => server.listen(PORT, "127.0.0.1", ok));
  const BASE = `http://127.0.0.1:${PORT}`;
  const EXE = process.env.PLAYWRIGHT_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
  const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
  async function newPage() {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (u.host === `127.0.0.1:${PORT}`) return route.continue();
      if (route.request().resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
      return route.abort();
    });
    return { context, page: await context.newPage() };
  }
  async function checkout(page) {
    await page.waitForFunction(() => {
      const n = document.getElementById("kgAutoNote");
      const k = document.getElementById("kgInput");
      return n && !n.hidden && k && Number(k.value) > 0;
    }, null, { timeout: 30000 });
    const kg = await page.$eval("#kgInput", (k) => Number(k.value));
    const hold = await page.$eval("#checkoutWeightReviewWrap", (w) => w.textContent.trim()).catch(() => "");
    return { kg, hold };
  }
  async function viaPdp(title, store) {
    const { context, page } = await newPage();
    try {
      await page.goto(`${BASE}/producto.html?producto=${encodeURIComponent(title)}&tienda=${store}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#add-cart-btn", { timeout: 30000 });
      await page.click("#add-cart-btn");
      await page.goto(`${BASE}/checkout.html`, { waitUntil: "domcontentloaded" });
      return await checkout(page);
    } finally { await context.close(); }
  }
  await check("an inferred toy: product page -> cart -> checkout reads the server's 0.37 kg, no hold", async () => {
    const r = await viaPdp(CLUSTERS[0][0], "walmart");
    eq(r.kg, 0.37, "Peso del paquete"); eq(r.hold, "", "hold notice");
  });
  await check("a tyre whose freight exceeds its price: checkout quotes it and does not hold it", async () => {
    const r = await viaPdp("IRC MX IX Kids Tires", "revzilla");
    eq(r.kg, 3, "Peso del paquete"); eq(r.hold, "", "hold notice");
  });
  await check("the cart (app bundle) agrees: the same tyre is not held there either, once the page has its data", async () => {
    const { context, page } = await newPage();
    try {
      await page.goto(`${BASE}/producto.html?producto=${encodeURIComponent("IRC MX IX Kids Tires")}&tienda=revzilla`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#add-cart-btn", { timeout: 30000 });
      await page.click("#add-cart-btn");
      await page.goto(`${BASE}/?carrito=1`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof ACTIVE_INFERRED_WEIGHTS !== "undefined" && ACTIVE_INFERRED_WEIGHTS
        && typeof cart !== "undefined" && cart.length > 0, null, { timeout: 30000 });
      const r = await page.evaluate(() => ({
        held: cartWeightReviewItems().length,
        kg: estimateRetailWeightDetail(cart[0].title, { retailer: cart[0].retailer, priceUsd: cart[0].priceUsd }).kg,
      }));
      eq(r.held, 0, "cart lines held"); eq(r.kg, 3, "the cart's estimate");
    } finally { await context.close(); }
  });
  await browser.close();
  server.close();
}

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

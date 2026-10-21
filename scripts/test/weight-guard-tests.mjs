/* ==================================================================
   #449 FREIGHT GUARD -- LARGE-TOY WEIGHTS + CONSERVATIVE FALL-THROUGH.

   The Barbie Dreamhouse Pool Party (Target) quoted 0.60 kg at checkout:
   no toy row existed, so the title fell to the generic. Its published
   box weight is 14.5 kg. These checks pin the interim guard:

   UNIT (the resolver checkout and orders-create share, and the estimator
   the cards share):
     - the Dreamhouse (Target and Walmart titles) quotes 14.5 kg, quotable;
     - ride-ons, play kitchens, board games, LEGO by count, at their rows;
     - the ~0.3 kg doll class is unchanged (the dolls with a dress keep
       the dress row's 0.48), and a bare fashion doll quotes 0.3;
     - a seeded no-match product at $100+ quotes its band's UPPER end
       (general 2.5 kg; a known department or store its own), never 0.6;
       a no-match product under $75 quotes exactly as on main (the 0.6 kg
       fall-through) and is never held for freight confirmation;
     - the page's mirror (the app bundle) agrees with the module and with
       the server, title by title, with and without store + price.
   BROWSER (if Chromium is available): the Dreamhouse goes product page ->
   cart -> checkout and "Peso del paquete" reads 14.50; a doll reads its
   unchanged weight; a seeded no-match $120 line reads the band's 2.50.

   RUN: node scripts/test/weight-guard-tests.mjs
   Starts its own static server on WEIGHT_GUARD_PORT (default 8993) with
   the functions checkout needs; the exchange rate and courier quote are
   stubbed. WEIGHT_GUARD_SKIP_BROWSER=1 runs the unit checks only.
   ================================================================== */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCartWeights, resolveItemWeight } from "../../netlify/functions/_weight-resolve.js";
import { estimateWeightDetail } from "../lib/sales-sources.js";
import { GENERIC_FALLBACK_KG, departmentFallbackKg, GENERAL_FALLBACK_BAND } from "../lib/item-weight.js";
import { loadPageWeightSlice } from "./_page-script.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let passed = 0, failed = 0;
async function check(name, fn) {
  try { const note = await fn(); passed++; console.log("  ok   " + name + (note ? "  -- " + note : "")); }
  catch (e) { failed++; console.log("  FAIL  " + name + "\n         " + String(e && e.message).split("\n")[0]); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }
const eq = (a, b, msg) => assert(a === b, `${msg}: got ${a}, want ${b}`);

const DREAMHOUSE_T = "Barbie Dreamhouse Pool Party Doll House with 75+ pc, 3 Story Slide: Adult Assembly, Fits 12 Inch Dolls";
const DREAMHOUSE_W = "Barbie Dreamhouse Pool Party Doll House and Playset with 75+ Pieces, 45 in, Slide & Puppy Elevator";
const DOLLS = [
  ["Barbie Brunette Doll with Logo Print Purple Dress", 0.48],
  ["Barbie Royal Doll with Brightly Highlighted Hair, Butterfly-Print Skirt and Accessories", 0.48],
  ["Barbie Royal Doll with Pink and Blonde Hair, Butterfly-Print Skirt and Accessories", 0.48],
];
const line = (title, priceUsd, extra = {}) => ({ title, retailer: "target", priceUsd, qty: 1, weightKg: 0.2, weightEstimated: true, ...extra });
const one = (l) => resolveCartWeights([l]);

console.log("weight guard (#449): unit");

await check("the Dreamhouse (Target) quotes its published 14.5 kg box, quotable", () => {
  const r = one(line(DREAMHOUSE_T, 138.27));
  eq(r.totalKg, 14.5, "totalKg");
  eq(r.items[0].source, "category", "source");
  assert(!r.needsReview, "held for review: " + JSON.stringify(r.reviewItems));
  return `${r.totalKg} kg (was ${GENERIC_FALLBACK_KG})`;
});

await check("the Walmart Dreamhouse title quotes 14.5 kg too (it was 74.25 kg on the swing-set row)", () => {
  const r = one(line(DREAMHOUSE_W, 372.5, { retailer: "walmart" }));
  eq(r.totalKg, 14.5, "totalKg");
  assert(!r.needsReview, "held for review");
});

await check("the doll class quotes unchanged; a bare fashion doll is 0.3 kg", () => {
  for (const [t, kg] of DOLLS) eq(one(line(t, 26.4)).totalKg, kg, t);
  eq(one(line("Barbie Fashionistas Doll #215 with Blonde Hair", 13.3)).totalKg, 0.3, "bare doll");
  eq(one(line("Marvel Legends Spider-Man Action Figure", 33)).totalKg, 0.3, "action figure");
});

await check("toy rows: ride-ons, play kitchen, board game, Little People house, garage, LEGO", () => {
  eq(resolveItemWeight({ title: "Power Wheels Jeep Wrangler 12V Battery-Powered Ride-On" }).weightKg, 27.3, "12V ride-on");
  eq(resolveItemWeight({ title: "Little Tikes Cozy Coupe Ride-On" }).weightKg, 12.7, "Cozy Coupe");
  eq(resolveItemWeight({ title: "KidKraft Uptown Wooden Play Kitchen" }).weightKg, 21.5, "play kitchen");
  eq(resolveItemWeight({ title: "Monopoly Classic Board Game" }).weightKg, 1, "board game");
  eq(resolveItemWeight({ title: "Fisher-Price Little People Barbie Little Dreamhouse Interactive Playset" }).weightKg, 4, "Little People house");
  eq(resolveItemWeight({ title: "Hot Wheels City Ultimate Garage Playset" }).weightKg, 8.4, "garage");
  eq(resolveItemWeight({ title: "LEGO Star Wars AT-AT 75313 Building Kit (6,785 Pieces)" }).weightKg, 13.09, "LEGO by count");
  const falcon = resolveItemWeight({ title: "LEGO Star Wars Millennium Falcon 75192", priceUsd: 1131 }).weightKg;
  assert(falcon >= 13 && falcon <= 15, "LEGO by price: " + falcon);
});

await check("small dollhouse craft kits and pet sets do not take the 14.5 kg row", () => {
  for (const t of ["Robotime DIY Miniature Dollhouse Kit for Adults 266 Pieces", "Barbie Pets Dreamhouse Playset: Animal Figure Doll Set",
    "Replacement Labels for Collectible Fisher-Price Little People Barbie Dreamhouse Family Dollhouse Playset HCF61"]) {
    assert(resolveItemWeight({ title: t }).weightKg < 14.5, t);
  }
});

await check("a dollhouse is judged as a toy, not as a projector or a backyard playhouse, and is not held", () => {
  for (const t of ["Kid Connection Doll House Playset with Light Projector & Sound, 28 Pieces",
    "Huge Doll House - 143 PCS Large Dollhouse with Full-Plastic, 7 Rooms Playhouse with Furniture"]) {
    const r = one(line(t, 33, { retailer: "walmart" }));
    eq(r.totalKg, 14.5, t);
    assert(!r.needsReview, "held: " + t);
  }
});

await check("an outdoor playhouse that lists Toys among its parts keeps its swing-set-class weight", () => {
  const t = "EROMMY Wooden Playhouse For Kids Outdoor, Cottage Play House With Door, Windows, Fence, Bench, Service Station, Blackboard, Toys, For Kids 3-8 Years";
  assert(resolveItemWeight({ title: t }).weightKg >= 50, "playhouse lost its row");
});

await check("a seeded no-match product at $100+ quotes its band's UPPER end, never 0.6 kg", () => {
  const t = "Zorblax Quantum Widget Deluxe";
  const r = one(line(t, 120));
  eq(r.totalKg, GENERAL_FALLBACK_BAND.bandKg[1], "general band upper");
  eq(r.items[0].source, "department", "source");
  assert(!r.needsReview, "a $120 line at 2.5 kg must stay quotable");
  eq(one(line(t, 120, { department: "toys" })).totalKg, 2, "toys band upper");
  eq(one(line(t, 120, { retailer: "advanceauto" })).totalKg, 5, "auto-parts store band upper");
  eq(one(line(t, 120, { retailer: "skims" })).totalKg, 1, "apparel store band upper");
  eq(one(line("Squishy Galaxy Toy", 120)).totalKg, 2, "a $120 toy title with no row: toys band");
  return `$120 no-match -> ${r.totalKg} kg`;
});

/* Danny's ruling (#443, 2026-10-19 21:44 EDT): under $75 the existing
   fall-through stands, so the guard creates no new freight-confirm holds. */
await check("a no-match $30 product quotes as on main (the 0.6 kg fall-through) and is NOT held", () => {
  for (const extra of [{}, { retailer: "advanceauto" }, { retailer: "skims" }, { department: "toys" }]) {
    const r = one(line("Zorblax Quantum Widget", 30, extra));
    eq(r.totalKg, GENERIC_FALLBACK_KG, "totalKg " + JSON.stringify(extra));
    eq(r.items[0].source, "fallback", "source " + JSON.stringify(extra));
    assert(!r.needsReview, "held for review " + JSON.stringify(extra));
  }
  eq(one(line("Squishy Galaxy Toy", 12)).totalKg, GENERIC_FALLBACK_KG, "a cheap toy title with no row");
  eq(departmentFallbackKg("Zorblax Quantum Widget", { priceUsd: 74.99 }), null, "$74.99");
  eq(departmentFallbackKg("Zorblax Quantum Widget", { retailer: "advanceauto" }), null, "no price");
  assert(departmentFallbackKg("Zorblax Quantum Widget", { priceUsd: 75 }) != null, "$75 exactly takes the band");
});

await check("no band quote is ever held: at $75+ the largest band top's freight is below the price", () => {
  for (const retailer of ["advanceauto", "target", "sephora", "partycity"]) {
    assert(!one(line("Zorblax Quantum Widget", 75, { retailer })).needsReview, "held at $75 (" + retailer + ")");
  }
});

await check("the Ofertas estimator agrees: the band is a gap (flagged), the toy rows are not", () => {
  const d = estimateWeightDetail("Zorblax Quantum Widget", { priceUsd: 120 });
  eq(d.source, "department", "source"); assert(d.flagged && d.reviewKind === "gap", "not a gap");
  const h = estimateWeightDetail(DREAMHOUSE_T);
  eq(h.kg, 14.5, "Dreamhouse"); assert(!h.flagged, "Dreamhouse flagged");
});

const P = loadPageWeightSlice();
const PARITY = [DREAMHOUSE_T, DREAMHOUSE_W, ...DOLLS.map((d) => d[0]), "Barbie Fashionistas Doll #215",
  "Power Wheels Jeep Wrangler 12V Battery-Powered Ride-On", "Little Tikes Cozy Coupe Ride-On", "KidKraft Uptown Wooden Play Kitchen",
  "Monopoly Classic Board Game", "Hot Wheels City Ultimate Garage Playset", "LEGO Star Wars AT-AT 75313 Building Kit (6,785 Pieces)",
  "LEGO Star Wars Millennium Falcon 75192", "Squishy Galaxy Toy", "Zorblax Quantum Widget", "Robotime DIY Miniature Dollhouse Kit",
  "Backyard Discovery Cedar Swing Set", "Calico Critters Red Roof Country Home - Secret Attic Playroom, Dollhouse Playset"];
await check("the app bundle's estimator agrees with the module and the server, title by title", () => {
  for (const t of PARITY) {
    eq(P.estimateRetailWeightDetail(t, {}).kg, estimateWeightDetail(t, {}).kg, "page vs module: " + t);
    for (const [retailer, priceUsd] of [["target", 120], ["target", 20], ["advanceauto", 120], ["walmart", 1131]]) {
      eq(P.estimateRetailWeightDetail(t, { retailer, priceUsd }).kg, resolveItemWeight({ title: t, retailer, priceUsd }).weightKg,
        `page vs server (${retailer}, $${priceUsd}): ${t}`);
    }
  }
  return `${PARITY.length} titles x 5 hint sets`;
});

/* ---------------- browser: product page -> cart -> checkout ---------------- */
let chromium = null;
if (!process.env.WEIGHT_GUARD_SKIP_BROWSER) {
  try { ({ chromium } = await import("playwright")); }
  catch { try { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); } catch { chromium = null; } }
}
if (!chromium) {
  console.log("  (browser checks skipped: no Playwright)");
} else {
  console.log("weight guard (#449): browser");
  const TYPES = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp" };
  const PIXEL = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
  async function fnHandler(name, req, body) {
    if (name === "exchange-rate") return { statusCode: 200, body: JSON.stringify({ compra: 3.72, venta: 3.75, fecha: "2026-10-20" }) };
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
  const PORT = Number(process.env.WEIGHT_GUARD_PORT || 8993);
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
  /* The kg field once the SERVER's answer is in (the note appears only then). */
  async function checkoutKg(page) {
    await page.waitForFunction(() => {
      const n = document.getElementById("kgAutoNote");
      const k = document.getElementById("kgInput");
      return n && !n.hidden && k && Number(k.value) > 0;
    }, null, { timeout: 30000 });
    return page.$eval("#kgInput", (k) => Number(k.value));
  }
  async function viaPdp(title, store) {
    const { context, page } = await newPage();
    try {
      await page.goto(`${BASE}/producto.html?producto=${encodeURIComponent(title)}&tienda=${store}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#add-cart-btn", { timeout: 30000 });
      await page.click("#add-cart-btn");
      await page.goto(`${BASE}/checkout.html`, { waitUntil: "domcontentloaded" });
      return await checkoutKg(page);
    } finally { await context.close(); }
  }
  /* Walmart's records: Target is off sale since #443 (/off-sale.js). */
  await check("the Dreamhouse: product page -> cart -> checkout reads 14.50 kg", async () => {
    eq(await viaPdp(DREAMHOUSE_W, "walmart"), 14.5, "Peso del paquete");
  });
  await check("a doll: product page -> cart -> checkout reads its unchanged 0.48 kg", async () => {
    eq(await viaPdp(DOLLS[2][0], "walmart"), 0.48, "Peso del paquete");
  });
  await check("a seeded no-match $120 line: checkout reads the general band's 2.50 kg, not 0.60", async () => {
    const { context, page } = await newPage();
    try {
      await page.goto(`${BASE}/terminos.html`, { waitUntil: "domcontentloaded" });
      await page.evaluate((l) => localStorage.setItem("aria_cart_v1", JSON.stringify([l])),
        line("Zorblax Quantum Widget Deluxe", 120, { image: "", brand: "" }));
      await page.goto(`${BASE}/checkout.html`, { waitUntil: "domcontentloaded" });
      eq(await checkoutKg(page), 2.5, "Peso del paquete");
    } finally { await context.close(); }
  });
  await browser.close();
  server.close();
}

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

/* ==================================================================
   NO WEIGHT THE DATA DOESN'T HOLD (#443, 2026-10-26: Danny's Keter
   bar cart, US$463, "Peso para el flete: 1 kg estimado"; the ruling:
   a product with no weight gets a padded estimate from SIMILAR
   products, never a constant).

   These hold:
     - the resolver answers a product the rules cannot place with its
       similar products, recorded and padded up -- the same answer for
       the product page, checkout, orders-create and search;
     - a product with no rule and no comparable is never quoted on a
       constant: held "por confirmar" (ARIA_NO_WEIGHT_POLICY=hold, the
       default) -- the Keter among them;
     - the comparables matcher wants the same class AND the same
       ballpark size (price), and its class tier only trusts soft goods;
     - the product page shows the catalogue's own weight (a published
       figure says so), the similar-products estimate as such, and
       "Por confirmar" instead of any constant; checkout gets the same
       figures in the cart line.

     node scripts/test/pdp-weight-truth-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
process.chdir(ROOT);
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.stack || e.message}`); console.log("    FAIL " + name); }
}

const W = await import(ROOT + "scripts/lib/weight-comparables.mjs");
const R = await import(ROOT + "netlify/functions/_weight-resolve.js");
const TABLE = JSON.parse(readFileSync(ROOT + "assets/data/weight-comparables.json", "utf8")).estimates;
const KETER = { title: "Keter Extendable Resin Outdoor Party Table Bar Cart, Pine", retailer: "samsclub", priceUsd: 463.05, weightKg: 0.2, weightEstimated: true, qty: 1 };
const one = (line) => R.resolveCartWeights([line]).items[0];

await check("the Keter bar cart is never quoted on a constant: held, por confirmar", () => {
  const r = one(KETER);
  assert.equal(r.needsReview, true);
  assert.equal(r.reviewKind, "no-weight");
  assert.match(r.reviewReason, /por confirmar/);
  assert.equal(R.resolveCartWeights([KETER]).needsReview, true, "checkout would quote it");
  /* the old ceiling only under the explicit switch */
  process.env.ARIA_NO_WEIGHT_POLICY = "ceiling";
  try { assert.equal(one(KETER).needsReview, false); } finally { delete process.env.ARIA_NO_WEIGHT_POLICY; }
});

await check("a product no rule can place is weighed from its similar products, padded up and recorded", () => {
  const r = one({ title: "SunVilla Sara 5-piece Outdoor Patio Seating Set", retailer: "costco", priceUsd: 1499.99, qty: 1 });
  assert.equal(r.source, "comparables");
  assert.ok(r.weightKg > 50, "a patio set at " + r.weightKg + " kg");
  assert.ok(r.comparables.length >= 2);
  assert.equal(r.comparablePad, W.COMPARABLE_PAD);
  assert.ok(Math.abs(r.weightKg - Math.round(r.comparableBaseKg * W.COMPARABLE_PAD * 100) / 100) < 0.011, "the pad is not applied");
  for (const c of r.comparables) assert.equal(c.length, 5, "a comparable is [store, title, kg, score, price]");
});

await check("every stored estimate is auditable: at least two comparables, the base and the pad", () => {
  const entries = Object.entries(TABLE);
  assert.ok(entries.length > 3000, "the table lost its estimates");
  for (const [k, c] of entries) {
    assert.match(k, /^[a-z0-9]+::/);
    if (c.method === "web") {
      /* a web-pass weight: the found kg, the 1.10 pad, the source type and the harvest row it came from */
      assert.equal(c.pad, 1.1, k);
      assert.ok(Math.abs(c.kg - c.baseKg * 1.1) < 0.002, k);
      assert.ok(["retailer", "manufacturer", "other"].includes(c.src) && c.id, k);
      assert.ok(!JSON.stringify(c).includes("http"), "a source URL is served: " + k);
      continue;
    }
    assert.ok(c.comps.length >= 2 && c.comps.length <= W.MAX_COMPARABLES, k);
    assert.ok(Math.abs(c.kg - Math.round(c.baseKg * c.pad * 100) / 100) < 0.011, k);
  }
});

await check("the web pass (#443 c.6420102856): a product with no comparable takes its published weight x1.10, sourced; Miu Miu's inferred units are held", async () => {
  const B = await import(ROOT + "scripts/build-weight-comparables.mjs");
  const web = Object.entries(TABLE).filter(([, c]) => c.method === "web");
  assert.ok(web.length > 1200, "the web pass is missing: " + web.length);
  assert.ok(!web.some(([k]) => k.startsWith("miumiu::")), "a held Miu Miu row is served");
  const r = one({ title: "Libec HS-250MQ Quick Lock Tripod System with H25 Head, Mid-Level Spreader, Rubber Feet & Case", retailer: "bhphoto", priceUsd: 1439, qty: 1 });
  assert.equal(r.source, "web");
  assert.equal(r.webFoundKg, 5.9);
  assert.equal(r.weightKg, 6.49);
  assert.equal(r.webPad, 1.1);
  assert.match(r.reviewReason || r.basis || "", /peso publicado/);
  /* the CSV (with its URLs) stays in hidden-docs, which the site never serves */
  assert.ok(B.loadWebWeights(ROOT).size >= 1280);
  assert.match(readFileSync(ROOT + "netlify.toml", "utf8"), /from = "\/hidden-docs\/\*"/);
});

await check("same class AND same ballpark size: two shared words, a price within 2x; class tier for soft goods only", () => {
  const pool = [
    { retailer: "a", title: "Area Rug 2x3 Vintage Floral", kg: 1, price: 25 },
    { retailer: "a", title: "Area Rug 2x3 Vintage Blue", kg: 1, price: 30 },
    { retailer: "b", title: "Area Rug 8x10 Vintage Floral", kg: 14, price: 300 },
    { retailer: "b", title: "Area Rug 8x10 Vintage Grey", kg: 16, price: 280 },
    { retailer: "c", title: "Orchid Bag Charm", kg: 0.07, price: 39 },
    { retailer: "c", title: "Orchid Bag Charm Pink", kg: 0.07, price: 39 },
    ...[...Array(6)].map((_, i) => ({ retailer: "d", title: "Sara Pointed Pumps " + i, kg: 0.7, price: 120 })),
    ...[...Array(6)].map((_, i) => ({ retailer: "d", title: "Studded Leather Flats " + i, kg: 0.6, price: 200 })),
    /* a pool is large: no class word is in a quarter of it */
    ...[...Array(40)].map((_, i) => ({ retailer: "e", title: "Filler Product Number " + i + " Widget", kg: 0.3, price: 20 })),
  ];
  const idx = W.buildIndex(pool), tails = W.buildClassIndex(idx);
  const big = W.comparablesFor(idx, "Vintage Floral Area Rug 8x10 Living Room", { price: 290 });
  assert.ok(big && big.baseKg >= 14, "an 8x10 rug weighed like a 2x3: " + JSON.stringify(big));
  assert.equal(W.comparablesFor(idx, "White Orchid Candle", { price: 75 }), null, "one shared word made a comparable");
  assert.equal(W.classComparablesFor(idx, tails, "Spectra S1 Double Electric Breast Pump", { price: 200 }), null, "a breast pump weighed like a shoe");
  const flats = W.classComparablesFor(idx, tails, "Black Studded Leather Flats", { price: 250 });
  assert.ok(flats && /class:flat/.test(flats.method));
});

/* ---------------- the product page ---------------- */
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { handler: resolveWeight } = await import(ROOT + "netlify/functions/resolve-weight.js");
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const lines = [];
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/.netlify/functions/resolve-weight") {
    let body = "";
    for await (const c of req) body += c;
    lines.push(JSON.parse(body).items[0]);
    const o = await resolveWeight({ httpMethod: "POST", body });
    res.writeHead(o.statusCode, { "Content-Type": "application/json" });
    res.end(o.body);
    return;
  }
  let p = join(ROOT, decodeURIComponent(u.pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
async function weightRow(name, store) {
  const pg = await ctx.newPage();
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await pg.goto(`${BASE}/producto.html?producto=${encodeURIComponent(name)}&tienda=${store}`, { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => { const e = document.getElementById("p-weight-kg"); return e && !/calculando/.test(e.textContent); }, null, { timeout: 20000 });
  const out = await pg.evaluate(() => ({ weight: document.getElementById("p-weight-kg").textContent, tax: (document.getElementById("p-tax-amt") || {}).textContent || "" }));
  await pg.close();
  return out;
}

/* The Keter's own page went with Sam's Club (#443 c.6468346931); a live
   product the resolver holds the same way stands in for it. */
await check("product page: a held product says 'Por confirmar', no weight, no freight math", async () => {
  const o = await weightRow("Sterilite 80-Qt Clear Plastic Stackable Storage Bin w/ Gasket Latch Lid, 12 Pack", "walmart");
  assert.match(o.weight, /^Por confirmar/);
  assert.doesNotMatch(o.weight, /\d\s*kg/);
  assert.doesNotMatch(o.tax, /S\/|US\$/, "a tax built on a weight nobody knows");
});

await check("product page: a similar-products estimate says so; a store's published weight says so and reaches the resolver", async () => {
  const a = await weightRow("Black Tower SL Outershirt", "ssense");
  assert.match(a.weight, /^1\.32 kg/);
  assert.match(a.weight, /estimado por productos similares/);
  lines.length = 0;
  const b = await weightRow("Painted Brake Rotor: Meets or Exceeds OE Specs, Features RotorShield (YH716453P)", "advanceauto");
  assert.match(b.weight, /^9\.42 kg/);
  assert.match(b.weight, /publicado por la tienda/);
  assert.equal(lines[0].weightKg, 9.42);
  assert.equal(lines[0].weightEstimated, false, "the published weight left the page as an estimate");
});

await check("product page: a web-pass weight says so", async () => {
  const o = await weightRow("Libec HS-250MQ Quick Lock Tripod System with H25 Head, Mid-Level Spreader, Rubber Feet & Case", "bhphoto");
  assert.match(o.weight, /^6\.49 kg/);
  assert.match(o.weight, /estimado con el peso publicado/);
});

await check("the cart line from the product page carries the catalogue's weight, not a flat 0.2 kg", () => {
  const page = readFileSync(ROOT + "producto.html", "utf8");
  assert.doesNotMatch(page, /\n\s*weightKg: 0\.2,\r?\n/, "the flat 0.2 kg cart weight is back");
  assert.match(page, /weightKg: weightLineOf\(p, priceUsd(?:, size)?\)\.weightKg/);
  const toml = readFileSync(ROOT + "netlify.toml", "utf8");
  for (const fn of ["resolve-weight", "orders-create", "search"]) {
    const block = toml.split(`[functions."${fn}"]`)[1] || "";
    assert.match(block.split("[")[0] + block.split("\n").slice(0, 3).join("\n"), /assets\/data\/weight-comparables\.json/, fn + " does not ship the table");
  }
});

await browser.close();
server.close();
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

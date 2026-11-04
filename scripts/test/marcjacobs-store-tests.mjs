#!/usr/bin/env node
/* ==================================================================
   THE MARC JACOBS STORE (#443 c.6643310622, amended c.6643334129).

   Three things hold, with the synthetic fixture under
   scripts/test/fixtures/marcjacobs/ (made-up names, prices, sizes and
   .test links -- never shipped):

   INGEST    scripts/ingest-marcjacobs.mjs reads the three accepted drop
             shapes (our pull row, Shopify /products.json, a JSON-LD
             Product list) into marcjacobs-catalog.json: aisles from the
             store's own type, sizes only from the pull (in stock in
             `sizes`, sold out in `sizesOut`, none = sizesPending), raw USD
             (the 7% Miami tax applied on the page, like every non-exempt
             store), beauty / out of stock / no photo / no category left
             out and counted, weights estimated, and the store gate opened.
   HIDDEN    while the committed catalogue is the empty envelope, the
             store is registered everywhere and shows nowhere: no door, no
             Tiendas tile, no menu entry, no search row, no storefront
             folder; the gate line agrees with the catalogue; the same
             tile shows the moment the gate opens.
   OFFICIAL  the Comparador puts the official store in the chart: one row
             per store, the official one beside the retailers that carry
             the same model, the best price wins (the official store when
             it is cheaper, a retailer when it is), one headline price per
             row, no rolled-up total, «Mejor costo hasta Miami» applied.

     node scripts/test/marcjacobs-store-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import vm from "node:vm";

const ROOT = new URL("../../", import.meta.url).pathname;
process.chdir(ROOT);
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const FIX = join(ROOT, "scripts/test/fixtures/marcjacobs");

const { ingest, readDrop, buildCatalogue } = await import("../ingest-marcjacobs.mjs");
const MJ = await import("../lib/marcjacobs.js");
const MATCH = await import("../lib/marcjacobs-match.js");
const GATE = await import("../lib/store-gate.mjs");
const OFF = await import("../lib/off-sale.js");
const { RETAILERS, activeRetailers, storeDoorFor } = await import("../lib/retailers.js");
const { SLICED_STORES } = await import("../build-store-slices.mjs");
const { storeDoors } = await import("../build-store-doors.mjs");
const { CATALOG_FILES, INDEX_FIELDS, INDEX_PATH, productId } = await import("../build-search-index.mjs");
const SHIP = await import("../lib/store-shipping.js");
const core = await import("../../netlify/functions/_search-core.js");
const { tieredMarginUsd } = await import("../lib/sales-sources.js");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const r2 = (n) => Math.round(Number(n) * 100) / 100;

/* ---------- INGEST ---------- */
console.log("\n  ingest (synthetic fixture)");
const tmp = mkdtempSync(join(tmpdir(), "mj-ingest-"));
copyFileSync(join(ROOT, "off-sale.js"), join(tmp, "off-sale.js"));
mkdirSync(join(tmp, "scripts/lib"), { recursive: true });
copyFileSync(join(ROOT, "scripts/lib/sizes-pending-data.js"), join(tmp, "scripts/lib/sizes-pending-data.js"));
mkdirSync(join(tmp, "reports"));
const { report, gate } = ingest({ drop: join(FIX, "drop"), root: tmp, descriptions: false });
const cat = JSON.parse(readFileSync(join(tmp, "marcjacobs-catalog.json"), "utf8"));
const deps = cat.retailers.marcjacobs.departments;
const items = Object.values(deps).flatMap((d) => d.items);
const byName = (n) => items.find((it) => it.name === n || it.name.startsWith(n + " - "));

await check("the three drop shapes are recognised, one file each", () => {
  const shapes = Object.fromEntries(readDrop(join(FIX, "drop")).map(({ file, json }) => [file.split("/").pop(), MJ.dropShape(json)]));
  assert.deepEqual(shapes, { "jsonld.json": "jsonld", "pull.json": "pull", "shopify-products.json": "shopify" });
  assert.throws(() => buildCatalogue([{ file: "x.json", json: { nothing: 1 } }]), /not an accepted drop shape/);
});
await check("kept by aisle, from the store's own type; the rest left out and counted, never guessed", () => {
  assert.equal(report.rawRows, 12);
  assert.deepEqual(report.byAisle, { bolsos: 3, zapatos: 2, ropa: 1, accesorios: 1 });
  assert.equal(cat.declaredProductCount, 7);
  assert.deepEqual(Object.keys(deps), ["bolsos", "zapatos", "ropa", "accesorios"]);
  assert.deepEqual(Object.keys(report.skipped).sort(), [
    "beauty or fragrance (out of scope: sold through Sephora, Ulta, Macy's, Aria Perfumes)",
    "every size out of stock", "no category", "no photo", "out of stock"]);
  assert.ok(deps.accesorios.items.some((it) => /Bag Charm/.test(it.name)), "a bag charm is an accessory, not a bag");
  assert.ok(!items.some((it) => /Daisy|Gift Card|Sold Out|No Photo|Gone Boot/.test(it.name)));
});
await check("sizes only from the pull: in stock in sizes, sold out in sizesOut, none = sizesPending", () => {
  const runner = byName("The Fixture 400 Runner Sneaker");
  assert.deepEqual(runner.sizes, ["36", "37", "38"]);
  assert.deepEqual(runner.sizesOut, ["39", "40"]);
  assert.ok(!runner.sizesPending);
  const boot = byName("The Fixture Ankle Boot");
  assert.deepEqual(boot.sizes, ["36", "38"], "Shopify: a size is in stock when a variant of it is available");
  assert.deepEqual(boot.sizesOut, ["37"]);
  const tee = byName("The Fixture Logo T-Shirt");
  assert.equal(tee.sizesPending, true);
  assert.ok(!tee.sizes && !tee.sizesOut, "no size is made up");
  assert.ok(!byName("The Fixture Snapshot").sizesPending, "a bag is not sold in sizes");
  const list = JSON.parse(/export const SIZES_PENDING = (\[[\s\S]*?\]);/.exec(readFileSync(join(tmp, "scripts/lib/sizes-pending-data.js"), "utf8"))[1]);
  assert.ok(list.includes("marcjacobs::the fixture logo t-shirt"), "the shown-not-sold list carries the tee");
  assert.ok(list.some((k) => k.startsWith("snipes::")), "every other store's entries stay");
});
await check("prices: raw USD, a was-price only where the drop strikes one through; the page adds margin and the 7% Miami tax", () => {
  const tote = byName("The Fixture Leather Medium Tote Bag");
  assert.equal(tote.name, "The Fixture Leather Medium Tote Bag - Black", "the pull's colour joins the name");
  assert.equal(tote.price, 495);
  assert.equal(tote.originalPrice, 550);
  assert.equal(tote.onSale, true);
  assert.equal(byName("The Fixture Ankle Boot").originalPrice, 800, "Shopify compare_at_price");
  assert.equal(byName("The Fixture Snapshot").onSale, false);
  assert.equal(byName("The Fixture Medium Tote Bag").price, 285, "JSON-LD offer price");
  /* The tax rule every store's price carries: not exempt -> x1.07. */
  for (const page of ["tienda.html", "producto.html", "departamento.html", "marca.html", "netlify/functions/_search-core.js"]) {
    const src = read(page);
    const decl = /var TAX_EXEMPT = (\{[^}]*\});/.exec(src);
    const fn = /function salesTaxRate\(retailer\)\{[^\n]*\}/.exec(src);
    assert.ok(decl && fn, page + ": no TAX_EXEMPT / salesTaxRate");
    assert.equal(vm.runInNewContext("var TAX_EXEMPT = " + decl[1] + ";\n" + fn[0] + "\nsalesTaxRate('marcjacobs')"), 1.07, page);
  }
  const bundleSrc = read(/src="\/?(build\/app-[0-9a-f]{16}\.js)"/.exec(read("index.html"))[1]);
  assert.doesNotMatch(bundleSrc, /\bmarcjacobs:\s*'exempt'/, "the bundle exempts Marc Jacobs");
  assert.match(bundleSrc, /return s === 'exempt' \? 1\.0 : SALES_TAX_RATE;/, "unlisted stores pay SALES_TAX_RATE");
  assert.equal(SHIP.SHIPPING_SALES_TAX_EXEMPT.marcjacobs, undefined, "store-shipping.js taxes it at 1.07");
});
await check("weights estimated (flagged) and the catalogue carries the store's links and photos", () => {
  for (const it of items) {
    assert.ok(it.weightKg > 0 && it.weightEstimated === true, it.name + " has no estimated weight");
    assert.match(it.url, /^https:\/\//);
    assert.match(it.image, /^https:\/\//);
    assert.equal(it.retailer, "marcjacobs");
    assert.equal(it.brand, "Marc Jacobs");
  }
});
await check("the drop opens the store gate; an empty catalogue closes it again", () => {
  assert.deepEqual(gate.awaiting, []);
  assert.equal(report.gate.live, true);
  assert.match(readFileSync(join(tmp, "off-sale.js"), "utf8"), /var AWAITING_CATALOG = \[\];/);
  writeFileSync(join(tmp, "marcjacobs-catalog.json"), read("marcjacobs-catalog.json"));
  const back = GATE.syncStoreGate(tmp);
  assert.equal(back.changed, true);
  assert.deepEqual(back.awaiting, ["marcjacobs"]);
  assert.match(readFileSync(join(tmp, "off-sale.js"), "utf8"), /var AWAITING_CATALOG = \['marcjacobs'\];/);
  writeFileSync(join(tmp, "marcjacobs-catalog.json"), JSON.stringify(cat));
});

/* ---------- HIDDEN WHILE EMPTY ---------- */
console.log("\n  hidden while the catalogue is empty");
const committed = GATE.catalogueCount(ROOT, "marcjacobs-catalog.json");
await check("the committed catalogue is the empty envelope, and the gate line agrees with it", () => {
  const env = JSON.parse(read("marcjacobs-catalog.json"));
  assert.deepEqual(Object.keys(env.retailers), ["marcjacobs"]);
  const sync = GATE.syncStoreGate(ROOT, { check: true });
  assert.equal(sync.changed, false, "off-sale.js AWAITING_CATALOG is stale: run node scripts/build-store-slices.mjs");
  assert.deepEqual(GATE.gateLine(ROOT), sync.awaiting);
  if (committed === 0) {
    assert.deepEqual(sync.awaiting, ["marcjacobs"]);
    assert.equal(OFF.isOffSaleRetailer("marcjacobs"), true);
    assert.equal(OFF.isAwaitingCatalog("marcjacobs"), true);
    assert.ok(!OFF.OFF_SALE_RETAILERS.includes("marcjacobs"), "awaiting is not off sale: it is not on the off-sale list");
  }
});
await check("registered everywhere: registry, store page, slices, shipping (free UPS Ground over $50), search, bundle", () => {
  assert.equal(RETAILERS.marcjacobs.label, "Marc Jacobs");
  assert.equal(RETAILERS.marcjacobs.logo, null, "no Marc Jacobs logo file exists: the wordmark fallback");
  const stores = JSON.parse(/\nvar STORES = (\{.*\});\r?\n/.exec(read("tienda.html"))[1]);
  assert.deepEqual(stores.marcjacobs.files, ["/marcjacobs-catalog.json"]);
  assert.equal(stores.marcjacobs.logo, null);
  assert.deepEqual(SLICED_STORES.marcjacobs.DEPT_ORDER, ["bolsos", "zapatos", "ropa", "accesorios"]);
  const rule = SHIP.shippingRuleOf("marcjacobs");
  assert.equal(rule.freeOverUsd, 50);
  assert.equal(rule.feeUsd, null, "no under-$50 fee is sourced: the store calculates it");
  assert.match(rule.basis, /UPS Ground/);
  assert.equal(SHIP.shippingRuleText("marcjacobs"), "Envío gratis desde $50 · debajo de ese monto lo calcula la tienda al pagar");
  assert.ok(CATALOG_FILES.includes("marcjacobs-catalog.json"));
  const bundle = read(/src="\/?(build\/app-[0-9a-f]{16}\.js)"/.exec(read("index.html"))[1]);
  assert.match(/const TIENDAS_STRIP = \[([\s\S]*?)\n\];/.exec(bundle.replace(/\r\n/g, "\n"))[1], /\{k:'marcjacobs',l:'Marc Jacobs',c:'#000000',logo:null\}/);
  assert.match(bundle, /marcjacobs:\s+\{ key: 'marcjacobs',/);
  assert.match(bundle, /const SIZES_PENDING_STORES = \[[^\]]*'marcjacobs'/);
  assert.match(bundle, /TIENDAS_STRIP\.filter\(s => !isOffSaleRetailer\(s\.k\)/, "the strip drops off-sale (and awaiting) tiles");
  assert.equal(MJ.MJ_BANNER.logo, null);
  assert.equal(MJ.MJ_BANNER.page, "/tienda.html?tienda=marcjacobs");
});
if (committed === 0) {
  await check("shows nowhere: no door, no grid card, no storefront folder, no menu entry, no search row, no active store", () => {
    assert.ok(!storeDoors(ROOT).keys.includes("marcjacobs"), "a store door");
    for (const f of ["search.html", "marca.html"]) assert.doesNotMatch(/var STORE_PAGES = "([^"]*)";/.exec(read(f))[1], / marcjacobs /, f);
    assert.doesNotMatch(read("tiendas.html"), /tienda=marcjacobs/, "an all-stores card");
    assert.ok(!existsSync(join(ROOT, "assets/tienda/marcjacobs")), "a storefront folder");
    assert.ok(!existsSync(join(ROOT, "assets/tienda/_fn/marcjacobs.json")), "an endpoint file");
    assert.doesNotMatch(read("assets/js/nav-menu.js"), /marcjacobs/, "the header menu");
    const idx = JSON.parse(read(INDEX_PATH));
    const R = idx.fields.indexOf("retailer");
    assert.ok(!idx.rows.some((r) => r[R] === "marcjacobs"), "a search row");
    assert.ok(!("marcjacobs" in (idx.stores || {})), "the search store table");
    assert.ok(!activeRetailers().some((r) => r.key === "marcjacobs"), "an active retailer");
    assert.equal(storeDoorFor("marcjacobs"), null);
    assert.match(read("tienda.html"), /if \(window\.AriaOffSale\) Object\.keys\(STORES\)\.forEach\(function\(k\)\{ if \(window\.AriaOffSale\.isOffSaleRetailer\(k\)\) delete STORES\[k\]; \}\);/,
      "tienda.html drops a gated store from its registry at load");
  });
}
await check("the bundle's Tiendas strip, run on the gate: no tile while awaiting, the tile the moment the gate opens", () => {
  const bundle = read(/src="\/?(build\/app-[0-9a-f]{16}\.js)"/.exec(read("index.html"))[1]).replace(/\r\n/g, "\n");
  const strip = "[" + /const TIENDAS_STRIP = \[([\s\S]*?)\n\];/.exec(bundle)[1] + "]";
  const tiles = (gateLine) => {
    const ctx = { globalThis: null };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(read("off-sale.js").replace(/var AWAITING_CATALOG = \[[^\]]*\];/, gateLine), ctx);
    return vm.runInContext("(" + strip + ").filter(function(s){ return !globalThis.AriaOffSale.isOffSaleRetailer(s.k); }).map(function(s){ return s.k; })", ctx);
  };
  assert.ok(!tiles("var AWAITING_CATALOG = ['marcjacobs'];").includes("marcjacobs"));
  assert.ok(tiles("var AWAITING_CATALOG = [];").includes("marcjacobs"));
});

/* ---------- THE COMPARADOR'S OFFICIAL ROW ---------- */
console.log("\n  the Comparador's official row (fixture)");
const row = (o) => INDEX_FIELDS.map((f) => ({
  id: productId(o.retailer, o.url, o.title), title: o.title, brand: o.brand, price: o.price, originalPrice: o.originalPrice || 0,
  onSale: o.onSale ? 1 : 0, department: o.department || "", retailer: o.retailer, finalPrice: 0, image: o.image, cat: "", reviews: 0, rating: 0, ph: 1,
})[f]);
const rows = [];
for (const [dk, d] of Object.entries(deps)) for (const it of d.items) rows.push(row({ ...it, title: it.name, department: dk }));
for (const r of JSON.parse(readFileSync(join(FIX, "retailer-rows.json"), "utf8")).rows) rows.push(row({ ...r, url: r.image }));
const ctx = core.buildSearchContext({ index: { fields: INDEX_FIELDS, rows, stores: { marcjacobs: { label: "Marc Jacobs" }, ssense: { label: "SSENSE" }, farfetch: { label: "Farfetch" } } } });
const FX = 3.4;
const chartOf = (q) => (core.searchPage(ctx, q, 1, { fx: FX }).compares || []);

await check("the model key joins the house's name and the retailers' quoted one, and keeps other models apart", () => {
  const k = (t, d) => MATCH.mjModelKey(t, "Marc Jacobs", d);
  assert.equal(k("The Fixture Leather Medium Tote Bag - Black"), k("Black 'The Fixture Leather Medium' Tote"));
  assert.equal(k("The Fixture Snapshot", "bolsos"), k("Black 'The Fixture Snapshot' Bag"));
  assert.notEqual(k("Black 'The Pop J Marc' Flats"), k("Black 'The Pop J Marc' Platform Sandals"), "a flat is not a sandal");
  assert.notEqual(k("Black 'The Scene' Small Shoulder Bag"), k("Black 'The Scene Large' Shoulder Bag"), "sizes stay apart");
  assert.notEqual(k("Pink 'The Fixture Snapshot Convertible' Bag"), k("Black 'The Fixture Snapshot' Bag"));
  assert.equal(k("Blue Faux Fur Cropped Jeans"), null, "no «The», no key: never guessed");
  assert.equal(k("Daisy Eau de Toilette"), null, "beauty keeps the generic key");
  assert.equal(MATCH.mjModelKey("The Tote Bag", "Coach"), null, "another house");
});
await check("an official row next to every retailer row, and the official store wins when it is cheapest", () => {
  const charts = chartOf("marc jacobs leather medium tote");
  assert.equal(charts.length, 1);
  const c = charts[0];
  assert.deepEqual(c.stores.map((s) => s.store).sort(), ["farfetch", "marcjacobs", "ssense"]);
  const off = c.stores.find((s) => s.store === "marcjacobs");
  assert.equal(off.storeLabel, "Marc Jacobs");
  assert.equal(c.stores[0].store, "marcjacobs", "the cheapest cost to Miami leads");
  assert.equal(off.best, true, "Mejor precio");
  assert.equal(off.bestCost, true, "Mejor costo hasta Miami");
  assert.ok(c.stores.filter((s) => s.best).length === 1 && c.stores.filter((s) => s.bestCost).length === 1);
  /* The headline is the page's own: (raw + margin) x 1.07, in soles too. */
  assert.equal(off.usd, r2((495 + tieredMarginUsd(495)) * 1.07));
  assert.equal(off.pen, r2(off.usd * FX));
  assert.ok(off.wasUsd > off.usd, "its real was-price rides along");
  assert.deepEqual(off.ship, { state: "free", usd: 0, freeOverUsd: null }, "free UPS Ground over $50");
});
await check("the best price wins whoever has it: a retailer under the official store takes the badges", () => {
  const c = chartOf("marc jacobs snapshot")[0];
  assert.deepEqual(c.stores.map((s) => s.store), ["ssense", "marcjacobs"]);
  assert.equal(c.stores[0].best, true);
  assert.equal(c.stores[0].bestCost, true);
  assert.equal(c.stores[1].best || c.stores[1].bestCost, false);
  assert.ok(!c.stores.some((s) => s.title === "Pink 'The Fixture Snapshot Convertible' Bag"), "another model is not in the chart");
});
await check("rules unchanged: one headline price per row, the breakdown never a rolled-up total, a photo on every row", () => {
  for (const c of [...chartOf("marc jacobs leather medium tote"), ...chartOf("marc jacobs snapshot")]) {
    assert.ok(c.image, "the chart's product photo");
    for (const s of c.stores) {
      assert.ok(s.image, s.store + " row has no photo");
      assert.ok(s.usd > 0 && s.pen > 0);
      for (const k of Object.keys(s)) assert.doesNotMatch(k, /total|door|freight/i, `${s.store} row carries «${k}»`);
      assert.ok(["fee", "free", "calc", "unknown"].includes(s.ship.state));
    }
    assert.ok(!Object.keys(c).some((k) => /total/i.test(k)), "the chart carries a total");
  }
});
await check("today's retailer listings: the keyed SSENSE Marc Jacobs fashion rows the official store will join", () => {
  const idx = JSON.parse(read(INDEX_PATH));
  const F = Object.fromEntries(idx.fields.map((n, i) => [n, i]));
  const mj = idx.rows.filter((r) => MATCH.isMarcJacobsFashionBrand(r[F.brand]) && MJ.mjAisle("", r[F.title]) !== "belleza");
  const keyed = mj.filter((r) => MATCH.mjModelKey(r[F.title], r[F.brand], r[F.department]));
  const rep = JSON.parse(read("reports/marcjacobs-aggregation-2026-11-04.json"));
  assert.equal(keyed.length, rep.comparador.withMatchKey, "the aggregation report is stale: node scripts/report-marcjacobs-aggregation.mjs");
  assert.ok(keyed.length >= 60, "fewer than 60 keyed listings: " + keyed.length);
});

rmSync(tmp, { recursive: true, force: true });

/* ---------- BROWSER (390px): the gate as a shopper sees it ---------- */
let pw = null;
try { pw = await import("playwright"); } catch { /* reported below */ }
await check("browser: playwright is available for the page checks", () => assert.ok(pw, "playwright is not installed"));
if (pw && committed === 0) {
  const { createServer } = await import("node:http");
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
  const srv = createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname.startsWith("/.netlify/functions/")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(u.pathname.endsWith("exchange-rate") ? '{"venta":3.75,"compra":3.74}' : "{}");
    }
    const f = join(ROOT, decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname));
    if (!f.startsWith(ROOT) || !existsSync(f) || f.endsWith("/")) { res.writeHead(404); return res.end(""); }
    res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
    res.end(readFileSync(f));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  const browser = await pw.chromium.launch();
  const STUB = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#dfe6f2"/></svg>';
  const SHOT = process.env.SHOT_DIR || "";
  try {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB }) : r.abort());
    const page = await c.newPage();
    await check("browser 390px: the home Tiendas carousel paints without a Marc Jacobs tile", async () => {
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => { const m = document.getElementById("mTiendasStripRow"); return m && m.children.length > 5; }, null, { timeout: 60000 });
      const keys = await page.$$eval("#mTiendasStripRow button", (b) => b.map((x) => (/tiendaJump\('([a-z0-9]+)'\)/.exec(x.getAttribute("onclick") || "") || [])[1]));
      assert.ok(keys.includes("miumiu"), "the strip did not paint");
      assert.ok(!keys.includes("marcjacobs"), "a Marc Jacobs tile on the home page");
      if (SHOT) {
        /* Where the tile would sit: right after Miu Miu. */
        await page.evaluate(() => { const r = document.getElementById("mTiendasStripRow"); const b = r.querySelector("button[onclick*=\"'miumiu'\"]"); r.scrollLeft = b.offsetLeft - 120; });
        await page.locator("#mTiendasStripRow").screenshot({ path: join(SHOT, "mj-home-strip-390.png") });
      }
    });
    await check("browser 390px: tienda.html?tienda=marcjacobs opens no storefront (the directory, without Marc Jacobs)", async () => {
      await page.goto(BASE + "/tienda.html?tienda=marcjacobs", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      const txt = await page.evaluate(() => document.body.innerText);
      assert.doesNotMatch(txt, /Bolsos, zapatos, ropa y accesorios de la casa/, "the Marc Jacobs storefront opened");
      assert.equal(await page.evaluate(() => [...document.querySelectorAll("a[href*='tienda=marcjacobs']")].length), 0);
      if (SHOT) await page.screenshot({ path: join(SHOT, "mj-tienda-gated-390.png") });
    });
    await c.close();
  } finally {
    await browser.close();
    srv.close();
  }
}

console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log("\n  FAILURES\n  " + failures.join("\n  ")); process.exit(1); }

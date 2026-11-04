#!/usr/bin/env node
/* ==================================================================
   TENNIS WAREHOUSE, STOCKED (#443 c.6565357697, c.6578887587).

   The 2026-11-01 store-sweep delivery through
   scripts/build-tenniswarehouse-catalog.mjs (rules:
   scripts/lib/tenniswarehouse.js):
   1. the rules: an aisle is what the product is (a skirt filed under
      Pelotas is clothing, an overgrip pack under Cuerdas is a grip), a
      scraped field label is not a size;
   2. the catalogue: real products, a photo and a USD price each, sizes
      only from the source, sizeless shoes / garments / racquets shown
      but not sold, no English shown as the description;
   3. the wiring: storefront (Ofertas first, then Danny's aisle order),
      search door and destination, the product page's file list, the
      app's source map, the Tenis carousel's pill, not off sale.

     node scripts/test/tenniswarehouse-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { TW_KEY, OUT_FILE, DEPT_ORDER, DEPT_LABELS, twDept, cleanSizes, genderOf, needsSize, normalizeTennisWarehouse } from "../lib/tenniswarehouse.js";
import { SIZES_PENDING } from "../lib/sizes-pending-data.js";
import { sizesPendingKey } from "../lib/sizes-pending.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..") + "/";
const read = (rel) => readFileSync(ROOT + rel, "utf8");
const json = (rel) => JSON.parse(read(rel));
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${String(e.message).split("\n").slice(0, 6).join("\n         ")}`); console.log("    FAIL " + name); }
}

console.log("\n  Tennis Warehouse — the rules");
await check("an aisle is what the product is; the delivered aisle stands when the name agrees with it", () => {
  assert.equal(twDept("Lucky in Love Women's High Waist Super Bloom Skirt", "pelotas"), "ropa-mujer");
  assert.equal(twDept("Wilson Championship Extra Duty Tennis Ball 24 Can Case", "pelotas"), "pelotas");
  assert.equal(twDept("Prince TackyPro 50 Pack Overgrip White", "cuerdas"), "grips");
  assert.equal(twDept("Prince Phantom 93P 18x20 Grommet", "grips"), "accesorios");
  assert.equal(twDept("Babolat RPM Power 17/1.25 String Reel - 660'", "grips"), "cuerdas");
  assert.equal(twDept("Head Pro X Racquet Bag L Black", "raquetas"), "bolsos");
  assert.equal(twDept("Dunlop CX 200 LS 2027 Racquet", "raquetas"), "raquetas");
  assert.equal(twDept("Yonex Muse 107", "raquetas"), "raquetas");
  assert.equal(twDept("Wilson Grip Crew Sock", "ropa-hombre"), "ropa-hombre", "a grip sock is a sock");
  assert.equal(twDept("Tourna Rosin Bag", "grips"), "grips");
  assert.equal(twDept("Tourna Tac Overgrip XL 10 Grip Reel Blue", "cuerdas"), "grips", "an overgrip reel is grip");
  assert.equal(twDept("SmellWell Active Original Fresh Insert - Black Zebra", "zapatos-hombre"), "accesorios");
  assert.equal(genderOf("Nike Girl's Summer One Tank"), "junior");
  assert.equal(genderOf("KSwiss Hypercourt Supreme 2 Clay White/Gold Wom's Shoes"), "mujer");
  assert.equal(genderOf("Mizuno Men's Core Pant"), "hombre");
});
await check("a size is what the source exposed; a field label is not one; nothing is added", () => {
  assert.deepEqual(cleanSizes(["US Men's Shoe Size:"]), []);
  assert.deepEqual(cleanSizes(["7.0", "7.5", "7.5", " 8.0 "]), ["7.0", "7.5", "8.0"]);
  assert.deepEqual(cleanSizes(['4 1/8" (#1)', '4 1/4" (#2)']), ['4 1/8" (#1)', '4 1/4" (#2)']);
  assert.deepEqual(cleanSizes(undefined), []);
  assert.ok(needsSize("zapatos-mujer") && needsSize("ropa-junior") && needsSize("raquetas"));
  assert.ok(!needsSize("cuerdas") && !needsSize("pelotas") && !needsSize("bolsos") && !needsSize("grips"));
});
await check("normalize: no photo or no price is no card; sizeless shoes are shown, not sold; English is never the description", () => {
  const env = { retailers: { tenniswarehouse: { departments: {
    "zapatos-hombre": { items: [
      { name: "Asics Gel Men's Shoes", price: 100, image: "https://img/x.jpg", availableSizes: [], description: "A fast shoe for the court." },
      { name: "Nike Men's Shoes", price: 90, image: "https://img/y.jpg", availableSizes: ["9.0"] },
      { name: "No Photo Men's Shoes", price: 90, image: "" },
      { name: "No Price Men's Shoes", price: 0, image: "https://img/z.jpg" },
    ] },
    cuerdas: { items: [{ name: "Luxilon ALU Power 16L String", price: 19, image: "https://img/s.jpg", availableSizes: [] }] },
  } } } };
  const { catalog, held } = normalizeTennisWarehouse(env, { spanishFor: () => null });
  const d = catalog.retailers.tenniswarehouse.departments;
  assert.equal(catalog.declaredProductCount, 3);
  assert.deepEqual(held, { noImage: 1, noPrice: 1, unshippable: 0, junkSizes: 0, duplicate: 0 });
  assert.equal(d["zapatos-hombre"].items[0].sizesPending, true);
  assert.equal(d["zapatos-hombre"].items[0].description, "");
  assert.equal(d["zapatos-hombre"].items[0].description_en, "A fast shoe for the court.");
  assert.ok(!d["zapatos-hombre"].items[1].sizesPending);
  assert.ok(!d.cuerdas.items[0].sizesPending, "a string set needs no size");
});

console.log("\n  Tennis Warehouse — the catalogue");
const cat = json(OUT_FILE);
const items = Object.entries(cat.retailers[TW_KEY].departments).flatMap(([dept, d]) => d.items.map((it) => ({ ...it, dept })));
await check("tenniswarehouse-catalog.json: thousands of real products, a photo and a USD price each, on-sale items with a real was-price", () => {
  assert.ok(items.length > 4000, items.length + " products");
  assert.equal(cat.declaredProductCount, items.length);
  for (const it of items) {
    assert.match(String(it.image), /^https:\/\//, `${it.name}: no photo, no card`);
    assert.ok(it.price > 0 && it.currency === "USD", `${it.name}: price`);
    assert.equal(it.retailer, TW_KEY);
    assert.match(String(it.url), /^https:\/\/www\.tennis-warehouse\.com\//, `${it.name}: the record keeps its source`);
    if (it.onSale) assert.ok(it.originalPrice > it.price, `${it.name}: on sale without a was-price`);
  }
  assert.ok(items.filter((i) => i.onSale).length > 1000, "Ofertas: " + items.filter((i) => i.onSale).length);
});
await check("the aisles are Danny's twelve, each holding what it says", () => {
  const keys = Object.keys(cat.retailers[TW_KEY].departments);
  assert.deepEqual(keys, DEPT_ORDER.filter((k) => keys.includes(k)), "an aisle outside the order: " + keys);
  for (const k of keys) assert.equal(cat.retailers[TW_KEY].departments[k].label, DEPT_LABELS[k]);
  const by = (k) => items.filter((i) => i.dept === k);
  assert.ok(!by("pelotas").some((i) => /\b(skirt|skort|tank|dress|sleeve)\b/i.test(i.name)), "a garment is filed under Pelotas");
  assert.ok(!by("cuerdas").some((i) => /\bover\s?grips?\b/i.test(i.name)), "an overgrip is filed under Cuerdas");
  assert.ok(!by("grips").some((i) => /\bgrommets?\b/i.test(i.name)), "a grommet is filed under Grips");
  for (const k of ["raquetas", "cuerdas", "grips", "pelotas", "bolsos", "ropa-mujer", "ropa-hombre", "zapatos-hombre", "zapatos-mujer"]) assert.ok(by(k).length > 20, `${k}: ${by(k).length}`);
});
await check("sizes only from the source: no field label as a size; what needs a size and has none is shown, not sold (and on both lists)", () => {
  const pending = new Set(SIZES_PENDING);
  const page = new Set(json("assets/data/sizes-pending.json"));
  for (const it of items) {
    assert.ok(Array.isArray(it.availableSizes), it.name);
    assert.ok(!it.availableSizes.some((s) => /:$/.test(s)), `${it.name}: a label is a size`);
    const want = !it.availableSizes.length && needsSize(it.dept);
    assert.equal(Boolean(it.sizesPending), want, `${it.name} (${it.dept}): sizesPending`);
    if (want) {
      assert.ok(pending.has(sizesPendingKey(TW_KEY, it.name)), `${it.name}: not on the order door's list`);
      assert.ok(page.has(sizesPendingKey(TW_KEY, it.name)), `${it.name}: not on the page's list`);
    }
  }
  assert.ok(items.filter((i) => i.availableSizes.length).length > 3000, "the source's sizes went missing");
});
await check("no English shown as the description (English kept as description_en)", () => {
  const EN = /\b(the|and|with|for|this|your|designed|features)\b/gi;
  for (const it of items) if (it.description) assert.ok((it.description.match(EN) || []).length < 3, `${it.name}: English description`);
});

console.log("\n  Tennis Warehouse — the wiring");
await check("the storefront: Ofertas de Tennis Warehouse first, then the aisles in Danny's order", () => {
  const ix = json("assets/tienda/tenniswarehouse/index.json");
  assert.equal(ix.count, items.length);
  assert.ok(ix.onSale > 1000);
  assert.equal(ix.rails[0].title, "Ofertas de Tennis Warehouse");
  const depts = ix.rails.slice(1).map((r) => r.dept);
  assert.deepEqual(depts, DEPT_ORDER.filter((k) => depts.includes(k)), "aisle order: " + depts);
  assert.ok(!ix.rails.some((r) => r.title === "Más vendidos"), "the locked order has no Más vendidos");
  for (const r of ix.rails) for (const c of r.head) assert.match(String(c.image), /^https:\/\//, `${r.title}: a card without a photo`);
});
await check("the registries: tienda.html, producto.html, the app's source map; not off sale", () => {
  const T = JSON.parse(/var STORES = (\{.*\});/.exec(read("tienda.html"))[1]);
  assert.deepEqual(T.tenniswarehouse.files, ["/tenniswarehouse-catalog.json"]);
  assert.equal(T.tenniswarehouse.slices, "/assets/tienda/tenniswarehouse/");
  assert.match(read("producto.html"), /"tenniswarehouse": \["\/tenniswarehouse-catalog\.json"\]/);
  const bundle = read(/<script src="\/(build\/app-[0-9a-f]+\.js)"[^>]*><\/script>/.exec(read("index.html"))[1]);
  assert.match(bundle, /"\/tenniswarehouse-catalog\.json":\["tenniswarehouse"\]/);
  assert.match(bundle, /"\/tennis-catalog\.json":\["tennisexpress"\]/);
  const ctx = {}; vm.createContext(ctx); vm.runInContext(read("off-sale.js"), ctx);
  assert.equal(ctx.AriaOffSale.isOffSaleRetailer(TW_KEY), false, "Tennis Warehouse is off sale");
  assert.ok(!json("tennis-catalog.json").retailers.tenniswarehouse, "the old empty Tennis Warehouse slot is still in tennis-catalog.json");
});
await check("the doors: search.html STORE_PAGES, the search destination, the Tenis carousel's pill", () => {
  const pages = /var STORE_PAGES = "([^"]*)"/.exec(read("search.html"))[1].trim().split(/\s+/);
  assert.ok(pages.includes(TW_KEY), "no search door");
  assert.ok(json("assets/search/destinations.json").stores[TW_KEY], "no search destination");
  const pills = json("assets/home/category-pills/index.json");
  assert.ok(pills.c.tenis.s.some((x) => x[0] === TW_KEY), "the Tenis carousel has no Tennis Warehouse pill");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

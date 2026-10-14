/* ==================================================================
   CLASSIFICATION TRUTH (2026-10-13 audit) — sections tell the truth.

   The page's own classifiers, lifted out of index.html (not copied), run
   over every committed catalogue the way the page loads them:
     M1 latinoProductTypeOfItem (Latino tiles; tienda.html / marca.html
        through product-type.js), M3 nativeTypeGroupsFor + the load-time
        repairNativeTypes (New Balance), M4 isFootwear, M5 the Walmart /
        Target keyword rooms.

   RUNNING IT
     node scripts/test/classification-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadClassifiers, census } from "../census-classification.mjs";
import { buildProductTypeSource } from "../build-product-type.mjs";
import { pageHtml } from "../lib/page-lift.mjs";
import * as footwearModule from "../lib/footwear.js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

const html = pageHtml(ROOT);
const P = loadClassifiers(html);
const C = census(P, P);
const m1 = (name, extra = {}) => P.latinoProductTypeOfItem({ name, ...extra });

check("M1: the brief's traps land where they belong", () => {
  assert.equal(m1("Jordan 6 Rings"), "zapatos");
  for (const [name, never] of [["Charmin Ultra Soft Toilet Paper", "joyas"], ["Spring Dish Towels, Set of 4", "joyas"],
    ["Pillar Candle Rings, Set of 2", "joyas"], ["Captain America Shield Wall Decal", "sombreros"], ["Escape Room Game for Adults", "sombreros"],
    ["Shattered Glass Wall Decal", "sombreros"], ["Women's Baggy Jeans", "carteras"], ["Sandalwood Shampoo 12 oz", "zapatos"],
    ["Men's Flat Front Shorts", "zapatos"], ["Ferris Wheel Picture Frame", "zapatos"], ["Plantar Fasciitis Heel Socks", "zapatos"],
    ["Beach Sunset Canvas Wall Art", "trajes_bano"], ["Women's Cap Sleeve Midi Dress", "sombreros"], ["3 lb Bag Yellow Onions", "carteras"]])
    assert.notEqual(m1(name), never, `"${name}" is ${never}`);
  for (const [name, want, extra] of [["New Balance 1906R", "zapatos", { brand: "New Balance" }], ["Nike Pegasus 41 Men's Road Running", "zapatos"],
    ["FuelCell Rebel v5", "zapatos", { type: "Ropa", retailer: "newbalance" }], ["Gold Hoop Earrings", "joyas"],
    ["Women's Leather Tote Bag", "carteras"], ["Wool Fedora Hat", "sombreros"], ["Triangle Bikini Top", "trajes_bano"],
    ["Leather Belt", "accesorios"], ["Linen Midi Dress", "ropa"], ["Numeric Cotton T-Shirt", "ropa", { type: "Ropa", retailer: "newbalance" }],
    ["Black Ankle Boots", "zapatos"], ["Gold Necklace", "zapatos", { type: "SHOES" }]])
    assert.equal(m1(name, extra || {}), want, `"${name}" is ${m1(name, extra || {})}, not ${want}`);
});

check("M1 over the whole catalogue: no shoe outside Zapatos, no non-shoe inside", () => {
  for (const [k, r] of Object.entries(C.m1)) if (k !== "zapatos") assert.equal(r.shoes, 0, `${r.shoes} shoes in ${k}`);
  assert.equal(C.m1.zapatos.notShoes, 0, `${C.m1.zapatos.notShoes} non-shoes in Zapatos`);
  assert.ok(C.m1.joyas.notJewelry <= 150, `${C.m1.joyas.notJewelry} Joyas items carry no jewelry word`);
  assert.ok(C.m1.ropa.n < C.items * 0.8, "Ropa still swallows the catalogue");
});

check("New Balance: no footwear in Ropa, no section named after the brand, isShoeItem has no cap or tee", () => {
  assert.ok(C.nb, "newbalance-catalog.json did not load");
  const labels = C.nb.sections.map(s => s.type);
  assert.ok(!labels.some(l => /^new balance$/i.test(l)), "a section is named New Balance: " + labels.join(", "));
  for (const s of C.nb.sections) if (!/zapat|shoe|calzado/i.test(s.type)) assert.equal(s.shoes, 0, `${s.shoes} shoes in NB's ${s.type}`);
  assert.ok(C.nb.sections.some(s => /zapat/i.test(s.type) && s.n >= 150), "NB's shoe section lost its shoes");
  for (const t of C.nb.isShoeItem) assert.ok(!/\b(caps?|hats?|t-?shirts?|tees?|clean up)\b/i.test(t), "isShoeItem passes: " + t);
});

check("Walmart / Target: no shoes in the clothes rooms, no non-shoes in the shoe rooms", () => {
  for (const [rk, rooms] of Object.entries(C.rooms))
    for (const [room, r] of Object.entries(rooms)) assert.equal(r.wrong, 0, `${rk} ${room}: ${r.wrong} wrong, e.g. ${r.examples.join(" | ")}`);
  const shoe = (name) => P.isShoeItem({ title: name, retailer: "walmart" });
  for (const n of ["18K Gold Plated Small Stud Hoop Flat Back Earrings Set for Women", "Wrangler Men's Regular Fit Boot Cut Cotton Jeans",
    "Men's Long Sleeve Oxford Button-Down Shirt", "Axiiglly Cargo Pants for Women, Baggy Straight Leg Hiking Streetwear",
    "Lightweight Crossbody Bag for Outdoor Hiking", "Classic Retro Polarized Sunglasses for Fishing Driving Hiking", "Hiking Rope Keychain"])
    assert.equal(shoe(n), false, `"${n}" is in Zapatos`);
  assert.equal(P.isShoeItem({ title: "'47 Clean Up NB Athletic Shoe", type: "Ropa", retailer: "newbalance" }), false, "the '47 cap is a shoe");
  for (const n of ["Women's Ballet Flats", "Men's Hiking Boots", "Kids' Light-Up Sneakers"]) assert.equal(shoe(n), true, `"${n}" left Zapatos`);
});

check("M4: bare 'hiking' admits no non-shoes; real hikers stay", () => {
  assert.equal(C.m4Hiking.length, 0, C.m4Hiking.join(" | "));
  assert.equal(P.isFootwear({ title: "Merrell Moab 3 Hiking Shoes" }), true);
  assert.equal(P.isFootwear({ title: "Hierro Hiker GORE-TEX" }), true);
  assert.equal(P.isFootwear({ title: "North Carolina Tar Heels Folding Stadium Seat" }), false);
  assert.equal(P.isFootwear({ title: "Duralast Brake Shoes" }), false);
});

check("the native-type repair keeps a real published type and only re-files catch-alls", () => {
  const env = { retailers: { x: { label: "Brandname", departments: { a: { items: [
    { name: "Runner One", type: "Zapatillas" }, { name: "Runner One", type: "Ropa" },
    { name: "Logo Tee", type: "Brandname" }, { name: "Trail Boot", type: "BOOTS" }, { name: "Trail Boot", type: "SHOES" },
  ] } } } } };
  const items = P.repairNativeTypes(env).retailers.x.departments.a.items;
  assert.equal(items[1].type, "Zapatillas", "the catch-all copy of a shoe was not re-filed");
  assert.equal(items[1].typeRaw, "Ropa");
  assert.equal(items[2].type, undefined, "a brand-name type survived");
  assert.equal(items[3].type, "BOOTS"); assert.equal(items[4].type, "SHOES", "a real type was overwritten");
});

check("product-type.js is index.html's classifier today, and the store pages load it", () => {
  assert.equal(readFileSync(ROOT + "product-type.js", "utf8"), buildProductTypeSource(), "product-type.js is stale — run: node scripts/build-product-type.mjs");
  const sandbox = { window: {} }; vm.createContext(sandbox);
  vm.runInContext(readFileSync(ROOT + "product-type.js", "utf8"), sandbox);
  const T = sandbox.window.AriaProductType;
  for (const [name, extra] of [["Jordan 6 Rings", {}], ["FuelCell Rebel v5", { type: "Ropa", retailer: "newbalance" }], ["Spring Dish Towels", {}], ["Women's Baggy Jeans", {}]])
    assert.equal(T.classify({ name, ...extra }), m1(name, extra), `product-type.js and index.html disagree on "${name}"`);
  for (const page of ["tienda.html", "marca.html"]) {
    const src = readFileSync(ROOT + page, "utf8");
    assert.match(src, /<script src="product-type\.js"><\/script>/, `${page} does not load product-type.js`);
    assert.match(src, /window\.AriaProductType\.classify\(/, `${page} does not classify with it`);
    assert.ok(src.indexOf('src="product-type.js"') < src.indexOf("function productTypeOf("), `${page} loads it after its own script`);
  }
});

check("scripts/lib/footwear.js mirrors this PR's footwear changes", () => {
  const mod = readFileSync(ROOT + "scripts/lib/footwear.js", "utf8");
  assert.ok(!/hikers\?\|hiking/.test(mod), "the module still matches bare hiking");
  for (const [title, want] of [["Hiking Rope Keychain", false], ["Women's Ballet Flats", true], ["Boys' Oxford Style Dress Shirt", false],
    ["Tar Heels Stadium Seat", false], ["Duralast Brake Shoes", false], ["Merrell Moab 3 Hiking Shoes", true]]) {
    assert.equal(footwearModule.isFootwear({ title }), want, `module: "${title}"`);
    assert.equal(P.isFootwear({ title }), want, `page: "${title}"`);
  }
});

const MIN_CHECKS = 8;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }

/* ==================================================================
   BRAND STORE PILLS — NO "GYM RAT" PILL INSIDE GYMSHARK'S OWN STORE.

   Gymshark, Alphalete and YoungLA come from gymrat-catalog.json as one
   "gym_rat" department holding everything, so tienda.html's department
   pills read "Todo · Gym Rat". A store with a single department now gets
   pills from each product's own type field: gender (Mujer / Hombre /
   Unisex) and category (Leggings, Shorts…), with Todo kept.

   Also: the "Carteras" category already matches backpacks by keyword,
   so its label is "Carteras y mochilas" everywhere it is declared.

   RUNNING IT
     node scripts/test/store-pills-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

/* The page's own facet code, lifted by brace matching, not copied. */
const page = readFileSync(ROOT + "tienda.html", "utf8");
function lift(sig) {
  const at = page.indexOf(sig);
  assert.ok(at >= 0, sig + " moved — update this test");
  let depth = 0, i = page.indexOf("{", at + sig.length - 1);
  for (; i < page.length; i++) { if (page[i] === "{") depth++; else if (page[i] === "}" && --depth === 0) break; }
  return page.slice(at, i + 1);
}
const consts = /var GENDER_LABELS = [\s\S]*?var FACET_MIN = \d+;/.exec(page)[0];
const src = [consts, lift("function typeFacets("), lift("function buildFacets(")].join("\n");
function facetsFor(items, deptLabels) {
  return new Function("allItems", "deptLabels", `
    var facetMode = false, facetGenders = [], facetCats = [], activeGender = '', activeCat = '';
    ${src}
    buildFacets();
    return { facetMode, facetGenders, facetCats, typeFacets };`)(items, deptLabels);
}
const CAT = JSON.parse(readFileSync(ROOT + "gymrat-catalog.json", "utf8"));
const store = (k) => {
  const deps = CAT.retailers[k].departments;
  const labels = {};
  const items = [];
  for (const [dk, d] of Object.entries(deps)) {
    labels[dk] = d.label;
    for (const it of d.items) items.push({ ...it, dept: dk, type: it.type || "" });
  }
  return { items, labels };
};

await check("Gymshark: gender + category pills from the type field, no Gym Rat pill", () => {
  const { items, labels } = store("gymshark");
  assert.deepEqual(Object.keys(labels), ["gym_rat"], "the catalogue is no longer one bucket — revisit this");
  const f = facetsFor(items, labels);
  assert.equal(f.facetMode, true);
  assert.deepEqual(f.facetGenders, ["Mujer", "Hombre", "Unisex"]);
  for (const c of ["Leggings", "Shorts", "Sports Bras", "SS Tops", "Pullovers"]) assert.ok(f.facetCats.includes(c), c + " pill missing");
  assert.ok(!f.facetCats.concat(f.facetGenders).some((x) => /gym rat/i.test(x)), "a Gym Rat pill inside Gymshark");
  const legging = items.find((i) => i.type.startsWith("Womens>Apparel>Leggings"));
  assert.equal(legging.gender, "Mujer");
  assert.equal(legging.cat, "Leggings");
});

await check("Alphalete and YoungLA: the same, from their own type formats", () => {
  const a = store("alphalete"), fa = facetsFor(a.items, a.labels);
  assert.deepEqual(fa.facetGenders, ["Mujer", "Hombre", "Unisex"]);
  for (const c of ["Shorts", "Bras", "Leggings", "Tanks"]) assert.ok(fa.facetCats.includes(c), c + " pill missing");
  const y = store("youngla"), fy = facetsFor(y.items, y.labels);
  assert.deepEqual(fy.facetGenders.slice().sort(), ["Hombre", "Mujer"]);
  assert.deepEqual(fy.facetCats, [], "YoungLA's type carries no category");
  assert.equal(fy.facetMode, true);
});

await check("the type parser: segmented, free text, gender-only, empty", () => {
  const { typeFacets } = facetsFor([], { a: "A" , b: "B" });
  assert.deepEqual(typeFacets("Mens>Apparel>Shorts>training"), { gender: "Hombre", cat: "Shorts" });
  assert.deepEqual(typeFacets("Unisex>Accessories>Socks>crew"), { gender: "Unisex", cat: "Socks" });
  assert.deepEqual(typeFacets("Women’s Seamless Flared Pant"), { gender: "Mujer", cat: "Pants" });
  assert.deepEqual(typeFacets("Men's Tank Top"), { gender: "Hombre", cat: "Tops" });
  assert.deepEqual(typeFacets("For Her"), { gender: "Mujer", cat: "" });
  assert.deepEqual(typeFacets(""), { gender: "", cat: "" });
});

await check("a store with several departments keeps its department pills", () => {
  const f = facetsFor([{ type: "Womens>Apparel>Leggings>x" }], { clothing: "Clothing", toys: "toys" });
  assert.equal(f.facetMode, false);
});

await check("tiny categories stay under Todo instead of becoming a pill", () => {
  const { items, labels } = store("gymshark");
  const f = facetsFor(items, labels);
  assert.ok(!f.facetCats.includes("Misc."), "a 1-product pill");
  assert.ok(!f.facetCats.includes("Bottles"));
});

await check("\"Carteras y mochilas\" is the label everywhere the category is declared", () => {
  const files = { tienda: page, marca: readFileSync(ROOT + "marca.html", "utf8"), index: readFileSync(ROOT + "index.html", "utf8") };
  for (const [name, src] of Object.entries(files)) {
    const m = /\{\s*key:\s*'carteras',\s*label:\s*'([^']+)',\s*keywords:\s*\[([^\]]*)\]/.exec(src);
    assert.ok(m, name + ": carteras product type moved");
    assert.equal(m[1], "Carteras y mochilas", name + " still says " + m[1]);
    assert.match(m[2], /'backpack'/, name + ": the label promises backpacks the keywords don't match");
  }
  assert.match(files.index, /purses: \{ label: 'Carteras y mochilas', icon: '' \}/, "index.html purses category map");
});

const MIN_CHECKS = 6;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }

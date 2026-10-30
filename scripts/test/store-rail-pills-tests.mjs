/* ==================================================================
   ONE PILL ROW ABOVE EVERY STORE RAIL (Danny, #443 c.6525893681).

     - the pills are the store page's own aisles (one source of truth),
       each with real depth; a wearer split only where each half is deep;
       no row for a store with fewer than two pills;
     - every pill card has its photo and opens Aria's product page;
     - the Mountain Test: nothing at load -- a manifest, then one row file
       per rail as it nears the screen, one pill file per tap.

     node scripts/test/store-rail-pills-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { homeStoreRails, storePills, PILL_MIN, MAX_PILLS, PILLS_DIR } from "../build-store-rail-pills.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const read = (f) => readFileSync(ROOT + f, "utf8");
const json = (f) => JSON.parse(read(f));

check("the committed rows are what the store pages compute today", () => {
  const manifest = json(PILLS_DIR + "/index.json");
  for (const store of homeStoreRails(ROOT)) {
    const { pills } = storePills(store, ROOT);
    const f = `${PILLS_DIR}/${store}.json`;
    if (!pills.length) { assert.ok(!existsSync(ROOT + f) && !manifest.stores.includes(store), `${store}: a row with no depth`); continue; }
    assert.ok(manifest.stores.includes(store), store + " missing from the manifest");
    assert.deepEqual(json(f).pills, pills.map(({ k, label, n }) => ({ k, label, n })), `${store} is stale -- node scripts/build-store-rail-pills.mjs`);
  }
});

check("label-true: each pill is a store-page aisle (or its wearer half) with real depth, 2..8 per row", () => {
  for (const store of json(PILLS_DIR + "/index.json").stores) {
    const row = json(`${PILLS_DIR}/${store}.json`).pills;
    assert.ok(row.length >= 2 && row.length <= MAX_PILLS, `${store}: ${row.length} pills`);
    const aisles = json(`assets/tienda/${store}/index.json`).rails.map((r) => r.title);
    for (const p of row) {
      assert.ok(p.n >= PILL_MIN, `${store}: ${p.label} has ${p.n}`);
      assert.ok(aisles.some((a) => p.label === a || p.label === a + " mujer" || p.label === a + " hombre" || p.label === a + " niños"), `${store}: «${p.label}» is not one of its aisles`);
      const cards = json(`${PILLS_DIR}/${store}-${p.k}.json`).cards;
      assert.ok(cards.length >= 8, `${store}/${p.k}: ${cards.length} cards`);
      for (const c of cards) {
        assert.match(c.image, /^https?:\/\//, `${store}/${p.k}: a card without its photo`);
        assert.ok(c.title && c.price > 0 && c.retailer === store, `${store}/${p.k}: ${JSON.stringify(c).slice(0, 80)}`);
      }
    }
  }
});

check("the wearer split happens only where the store has the depth (Foot Locker), never padded (VS)", () => {
  const fl = json(`${PILLS_DIR}/footlocker.json`).pills.map((p) => p.label);
  assert.deepEqual(fl, ["Zapatos mujer", "Zapatos hombre", "Zapatos niños"]);
  const vs = json(`${PILLS_DIR}/victoriassecret.json`).pills.map((p) => p.label);
  assert.ok(vs.includes("Perfumes") && vs.includes("Belleza"), vs.join(","));
  assert.ok(!vs.includes("Zapatos") && !vs.includes("Joyas"), "a thin VS aisle became a pill");
});

check("the page: nothing at load, cards open Aria's product page, «Todo» restores", () => {
  assert.match(read("index.html"), /<script src="\/assets\/js\/store-rail-pills\.js" defer><\/script>/);
  const js = read("assets/js/store-rail-pills.js");
  assert.match(js, /IntersectionObserver/);
  assert.match(js, /DIR \+ "index\.json"/);
  assert.match(js, /\/producto\.html\?producto=/);
  assert.doesNotMatch(js, /https?:\/\/(?!localhost)/, "no outside link");
  assert.match(js, />Todo<\/button>/);
  for (const store of json(PILLS_DIR + "/index.json").stores) assert.ok(statSync(`${ROOT}${PILLS_DIR}/${store}.json`).size < 1500, store + " row file is not small");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

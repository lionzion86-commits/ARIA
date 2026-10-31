/* ==================================================================
   THE STORE TEMPLATE (#443 c.6534989244, Lucifer's production audit;
   Walmart is the acceptance test). Every generic storefront:

     1. type rails by their TRUE total in the store, biggest first;
     2. no rail under 25: the small types share one "Más de <tienda>";
     3. sellable first inside a rail: on-sale <= $200, then <= $200, then
        the rest; reviews, then rating; discount only as the tiebreak;
     4. one product, one card: the bilingual twins merged (the LEGO
        Creator 31377 once, in Spanish), a colourway never merged;
     5. Más vendidos a credible set (at most 50);
     6. card titles: the condition label apart and in Spanish, the
        store's English condition words gone, the brand said once;
     7. Walmart's brand from its own records where its title names one.

     node scripts/test/store-template-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { RAIL_MIN, BEST_SELLERS_MAX, ACCESSIBLE_USD, TAIL_RAIL_KEY, dedupeMerged, fillBrandsFromStore, SLICED_STORES } from "../build-store-slices.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const read = (f) => readFileSync(ROOT + f, "utf8");
const idx = (k) => JSON.parse(read(`assets/tienda/${k}/index.json`));
const fnOf = (k) => JSON.parse(read(`assets/tienda/_fn/${k}.json`));
const generic = readdirSync(ROOT + "assets/tienda").filter((d) => !d.startsWith("_") && d !== "hero" && !SLICED_STORES[d])
  .filter((d) => { try { return idx(d).railPages === "fn"; } catch { return false; } });
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

check("type rails biggest first, none under 25, the small ones share Más de <tienda> (every generic store)", () => {
  for (const k of generic) {
    const types = idx(k).rails.filter((r) => r.key.startsWith("t-"));
    const own = types.filter((r) => r.key !== TAIL_RAIL_KEY);
    for (let i = 1; i < own.length; i++) assert.ok(own[i - 1].total >= own[i].total, `${k}: ${own[i - 1].key} ${own[i - 1].total} before ${own[i].key} ${own[i].total}`);
    for (const r of own) assert.ok(r.total >= RAIL_MIN, `${k}: ${r.key} has ${r.total}`);
    const tail = types.findIndex((r) => r.key === TAIL_RAIL_KEY);
    if (tail >= 0) {
      assert.equal(tail, types.length - 1, `${k}: the shared rail is last`);
      assert.equal(types[tail].title, "Más de " + idx(k).label);
    }
  }
});

check("Walmart: Juguetes leads the aisles; Sombreros, Bebé, Perfumes and Repuestos are not rails of their own", () => {
  const keys = idx("walmart").rails.map((r) => r.key);
  assert.deepEqual(keys.slice(0, 3), ["ofertas", "masvendidos", "t-juguetes"]);
  for (const k of ["t-sombreros", "t-bebe", "t-perfumes", "t-repuestos"]) assert.ok(!keys.includes(k), k);
  assert.equal(keys[keys.length - 1], TAIL_RAIL_KEY);
});

check("sellable first: on-sale accessible pieces lead every Walmart aisle, never the deepest-discount oddments", () => {
  const fn = fnOf("walmart");
  const shown = new Set([...(fn.rails.ofertas || []).slice(0, 16), ...(fn.rails.masvendidos || []).slice(0, 16)]);
  const tier = (r) => (r[2] <= ACCESSIBLE_USD ? (r[4] > 0 ? 0 : 1) : 2);
  for (const [key, list] of Object.entries(fn.rails)) {
    if (!key.startsWith("t-") || key.includes("~")) continue;
    /* What the lead rails already show up front moves to the back, in its own order. */
    const own = list.filter((i) => !shown.has(i)).map((i) => tier(fn.rows[i]));
    for (let n = 1; n < own.length; n++) assert.ok(own[n] >= own[n - 1], `${key}: tier ${own[n]} after ${own[n - 1]} at ${n}`);
    if (own.length && list.some((i) => !shown.has(i) && tier(fn.rows[i]) === 0)) assert.equal(own[0], 0, key);
  }
});

check("Más vendidos is a credible set, not a third of the store", () => {
  for (const k of generic) {
    const r = idx(k).rails.find((x) => x.key === "masvendidos");
    if (r) assert.ok(r.total <= BEST_SELLERS_MAX, `${k}: ${r.total}`);
  }
});

check("one product, one card: the LEGO Creator 31377 once, in Spanish; no exact title+price+link twice", () => {
  const rows = fnOf("walmart").rows;
  const lego = rows.filter((r) => /\b31377\b/.test(r[0]));
  assert.equal(lego.length, 1, lego.map((r) => r[0]).join(" / "));
  assert.match(lego[0][0], /tortuga/);
  /* A twin is merged; a colourway (its own photo) is not. */
  const base = { price: 8.02, url: "https://www.walmart.com/ip/X-31377/17095707289?a=1", image: "https://i5.walmartimages.com/a.jpeg" };
  const out = dedupeMerged([
    { ...base, name: "LEGO Creator Turtle for Girls and Boys - 31377" },
    { ...base, name: "LEGO Creator tortuga para niñas y niños - 31377", url: base.url.replace("a=1", "b=2") },
    { ...base, name: "LEGO Creator Turtle for Girls and Boys - 31377", image: "https://i5.walmartimages.com/b.jpeg", url: "https://www.walmart.com/ip/X-31377-red/1" },
  ]);
  assert.equal(out.length, 2);
  assert.match(out[0].name, /tortuga/);
});

check("Walmart's brand from its own records: a toy whose title opens with a brand the store lists gets it", () => {
  const items = [{ name: "LEGO City Fire Truck", brand: "LEGO" }, { name: "LEGO Friends Cafe", brand: "LEGO" },
    { name: "LEGO Creator tortuga", brand: "" }, { name: "Legoland Poster", brand: "" }, { name: "Mystery Toy", brand: "" }];
  assert.equal(fillBrandsFromStore(items), 1);
  assert.equal(items[2].brand, "LEGO");
  assert.equal(items[3].brand, "");
  const rows = fnOf("walmart").rows;
  assert.ok(rows.filter((r) => r[1]).length > rows.length * 0.4, "brand coverage");
});

check("card titles: condition label apart and in Spanish, English condition words gone, the brand said once", () => {
  const page = read("tienda.html");
  assert.match(page, /'<span class="card-cond">' \+ esc\(p\.k\) \+ '<\/span> '/);
  const src = /var COND_WORDS_RX[\s\S]*?\n}\r?\n/.exec(page)[0];
  const f = new Function(src + "; return cardTitleText;")();
  assert.equal(f("(Open Box) Apple AirPods Pro 2", "Caja abierta", "Apple"), "AirPods Pro 2");
  assert.equal(f("VAIO VAIO SX14 Laptop", "", ""), "VAIO SX14 Laptop");
  assert.equal(f("Asus ASUS ROG Strix G16", "", "Asus"), "ROG Strix G16");
  assert.equal(f("Women's and Women's Plus Dress", "", "Scenario"), "Women's and Women's Plus Dress");
  assert.equal(f("Restored Apple iPhone 13", "", ""), "Restored Apple iPhone 13", "no label, no strip");
  assert.match(page, /esc\(cardTitleText\(p\.name, p\.k, p\.brand\)\)/);
  assert.match(page, /'producto\.html\?producto=' \+ encodeURIComponent\(p\.name/, "the link keeps the store's name");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

/* ==================================================================
   CALZEDONIA + INTIMISSIMI (#443 c.6512405832, Danny c.6512451192):
   two separate stores -- own tile, own store page -- and a carousel
   each under Lencería, from the 2026-10-29 drop.

     - in stock only, every card with the drop's own photo;
     - nothing on sale (no compare-at price came with the drop);
     - the weight is the drop's estimate, flagged as one;
     - Intimissimi sells with its size runs; Calzedonia's records carry
       none, so its tights are shown, not sold (sizesPending);
     - the Spanish reads Peruvian ("brasier", never "sujetador"; lace
       cups are "copas", not "vasos").

     node scripts/test/calzedonia-intimissimi-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STORES as CI } from "../lib/calzedonia-intimissimi.js";
import { RETAILERS } from "../lib/retailers.js";
import { isSizesPending } from "../lib/sizes-pending.js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const read = (f) => readFileSync(ROOT + f, "utf8");
const json = (f) => JSON.parse(read(f));
const items = (k) => Object.values(json(k + "-catalog.json").retailers[k].departments).flatMap((d) => d.items);

check("the catalogues: in stock, a real photo each, nothing on sale, the weight an estimate flagged as one", () => {
  for (const k of ["intimissimi", "calzedonia"]) {
    const all = items(k);
    assert.ok(all.length > (k === "intimissimi" ? 800 : 300), `${k}: ${all.length}`);
    for (const it of all) {
      assert.match(it.image, /^https:\/\//, it.name);
      assert.ok(it.price > 0 && it.currency === "USD", it.name);
      assert.ok(!it.onSale && !it.originalPrice, `${k}: ${it.name} marked on sale`);
      assert.ok(it.weightKg > 0 && it.weightEstimated === true && it.weightSource, `${k}: ${it.name} weight`);
      assert.equal(it.retailer, k);
    }
  }
});

check("sizes are never invented: Intimissimi sells with its runs, Calzedonia is shown, not sold", () => {
  for (const it of items("intimissimi")) assert.ok(Array.isArray(it.sizes) && it.sizes.length, it.name);
  for (const it of items("calzedonia")) {
    assert.ok(it.sizesPending === true && !it.sizes, it.name);
    assert.ok(isSizesPending("calzedonia", it.name), "not on the order door's list: " + it.name);
  }
  assert.ok(isSizesPending("snipes", items("snipes").find((i) => i.sizesPending).name), "SNIPES' entries stay on the list");
});

check("the Spanish reads Peruvian: brasier, calzones, copas", () => {
  for (const k of ["intimissimi", "calzedonia"]) for (const it of items(k)) {
    assert.ok(it.description, `${k}: ${it.name} has no Spanish`);
    assert.doesNotMatch(it.description, /\b(sujetador(es)?|bragas?|vasos?)\b/i, `${k}: ${it.name}`);
  }
});

check("two stores: a registry row, a tile and a store page each, in the store's own aisles", () => {
  const tiendas = read("tiendas.html"), tienda = read("tienda.html");
  for (const [k, cfg] of Object.entries(CI)) {
    assert.ok(RETAILERS[k] && RETAILERS[k].browse && !RETAILERS[k].pendingCatalog, k);
    assert.ok(tiendas.includes(`href="tienda.html?tienda=${k}">${cfg.label}</a>`), `${k}: no tile`);
    assert.ok(tienda.includes(`"${k}": {"label": "${cfg.label}"`), `${k}: tienda.html does not know it`);
    const idx = json(`assets/tienda/${k}/index.json`);
    assert.deepEqual(idx.rails.map((r) => r.title), cfg.order.map((a) => cfg.labels[a]), k);
  }
  assert.match(tiendas, /87 tiendas activas/);
});

check("Lencería: an Intimissimi carousel and a Calzedonia carousel, each the store's own stock", () => {
  const feed = json("ropa-interior-women-feed.json");
  const rows = Array.isArray(feed) ? feed : feed.items;
  const n = (k) => rows.filter((p) => p.r === k).length;
  assert.ok(n("intimissimi") >= 100, `intimissimi: ${n("intimissimi")}`);
  assert.ok(n("calzedonia") >= 40, `calzedonia: ${n("calzedonia")}`);
  const page = read("ropa-interior.html");
  for (const k of ["intimissimi", "calzedonia"]) assert.match(page, new RegExp(`\\{ key:'${k}',[^}]*stores:\\['${k}'\\], all:true`), k);
  /* The carousels show the stores' full-price stock (their drop has no sales). */
  assert.match(page, /function curate\(list, isHalo, all\)/);
});

check("search finds both stores", () => {
  const idx = read("assets/search/catalog-index.json");
  for (const k of ["intimissimi", "calzedonia"]) assert.ok((idx.match(new RegExp(`"${k}"`, "g")) || []).length > 300, k);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

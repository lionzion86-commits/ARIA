/* ==================================================================
   SECTION PILL HUBS (Build Order D, #443 c.6471948104; amended by
   c.6477721206: pills are LENSES, not filters).

   Held here: Lujo, Casa Aria and Electrónica open with a pill row
   («Todas», then their brands or stores, strongest first); each pill's
   lens is one small pre-built file whose carousels belong to that pill;
   a pill that cannot fill a carousel does not render; opening a lens
   never touches the department's own carousels; one pill row per view;
   Casa Aria is a first-class pill on the homepage under its own name.

     node scripts/test/pill-hub-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { PILL_HUBS, LENS_MIN, LENS_RAIL_MIN, RAIL_CARDS, loadDept } from "../../netlify/functions/_department-core.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const DIR = ROOT + "assets/sections/departamento/";
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const json = (f) => JSON.parse(readFileSync(f, "utf8"));

check("every hub's head carries its pill row; every pill has its lens file", () => {
  for (const key of Object.keys(PILL_HUBS)) {
    const head = json(DIR + key + "/head.json");
    assert.ok(Array.isArray(head.pills) && head.pills.length >= 2, `${key}: no pill row`);
    for (const p of head.pills) {
      assert.ok(p.n >= LENS_MIN, `${key}/${p.label}: ${p.n} products`);
      assert.ok(existsSync(DIR + `${key}/lens-${p.k}.json`), `${key}/${p.k}: no lens`);
    }
    const ns = head.pills.map((p) => p.n);
    if (!PILL_HUBS[key].pills) assert.deepEqual(ns, [...ns].sort((a, b) => b - a), `${key}: strongest first`);
  }
  assert.deepEqual(json(DIR + "home_goods/head.json").pills.map((p) => p.label), ["Crate & Barrel", "Pier 1", "Libros de mesa"]);
  assert.equal(json(DIR + "luxury/head.json").pills[0].label, "Dolce & Gabbana");
  assert.deepEqual(json(DIR + "electronics/head.json").pills.map((p) => p.label).sort(), ["B&H Photo", "BrandsMart USA", "Micro Center", "Walmart"]);
});

check("a lens is small, fills real carousels, and shows only its own pill's products", () => {
  for (const key of Object.keys(PILL_HUBS)) {
    const d = loadDept(key, [ROOT]);
    const titles = new Map(d.list.map((p) => [p.retailer + "::" + p.title, p]));
    for (const f of readdirSync(DIR + key).filter((f) => f.startsWith("lens-"))) {
      const raw = readFileSync(DIR + key + "/" + f, "utf8");
      assert.ok(raw.length < 32 * 1024, `${key}/${f} is ${raw.length} bytes`);
      const l = JSON.parse(raw);
      assert.ok(l.rails.length >= 1, `${key}/${f}: empty lens`);
      for (const r of l.rails) {
        assert.ok(r.cards.length >= LENS_RAIL_MIN && r.cards.length <= RAIL_CARDS, `${key}/${f} ${r.title}: ${r.cards.length} cards`);
        for (const c of r.cards) {
          const p = titles.get(c.r + "::" + c.t);
          assert.ok(p, `${key}/${f}: ${c.t} is not in the department`);
          if (key === "luxury") assert.equal(String(p.brand || "").trim(), l.label, `${f}: ${c.t}`);
          if (key === "electronics") assert.equal(l.link, "tienda.html?tienda=" + c.r, `${f}: ${c.t}`);
        }
      }
    }
  }
});

check("the page: the pill row above, the lens above the department's carousels, a lens never touches them", () => {
  const html = readFileSync(ROOT + "departamento.html", "utf8");
  const hub = html.indexOf('id="hubPills"'), tool = html.indexOf('id="toolbar"'), lens = html.indexOf('id="lens"'), rails = html.indexOf('<main id="rails"');
  assert.ok(hub > 0 && hub < tool && tool < lens && lens < rails, "pill row, toolbar, lens, department carousels -- in that order");
  const fn = html.slice(html.indexOf("function openLens(k){"), html.indexOf("hubEl.addEventListener('click'"));
  assert.ok(fn.length > 100, "openLens");
  assert.doesNotMatch(fn, /railsEl|getElementById\('rails'\)|loadAll\(|fRet\s*=/, "the lens must not change the department's carousels");
  assert.match(html, /if \(HUB && HUB\.length\)\{ chipsEl\.innerHTML = ''; chipsEl\.hidden = true; return; \}/, "one pill row per view");
});

check("Casa Aria is a first-class pill on the homepage, under its own name", () => {
  const bundle = readFileSync(ROOT + "build/" + readdirSync(ROOT + "build").find((f) => /^app-[0-9a-f]{16}\.js$/.test(f)), "utf8");
  assert.match(bundle, /\{ key: 'home_goods', label: 'Casa Aria'/);
  const order = /const CATEGORY_TAB_ORDER = \[([^\]]*)\]/.exec(bundle)[1];
  assert.match(order, /'home_goods'/);
  assert.match(order, /^'latino_designers', 'perfumes'/, "Diseñadores Latinos stays first, Perfumes second (c.6483541805)");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

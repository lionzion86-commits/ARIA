/* ==================================================================
   SLEEKSHOP (#443 c.6475799491): the professional hair-treatment shelf.
   In stock only, real photos, a was-price only above the price, no
   title-template copy, courier holds counted, weights from the stated
   size; wired as a store and into Belleza.

     node scripts/test/sleekshop-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { normalizeSleekshop, statedGrams, CAB_BUCKETS } from "../lib/sleekshop.js";
import { RETAILERS } from "../lib/retailers.js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

check("the rules: out of stock, aerosols and relaxers are held; template copy is never shown", () => {
  const base = { store: "sleekshop", availability: "InStock", price: 20, image: "https://x/a.jpg", images: ["https://x/a.jpg"], category: "keratin_treatment", treatment_types: ["keratin"] };
  let n = 0; const r = (title, extra = {}) => ({ ...base, sku: String(++n), title, ...extra });
  const { departments, held } = normalizeSleekshop([
    r("Keratin Smoothing Treatment 16.9 oz", { description_source: "pdp", description: "Tratamiento.", description_en: "Treatment.", compare_at_price: 30, on_sale: true }),
    r("Some Mask", { availability: "OutOfStock" }),
    r("Volume Hairspray Aerosol"),
    r("No-Lye Relaxer Kit"),
    r("Generated One", { description_source: "generated_from_title", description: "Tratamiento de keratina profesional de X: Generated One." }),
  ]);
  const items = Object.values(departments).flatMap((d) => d.items);
  assert.equal(items.length, 2);
  assert.equal(items[0].originalPrice, 30);
  assert.equal(items[1].description, "", "title-template copy shown");
  assert.equal(held["out of stock on its page"], 1);
  assert.equal(held["aerosol (courier ruling)"], 1);
  assert.equal(held["chemical relaxer (courier ruling)"], 1);
  assert.ok(Math.abs(items[0].weightKg - Math.round(16.9 * 29.57 * 1.2 * 1.1 / 10) / 100) < 0.011);
  assert.equal(statedGrams({ title: "Nothing stated" }), 0);
});

check("the committed catalogue: in stock, real photos, honest sales, every item weighed, keratin and alisado shelves", () => {
  const cat = JSON.parse(readFileSync(ROOT + "sleekshop-catalog.json", "utf8"));
  const items = Object.values(cat.retailers.sleekshop.departments).flatMap((d) => d.items);
  assert.ok(items.length > 600);
  for (const k of Object.keys(cat.retailers.sleekshop.departments)) assert.ok(CAB_BUCKETS.includes(k), k);
  for (const it of items) {
    assert.match(it.image, /^https:\/\//);
    assert.ok(it.weightKg > 0 && it.weightEstimated === true, it.name + " unweighed");
    if (it.onSale) assert.ok(it.originalPrice > it.price, it.name);
    assert.doesNotMatch(it.description || "", /^Tratamiento de keratina profesional de /, it.name);
    assert.doesNotMatch(it.name, /\baerosol\b|\brelaxer\b/i);
  }
  assert.ok(items.filter((i) => i.treatment.includes("keratin")).length >= 100);
  assert.ok(items.filter((i) => i.treatment.includes("alisado")).length >= 40);
});

check("wired: registry, app mirror, storefront (Ofertas, then Keratina y alisados), Tiendas, Belleza", () => {
  assert.equal(RETAILERS.sleekshop.label, "SleekShop");
  const bundle = readFileSync(ROOT + "build/" + readdirSync(ROOT + "build").find((f) => /^app-[0-9a-f]{16}\.js$/.test(f)), "utf8");
  assert.match(bundle, /sleekshop:\s+\{ key: 'sleekshop'/);
  assert.match(bundle, /"\/sleekshop-catalog\.json":\["sleekshop"\]/);
  assert.match(readFileSync(ROOT + "tiendas.html", "utf8"), /tienda\.html\?tienda=sleekshop/);
  const ix = JSON.parse(readFileSync(ROOT + "assets/tienda/sleekshop/index.json", "utf8"));
  assert.deepEqual(ix.rails.slice(0, 2).map((r) => r.key), ["ofertas", "d-cab_keratina"]);
  const head = JSON.parse(readFileSync(ROOT + "assets/sections/departamento/beauty/head.json", "utf8"));
  assert.ok(((head.stores.find((s) => s.k === "sleekshop") || {}).n || 0) > 600, "not in Belleza");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

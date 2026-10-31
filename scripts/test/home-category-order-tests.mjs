/* ==================================================================
   CATEGORIES ABOVE STORES ON THE HOMEPAGE (#443 c.6544923338,
   c.6544925153, c.6544934705, c.6544970295; Danny 2026-10-31).

   In both the phone and the desktop tree:
     Ofertas -> Compra por categoría (it does not move) -> Mujer ->
     Hombre -> Niños -> Perfumes -> every category carousel (Electrónica,
     Gym Rat, Fútbol, Fight Club, Beauty, Surf & Skate, Juguetes,
     Zapatos, Lentes, Ropa interior, Lujo, Joyas) -> every store (the
     Walmart tile, Diseñadores Latinos, the store rails).

     node scripts/test/home-category-order-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const mobile = html.slice(html.indexOf('<div id="mobileShopfront"'), html.indexOf('<div id="desktopShopfront"'));
const desktop = html.slice(html.indexOf('<div id="desktopShopfront"'));
const CATEGORIES = ["Electrónica", "Gym Rat", "Fútbol", "Aria Fight Club", "Aria Beauty", "Surf &amp; Skate", "Juguetes", "Zapatos", "Lentes de Sol", "Ropa Interior Mujer", "Ropa Interior Hombre", "Aria Luxury", "Joyas y accesorios"];
const at = (tree, label) => tree.indexOf(`aria-label="${label}"`);

for (const [name, tree] of [["phone", mobile], ["desktop", desktop]]) {
  check(`${name}: Compra por categoría, then Mujer, Hombre, Niños, then Perfumes`, () => {
    const seq = ["Compra por categoría", "Mujer", "Hombre", "Niños", "Aria Perfumes"].map((l) => at(tree, l));
    assert.ok(seq.every((i) => i >= 0), seq.join(","));
    for (let i = 1; i < seq.length; i++) assert.ok(seq[i - 1] < seq[i], `out of order at ${i}`);
  });
  check(`${name}: every category carousel sits under Perfumes and above every store`, () => {
    const perf = at(tree, "Aria Perfumes");
    /* (The desktop page has no Joyas y accesorios band.) */
    for (const l of ["Electrónica", "Gym Rat", "Aria Fight Club", "Juguetes", "Zapatos"]) assert.ok(at(tree, l) >= 0, `${l} missing`);
    const cats = CATEGORIES.map((l) => [l, at(tree, l)]).filter(([, i]) => i >= 0);
    for (const [l, i] of cats) assert.ok(i > perf, `${l} above Perfumes`);
    const lastCat = Math.max(...cats.map(([, i]) => i));
    const stores = [...tree.matchAll(/data-store-rail="([a-z]+)"/g)].map((m) => [m[1], m.index]);
    assert.ok(stores.length >= 10);
    for (const [k, i] of stores) assert.ok(i > lastCat, `the ${k} rail sits above a category`);
    const tile = tree.indexOf('<section aria-label="Walmart" class="relative');
    const latino = at(tree, "Diseñadores Latinos");
    assert.ok(tile > lastCat && latino > lastCat, "the Walmart tile or Diseñadores Latinos above a category");
    assert.ok(at(tree, "Mujer") < tile, "a store above the audiences");
  });
}

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

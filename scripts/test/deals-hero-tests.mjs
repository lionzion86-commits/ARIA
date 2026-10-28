/* ==================================================================
   WALMART DEALS-FIRST HERO (#443 c.6470118615, Danny).

   One big card above the aisles on the Walmart storefront: the deepest
   real markdowns, the discount loud, the store's own photos, every
   photo to its product page and the button to the whole Ofertas rail.
   Held here: only items with a true was-price, «Hasta X%» is the largest
   discount the card shows, each badge is the item's own discount, one
   hero and no other store gets one by accident.

     node scripts/test/deals-hero-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { DEALS_HERO_STORES, DEALS_HERO_ITEMS, dealsHero } from "../build-store-slices.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const ix = (k) => JSON.parse(readFileSync(ROOT + `assets/tienda/${k}/index.json`, "utf8"));

check("Walmart's hero: real markdowns only, «Hasta X%» is the deepest shown, each badge is its own item's", () => {
  const h = ix("walmart").hero;
  assert.ok(h, "no hero");
  assert.equal(h.items.length, DEALS_HERO_ITEMS);
  for (const it of h.items) {
    assert.ok(it.was > it.price, `${it.name}: no true was-price`);
    assert.equal(it.pct, Math.round((1 - it.price / it.was) * 100), `${it.name}: badge ${it.pct}% is not its discount`);
    assert.match(it.image, /^https:\/\//);
  }
  assert.equal(h.pct, Math.max(...h.items.map((i) => i.pct)));
});

check("the picker: a row without a was-price or a photo never leads; too few deals, no hero", () => {
  const rows = [["A", "", 10, 0, 50, "https://x/a.jpg"], ["B", "", 10, 20, 50, ""], ["C", "", 10, 40, 75, "https://x/c.jpg"],
    ["D", "", 10, 20, 50, "https://x/d.jpg"], ["E", "", 30, 40, 25, "https://x/e.jpg"], ["F", "", 9, 10, 10, "https://x/f.jpg"]];
  const h = dealsHero(rows, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(h.items.map((i) => i.name), ["C", "D", "E", "F"]);
  assert.equal(h.pct, 75);
  assert.equal(dealsHero(rows.slice(0, 3), [0, 1, 2]), null);
});

check("one hero, and only where ordered", () => {
  const others = readdirSync(ROOT + "assets/tienda").filter((k) => !DEALS_HERO_STORES.has(k) && existsSync(ROOT + `assets/tienda/${k}/index.json`));
  assert.deepEqual(others.filter((k) => ix(k).hero), []);
  const page = readFileSync(ROOT + "tienda.html", "utf8");
  assert.match(page, /var html = slHeroHTML\(slIndex\.hero\);/, "the hero leads the storefront");
  assert.match(page, /slOpenRail\('ofertas'\)/, "the button opens the whole Ofertas rail");
  assert.doesNotMatch(page, /patrocinad|sponsored/i, "no sponsored tiles");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

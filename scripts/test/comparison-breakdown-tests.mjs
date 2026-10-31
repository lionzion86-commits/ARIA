/* ==================================================================
   THE COMPARISON BREAKDOWN AND ITS COVERAGE (#443 c.6544784090,
   c.6544789562, c.6544792632, ruling c.6544802256).

     - every row: Producto (the product page's headline) and Envío de
       la tienda (fee, GRATIS, "lo calcula la tienda al pagar" or "por
       confirmar", with the free-shipping line); no freight, no door
       total (Amendment 2, c.6544862981);
     - badges: Mejor precio, Envío más barato, Mejor costo hasta Miami;
     - one chart per model (c.6544967818): brand + model + wearer, the
       colourway set aside; the style family confirms.

     node scripts/test/comparison-breakdown-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
const ROOT = new URL("../../", import.meta.url).pathname;
process.chdir(ROOT);
const core = await import("../../netlify/functions/_search-core.js");
const { cartLineFor } = await import("../../netlify/functions/_door-price.js");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const ctx = core.buildSearchContext();
const FX = 3.4;
const r2 = (n) => Math.round(Number(n) * 100) / 100;

await check("store shipping per row: a fee, GRATIS, calculated at the store's checkout, or unknown -- with the free-shipping line", () => {
  const ship = (retailer, usd) => core.shippingOf(cartLineFor({ retailer, title: "x", cardUsd: usd, rawUsd: usd, taxRate: 1.07 }));
  assert.deepEqual(ship("ccs", 38), { state: "fee", usd: 7.95, freeOverUsd: 75 });
  assert.equal(ship("ccs", 90).state, "free", "over the store's free-shipping line");
  assert.deepEqual(ship("zumiez", 40), { state: "calc", usd: null, freeOverUsd: 64.94 });
  assert.equal(ship("bhphoto", 40).state, "free");
  assert.equal(ship("a-store-with-no-terms", 40).state, "unknown");
  /* Foot Locker's public rule (#443 c.6547441472): $7.99 under $99, free from $99. */
  assert.deepEqual(ship("footlocker", 60), { state: "fee", usd: 7.99, freeOverUsd: 99 });
  assert.equal(ship("footlocker", 120).state, "free");
});

await check("Danny's example: CCS holds Mejor precio and Mejor costo hasta Miami; the chart carries no freight and no door total", () => {
  const o = core.searchPage(ctx, "adidas puig samba", 1, { fx: FX });
  const c = o.compares.find((x) => x.stores.some((s) => s.store === "ccs") && x.stores.some((s) => s.store === "zumiez"));
  assert.ok(c);
  const ccs = c.stores.find((s) => s.store === "ccs"), zu = c.stores.find((s) => s.store === "zumiez");
  assert.equal(ccs.ship.state, "fee");
  assert.equal(zu.ship.state, "calc");
  assert.ok(ccs.best && ccs.bestCost && !zu.best && !zu.bestCost);
  for (const s of c.stores) assert.ok(!("door" in s), "a door total on a browse surface");
});

await check("badges follow the components: free shipping can flip the cost to Miami; an unknown shipping can block it", () => {
  const row = (store, usd, ship) => ({ store, usd, ship });
  let rows = core.badgeRows([row("a", 40, { state: "fee", usd: 12 }), row("b", 45, { state: "free", usd: 0 })]);
  assert.ok(rows[0].best && !rows[0].bestCost && !rows[0].cheapShip);
  assert.ok(rows[1].bestCost && rows[1].cheapShip && !rows[1].best);
  /* A store whose shipping is unknown at a lower product price could still be cheaper. */
  rows = core.badgeRows([row("a", 40, { state: "fee", usd: 8 }), row("b", 30, { state: "calc", usd: null })]);
  assert.ok(!rows.some((x) => x.bestCost) && rows[1].best);
  rows = core.badgeRows([row("a", 40, { state: "free", usd: 0 }), row("b", 40, { state: "free", usd: 0 })]);
  assert.ok(!rows.some((x) => x.best || x.cheapShip || x.bestCost), "ties hold no badge");
});

await check("one chart per model: Air Force 1 '07 and Air Force 1 Low are two charts; sizes never meet; identical twins group", () => {
  const o = core.searchPage(ctx, "nike air force 1", 1, { fx: FX });
  assert.ok(o.compares.length >= 2, `${o.compares.length} charts`);
  const keys = o.compares.map((c) => new Set(c.stores.map((s) => core.modelKey(ctx, { title: s.title, brand: "Nike" }))));
  for (const k of keys) assert.equal(k.size, 1, "a chart mixes models: " + [...k].join(" / "));
  assert.equal(new Set(keys.map((k) => [...k][0])).size, keys.length, "two charts of one model");
  const K = (title, brand = "Vans") => core.modelKey(ctx, { title, brand });
  assert.equal(K("Vans Authentic"), K("Authentic - Navy"), "Vans Authentic at two stores");
  assert.notEqual(K("Vans Authentic"), K("Vans Skate Authentic"), "the Skate line is another model");
  assert.notEqual(K("Vans Old Skool - Women's"), K("Old Skool"));
  assert.notEqual(K("Vans Knu Skool - Girls' Preschool"), K("Toddler Knu Skool"), "preschool and toddler sizes");
  assert.equal(K("Vans Old Skool - Men's"), K("Old Skool"), "men's and unlabelled are the adult shoe");
  assert.equal(K("Nike Air Force 1 '07 - Men's", "Nike"), K("White Air Force 1 '07 Sneakers", "Nike"));
  assert.notEqual(K("Nike Air Force 1 '07", "Nike"), K("Air Force 1 Low '07", "Nike"));
  const twins = core.searchPage(ctx, "vans authentic", 1, { fx: FX }).compares;
  assert.ok(twins.some((c) => c.stores.length >= 3 && c.stores.every((s) => K(s.title) === K("Vans Authentic"))), "the plain Vans Authentic does not group");
});

await check("the maker's style code: read from the store's photo file, per colourway", () => {
  const sc = (brand, title, image) => core.styleCodeOf({ brand, title, image });
  assert.equal(sc("Nike", "Men's Nike Tech Fleece Jogger Pants", "https://media.finishline.com/s/finishline/HV0959_010?$App_L$"), "nike:HV0959-010");
  assert.equal(sc("Nike", "Nike Phantom 6 High Elite", "https://x/files/phantom-6-high-elite-firm-ground-soccer-cleats-hj2147-400.jpg?v=1"), "nike:HJ2147-400");
  assert.equal(sc("adidas", "Girls' Club Tennis Tank", "https://x/files/JY1882_1.webp?v=1"), "adidas:JY1882");
  assert.equal(sc("Vans", "Authentic Chino Relaxed Pant", "https://x/files/VN0A5FJ8_1M7_HERO.webp?v=1"), "vans:VN0A5FJ8-1M7");
  assert.equal(sc("Reef", "Cushion Breeze", "https://x/files/AB1234_1.jpg"), null, "no code read for a brand without a known code shape");
});

await check("the style family confirms: one family joins listings whatever their titles say; two families never join", () => {
  const P = (retailer, brand, title, image, price = 100) => ({ retailer, brand, title, image, price, originalPrice: price });
  const a = P("finishline", "Nike", "Men's Nike Tech Fleece Jogger Pants", "https://m/finishline/HV0959_010");
  const b = P("snipes", "Nike", "Tech Fleece Joggers", "https://m/images/hi-res/nike_hv0959-063_01.jpg");
  const g = core.productGroups(ctx, [a, b]);
  assert.equal(g.length, 1);
  assert.equal(core.comparableMembers(g[0]).length, 2);
  const c = P("ccs", "Nike", "Nike SB Dunk Low Pro - Black/White", "https://x/files/HF3704-001.jpg");
  const d = P("zumiez", "Nike", "Nike SB Dunk Low Pro Black & White", "https://x/files/HQ1625-100.jpg");
  assert.equal(core.productGroups(ctx, [c, d]).length, 0);
});

await check("coverage: the index groups far more models than exact titles did", () => {
  const groups = core.productGroups(ctx, ctx.products).map(core.comparableMembers).filter(Boolean);
  assert.ok(groups.length >= 1000, `${groups.length} groups`);
  for (const g of groups.slice(0, 500)) assert.equal(new Set(g.map((p) => p.retailer)).size, g.length, "one listing per store");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

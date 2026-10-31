/* ==================================================================
   THE COMPARISON BREAKDOWN AND ITS COVERAGE (#443 c.6544784090,
   c.6544789562, c.6544792632, ruling c.6544802256).

     - every row: Producto (the product page's headline), Envío de la
       tienda (fee, GRATIS, "lo calcula la tienda al pagar" or "por
       confirmar" -- never a silent $0), Flete, tax, and the total as the
       SUM; partial while the store's shipping is unknown;
     - badges: Mejor precio (product), Envío más barato, Mejor total --
       a partial total is a floor, so it can block a Mejor total;
     - the maker's style code groups listings whatever their titles say;
       two codes never group; a short model name without its colour
       never groups on the title alone.

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

await check("store shipping per row: a fee, GRATIS, calculated at the store's checkout, or unknown -- never a silent $0", () => {
  const ship = (retailer, usd) => core.shippingOf(cartLineFor({ retailer, title: "x", cardUsd: usd, rawUsd: usd, taxRate: 1.07 }));
  assert.deepEqual(ship("ccs", 38), { state: "fee", usd: 7.95 });
  assert.deepEqual(ship("ccs", 90), { state: "free", usd: 0 }, "over the store's free-shipping line");
  assert.equal(ship("zumiez", 40).state, "calc");
  assert.equal(ship("bhphoto", 40).state, "free");
  assert.equal(ship("a-store-with-no-terms", 40).state, "unknown");
});

await check("Danny's worked example: the Puig Samba rows add up, CCS holds Mejor precio and Mejor total, Zumiez is partial", () => {
  const c = core.searchPage(ctx, "adidas puig samba", 1, { fx: FX }).compare;
  assert.ok(c && c.stores.length >= 2);
  const ccs = c.stores.find((s) => s.store === "ccs"), zu = c.stores.find((s) => s.store === "zumiez");
  assert.ok(ccs && zu);
  for (const s of c.stores) {
    if (!s.door) continue;
    assert.equal(r2(s.door.goodsUsd), r2(s.usd), s.store + ": the product line is not the card price");
    assert.equal(r2(s.door.goodsUsd + (s.ship.state === "fee" ? s.ship.usd : 0) + s.door.freightUsd + s.door.taxUsd), r2(s.door.usd), s.store + ": the total is not the sum of its lines");
  }
  assert.equal(ccs.ship.state, "fee");
  assert.equal(zu.ship.state, "calc");
  assert.ok(zu.door.partial && !ccs.door.partial);
  assert.ok(ccs.best && ccs.bestTotal && !zu.best && !zu.bestTotal);
});

await check("badges follow the components: free shipping can flip the total; a partial total blocks a Mejor total it could undercut", () => {
  const row = (store, usd, ship, total, partial = false) => ({ store, usd, ship, door: { usd: total, partial } });
  /* Cheapest shoe, paid shipping -- the pricier shoe with free shipping wins at the door. */
  let rows = core.badgeRows([row("a", 40, { state: "fee", usd: 12 }, 70), row("b", 45, { state: "free", usd: 0 }, 62)]);
  assert.ok(rows[0].best && !rows[0].bestTotal && !rows[0].cheapShip);
  assert.ok(rows[1].bestTotal && rows[1].cheapShip && !rows[1].best);
  /* A partial total under the best complete one: nobody holds Mejor total. */
  rows = core.badgeRows([row("a", 40, { state: "fee", usd: 8 }, 70), row("b", 30, { state: "calc", usd: null }, 50, true)]);
  assert.ok(!rows.some((x) => x.bestTotal));
  /* Ties hold no badge. */
  rows = core.badgeRows([row("a", 40, { state: "free", usd: 0 }, 60), row("b", 40, { state: "free", usd: 0 }, 60)]);
  assert.ok(!rows.some((x) => x.best || x.cheapShip || x.bestTotal));
});

await check("the maker's style code: read from the store's photo file, per colourway", () => {
  const sc = (brand, title, image) => core.styleCodeOf({ brand, title, image });
  assert.equal(sc("Nike", "Men's Nike Tech Fleece Jogger Pants", "https://media.finishline.com/s/finishline/HV0959_010?$App_L$"), "nike:HV0959-010");
  assert.equal(sc("Nike", "Nike Phantom 6 High Elite", "https://x/files/phantom-6-high-elite-firm-ground-soccer-cleats-hj2147-400.jpg?v=1"), "nike:HJ2147-400");
  assert.equal(sc("adidas", "Girls' Club Tennis Tank", "https://x/files/JY1882_1.webp?v=1"), "adidas:JY1882");
  assert.equal(sc("Vans", "Authentic Chino Relaxed Pant", "https://x/files/VN0A5FJ8_1M7_HERO.webp?v=1"), "vans:VN0A5FJ8-1M7");
  assert.equal(sc("Reef", "Cushion Breeze", "https://x/files/AB1234_1.jpg"), null, "no code read for a brand without a known code shape");
});

await check("a code match groups across titles; two codes never group; a short colourless model never groups on its title", () => {
  const P = (retailer, brand, title, image, price = 100) => ({ retailer, brand, title, image, price, originalPrice: price });
  const a = P("finishline", "Nike", "Men's Nike Tech Fleece Jogger Pants", "https://m/finishline/HV0959_010");
  const b = P("snipes", "Nike", "Tech Fleece Joggers", "https://m/images/hi-res/nike_hv0959-010_01.jpg");
  const g = core.productGroups(ctx, [a, b]);
  assert.equal(g.length, 1);
  assert.equal(core.comparableMembers(g[0]).length, 2);
  /* Same title, different colourway codes: not one product. */
  const c = P("ccs", "Nike", "Nike SB Dunk Low Pro - Black/White", "https://x/files/HF3704-001.jpg");
  const d = P("zumiez", "Nike", "Nike SB Dunk Low Pro Black & White", "https://x/files/HF3704-100.jpg");
  assert.equal(core.productGroups(ctx, [c, d]).length, 0);
  /* "Old Skool" names a model, not a colourway. */
  assert.equal(core.sameProductKey(ctx, P("mainland", "Vans", "Vans Skate Old Skool Shoes", "")), null);
  assert.ok(core.sameProductKey(ctx, P("ccs", "Vans", "Vans Skate Half Cab Shoes - Saw Red/Black", "")));
  /* A designer's three-word style names its print. */
  assert.ok(core.sameProductKey(ctx, P("farfetch", "Agua Bendita", "Espinela Gema Maxi Dress", "")));
  /* Store dressing: a season tag and roman numerals. */
  assert.equal(core.sameProductKey(ctx, P("a", "Nike", "Nike Phantom GX II Academy IC - Black/Gold (SU25)", "")),
    core.sameProductKey(ctx, P("b", "Nike", "Nike Phantom GX 2 Academy IC Black Gold", "")));
});

await check("coverage: the index groups more products than title matching alone, the codes doing the new work", () => {
  const groups = core.productGroups(ctx, ctx.products).map(core.comparableMembers).filter(Boolean);
  const coded = groups.filter((g) => g.every((p) => core.styleCodeOf(p)) && new Set(g.map(core.styleCodeOf)).size === 1);
  assert.ok(groups.length >= 780, `${groups.length} groups`);
  assert.ok(coded.length >= 50, `${coded.length} code-backed groups`);
  for (const g of coded) assert.equal(new Set(g.map((p) => p.retailer)).size, g.length, "one listing per store");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

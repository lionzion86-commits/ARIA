/* ==================================================================
   CASA ARIA (#443 c.6458486219, build order c.6459811185): Crate &
   Barrel and Pier 1 from the 2026-10-27 pulls, light home only, inside
   the Hogar wing with the Libros de mesa halo and the Navidad wedge.

   Pins the slice rules (no furniture, rugs or pieces over 5 kg with the
   estimate; no estimate, no product), the catalogues (the stores' own
   photos and prices, was-prices only where the store printed one,
   Spanish only), the wiring, and the wing's order.

     node scripts/test/casa-aria-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCrateAndBarrel, normalizePier1, isLightHomeCategory, estimateWeight, WEIGHT_CAP_KG } from "../lib/home-pull-normalize.js";
import { RETAILERS } from "../lib/retailers.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), "utf8");
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

const p1 = (o) => ({ type: "product", status: "ok", availability: "in_stock", inStock: true, currency: "USD", price: 30, url: "https://www.pier1.com/products/x" + Math.random(),
  image: "http://www.pier1.com/cdn/shop/files/a.jpg", description: "Buy X for only $30 at Pier 1!", ...o });
check("light home only: furniture, rugs, the Rewards product, out of stock and anything over 5 kg are cut", () => {
  const { items, skipped } = normalizePier1([
    p1({ name: "Gold Pillar Candle - Pier 1", category: "Pillar Candles" }),
    p1({ name: "Rattan Accent Chair - Pier 1", category: "Accent Chairs" }),
    p1({ name: "Jute Area Rug 5x8 - Pier 1", category: "Indoor Rugs" }),
    p1({ name: "Pier 1 Rewards", category: "Rewards", price: 9.99 }),
    p1({ name: "Velvet Pillow - Pier 1", category: "Square Pillows", availability: "out_of_stock", inStock: false }),
    p1({ name: "Flocked Santa Figurine - Pier 1", category: "Decor" }),
  ]);
  assert.deepEqual(items.map((i) => i.name).sort(), ["Flocked Santa Figurine", "Gold Pillar Candle"]);
  assert.equal(items.find((i) => i.name.startsWith("Flocked")).aisle, "casa_navidad", "a Santa figurine is Navidad");
  assert.ok(skipped["not light home"] === 2 && skipped["out of stock"] === 1 && skipped.junk === 1, JSON.stringify(skipped));
  const candle = items.find((i) => i.name.startsWith("Gold"));
  assert.equal(candle.image, "https://www.pier1.com/cdn/shop/files/a.jpg", "only the scheme changes");
  assert.equal(candle.description_en, "", "Pier 1's \"Buy X for only\" template is not copy");
  assert.equal(isLightHomeCategory("Table Runners"), true);
  assert.equal(isLightHomeCategory("Coffee Tables"), false);
  assert.ok(estimateWeight("Cookware Sets") > WEIGHT_CAP_KG, "a cookware set is over the cap");
  assert.equal(estimateWeight("Hand-carved Teak Thing"), null, "no defensible estimate, no product");
});

check("Crate & Barrel: a was-price only where the store printed \"reg.\", the lowest of each range", () => {
  const row = (o) => ({ productTitle: "Marin Mug", sku: String(Math.random()), price: 19.97, currency: "USD", category_name: "Coffee Mugs & Tea Cups",
    image: "https://cb.scene7.com/is/image/Crate/x", images: ["https://cb.scene7.com/is/image/Crate/x"], ...o });
  const { items } = normalizeCrateAndBarrel([
    row({ formatted_price: "Clearance $19.97 - $34.97 reg. $39.95 - $69.95" }),
    row({ productTitle: "Geranium Candle", category_name: "Scented Candles & Diffusers", formatted_price: "$24.95", on_sale: true }),
  ]);
  assert.equal(items[0].originalPrice, 39.95);
  assert.equal(items[1].originalPrice, undefined, "on_sale with no printed regular price is not a sale");
});

const cat = (k) => Object.values(JSON.parse(read(k + "-catalog.json")).retailers[k].departments).flatMap((d) => d.items);
check("the catalogues: the stores' photos and prices, every piece under 5 kg with a flagged estimate, nothing in English", () => {
  for (const k of ["crateandbarrel", "pier1"]) {
    const items = cat(k);
    assert.ok(items.length > 1000, `${k}: ${items.length}`);
    for (const it of items) {
      assert.match(it.image, /^https:\/\//, it.name);
      assert.ok(it.price > 0, it.name);
      assert.ok(it.weightKg > 0 && it.weightKg <= WEIGHT_CAP_KG && it.weightEstimated === true && it.weightBasis, `${it.name}: ${it.weightKg}`);
      assert.ok(!it.description, `${it.name} shows English`);
      assert.ok(!it.originalPrice || it.originalPrice > it.price, `${it.name}: a was-price at or under the price`);
      assert.ok(isLightHomeCategory(it.type), `${it.name} (${it.type}) is not light home`);
      assert.equal(it.retailer, k);
    }
  }
});

check("wiring: registry, the app's mirror and catalogue lists, the storefronts, the product page, the directory, what Aria knows", () => {
  for (const k of ["crateandbarrel", "pier1"]) {
    assert.ok(RETAILERS[k], k + " not in the registry");
    const bundle = read("build/" + readdirSync(join(ROOT, "build")).find((f) => /^app-[0-9a-f]{16}\.js$/.test(f)));
    assert.ok(new RegExp(k + ":\\s+\\{ key: '" + k + "'").test(bundle), k + " not in the app's registry");
    assert.ok(bundle.includes(`'/${k}-catalog.json'`) && bundle.includes(`"/${k}-catalog.json":["${k}"]`), k + " not in CATALOGUE_FILES/SOURCE_RETAILERS");
    const stores = JSON.parse(/var STORES = (\{.*\});/.exec(read("tienda.html"))[1]);
    assert.ok(stores[k] && stores[k].files[0] === `/${k}-catalog.json`, k + " storefront");
    assert.ok(read("producto.html").includes(`"${k}": ["/${k}-catalog.json"]`), k + " product page");
    assert.ok(read("tiendas.html").includes(`tienda.html?tienda=${k}"`), k + " directory");
  }
});

check("the wing: Libros de mesa, then Crate & Barrel and Pier 1, then Navidad in season, then Ofertas and the aisles", () => {
  const head = JSON.parse(read("assets/sections/departamento/home_goods/head.json"));
  const titles = head.rails.map((r) => r.title);
  const at = (t) => titles.indexOf(t);
  for (const t of ["Libros de mesa", "Crate & Barrel", "Pier 1", "Navidad", "Mesa y vajilla"]) assert.ok(at(t) > -1, t + " missing");
  assert.ok(at("Libros de mesa") < at("Crate & Barrel") && at("Crate & Barrel") < at("Pier 1") && at("Pier 1") < at("Navidad"), "the wing's order");
  assert.ok(read("departamento.html").includes("home_goods:      {name:'Casa Aria'"), "Hogar is not named Casa Aria");
  const fn = JSON.parse(read("assets/sections/departamento/_fn/home_goods.json"));
  assert.ok(fn.rows.filter((r) => r[9] === "libros").length >= 400, "the 481 coffee-table books are not the halo");
});

check("home fragrance is Casa Aria's, not Perfumes'", () => {
  const rows = JSON.parse(read("assets/sections/departamento/_fn/perfumes.json")).rows;
  const leaked = rows.filter((r) => r[2] === "pier1" || r[2] === "crateandbarrel").map((r) => r[0]);
  assert.deepEqual(leaked, []);
});

check("the storefronts open on the stores' own Ofertas", () => {
  for (const k of ["crateandbarrel", "pier1"]) {
    const ix = JSON.parse(read(`assets/tienda/${k}/index.json`));
    assert.equal(ix.rails[0].key, "ofertas", k);
    assert.ok(ix.rails.some((r) => r.key === "d-casa_mesa"), k + " has no Mesa y vajilla aisle");
  }
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

/* ==================================================================
   BRANDSMART USA (Build Order B, #443): the electronics anchor.

   Held here: the 220 V gate sells only what is rated for Peru or is not
   mains-powered; nothing out of scope or held reaches the catalogue; the
   sale flag is the store's own compare-at price; the store is wired
   everywhere a store is (registry, app mirror, storefront, Tiendas, the
   second wide anchor card, Electrónica).

     node scripts/test/brandsmart-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { voltageGate, normalizeBrandsmart, TECH_BUCKETS } from "../lib/brandsmart.js";
import { RETAILERS } from "../lib/retailers.js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const row = (name, subcategory, extra = {}) => ({ name, subcategory, descriptionEn: "", ...extra });

check("the 220 V gate: rated or not mains sells; unstated mains is held, never guessed", () => {
  const sells = [
    row("DualSense Wireless Controller for PS5, PC, Mac & Mobile - Rhythm Blue", "gaming"),
    row("16\" 512GB SSD 16GB RAM Ryzen AI 5 Laptop", "computers-tablets", { descriptionEn: "65W AC adapter included" }),
    row("6.3\" iPhone 17 Pro 256GB", "phones"),
    row("Upper Arm Blood Pressure Monitor", "computers-tablets"),
    row("Extendable Soundbar Wall Mount Designed for Sonos Arc", "audio-speakers"),
    row("6.5-inch 2-Way Car Speakers", "car-audio"),
    row("2-Port PowerPort 24W Wall Charger - White", "phones", { voltageClass: "covers-220v" }),
  ];
  for (const r of sells) assert.equal(voltageGate(r), "sell", r.name);
  const held = [
    row("1.7L Honeycomb Collection Rapid Boil Electric Cordless Kettle", "small-appliances"),
    row("6-Outlet Surge Protector With 2 USB Charging Ports", "accessories-power"),
    row("Arc Ultra Premium Smart Soundbar - Black", "audio-speakers"),
    row("27\" Odyssey G4 FHD 240Hz Gaming Monitor", "gaming"),
    row("Series S Digital Edition Console", "gaming"),
    row("PowerElite 100W GaN Wall Charger", "phones"),
    row("Samsung Q-Series Soundbar HW-Q990F with Subwoofer", "car-audio"),
  ];
  for (const r of held) assert.equal(voltageGate(r), "held-voltage-unstated", r.name);
  assert.equal(voltageGate(row("Electric Egg Cooker", "small-appliances", { flag110vOnly: true })), "excluded-110v");
});

check("the normalizer: scope, lithium cargo, locked refurbished phones and photos are held, with a reason", () => {
  const base = { type: "product", availability: "in_stock", inStock: true, currency: "USD", price: 99,
    image: "https://cdn.shopify.com/s/files/1/x.jpg", images: ["https://cdn.shopify.com/s/files/1/x.jpg"] };
  let id = 0;
  const r = (name, subcategory, extra = {}) => ({ ...base, productId: String(++id), name, subcategory, ...extra });
  const { departments, held } = normalizeBrandsmart([
    r("65\" QLED 4K TV", "audio-speakers", { outOfScope: true }),
    r("14-Piece Knife Block Set", "kitchen-food-prep"),
    r("Explorer 1000 v2 Portable Power Station", "phones"),
    r("iPhone 13 128GB Refurbished Locked to Verizon", "phones"),
    r("Earbuds", "headphones", { image: "", images: [] }),
    r("OpenDots 2 True Wireless Earbuds", "headphones", { onSale: true, compareAtPrice: 149, price: 99 }),
  ]);
  assert.deepEqual(Object.keys(departments), ["tech_audifonos"]);
  const it = departments.tech_audifonos.items[0];
  assert.equal(it.originalPrice, 149);
  assert.equal(it.onSale, true);
  assert.equal(held["out-of-scope (TV / large appliance)"], 1);
  assert.equal(held["kitchen food-prep (not the electronics core)"], 1);
  assert.equal(held["lithium cargo (courier ruling)"], 1);
  assert.equal(held["refurbished phone not unlocked"], 1);
  assert.equal(held["no photo"], 1);
});

check("the committed catalogue: real Shopify photos, Spanish copy, truthful sale flags, nothing held got in", () => {
  const cat = JSON.parse(readFileSync(ROOT + "brandsmart-catalog.json", "utf8"));
  const deps = cat.retailers.brandsmart.departments;
  const items = Object.values(deps).flatMap((d) => d.items);
  assert.equal(items.length, cat.declaredProductCount);
  assert.ok(items.length > 1000, `only ${items.length}`);
  assert.ok(items.filter((i) => i.description).length / items.length > 0.99, "Spanish copy on nearly every product");
  for (const k of Object.keys(deps)) assert.ok(TECH_BUCKETS.includes(k), k);
  assert.ok(!deps.tech_electro, "no small appliance passes without a stated 220 V rating in this pull");
  for (const it of items) {
    assert.match(it.image, /^https:\/\/cdn\.shopify\.com\//, it.name);
    assert.ok(!it.description || it.description !== it.description_en, `${it.name}: English shown as copy`);
    assert.ok(it.price > 0);
    if (it.onSale) assert.ok(it.originalPrice > it.price, `${it.name}: sale without a higher was-price`);
    /* A soundbar's bracket is not a soundbar. */
    if (!/\b(mounts?|brackets?|stands?)\b/i.test(it.name)) assert.doesNotMatch(it.name, /\b(surge protector|power strip|soundbar|power station)\b/i, it.name);
  }
});

check("wired everywhere a store is: registry, app mirror, storefront, Tiendas, the second anchor card, Electrónica", () => {
  assert.equal(RETAILERS.brandsmart.label, "BrandsMart USA");
  assert.equal(RETAILERS.brandsmart.logo, null, "no drawn logo: the wordmark until the real mark is committed");
  const bundle = readdirSync(ROOT + "build").find((f) => /^app-[0-9a-f]{16}\.js$/.test(f));
  const src = readFileSync(ROOT + "build/" + bundle, "utf8");
  assert.match(src, /brandsmart:\s+\{ key: 'brandsmart',\s+label: 'BrandsMart USA'/);
  assert.match(src, /"\/brandsmart-catalog\.json":\["brandsmart"\]/);
  assert.match(readFileSync(ROOT + "tienda.html", "utf8"), /"brandsmart": \{"label": "BrandsMart USA"/);
  assert.match(readFileSync(ROOT + "tiendas.html", "utf8"), /tienda\.html\?tienda=brandsmart/);
  const html = readFileSync(ROOT + "index.html", "utf8");
  /* Off the homepage (Danny, #443 c.6539449309): a single South Florida
     store; its products live in Electrónica. */
  assert.equal((html.match(/tiendaJump\('brandsmart'\)/g) || []).length, 0, "no BrandsMart card on the homepage");
  const ix = JSON.parse(readFileSync(ROOT + "assets/tienda/brandsmart/index.json", "utf8"));
  assert.equal(ix.rails[0].key, "ofertas", "Ofertas first where real sale prices exist");
  const head = JSON.parse(readFileSync(ROOT + "assets/sections/departamento/electronics/head.json", "utf8"));
  const n = (head.stores.find((s) => s.k === "brandsmart") || {}).n || 0;
  assert.ok(n > 1000, `Electrónica holds ${n} BrandsMart products`);
  /* ...and nowhere a keyword would mis-file it: only Electrónica and
     Reacondicionados (a laptop case is not jewellery). */
  const homes = readdirSync(ROOT + "assets/sections/departamento").filter((d) => d !== "_fn")
    .filter((d) => { try { return JSON.parse(readFileSync(ROOT + `assets/sections/departamento/${d}/head.json`, "utf8")).stores.some((s) => s.k === "brandsmart"); } catch { return false; } });
  assert.deepEqual(homes.sort(), ["electronics", "reacondicionados"]);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

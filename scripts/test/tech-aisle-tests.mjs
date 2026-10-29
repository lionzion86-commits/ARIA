/* ==================================================================
   ELECTRÓNICA BY PRODUCT TYPE (#443 Order C; the BrandsMart aisle-truth
   audit c.6476569113): one aisle rule for every electronics store, the
   220 V gate, carrier-locked phones held, and Lucifer's acceptance lines
   -- first screens handsets-only / computers-only, zero fishing in
   Electrónica, no Ring/Wyze in Cámaras, no soundbars in Audio para auto.

     node scripts/test/tech-aisle-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { techAisle, isTechProduct } from "../lib/tech-aisle.js";
import { RETAILERS } from "../lib/retailers.js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const cat = (f, k) => JSON.parse(readFileSync(ROOT + f, "utf8")).retailers[k].departments;

check("the type rule: a device, not what fits it", () => {
  const want = {
    "iPhone 16 Pro 256GB Unlocked": "tech_celulares", "OtterBox Defender Case for iPhone 16": "tech_accesorios",
    "Anker 20W USB-C Wall Charger": "tech_accesorios", "HP 14 inch Laptop Intel N150": "tech_computadoras",
    "Restored Apple iPad 8th Gen 32GB Wi-Fi + Cellular (Unlocked)": "tech_computadoras",
    "Sport Band for Apple Watch": "tech_accesorios", "Apple Watch Series 10 GPS 46mm": "tech_relojes",
    "Ring Spotlight Cam Plus": "tech_casa_inteligente", "Wyze Cam v4 Wi-Fi Camera": "tech_casa_inteligente",
    "Samsung Q-Series Soundbar HW-Q990F": "tech_audio", "Garmin Dash Cam 67W": "tech_auto",
    "Gaming Headset for PC PS4 PS5 Laptop": "tech_audifonos", "Samsung 990 PRO 2TB NVMe SSD": "tech_componentes",
    "SanDisk Extreme Portable SSD 1TB": "tech_accesorios", "Samsung Galaxy A56 5G 256GB+8GB RAM Unlocked": "tech_celulares",
    "Energizer MAX AA Batteries 24 Pack": "tech_accesorios", "GoPro HERO13 Black": "tech_camaras",
  };
  for (const [n, a] of Object.entries(want)) assert.equal(techAisle(n), a, n);
  assert.equal(isTechProduct("Fishing Tackle Bag"), false);
  assert.equal(isTechProduct("Office Depot Stapler"), false);
});

const STORES = [["brandsmart-catalog.json", "brandsmart"], ["walmart-electronics-catalog.json", "walmart"],
  ["microcenter-catalog.json", "microcenter"], ["costco-electronics-catalog.json", "costco"]];
check("acceptance: Celulares handsets only, Computadoras computers only, no fishing, no security cams in Cámaras, no soundbars in Audio para auto", () => {
  for (const [f, k] of STORES) {
    const d = cat(f, k);
    const names = (a) => (d[a] ? d[a].items.map((i) => i.name) : []);
    /* Positive, not a word list: every Celulares item names a handset and
       every Computadoras item a computer ("Backlit Keyboard" is a laptop's
       spec, "+ Free Car Charger" a phone's bundle). A name that LEADS with
       an accessory word is never there. */
    const LEADS_ACC = /^\W*(\S+\s){0,4}?(case|cover|charger|cable|screen protector|holder|mount|keyboard|mouse|backpack|sleeve|stand)\b/i;
    for (const n of names("tech_celulares")) {
      assert.match(n, /\b(phone|smartphone|iphone|galaxy|pixel|moto|razr|unlocked|5g|4g|lte|gsm|dual sim)\b/i, `${k} Celulares: ${n}`);
      assert.doesNotMatch(n.replace(/\s(\+|with|includes?)\s.*$/i, ""), /\b(case|cover|screen protector|holder|mount)$/i, `${k} Celulares: ${n}`);
    }
    for (const n of names("tech_computadoras")) {
      assert.match(n, /\b(laptops?|notebooks?|chromebooks?|macbook|ultrabook|2-in-1|desktop|all-in-one|aio|pc|computer|imac|mac mini|tablets?|ipad|galaxy tab|fire (hd|max)|kindle|e-?reader|surface)\b/i, `${k} Computadoras: ${n}`);
      assert.doesNotMatch(n.replace(/\s(with|for|\+)\s.*$/i, ""), LEADS_ACC, `${k} Computadoras: ${n}`);
    }
    for (const n of Object.values(d).flatMap((x) => x.items.map((i) => i.name))) assert.doesNotMatch(n, /\bfishing\b|\btackle\b/i, `${k}: ${n}`);
    for (const n of names("tech_camaras")) assert.doesNotMatch(n, /\bring (video|doorbell|spotlight|floodlight|stick|indoor|outdoor|cam)\b|\b(wyze|blink|arlo|security camera|doorbell)\b/i, `${k} Cámaras: ${n}`);
    for (const n of names("tech_auto")) assert.doesNotMatch(n, /\bsoundbar\b|\bhome theater\b/i, `${k} Audio para auto: ${n}`);
  }
});

check("the gate held on every drop: in stock, a real photo, a true was-price, no locked handset, weighed", () => {
  for (const [f, k] of STORES) for (const it of Object.entries(cat(f, k)).flatMap(([a, x]) => x.items.map((i) => ({ ...i, _aisle: a })))) {
    assert.match(it.image, /^https:\/\//, it.name);
    assert.ok(it.price > 0 && it.weightKg > 0, it.name);
    if (it.onSale) assert.ok(it.originalPrice > it.price, it.name);
    assert.ok(!it.description || it.description !== it.description_en, `${it.name}: English shown`);
    if (/^tech_(celulares|computadoras)$/.test(it._aisle || "")) assert.doesNotMatch(it.name, /\b(prepaid|straight talk|tracfone|cricket)\b/i, it.name);
  }
});

check("Micro Center is a store; Walmart and Costco carry their electronics; Electrónica holds them", () => {
  assert.equal(RETAILERS.microcenter.label, "Micro Center");
  const bundle = readFileSync(ROOT + "build/" + readdirSync(ROOT + "build").find((f) => /^app-[0-9a-f]{16}\.js$/.test(f)), "utf8");
  for (const [f, k] of [["walmart-electronics-catalog.json", "walmart"], ["costco-electronics-catalog.json", "costco"], ["microcenter-catalog.json", "microcenter"]]) assert.ok(bundle.includes(`"/${f}":["${k}"]`), f);
  const tienda = JSON.parse(/var STORES = (\{.*\});/.exec(readFileSync(ROOT + "tienda.html", "utf8"))[1]);
  assert.ok(tienda.walmart.files.includes("/walmart-electronics-catalog.json"));
  assert.ok(tienda.microcenter);
  const head = JSON.parse(readFileSync(ROOT + "assets/sections/departamento/electronics/head.json", "utf8"));
  const n = (k) => (head.stores.find((s) => s.k === k) || {}).n || 0;
  assert.ok(n("walmart") > 2000 && n("microcenter") > 500 && n("brandsmart") > 1000, JSON.stringify(head.stores));
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

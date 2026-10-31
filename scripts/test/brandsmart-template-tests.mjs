/* ==================================================================
   BRANDSMART ON THE STORE TEMPLATE (#443 c.6534989244 Part 3, with the
   iPhone 18 correction c.6535200469).

     9. hero, Ofertas first, the count line, then the aisles biggest first;
        no aisle under 25 standing alone ("Más de BrandsMart USA", last);
    10. Celulares sellable first: the <= $200 phones lead, the iPhone 18
        is the one iPhone promoted (pinned early), the other new
        flagships at the bottom;
    11. the iPhone 18 listings STAY (Danny verified them at Apple);
    12. the PA speaker is audio, not a computer; the class swept;
    13. a model number is not a brand (BLU, BOLD);
    14. one product, one card: no title twice in a rail.

     node scripts/test/brandsmart-template-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TEMPLATE_RAIL_MIN, DEALS_HERO_STORES } from "../build-store-slices.mjs";
import { techAisle } from "../lib/tech-aisle.js";
import { brandOfRow } from "../lib/brandsmart.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const read = (f) => JSON.parse(readFileSync(ROOT + f, "utf8"));
const ix = read("assets/tienda/brandsmart/index.json");
const fn = read("assets/tienda/_fn/brandsmart.json");
const rowsOf = (k) => (fn.rails[k] || []).map((i) => fn.rows[i]);
let passed = 0;
const failures = [];
function check(name, f) {
  try { f(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

check("hero, then Ofertas first, then the aisles by their true size; none under 25 alone", () => {
  assert.ok(DEALS_HERO_STORES.has("brandsmart"));
  assert.ok(ix.hero && ix.hero.items.length >= 4, "no hero");
  for (const it of ix.hero.items) assert.ok(it.was > it.price, `${it.name}: no true was-price`);
  assert.equal(ix.rails[0].key, "ofertas");
  const aisles = ix.rails.filter((r) => r.key.startsWith("d-"));
  const own = aisles.filter((r) => r.key !== "d-mas");
  for (let i = 1; i < own.length; i++) assert.ok(own[i - 1].total >= own[i].total, `${own[i - 1].key} ${own[i - 1].total} before ${own[i].key} ${own[i].total}`);
  for (const r of own) assert.ok(r.total >= TEMPLATE_RAIL_MIN, `${r.key}: ${r.total}`);
  assert.equal(own[0].key, "d-tech_accesorios", "Accesorios y energía leads");
  const tail = aisles[aisles.length - 1];
  assert.equal(tail.key, "d-mas");
  assert.equal(tail.title, "Más de BrandsMart USA");
  assert.ok(ix.count > 0, "the count line has its number");
});

check("Celulares: the <= $200 phones lead, the iPhone 18 promoted early, the other flagships last", () => {
  const rows = rowsOf("d-tech_celulares");
  assert.ok(rows.length >= TEMPLATE_RAIL_MIN, `${rows.length} phones`);
  assert.ok(rows[0][2] <= 200, `leads with ${rows[0][0]} at $${rows[0][2]}`);
  assert.ok(rows.slice(0, 3).every((r) => r[2] <= 200), rows.slice(0, 3).map((r) => r[0]).join(" / "));
  const at18 = rows.findIndex((r) => /\biphone\s*18\b/i.test(r[0]));
  assert.ok(at18 >= 0 && at18 <= 5, `the iPhone 18 at ${at18}`);
  const flagship = (r) => /\b(iphone|galaxy\s*(s\d+|z)|ultra|fold|flip)\b/i.test(r[0]) && !/\biphone\s*18\b/i.test(r[0]) && !/reacondicionad|refurb|renewed/i.test(r[0]) && r[2] > 200;
  const firstFlag = rows.findIndex(flagship);
  if (firstFlag >= 0) assert.ok(rows.slice(firstFlag).every((r) => flagship(r) || /\biphone\s*18\b/i.test(r[0])), "a non-flagship after the flagships");
  const head = rows.slice(0, 16);
  assert.ok(head.filter((r) => r[2] <= 200).length >= 8, "the first screen is accessible phones");
});

check("the iPhone 18 listings stay (c.6535200469)", () => {
  assert.ok(fn.rows.filter((r) => /\biphone\s*18\b/i.test(r[0])).length >= 2);
});

check("the PA speaker is audio; speakers are not accessories; a phone is not a part", () => {
  assert.equal(techAisle("EON ONE Compact All-In-One Rechargeable Personal PA"), "tech_audio");
  assert.equal(techAisle("HP 24 inch All-in-One Desktop PC"), "tech_computadoras");
  assert.equal(techAisle("Shell Dock Portable Bluetooth Speaker - Red"), "tech_audio");
  assert.equal(techAisle("PA Speaker Tripod Stand"), "tech_accesorios");
  assert.equal(techAisle("Logitech MX Anywhere 2S Bluetooth Edition Compact Wireless Mouse, No USB Receiver"), "tech_accesorios");
  assert.equal(techAisle("BOLD K22 5G 6.7” HD Infinity Dot Display 128GB Storage 4GB RAM", "phones"), "tech_celulares");
  assert.equal(techAisle("Samsung T7 1TB Portable SSD"), "tech_accesorios");
  assert.equal(techAisle("Samsung 990 PRO 2TB NVMe SSD"), "tech_componentes");
  const audio = rowsOf("d-tech_audio").map((r) => r[0]);
  assert.ok(audio.some((n) => /EON ONE Compact/.test(n)), "the EON ONE is not in Audio");
  const comp = rowsOf("d-tech_computadoras").map((r) => r[0]);
  assert.ok(!comp.some((n) => /EON ONE/.test(n)));
});

check("a model number is not a brand", () => {
  assert.equal(brandOfRow({ brand: "G1110UUGRY", name: "BLU G35 6.5” Infinity Display" }), "BLU");
  assert.equal(brandOfRow({ brand: "K0250WWTIT", name: "BOLD K22 5G" }), "BOLD");
  assert.equal(brandOfRow({ brand: "Samsung", name: "Galaxy A15" }), "Samsung");
  assert.equal(brandOfRow({ brand: "3M", name: "3M Command Strips" }), "3M");
  for (const r of fn.rows) assert.ok(!/^(?=[A-Z0-9-]*\d)[A-Z0-9-]{6,}$/.test(r[1]), `${r[0]}: brand ${r[1]}`);
});

check("one product, one card: no title twice in any rail", () => {
  for (const [k, list] of Object.entries(fn.rails)) {
    const seen = new Set();
    for (const i of list) {
      const t = String(fn.rows[i][0]).toLowerCase();
      assert.ok(!seen.has(t), `${k}: "${fn.rows[i][0]}" twice`);
      seen.add(t);
    }
  }
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

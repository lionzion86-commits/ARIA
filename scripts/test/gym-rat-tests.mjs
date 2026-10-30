/* ==================================================================
   GYM RAT CLUB (Danny's format plan, #443 c.6504037778 §9).

   Alphalete and Gymshark come off all branding and sections -- they are
   not sellable. The section is YoungLA plus the training apparel of
   brands Aria can sell (Venum, Everlast, Under Armour, Nike, adidas,
   Reebok, Puma, New Balance, Champion), its rails in Spanish.

     node scripts/test/gym-rat-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isGymTraining } from "../build-department-slices.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const head = JSON.parse(readFileSync(ROOT + "assets/sections/departamento/gym_rat/head.json", "utf8"));
const cards = head.rails.flatMap((r) => r.cards || []);

check("no Alphalete or Gymshark product, store or copy in the section", () => {
  for (const c of cards) assert.doesNotMatch(`${c.r} ${c.b} ${c.t}`, /gymshark|alphalete/i, c.t);
  for (const s of head.stores) assert.ok(!/gymshark|alphalete/i.test(s.k), s.k);
  const page = readFileSync(ROOT + "departamento.html", "utf8");
  assert.doesNotMatch(/gym_rat:\s*\{[^}]*\}/.exec(page)[0], /gymshark|alphalete/i, "the section's own copy");
});

check("filled with sellable training brands, not YoungLA alone", () => {
  assert.ok(head.count >= 500, `${head.count} products`);
  const brands = new Set(cards.map((c) => String(c.b || "").toLowerCase()));
  assert.ok(brands.size >= 3, [...brands].join(", "));
  assert.ok(head.stores.length >= 4, head.stores.map((s) => s.k).join(", "));
});

check("the rails speak Spanish", () => {
  for (const r of head.rails) assert.doesNotMatch(r.title, /\b(for him|for her|men|women)\b/i, r.title);
  assert.deepEqual(head.rails.map((r) => r.title).slice(0, 3), ["Ofertas", "Hombre", "Mujer"]);
});

check("the training rule: training apparel in, shoes, gloves and kids out", () => {
  assert.ok(isGymTraining({ title: "Men's Nike Dri-FIT Challenger Brief-Lined Running Shorts", brand: "Nike" }));
  assert.ok(isGymTraining({ title: "Women's Paneled Sports Bra", brand: "Everlast" }));
  assert.ok(!isGymTraining({ title: "Nike Air Max Training Shoes", brand: "Nike" }));
  assert.ok(!isGymTraining({ title: "Everlast Pro Style Training Gloves", brand: "Everlast" }));
  assert.ok(!isGymTraining({ title: "Under Armour Boys' Training Tee", brand: "Under Armour" }));
  assert.ok(!isGymTraining({ title: "Men's Cotton Crew Tee", brand: "Hanes" }));
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

/* ==================================================================
   A HEADER NAMES ONLY WHAT IS ON THE SHELF (#443 c.6542477414).
   Danny read "Gymshark, Young LA, Alphalete" in the live Gym Rat header;
   Gymshark and Alphalete were taken off sale on Oct 29. A department
   blurb that names brands now builds the list from its own head.json
   stores, so a brand without stock can never be advertised.

     node scripts/test/header-brands-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url).pathname;
const read = (f) => readFileSync(ROOT + f, "utf8");
const page = read("departamento.html");
const bundle = read("build/" + readdirSync(ROOT + "build").find((f) => /^app-[0-9a-f]+\.js$/.test(f)));
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

check("the Gym Rat header names no brand off the shelf, and builds its list from the data", () => {
  const line = /gym_rat:\s*\{[^}]*\}/.exec(page)[0];
  assert.doesNotMatch(line, /gymshark|alphalete/i);
  assert.match(line, /descBrands:'Ropa para entrenar'/);
  assert.match(page, /if \(!filtered\(\)\) renderDescBrands\(data\.stores\);/);
  assert.match(page, /filter\(function\(s\)\{ return s && s\.n > 0; \}\)/);
});

check("what the header would say today: only stores with stock in Gym Rat", () => {
  const head = JSON.parse(read("assets/sections/departamento/gym_rat/head.json"));
  const stocked = head.stores.filter((s) => s.n > 0).map((s) => s.k);
  assert.ok(stocked.length > 0);
  assert.ok(!stocked.includes("gymshark") && !stocked.includes("alphalete"), stocked.join(","));
});

check("no department blurb names Gymshark or Alphalete; Gym Rat's tile says clothing, not gear", () => {
  const depts = /var DEPTS = \{[\s\S]*?\n  \};/.exec(page)[0];
  assert.doesNotMatch(depts, /gymshark|alphalete/i);
  assert.doesNotMatch(bundle, /sub: 'Ropa y equipo para entrenar'/);
  assert.match(bundle, /label: 'Gym Rat', sub: 'Ropa para entrenar'/);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

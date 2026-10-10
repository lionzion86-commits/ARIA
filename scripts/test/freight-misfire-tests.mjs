/* ==================================================================
   FREIGHT MISFIRES (2026-10-10) — two estimator rows that quoted a
   boat or an outdoor grill for things that are neither.

   1. "Kayak" printed on apparel hit the kayak/canoe/paddle-board row
      (25 kg): "Boys 8-20 Under Armour Bear Kayak Graphic Hoodie"
      quoted 33.75 kg after the buffer.
   2. "Grill" on indoor countertop appliances hit the outdoor
      grill/smoker/bbq row (50 kg): "TOA-70 Air Fryer Toaster Oven with
      Grill" and "Foodi DG551 Smart XL 6-in-1 Indoor Grill & Air Fryer"
      quoted 67.5 kg.

   Both sides are checked: the page's estimate (index.html, what the
   shopper sees) and the checkout's server-side resolution
   (scripts/lib/item-weight.js through netlify/functions/
   _weight-resolve.js, what is charged). They must agree, row for row.

   Separate file because run-tests.mjs, where the mirror checks live,
   cannot load on main (combo-deals.js / _combo-validate.js missing).

   RUNNING IT
     node scripts/test/freight-misfire-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as M from "../lib/item-weight.js";
import { resolveCartWeights } from "../../netlify/functions/_weight-resolve.js";
import { loadPageWeightSlice } from "./_page-script.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

const P = loadPageWeightSlice();
/* What checkout charges: the server resolves from the title, whatever
   weight the browser sent. */
const server = (title, sentKg = 0.2) =>
  resolveCartWeights([{ title, priceUsd: 50, qty: 1, weightKg: sentKg, weightEstimated: true }]).totalKg;
const page = (title) => P.estimateRetailWeightKg(title);
const reasoned = (kg) => M.withBuffer(kg, "reasoned");

check("a kayak or canoe print on apparel is apparel, not a boat (page and checkout)", () => {
  for (const t of ["Boys 8-20 Under Armour Bear Kayak Graphic Hoodie", "Passport Canoe T-Shirt - Harbour Blue",
    "Kayak Club Crewneck Sweatshirt", "Paddle Board Graphic Tee"]) {
    assert.equal(M.bulkyWeightKg(t), null, `checkout: "${t}" still hits a bulky row`);
    assert.equal(P.bulkyWeightKg(t), null, `page: "${t}" still hits a bulky row`);
    assert.ok(page(t) < 3, `page quotes ${page(t)} kg for "${t}"`);
    assert.ok(server(t) < 3, `checkout charges ${server(t)} kg for "${t}"`);
    assert.equal(server(t, 33.75), server(t), `checkout trusts the browser's number for "${t}"`);
  }
});

check("an indoor appliance with a grill is the appliance, not an outdoor grill (page and checkout)", () => {
  const airFryer = reasoned(6);
  for (const t of ["TOA-70 Air Fryer Toaster Oven with Grill", "Foodi DG551 Smart XL 6-in-1 Indoor Grill & Air Fryer"]) {
    assert.equal(M.bulkyWeightKg(t), airFryer, `checkout: "${t}" is ${M.bulkyWeightKg(t)} kg, not the air-fryer row`);
    assert.equal(P.bulkyWeightKg(t), airFryer, `page: "${t}" is ${P.bulkyWeightKg(t)} kg, not the air-fryer row`);
    assert.equal(server(t), airFryer, `checkout charges ${server(t)} kg for "${t}"`);
  }
  /* No air-fryer word: the indoor guard alone keeps it off the 50 kg row. */
  for (const t of ["George Foreman Indoor Electric Grill", "Cuisinart Toaster Oven Broiler with Grill"]) {
    assert.ok(!(M.bulkyWeightKg(t) >= reasoned(50)), `checkout: "${t}" is an outdoor grill`);
    assert.ok(!(P.bulkyWeightKg(t) >= reasoned(50)), `page: "${t}" is an outdoor grill`);
  }
});

check("real boats and real grills keep their rows (no regression)", () => {
  for (const t of ["Pelican Sentinel 100X Recreational Kayak", "Lifetime Kayak 10 ft Sit-On-Top with Paddle",
    "Old Town Discovery 169 Canoe", "iRocker 10' Inflatable Paddle Board"]) {
    assert.equal(M.bulkyWeightKg(t), reasoned(25), `checkout: "${t}" left the 25 kg row`);
    assert.equal(P.bulkyWeightKg(t), reasoned(25), `page: "${t}" left the 25 kg row`);
    assert.equal(server(t), reasoned(25), `checkout charges ${server(t)} kg for "${t}"`);
  }
  for (const t of ["Weber Spirit II E-310 3-Burner Liquid Propane Gas Grill", "Traeger Pro 575 Pellet Smoker", "Char-Griller Charcoal BBQ"]) {
    assert.equal(M.bulkyWeightKg(t), reasoned(50), `checkout: "${t}" left the 50 kg row`);
    assert.equal(P.bulkyWeightKg(t), reasoned(50), `page: "${t}" left the 50 kg row`);
  }
});

check("the page's bulky table and guards mirror the checkout module exactly", () => {
  const html = readFileSync(ROOT + "index.html", "utf8").replace(/\r\n/g, "\n");
  const mod = readFileSync(ROOT + "scripts/lib/item-weight.js", "utf8");
  const rows = (src) => {
    const i = src.indexOf("BULKY_WEIGHT_ESTIMATES_KG = [");
    assert.ok(i >= 0, "BULKY_WEIGHT_ESTIMATES_KG moved");
    return src.slice(i, src.indexOf("\n];", i)).split("\n").map(l => l.trim()).filter(l => l.startsWith("{"));
  };
  assert.deepEqual(rows(html), rows(mod), "index.html's bulky rows differ from item-weight.js");
  for (const name of ["GRILL_IMPOSTOR_RE", "KAYAK_IMPOSTOR_RE"]) {
    const line = (src) => (src.match(new RegExp(`^const ${name} = .*$`, "m")) || [""])[0];
    assert.ok(line(mod), `${name} missing from item-weight.js`);
    assert.equal(line(html), line(mod), `${name} differs between index.html and item-weight.js`);
  }
  const band = (src) => (src.match(/\{ key: "exterior\/camping".*$/m) || [""])[0];
  assert.ok(band(mod).includes("!KAYAK_IMPOSTOR_RE.test(t)"), "the exterior/camping band does not skip apparel prints");
  assert.equal(band(html), band(mod), "the exterior/camping band differs between index.html and item-weight.js");
});

check("the sanity band agrees: no camping band on the fixed titles", () => {
  for (const t of ["Boys 8-20 Under Armour Bear Kayak Graphic Hoodie", "TOA-70 Air Fryer Toaster Oven with Grill"]) {
    const s = M.weightSanity(t, 0.9), p = P.weightSanity(t, 0.9);
    assert.ok(s && p, "weightSanity returned nothing");
    assert.notEqual(s.key, "exterior/camping", `checkout bands "${t}" as camping`);
    assert.notEqual(p.key, "exterior/camping", `page bands "${t}" as camping`);
    /* A real kayak still is. */
    assert.equal(M.weightSanity("Pelican Sentinel 100X Recreational Kayak", 30).key, "exterior/camping");
  }
});

const MIN_CHECKS = 5;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }

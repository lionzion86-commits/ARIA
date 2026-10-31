/* ==================================================================
   SURFBOARD WEIGHTS, PER SIZE (#443 c.6539551122, estimator c.6539602786).

     - the table: a size falls to the next row up; unknown construction
       takes the heaviest column; unknown size is 6.5 kg;
     - a store figure stays only when plausible for the size and not a
       flat default (1.0 / 9.98 / 3.3 / 1.5 / 0.5 / under 1 kg);
     - the resolver weighs a board by the chosen size, server side
       (the Catch Surf fish: 4.0 kg at 5'6", 4.5 kg at 6'0");
     - the committed catalogues are swept: no board left on a placeholder;
     - leashes, fins, socks, modems and dolls named "surfboard" are not boards.

     node scripts/test/surfboard-weight-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { boardFeet, tableKg, plausibleKg, isSurfboard, boardConstruction, surfboardWeight, UNKNOWN_SIZE_KG } from "../lib/surfboard-weight.js";
import { resolveItemWeight } from "../../netlify/functions/_weight-resolve.js";
import { sweep } from "../fix-surfboard-weights.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

check("sizes read in feet, a size falls to the next row up", () => {
  assert.equal(boardFeet("5ft6in"), 5.5);
  assert.equal(boardFeet("6'0\""), 6);
  assert.equal(boardFeet("5' 10"), 5 + 10 / 12);
  assert.equal(boardFeet("9'6"), 9.5);
  assert.equal(boardFeet("M"), null);
  assert.equal(tableKg(5.5, "soft"), 4.0);
  assert.equal(tableKg(5 + 10 / 12, "soft"), 4.5, "5'10\" is a 6'0\" row");
  assert.equal(tableKg(9.5, "pu"), 8.5);
  assert.equal(tableKg(10.5, "epoxy"), 8.0);
  assert.equal(tableKg(6, ""), 4.5, "unknown construction: the heaviest column");
  assert.equal(tableKg(null, "soft"), UNKNOWN_SIZE_KG);
});

check("a store figure stays only when plausible and not a flat default", () => {
  for (const kg of [0.22, 0.16, 1.0, 9.98, 3.3, 1.5, 0.5]) assert.equal(plausibleKg(kg, 6, "soft"), false, String(kg));
  assert.equal(plausibleKg(4.3, 6, "soft"), true);
  assert.equal(plausibleKg(12, 6, "soft"), false, "a 6' board does not weigh 12 kg");
});

check("construction from the name", () => {
  assert.equal(boardConstruction("Catch Surf Blank Series Fish Soft Surfboard"), "soft");
  assert.equal(boardConstruction("Firewire Dominator Pro Helium 5'8 Surfboard"), "epoxy");
  assert.equal(boardConstruction("Lost RNF '96 PU/Poly 5'10 Surfboard"), "pu");
});

check("not boards: leashes, fins, socks, modems, dolls; the store's own type decides when it has one", () => {
  for (const name of ["FCS All Round Essential 6' Surfboard Leash", "Veia Surfboard Sock", "ARRIS SB6190 Surfboard DOCSIS 3.0 Cable Modem", "Barbie The Movie Ken Doll with Surfboard", "Surf Station Logo Tee"])
    assert.equal(isSurfboard({ name }), false, name);
  assert.equal(isSurfboard({ name: "Catch Surf Blank Series Fish Soft Surfboard", type: "Tablas de surf" }), true);
  assert.equal(isSurfboard({ name: "Surfboards Logo Boardshort", type: "Boardshorts" }), false);
});

check("the Catch Surf fish: one weight per size, estimated", () => {
  const w = surfboardWeight({ name: "Catch Surf Blank Series Fish Soft Surfboard", type: "Tablas de surf", weightKg: 0.22, weightEstimated: false, availableSizes: ["5ft6in", "6ft0in"] });
  assert.deepEqual(w.weightBySize, { "5ft6in": 4.0, "6ft0in": 4.5 });
  assert.equal(w.weightKg, 4.5, "no size chosen: the longest");
  assert.equal(w.estimated, true);
});

check("the resolver weighs a board by the chosen size, never the store's 0.22 kg", () => {
  const line = (selectedSize) => resolveItemWeight({ title: "Catch Surf Blank Series Fish Soft Surfboard", retailer: "islandwatersports", priceUsd: 450, weightKg: 0.22, weightEstimated: true, selectedSize, sizeOptions: ["5ft6in", "6ft0in"], kind: "surfboard" });
  assert.equal(line("5ft6in").weightKg, 4.0);
  assert.equal(line("6ft0in").weightKg, 4.5);
  assert.equal(line("").weightKg, 4.5);
  assert.equal(line("6ft0in").source, "surfboard");
  assert.equal(line("6ft0in").estimated, true);
  /* A board named in its title, no hint: the size in the title. */
  assert.equal(resolveItemWeight({ title: "Channel Islands CI Pro PU/Poly 5'10 Surfboard - FCS II", retailer: "surfstation" }).weightKg, 3.5);
});

check("the committed catalogues are swept: no surfboard left on a store placeholder", () => {
  const r = sweep(ROOT, { write: false });
  assert.ok(r.boards > 1000, `${r.boards} boards`);
  assert.deepEqual(r.files, [], "run: node scripts/fix-surfboard-weights.mjs");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

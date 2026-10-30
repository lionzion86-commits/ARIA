/* ==================================================================
   EVERY PHOTO ON THE CARD, NEVER A DEAD BUTTON (#443 c.6522012464,
   c.6522824310 -- #538).

     - a card carries `ph` (2..8) exactly when its product's PDP shard
       holds that many distinct photos; a one-photo product carries
       nothing (Victoria's Secret today: no gallery in its pull);
     - the endpoint rows carry the same count, so a "Ver todo" page and
       the static first screen agree;
     - the pages hand the count to the card as data-g, and card-photos.js
       arms arrows only on a card with data-g >= 2; nothing is fetched
       until a tap or a swipe.

     node scripts/test/card-photos-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { photoCount } from "../lib/photo-counts.js";
import { cardOfRow } from "../../netlify/functions/_tienda-core.js";
import { rowItem, cardOf } from "../../netlify/functions/_department-core.js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const read = (f) => readFileSync(ROOT + f, "utf8");
const json = (f) => JSON.parse(read(f));
const storeCards = (k) => json(`assets/tienda/${k}/index.json`).rails.flatMap((r) => r.head || []);

check("a store card carries its photo count when 2+, and nothing when it has one photo", () => {
  const skims = storeCards("skims");
  const counted = skims.filter((c) => c.ph);
  assert.ok(counted.length > skims.length * 0.8, `skims: ${counted.length} of ${skims.length}`);
  for (const c of counted.slice(0, 40)) assert.equal(c.ph, photoCount(ROOT, c.name, "skims"), c.name);
  for (const c of storeCards("victoriassecret")) assert.equal(c.ph, undefined, "VS has no gallery in its pull: " + c.name);
});

check("a department card carries the same count", () => {
  const head = json("assets/sections/departamento/women/head.json");
  const cards = head.rails.flatMap((r) => r.cards || []);
  const counted = cards.filter((c) => c.ph);
  assert.ok(counted.length >= 10, `${counted.length} counted cards in Mujer`);
  for (const c of counted.slice(0, 40)) assert.equal(c.ph, photoCount(ROOT, c.t, c.r), c.t);
  for (const c of cards) if (c.r === "victoriassecret") assert.equal(c.ph, undefined, c.t);
});

check("the endpoint rows carry the count (Ver todo agrees with the first screen)", () => {
  const fn = json("assets/tienda/_fn/skims.json");
  const row = fn.rows.find((r) => r[9] > 1);
  assert.ok(row, "no skims row carries a count");
  assert.equal(cardOfRow(row).ph, row[9]);
  const drow = json("assets/sections/departamento/_fn/women.json").rows.find((r) => r[10] > 1);
  assert.ok(drow, "no Mujer row carries a count");
  assert.equal(cardOf(rowItem(drow)).ph, drow[10]);
});

check("the pages hand the count to the card; card-photos.js arms only counted cards and fetches nothing at load", () => {
  for (const f of ["tienda.html", "departamento.html", "marca.html", "disenadores.html"]) {
    assert.match(read(f), /\.ph > 1 \? 'data-g="' \+ \(\w\.ph \| 0\) \+ '" ' : ''/, f);
    assert.match(read(f), /<script src="\/assets\/js\/card-photos\.js" defer><\/script>/, f);
  }
  const js = read("assets/js/card-photos.js");
  assert.match(js, /querySelector\("img\[data-g\]"\)/);
  assert.match(js, /getAttribute\("data-g"\) \|\| 0\) < 2/);
  /* The only request is the shard, inside galleryOf (a tap or a swipe). */
  assert.equal((js.match(/fetch\(/g) || []).length, 1);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

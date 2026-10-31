/* ==================================================================
   EVERY PHOTO ON THE CARD, NEVER A DEAD BUTTON (#443 c.6522012464,
   c.6522824310 -- #538).

     - a card carries `ph` (2..8) exactly when its product's PDP shard
       holds that many distinct photos; a one-photo product carries
       nothing (Foot Locker today: no gallery in its pull; Victoria's
       Secret has one since the 2026-10-30 re-pull);
     - the endpoint rows carry the same count, so a "Ver todo" page and
       the static first screen agree;
     - the pages hand the count to the card as data-g, and card-photos.js
       arms arrows only on a card with data-g >= 2; nothing is fetched
       until a tap or a swipe.

     node scripts/test/card-photos-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as require_fs from "node:fs";
import { photoCount } from "../lib/photo-counts.js";
import { cardOfRow } from "../../netlify/functions/_tienda-core.js";
import { rowItem, cardOf } from "../../netlify/functions/_department-core.js";
import { FIELDS } from "../../netlify/functions/_ofertas-core.js";

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
  for (const c of storeCards("footlocker")) assert.equal(c.ph, undefined, "Foot Locker has no gallery in its pull: " + c.name);
  /* The 2026-10-30 re-pull (data/gallery-repull-2026-10-30/): VS cards carry their count. */
  const vs = storeCards("victoriassecret");
  assert.ok(vs.filter((c) => c.ph >= 2).length > vs.length * 0.8, "VS: " + vs.filter((c) => c.ph >= 2).length + " of " + vs.length + " cards counted");
});

check("a department card carries the same count", () => {
  const head = json("assets/sections/departamento/women/head.json");
  const cards = head.rails.flatMap((r) => r.cards || []);
  const counted = cards.filter((c) => c.ph);
  assert.ok(counted.length >= 10, `${counted.length} counted cards in Mujer`);
  for (const c of counted.slice(0, 40)) assert.equal(c.ph, photoCount(ROOT, c.t, c.r), c.t);
  for (const c of cards) if (c.r === "footlocker") assert.equal(c.ph, undefined, c.t);
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

check("the Ofertas cards carry the same count (packed deals and the page slices)", () => {
  const d = json("assets/ofertas/deals.json");
  const at = FIELDS.indexOf("ph");
  assert.ok(at >= 0, "ph is not an Ofertas field");
  const counted = d.items.filter((r) => r[at] > 1);
  assert.ok(counted.length > d.items.length * 0.3, `${counted.length} of ${d.items.length}`);
  for (const r of counted.slice(0, 40)) assert.equal(r[at], photoCount(ROOT, r[FIELDS.indexOf("title")], r[FIELDS.indexOf("store")]), r[1]);
  for (const r of d.items) if (r[FIELDS.indexOf("store")] === "footlocker") assert.ok(!(r[at] > 1), "Foot Locker has no gallery: " + r[1]);
  assert.match(read("ofertas.html"), /c\.ph > 1 \? 'data-g="' \+ \(c\.ph \| 0\) \+ '" ' : ''/);
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

check("the homepage carousels: every shelf card with 2+ photos carries ph, and the bundle hands it to the card", () => {
  const { readdirSync } = require_fs;
  let multi = 0;
  for (const d of ["assets/home/shelves", "assets/home/pills", "assets/home/store-pills"]) {
    for (const f of readdirSync(ROOT + d)) {
      if (!f.endsWith(".json")) continue;
      const walk = (v) => {
        if (Array.isArray(v)) return v.forEach(walk);
        if (!v || typeof v !== "object") return;
        const title = v.title || v.name || v.t, image = v.image || v.i, store = v.retailer || v.store || v.r;
        if (typeof title === "string" && typeof image === "string" && typeof store === "string") {
          const n = photoCount(ROOT, title, store);
          assert.equal(v.ph || 0, n >= 2 ? n : 0, `${d}/${f}: ${title} -- node scripts/stamp-home-photos.mjs`);
          if (n >= 2) multi++;
          return;
        }
        Object.values(v).forEach(walk);
      };
      walk(JSON.parse(read(d + "/" + f)));
    }
  }
  assert.ok(multi > 500, "only " + multi + " homepage cards with a gallery");
  const bundle = read("build/" + read("index.html").match(/build\/(app-[0-9a-f]{16}\.js)/)[1]);
  assert.match(bundle, /data-cp-t="\$\{escapeHtml\(p\.title\)\}"/, "railCardHTML hands the product to card-photos.js");
  assert.match(bundle, /photo\.replace\('<img ', `<img data-g="\$\{ph\}" `\)/, "railCardHTML puts the count on the photo");
  assert.match(bundle, /\.\.\.\(c\.ph \? \{ ph: c\.ph \} : \{\}\)/, "the audience pill shelves keep the count");
  assert.match(read("assets/js/card-photos.js"), /getAttribute\("data-cp-t"\)/, "card-photos.js reads a homepage card's product");
});

check("the homepage Ofertas rail's feed carries the same count", () => {
  for (const f of ["ofertas-feed-lite.json"]) {
    const d = JSON.parse(read(f));
    let multi = 0;
    for (const it of d.items) {
      const n = photoCount(ROOT, it.title, it.retailer);
      assert.equal(it.ph || 0, n >= 2 ? n : 0, `${f}: ${it.title}`);
      if (n >= 2) multi++;
    }
    assert.ok(multi > d.items.length / 2, `${f}: ${multi} of ${d.items.length} deals counted`);
  }
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

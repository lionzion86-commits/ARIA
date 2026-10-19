/* ==================================================================
   DISEÑADORES LATINOS, THIN (2026-10-19, #409 track T5).

   disenadores.html used to download the designers' catalogue file
   (16MB raw, 2.6MB gzipped) before drawing a room. Every answer it
   gives is now a small static file from scripts/build-designer-slices.mjs.

   RUNNING IT
     node scripts/test/disenadores-thin-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { OUT_DIR, CATALOG, DESIGNER_MATCH, PRODUCT_TYPES, RAIL_CARDS, PAGE_SIZE, loadItems, roomRails, cardOf, pageLabels } from "../build-designer-slices.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const PAGE = readFileSync(ROOT + "disenadores.html", "utf8");
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}
const readJSON = (name) => JSON.parse(readFileSync(`${ROOT}${OUT_DIR}/${name}`, "utf8"));
const ITEMS = loadItems(ROOT);
const LABELS = pageLabels(ROOT);
const INDEX = readJSON("index.json");

check("the build and the page agree on the designers and the product types", () => {
  const spec = [...PAGE.matchAll(/\{ key:'([a-z]+)',[^}]*?match:'([^']+)'/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(Object.fromEntries(spec), DESIGNER_MATCH);
  const types = [...PAGE.slice(PAGE.indexOf("var PRODUCT_TYPES = ["), PAGE.indexOf("var SLICES")).matchAll(/key:'([a-z_]+)',\s*label:'([^']+)'/g)].map((m) => m[1] + ":" + m[2]);
  assert.deepEqual(types, PRODUCT_TYPES.map((t) => t.key + ":" + t.label));
});

check("index.json and every room / page are what today's catalogue gives", () => {
  assert.equal(INDEX.total, ITEMS.length, "index.json is stale — run: node scripts/build-designer-slices.mjs");
  const byD = {};
  for (const it of ITEMS) if (it.dkey) (byD[it.dkey] = byD[it.dkey] || []).push(it);
  for (const [d, n] of Object.entries(INDEX.designers)) assert.equal(n, byD[d].length, `${d} count`);
  for (const t of ["all"].concat(PRODUCT_TYPES.map((x) => x.key))) {
    for (const d of Object.keys(DESIGNER_MATCH)) {
      const list = (byD[d] || []).filter((it) => t === "all" || it.ptype === t);
      const room = INDEX.views[t][d];
      if (!list.length) { assert.ok(!room, `${d}/${t} should have no room`); continue; }
      const rails = roomRails(LABELS[d], list);
      assert.deepEqual(room.rails.map((r) => r.title + ":" + r.count), rails.map((r) => r.title + ":" + r.items.length), `${d}/${t} carousels`);
      const file = readJSON(`room-${d}-${t}.json`);
      rails.forEach((r, i) => assert.deepEqual(file.rails[i].cards, JSON.parse(JSON.stringify(r.items.slice(0, RAIL_CARDS).map(cardOf))), `room-${d}-${t} rail ${r.k}`));
      if (t === "all") {
        const last = Math.ceil(rails[0].items.length / PAGE_SIZE) - 1;
        assert.deepEqual(readJSON(`rail-${d}-${t}-${rails[0].k}-${last}.json`).cards, JSON.parse(JSON.stringify(rails[0].items.slice(last * PAGE_SIZE).map(cardOf))));
        assert.ok(!existsSync(`${ROOT}${OUT_DIR}/rail-${d}-${t}-${rails[0].k}-${last + 1}.json`));
        assert.equal(readJSON(`all-${d}-${t}-0.json`).count, list.length);
      }
    }
  }
});

check("small files only, cards capped and lean", () => {
  for (const f of readdirSync(ROOT + OUT_DIR)) {
    const raw = readFileSync(`${ROOT}${OUT_DIR}/${f}`, "utf8");
    assert.ok(raw.length < 32 * 1024, `${f} is ${raw.length} bytes`);
    const j = JSON.parse(raw);
    for (const c of (j.cards || []).concat(...(j.rails || []).map((r) => r.cards || []))) {
      for (const k of Object.keys(c)) assert.ok(["t", "b", "p", "o", "s", "i"].includes(k), `${f}: card field ${k}`);
    }
    if (j.cards) assert.ok(j.cards.length <= PAGE_SIZE);
    for (const r of j.rails || []) if (r.cards) assert.ok(r.cards.length <= RAIL_CARDS);
  }
});

check("the page never downloads the catalogue", () => {
  assert.ok(!PAGE.includes(CATALOG), "disenadores.html still names " + CATALOG);
  assert.ok(!/-catalog\.json/.test(PAGE));
  assert.match(PAGE, /var SLICES = 'assets\/sections\/disenadores\/'/);
});

check("placeholder room in the HTML, shape-held 3:4 cards, photos and rooms on approach", () => {
  assert.match(PAGE, /<div id="galeria" aria-live="polite"><section class="room sk" aria-hidden="true">/);
  assert.match(PAGE, /\.card-img\{position:relative;width:100%;aspect-ratio:3\/4;/);
  assert.match(PAGE, /@supports not \(aspect-ratio:3\/4\)\{\.card-img\{height:0;padding-top:133\.33%\}\}/);
  assert.ok(!/loading="lazy"/.test(PAGE.replace(/\/\*[\s\S]*?\*\//g, "")));
  assert.match(PAGE, /function watchPhotos\(/);
  assert.match(PAGE, /function watchRooms\(/);
});

check("soles first with the shared rate; decoded text; yellow only on the badge; no link out; no emojis", () => {
  assert.match(PAGE, /FX_CACHE_KEY = 'aria_fx_rate_v1'/);
  const pi = PAGE.slice(PAGE.indexOf("function priceInner("), PAGE.indexOf("function paintPrices("));
  assert.ok(pi.lastIndexOf('class="pen"') < pi.lastIndexOf('class="usd"'));
  assert.match(PAGE, /function esc\(s\)\{ return escRaw\(decodeEntitiesText\(s\)\); \}/);
  assert.match(PAGE, /function escapeHtml\(s\)\{ return esc\(s\); \}/);
  const yellow = PAGE.split("\n").filter((l) => /var\(--sale\)/.test(l));
  assert.ok(yellow.every((l) => /\.sale-badge/.test(l)), yellow.join(" | "));
  const card = PAGE.slice(PAGE.indexOf("function cardHTML("), PAGE.indexOf("var SKELETON"));
  assert.match(card, /producto\.html\?producto=/);
  assert.ok(!/\.url\b|target="_blank"/.test(card));
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(PAGE));
});

const MIN_CHECKS = 6;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }

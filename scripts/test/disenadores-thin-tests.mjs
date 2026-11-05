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
import { OUT_DIR, CATALOG, DESIGNER_MATCH, PRODUCT_TYPES, RAIL_CARDS, PAGE_SIZE, VIEW_ORDER, loadItems, roomRails, cardOf, pageLabels, productTypeOf, viewDesigners } from "../build-designer-slices.mjs";

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
      for (const k of Object.keys(c)) assert.ok(["t", "b", "p", "o", "s", "i", "ph"].includes(k), `${f}: card field ${k}`);
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

/* #443 c.6642247782: Danny walked Diseñadores -> Joyas. PatBO's "Iara
   Jewelry Sandal", Ancora's "Tide Charm Skirt" and TNS's "Straight Jeans
   with Metal Ring Closure" were in it: the old word list matched a type
   word anywhere in the name, jewellery first. */
check("Joyas: PatBO, Ancora and TNS are out; Johanna Ortiz leads, then Silvia Tcherassi, Vix, Montce, Farm Rio", () => {
  const want = ["johannaortiz", "silviatcherassi", "vix", "montce", "farmrio"];
  assert.deepEqual(VIEW_ORDER.joyas, want);
  assert.deepEqual(INDEX.order.joyas, want, "index.json's Joyas order");
  assert.deepEqual(Object.keys(INDEX.views.joyas), want, "the Joyas view's rooms");
  for (const d of ["patbo", "ancora", "tns"]) {
    assert.ok(!INDEX.views.joyas[d], `${d} still has a Joyas room`);
    assert.ok(!existsSync(`${ROOT}${OUT_DIR}/room-${d}-joyas.json`), `room-${d}-joyas.json still written`);
    assert.ok(INDEX.views.all[d] && INDEX.views.all[d].count > 0, `${d} left Diseñadores Latinos altogether`);
    assert.ok(!(INDEX.views.all[d].rails || []).some((r) => r.k === "joyas"), `${d}'s own room still has a Joyas carousel`);
  }
  const byName = (d, re) => ITEMS.filter((it) => it.dkey === d && re.test(it.name));
  for (const it of byName("patbo", /jewelry sandal/i)) assert.equal(it.ptype, "zapatos", it.name);
  for (const it of byName("patbo", /jewelry corset top/i)) assert.equal(it.ptype, "ropa", it.name);
  assert.ok(byName("patbo", /jewelry sandal/i).length >= 1, "PatBO's jewelry sandals are gone from the catalogue: re-pin");
  assert.ok(INDEX.views.zapatos.patbo && INDEX.views.zapatos.patbo.count >= 4, "PatBO's sandals belong in Zapatos");
  assert.ok(!ITEMS.some((it) => (it.dkey === "patbo" || it.dkey === "ancora" || it.dkey === "tns") && it.ptype === "joyas"));
  for (const it of byName("tns", /metal ring closure/i)) assert.equal(it.ptype, "ropa", it.name);
  for (const it of byName("ancora", /charm/i)) assert.equal(it.ptype, "ropa", it.name);
  /* The page draws the rooms in index.json's order. */
  const g = PAGE.slice(PAGE.indexOf("function renderGallery("), PAGE.indexOf("function renderChips("));
  assert.match(g, /state\.index\.order && state\.index\.order\[state\.typeFilter\]/);
  assert.match(g, /specs\.forEach\(function\(spec\)\{/);
  assert.deepEqual(viewDesigners("zapatos").slice(0, 3), Object.keys(DESIGNER_MATCH).slice(0, 3), "unpinned views keep the page's order");
});

check("the class: a product is in a type view only when its type is that type; a type word in the name files nothing", () => {
  assert.ok(!/keywords\s*:/.test(PAGE.slice(PAGE.indexOf("var PRODUCT_TYPES = ["), PAGE.indexOf("var SLICES"))), "the page still carries a name-word list");
  const src = readFileSync(ROOT + "scripts/build-designer-slices.mjs", "utf8");
  assert.match(src, /product-type\.js/, "the build does not use the site's classifier");
  assert.ok(!/keywords:/.test(src), "the build still matches name words");
  for (const [name, want] of [["Iara Jewelry Sandal", "zapatos"], ["Lara Jewelry Sandal", "zapatos"], ["ROSALIE JEWELRY CORSET TOP (RUNWAY)", "ropa"],
    ["Straight Jeans with Metal Ring Closure in Dark Blue Cotton for Women", "ropa"], ["Tide Charm Skirt", "ropa"], ["Top Cups Deep Charm", "ropa"],
    ["Bottom Cheeky Deep Charm", "ropa"], ["Bottom Side Tie Ondine", "ropa"], ["Blue horse shoe jeans with marbled wash in cotton denim for women", "ropa"],
    ["Off-White Beer Cap  Baby T-Shirt", "ropa"], ["Multicolor Copacabana Beach Skirt", "ropa"], ["ELSA FLAT", "zapatos"],
    ["Yawanawa Beaded Necklace", "joyas"], ["Vivid Vibration Earrings", "joyas"], ["Race Charm", "joyas"], ["Lyss Necklace - Gold", "joyas"]])
    assert.equal(productTypeOf({ name, type: "WOMEN" }), want, `"${name}"`);
  /* Every Joyas card is jewellery by its head noun, never a shoe or a garment. */
  const FOOT_OR_GARMENT = /\b(sandals?|shoes?|heels?|boots?|flats?|sneakers?|skirts?|tops?|bottoms?|jeans|dress(es)?|pants|shorts|shirts?|corsets?)\s*(\(|-|$)/i;
  for (const it of ITEMS) if (it.ptype === "joyas") assert.ok(!FOOT_OR_GARMENT.test(it.name), `Joyas holds "${it.name}" (${it.dkey})`);
  for (const t of PRODUCT_TYPES) for (const [d, room] of Object.entries(INDEX.views[t.key] || {}))
    assert.equal(room.count, ITEMS.filter((it) => it.dkey === d && it.ptype === t.key).length, `${d}/${t.key}`);
  assert.deepEqual(Object.keys(INDEX.types).sort(), PRODUCT_TYPES.map((t) => t.key).filter((k) => INDEX.types[k]).sort(), "a non-fashion family reached the tiles");
});

const MIN_CHECKS = 8;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }

/* ==================================================================
   SEARCH COVERS WHAT THE SITE SERVES (#443 search audit F3).

   The audit found whole served catalogues missing from search: a store
   shopped on its own page and in its department could not be found by
   name. This is the drift alarm: every catalogue the app serves (the
   bundle's SOURCE_RETAILERS, the one map of served files) that carries a
   store still on sale must be in the search index's CATALOG_FILES, and
   every on-sale store in it must have rows in the committed index.

     node scripts/test/search-coverage-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { CATALOG_FILES } from "../build-search-index.mjs";
import { isOffSaleRetailer } from "../lib/off-sale.js";
import { deviceLead } from "../../netlify/functions/_search-core.js";
import { isConsole } from "../lib/tech-aisle.js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const bundle = readFileSync(ROOT + "build/" + readdirSync(ROOT + "build").find((f) => /^app-[0-9a-f]{16}\.js$/.test(f)), "utf8");
const SERVED = JSON.parse(/const SOURCE_RETAILERS = (\{[^\n]*\});/.exec(bundle)[1]);
const indexed = new Set(CATALOG_FILES.map((f) => "/" + f.replace(/^\//, "")));

check("every served catalogue with a store on sale is in the search index's file list", () => {
  const missing = Object.entries(SERVED)
    .filter(([f, rs]) => rs.some((r) => !isOffSaleRetailer(r)) && !indexed.has(f))
    .map(([f]) => f);
  assert.deepEqual(missing, [], "served but not searchable: " + missing.join(", ") + " -- add them to scripts/build-search-index.mjs CATALOG_FILES");
});

check("every on-sale store of an indexed catalogue has rows in the committed index", () => {
  const ix = JSON.parse(readFileSync(ROOT + "assets/search/catalog-index.json", "utf8"));
  const RI = (ix.cols || ix.fields).indexOf("retailer");
  const have = new Set(ix.rows.map((r) => r[RI]));
  const missing = [];
  for (const [f, rs] of Object.entries(SERVED)) {
    if (!indexed.has(f)) continue;
    for (const r of rs) if (!isOffSaleRetailer(r) && !have.has(r)) {
      /* A committed empty envelope (a store whose pull has not landed) has nothing to find. */
      let n = 0;
      try { const c = JSON.parse(readFileSync(ROOT + f.slice(1), "utf8")); n = Object.values((c.retailers || {})[r]?.departments || {}).reduce((a, d) => a + (d.items || []).length, 0); } catch {}
      if (n) missing.push(`${r} (${f}, ${n} products)`);
    }
  }
  assert.deepEqual(missing, [], "in the file list but not in the index: " + missing.join(", ") + " -- run node scripts/build-search-index.mjs");
});

/* ---------- the audit's battery (F2, F6, F7) ---------- */
const { handler } = await import("../../netlify/functions/search.js");
const fetchImpl = async () => ({ ok: true, json: async () => ({ venta: 3.75 }) });
async function ask(q) {
  const r = await handler({ httpMethod: "GET", queryStringParameters: { q, page: "1" } }, { fetchImpl });
  return JSON.parse(r.body);
}
const results = {};
for (const q of ["celular", "consola", "laptop", "monitor", "monitor de bebe", "alphalete", "gymshark", "abercrombie", "hollister", "lenceria", "brasier", "funda celular", "cargador iphone"]) results[q] = await ask(q);
const top = (q, n = 6) => results[q].items.slice(0, n).map((i) => i.title);

/* What the index holds decides what a search can show: before the
   electronics drops land (#525) the stores carry no handsets and no
   computer monitors, so those checks wait for the stock; the ranking rule
   itself is checked on fixed rows either way. */
const ixRows = JSON.parse(readFileSync(ROOT + "assets/search/catalog-index.json", "utf8")).rows;
const stocked = (rx) => ixRows.filter((r) => rx.test(r[1])).length;
const PHONES = stocked(/\b(galaxy [sza]\d+|iphone \d+\w*|pixel \d+\w*)\b(?![^|]*\b(case|cover|protector|charger)\b)/i);
const MONITORS = stocked(/\b\d{2}(\.\d)?\s?("|”|-?inch)[^|]*\bgaming monitor\b/i);
const CONSOLES = stocked(/\b(nintendo switch\S*\s*2 system|meta quest 3s? \d+gb|playstation portal)\b/i);

check("F6: a device search opens on the device, not what fits it", () => {
  const rows = ["Death Lens Impact Phone Case - iPhone 16", "Samsung Galaxy A15 5G 64GB Unlocked", "Car Charger for Phone", "Game Console Repair Kit Tools", "PlayStation 5 Slim Console"]
    .map((title) => ({ title }));
  assert.deepEqual(deviceLead("celular", rows).map((p) => p.title)[0], "Samsung Galaxy A15 5G 64GB Unlocked");
  assert.deepEqual(deviceLead("consola", rows).map((p) => p.title)[0], "PlayStation 5 Slim Console");
  assert.equal(deviceLead("consola", rows).map((p) => p.title).pop(), "Game Console Repair Kit Tools", "a repair kit goes last");
  assert.deepEqual(deviceLead("funda celular", rows).map((p) => p.title).slice(0, 3),
    ["Death Lens Impact Phone Case - iPhone 16", "Car Charger for Phone", "Samsung Galaxy A15 5G 64GB Unlocked"], "asking for the accessory: what fits the phone leads, then the phone");
  if (PHONES >= 6) for (const t of top("celular")) assert.doesNotMatch(t, /\b(case|cover|charger|holder|mount|screen protector)\b/i, "celular: " + t);
  for (const t of top("consola", 3)) assert.doesNotMatch(t, /\b(repair|kit|tools?)\b/i, "consola: " + t);
  for (const t of top("laptop")) assert.match(t, /laptop|notebook|chromebook|macbook/i, "laptop: " + t);
  assert.ok(top("funda celular").some((t) => /\bcase\b/i.test(t)), "funda celular");
  /* Asking for the accessory: what fits the named device leads -- not a
     charger plate, not the phone itself. */
  for (const t of top("funda celular", 4)) assert.match(t, /\bcase\b/i, "funda celular: " + t);
  for (const t of top("cargador iphone", 4)) { assert.match(t, /charger/i, "cargador iphone: " + t); assert.match(t, /phone|iphone|magsafe/i, "cargador iphone: " + t); }
  /* «consola» opens on the consoles themselves, by the Electrónica Consolas rule. */
  if (CONSOLES >= 4) for (const t of top("consola", 4)) assert.ok(isConsole({ title: t }), "consola: " + t);
});

check("monitors: a monitor sold with a stand is a monitor; a baby monitor is asked for by name", () => {
  if (MONITORS >= 30) assert.ok(results["monitor"].total >= 30, `monitor: ${results["monitor"].total} of ${MONITORS} stocked`);
  for (const t of top("monitor", 12)) { assert.match(t, /monitor/i, t); assert.doesNotMatch(t, /\b(baby|heart rate|light bar|ball head)\b/i, t); }
  for (const t of top("monitor de bebe", 4)) assert.match(t, /baby/i, t);
});

check("F7: a brand Aria does not sell is an honest no, never a look-alike; a store's short name finds the store", () => {
  for (const q of ["alphalete", "gymshark"]) { assert.equal(results[q].total, 0, q); assert.ok(results[q].missingBrand, q); }
  assert.ok(results["abercrombie"].total >= 100, `abercrombie: ${results["abercrombie"].total}`);
  assert.ok(results["hollister"].total >= 100, `hollister: ${results["hollister"].total}`);
});

check("F2: lencería and the Peruvian words for it find lingerie", () => {
  for (const q of ["lenceria", "brasier"]) {
    assert.ok(results[q].total >= 100, `${q}: ${results[q].total}`);
    for (const t of top(q)) assert.match(t, /\b(bra|bralette|panty|panties|thong|lingerie|bodysuit|slip|brief)/i, `${q}: ${t}`);
  }
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

/* ==================================================================
   BRAND PAGES, THIN (2026-10-19, #409 track T5).

   marca.html (every brand on the site, one template) used to download
   63 catalogue files (202MB raw, 25MB gzipped) to show one brand. Now
   its first screen is assets/sections/marca/<key>.json for every brand
   with 12+ products, or /.netlify/functions/brand for the rest, and
   "Ver todo" asks the same endpoint 48 cards at a time.

   RUNNING IT
     node scripts/test/marca-thin-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { CATALOG_FILES, OUT_DIR, STATIC_MIN, loadAllItems, staticBrands, ALL_LABELS } from "../build-brand-index.mjs";
import { PAGE_SIZE, RAIL_CARDS, FN_FILE, filterByBrand, headOf, titleWords, brandKeyOf } from "../../netlify/functions/_brand-core.js";
import { handler } from "../../netlify/functions/brand.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const PAGE = readFileSync(ROOT + "marca.html", "utf8");
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}
const readJSON = (rel) => JSON.parse(readFileSync(ROOT + rel, "utf8"));
const call = async (qs) => { const r = await handler({ httpMethod: "GET", queryStringParameters: qs }); return { s: r.statusCode, b: JSON.parse(r.body), h: r.headers }; };

const ITEMS = loadAllItems(ROOT);
for (const p of ITEMS) p.words = " " + titleWords(p.name).join(" ") + " ";
const labels = {};
for (const p of ITEMS) if (ALL_LABELS[p.retailer]) labels[p.retailer] = ALL_LABELS[p.retailer];

await check("the endpoint's product list is what today's catalogues give", () => {
  const fn = readJSON(FN_FILE);
  assert.equal(fn.rows.length, ITEMS.length, `${FN_FILE} is stale — run: node scripts/build-brand-index.mjs`);
  for (const i of [0, 1000, 50000, ITEMS.length - 1]) assert.equal(fn.rows[i][0], ITEMS[i].name, `${FN_FILE} row ${i} is stale`);
});

await check("every static head is what the rules compute today, and every brand with 12+ products has one", () => {
  const keys = staticBrands(ITEMS);
  const files = readdirSync(ROOT + OUT_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
  assert.deepEqual(files, keys, "the static heads are not the brands with 12+ products");
  /* gymshark, alphalete and miumiu were their own stores, and LEGO was
     mostly Target: off sale since #443. */
  for (const key of ["nike", "youngla", "crocs", "adidas", "everlast"]) {
    assert.ok(keys.includes(key), `${key} has no static head`);
    assert.deepEqual(readJSON(`${OUT_DIR}/${key}.json`), JSON.parse(JSON.stringify(headOf(key, filterByBrand(ITEMS, key), labels))), `${key}.json is stale`);
  }
  for (const key of keys.filter((_, i) => i % 97 === 0))
    assert.deepEqual(readJSON(`${OUT_DIR}/${key}.json`), JSON.parse(JSON.stringify(headOf(key, filterByBrand(ITEMS, key), labels))), `${key}.json is stale`);
});

await check("the brand rule, unchanged: the brand field, or (4+ letters) a whole title word", () => {
  const items = [{ name: "YoungLA Pump Cover", brand: "", brandKey: "" }, { name: "Nikeish Tee", brand: "Other", brandKey: "other" }, { name: "Tee", brand: "Nike", brandKey: "nike" }, { name: "Gap Logo Tee", brand: "", brandKey: "" }];
  assert.equal(filterByBrand(items, "youngla").length, 1);
  assert.equal(filterByBrand(items, "nike").length, 1, "a substring is not a brand");
  assert.equal(filterByBrand(items, "gap").length, 0, "keys under 4 letters match the brand field only");
  assert.equal(brandKeyOf("Young LA"), "youngla");
});

await check("heads are small and capped: 12 cards per carousel, under 40KB raw", () => {
  for (const f of readdirSync(ROOT + OUT_DIR).filter((f) => f.endsWith(".json"))) {
    const raw = readFileSync(`${ROOT}${OUT_DIR}/${f}`, "utf8");
    assert.ok(raw.length < 40 * 1024, `${f} is ${raw.length} bytes`);
    for (const r of JSON.parse(raw).rails) {
      assert.ok(r.cards.length <= RAIL_CARDS, `${f}: ${r.cards.length} cards`);
      for (const c of r.cards) for (const k of Object.keys(c)) assert.ok(["t", "b", "r", "p", "o", "s", "i", "ph", "k"].includes(k), `${f}: card field ${k}`);
    }
  }
});

await check("the endpoint: static brand, small brand, title-word brand, Ver todo pages, bad input", async () => {
  const nike = await call({ marca: "Nike" });
  assert.equal(nike.s, 200);
  assert.deepEqual(nike.b, readJSON(`${OUT_DIR}/nike.json`), "the endpoint and the static head disagree");
  assert.match(nike.h["Netlify-CDN-Cache-Control"], /max-age=3600/);
  const small = Object.entries(ITEMS.reduce((m, p) => { if (p.brandKey && p.brandKey.length >= 4) m[p.brandKey] = (m[p.brandKey] || 0) + 1; return m; }, {})).find(([, n]) => n > 1 && n < STATIC_MIN)[0];
  assert.ok(!existsSync(`${ROOT}${OUT_DIR}/${small}.json`));
  const s = await call({ marca: small });
  assert.ok(s.b.count >= 2, `${small} answers ${s.b.count}`);
  const p1 = await call({ marca: "nike", rail: "0", page: "1" });
  assert.equal(p1.b.cards.length, PAGE_SIZE);
  const p0 = await call({ marca: "nike", rail: "0", page: "0" });
  assert.deepEqual(p0.b.cards.slice(0, RAIL_CARDS), nike.b.rails[0].cards, "Ver todo starts where the carousel starts");
  assert.equal((await call({ marca: "zzzzqqqq" })).b.count, 0);
  assert.equal((await call({ marca: "" })).s, 400);
  assert.equal((await call({ marca: "nike", rail: "99" })).s, 404);
  assert.equal((await handler({ httpMethod: "POST", queryStringParameters: {} })).statusCode, 405);
});

await check("the page never names a catalogue; it reads its head, then the endpoint", () => {
  assert.ok(!/-catalog\.json|department-cache/.test(PAGE), "marca.html still names a catalogue file");
  for (const f of CATALOG_FILES) assert.ok(!PAGE.includes(f));
  assert.match(PAGE, /var SLICES = "assets\/sections\/marca\/"/);
  assert.match(PAGE, /var ENDPOINT = "\/\.netlify\/functions\/brand"/);
  assert.match(PAGE, /e\.status === 404\) return getJSON\(ENDPOINT/);
});

await check("shape-held cards, placeholder carousels in the HTML, photos on approach, carousels drawn on approach", () => {
  assert.match(PAGE, /\.card \.img\{position:relative; width:100%; aspect-ratio:1\/1;/);
  assert.match(PAGE, /@supports not \(aspect-ratio:1\/1\)\{ \.card \.img\{height:0; padding-top:100%;\} \}/);
  assert.match(PAGE, /<div id="rails" aria-live="polite"><section class="rail-section" aria-hidden="true">/);
  assert.ok(!/loading="lazy"/.test(PAGE.replace(/\/\*[\s\S]*?\*\//g, "")));
  assert.match(PAGE, /function watchPhotos\(/);
  assert.match(PAGE, /var FIRST_RAILS = 3;/);
});

await check("soles first with the shared rate; yellow only on the sale badge; no emojis; no link out", () => {
  assert.match(PAGE, /FX_CACHE_KEY = "aria_fx_rate_v1"/);
  const pi = PAGE.slice(PAGE.indexOf("function priceInner("), PAGE.indexOf("function paintPrices("));
  assert.ok(pi.indexOf('class="pen"') < pi.indexOf('class="usd"'));
  assert.match(PAGE, /\.card \.price \.pen\{font-size:17px; font-weight:800;/);
  assert.ok(!/aprox\./.test(PAGE), "soles still labelled as an approximation under dollars");
  const yellow = PAGE.split("\n").filter((l) => /#FFDE59|var\(--gold\)/i.test(l) && !/--gold:/.test(l));
  assert.ok(yellow.every((l) => /sale-badge|\.logo span|kicker/.test(l)), "yellow outside the badge: " + yellow.join(" | "));
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(PAGE));
  const card = PAGE.slice(PAGE.indexOf("function cardHTML("), PAGE.indexOf("var SKELETON"));
  assert.match(card, /'producto\.html\?producto=' \+ encodeURIComponent/);
  assert.ok(!/\.url\b|target="_blank"/.test(card));
});

await check("the endpoint ships only its own data (netlify.toml)", () => {
  assert.match(readFileSync(ROOT + "netlify.toml", "utf8"), /\[functions\."brand"\]\n\s+included_files = \["assets\/sections\/marca\/_fn\/items\.json"\]/);
});

const MIN_CHECKS = 9;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }

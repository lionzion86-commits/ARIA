/* ==================================================================
   DEPARTMENTS, THIN (2026-10-19, #409 track T5).

   departamento.html serves 31 departments. It used to download all 60
   catalogue files (219MB raw) for any one of them. Now its first screen
   is assets/sections/departamento/<dept>/head.json, the next carousels
   come from rails-<b>.json, and "Ver todo", the store chips and the
   search box ask netlify/functions/department.js.

   These checks pin: the committed slices are what the rules compute
   from the committed catalogues today; the page never names a
   catalogue; the endpoint answers every shape the page asks for; the
   caps; soles first; shape-held cards; photos on approach; no link out.

   RUNNING IT
     node scripts/test/departamento-thin-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import {
  DEPT_RULES, CATALOG_FILES, ALL_LABELS, OUT_DIR, loadAllItems, deptItems,
} from "../build-department-slices.mjs";
import {
  PAGE_SIZE, RAIL_CARDS, HEAD_RAILS, RAIL_BATCH, buildSections, headOf, batchOf, batchCount, answer, filterList,
} from "../../netlify/functions/_department-core.js";
import { handler } from "../../netlify/functions/department.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const PAGE = readFileSync(ROOT + "departamento.html", "utf8");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}
const readJSON = (rel) => JSON.parse(readFileSync(ROOT + rel, "utf8"));

/* The page's department list: keys with a name; doors (href) aside. */
const deptBlock = PAGE.slice(PAGE.indexOf("var DEPTS = {"), PAGE.indexOf("};", PAGE.indexOf("var DEPTS = {")));
const PAGE_KEYS = [...deptBlock.matchAll(/^\s{4}([a-z_]+):\s*\{name:/gm)].map((m) => m[1]);
const DOORS = [...deptBlock.matchAll(/^\s{4}([a-z_]+):\s*\{name:[^\n]*href:/gm)].map((m) => m[1]);
const GRID_KEYS = PAGE_KEYS.filter((k) => !DOORS.includes(k));

const ALL = loadAllItems(ROOT);

await check("the page and the build agree on the 31 departments (plus the two doors to ropa-interior.html)", () => {
  assert.equal(GRID_KEYS.length, 31, `page lists ${GRID_KEYS.length} grid departments`);
  assert.deepEqual([...GRID_KEYS].sort(), Object.keys(DEPT_RULES).sort());
  assert.deepEqual(DOORS.sort(), ["ropa_interior", "ropa_interior_mujer"]);
});

await check("every committed head.json and rails-<b>.json is what the rules compute from today's catalogues", () => {
  for (const key of Object.keys(DEPT_RULES)) {
    const list = deptItems(ALL, key);
    const sections = buildSections(list);
    const head = readJSON(`${OUT_DIR}/${key}/head.json`);
    assert.deepEqual(head, JSON.parse(JSON.stringify(headOf(key, list, sections, ALL_LABELS))), `${key}/head.json is stale — run: node scripts/build-department-slices.mjs`);
    const n = batchCount(sections);
    for (let b = 0; b < n; b++) {
      assert.deepEqual(readJSON(`${OUT_DIR}/${key}/rails-${b}.json`), JSON.parse(JSON.stringify(batchOf(sections, b))), `${key}/rails-${b}.json is stale`);
    }
    assert.ok(!existsSync(`${ROOT}${OUT_DIR}/${key}/rails-${n}.json`), `${key} has a leftover rails-${n}.json`);
    const fn = readJSON(`${OUT_DIR}/_fn/${key}.json`);
    assert.equal(fn.rows.length, list.length, `_fn/${key}.json is stale`);
  }
});

await check("every department has products and the heaviest ones are what Danny named", () => {
  for (const key of Object.keys(DEPT_RULES)) assert.ok(readJSON(`${OUT_DIR}/${key}/head.json`).count > 0, `${key} is empty`);
  for (const key of ["gym_rat", "beauty", "luxury", "moms", "women", "men", "kids", "curvy", "surf_skate", "toys", "combat_sports"])
    assert.ok(readJSON(`${OUT_DIR}/${key}/head.json`).count > 100, `${key} has almost nothing`);
});

await check("the first screen is small: every head.json under 32KB raw, every batch under 32KB, cards capped", () => {
  for (const key of Object.keys(DEPT_RULES)) {
    const dir = `${ROOT}${OUT_DIR}/${key}/`;
    for (const f of readdirSync(dir)) {
      const raw = readFileSync(dir + f, "utf8");
      assert.ok(raw.length < 32 * 1024, `${key}/${f} is ${raw.length} bytes`);
      const j = JSON.parse(raw);
      for (const r of j.rails || []) if (r.cards) assert.ok(r.cards.length <= RAIL_CARDS, `${key}/${f} rail ${r.i} draws ${r.cards.length} cards`);
    }
    const head = readJSON(`${OUT_DIR}/${key}/head.json`);
    assert.ok(head.rails.filter((r) => r.cards).length <= HEAD_RAILS, `${key} head carries too many carousels`);
  }
});

await check("cards carry only what a tile and a tap need (no sizes, no retailer URL, no description)", () => {
  const head = readJSON(`${OUT_DIR}/women/head.json`);
  for (const r of head.rails) for (const c of r.cards || []) {
    for (const k of Object.keys(c)) assert.ok(["t", "b", "r", "p", "o", "s", "i"].includes(k), `card field ${k}`);
    assert.ok(c.t && c.r && c.p > 0, "card without title, store or price");
    if (c.o) assert.ok(c.o > c.p && c.s > 0, "a was-price on a card that is not on sale");
  }
});

await check("the page never names a catalogue, and loads its slices and the endpoint instead", () => {
  assert.ok(!/-catalog\.json|department-cache/.test(PAGE), "departamento.html still names a catalogue file");
  assert.ok(!/CATALOG_FILES|belongsToDept|KIND_MATCH/.test(PAGE), "the membership rules are back in the page");
  assert.match(PAGE, /assets\/sections\/departamento\//);
  assert.match(PAGE, /\/\.netlify\/functions\/department/);
  for (const f of CATALOG_FILES) assert.ok(!PAGE.includes(f));
});

await check("the endpoint: head, store filter, words, carousel page, batch, unknown and hostile keys", async () => {
  const call = async (qs) => { const r = await handler({ httpMethod: "GET", queryStringParameters: qs }); return { s: r.statusCode, b: JSON.parse(r.body), h: r.headers }; };
  const head = await call({ dept: "women" });
  assert.equal(head.s, 200);
  assert.deepEqual(head.b.rails.map((r) => r.count), readJSON(`${OUT_DIR}/women/head.json`).rails.map((r) => r.count));
  assert.match(head.h["Netlify-CDN-Cache-Control"], /max-age=3600/);
  const store = head.b.stores[0].k;
  const byStore = await call({ dept: "women", r: store });
  assert.equal(byStore.b.count, head.b.stores[0].n);
  for (const r of byStore.b.rails) for (const c of r.cards || []) assert.equal(c.r, store);
  const words = await call({ dept: "gym_rat", q: "shorts" });
  assert.ok(words.b.count > 0 && words.b.count < readJSON(`${OUT_DIR}/gym_rat/head.json`).count);
  for (const r of words.b.rails) for (const c of r.cards || []) assert.match((c.t + " " + (c.b || "")).toLowerCase(), /shorts/);
  const page = await call({ dept: "women", rail: "0", page: "1" });
  assert.equal(page.s, 200);
  assert.equal(page.b.cards.length, PAGE_SIZE);
  assert.equal(page.b.page, 1);
  const p0 = await call({ dept: "women", rail: "0", page: "0" });
  assert.deepEqual(p0.b.cards.slice(0, RAIL_CARDS), readJSON(`${OUT_DIR}/women/head.json`).rails[0].cards, "Ver todo starts where the carousel starts");
  const batch = await call({ dept: "women", batch: "0" });
  assert.deepEqual(batch.b, readJSON(`${OUT_DIR}/women/rails-0.json`));
  assert.equal((await call({ dept: "nope" })).s, 404);
  assert.equal((await call({ dept: "../../netlify" })).s, 404);
  assert.equal((await call({ dept: "women", rail: "9999" })).s, 404);
  assert.equal((await handler({ httpMethod: "POST", queryStringParameters: {} })).statusCode, 405);
});

await check("the page's filters, unchanged: one store, and every word in the title or brand", () => {
  const list = [{ title: "Red Dress", brand: "Gap", retailer: "gap" }, { title: "Blue Dress", brand: "Zara", retailer: "macys" }, { title: "Red Shirt", brand: "Gap", retailer: "gap" }];
  assert.equal(filterList(list, { q: "red dress" }).length, 1);
  assert.equal(filterList(list, { r: "gap" }).length, 2);
  assert.equal(filterList(list, { r: "all", q: "gap" }).length, 2);
  assert.equal(answer({ dept: "women", q: "zzzqqqxx" }).body.count, 0, "an impossible search answers an empty department, not an error");
});

await check("shape-held cards, card-shaped placeholders before any script, photos on approach", () => {
  assert.match(PAGE, /\.card-img\{position:relative;width:100%;aspect-ratio:1\/1/);
  assert.match(PAGE, /@supports not \(aspect-ratio:1\/1\)\{ \.card-img\{height:0;padding-top:100%\} \}/);
  assert.match(PAGE, /\.card-title\{[^}]*min-height:35px/);
  assert.match(PAGE, /<main id="rails" aria-live="polite"><section class="rail-sec" aria-hidden="true">/, "no placeholder carousels in the HTML");
  assert.ok(!/loading="lazy"/.test(PAGE.replace(/\/\*[\s\S]*?\*\//g, "")), "native lazy-loading fetches a whole carousel at once on a slow link");
  assert.match(PAGE, /IntersectionObserver/);
  assert.match(PAGE, /replace\(\/\^src=\/, 'data-src='\)/);
});

await check("soles first, with the site's shared rate; yellow only on the sale badge; no emojis", () => {
  assert.match(PAGE, /FX_CACHE_KEY = 'aria_fx_rate_v1'/);
  assert.match(PAGE, /\/\.netlify\/functions\/exchange-rate/);
  const pi = PAGE.slice(PAGE.indexOf("function priceInner("), PAGE.indexOf("function paintPrices("));
  assert.ok(pi.indexOf('class="pen"') < pi.indexOf('class="usd"'), "dollars lead");
  assert.match(PAGE, /\.price \.pen\{font-size:16px;font-weight:800/);
  const yellow = PAGE.split("\n").filter((l) => /var\(--yellow\)/.test(l) && !/--yellow:/.test(l));
  assert.ok(yellow.every((l) => /\.badge|btn-gold/.test(l)), "yellow outside the sale badge: " + yellow.join(" | "));
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(PAGE), "an emoji in the page");
});

await check("every card is a link to our product page — never to a retailer", () => {
  const card = PAGE.slice(PAGE.indexOf("function cardHTML("), PAGE.indexOf("var SKELETON"));
  assert.match(card, /'producto\.html\?producto=' \+ encodeURIComponent/);
  assert.ok(!/\.url\b|target="_blank"/.test(card));
  assert.ok(!/href="https?:/.test(PAGE.replace(/<header[\s\S]*?<\/header>/, "")), "an external link in the page");
});

await check("the endpoint ships only its own data (netlify.toml)", () => {
  const toml = readFileSync(ROOT + "netlify.toml", "utf8");
  assert.match(toml, /\[functions\."department"\]\n\s+included_files = \["assets\/sections\/departamento\/_fn\/\*\.json"\]/);
});

const MIN_CHECKS = 12;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }

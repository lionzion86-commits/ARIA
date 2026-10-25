/* ==================================================================
   ARIA AUTO, THIN (#409 track T4) — auto.html never downloads a parts
   catalogue; it reads the slices scripts/build-auto-slices.mjs writes
   to assets/auto/.

   RUNNING IT
     node scripts/test/auto-thin-tests.mjs
   A failure "slices are stale" means: node scripts/build-auto-slices.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import vm from "node:vm";
import { buildSlices, slug, vehicleSlug, SELECTOR_MAKES, OUT_DIR, pnShard } from "../build-auto-slices.mjs";
import { loadPageEngine } from "../lib/mcp/page-slices.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const readJson = (f) => JSON.parse(read(f));

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

const page = read("auto.html");
const script = page.slice(page.indexOf('<script>\n"use strict";') + 8, page.lastIndexOf("</script>"));
function lift(src, sig) {
  const at = src.indexOf(sig);
  if (at < 0) throw new Error(`auto.html: ${sig} moved — update this test`);
  let depth = 0, i = src.indexOf("{", at + sig.length - 1);
  for (; i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}" && --depth === 0) break; }
  return src.slice(at, i + 1);
}
function liftVar(src, name) {
  const m = new RegExp("var " + name + " = [^\\n]*;").exec(src);
  if (!m) throw new Error(`auto.html: var ${name} moved`);
  return m[0];
}
const pageFns = (() => {
  const code = [liftVar(script, "STOP"), liftVar(script, "TAX_EXEMPT"), liftVar(script, "PRE_PRICED"),
    ...["function slug(", "function normPn(", "function normText(", "function stemTok(", "function phraseToks(", "function partTerms(",
      "function scorePart(", "function matchQuery(", "function tieredMarginUsd(", "function salesTaxRate(", "function finalUsd("].map((s) => lift(script, s)),
    /var VEHICLES = \[[\s\S]*?\n\];/.exec(script)[0]].join("\n");
  const box = {};
  vm.runInNewContext(code + "\nthis.f = { slug, normPn, matchQuery, finalUsd, salesTaxRate, VEHICLES };", box);
  return box.f;
})();

const cache = readJson("auto-cache.json");
const glossary = readJson("scripts/lib/es-en-parts-glossary.json");
const built = buildSlices(cache, glossary);
const index = readJson(`${OUT_DIR}/index.json`);

await check("auto.html never asks for a catalogue", () => {
  assert.doesNotMatch(script, /['"][^'"\n]*(auto-cache\.json|-catalog\.json|department-cache)/, "auto.html still fetches a catalogue file");
  assert.match(script, /var AUTO_BASE = '\/assets\/auto\/';/);
});

await check("slices are fresh: index.json matches a rebuild from auto-cache.json + the glossary", () => {
  assert.deepEqual(index, JSON.parse(JSON.stringify(built.index)), "slices are stale — run node scripts/build-auto-slices.mjs");
});

await check("slices are fresh: every vehicle/part, fallback and part-number file matches the rebuild", () => {
  let n = 0;
  for (const [vk, v] of built.vehicles) for (const [ps, bySrc] of Object.entries(v.parts)) {
    assert.deepEqual(readJson(`${OUT_DIR}/v/${v.slug}/${ps}.json`), JSON.parse(JSON.stringify({ v: vk, part: ps, bySource: bySrc })), `${v.slug}/${ps}`); n++;
  }
  for (const [ps, byMake] of Object.entries(built.fallback)) for (const [m, items] of Object.entries(byMake)) {
    assert.deepEqual(readJson(`${OUT_DIR}/fb/${ps}/${m}.json`).items, JSON.parse(JSON.stringify(items)), `fb ${ps}/${m}`); n++;
  }
  for (const [sh, map] of Object.entries(built.pn)) { assert.deepEqual(readJson(`${OUT_DIR}/pn/${sh}.json`), JSON.parse(JSON.stringify(map)), `pn ${sh}`); n++; }
  const onDisk = (d) => readdirSync(d).reduce((s, f) => s + (statSync(join(d, f)).isDirectory() ? onDisk(join(d, f)) : 1), 0);
  assert.equal(onDisk(join(ROOT, OUT_DIR)), n + 1, "assets/auto holds files the build no longer writes");
});

await check("nothing is lost: every cached part reaches its vehicle slice", () => {
  for (const [k, bySrc] of Object.entries(cache.partSearches)) {
    const b = k.split("|");
    const file = `${OUT_DIR}/v/${vehicleSlug(b[0], b[1], b[2])}/${slug(b.slice(3).join("|"))}.json`;
    const want = new Set(Object.values(bySrc).flat().map((r) => String(r.part_number || r.productTitle || r.title)));
    if (!want.size) continue;
    const got = new Set(Object.values(readJson(file).bySource).flat().map((c) => String(c.pn || c.t)));
    assert.deepEqual([...got].sort(), [...want].sort(), file);
  }
});

await check("slices are small: no file over 120KB raw; a search slice under 4KB gzipped", () => {
  const walk = (d) => readdirSync(d).flatMap((f) => statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]);
  let maxV = 0;
  for (const f of walk(join(ROOT, OUT_DIR))) {
    const buf = readFileSync(f);
    assert.ok(buf.length < 120 * 1024, `${f} is ${buf.length} bytes`);
    if (f.includes("/v/")) maxV = Math.max(maxV, gzipSync(buf).length);
  }
  assert.ok(maxV < 4096, `largest vehicle/part slice is ${maxV} bytes gzipped`);
  assert.ok(gzipSync(read(`${OUT_DIR}/index.json`)).length < 8192, "index.json grew past 8KB gzipped");
});

await check("cards carry no retailer link (the page never links out)", () => {
  for (const f of ["index.json", "pn/D.json", "fb/pastillas-de-freno/toyota.json", "v/2020-toyota-camry/pastillas-de-freno.json"])
    assert.doesNotMatch(read(`${OUT_DIR}/${f}`), /autozone\.com\/p\/|"url":/, f);
  assert.doesNotMatch(page, /href="https?:\/\/(www\.)?(autozone|advanceautoparts|rockauto)/i);
});

await check("the page's slug, part-number shard and fallback makes match the build script", () => {
  for (const s of ["2020 Mercedes-Benz C-Class", "bujías", "sensor de árbol de levas", "Silverado 2500HD", "válvula pcv", "  x  "])
    assert.equal(pageFns.slug(s), slug(s), s);
  assert.equal(pnShard(pageFns.normPn("d-2076")), "D");
  assert.deepEqual(JSON.parse(JSON.stringify(pageFns.VEHICLES.map((v) => v.make))), SELECTOR_MAKES, "selector makes drifted from SELECTOR_MAKES");
  assert.deepEqual(index.makes, SELECTOR_MAKES.map(slug));
  for (const p of index.parts) for (const m of index.makes) assert.ok(existsSync(join(ROOT, OUT_DIR, "fb", p.s, m + ".json")), `fb/${p.s}/${m}`);
});

await check("the glossary: Spanish, synonyms, singular and English names find the same part", () => {
  const exactOf = (q) => { const r = pageFns.matchQuery(q, index); return r.exact >= 0 ? index.parts[r.exact].es : null; };
  for (const q of ["pastillas de freno", "Pastillas de Freno", "pastilla de freno", "balatas", "brake pads", "brake pads toyota", "pastillas de freno delanteras"])
    assert.equal(exactOf(q), "pastillas de freno", q);
  assert.equal(exactOf("bujias"), "bujías");
  assert.equal(exactOf("spark plugs"), "bujías");
  assert.equal(exactOf("oil filter"), "filtro de aceite");
  assert.equal(exactOf("filtro de aire de cabina"), "filtro de aire de cabina");
  assert.equal(exactOf("filtro de aire"), "filtro de aire");
  assert.equal(exactOf("plumillas"), "limpiaparabrisas");
  assert.equal(exactOf("freno"), null, "one shared word is a fallback, not the exact part");
  assert.ok(pageFns.matchQuery("freno", index).ranked.length >= 2);
  const d = pageFns.matchQuery("discos de freno", index);
  assert.equal(d.exact, -1); assert.equal(d.unstocked && d.unstocked.es, "discos de freno");
  assert.equal(pageFns.matchQuery("D2076", index).pn, "D2076");
  assert.equal(pageFns.matchQuery("pastillas de freno", index).pn, null);
  const pn = readJson(`${OUT_DIR}/pn/D.json`).D2076;
  assert.ok(pn && pn.c.t && pn.v.includes(index.vehicles.indexOf("2020|toyota|camry")));
});

await check("one price everywhere: auto.html prices like the SPA card (margin + Miami sales tax)", () => {
  const ENGINE = loadPageEngine();
  for (const retailer of ["autozone", "walmart", "advanceauto"])
    for (const raw of [5, 43.99, 54.99, 499.99, 750, 2600])
      assert.equal(pageFns.finalUsd(raw, retailer), ENGINE.pricing.normalizeLiveItem({ title: "x", price: raw, retailer }, { retailer }).price, `${retailer} ${raw}`);
  assert.equal(pageFns.finalUsd(54.99, "autozone"), 72.96);
  assert.doesNotMatch(script, /function marginPrice\(/, "the old tax-less price is back");
});

await check("soles first, capped drawing, shaped cards, photos on approach", () => {
  assert.match(script, /'<div class="pprice"><b>' \+ fmtPEN\(/, "the bold price is not soles");
  assert.match(script, /FX_CACHE_KEY = "aria_fx_rate_v1"/);
  assert.match(script, /\/\.netlify\/functions\/exchange-rate/);
  const pageSize = Number(/var PAGE = (\d+);/.exec(script)[1]);
  assert.ok(pageSize > 0 && pageSize <= 48);
  assert.match(script, /Mostrar más/);
  assert.match(script, /new IntersectionObserver/);
  assert.match(script, /<img data-src="/);
  assert.doesNotMatch(script, /loading="lazy"/);
  assert.match(page, /\.pimg\{[^}]*width:96px;height:96px/);
  assert.match(page, /\.ptitle\{[^}]*min-height:2\.7em/);
  assert.match(script, /class="pcard sk"/);
});

await check("decodes before escaping; no emoji; yellow only for sale badges", () => {
  assert.match(page, /function esc\(s\)\{ return escRaw\(decodeEntitiesText\(s\)\); \}/);
  assert.doesNotMatch(page, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, "emoji in the page");
  assert.doesNotMatch(page, /\.badge\.[a-z]+\{background:#FE(F3C7|F08A)/i, "a non-sale badge is yellow");
});

await check("the cart line has producto.html's key and shape", () => {
  assert.match(script, /var CART_KEY = 'aria_cart_v1';/);
  const fn = lift(script, "function addPartToCart(");
  for (const k of ["retailer:", "title:", "priceUsd:", "dutiableUsd:", "weightKg:", "weightEstimated: true", "image:", "selectedSize: null"]) assert.ok(fn.includes(k), k);
  assert.match(fn, /if \(!\(priceUsd > 0\)\)/, "the $0 guard is gone");
  assert.match(script, /'producto\.html\?producto=' \+ encodeURIComponent/);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }

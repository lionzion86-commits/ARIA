/* ==================================================================
   NO "&#38;" IN FRONT OF A SHOPPER (#417 night order 4).

   Scraped titles arrived HTML-encoded ("Lizzie &#38; Oliver",
   "Men&#39;s ... Goodfellow &#38; Co&#8482;") and every page escaped
   them once more, so shoppers read the codes. Two layers now:

   1. the data: catalogue and feed titles and brands are plain text
      (scripts/decode-catalog-entities.py rewrites only those values);
   2. the pages: every page's HTML escaper decodes entities first, so a
      future scrape that brings them back still renders as text.

   RUNNING IT
     node scripts/test/entity-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}
const ENTITY = /&(#\d+|#x[0-9a-f]+|amp|quot|apos|lt|gt|nbsp|reg|trade|copy);/i;

check("no catalogue or feed title or brand carries an HTML entity", () => {
  const bad = [];
  for (const f of readdirSync(ROOT).filter((f) => /(-catalog|^department-cache(-[a-z]+)?|feed(-lite)?|^vs-deals)\.json$/.test(f))) {
    let j; try { j = JSON.parse(readFileSync(ROOT + f, "utf8")); } catch { continue; }
    const visit = (it) => { for (const k of ["title", "name", "productName", "brand"]) if (it && typeof it[k] === "string" && ENTITY.test(it[k])) bad.push(`${f}: ${it[k].slice(0, 60)}`); };
    for (const r of Object.values((j && j.retailers) || {})) for (const sec of ["departments", "brands"]) for (const b of Object.values((r && r[sec]) || {})) for (const it of (Array.isArray(b) ? b : (b && b.items) || [])) visit(it);
    for (const it of (j && (j.items || j.products)) || []) visit(it);
  }
  assert.equal(bad.length, 0, `${bad.length} encoded values, e.g. ${bad.slice(0, 3).join(" | ")} — run: python3 scripts/decode-catalog-entities.py`);
});

const PAGES = ["tienda.html", "marca.html", "departamento.html", "ofertas.html", "motos.html", "ropa-interior.html", "auto.html", "checkout.html"];
check("every page decodes before it escapes", () => {
  for (const f of PAGES) {
    const src = readFileSync(ROOT + f, "utf8");
    assert.match(src, /function esc\(s\)\{ return escRaw\(decodeEntitiesText\(s\)\); \}/, `${f}: esc() does not decode`);
  }
  const home = readFileSync(ROOT + "index.html", "utf8");
  const bundle = readFileSync(ROOT + /<script src="\/(build\/app-[0-9a-f]+\.js)"><\/script>/.exec(home)[1], "utf8");
  assert.match(bundle, /function escapeHtml\(str\)\{ return escapeHtmlRaw\(decodeEntitiesText\(str\)\); \}/, "the app's escapeHtml does not decode");
  assert.match(readFileSync(ROOT + "search.html", "utf8"), /var title = decodeEntities\(p\.title\)/, "search.html");
  assert.match(readFileSync(ROOT + "producto.html", "utf8"), /name: decodeEntities\(name\)/, "producto.html");
});

check("the decoder turns codes into text and leaves everything else alone", () => {
  const src = readFileSync(ROOT + "tienda.html", "utf8");
  const start = src.indexOf("var ENTITY_NAMED");
  const end = src.indexOf("function esc(s){ return escRaw");
  const box = {};
  vm.runInNewContext(src.slice(start, end) + "\nthis.d = decodeEntitiesText;", box);
  const d = box.d;
  assert.equal(d("Lizzie &#38; Oliver"), "Lizzie & Oliver");
  assert.equal(d("18&#34; Dolls"), '18" Dolls');
  assert.equal(d("Men&#39;s Tee - Goodfellow &#38; Co&#8482;"), "Men's Tee - Goodfellow & Co™");
  assert.equal(d("A &amp;#38; B"), "A & B");
  assert.equal(d("AT&T 5&x; Tom & Jerry"), "AT&T 5&x; Tom & Jerry");
  assert.equal(d(null), null);
  assert.equal(d(42), 42);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }

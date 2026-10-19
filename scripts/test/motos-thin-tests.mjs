/* ==================================================================
   ARIA MOTOS, THIN (2026-10-19, #409 track T5).

   motos.html used to download moto-catalog.json (4.7MB raw, 0.8MB
   gzipped) and filter it on the phone. Its grid is now static pages
   per type chip x store chip (scripts/build-motos-slices.mjs), and the
   search box asks netlify/functions/motos.js, 48 cards at a time.

   RUNNING IT
     node scripts/test/motos-thin-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { OUT_DIR, CATALOG, loadItems } from "../build-motos-slices.mjs";
import { PAGE_SIZE, FN_FILE, TYPES, STORES, filterList, pageOf, subType } from "../../netlify/functions/_motos-core.js";
import { handler } from "../../netlify/functions/motos.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const PAGE = readFileSync(ROOT + "motos.html", "utf8");
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}
const readJSON = (rel) => JSON.parse(readFileSync(ROOT + rel, "utf8"));
const ALL = loadItems(ROOT);

await check("every static page is what today's catalogue gives, for every type x store chip", () => {
  assert.equal(readJSON(FN_FILE).rows.length, ALL.length, "stale — run: node scripts/build-motos-slices.mjs");
  for (const t of TYPES) for (const r of STORES) {
    const list = filterList(ALL, { t, r });
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    for (let n = 0; n < pages; n++) assert.deepEqual(readJSON(`${OUT_DIR}/${t}-${r}-${n}.json`), JSON.parse(JSON.stringify({ t, r, q: "", ...pageOf(list, n) })), `${t}-${r}-${n}.json`);
    assert.ok(!existsSync(`${ROOT}${OUT_DIR}/${t}-${r}-${pages}.json`), `leftover ${t}-${r}-${pages}.json`);
  }
});

await check("the page's rules: sale first then cheapest; the subtype by title words", () => {
  for (let i = 1; i < ALL.length; i++) {
    const a = ALL[i - 1], b = ALL[i];
    if ((a.salePct > 0) === (b.salePct > 0)) assert.ok(a.rawPrice <= b.rawPrice, "not cheapest-first");
    else assert.ok(a.salePct > 0, "a sale after a non-sale");
  }
  assert.equal(subType("Shoei RF-1400 Helmet"), "cascos");
  assert.equal(subType("Michelin Road 6 Tire"), "llantas");
  assert.equal(subType("EBC Brake Pads"), "repuestos");
  assert.equal(subType("Alpinestars SMX Gloves"), "ropa_equipo");
  assert.equal(subType("Phone Mount"), "accesorios");
});

await check("small pages, lean cards", () => {
  for (const f of readdirSync(ROOT + OUT_DIR).filter((f) => f.endsWith(".json"))) {
    const raw = readFileSync(`${ROOT}${OUT_DIR}/${f}`, "utf8");
    assert.ok(raw.length < 24 * 1024, `${f} is ${raw.length} bytes`);
    const j = JSON.parse(raw);
    assert.ok(j.cards.length <= PAGE_SIZE);
    for (const c of j.cards) for (const k of Object.keys(c)) assert.ok(["t", "b", "r", "p", "o", "s", "i"].includes(k), `${f}: ${k}`);
  }
});

await check("the endpoint: words within the chips, pages, junk chips ignored, bad method", async () => {
  const call = async (qs) => { const r = await handler({ httpMethod: "GET", queryStringParameters: qs }); return { s: r.statusCode, b: JSON.parse(r.body), h: r.headers }; };
  const a = await call({ q: "helmet" });
  assert.equal(a.s, 200);
  assert.equal(a.b.count, filterList(ALL, { q: "helmet" }).length);
  assert.ok(a.b.count > 48 && a.b.cards.length === 48);
  assert.match(a.h["Netlify-CDN-Cache-Control"], /max-age=3600/);
  const b = await call({ q: "helmet", t: "cascos", r: "revzilla", page: "1" });
  assert.equal(b.b.page, 1);
  for (const c of b.b.cards) assert.equal(c.r, "revzilla");
  assert.equal((await call({ q: "helmet", t: "<script>" })).b.t, "all");
  assert.equal((await call({ q: "zzzzqqqq" })).b.count, 0);
  assert.equal((await call({ q: "helmet", page: "999" })).s, 404);
  assert.equal((await handler({ httpMethod: "POST", queryStringParameters: {} })).statusCode, 405);
});

await check("the page never downloads the catalogue", () => {
  assert.ok(!PAGE.includes(CATALOG));
  assert.ok(!/-catalog\.json/.test(PAGE));
  assert.match(PAGE, /var SLICES = 'assets\/sections\/motos\/'/);
  assert.match(PAGE, /var ENDPOINT = '\/\.netlify\/functions\/motos'/);
});

await check("placeholder grid in the HTML, shape-held cards, photos on approach", () => {
  assert.match(PAGE, /<main class="grid" id="grid" aria-live="polite"><div class="card sk" aria-hidden="true">/);
  assert.match(PAGE, /\.card-img\{position:relative;width:100%;aspect-ratio:1\/1;/);
  assert.match(PAGE, /@supports not \(aspect-ratio:1\/1\)\{ \.card-img\{height:0;padding-top:100%\} \}/);
  assert.ok(!/loading="lazy"/.test(PAGE.replace(/\/\*[\s\S]*?\*\//g, "")));
  assert.match(PAGE, /function watchPhotos\(/);
});

await check("soles first with the shared rate; yellow only on the badge; no link out; no emojis", () => {
  assert.match(PAGE, /FX_CACHE_KEY = 'aria_fx_rate_v1'/);
  const pi = PAGE.slice(PAGE.indexOf("function priceInner("), PAGE.indexOf("function paintPrices("));
  assert.ok(pi.lastIndexOf('class="pen"') < pi.lastIndexOf('class="usd"'));
  const yellow = PAGE.split("\n").filter((l) => /var\(--yellow\)/.test(l) && !/--yellow:/.test(l));
  assert.ok(yellow.every((l) => /\.badge|btn-gold/.test(l)), yellow.join(" | "));
  const card = PAGE.slice(PAGE.indexOf("function cardHTML("), PAGE.indexOf("var SKELETON"));
  assert.match(card, /'producto\.html\?producto=' \+ encodeURIComponent/);
  assert.ok(!/\.url\b|target="_blank"/.test(card));
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(PAGE));
  assert.match(readFileSync(ROOT + "netlify.toml", "utf8"), /\[functions\."motos"\]\n\s+included_files = \["assets\/sections\/motos\/_fn\/items\.json"\]/);
});

const MIN_CHECKS = 7;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }

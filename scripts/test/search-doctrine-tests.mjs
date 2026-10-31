/* ==================================================================
   THE SEARCH DOCTRINE (#443 c.6547231776, c.6547453746, c.6547518074,
   c.6547946175). ONE system for every search:
     1. a store's name opens that store's page (no results grid); a store
        whose name is also a brand other stores sell (Crocs) is searched
        as the brand;
     2. the comparison charts, then Ofertas (real markdowns, 5%+), then
        ONE rail per store carrying the term or its brand, biggest first;
     3. inside a store's rail: the exact item first, then the same brand,
        then that store's similar items (the query's own product words);
     4. never the side-by-side grid; every rail that holds more than it
        shows expands in place (?lane=&off=).
   Acceptance (Lucifer, c.6547946175): "Victoria's Secret" lands on the
   VS store page; "Adidas", "Adidas Samba" charts + per-store rails;
   "Nike Air Force" chart + per-store rails with ZERO grid; "Crocs" the
   full pattern; "Levi's jeans" continues brand -> category.

     node scripts/test/search-doctrine-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const ROOT = new URL("../../", import.meta.url).pathname;
process.chdir(ROOT);
const { handler } = await import("../../netlify/functions/search.js");
const core = await import("../../netlify/functions/_search-core.js");
const PAGE = readFileSync(ROOT + "search.html", "utf8");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
async function ask(qs) {
  const r = await handler({ httpMethod: "GET", queryStringParameters: qs }, { fetchImpl });
  return { status: r.statusCode, body: JSON.parse(r.body || "{}") };
}
const stores = (b) => (b.lanes || []).filter((l) => l.store).map((l) => l.store);
const disc = (c) => (c.wasUsd && c.wasUsd > c.usd ? 1 - c.usd / c.wasUsd : 0);

await check("a store's name opens its store: VS (every spelling), Dick's, Walmart, BrandsMart; a brand sold elsewhere does not", async () => {
  for (const [q, key] of [["Victoria's Secret", "victoriassecret"], ["victorias secret", "victoriassecret"], ["vs", "victoriassecret"], ["dicks", "dicks"],
    ["Dick's", "dicks"], ["walmart", "walmart"], ["brandsmart", "brandsmart"], ["foot locker", "footlocker"]]) {
    assert.equal((await ask({ q })).body.store, key, q);
  }
  for (const q of ["crocs", "nike", "adidas", "adidas samba", "zapatillas", "surf"]) assert.equal((await ask({ q })).body.store, null, q);
});

await check("the page follows the store answer to tienda.html, unless ?resultados=1", () => {
  assert.match(PAGE, /if \(data\.store && data\.page === 1 && STORE_PAGES\.indexOf\(" " \+ data\.store \+ " "\) >= 0 && !\/\[\?&\]resultados=1\/\.test\(location\.search\)\)\{/);
  assert.match(PAGE, /location\.replace\("tienda\.html\?tienda=" \+ encodeURIComponent\(data\.store\)\);/);
});

for (const [q, need] of [["adidas", ["ccs", "snipes"]], ["adidas samba", ["ccs", "snipes"]], ["nike air force", ["snipes", "footlocker", "ssense"]], ["crocs", ["crocs", "snipes", "walmart"]], ["levis jeans", ["revolve", "walmart"]]]) {
  await check(`"${q}": Ofertas (5%+ markdowns) then one rail per store, biggest exact first -- ${need.join(", ")} among them`, async () => {
    const b = (await ask({ q })).body;
    assert.equal(b.mode, "doctrine");
    assert.ok(b.lanes.length >= 2, "lanes");
    const of = b.lanes.find((l) => l.key === "ofertas");
    if (of) for (const c of of.items) assert.ok(disc(c) >= 0.05 - 1e-9, `Ofertas card ${c.title} is ${(disc(c) * 100).toFixed(1)}% off`);
    if (of) assert.equal(b.lanes[0].key, "ofertas", "Ofertas leads");
    for (const s of need) assert.ok(stores(b).includes(s), `no ${s} rail (${stores(b).join(", ")})`);
    const sl = b.lanes.filter((l) => l.store);
    for (let i = 1; i < sl.length; i++) assert.ok(sl[i - 1].exact >= sl[i].exact, "store rails are not biggest-exact first");
    for (const l of b.lanes) assert.ok(l.n >= l.items.length && l.items.length <= core.LANE_SIZE);
  });
}

await check("inside a store's rail: the exact item, then the same brand, then that store's similar items (Samba at CCS; Levi's then jeans at Walmart)", async () => {
  const s = (await ask({ q: "adidas samba" })).body.lanes.find((l) => l.store === "ccs");
  assert.ok(s.exact >= 5);
  /* Every Samba CCS has leads, together, before anything else. */
  const isSamba = s.items.map((c) => /samba/i.test(c.title));
  const firstOther = isSamba.indexOf(false);
  assert.ok(isSamba[0] && firstOther >= 5, "CCS rail does not open on its Sambas");
  assert.ok(isSamba.slice(firstOther).every((x) => !x), "a Samba after the adidas continuation");
  const page2 = (await ask({ q: "adidas samba", lane: "tienda:ccs", off: String(s.exact) })).body;
  assert.ok(page2.items.length && page2.items.every((c) => /adidas/i.test(c.brand || c.title)), "after its Sambas, CCS continues with adidas");
  const w = (await ask({ q: "levis jeans" })).body.lanes.find((l) => l.store === "walmart");
  assert.ok(w.n > w.exact, "Walmart's rail stops at Levi's");
  const all = (await ask({ q: "levis jeans", lane: "tienda:walmart", off: "0" })).body.items;
  const tail = all.slice(w.exact);
  assert.ok(tail.some((c) => /jean/i.test(c.title) && !/levi/i.test(c.brand || "")), "no other jeans after the Levi's");
});

await check("a store with none of the exact item still gets its rail, brand items only (Nike Air Force: a Nike store with no Air Force)", async () => {
  const b = (await ask({ q: "nike air force" })).body;
  const zero = b.lanes.filter((l) => l.store && l.exact === 0);
  assert.ok(zero.length > 0, "every store had an Air Force");
  for (const l of zero) for (const c of l.items) assert.match(c.brand || c.title, /nike/i, `${l.title}: ${c.title}`);
});

await check("every rail expands in place: ?lane=&off= pages on to its true total", async () => {
  const b = (await ask({ q: "adidas" })).body;
  const l = b.lanes.find((x) => x.store && x.n > x.items.length);
  const p = (await ask({ q: "adidas", lane: l.key, off: String(l.items.length) })).body;
  assert.equal(p.n, l.n);
  assert.ok(p.items.length > 0);
  const firstIds = new Set(l.items.map((c) => c.id));
  assert.ok(p.items.every((c) => !firstIds.has(c.id)), "page 2 repeats page 1");
  assert.equal((await ask({ q: "adidas", lane: "tienda:nope", off: "0" })).status, 404);
});

await check("the page: no grid -- answerHTML draws the charts and the rails only; each rail ends in a Ver más card", () => {
  const fn = PAGE.slice(PAGE.indexOf("function answerHTML("), PAGE.indexOf("/* ---------- one product, every store"));
  assert.ok(!/grid-head|cards\.slice|cards\.join/.test(fn), "answerHTML still draws the grid");
  assert.match(fn, /return head \+ lanes\.map\(function\(l\)\{ return laneHTML\(l\); \}\)\.join\(""\);/);
  assert.match(PAGE, /class="lane-more-card" data-lane="/);
  assert.match(PAGE, /"&lane=" \+ encodeURIComponent\(key\) \+ "&off=" \+ off/);
  assert.match(PAGE, /var more = false;/, "the page-wide pager is still on");
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(PAGE), "an emoji");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

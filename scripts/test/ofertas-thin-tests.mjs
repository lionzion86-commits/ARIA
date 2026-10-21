/* ==================================================================
   OFERTAS.HTML IS THIN, AND ITS SLICES ARE TRUE (#409, Mountain Test).

   ofertas.html used to download ofertas-feed-lite.json and draw every
   deal it held (~750 cards) at once. It now paints 48 cards from a
   static slice (assets/ofertas/slices/), asks
   /.netlify/functions/ofertas for "Mostrar más" and searches, and
   loads a photo only when its card is about to be seen. These checks
   hold that in place:

   - the committed slices and deals.json match ofertas-feed.json (a
     stale build would sell what is gone: rebuild with
     node scripts/build-ofertas-slices.mjs);
   - every slice is page 1 of its store and sort, at most 48 cards,
     card fields only, small;
   - the function continues page 1 in the same order, filters by store
     and search, and never repeats a card across a page boundary;
   - the page fetches no feed or catalogue, parks photos for the
     IntersectionObserver, holds the card's shape, leads with soles,
     keeps yellow for sale badges and links only into producto.html.

   RUNNING IT
     node scripts/test/ofertas-thin-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import vm from "node:vm";
import { build } from "../build-ofertas-slices.mjs";
import { PAGE_SIZE, SORTS, FIELDS, unpackCard, selectDeals, pageOf, loadDeals } from "../../netlify/functions/_ofertas-core.js";
import { handler } from "../../netlify/functions/ofertas.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const SLICES = ROOT + "assets/ofertas/slices/";
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}
const call = async (qs, method = "GET") => {
  const r = await handler({ httpMethod: method, queryStringParameters: qs });
  return { status: r.statusCode, headers: r.headers, body: JSON.parse(r.body || "{}") };
};

const fresh = build(ROOT);
const committed = JSON.parse(readFileSync(ROOT + "assets/ofertas/deals.json", "utf8"));
const html = readFileSync(ROOT + "ofertas.html", "utf8");
const script = html.slice(html.lastIndexOf("<script>") + 8, html.indexOf("</script>", html.lastIndexOf("<script>")));
const noComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "");

console.log("\n  ofertas.html, thin\n");

await check("deals.json is current with ofertas-feed.json (else: node scripts/build-ofertas-slices.mjs)", () => {
  assert.equal(committed.generatedAt, fresh.generatedAt, "built from another feed");
  assert.equal(committed.items.length, fresh.cards.length, "deal count differs");
  const ids = new Set(committed.items.map((a) => a[0]));
  const missing = fresh.cards.filter((c) => !ids.has(c.id));
  assert.equal(missing.length, 0, `${missing.length} deals missing, e.g. ${missing.slice(0, 2).map((c) => c.title).join(" | ")}`);
  assert.deepEqual(committed.stores, fresh.stores, "store list differs");
});

await check("the deals are the page's own: the one sale rule, the $150 cap for the mix, a real photo, no duplicates", () => {
  const seen = new Set();
  for (const c of fresh.cards) {
    assert.ok(c.pct >= 5 && c.pct <= 70, `${c.title}: ${c.pct}%`);
    assert.ok(c.usd > 0 && c.wasUsd > c.usd, `${c.title}: ${c.usd} / ${c.wasUsd}`);
    assert.equal(c.m, c.usd <= 150 ? 1 : 0, `${c.title}: US$ ${c.usd} mix flag ${c.m}`);
    assert.match(c.image, /^https?:\/\//, `${c.title}: no photo`);
    const k = c.store + "::" + c.title;
    assert.ok(!seen.has(k), "duplicate " + k);
    seen.add(k);
  }
  assert.ok(fresh.cards.length > 1000, "suspiciously few deals: " + fresh.cards.length);
});

await check("a slice for every store and sort, each one page 1 of 48 card-only items, under 12KB gzipped", () => {
  const files = readdirSync(SLICES);
  const scopes = ["all", ...fresh.stores.map((s) => s.key)];
  assert.equal(files.length, scopes.length * SORTS.length, "slice count");
  const allowed = new Set(FIELDS);
  for (const scope of scopes) for (const sort of SORTS) {
    const f = `${scope}.${sort}.json`;
    const raw = readFileSync(SLICES + f);
    const j = JSON.parse(raw);
    assert.ok(gzipSync(raw).length < 12 * 1024, `${f}: ${gzipSync(raw).length} bytes gzipped`);
    assert.ok(j.items.length <= PAGE_SIZE && j.items.length > 0, `${f}: ${j.items.length} items`);
    for (const it of j.items) for (const k of Object.keys(it)) assert.ok(allowed.has(k), `${f}: field ${k}`);
    const want = pageOf(selectDeals(fresh.cards, { store: scope === "all" ? "" : scope, sort }), 1);
    assert.deepEqual(j.items.map((i) => i.id), want.items.map((i) => i.id), `${f}: not page 1 of ${scope}/${sort}`);
    assert.equal(j.total, want.total, `${f}: total`);
    assert.ok(Array.isArray(j.stores) && j.stores.length === fresh.stores.length, `${f}: store list`);
  }
});

await check("no sizes, descriptions or weights in anything the phone receives", () => {
  const sample = readFileSync(SLICES + "all.discount.json", "utf8");
  assert.ok(!/"sizes"|"description"|"weightKg"|"dutiableUsd"/.test(sample), "feed-only fields in a slice");
  assert.deepEqual(Object.keys(unpackCard(committed.items[0])), FIELDS);
});

await check("the function continues page 1: page 2 follows in the same order, no repeats", async () => {
  for (const [store, sort] of [["", "discount"], ["walmart", "priceAsc"], ["ccs", "priceDesc"]]) {
    const p1 = JSON.parse(readFileSync(SLICES + `${store || "all"}.${sort}.json`, "utf8"));
    const p2 = (await call({ store, sort, page: "2" })).body;
    assert.equal(p2.page, 2);
    assert.ok(p2.items.length > 0 && p2.items.length <= PAGE_SIZE, `${store}/${sort}: ${p2.items.length}`);
    const ids = new Set(p1.items.map((i) => i.id));
    assert.ok(!p2.items.some((i) => ids.has(i.id)), `${store}/${sort}: page 2 repeats page 1`);
    const last = p1.items[p1.items.length - 1], first = p2.items[0];
    if (sort === "discount") assert.ok(last.pct >= first.pct, `${store}: discount order breaks at the page boundary`);
    if (sort === "priceAsc") assert.ok(last.usd <= first.usd, `${store}: price order breaks`);
    if (sort === "priceDesc") assert.ok(last.usd >= first.usd, `${store}: price order breaks`);
    if (store) assert.ok(p2.items.every((i) => i.store === store), `${store}: another store leaked in`);
  }
});

await check("the function's search matches every word, accent-blind, within the chosen store", async () => {
  /* Walmart: Target is off sale (#443). */
  const r = (await call({ q: "Lego", store: "walmart" })).body;
  assert.ok(r.total > 0, "lego at walmart: nothing");
  assert.ok(r.items.every((i) => /lego/i.test(i.title + " " + i.brand) && i.store === "walmart"));
  const two = (await call({ q: "nike shorts" })).body;
  assert.ok(two.items.every((i) => /nike/i.test(i.title + i.brand) && /shorts/i.test(i.title + i.brand)), "a word was ignored");
  const none = (await call({ q: "zzqqxxnothing" })).body;
  assert.equal(none.total, 0);
  assert.deepEqual(none.items, []);
});

await check("the function answers 48 at most, clamps pages, ignores unknown stores, refuses writes", async () => {
  const big = await call({ page: "99999" });
  assert.equal(big.status, 200);
  assert.equal(big.body.page, big.body.pages);
  const odd = await call({ store: "../../etc", sort: "evil" });
  assert.equal(odd.body.store, "");
  assert.equal(odd.body.sort, "discount");
  assert.ok(odd.body.items.length === PAGE_SIZE);
  assert.ok(JSON.stringify(odd.body).length < 40 * 1024, "a page is over 40KB");
  assert.equal((await call({}, "POST")).status, 405);
  assert.match(big.headers["Netlify-Vary"], /store\|sort\|q\|page/);
  assert.ok(loadDeals().cards.length === committed.items.length);
});

await check("the function ships deals.json (netlify.toml included_files)", () => {
  const toml = readFileSync(ROOT + "netlify.toml", "utf8");
  assert.match(toml, /\[functions\."ofertas"\]\s*\n\s*included_files = \["assets\/ofertas\/deals\.json"\]/);
});

await check("the page's script parses", () => {
  new vm.Script(script, { filename: "ofertas.html" });
});

await check("the page fetches no feed or catalogue, only slices, the function, the rate and the cache", () => {
  assert.ok(!/ofertas-feed/.test(noComments(script)), "a feed URL in code");
  assert.ok(!/-catalog\.json|department-cache|deals\.json/.test(noComments(script)), "a catalogue URL in code");
  assert.match(script, /slice:\s*BASE \+ '\/assets\/ofertas\/slices\/'/);
  assert.match(script, /fn:\s*BASE \+ '\/\.netlify\/functions\/ofertas'/);
  assert.match(script, /var BASE = '';/, "requests leave the page's own origin");
  assert.match(script, /var PAGE_SIZE = 48;/);
});

await check("photos wait for the IntersectionObserver; no native lazy loader", () => {
  assert.ok(!/loading=/.test(noComments(html)), "loading=lazy is back");
  assert.match(script, /new IntersectionObserver\(function\(entries\)\{[\s\S]*?showPhoto\(e\.target\)/);
  assert.match(script, /replace\(\/\^src=\/, 'data-src='\)/, "card photos are not parked in data-src");
  assert.match(script, /rootMargin: '200px 0px'/);
});

await check("cards hold their shape: square photo box with the old-Safari fallback, reserved rows, card placeholders", () => {
  assert.match(html, /\.card-img\{[^}]*aspect-ratio:1\/1/);
  assert.match(html, /@supports not \(aspect-ratio:1\/1\)\{\.card-img\{height:0;padding-top:100%\}\}/);
  assert.match(html, /\.card-title\{[^}]*min-height:36px/);
  assert.match(html, /\.card-prices\{[^}]*min-height:50px/);
  const sk = (html.match(/<div class="card sk"><div class="card-img"><\/div>/g) || []).length;
  assert.ok(sk >= 6, "first paint has " + sk + " card placeholders");
});

await check("soles first, struck-through soles was-price, small grey dollars, shared rate key", () => {
  assert.match(script, /<span class="price">' \+ fmtPen\(usd \* fxVenta\)/);
  assert.match(script, /'<span class="price-old">' \+ fmtPen\(was \* fxVenta\)/);
  assert.match(script, /'<div class="price-usd">' \+ fmtUsd\(usd\)/);
  assert.match(html, /\.price-old\{[^}]*text-decoration:line-through/);
  assert.match(script, /FX_CACHE_KEY = 'aria_fx_rate_v1'/);
  assert.match(script, /fx:\s*BASE \+ '\/\.netlify\/functions\/exchange-rate'/);
});

await check("yellow is for sale badges only; no emojis; no link out to a retailer", () => {
  const css = noComments(html.slice(html.indexOf("<style>") + 7, html.indexOf("</style>")));
  const yellowRules = css.split("}").filter((r) => /var\(--yellow\)|#FFC72C/i.test(r) && !/^\s*:root/.test(r));
  assert.deepEqual(yellowRules.map((r) => r.trim().split("{")[0]), [".badge"], "yellow outside the sale badge");
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html), "an emoji in the page");
  assert.match(script, /var href = 'producto\.html\?producto=' \+ encodeURIComponent\(title\)/);
  assert.ok(!/target="_blank"|window\.open/.test(script), "a link out");
});

await check("Mostrar más draws 48 more under the grid, prefetched as the button nears", () => {
  assert.match(script, /id="moreBtn" type="button">Mostrar más</);
  assert.match(script, /grid\.insertAdjacentHTML\('beforeend', cardsHTML\(data\.items \|\| \[\]\)\)/);
  assert.match(script, /rootMargin: '900px 0px'/);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }

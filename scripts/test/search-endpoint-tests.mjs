/* ==================================================================
   #409 — SEARCH ASKS THE SERVER; THE PHONE NEVER DOWNLOADS THE STORE.

   The first real customer searched "dolls" on an iPhone over mobile
   data in Peru: search.html downloaded the whole catalogue index, Safari
   reloaded the page about ten times, and the 396 cards it drew at once
   collapsed into lines and froze. These checks hold the fix in place:

   - /api/search (netlify/functions/search.js) answers ?q=&page= with
     48 ranked cards, the total, and small JSON (< 300KB a page);
   - search.html fetches nothing but that endpoint -- no catalogue, no
     index, no engine;
   - cards keep their shape before photos arrive, and titles are plain
     text ("Lizzie & Oliver", never "&#38;");
   - the battery queries answer with the right products.

   RUNNING IT
     node scripts/test/search-endpoint-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url).pathname;
process.chdir(ROOT);
const { handler } = await import("../../netlify/functions/search.js");
const { PAGE_SIZE } = await import("../../netlify/functions/_search-core.js");
const { decodeEntities } = await import("../build-search-index.mjs");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}
const fetchImpl = async () => ({ ok: true, json: async () => ({ venta: 3.75 }) });
async function ask(q, page = 1) {
  const r = await handler({ httpMethod: "GET", queryStringParameters: { q, page: String(page) } }, { fetchImpl });
  return { status: r.statusCode, headers: r.headers, bytes: Buffer.byteLength(r.body), body: JSON.parse(r.body || "{}") };
}

/* ------------------------------------------------------------------
   THE BATTERY (#409 fire order).
   ------------------------------------------------------------------ */
const BATTERY = {
  "dolls": (it) => /\bdolls?\b/i.test(it.title),
  "muñecas": (it) => /\bdolls?\b/i.test(it.title),
  "adidas samba": (it) => /adidas/i.test(it.brand + " " + it.title) && /\bsamba\b/i.test(it.title),
  "nike air force 1": (it) => /nike/i.test(it.brand + " " + it.title) && /air force 1/i.test(it.title),
};
for (const [q, right] of Object.entries(BATTERY)) {
  await check(`"${q}": 48 cards at most, small JSON, the right products first`, async () => {
    const r = await ask(q);
    assert.equal(r.status, 200);
    assert.equal(r.body.state, "results");
    assert.ok(r.body.items.length > 0 && r.body.items.length <= PAGE_SIZE, `${r.body.items.length} cards`);
    assert.ok(r.bytes < 300 * 1024, `${r.bytes} bytes`);
    const top = r.body.items.slice(0, 8);
    const wrong = top.filter((it) => !right(it));
    assert.equal(wrong.length, 0, "not what was asked: " + wrong.map((w) => `${w.brand} ${w.title}`).join(" | "));
    for (const it of r.body.items) {
      assert.ok(it.image && it.title && it.usd > 0 && it.pen > 0 && it.id, `incomplete card ${JSON.stringify(it)}`);
      assert.ok(!/&#\d+;|&#x[0-9a-f]+;|&amp;|&quot;/i.test(it.title + it.brand), `undecoded entity: ${it.title}`);
    }
  });
}

await check('"nike air force 1" is never a one-product brand called Force', async () => {
  const r = await ask("nike air force 1");
  assert.ok(r.body.total >= 10, `${r.body.total} results`);
  assert.ok(!r.body.items.some((it) => /force factor/i.test(it.title)), "the Costco hair supplement is back");
});

await check("Foot Locker's products are searchable (its feed names them productName)", async () => {
  const r = await ask("adidas samba");
  assert.ok(r.body.items.some((it) => it.store === "footlocker"), "no Foot Locker Samba");
});

await check('"dolls" pages: the next 48, no repeats, an honest total', async () => {
  const p1 = await ask("dolls", 1), p2 = await ask("dolls", 2);
  assert.equal(p1.body.items.length, PAGE_SIZE);
  assert.equal(p2.body.page, 2);
  const ids = new Set(p1.body.items.map((i) => i.id));
  assert.ok(p2.body.items.length > 0 && p2.body.items.every((i) => !ids.has(i.id)), "page 2 repeats page 1");
  assert.ok(p1.body.total > 500, `total ${p1.body.total}: the old 500 cap is back`);
  assert.equal(p1.body.pages, Math.ceil(p1.body.total / PAGE_SIZE));
});

/* ------------------------------------------------------------------
   #416 FAST PIECES: brand + model never lose to a look-alike brand, and
   near-misses get a "¿Quisiste decir?" chip.
   ------------------------------------------------------------------ */
await check("brand + model queries answer with that model", async () => {
  const want = {
    "nike air max 90": /air max 90/i,          // was: Hairmax laser caps
    "air jordan 1": /air jordan 1/i,           // was: AIRE x Von Dutch sunglasses
    "lego star wars": /^lego star wars/i,      // was: Star Wars baby clothes
    "nike air force 1": /air force 1/i,        // was: a Costco hair supplement
    "nike dunk low": /dunk low/i,
    "adidas gazelle": /gazelle/i,
    "converse chuck taylor": /chuck taylor/i,
  };
  for (const [q, rx] of Object.entries(want)) {
    const r = await ask(q);
    const top = r.body.items.slice(0, 4);
    assert.ok(top.length && top.every((i) => rx.test(i.title)), `"${q}": ${top.map((i) => i.title).join(" | ")}`);
  }
});

await check('near-misses get a chip; real words and brands do not', async () => {
  for (const [q, want] of [["shor", "shorts"], ["shore", "shorts"], ["nkie", "nike"], ["sneakrs", "sneakers"], ["hoddie", "hoodie"]]) {
    const r = await ask(q);
    assert.equal(r.body.didYouMean, want, `"${q}" offered ${r.body.didYouMean}`);
    assert.ok(r.body.items.length > 0, `"${q}" dropped its results`);
  }
  for (const q of ["gazelle", "samba", "levis 501", "lizzie", "dolls", "shorts", "nike air force 1"]) {
    assert.equal((await ask(q)).body.didYouMean, null, `"${q}" got a chip it should not`);
  }
  assert.equal((await ask("dreses")).body.shown, "dresses", '"dreses" must read as dresses, not aretes (earrings)');
  const page = readFileSync(ROOT + "search.html", "utf8");
  assert.match(page, /if \(data\.didYouMean && !data\.shown\)/, "search.html does not draw the chip");
  assert.match(page, /b\.addEventListener\("click", function\(\)\{ searchFor\(data\.didYouMean\); \}\);/, "the chip does not re-run the search");
});

await check("Lizzie & Oliver, not Lizzie &#38; Oliver", async () => {
  const r = await ask("our generation lizzie oliver");
  const hit = r.body.items.find((i) => /lizzie/i.test(i.title));
  assert.ok(hit, "the Our Generation set is not found");
  assert.match(hit.title, /Lizzie & Oliver/);
  assert.equal(decodeEntities("18&#34; Dolls"), '18" Dolls');
  assert.equal(decodeEntities("Li&#39;l Woodzeez &amp;amp; Co"), "Li'l Woodzeez & Co");
  assert.equal(decodeEntities("AT&T 5&x;"), "AT&T 5&x;");
});

await check("no catalogue row carries an HTML entity", async () => {
  const index = JSON.parse(readFileSync(ROOT + "assets/search/catalog-index.json", "utf8"));
  const at = Object.fromEntries(index.fields.map((f, i) => [f, i]));
  const bad = index.rows.filter((r) => /&#\d+;|&#x[0-9a-f]+;|&amp;|&quot;|&#39;/i.test(r[at.title] + " " + r[at.brand]));
  assert.equal(bad.length, 0, `${bad.length} rows, e.g. ${bad.slice(0, 3).map((r) => r[at.title]).join(" | ")}`);
  assert.equal(new Set(index.rows.map((r) => r[at.id])).size, index.rows.length, "two products share an id");
});

await check("empty, short, gibberish and a brand we do not sell answer cleanly", async () => {
  assert.equal((await ask("")).body.state, "empty");
  assert.equal((await ask("a")).body.state, "short");
  const g = await ask("xqzvwk");
  assert.equal(g.body.state, "none");
  assert.equal(g.body.items.length, 0);
  assert.equal((await ask("H&M")).body.missingBrand, "h&m");
});

await check("answers are edge-cached per (q, page); the warm ping is not", async () => {
  const r = await ask("dolls");
  assert.match(r.headers["Netlify-CDN-Cache-Control"], /durable/);
  assert.equal(r.headers["Netlify-Vary"], "query=q|page");
  const w = await handler({ httpMethod: "GET", queryStringParameters: { warm: "1" } }, { fetchImpl });
  assert.equal(w.statusCode, 204);
  assert.equal(w.headers["Cache-Control"], "no-store");
  const post = await handler({ httpMethod: "POST", queryStringParameters: { q: "x" } }, { fetchImpl });
  assert.equal(post.statusCode, 405);
});

/* ------------------------------------------------------------------
   THE PAGE.
   ------------------------------------------------------------------ */
const page = readFileSync(ROOT + "search.html", "utf8");
await check("search.html downloads no catalogue, index or engine", () => {
  const fetched = [...page.matchAll(/["'](\/?[\w./-]+\.(?:json|js))["']/g)].map((m) => m[1]);
  /* ref.js and Aria's orb launcher (#386, deferred, no data) are the only scripts. */
  const heavy = fetched.filter((u) => !/^\/?(ref|assets\/js\/aria-launcher)\.js$/.test(u));
  assert.deepEqual(heavy, [], "the page still references " + heavy.join(", "));
  assert.match(page, /var SEARCH_API = "\/\.netlify\/functions\/search";/);
  assert.match(page, /var PAGE_SIZE = 48;/);
  assert.match(page, /fetchPage\(STATE\.q, STATE\.page \+ 1\)/, "Mostrar más does not fetch the next slice");
});

await check("a card holds its shape before its photo or words arrive", () => {
  assert.match(page, /\.card \.img\{[^}]*aspect-ratio:1\/1/, "the photo box is not square");
  assert.match(page, /@supports not \(aspect-ratio:1\/1\)\{ \.card \.img\{height:0; padding-top:100%;\} \}/, "no square for Safari before 15");
  assert.match(page, /\.card \.img img\{position:absolute;/, "the photo is not laid over the reserved box");
  assert.match(page, /\.card \.name\{[^}]*min-height:35px/, "the title lines are not reserved");
  assert.match(page, /\.card \.price\{[^}]*min-height:/, "the price row is not reserved");
  assert.match(page, /function renderSkeleton\(\)/, "no placeholder cards while the answer is on its way");
  assert.match(page, /width="560" height="560"/, "the img has no intrinsic size");
});

await check("search.html decodes titles before it escapes them", () => {
  assert.match(page, /var title = decodeEntities\(p\.title\), brand = decodeEntities\(p\.brand\);/);
  assert.match(page, /esc\(title\)/);
});

await check("ref.js no longer blocks the first paint of search.html", () => {
  assert.match(page, /<script src="\/ref\.js" defer><\/script>/);
});

await check("the home page's skeleton shimmer stops (it repainted off-screen rails forever)", () => {
  const home = readFileSync(ROOT + "index.html", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...home.matchAll(/\.(ariaSkeleton|ariaShimmer)\s*\{([^}]*)\}/g)].filter((m) => /animation\s*:/.test(m[2]));
  assert.ok(rules.length >= 2, "the shimmer rules moved");
  for (const m of rules) assert.ok(!/infinite/.test(m[2]), `.${m[1]} animates forever again`);
});

/* ------------------------------------------------------------------
   THE BUNDLE.
   ------------------------------------------------------------------ */
await check("the function ships with its files, and only it does", () => {
  const toml = readFileSync(ROOT + "netlify.toml", "utf8");
  const block = /\[functions\."search"\]\s*\n\s*included_files = \[([^\]]*)\]/.exec(toml);
  assert.ok(block, "no [functions.\"search\"] block");
  for (const f of ["assets/search/catalog-index.json", "assets/search/synonyms-es.json", "search-engine.js", "search-pipeline.js"]) {
    assert.ok(block[1].includes(`"${f}"`), `${f} is not shipped with the function`);
  }
  assert.ok(!/^\[functions\]\s*\n\s*included_files/m.test(toml), "included_files went global again (every function would carry the index)");
  for (const f of ["netlify/functions/search.js", "netlify/functions/_search-core.js"]) {
    const src = readFileSync(ROOT + f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(!/import\.meta/.test(src), `${f} uses import.meta (Netlify compiles functions to CommonJS)`);
  }
});

const MIN_CHECKS = 19;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }

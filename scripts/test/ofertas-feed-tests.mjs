/* ==================================================================
   THE OFERTAS DEPARTMENT COUNTS WHAT EACH STORE COUNTS (2026-10-13,
   issue #386).

   ofertas.html showed a stale 33-offer set (only Foot Locker, Old Navy
   and Walmart) while Target's own page showed 4,245 markdowns: the feed
   was hand-built, skipped the scraped stores, and the page also merged
   a live scrape and read production's feed from every preview.

   Now ofertas-feed.json is built by scripts/build-ofertas-feed.mjs from
   each store's own item set (tienda.html's files and dedupe) with
   index.html's sale rule. These checks recount it from the committed
   catalogues, so a stale feed -- or a sale rule that changed without a
   rebuild -- fails here.

   RUNNING IT
     node scripts/test/ofertas-feed-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { liftDeclarations, pageHtml } from "../lib/page-lift.mjs";
import { ofertasDeptTotal } from "../lib/ofertas-dept-total.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

const feed = JSON.parse(readFileSync(ROOT + "ofertas-feed.json", "utf8"));
const lite = JSON.parse(readFileSync(ROOT + "ofertas-feed-lite.json", "utf8"));
const T = liftDeclarations(readFileSync(ROOT + "tienda.html", "utf8"), ["STORES", "realImage"]);
const P = liftDeclarations(pageHtml(ROOT),
  ["MIN_DISCOUNT_PCT", "rawItemOnSale", "OFERTAS_MAX_DISCOUNT_PCT", "SALE_ORIGINAL_FIELDS", "saleNumber", "salePriceOf", "saleOriginalPrice", "saleDiscountPct", "isOnSaleItem"],
  { optional: ["OFERTAS_MAX_DISCOUNT_PCT", "SALE_ORIGINAL_FIELDS", "saleNumber", "salePriceOf", "saleOriginalPrice", "saleDiscountPct", "isOnSaleItem"] });

/* Each store's sales the way its page assembles them (the builder's step 1). */
const files = new Map();
const read = (f) => { if (!files.has(f)) { try { files.set(f, JSON.parse(readFileSync(ROOT + f.replace(/^\//, ""), "utf8"))); } catch { files.set(f, null); } } return files.get(f); };
function storeSales(storeKey) {
  const seen = {}; let n = 0;
  for (const f of T.STORES[storeKey].files || []) {
    const b = read(f)?.retailers?.[storeKey];
    for (const entry of Object.values(b?.departments || {})) for (const raw of (Array.isArray(entry) ? entry : entry?.items) || []) {
      const name = raw && (raw.name || raw.title || raw.productName);
      if (!name || !(Number(raw.price) > 0)) continue;
      const img = T.realImage(raw);
      if (!img || seen[name + "||" + img]) continue;
      seen[name + "||" + img] = 1;
      if (P.rawItemOnSale(raw)) n++;
    }
  }
  return n;
}

check("the feed holds every store's catalogue markdowns, not the four scraped stores alone", () => {
  for (const s of ["target", "walmart", "ccs", "ssense", "footlocker", "kohls", "macys"])
    assert.ok((feed.counts[s] || 0) > 0, `${s} has no rows in the feed`);
  assert.ok(feed.items.length > 20000, `only ${feed.items.length} rows`);
});

check("per store, the feed counts exactly what the store's page and sale rule count (Target, CCS, New Balance, ...)", () => {
  const off = [];
  for (const s of Object.keys(T.STORES)) {
    const want = storeSales(s), got = feed.counts[s] || 0;
    /* normalizeLiveItem may still refuse a row (an absurd price); never more than a handful. */
    if (got > want || want - got > Math.max(3, want * 0.01)) off.push(`${s}: feed ${got}, store ${want}`);
  }
  assert.deepEqual(off, [], "stale feed — run: node scripts/build-ofertas-feed.mjs\n         " + off.join("; "));
  assert.equal(feed.counts.newbalance || 0, storeSales("newbalance"), "New Balance");
});

check("every row is a real markdown with a visible discount", () => {
  for (const it of feed.items) {
    assert.ok(it.originalPrice > it.price && it.price > 0, `${it.retailer} "${it.title}" has no was-price`);
    assert.ok(!("description" in it), "rows carry descriptions again (feed weight)");
  }
});

check("the lite head is every store, not the first four", () => {
  const stores = new Set(lite.items.map((i) => i.retailer));
  assert.ok(stores.size >= 30, `the lite head holds ${stores.size} stores`);
  assert.equal(lite.generatedAt, feed.generatedAt, "lite and full feeds were built apart");
});

check("ofertas.html reads this site's feed, all of it, and nothing else", () => {
  const page = readFileSync(ROOT + "ofertas.html", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/https:\/\/ariashop\.pe/.test(page.replace(/<link[^>]*>|<meta[^>]*>/g, "")), "ofertas.html still points a preview at production");
  assert.ok(!/sales-cache/.test(page), "ofertas.html still merges the live scrape over the catalogue feed");
  assert.match(page, /ofertas-feed\.json/);
});

check("the homepage's 'Ver todo N ofertas' is the department page's own all-stores count", () => {
  const n = ofertasDeptTotal(feed.items, ROOT);
  assert.ok(n > 10000, "the department page would list only " + n);
  assert.equal(feed.deptTotal, n, "ofertas-feed.json's deptTotal is stale -- run: node scripts/build-ofertas-feed.mjs");
  assert.equal(lite.deptTotal, n, "the lite head (what the homepage reads) carries another total");
  const bundle = pageHtml(ROOT);
  assert.match(bundle, /\$\{\(ofertasDeptTotal \|\| saleItemsCache\.length\)\.toLocaleString\('es-PE'\)\} ofertas/, "the homepage counts its own cache again");
});

const MIN_CHECKS = 6;
if (passed + failures.length < MIN_CHECKS) { console.log(`\n  SUITE INCOMPLETE`); process.exit(1); }
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }

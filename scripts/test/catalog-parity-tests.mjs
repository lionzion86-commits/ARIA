#!/usr/bin/env node
/* ==================================================================
   ONE CATALOGUE, ONE COUNT (#443 c.6585655315 P5).

   Old Navy's storefront showed 94 products and gave search 0 (its rows
   say effectivePrice, not price, and have no link: search read no
   price, then would have kept one row per title). Foot Locker's
   storefront showed 144 products in 2 rails while search carried 503
   (the storefront read only its department buckets, not its nine brand
   buckets). Gap and Banana Republic's own catalogues were in no index.
   Victoria's Secret's colourways share one link: 1,643 on the
   storefront, 1,308 in search, 1,107 on brand pages.

   Now the storefront, the search index and the brand pages read the
   same files, the same buckets and the same identity rule
   (scripts/lib/product-identity.js).

     node scripts/test/catalog-parity-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG_FILES as SEARCH_FILES, INDEX_PATH } from "../build-search-index.mjs";
import { CATALOG_FILES as BRAND_FILES } from "../build-brand-index.mjs";
import { storeDoors } from "../build-store-doors.mjs";
import { imageKey, productKey } from "../lib/product-identity.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8");
let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log("  ok   " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + String(e.message).split("\n").slice(0, 4).join("\n       ")); }
}
const registry = JSON.parse(/\nvar STORES = (\{.*\});\r?\n/.exec(read("tienda.html"))[1]);
const idx = JSON.parse(read(INDEX_PATH));
const F = Object.fromEntries(idx.fields.map((f, i) => [f, i]));
const searchN = {}, feedN = {};
for (const r of idx.rows) { const k = r[F.retailer]; if (r[F.finalPrice]) feedN[k] = (feedN[k] || 0) + 1; else searchN[k] = (searchN[k] || 0) + 1; }
const brandN = {};
for (const r of JSON.parse(read("assets/sections/marca/_fn/items.json")).rows) brandN[r[2]] = (brandN[r[2]] || 0) + 1;
const front = (k) => JSON.parse(read(`assets/tienda/${k}/index.json`));

await check("every file a storefront reads is in the search index; the brand pages read the search index's list", () => {
  const files = new Set(SEARCH_FILES);
  const missing = [];
  for (const [k, s] of Object.entries(registry)) for (const f of s.files || []) if (!files.has(f.replace(/^\//, ""))) missing.push(`${k}: ${f}`);
  assert.deepEqual(missing, []);
  assert.deepEqual(BRAND_FILES.map((f) => f.replace(/^\//, "")), SEARCH_FILES);
});

await check("Old Navy and Foot Locker: storefront = search = brand pages (94 and 503)", () => {
  for (const [k, n] of [["oldnavy", 94], ["footlocker", 503]]) {
    const f = front(k);
    assert.equal(f.count, n, `${k} storefront ${f.count}`);
    assert.equal(searchN[k] || 0, n, `${k} search ${searchN[k] || 0}`);
    assert.equal(brandN[k] || 0, n, `${k} brand pages ${brandN[k] || 0}`);
  }
  assert.ok(front("footlocker").rails.length >= 3, "Foot Locker still has 2 rails");
});

await check("the search index and the brand pages hold the same products, store by store", () => {
  const bad = [];
  for (const k of new Set([...Object.keys(searchN), ...Object.keys(brandN)])) if ((searchN[k] || 0) !== (brandN[k] || 0)) bad.push(`${k}: search ${searchN[k] || 0}, brand ${brandN[k] || 0}`);
  assert.deepEqual(bad, []);
});

await check("every live storefront contributes to search and to the brand pages, within the colourway rule's margin", () => {
  const bad = [];
  for (const k of storeDoors(ROOT).keys) {
    const n = front(k).count, s = searchN[k] || 0, b = brandN[k] || 0;
    if (!s || !b) { bad.push(`${k}: storefront ${n}, search ${s}, brand ${b}`); continue; }
    /* The generic storefront also merges colourways sold under one link
       at one price (its audit key); search keeps each photo. */
    if (Math.abs(n - s) > Math.max(10, 0.25 * n)) bad.push(`${k}: storefront ${n}, search ${s}`);
  }
  assert.deepEqual(bad, []);
});

await check("one photo at two sizes is one product; a colourway (its own photo) is its own", () => {
  assert.equal(imageKey("https://media.kohlsimg.com/is/image/kohls/7135582_Light_Blue?wid=180&hei=180&op_sharpen=1"), imageKey("https://media.kohlsimg.com/is/image/kohls/7135582_Light_Blue?wid=342&hei=342&op_sharpen=1"));
  assert.notEqual(imageKey("https://x.test/img?id=1&wid=10"), imageKey("https://x.test/img?id=2&wid=10"), "a query that names the picture is kept");
  assert.notEqual(productKey("vs", "https://vs.test/p/1", "Bra", "a.jpg"), productKey("vs", "https://vs.test/p/1", "Bra", "b.jpg"));
  assert.notEqual(productKey("oldnavy", "", "Crew-Neck T-Shirt", "a.png"), productKey("oldnavy", "", "Crew-Neck T-Shirt", "b.png"));
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

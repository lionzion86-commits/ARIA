/* ==================================================================
   THE UNIVERSAL SEARCH PATTERN (Danny's format plan, #443 c.6504037778
   §1): every query opens with an Ofertas carousel across stores, then
   one carousel per store carrying the item; a store row's «Ver más»
   opens that store's own results as brand carousels (Walmart jeans:
   Chaps, U.S. Polo Assn. ...). "lingerie" and «lencería» return the same
   set.

     node scripts/test/search-format-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handler } from "../../netlify/functions/search.js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const fetchImpl = async () => ({ ok: true, json: async () => ({ venta: 3.75 }) });
const ask = async (q, tienda) => JSON.parse((await handler({ httpMethod: "GET", queryStringParameters: { q, page: "1", ...(tienda ? { tienda } : {}) } }, { fetchImpl })).body);

await check("a query opens with Ofertas, then one row per store, each ending on its store's results", async () => {
  const b = await ask("jeans");
  assert.equal(b.lanes[0].key, "ofertas");
  const stores = b.lanes.filter((l) => l.kind === "store");
  assert.ok(stores.length >= 4, `${stores.length} store rows`);
  for (const l of stores) {
    assert.ok(l.items.every((c) => c.store === l.store), `${l.title}: a card from another store`);
    assert.equal(l.more, "search.html?q=jeans&tienda=" + l.store);
    assert.ok(l.n >= l.items.length);
  }
  assert.ok(stores.some((l) => l.store === "walmart"), stores.map((l) => l.store).join(", "));
});

await check("«Ver más» opens the store's own results as brand carousels (Walmart jeans: Chaps, U.S. Polo Assn.)", async () => {
  const b = await ask("jeans", "walmart");
  assert.equal(b.store, "walmart");
  assert.ok(b.items.every((c) => c.store === "walmart"), "the grid is Walmart's");
  const brands = b.lanes.map((l) => l.title);
  assert.ok(b.lanes.every((l) => l.kind === "brand"), b.lanes.map((l) => l.kind).join(","));
  for (const want of ["Chaps", "U.S. Polo Assn.", "Wrangler"]) assert.ok(brands.includes(want), `${want} not in: ${brands.join(", ")}`);
  for (const l of b.lanes) assert.ok(l.items.length <= 12, `${l.title}: ${l.items.length}`);
});

await check("a single-house store still splits honestly, never one endless wall", async () => {
  const b = await ask("lencería", "victoriassecret");
  assert.ok(b.lanes.length >= 2, b.lanes.map((l) => l.title).join(", "));
  for (const l of b.lanes) assert.ok(l.items.length <= 12);
});

await check('ES/EN parity: "lingerie" and «lencería» return the same set', async () => {
  const [en, es] = [await ask("lingerie"), await ask("lencería")];
  assert.equal(en.total, es.total, `lingerie ${en.total} vs lencería ${es.total}`);
  const a = new Set(en.items.map((c) => c.id)), shared = es.items.filter((c) => a.has(c.id)).length;
  assert.ok(shared >= es.items.length * 0.8, `${shared} of ${es.items.length} first-page results shared`);
});

await check("the page draws the «Ver más» door and the store's own heading", () => {
  const html = readFileSync(ROOT + "search.html", "utf8");
  assert.match(html, /class="lane-more" href="/);
  assert.match(html, /"&tienda=" \+ encodeURIComponent\(STORE_SCOPE\)/);
  assert.match(html, /store-head/);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

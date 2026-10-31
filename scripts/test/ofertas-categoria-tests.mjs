/* ==================================================================
   OFERTAS: [Por tienda] [Por categoría] (#443 c.6544455377, form
   c.6544469782).

     - the two pills sit side by side directly under the search bar,
       Por tienda pressed by default (the view shoppers already get);
     - Por categoría swaps the store rails for category rails and shows
       the category pills: Todas, then each category with real offer
       volume, Danny's six first;
     - every deal carries its category (or none); a category's slice
       and the function's ?cat= hold only that category, every store.

     node scripts/test/ofertas-categoria-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { offerCategory, OFFER_CATEGORIES, DANNY_ORDER, MIN_CAT, garmentAudience } from "../lib/offer-category.js";
import { FIELDS, unpackCard } from "../../netlify/functions/_ofertas-core.js";
import { handler } from "../../netlify/functions/ofertas.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const read = (f) => readFileSync(ROOT + f, "utf8");
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const deals = JSON.parse(read("assets/ofertas/deals.json"));
const cards = deals.items.map(unpackCard);
const rails = JSON.parse(read("assets/ofertas/rails.json"));
const KEYS = new Set(OFFER_CATEGORIES.map(([k]) => k));

await check("the rule: what it is, then who it is for", () => {
  const c = (title, family, extra = {}) => offerCategory({ title, retailer: "x", ...extra }, family, {});
  assert.equal(c("Men's Poly T-Shirt", "ropa"), "ropa_hombre");
  assert.equal(c("Women's Twist Back Tank Top", "ropa"), "ropa_mujer");
  assert.equal(c("Big Kids' Jordan Dri-FIT Diamond Mesh Basketball Shorts", "ropa"), "ropa_ninos");
  assert.equal(c("Toddler Girls Solid Flare Leggings, Sizes 18M-5T", "ropa"), "ropa_ninos");
  /* A band's girls are not children. */
  assert.notEqual(c("The Golden Girls Stay Golden T-Shirt", "ropa"), "ropa_ninos");
  assert.equal(c("Nike Pegasus 41 Running Shoes", "zapatos"), "zapatillas");
  assert.equal(c("Puma Ultra 5 Ultimate Firm Ground Soccer Cleats", "zapatos"), "zapatos");
  assert.equal(c("10-ft HDMI Cable - Black", "electronica"), "electronica");
  assert.equal(c("Zodiac Tennis Bracelet - Libra", "joyas"), "accesorios");
  assert.equal(c("Unnamed Garment", "ropa"), "", "a garment that says nobody is in no gendered category");
  /* A one-audience store answers for its silent garments. */
  assert.equal(garmentAudience({ title: "The Bestie", retailer: "lanebryant" }, { lanebryant: "women" }), "women");
});

await check("every deal carries a known category or none; the categories offered have real volume", () => {
  const at = FIELDS.indexOf("k");
  assert.ok(at > 0);
  for (const c of cards) assert.ok(c.k === "" || KEYS.has(c.k), c.k);
  const n = {};
  for (const c of cards) if (c.k) n[c.k] = (n[c.k] || 0) + 1;
  assert.deepEqual(deals.cats, rails.cats);
  for (const c of rails.cats) { assert.equal(c.n, n[c.key], c.key); assert.ok(c.n >= MIN_CAT, c.key); }
  for (const [k, v] of Object.entries(n)) if (v >= MIN_CAT) assert.ok(rails.cats.some((c) => c.key === k), "missing pill " + k);
});

await check("Danny's six first, in his order; then the rest by size", () => {
  const six = OFFER_CATEGORIES.slice(0, DANNY_ORDER).map(([k]) => k);
  assert.deepEqual(six, ["ropa_hombre", "ropa_mujer", "ropa_ninos", "juguetes", "zapatillas", "electronica"]);
  const keys = rails.cats.map((c) => c.key);
  assert.deepEqual(keys.slice(0, 6), six, keys.join(","));
  const rest = rails.cats.slice(6);
  for (let i = 1; i < rest.length; i++) assert.ok(rest[i - 1].n >= rest[i].n);
  assert.equal(rails.cats.find((c) => c.key === "ropa_hombre").label, "Ropa Hombre");
  assert.equal(rails.cats.find((c) => c.key === "electronica").label, "Electrónica");
});

await check("a category's slice and the function's ?cat= hold only that category, from every store", async () => {
  for (const c of rails.cats) {
    const f = `assets/ofertas/slices/cat-${c.key}.discount.json`;
    assert.ok(existsSync(ROOT + f), f);
    const s = JSON.parse(read(f));
    assert.equal(s.total, c.n);
    for (const it of s.items) assert.equal(it.k, c.key);
    for (let i = 1; i < s.items.length; i++) assert.ok(s.items[i - 1].pct >= s.items[i].pct);
  }
  const ask = async (q) => JSON.parse((await handler({ httpMethod: "GET", queryStringParameters: q })).body);
  const p2 = await ask({ cat: "electronica", page: "2" });
  assert.equal(p2.cat, "electronica");
  assert.equal(p2.total, rails.cats.find((c) => c.key === "electronica").n);
  for (const it of p2.items) assert.equal(it.k, "electronica");
  assert.ok(new Set(p2.items.map((i) => i.store)).size >= 1);
  const both = await ask({ cat: "juguetes", store: "walmart" });
  for (const it of both.items) { assert.equal(it.k, "juguetes"); assert.equal(it.store, "walmart"); }
  const bad = await ask({ cat: "<script>" });
  assert.equal(bad.cat, "", "an unknown category is ignored");
});

await check("the page: two rectangles under the search bar, Por tienda pressed; the category pills only in Por categoría", () => {
  const html = read("ofertas.html");
  const iQ = html.indexOf('id="q"'), iMode = html.indexOf('id="mode"'), iCats = html.indexOf('id="cats"'), iCount = html.indexOf('id="countLine"');
  assert.ok(iQ > 0 && iQ < iMode && iMode < iCats && iCats < iCount, "order: search, mode, cats, count");
  assert.match(html, /<button type="button" data-mode="tienda" aria-pressed="true">Por tienda<\/button>\s*<button type="button" data-mode="categoria" aria-pressed="false">Por categoría<\/button>/);
  assert.match(html, /<div class="cats" id="cats"[^>]*hidden><\/div>/);
  assert.match(html, /\.mode\{display:flex/);
  assert.match(html, /S\.mode === 'categoria' && \(ix\.cats \|\| \[\]\)\.length/, "the category rails take the store rails' place");
  assert.doesNotMatch(html, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, "no emojis");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

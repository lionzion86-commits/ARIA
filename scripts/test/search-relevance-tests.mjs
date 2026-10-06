/* ==================================================================
   SEARCH RELEVANCE — THE BRAND LAYER MUST NOT EAT PRODUCT WORDS.

   Danny, 2026-10-06: a shopper asked for "chimpunes" (soccer cleats)
   up to $500 and got Beats Solo 4, Beats Flex and Beats Studio Pro.

   The translation was right ("chimpunes" -> "soccer cleats"), the
   category intent was right (soccer), and 503 products in the live
   pool carry the word "cleats". What went wrong is one layer below
   all of that: "cleats" is Damerau-2 from the stocked brand "Beats",
   the fuzzy brand pass claimed the token, and a brand hit HARD-
   CONSTRAINS the search. Everything downstream was then correctly
   ranking headphones.

   These run against the pure slice — no DOM, no network — over a
   synthetic pool shaped like the real one.
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { searchSlice } from "../lib/mcp/page-slices.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;

const { api } = searchSlice();
const { detectBrandIntent, rankCatalogMatches, searchTokens, catalogWordsOf } = api;

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

/* ------------------------------------------------------------------
   A POOL SHAPED LIKE THE REAL ONE. The counts are what matter: the
   live pool has ~503 "cleats", 24 "beats", 39 "shin", 31 "guards".
   ------------------------------------------------------------------ */
const mk = (title, brand, retailer, price) => ({ title, name: title, brand, retailer, price });
const pool = [];
for (let i = 0; i < 300; i++)
  pool.push(mk(`adidas Copa Mundial ${i} Firm Ground Soccer Cleats`, "adidas", "dicks", 60 + i));
for (let i = 0; i < 200; i++)
  pool.push(mk(`Nike Mercurial Vapor ${i} Soccer Cleats`, "Nike", "dicks", 50 + i));
for (let i = 0; i < 24; i++)
  pool.push(mk(`Beats Solo ${i} Bluetooth Wireless Headphones`, "Beats", "target", 100 + i));
for (let i = 0; i < 39; i++)
  pool.push(mk(`Titan Pro ${i} Instep Shin Guards`, "Titan", "dicks", 20 + i));
for (let i = 0; i < 20; i++)
  pool.push(mk(`Skin Industries Rumbler ${i} Snapback Hat`, "Skin", "zumiez", 30 + i));
for (let i = 0; i < 44; i++)
  pool.push(mk(`HABA Creative Play ${i} Wooden Kids Kitchen`, "HABA", "target", 40 + i));
for (let i = 0; i < 30; i++)
  pool.push(mk(`YoungLA ${i} Oversize Gym Tee`, "YoungLA", "youngla", 25 + i));
/* "young" ON ITS OWN IS A PRODUCT WORD HERE, DELIBERATELY. Without
   these the multi-word-brand assertion below passes for the wrong
   reason: "young" would be absent from the vocabulary, so the guard
   could never fire on that window whether or not it checked the
   window length. A mutation widening the guard to multi-token
   windows then went undetected. A brand whose first word is also an
   ordinary catalogue word is the case that distinguishes them. */
for (let i = 0; i < 25; i++)
  pool.push(mk(`Under Armour Young Athletes ${i} Training Tee`, "Under Armour", "dicks", 18 + i));
for (let i = 0; i < 30; i++)
  pool.push(mk(`New Balance Furon ${i} Running Shoe`, "New Balance", "newbalance", 70 + i));
/* "nik" as pure scrape noise, the way "Nik Stain" decks are in the
   live pool: a word that exists but names nothing anyone shops for. */
for (let i = 0; i < 15; i++)
  pool.push(mk(`Hockey Middle Earth Nik Stain ${i} Skateboard Deck`, "Hockey", "ccs", 60 + i));

/* The page attaches the inverted index to the cached array; mirror it
   exactly, because the guard reads it. */
function indexPool(items) {
  for (const it of items) it._wordSet = catalogWordsOf(it);
  const windex = new Map();
  for (const it of items)
    for (const w of it._wordSet) {
      let l = windex.get(w);
      if (!l) windex.set(w, (l = []));
      l.push(it);
    }
  items._windex = windex;
  return items;
}
indexPool(pool);

const brandOf = (q, p = pool) => {
  const b = detectBrandIntent(searchTokens(q), p, { retailers: [] });
  return b ? b.label : null;
};

/* ------------------------------------------------------------------
   THE BUG
   ------------------------------------------------------------------ */
check("a word the catalogue sells is never corrected into a brand", () => {
  assert.equal(brandOf("cleats"), null,
    "\"cleats\" was read as the brand Beats — the whole search is then headphones");
  assert.equal(brandOf("soccer cleats"), null,
    "\"soccer cleats\" was read as a brand; 500 products literally carry both words");
});

check("the same mistake in its other two shapes", () => {
  /* "shin" -> "skin" is one substitution, and Skin is a stocked
     brand: canilleras returned Skin Industries t-shirts. */
  assert.equal(brandOf("shin guards"), null,
    "\"shin guards\" was read as the brand Skin");
  /* "hasta" -> "haba" — a Spanish preposition eaten by a toy brand,
     which is how "chimpunes hasta 500 dolares" returned wooden
     kitchens. */
  assert.equal(brandOf("hasta 500 dolares"), null,
    "\"hasta\" was read as the brand HABA");
});

check("end to end: the shopper gets the product, not the brand it rhymes with", () => {
  /* "shin guards" rather than "soccer cleats" ON PURPOSE. The soccer
     category is assigned by isSoccer(), which lives outside the pure
     slice (catalogItemCategory guards it with a typeof), so a cleats
     query cannot be ranked faithfully here. "shin guards" needs no
     category classifier and exercises the identical defect: one token
     a letter away from a stocked brand, which used to take the whole
     result set with it.

     The cleats case is verified end to end in a real browser against
     the real catalogues — see the commit message. */
  const res = rankCatalogMatches(pool, "shin guards", { limit: 20, retailers: [] });
  const items = res.items || [];
  assert.ok(items.length > 0, "the search found nothing at all");
  const skin = items.filter(i => /Skin Industries/i.test(i.title)).length;
  assert.equal(skin, 0, `${skin} Skin Industries products answered a search for shin guards`);
  const guards = items.filter(i => /Shin Guards/i.test(i.title)).length;
  assert.equal(guards, items.length, "something other than shin guards answered the query");
});

/* ------------------------------------------------------------------
   WHAT MUST NOT REGRESS. Every one of these is a documented case the
   brand layer exists to serve.
   ------------------------------------------------------------------ */
check("an exact brand name still hard-constrains the search", () => {
  /* The guard only skips the FUZZY pass, so a shopper who means the
     brand still gets it — including Beats itself. */
  assert.equal(brandOf("beats"), "Beats", "searching the brand Beats no longer finds it");
  assert.equal(brandOf("adidas"), "adidas", "an exact brand stopped matching");
  assert.equal(brandOf("youngla"), "YoungLA", "an exact one-word brand stopped matching");
});

check("a misspelled brand that is not a product word still resolves", () => {
  assert.equal(brandOf("newbalnce"), "New Balance", "the typo layer stopped correcting brands");
  assert.equal(brandOf("yougla"), "YoungLA", "a one-word brand typo stopped resolving");
});

check("multi-word brands are untouched by the guard", () => {
  /* The guard is single-token only: "young la" and "la young" join
     into one brand key and cannot be shadowed by one ordinary word. */
  /* "young" is an ordinary product word in this pool (Under Armour
     Young Athletes tees), so these only pass if the guard is checking
     the WINDOW LENGTH rather than merely failing to find the token. */
  assert.ok(pool._windex.get("young") && pool._windex.get("young").length >= 25,
    "the fixture no longer makes \"young\" a product word — the assertions below prove nothing");
  assert.equal(brandOf("young la"), "YoungLA", "the two-word brand stopped matching");
  assert.equal(brandOf("la young"), "YoungLA", "the reversed two-word brand stopped matching");
  /* AND ONE THAT ACTUALLY REACHES THE FUZZY PASS. The two above join
     to an exact brand key, so they are answered before the guard is
     ever consulted and prove nothing about it. "young laa" is a typo:
     it joins to "younglaa", misses exactly, and is resolved by the
     fuzzy pass — with "young" sitting in the vocabulary as a product
     word. Widening the guard to multi-token windows loses this. */
  assert.equal(brandOf("young laa"), "YoungLA",
    "a mistyped two-word brand was shadowed by its first word being an ordinary product word");
});

check("a pool with no inverted index is still guarded", () => {
  /* The index rides on the cached array. An ad-hoc pool has none, and
     failing open there would put the hijack straight back. */
  const adhoc = pool.slice(0, 560).map(i => ({ ...i, _wordSet: undefined }));
  assert.equal(adhoc._windex, undefined, "the test pool was not actually index-free");
  assert.equal(brandOf("cleats", adhoc), null,
    "without an index the brand layer ate the product word again");
  assert.equal(brandOf("beats", adhoc), "Beats", "the exact pass broke on an ad-hoc pool");
});

check("the words Peru actually uses for cleats all translate", () => {
  /* The category-intent regex already knew chimpunes AND guayos; the
     translation dictionary only knew chimpun, so "guayos" reached the
     ranker untranslated and answered with shin guards. Asserted
     against the page because the dictionary is page data. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  assert.match(page, /\n  chimpun: "soccer cleats",/,
    "chimpunes no longer translates");
  assert.match(page, /\n  guayo: "soccer cleats",/,
    "guayos no longer translates — it answers with shin guards");
  /* Both words are in the intent regex too, so the two layers agree. */
  assert.match(page, /\{ key: 'soccer', re: [^\n]*chimpunes\?[^\n]*guayos\?/,
    "the soccer category intent stopped covering both words");
});

/* A suite that shrinks has to say so — the same floor the voice suite
   carries, for the same reason. */
const MIN_CHECKS = 8;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }

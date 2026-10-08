/* ==================================================================
   THE 2026-10-08 SEARCH BRIEF — every query in it, against the real
   catalogue, the way search.html runs it.

   Danny: "If we're going to leave the search bar, it needs to be
   workable. Easier and better for the customer, not more confusing."

   This suite loads what the page loads -- the precomputed index
   (assets/search/catalog-index.json), the engine (search-engine.js),
   the pipeline (search-pipeline.js) and the dictionary
   (assets/search/synonyms-es.json) -- and calls the same
   AriaSearchPage.run() the page calls. A query passes when the top
   results are the thing asked for, not merely when something comes
   back.

   RUNNING IT
     node scripts/test/search-brief-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { buildIndex, INDEX_PATH } from "../build-search-index.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

/* ------------------------------------------------------------------
   THE PAGE IS WIRED TO WHAT THIS SUITE TESTS.
   ------------------------------------------------------------------ */
const page = readFileSync(ROOT + "search.html", "utf8");
check("search.html runs the pipeline on the index and the dictionary", () => {
  assert.match(page, /<script src="search-pipeline\.js"><\/script>/, "the pipeline is not loaded");
  assert.match(page, /var SEARCH_INDEX = "\/assets\/search\/catalog-index\.json";/, "the index is not loaded");
  assert.match(page, /var SEARCH_DICT = "\/assets\/search\/synonyms-es\.json";/, "the dictionary is not loaded");
  assert.match(page, /window\.AriaSearchPage\.run\(PIPE, query\)/, "the page does not search through the pipeline");
  assert.ok(!/Sin imagen/.test(page), "the page can still draw a \"Sin imagen\" card");
  assert.match(page, /if \(!img \|\| typeof img !== "string"\) return null;/, "the fallback path keeps imageless products");
});

const index = JSON.parse(readFileSync(ROOT + INDEX_PATH, "utf8"));
check("the index is what the catalogues give today", () => {
  const fresh = buildIndex();
  assert.equal(index.count, fresh.count,
    `the index has ${index.count} products, the catalogues give ${fresh.count} — run: node scripts/build-search-index.mjs`);
  assert.deepEqual(index.rows, fresh.rows, "the index is stale — run: node scripts/build-search-index.mjs");
});

/* ------------------------------------------------------------------
   LOADED THE WAY search.html LOADS IT (fromIndex + catalogReady).
   ------------------------------------------------------------------ */
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(readFileSync(ROOT + "search-engine.js", "utf8"), sandbox, { filename: "search-engine.js" });
vm.runInContext(readFileSync(ROOT + "search-pipeline.js", "utf8"), sandbox, { filename: "search-pipeline.js" });
const S = sandbox.window.AriaSearch;
const P = sandbox.window.AriaSearchPage;
const at = Object.fromEntries(index.fields.map((f, i) => [f, i]));
const products = index.rows.map(r => ({
  name: r[at.title], title: r[at.title], brand: r[at.brand] || "", price: r[at.price],
  originalPrice: r[at.originalPrice] || null, onSale: r[at.onSale] === 1,
  departments: r[at.department] ? [r[at.department]] : [], finalPrice: r[at.finalPrice] === 1,
  image: r[at.image], url: "", retailer: r[at.retailer] || "", _cat: r[at.cat] || null,
}));
S.buildSearchWordIndex(products);
const dict = JSON.parse(readFileSync(ROOT + "assets/search/synonyms-es.json", "utf8"));
const ctx = {
  S, products, retailers: [...new Set(products.map(p => p.retailer))].map(k => ({ key: k, label: k })),
  dict: P.prepare(dict, S, products),
};
let slowest = { q: "", ms: 0 };
function search(q) {
  const t = Date.now();
  const r = P.run(ctx, q);
  const ms = Date.now() - t;
  if (ms > slowest.ms) slowest = { q, ms };
  return r;
}
const head = (r, n = 10) => r.hits.slice(0, n);
const show = (r, n = 5) => head(r, n).map(h => h.title.slice(0, 60)).join(" | ");

check("the catalogue loaded", () => assert.ok(products.length > 100000, `only ${products.length} products`));

/* ------------------------------------------------------------------
   1. THE DICTIONARY IS DATA, AND IT COVERS THE BRIEF.
   ------------------------------------------------------------------ */
check("the dictionary has every section the brief names", () => {
  for (const s of ["footwear", "clothing", "accessories", "beauty", "toys", "modifiers", "colors", "brands", "phrases", "senses"])
    assert.ok(dict[s], `no "${s}" section`);
  for (const b of ["new balance", "tommy hilfiger", "miu miu"]) assert.ok(dict.brands.includes(b), `${b} is not a brand phrase`);
  for (const s of dict.senses) {
    for (const k of ["keep", "drop"]) if (s[k]) new RegExp(s[k], "i");
  }
});

/* ------------------------------------------------------------------
   2. PRODUCT TYPES: most of the first ten are the thing asked for.
   ------------------------------------------------------------------ */
const SHOE = /\b(?:sneakers?|shoes?|trainers?|runners?|boots?|booties?|sandals?|heels?|pumps?|loafers?|clogs?|slides?|mules?|flats?|oxfords?|slippers?|cleats?|crocs?)\b/i;
const TYPES = {
  "zapatillas": /\b(?:sneakers?|trainers?|runners?|running shoes?|shoes?)\b/i,
  "zapatos mujer": SHOE,
  "zapatos hombre": SHOE,
  "zapatos para bebés": /\b(?:baby|toddler|infant|crib|kids?|little kid)\b/i,
  "zapatitos": /\b(?:baby|toddler|infant|crib|kids?|little kid)\b/i,
  "tenis": /\b(?:sneakers?|trainers?|shoes?)\b/i,
  "botas": /\bboot(?:s|ie|ies)?\b/i,
  "sandalias": /\bsandals?\b/i,
  "tacones": /\b(?:heels?|heeled|pumps?|stilettos?)\b/i,
  "polos": /\b(?:t-?shirts?|tees?|shirts?)\b/i,
  "camisas": /\bshirts?\b/i,
  "camisetas": /\b(?:t-?shirts?|tees?|shirts?)\b/i,
  "blusas": /\b(?:blouses?|tops?|shirts?)\b/i,
  "shorts": /\bshorts?\b/i,
  "pantalones": /\b(?:pants?|jeans|trousers?|chinos?|joggers?|leggings?)\b/i,
  "jeans": /\bjeans?\b/i,
  "vestidos": /\b(?:dress|dresses|gown)\b/i,
  "faldas": /\bskirts?\b/i,
  "casacas": /\b(?:jackets?|coats?|parkas?|blazers?|bombers?)\b/i,
  "chompas": /\b(?:sweaters?|cardigans?|pullovers?|knit|jumpers?)\b/i,
  "sudaderas": /\b(?:hoodies?|sweatshirts?|hooded|pullover)\b/i,
  "gorras": /\b(?:caps?|hats?|snapback|trucker)\b/i,
  "carteras": /\b(?:handbags?|purses?|bags?|totes?|satchel|crossbody|clutch)\b/i,
  "mochilas": /\bbackpacks?\b/i,
  "relojes": /\b(?:watch|watches|wristwatch)\b/i,
  "lentes": /\b(?:sunglasses|glasses|eyewear|frames?)\b/i,
  "perfumes": /\b(?:perfume|parfum|fragrance|cologne|eau de)\b/i,
  "maquillaje": /\b(?:makeup|foundation|concealer|primer|lipstick|lip|mascara|blush|eyeshadow|brush|tint|powder|palette|liner|bronzer|highlighter|gloss)\b/i,
  "juguetes": /\b(?:toys?|play|playset|game|puzzle|doll|figure|lego|kit|set)\b/i,
  "muñecas": /\bdolls?\b/i,
  "peluches": /\b(?:plush|stuffed|squishmallow|teddy)\b/i,
};
for (const [q, re] of Object.entries(TYPES)) {
  check(`"${q}" shows ${re.source.slice(0, 40)}…`, () => {
    const r = search(q);
    assert.equal(r.state, "results", `"${q}" found nothing`);
    assert.ok(r.hits.length >= 10, `"${q}" found only ${r.hits.length}`);
    const good = head(r).filter(h => re.test(h.title)).length;
    assert.ok(good >= 8, `"${q}": only ${good} of the first 10 are right: ${show(r, 10)}`);
  });
}
/* Bicycles: the catalogue carries almost none (the brief's list assumed
   it did). What it carries is shown, and never a bike rack, a pair of
   bike shorts or a deck of Bicycle playing cards. */
check('"bicicletas" shows bicycles or nothing, never bike shorts or racks', () => {
  const r = search("bicicletas");
  for (const h of r.hits) assert.match(h.title, /\b(?:bikes?|bicycles?|tricycles?)\b/i, `not a bicycle: ${h.title}`);
  for (const h of r.hits) assert.doesNotMatch(h.title, /\b(?:shorts?|rack|cards?|charm)\b/i, `not a bicycle: ${h.title}`);
});

check("no doll, figure or toy in any footwear search", () => {
  for (const q of ["zapatillas", "zapatos mujer", "zapatos hombre", "zapatos para bebés", "zapatitos", "tenis", "botas", "sandalias", "tacones", "zapatillas nike"]) {
    /* A Toy Story sneaker is a sneaker: the head noun decides. */
    for (const h of search(q).hits) {
      if (SHOE.test([...S.catalogHeadWords(h)].pop() || "")) continue;
      assert.doesNotMatch(h.title, /\b(?:barbie|dolls?|figures?|figurines?|toys?|plush|lego)\b/i, `"${q}" showed ${h.title}`);
    }
  }
});
check("gender words lead with that gender", () => {
  const women = head(search("zapatos mujer")).filter(h => /\bwomen'?s?\b|\bwomens\b|\bladies\b/i.test(h.title)).length;
  const men = head(search("zapatos hombre")).filter(h => /\bmen'?s?\b|\bmens\b/i.test(h.title) && !/\bwomen/i.test(h.title)).length;
  assert.ok(women >= 8, `"zapatos mujer": only ${women} of 10 are women's`);
  assert.ok(men >= 8, `"zapatos hombre": only ${men} of 10 are men's`);
});

/* ------------------------------------------------------------------
   3. COMBINATIONS.
   ------------------------------------------------------------------ */
const COMBOS = {
  "zapatillas nike": h => /nike/i.test(h.brand + " " + h.title) && SHOE.test(h.title),
  "zapatillas adidas mujer": h => /adidas/i.test(h.brand + " " + h.title) && SHOE.test(h.title),
  "perfume mujer barato": h => /\b(?:perfume|parfum|fragrance|eau de|mist)\b/i.test(h.title),
  "reloj hombre": h => /\b(?:watch|watches)\b/i.test(h.title),
  "cartera cuero": h => /\bleather\b/i.test(h.title) && /\b(?:handbags?|purses?|bags?|totes?|satchel|crossbody|clutch|hobo)\b/i.test(h.title),
  "juguetes niños": h => /\b(?:toys?|play|playset|game|puzzle|kit|set)\b/i.test(h.title),
  "vestido fiesta": h => /\b(?:dress|dresses|gown)\b/i.test(h.title),
  "shorts deportivos": h => /\bshorts?\b/i.test(h.title) && /\b(?:running|training|gym|athletic|sport|workout|basketball)\b/i.test(h.title),
  "lentes de sol": h => /\bsunglass(?:es)?\b/i.test(h.title),
  "mochila escolar": h => /\bbackpacks?\b/i.test(h.title),
};
for (const [q, ok] of Object.entries(COMBOS)) {
  check(`"${q}"`, () => {
    const r = search(q);
    assert.equal(r.state, "results", `"${q}" found nothing`);
    const top = head(r);
    const good = top.filter(ok).length;
    assert.ok(good >= Math.min(8, top.length) && top.length >= 5, `"${q}": ${good} of ${top.length} right: ${show(r, 10)}`);
  });
}
check('"barato" puts the cheapest first', () => {
  const prices = Array.from(head(search("perfume mujer barato"), 20), h => h.price);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b), "not sorted by price");
});
check('"reloj hombre" leads with men\'s watches', () => {
  const men = head(search("reloj hombre")).filter(h => /\bmen'?s?\b|\bmens\b/i.test(h.title) && !/\bwomen/i.test(h.title)).length;
  assert.ok(men >= 8, `only ${men} of 10`);
});

/* ------------------------------------------------------------------
   4. TYPOS: corrected, said so, and the right products.
   ------------------------------------------------------------------ */
const TYPOS = {
  hoddie: [null, /\bhoodies?\b/i], zapatilas: ["zapatillas", SHOE], addidas: ["adidas", /adidas/i],
  nik: ["nike", /nike/i], conberse: ["converse", /converse/i], camiza: ["camisa", /\bshirts?\b/i],
  relog: ["reloj", /\b(?:watch|watches)\b/i], jugete: ["juguete", /\b(?:toys?|play|playset|game|kit|set)\b/i],
  bisicleta: ["bicicleta", /\b(?:bikes?|bicycles?)\b/i],
};
for (const [q, [fixed, re]] of Object.entries(TYPOS)) {
  check(`typo "${q}"${fixed ? ` -> "${fixed}"` : ""}`, () => {
    const r = search(q);
    assert.equal(r.state, "results", `"${q}" found nothing`);
    if (fixed) assert.equal(r.shown, fixed, `"${q}" did not say "Mostrando resultados para ${fixed}"`);
    const field = h => (/adidas|nike|converse/.test(re.source) ? h.brand + " " : "") + h.title;
    const top = head(r);
    const good = top.filter(h => re.test(field(h))).length;
    assert.ok(good >= Math.min(8, top.length), `"${q}": ${good} of ${top.length} right: ${show(r, 10)}`);
  });
}

/* ------------------------------------------------------------------
   5. WORD SENSE. Where the catalogue has none of the right sense, the
      answer is an honest "no", never the wrong sense.
   ------------------------------------------------------------------ */
check('"mouse" is a computer mouse, "mickey mouse" is Mickey', () => {
  const r = search("mouse");
  assert.ok(r.hits.length >= 1, "no computer mouse");
  for (const h of r.hits) assert.match(h.title, /\bmouse\b/i), assert.doesNotMatch(h.title, /mickey|minnie|disney/i, h.title);
  const m = search("mickey mouse");
  assert.ok(m.hits.length && m.hits.every(h => /mickey/i.test(h.title + " " + h.brand)), "mickey mouse lost Mickey");
});
check('"tablet" is a tablet (never pills, wheels or chargers)', () => {
  const r = search("tablet");
  for (const h of r.hits) assert.match(h.title, /\b(?:ipad|tablet|galaxy tab)\b/i, h.title);
  if (!r.hits.length) assert.equal(r.sense, "tablets", "an empty tablet search must say it has no tablets");
});
check('"apple" is Apple', () => {
  const r = search("apple");
  assert.ok(r.hits.length >= 10, "no Apple products");
  for (const h of r.hits) assert.match(h.brand + " " + h.title, /^apple\b|\b(?:iphone|ipad|macbook|airpods|imac|apple watch)\b/i, h.title);
  for (const h of r.hits) assert.doesNotMatch(h.title, /apple bottoms/i, h.title);
});
check('"bag" is handbags', () => {
  const r = search("bag");
  const good = head(r).filter(h => /\b(?:handbags?|purses?|crossbody|shoulder bag|totes?|satchel|clutch|hobo|bag)\b/i.test(h.title)
    && !/\b(?:makeup|cosmetic|toiletry|sleeping|trash|gift bag|lunch|diaper)\b/i.test(h.title)).length;
  assert.ok(good >= 9, `${good} of 10: ${show(r, 10)}`);
});
check('"tie" is neckties, "hair tie" is hair', () => {
  const r = search("tie");
  assert.ok(r.hits.length >= 10, "no ties");
  for (const h of head(r, 30)) assert.doesNotMatch(h.title, /\b(?:dress|blouse|top|bikini|hair|shirt)\b|tie[- ](?:dye|front|waist)/i, h.title);
  const hair = search("hair tie");
  assert.ok(hair.hits.length && head(hair).every(h => /\bhair\b|scrunch/i.test(h.title)), show(hair));
});
check('"monitor" is a computer monitor, "baby monitor" is a baby monitor', () => {
  const r = search("monitor");
  for (const h of r.hits) assert.doesNotMatch(h.title, /\bbaby\b|mount|light bar|lamp/i, h.title);
  if (!r.hits.length) assert.ok(r.sense, "an empty monitor search must say it has no monitors");
  const b = search("baby monitor");
  assert.ok(b.hits.length && head(b).every(h => /baby monitor/i.test(h.title)), show(b));
});
check('"tv" is a television (never a tripod, stand or T-shirt)', () => {
  const r = search("tv");
  for (const h of r.hits) assert.match(h.title, /\b(?:tv|television)\b/i, h.title);
  for (const h of r.hits) assert.doesNotMatch(h.title, /tripod|stand|mount|shirt|hat|skateboard|funko/i, h.title);
  if (!r.hits.length) assert.equal(r.sense, "televisores");
});
check("brand names win over the dictionary", () => {
  for (const [q, re] of [["new balance", /new balance/i], ["tommy hilfiger", /tommy hilfiger/i], ["miu miu", /miu miu/i],
    ["polo ralph lauren", /ralph lauren/i], ["youg la", /youngla|young la/i], ["victoria secret sales", /victoria/i]]) {
    const r = search(q);
    assert.ok(r.hits.length >= 5, `"${q}" found ${r.hits.length}`);
    for (const h of head(r)) assert.match(h.brand + " " + h.title, re, `"${q}" showed ${h.brand} ${h.title}`);
  }
});

/* ------------------------------------------------------------------
   6. NEVER HANGS, NEVER A DEAD END.
   ------------------------------------------------------------------ */
check("H&M, single characters and the empty query answer at once", () => {
  for (const q of ["H&M", "h&m", "h & m", "a", "x", "ñ", "&", "", "   ", "?", "--"]) {
    const t = Date.now();
    const r = P.run(ctx, q);
    assert.ok(Date.now() - t < 1000, `"${q}" took ${Date.now() - t}ms`);
    assert.ok(["empty", "short", "none", "results"].includes(r.state), `"${q}" -> ${r.state}`);
    assert.equal(r.hits.length, 0, `"${q}" showed ${r.hits.length} products`);
  }
  assert.equal(P.run(ctx, "H&M").missingBrand, "h&m", "H&M must say we do not sell it (it used to show HP laptops)");
});
check("gibberish is a clean empty state", () => {
  for (const q of ["xyzqwerty", "12345", "qwrtp zzkx"]) {
    const r = search(q);
    assert.equal(r.state, "none", `"${q}" showed: ${show(r)}`);
  }
});
check("the empty state's examples all find products", () => {
  const ex = JSON.parse("[" + /var EXAMPLE_QUERIES = \[([^\]]*)\];/.exec(page)[1] + "]");
  assert.ok(ex.length >= 4, "too few examples");
  for (const q of ex) assert.ok(search(q).hits.length >= 10, `example "${q}" finds ${search(q).hits.length}`);
});
check("never zero because of one word", () => {
  const r = search("zapatillas nike xqzzv");
  assert.equal(r.state, "results", "one unknown word zeroed the search");
  assert.ok(r.shown, "the page must say which search it ran");
});

/* ------------------------------------------------------------------
   7. ONE CARD PER PRODUCT, EVERY CARD WITH A PICTURE.
   ------------------------------------------------------------------ */
check("no duplicates and no imageless products in any result", () => {
  const all = [...Object.keys(TYPES), ...Object.keys(COMBOS), ...Object.keys(TYPOS), "miu miu", "miu miu charm", "apple", "tie", "bag"];
  for (const q of all) {
    const r = search(q);
    for (const key of [P.productKey, P.storeKey]) {
      const keys = r.hits.map(key);
      assert.equal(new Set(keys).size, keys.length, `"${q}" lists a product twice`);
    }
    for (const h of r.hits) assert.ok(h.image, `"${q}" shows ${h.title} without an image`);
  }
  assert.ok(index.rows.every(r => r[at.image]), "the index carries an imageless product");
});

check("every search answers fast", () => {
  assert.ok(slowest.ms < 2500, `"${slowest.q}" took ${slowest.ms}ms`);
});

const MIN_CHECKS = 70;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed  (slowest: "${slowest.q}" ${slowest.ms}ms)\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }

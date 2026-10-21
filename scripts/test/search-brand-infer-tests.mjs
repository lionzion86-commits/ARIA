/* ==================================================================
   A BLANK BRAND IS READ FROM THE TITLE (#443 follow-up).

   With Target off sale, the only LEGO left was Walmart's, whose feed has
   no brand field, and search answered "lego" with "Todavía no vendemos
   LEGO" over 860 sets. scripts/build-search-index.mjs now fills a blank
   brand from the title's opening words when they spell a brand on
   search's own brand list. These checks hold that in place:

   - the rule itself (whole words, first three, the catalogue's spelling,
     the "Guess Who?" guard);
   - the committed index is built with it;
   - /api/search answers the brands the off-sale stores used to carry
     (LEGO, Play-Doh, Fisher-Price, Maybelline, CeraVe, L'Oreal) with
     live rows instead of "no lo vendemos".

   RUNNING IT
     node scripts/test/search-brand-infer-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isOffSaleRetailer } from "../lib/off-sale.js";
import { brandFromTitle, inferBrands, knownBrands, FALSE_BRAND_PREFIXES, INDEX_PATH } from "../build-search-index.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
process.chdir(ROOT);
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name + "\n         " + e.message); }
}

const BRANDS = knownBrands();

console.log("\n  the rule");
await check("the brand list is search's own dictionary list, and it knows LEGO", () => {
  assert.ok(BRANDS.size >= 50, BRANDS.size + " brands");
  for (const b of ["lego", "playdoh", "fisherprice", "loreal", "barbie", "hotwheels"]) assert.ok(BRANDS.has(b), b);
});
await check("a title's opening words, spelled as the title spells them", () => {
  assert.equal(brandFromTitle("LEGO Star Wars SMART Play: AT-ST Attack on Endor 75424", BRANDS), "LEGO");
  assert.equal(brandFromTitle("Play-Doh 4-Pack Classic Colors", BRANDS), "Play-Doh");
  assert.equal(brandFromTitle("Fisher Price Indoor Bouncer", BRANDS), "Fisher Price");
  assert.equal(brandFromTitle("L'Oréal Paris True Match", BRANDS), "L'Oréal");
  assert.equal(brandFromTitle("Hot Wheels, 5-Pack", BRANDS), "Hot Wheels");
});
await check("never a brand from inside a word, past the third word, or from a false prefix", () => {
  assert.equal(brandFromTitle("Legoland Windsor ticket", BRANDS), "");
  assert.equal(brandFromTitle("Building bricks compatible with LEGO", BRANDS), "");
  assert.equal(brandFromTitle("Guess Who? Board Game Original", BRANDS), "");
  assert.ok(FALSE_BRAND_PREFIXES.includes("guess who"));
});
await check("a filled brand takes the catalogue's own spelling, else the titles' most common", () => {
  const rows = [
    { title: "Lego Classic box", brand: "" }, { title: "LEGO City set", brand: "" }, { title: "LEGO Duplo", brand: "" },
    { title: "Barbie Dreamhouse", brand: "" }, { title: "Barbie doll", brand: "BARBIE" },
    { title: "Generic toy", brand: "" },
  ];
  const filled = inferBrands(rows, BRANDS);
  assert.deepEqual(rows.map((r) => r.brand), ["LEGO", "LEGO", "LEGO", "BARBIE", "BARBIE", ""]);
  assert.deepEqual(filled, { lego: 3, barbie: 1 });
});

console.log("\n  the committed index");
const index = JSON.parse(readFileSync(ROOT + INDEX_PATH, "utf8"));
const F = index.fields, TI = F.indexOf("title"), BI = F.indexOf("brand"), RI = F.indexOf("retailer");
await check("no row the rule would brand is left blank (rebuild: node scripts/build-search-index.mjs)", () => {
  const blank = index.rows.filter((r) => !r[BI] && brandFromTitle(r[TI], BRANDS));
  assert.equal(blank.length, 0, blank.length + " rows, e.g. " + blank.slice(0, 3).map((r) => r[TI].slice(0, 50)).join(" | "));
});
await check("the Walmart LEGO sets carry brand LEGO", () => {
  const lego = index.rows.filter((r) => r[RI] === "walmart" && /^LEGO\b/i.test(r[TI]));
  assert.ok(lego.length >= 500, lego.length + " Walmart LEGO rows");
  assert.ok(lego.every((r) => r[BI] === "LEGO"), "a Walmart LEGO row is not branded LEGO");
});

console.log("\n  /api/search");
const { handler } = await import("../../netlify/functions/search.js");
const fetchImpl = async () => ({ ok: true, json: async () => ({ venta: 3.75 }) });
async function ask(q) {
  const r = await handler({ httpMethod: "GET", queryStringParameters: { q, page: "1" } }, { fetchImpl });
  assert.equal(r.statusCode, 200);
  return JSON.parse(r.body);
}
const CASES = [
  ["lego", /\blego\b/i, 100],
  ["LEGO 75424", /AT-ST/i, 1],
  ["lego star wars", /\blego\b.*star wars/i, 50],
  ["play doh", /play[\s-]?doh/i, 50],
  ["fisher price", /fisher[\s-]?price/i, 50],
  ["maybelline", /maybelline/i, 20],
  ["cerave", /cerave/i, 20],
];
for (const [q, right, min] of CASES) {
  await check(`"${q}": Walmart rows, not "Todavía no vendemos"`, async () => {
    const b = await ask(q);
    assert.equal(b.missingBrand, null, `answers "Todavía no vendemos ${String(b.missingBrand).toUpperCase()}"`);
    assert.equal(b.state, "results");
    assert.ok(b.total >= min, `${b.total} results`);
    const top = b.items.slice(0, 8);
    assert.ok(top.every((it) => right.test(it.title)), "not what was asked: " + top.filter((it) => !right.test(it.title)).map((it) => it.title.slice(0, 50)).join(" | "));
    assert.ok(top.some((it) => it.store === "walmart"), "no Walmart row on top");
    assert.ok(b.items.every((it) => !isOffSaleRetailer(it.store)), "an off-sale row");
  });
}
await check('"LEGO 75424" is the ported AT-ST at Walmart', async () => {
  const b = await ask("LEGO 75424");
  assert.equal(b.items[0].store, "walmart");
  assert.match(b.items[0].title, /75424/);
});

console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);

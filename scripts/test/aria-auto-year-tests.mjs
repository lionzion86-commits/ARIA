/* ==================================================================
   ARIA AUTO — THE MODEL YEAR REACHES THE PARTS LOOKUP.

   iPhone QA, 2026-10-07: "pastillas de freno para un Subaru Forester",
   she asks the year, he says 2018 (then 2022), she repeats it back
   correctly -- and asks again, then for the VIN. The year was heard
   and understood. It died in the handoff: the tool schema typed it
   "integer", parseToolArguments only knew "number" and "string", and
   every integer argument was dropped. lookup_parts_by_vehicle never
   saw a year.

   RUNNING IT
     node scripts/test/aria-auto-year-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseModelYear, parseToolArguments, REALTIME_TOOLS } from "../lib/realtime-turn.js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}
const NOW = { now: "2026-10-07T12:00:00Z" };

/* ------------------------------------------------------------------
   A SPANISH NUMBER WRITER, written independently of the parser, so the
   test is not the parser checking itself.
   ------------------------------------------------------------------ */
const UNITS = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
  "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve",
  "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis",
  "veintisiete", "veintiocho", "veintinueve"];
const TENS = { 3: "treinta", 4: "cuarenta", 5: "cincuenta", 6: "sesenta", 7: "setenta", 8: "ochenta", 9: "noventa" };
function below100(n) {
  if (n < 30) return UNITS[n];
  const t = TENS[Math.floor(n / 10)], u = n % 10;
  return u ? `${t} y ${UNITS[u]}` : t;
}
function spokenYear(y) {
  if (y >= 2000) return y === 2000 ? "dos mil" : `dos mil ${below100(y - 2000)}`;
  return `mil novecientos ${below100(y - 1900)}`;
}
const unaccent = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

await check("(a) every model year 1990–2026, spoken in Spanish, parses to its 4 digits", () => {
  const bad = [];
  for (let y = 1990; y <= 2026; y++) {
    const forms = [spokenYear(y), unaccent(spokenYear(y)), String(y), `del ${y}`, `${y} Forester`,
      `es del ${spokenYear(y)}`, spokenYear(y).toUpperCase()];
    /* In a year context two digits ARE a year: "dieciocho", "noventa y ocho". */
    const two = y % 100;
    if (y >= 2001 || y >= 1990 && y <= 1999) forms.push(below100(two), unaccent(below100(two)), `'${String(two).padStart(2, "0")}`);
    for (const f of forms) {
      const got = parseModelYear(f, NOW);
      if (got !== y) bad.push(`"${f}" -> ${got} (wanted ${y})`);
    }
  }
  assert.equal(bad.length, 0, bad.slice(0, 8).join("; "));
});

await check("(a) the forms from the QA call, and what is not a year", () => {
  const cases = { "dos mil dieciocho": 2018, "dos mil veintidós": 2022, "dos mil veintidos": 2022, "dieciocho": 2018,
    "veintidós": 2022, "veintidos": 2022, "veinte veintidós": 2022, "diecinueve noventa y ocho": 1998, "2.022": 2022 };
  for (const [s, y] of Object.entries(cases)) assert.equal(parseModelYear(s, NOW), y, `"${s}"`);
  for (const s of ["Forester", "no sé", "", null, "dos mil cincuenta", "1850"]) assert.equal(parseModelYear(s, NOW), null, `"${s}" became a year`);
  assert.equal(parseModelYear(2022, NOW), 2022);
});

await check("the tool parser keeps the year (and every integer and boolean)", () => {
  /* THE BUG: "integer" was not a type the parser knew. */
  const spec = REALTIME_TOOLS.find((t) => t.name === "lookup_parts_by_vehicle");
  assert.equal(spec.parameters.properties.year.type, "integer");
  for (const year of [2022, "2022", "dos mil veintidós", "del 2018"]) {
    const r = parseToolArguments("lookup_parts_by_vehicle",
      JSON.stringify({ year, make: "subaru", model: "forester", part_type: "pastillas de freno" }));
    assert.ok(r.ok, `rejected with year ${JSON.stringify(year)}: ${r.error}`);
    assert.ok(r.args.year === 2022 || r.args.year === 2018, `year ${JSON.stringify(year)} arrived as ${r.args.year}`);
  }
  /* Every integer and boolean parameter in every tool survives the parser. */
  for (const tool of REALTIME_TOOLS) {
    for (const [k, t] of Object.entries(tool.parameters.properties)) {
      if (t.type !== "integer" && t.type !== "boolean") continue;
      const sample = t.type === "boolean" ? true : (k === "year" ? 2020 : 3);
      const args = {};
      for (const req of tool.parameters.required || []) args[req] = "x";
      args[k] = sample;
      const r = parseToolArguments(tool.name, JSON.stringify(args));
      assert.ok(r.ok && r.args[k] === sample, `${tool.name}.${k} (${t.type}) was dropped`);
    }
  }
  /* A missing year is the lookup's to handle, not an argument error. */
  const noYear = parseToolArguments("lookup_parts_by_vehicle", JSON.stringify({ make: "subaru", model: "forester", part_type: "pastillas de freno" }));
  assert.ok(noYear.ok, "a call without a year is refused before the lookup can count it");
});

/* ------------------------------------------------------------------
   (b) THE LOOKUP ITSELF, lifted from index.html and run against a
   stub catalogue: the key it searches carries the year.
   ------------------------------------------------------------------ */
const page = readFileSync(ROOT + "index.html", "utf8");
const at = page.indexOf("  if (name === 'lookup_parts_by_vehicle'){");
assert.ok(at > 0, "the lookup moved — update this test");
let depth = 0, end = -1;
for (let k = page.indexOf("{", at); k < page.length; k++) {
  if (page[k] === "{") depth++;
  else if (page[k] === "}" && --depth === 0) { end = k; break; }
}
const block = page.slice(at, end + 1);

/* The page's own pricing, so a card's price is the one the Aria Auto
   page and the cart use (normalizeAutoPartItem = normalizeLiveItem). */
const { loadPageEngine } = await import(ROOT + "scripts/lib/mcp/page-slices.mjs");
const ENGINE = loadPageEngine();
const engineSrc = readFileSync(ROOT + "search-engine.js", "utf8");
const SW = {}; new Function("window", engineSrc)(SW);
const searchTokens = SW.AriaSearch.searchTokens;
/* The page's own guard-word function, lifted, not copied. */
const pgwSrc = /function partsGuardWords\(text\)\{[\s\S]*?\r?\n\}/.exec(page)[0];
const partsGuardWords = new Function("searchTokens", pgwSrc + "; return partsGuardWords;")(searchTokens);
/* The page's own glossary slice: the real ES<->EN part translation. */
const { loadPageAutoGlossarySlice } = await import(ROOT + "scripts/test/_page-script.mjs");
const GLOSSARY = loadPageAutoGlossarySlice();
const normalizeAutoPartItem = (source, raw) => ({ ...ENGINE.pricing.normalizeLiveItem(raw, { retailer: source }), raw });

function makeLookup(cache, misses = 0) {
  const logs = [];
  const cards = [];
  const fn = new Function("autoCacheIfWarm", "ariaAutoWarming", "logFitmentGap", "titleCaseWords", "console", "tape", "initialMisses",
    "normalizeAutoPartItem", "addAssistantProductCard", "searchTokens", "translatePartQuery", "partsGuardWords", "translatePartQueryToEs",
    `let ariaRTYearMisses = initialMisses;
     let ariaRTPartsShown = null;
     return { run: async (name, args) => { ${block} }, misses: () => ariaRTYearMisses, partsShown: () => ariaRTPartsShown };`);
  const api = fn(async () => cache, "calentando", () => {}, (s) => s.replace(/\b\w/g, (c) => c.toUpperCase()),
    { info: (tag, o) => logs.push(o), warn() {}, log() {} }, () => {}, misses,
    normalizeAutoPartItem, (item, retailer) => cards.push({ item, retailer }), searchTokens, (q) => q === "pastillas de freno" ? "brake pads" : q, partsGuardWords, GLOSSARY.translatePartQueryToEs);
  return { ...api, logs, cards };
}
const pad = (name) => ({ productTitle: name, brand: "Akebono", part_number: "ACT1078", price: 45.99, store: "autozone" });
const CACHE = { partSearches: {
  "2022|subaru|forester|pastillas de freno": { autozone: [pad("Akebono ProACT Ceramic Brake Pads - Front")] },
  "2018|subaru|forester|pastillas de freno": { autozone: [pad("Duralast Gold Brake Pads - Front")] },
} };

await check("(b) a year in the conversation is in the query the fitment lookup receives", async () => {
  for (const [said, year] of [["dos mil veintidós", 2022], ["2018", 2018], ["dieciocho", 2018]]) {
    const parsed = parseToolArguments("lookup_parts_by_vehicle",
      JSON.stringify({ year: said, make: "Subaru", model: "Forester", part_type: "pastillas de freno" }));
    assert.ok(parsed.ok, parsed.error);
    const L = makeLookup(CACHE);
    const out = await L.run("lookup_parts_by_vehicle", parsed.args);
    const key = L.logs.find((o) => o && o.key) || {};
    assert.equal(key.key, `${year}|subaru|forester|pastillas de freno`, `"${said}" searched ${key.key}`);
    assert.equal(out.vehicle, `${year} Subaru Forester`);
    assert.ok(out.parts.length && out.parts.every((p) => p.fitment === "confirmed"), "exact-year data was not confirmed");
    assert.ok(!out.need_year, "she was told to ask for the year again");
  }
});

await check("(c) the year is asked for at most twice, then VIN once or an unconfirmed search", async () => {
  const L = makeLookup(CACHE);
  const args = { make: "subaru", model: "forester", part_type: "pastillas de freno" };
  const first = await L.run("lookup_parts_by_vehicle", args);
  assert.ok(first.need_year, "the first miss does not ask once more");
  const second = await L.run("lookup_parts_by_vehicle", args);
  assert.ok(!second.need_year, "she would ask for the year a third time");
  assert.ok(second.parts.length, "no year meant no answer at all");
  assert.ok(second.parts.every((p) => p.fitment !== "confirmed"), "a part was confirmed without a year — fitment honesty broken");
  assert.equal(second.year_unknown, true);
  assert.match(second.fitment_note, /VIN UNA sola vez/, "the fallback does not ask for the VIN once");
  assert.match(second.fitment_note, /No vuelvas a pedir el año/);
  /* The newest data stands in when there is no year. */
  assert.equal(second.data_year, 2022);
});

await check("a rejected argument is logged, never silent again", () => {
  const run = page.slice(page.indexOf("async function runRealtimeTool(event, send){"));
  assert.match(run.slice(0, 900), /console\.warn\('\[aria\] tool arguments rejected:'/, "a rejected argument is still silent");
  const voice = readFileSync(ROOT + "scripts/lib/realtime-voice.js", "utf8");
  assert.match(voice, /NUNCA pidas el año más de DOS veces/, "the voice prompt does not cap the year question");
});

/* ------------------------------------------------------------------
   (d) 2026-10-09, Danny's iPhone: she SPOKE the five Duralast pads for a
   2018 Forester and the cards on screen were a Hot Wheels Forester,
   kids' clothes and earbuds. The cards now come from the lookup.
   ------------------------------------------------------------------ */
const REAL = JSON.parse(readFileSync(ROOT + "auto-cache.json", "utf8"));
await check("(d) the parts she names are the cards on screen: photo, brand, part number, the card's price", async () => {
  const L = makeLookup(REAL);
  const out = await L.run("lookup_parts_by_vehicle", { year: 2018, make: "subaru", model: "forester", part_type: "pastillas de freno" });
  assert.ok(out.parts.length >= 1, "no parts");
  assert.equal(L.cards.length, out.parts.length, "a part she names has no card (or a card she does not name)");
  assert.ok(L.cards.length <= 6);
  for (let i = 0; i < L.cards.length; i++) {
    const { item, retailer } = L.cards[i];
    assert.equal(retailer, "autozone");
    assert.ok(item.image && /^https:\/\//.test(item.image), `card ${i} has no photo`);
    assert.ok(item.partNumber, `card ${i} has no part number`);
    assert.ok(item.brand, `card ${i} has no brand`);
    assert.ok(/brake pads/i.test(item.title), `card ${i} is not a brake pad: ${item.title}`);
    assert.equal(out.parts[i].price_usd, item.price, "she would say a different price than the card shows");
  }
  assert.equal(out.cards_shown, L.cards.length);
  assert.match(out.cards_note, /No llames search_products/);
});

await check("(d) every price she says carries the standard margin, and an unpriced part is never named", async () => {
  const L = makeLookup(REAL);
  const out = await L.run("lookup_parts_by_vehicle", { year: 2018, make: "subaru", model: "forester", part_type: "pastillas de freno" });
  const shelf = REAL.partSearches["2018|subaru|forester|pastillas de freno"].autozone;
  for (const p of out.parts) {
    const rec = shelf.find((r) => r.part_number === p.part_number);
    const std = ENGINE.pricing.normalizeLiveItem(rec, { retailer: "autozone" }).price;
    assert.equal(p.price_usd, std, `${p.part_number}: not the standard margin`);
    assert.ok(p.price_usd > rec.price, `${p.part_number}: she would say the bare shelf price`);
  }
  const d1114 = out.parts.find((p) => p.part_number === "D1114");
  if (d1114) assert.equal(d1114.price_usd, 72.96, "shelf $54.99 is $72.96 with the standard treatment");
  const M = makeLookup({ partSearches: { "2018|subaru|forester|pastillas de freno": { autozone: [
    { productTitle: "No Price Pads", brand: "X", part_number: "NP1", price: null, store: "autozone" },
    pad("Duralast Gold Brake Pads - Front"),
  ] } } });
  const o2 = await M.run("lookup_parts_by_vehicle", { year: 2018, make: "subaru", model: "forester", part_type: "pastillas de freno" });
  assert.deepEqual(o2.parts.map((p) => p.part_number), ["ACT1078"], "she names a part with no priced card");
  assert.equal(M.cards.length, 1);
});

await check("(h) English part names reach the Spanish cache keys: \"brake pads\" is \"pastillas de freno\"", async () => {
  const T = GLOSSARY.translatePartQueryToEs;
  assert.equal(T("brake pads"), "pastillas de freno");
  assert.equal(T("Brake Pads"), "pastillas de freno");
  assert.equal(T("front brake pads"), "front pastillas de freno");
  assert.equal(T("pastillas de freno"), "pastillas de freno", "Spanish must pass through unchanged");
  assert.equal(T("cabin air filter"), "filtro de aire de cabina", "longest English term must win");
  const keys = new Set(Object.keys(REAL.partSearches).map((k) => k.split("|")[3]));
  assert.equal(T("spark plugs", keys), "bujías", "a cache key must be preferred among synonyms");
  assert.equal(T("serpentine belt", keys), "correa de accesorios");
  assert.equal(T("brake pad", keys), "pastillas de freno", "singular must reach the plural key");
  assert.equal(T("breakfast"), "breakfast");
  assert.equal(T("headlights", keys), "faros delanteros", "headlights must reach the cache key, not bare \"faros\"");
  assert.equal(GLOSSARY.translatePartQuery("faros delanteros"), "headlights", "never \"headlights delanteros\"");
  const L = makeLookup(REAL);
  const out = await L.run("lookup_parts_by_vehicle", { year: 2018, make: "subaru", model: "forester", part_type: "brake pads" });
  assert.equal(out.part_type, "pastillas de freno", out.unavailable || "English part_type missed the cache");
  assert.ok(out.parts.length >= 1 && L.cards.length === out.parts.length);
  const S = makeLookup(REAL);
  const es = await S.run("lookup_parts_by_vehicle", { year: 2018, make: "subaru", model: "forester", part_type: "pastillas de freno" });
  const ids = (cs) => cs.map((c) => [c.item.partNumber, c.item.price, c.item.brand]);
  assert.deepEqual(ids(L.cards), ids(S.cards), "English and Spanish must show the same cards");
  assert.equal(L.cards.length, 5, "the five Duralast pads");
  assert.ok(L.cards.every((c) => c.item.brand === "Duralast"));
  const H = makeLookup(REAL);
  const hl = await H.run("lookup_parts_by_vehicle", { year: 2015, make: "toyota", model: "corolla", part_type: "headlights" });
  assert.equal(hl.part_type, "faros delanteros", hl.unavailable || "English headlights missed the cache");
  assert.ok(hl.parts.length >= 1);
});

/* The search_products branch, lifted the same way. */
const sAt = page.indexOf("  if (name === 'search_products'){");
let sd = 0, sEnd = -1;
for (let k = page.indexOf("{", sAt); k < page.length; k++) {
  if (page[k] === "{") sd++;
  else if (page[k] === "}" && --sd === 0) { sEnd = k; break; }
}
const sBlock = page.slice(sAt, sEnd + 1);
function makeSearch(partsShown) {
  const cards = [];
  const fn = new Function("ariaRTPartsShown", "searchTokens", "loadFxRate", "budgetToUsd", "catalogSearch", "addAssistantProductCard", "realtimeProductId",
    `return async (name, args) => { ${sBlock} };`);
  const junk = [{ title: "Hot Wheels Subaru Forester", retailer: "target", price: 5 }, { title: "Kids Tee", retailer: "target", price: 9 }];
  const run = fn(partsShown, searchTokens, async () => {}, () => ({ usd: null }), async () => ({ items: junk }),
    (it) => cards.push(it), (it) => it.title);
  return { run, cards };
}
await check("(e) after the parts are on screen, a general search for the same car or part is refused", async () => {
  const L = makeLookup(REAL);
  await L.run("lookup_parts_by_vehicle", { year: 2018, make: "subaru", model: "forester", part_type: "pastillas de freno" });
  for (const q of ["2018 Subaru Forester brake pads", "pastillas de freno", "forester"]) {
    const S = makeSearch(L.partsShown());
    const r = await S.run("search_products", { query: q });
    assert.equal(r.already_shown, true, `"${q}" searched the general catalogue again`);
    assert.equal(S.cards.length, 0, `"${q}" drew junk cards over the parts`);
  }
  const S = makeSearch(L.partsShown());
  const other = await S.run("search_products", { query: "zapatillas de mujer" });
  assert.ok(!other.already_shown, "an unrelated search was blocked");
  assert.ok(!L.partsShown().words.has("de"), "a filler word would block every later search");
});
await check("(e) while the parts catalogue is still loading, the general search is held off that car too", async () => {
  const L = makeLookup(null);
  const first = await L.run("lookup_parts_by_vehicle", { year: 2018, make: "subaru", model: "forester", part_type: "pastillas de freno" });
  assert.equal(first.unavailable, "calentando");
  assert.match(first.retry, /vuelve a llamar lookup_parts_by_vehicle/);
  const S = makeSearch(L.partsShown());
  const r = await S.run("search_products", { query: "Subaru Forester brake pads" });
  assert.equal(r.parts_loading, true, "the Hot Wheels Forester gap is still open");
  assert.equal(S.cards.length, 0);
});
await check("(f) a part card opens inside Aria with its part number, never the store's site", () => {
  const fnAt = page.indexOf("function addAssistantProductCard(item, retailer){");
  const body = page.slice(fnAt, fnAt + page.slice(fnAt).search(/\r?\n\}\r?\n/));
  assert.ok(body.length > 200 && body.length < 4000, "addAssistantProductCard moved — update this test");
  assert.match(body, /pendingAutoPartNumber = partNumber/, "the part number is lost on the tap");
  assert.match(body, /showProduct\(/);
  assert.doesNotMatch(body, /window\.open|location\.href|\.url\b|autozone\.com/, "a card links out of Aria");
  const spec = REALTIME_TOOLS.find((t) => t.name === "lookup_parts_by_vehicle");
  assert.match(spec.description, /NO llames search_products/);
});

await check("(g) the product page finds the tapped part in the auto cache, part number shown, no link out", async () => {
  const prod = readFileSync(ROOT + "producto.html", "utf8");
  const lift = (sig) => {
    const at = prod.indexOf(sig);
    assert.ok(at >= 0, sig + " moved — update this test");
    let depth = 0, i = prod.indexOf("{", at);
    for (; i < prod.length; i++) { if (prod[i] === "{") depth++; else if (prod[i] === "}" && --depth === 0) break; }
    return prod.slice(at, i + 1);
  };
  const src = [lift("function norm("), lift("function normalizeItem("), lift("async function huntAuto(")].join("\n");
  const run = (q) => {
    const params = new URLSearchParams(q);
    const fetch = async () => ({ ok: true, json: async () => REAL });
    return new Function("params", "fetch", "want", "tienda", src + "\nreturn huntAuto();")(
      params, fetch, params.get("producto"), params.get("tienda"));
  };
  const p = await run("producto=Duralast%20Ceramic%20Brake%20Pads%20D1114&tienda=autozone&pn=D1114");
  assert.ok(p, "the tapped AutoZone part is \"no encontrado\" again");
  assert.equal(p.partNumber, "D1114");
  assert.equal(p.retailer, "autozone");
  assert.ok(p.price > 0 && p.image, "the part lost its price or photo");
  assert.equal(p.url, "", "the store's url rides into the product page");
  const byTitle = await run("producto=Duralast%20Ceramic%20Brake%20Pads%20D1114&tienda=autozone");
  assert.equal(byTitle && byTitle.partNumber, "D1114", "without ?pn= the title must still find it");
  assert.match(prod, /p\.partNumber \? .*N\.° de parte/, "the part number is not shown on the product page");
  assert.doesNotMatch(prod, /autozone\.com/, "the product page links out to AutoZone");
});

const MIN_CHECKS = 13;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }

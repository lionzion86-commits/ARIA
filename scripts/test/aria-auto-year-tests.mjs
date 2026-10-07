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

function makeLookup(cache, misses = 0) {
  const logs = [];
  const fn = new Function("autoCacheIfWarm", "ariaAutoWarming", "logFitmentGap", "titleCaseWords", "console", "tape", "initialMisses",
    `let ariaRTYearMisses = initialMisses;
     return { run: async (name, args) => { ${block} }, misses: () => ariaRTYearMisses };`);
  const api = fn(async () => cache, "calentando", () => {}, (s) => s.replace(/\b\w/g, (c) => c.toUpperCase()),
    { info: (tag, o) => logs.push(o), warn() {}, log() {} }, () => {}, misses);
  return { ...api, logs };
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

const MIN_CHECKS = 6;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }

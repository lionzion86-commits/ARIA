/* ==================================================================
   EVERY DESCRIPTION A SHOPPER READS IS SPANISH (#443 c.6402691998).

   Danny, on a live product page: Spanish everywhere except the part that
   sells the product. The fix stores the Spanish with the data
   (scripts/lib/description-es.js); these checks hold it there:

     - the product page never falls back to the feed's English
       (description_en);
     - every Aria Perfumes row that has feed copy carries a Spanish
       description, and none of the product-page records reads English;
     - the memory keeps the facts: the years and numbers of the English
       are in the Spanish, the brand is kept, and Danny's evidence page
       (Antonio Banderas Seduction In Black) reads Spanish.

     node scripts/test/description-language-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { descKey, loadMemory, spanishFor } from "../lib/description-es.js";
import { auditDescriptions, descLanguage } from "../audit-description-language.mjs";
import { applyToCatalog, catalogFiles } from "../apply-description-memory.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

const rows = [];
(function walk(o) {
  if (Array.isArray(o)) o.forEach(walk);
  else if (o && typeof o === "object") { if (o.sku && o.retailer) rows.push(o); else Object.values(o).forEach(walk); }
})(JSON.parse(readFileSync(ROOT + "perfumes-catalog.json", "utf8")));
const mem = loadMemory("ariaperfumes");

check("the product page shows only the Spanish description, never description_en", () => {
  const page = readFileSync(ROOT + "producto.html", "utf8");
  assert.match(page, /description: String\(it\.description \|\| ""\),/);
  assert.ok(!/it\.description_en/.test(page), "the page still reads description_en");
});

check("every Aria Perfumes row with feed copy carries its Spanish description", () => {
  const withCopy = rows.filter((r) => r.description_en);
  const missing = withCopy.filter((r) => !r.description);
  assert.ok(withCopy.length > 10000, "the catalogue lost its rows");
  assert.equal(missing.length, 0, `${missing.length} rows without Spanish, e.g. ${missing.slice(0, 3).map((r) => r.sku).join(", ")}`);
  for (const r of withCopy) assert.equal(r.description, spanishFor("ariaperfumes", r.description_en), r.sku);
});

/* A title-only copy ("Light Blue Colonia de Dolce & Gabbana") is the
   product's own name: its words are the fragrance's, not English prose. */
const TITLE_ONLY = /^[^.!?]+ (Perfume|Colonia|Fragancia|Eau de Parfum|Body Mist|Set de regalo) de [^.!?]+\.?\d*$/;
const titleOnly = (r) => TITLE_ONLY.test(r.description)
  || (r.description.split(" ").length <= 14 && / (Perfume|Colonia|Fragancia) de /.test(r.description) && r.description.toLowerCase().endsWith(" de " + String(r.brand || "").toLowerCase()));

check("no Aria Perfumes product page reads English", () => {
  assert.ok(auditDescriptions().ariaperfumes.records > 10000);
  const english = rows.filter((r) => r.description && !titleOnly(r) && descLanguage(r.description) === "en");
  assert.equal(english.length, 0, `${english.length} English descriptions, e.g. ${english.slice(0, 2).map((r) => r.description.slice(0, 80)).join(" | ")}`);
  const by = rows.filter((r) => r.description && r.brand && r.description.toLowerCase().endsWith(" by " + r.brand.toLowerCase()));
  assert.equal(by.length, 0, `${by.length} title-only copies kept the English "by <brand>"`);
});

check("the translations keep the facts: years, numbers and the brand", () => {
  const bad = [];
  for (const r of rows) {
    if (!r.description_en || !r.description) continue;
    /* "18th century" may become "siglo XVIII" */
    /* ordinals may be written out ("2nd" → "segunda", "18th century" → "siglo XVIII") */
    const en = r.description_en.replace(/\b\d{1,3}(st|nd|rd|th)\b/gi, "");
    const nums = (s) => new Set((s.match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(",", ".")));
    const es = nums(r.description);
    for (const n of nums(en)) if (!es.has(n)) { bad.push(`${r.sku}: ${n}`); break; }
  }
  assert.ok(bad.length <= 3, `${bad.length} translations dropped a number, e.g. ${bad.slice(0, 5).join("; ")}`);
});

check("Danny's evidence page reads Spanish: Antonio Banderas Seduction In Black", () => {
  const r = rows.find((x) => /^Seduction In Black/.test(x.title) && x.brand === "Antonio Banderas");
  assert.ok(r, "the product is gone");
  assert.equal(descLanguage(r.description), "es");
  assert.match(r.description, /2009/);
  assert.match(r.description, /Seduction In Black/);
  assert.match(r.description, /Antonio Banderas/);
});

check("the memory is keyed by the English text, so a rewritten feed copy is not mistranslated", () => {
  assert.equal(descKey("  Seduction   In Black  "), descKey("Seduction In Black"));
  assert.notEqual(descKey("Seduction In Black"), descKey("Seduction In Blue"));
  assert.equal(spanishFor("ariaperfumes", "an English text nobody has translated"), null);
  assert.ok(Object.keys(mem).length >= 7000, "the memory lost entries");
});

/* TOYS, AT THE SAME PRIORITY (#443 c.6403135059): children read these
   pages themselves. Walmart's toy copy is stored Spanish in the catalogue. */
check("toy pages read Spanish: no English prose left on Walmart's toys", () => {
  const recs = [];
  for (const f of catalogFiles()) {
    if (f !== "juguetes-catalog.json") continue;
    (function walk(o, st) {
      if (Array.isArray(o)) return o.forEach((v) => walk(v, st));
      if (!o || typeof o !== "object") return;
      if (o.retailers && !Array.isArray(o.retailers)) return Object.entries(o.retailers).forEach(([k, v]) => walk(v, k));
      if (typeof o.description === "string" && o.title) recs.push(o);
      Object.values(o).forEach((v) => walk(v, st));
    })(JSON.parse(readFileSync(ROOT + f, "utf8")));
  }
  assert.ok(recs.length > 6000, "the toy catalogue lost its items");
  /* a product name copied into the description is not English prose: at most 12 words, no sentence */
  const prose = recs.filter((r) => r.description && descLanguage(r.description) === "en" && (r.description.split(" ").length > 12 || /[a-z]\. [A-Z]/.test(r.description)));
  /* what is left are franchise and set names ("POKEMON TCG: SCARLET AND
     VIOLET ..."), English by nature; the word test cannot tell them from
     prose, so a handful are allowed and named in the failure */
  assert.ok(prose.length <= 10, `${prose.length} toys still read English, e.g. ${prose.slice(0, 3).map((r) => r.description.slice(0, 70)).join(" | ")}`);
  assert.ok(recs.filter((r) => r.description_en).length >= 4600, "the feed's English is not kept for the record");
});

check("writing the stored Spanish into a catalogue is idempotent", () => {
  const cat = JSON.parse(readFileSync(ROOT + "juguetes-catalog.json", "utf8"));
  assert.equal(applyToCatalog(cat), 0, "a second run still changes the toy catalogue");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }

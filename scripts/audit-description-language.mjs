#!/usr/bin/env node
/* ============================================================
   WHAT LANGUAGE DOES EACH PRODUCT PAGE'S DESCRIPTION READ IN?
   (#443 c.6402691998: "audit EVERY catalog for description language
   and report counts per catalog").

   Reads what the product pages actually show -- the records in
   assets/pdp/p/ (scripts/build-pdp-slices.mjs) -- and counts, per store:
   records, records with no description, and descriptions that read as
   English, Spanish, mixed, too short to tell, or neither. "uniqEN" is the
   number of distinct English texts, which is the translation work left.

     node scripts/audit-description-language.mjs            # table
     node scripts/audit-description-language.mjs --json     # machine-readable
     node scripts/audit-description-language.mjs --md       # report table

   The language test is a word count: English function words against
   Spanish ones (descLanguage below, shared with the tests).
   ============================================================ */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const EN = new Set("the and with for your this that from you are is of to in it its by on or an be as at will our made features".split(" "));
const ES = new Set("el la los las y con para su este esta que de en es un una por del al se más sus como lo tu o".split(" "));

export function descLanguage(text) {
  const w = String(text || "").toLowerCase().match(/[a-záéíóúñü]+/g) || [];
  if (w.length < 4) return "short";
  const e = w.filter((x) => EN.has(x)).length, s = w.filter((x) => ES.has(x)).length;
  if (!e && !s) return "unknown";
  return e > s * 1.2 ? "en" : s > e * 1.2 ? "es" : "mixed";
}

export function auditDescriptions(root = ROOT) {
  const dir = root + "assets/pdp/p/";
  const by = {};
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    for (const recs of Object.values(JSON.parse(readFileSync(dir + f, "utf8")))) {
      for (const r of recs) {
        const k = r.retailer || "?";
        const c = (by[k] ||= { records: 0, none: 0, en: 0, es: 0, mixed: 0, short: 0, unknown: 0, uniq: new Set() });
        c.records++;
        const d = String(r.description || "").trim();
        if (!d) { c.none++; continue; }
        const l = descLanguage(d);
        c[l]++;
        if (l === "en") c.uniq.add(d);
      }
    }
  }
  return Object.fromEntries(Object.entries(by).map(([k, c]) => { const { uniq, ...rest } = c; return [k, { ...rest, uniqEN: uniq.size }]; }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = auditDescriptions();
  const rows = Object.entries(a).sort((x, y) => y[1].en - x[1].en || x[0].localeCompare(y[0]));
  const cols = ["records", "none", "en", "es", "mixed", "short", "unknown", "uniqEN"];
  const tot = Object.fromEntries(cols.map((c) => [c, rows.reduce((n, [, r]) => n + r[c], 0)]));
  if (process.argv.includes("--json")) console.log(JSON.stringify(a, null, 1));
  else if (process.argv.includes("--md")) {
    console.log("| store | " + cols.join(" | ") + " |\n|---|" + cols.map(() => "---:").join("|") + "|");
    for (const [k, r] of rows) console.log(`| ${k} | ` + cols.map((c) => r[c]).join(" | ") + " |");
    console.log("| **total** | " + cols.map((c) => `**${tot[c]}**`).join(" | ") + " |");
  } else {
    console.log("store".padEnd(22) + cols.map((c) => c.padStart(8)).join(""));
    for (const [k, r] of rows) console.log(k.padEnd(22) + cols.map((c) => String(r[c]).padStart(8)).join(""));
    console.log("TOTAL".padEnd(22) + cols.map((c) => String(tot[c]).padStart(8)).join(""));
  }
}

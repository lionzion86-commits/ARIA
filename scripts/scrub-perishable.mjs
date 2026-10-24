/* ITEM 29 (#443, 2026-10-24): one-time scrub of fresh / perishable food
   from the committed catalogues, by the write stage's own rule
   (scripts/lib/walmart-write.js perishableFood). The scrapers and the
   write stage now drop these rows at ingest; this removes the ones
   already committed. Prints what it removed.

     node scripts/scrub-perishable.mjs [--dry-run] */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { perishableFood } from "./lib/walmart-write.js";

const ROOT = new URL("../", import.meta.url).pathname;
const dry = process.argv.includes("--dry-run");
const isProduct = (o) => o && typeof o === "object" && !Array.isArray(o) && (o.name || o.title) && "price" in o;
const bad = (o) => perishableFood(String(o.name || o.title || ""), typeof o.brand === "string" ? o.brand : "");

/* Every perishable product object in the parsed file, by its title. */
export function perishableTitles(node, out = new Set()) {
  if (Array.isArray(node)) { for (const v of node) perishableTitles(v, out); return out; }
  if (node && typeof node === "object") {
    if (isProduct(node) && bad(node)) { out.add(String(node.name || node.title)); return out; }
    for (const v of Object.values(node)) perishableTitles(v, out);
  }
  return out;
}

/* The end of the JSON value that opens at raw[i] ('{'), strings skipped. */
function objectEnd(raw, i) {
  let depth = 0, inStr = false;
  for (let j = i; j < raw.length; j++) {
    const c = raw[j];
    if (inStr) { if (c === "\\") j++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") { depth--; if (depth === 0) return j + 1; }
  }
  return -1;
}

/* Cut each perishable product object out of the raw text, with one of
   its separating commas: every other byte of the file stays as it was
   (the catalogues use two different JSON spacings, and floats like 15.0
   would not survive a re-serialise). Returns { text, removed }. */
export function scrubText(raw) {
  const titles = perishableTitles(JSON.parse(raw));
  const removed = [];
  let text = raw;
  for (const t of titles) {
    for (const key of ["name", "title"]) {
      const needle = new RegExp('\\{\\s*"' + key + '"\\s*:\\s*' + JSON.stringify(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      let m;
      while ((m = needle.exec(text))) {
        const start = m.index, end = objectEnd(text, start);
        if (end < 0) break;
        let a = start, b = end;
        const after = /^\s*,\s*/.exec(text.slice(b));
        if (after) b += after[0].length;
        else { const before = /,\s*$/.exec(text.slice(0, a)); if (before) a -= before[0].length; }
        text = text.slice(0, a) + text.slice(b);
        removed.push(t);
        needle.lastIndex = a;
      }
    }
  }
  JSON.parse(text);
  const missed = [...titles].filter((t) => !removed.includes(t));
  return { text, removed, missed };
}

/** The committed catalogue files a builder or a page reads. */
export function catalogueFiles(root = ROOT) {
  return readdirSync(root).filter((f) => /(catalog|cache|feed)[^/]*\.json$/.test(f));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let total = 0, unresolved = 0;
  for (const f of catalogueFiles()) {
    const raw = readFileSync(ROOT + f, "utf8");
    try { JSON.parse(raw); } catch { continue; }
    const { text, removed, missed } = scrubText(raw);
    /* A generated feed (ofertas-feed.json) keys its rows differently:
       rebuild it from the cleaned catalogues instead. */
    if (missed.length) { console.log(`${f}: ${missed.length} found but not cut (rebuild it from its sources) -- ${missed.join(" | ")}`); unresolved += missed.length; }
    if (!removed.length) continue;
    total += removed.length;
    console.log(`${f}: ${removed.length} removed -- ${removed.join(" | ")}`);
    if (!dry) writeFileSync(ROOT + f, text);
  }
  console.log(`${total} perishable rows ${dry ? "found" : "removed"}, ${unresolved} left for a rebuild`);
  if (unresolved && !dry) process.exitCode = 2;
}

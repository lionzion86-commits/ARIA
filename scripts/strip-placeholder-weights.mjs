#!/usr/bin/env node
/* ============================================================
   PLACEHOLDER WEIGHTS OUT OF A CATALOGUE (2026-10-08).

   A catalogue weight -- even one marked weightEstimated -- beats the
   site's own title-based estimate (catalogWeightDetail in index.html,
   catalogWeightKg in netlify/functions/_weight-resolve.js). That is
   right for a real per-product figure and wrong for a flat default:
   Kohl's carried 0.5 / 0.55 kg on 1,898 products, so coffee tables,
   desks and air fryers quoted freight as a 0.55 kg parcel.

   This removes ONLY estimated weights equal to a value you name, from
   the catalogue you name, so the site's estimator (with Lucifer's
   keywords folded in) prices those products instead. Real weights
   (weightEstimated === false) are never touched.

   Dry run by default; --write saves. The file keeps its own format
   (the catalogues are one-line JSON from Python's json.dumps).

     node scripts/strip-placeholder-weights.mjs kohls-catalog.json 0.5 0.55
     node scripts/strip-placeholder-weights.mjs kohls-catalog.json 0.5 0.55 --write
   ============================================================ */
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const write = args.includes("--write");
const [file, ...vals] = args.filter(a => a !== "--write");
const placeholders = new Set(vals.map(Number).filter(v => v > 0));
if (!file || !placeholders.size) {
  console.error("usage: strip-placeholder-weights.mjs <catalog.json> <kg> [<kg> ...] [--write]");
  process.exit(1);
}

/* Python json.dumps style (", " and ": ", one line), the catalogues'
   own format, so an untouched file serializes back byte for byte. */
function ser(v) {
  if (Array.isArray(v)) return "[" + v.map(ser).join(", ") + "]";
  if (v && typeof v === "object") return "{" + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ": " + ser(x)).join(", ") + "}";
  return JSON.stringify(v);
}
const raw = readFileSync(file, "utf8");
const data = JSON.parse(raw);
const faithful = ser(data) === raw;
let removed = 0, kept = 0;
(function walk(o) {
  if (Array.isArray(o)) { o.forEach(walk); return; }
  if (!o || typeof o !== "object") return;
  if ("weightKg" in o) {
    if (o.weightEstimated !== false && placeholders.has(Number(o.weightKg))) {
      delete o.weightKg; delete o.weightEstimated; removed++;
    } else kept++;
  }
  Object.values(o).forEach(walk);
})(data);

console.log(`${file}: ${removed} placeholder weights ${write ? "removed" : "would be removed"}, ${kept} other weights kept`);
if (!faithful) console.log("  note: this file does not re-serialize byte for byte (e.g. 12.0 written as 12); values are unchanged");
if (write) writeFileSync(file, ser(data));

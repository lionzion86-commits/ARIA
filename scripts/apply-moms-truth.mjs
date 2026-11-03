#!/usr/bin/env node
/* ============================================================
   RETYPE THE MOMS CATALOGUE BY WHAT EACH PRODUCT IS (#443, Danny's
   ruling on the «Alimentación» rail). scripts/lib/moms-truth.js reads
   each record's own title; this writes the type it names onto the record
   (both copies: the store's department list and its brand list), and
   nothing else moves -- the file is re-serialised the way it was written
   (JSON.stringify, no spacing), so a second run changes no byte.

   The non-products (parts, refills, cleaning consumables, books, plans)
   are not retyped here: /not-sold.js names them and
   scripts/purge-not-sold.mjs cuts them. Then the generator chain runs.

     node scripts/apply-moms-truth.mjs [--dry-run]
   ============================================================ */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { momsTypeOf } from "./lib/moms-truth.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const MOMS_FILE = "moms-catalog.json";

/** Every record of the moms catalogue: { retailer, section, item }. */
export function momsRecords(cat) {
  const out = [];
  for (const [retailer, r] of Object.entries(cat.retailers || {})) {
    for (const section of ["departments", "brands"]) {
      for (const d of Object.values(r[section] || {})) for (const item of d.items || []) out.push({ retailer, section, item });
    }
  }
  return out;
}

/** Retype a parsed catalogue in place; returns the moves { from, to, retailer, title }. */
export function retype(cat) {
  const moves = [];
  for (const { retailer, section, item } of momsRecords(cat)) {
    const to = momsTypeOf(item);
    if (to && to !== item.type) {
      if (section === "departments") moves.push({ from: item.type, to, retailer, title: item.name });
      item.type = to;
    }
  }
  return moves;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dry = process.argv.includes("--dry-run");
  const path = join(ROOT, MOMS_FILE);
  const raw = readFileSync(path, "utf8");
  const cat = JSON.parse(raw);
  if (JSON.stringify(cat) !== raw) throw new Error(MOMS_FILE + " is not in its compact form; refusing to rewrite it");
  const moves = retype(cat);
  const by = {};
  for (const m of moves) by[m.from + " -> " + m.to] = (by[m.from + " -> " + m.to] || 0) + 1;
  if (!dry && moves.length) writeFileSync(path, JSON.stringify(cat));
  console.log(`${moves.length} records ${dry ? "would move" : "retyped"}`, JSON.stringify(by, null, 1));
}

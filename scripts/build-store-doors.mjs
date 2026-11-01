#!/usr/bin/env node
/* ============================================================
   STORE DOORS -> search.html (STORE_PAGES, STORE_FULL_NAMES)
   (#443 c.6564206674, Danny 2026-11-01: "Every store, go get every
   store fixed.")

   A store's name opens its storefront only if search.html knows the
   store has one. That list was hand-copied and drifted twice (Sephora,
   then Calzedonia and Intimissimi). It is now computed from the
   storefront set itself:

     a key of tienda.html's storefront registry (var STORES)
     + assets/tienda/<key>/index.json with count > 0
     - the stores on /off-sale.js

   STORE_FULL_NAMES maps each such store's full name, as tienda.html and
   scripts/lib/retailers.js label it, to its key ("Advance Auto Parts"
   -> advanceauto). Both lines in search.html are rewritten in place.

     node scripts/build-store-doors.mjs           write search.html
     node scripts/build-store-doors.mjs --check   exit 1 if stale

   Run it after any storefront lands or leaves (build-store-slices).
   ============================================================ */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { RETAILERS } from "./lib/retailers.js";
import { isOffSaleRetailer } from "./lib/off-sale.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* The same key search.html's nameKey() makes from what a shopper types. */
export function nameKey(q) {
  return String(q || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

export function storeDoors(root = ROOT) {
  const html = readFileSync(join(root, "tienda.html"), "utf8");
  const registry = JSON.parse(/\nvar STORES = (\{.*\});\r?\n/.exec(html)[1]);
  const keys = [];
  const empty = [];
  for (const key of Object.keys(registry)) {
    if (isOffSaleRetailer(key)) continue;
    const idx = join(root, "assets/tienda", key, "index.json");
    let count = 0;
    if (existsSync(idx)) {
      try { count = Number(JSON.parse(readFileSync(idx, "utf8")).count) || 0; } catch { count = 0; }
    }
    if (count > 0) keys.push(key); else empty.push(key);
  }
  keys.sort();
  const full = {};
  for (const key of keys) {
    const labels = [registry[key] && registry[key].label, RETAILERS[key] && RETAILERS[key].label].filter(Boolean);
    for (const label of labels) {
      for (const n of [nameKey(label), nameKey(String(label).replace(/&/g, " "))]) {
        if (n && n !== key && !keys.includes(n) && !(n in full)) full[n] = key;
      }
    }
  }
  const fullSorted = Object.fromEntries(Object.keys(full).sort().map((k) => [k, full[k]]));
  return { keys, empty: empty.sort(), full: fullSorted };
}

export function writeDoors(src, { keys, full }) {
  const pages = 'var STORE_PAGES = " ' + keys.join(" ") + ' ";';
  const names = "var STORE_FULL_NAMES = " + JSON.stringify(full) + ";";
  let out = src.replace(/var STORE_PAGES = "[^"]*";/, pages);
  out = out.replace(/var STORE_FULL_NAMES = \{[^\n]*\};/, names);
  return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const doors = storeDoors();
  const file = join(ROOT, "search.html");
  const src = readFileSync(file, "utf8");
  const out = writeDoors(src, doors);
  if (process.argv.includes("--check")) {
    if (out !== src) { console.error("search.html store doors are stale: run node scripts/build-store-doors.mjs"); process.exit(1); }
    console.log(`store doors current: ${doors.keys.length} stores`);
  } else {
    writeFileSync(file, out);
    console.log(`search.html: ${doors.keys.length} store doors, ${Object.keys(doors.full).length} full names; no products (no door): ${doors.empty.join(", ") || "none"}`);
  }
}

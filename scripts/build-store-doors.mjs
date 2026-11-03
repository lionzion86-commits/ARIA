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
   -> advanceauto). Both lines in search.html are rewritten in place,
   and marca.html's STORE_PAGES (a brand page's store carousel ends at
   that store's page) is the same list -- an empty storefront gets no
   door anywhere (Danny: no image, no card).

     node scripts/build-store-doors.mjs           write search.html
     node scripts/build-store-doors.mjs --check   exit 1 if stale

   Run it after any storefront lands or leaves (build-store-slices).

   THE ALL-STORES PAGE (#443 c.6585655315 P4). tiendas.html's grid was
   hand-kept too: 18 working storefronts (Montce, FARM Rio, ViX, RevZilla,
   TNS, Dennis Kirk... 14,047 products) and Foot Locker, SSENSE and
   Victoria's Secret were missing from it, and empty stores had tiles
   that opened onto nothing. The grid and its "N tiendas activas" line
   are now this same set, rewritten in place (Aria Perfumes first, then
   A-Z by name); a registry store waiting for its catalogue
   (pendingCatalog: DSW) keeps its hidden tile, revealed by the page
   once its storefront has products.
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
  const pending = [];
  for (const key of Object.keys(registry)) {
    if (isOffSaleRetailer(key)) continue;
    const idx = join(root, "assets/tienda", key, "index.json");
    let count = 0;
    if (existsSync(idx)) {
      try { count = Number(JSON.parse(readFileSync(idx, "utf8")).count) || 0; } catch { count = 0; }
    }
    if (count > 0) keys.push(key); else { empty.push(key); if (registry[key] && registry[key].pendingCatalog) pending.push(key); }
  }
  keys.sort();
  const labels = {};
  for (const key of [...keys, ...pending]) labels[key] = (registry[key] && registry[key].label) || (RETAILERS[key] && RETAILERS[key].label) || key;
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
  return { keys, empty: empty.sort(), full: fullSorted, labels, pending: pending.sort() };
}

export function writeDoors(src, { keys, full }) {
  const pages = 'var STORE_PAGES = " ' + keys.join(" ") + ' ";';
  const names = "var STORE_FULL_NAMES = " + JSON.stringify(full) + ";";
  let out = src.replace(/var STORE_PAGES = "[^"]*";/, pages);
  out = out.replace(/var STORE_FULL_NAMES = \{[^\n]*\};/, names);
  return out;
}

/* marca.html: the same door list, STORE_PAGES only. */
export function writeStorePages(src, { keys }) {
  if (!/var STORE_PAGES = "[^"]*";/.test(src)) throw new Error("no STORE_PAGES to rewrite");
  return src.replace(/var STORE_PAGES = "[^"]*";/, 'var STORE_PAGES = " ' + keys.join(" ") + ' ";');
}

/* tiendas.html: the grid between <div class="store-grid"> and its count line. */
export const HOUSE_STORE = "ariaperfumes";
const escHtml = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sortName = (t) => String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export function directoryOrder({ keys, labels }) {
  return keys.slice().sort((a, b) => ((b === HOUSE_STORE) - (a === HOUSE_STORE)) || sortName(labels[a]).localeCompare(sortName(labels[b]), "es") || a.localeCompare(b));
}
export function writeDirectory(src, doors) {
  const tiles = directoryOrder(doors).map((k) => `<a class="store-card" href="tienda.html?tienda=${k}">${escHtml(doors.labels[k])}</a>`);
  for (const k of doors.pending) tiles.push(`<a class="store-card" href="tienda.html?tienda=${k}" data-pending-catalog="${k}" hidden>${escHtml(doors.labels[k])}</a>`);
  const rx = /<div class="store-grid">\n[\s\S]*?\n<\/div>\n<p id="storeCountLine"([^>]*)>\d+ tiendas activas<\/p>/;
  if (!rx.test(src)) throw new Error("tiendas.html: no store grid to rewrite");
  return src.replace(rx, (_, attrs) => `<div class="store-grid">\n${tiles.join("\n")}\n</div>\n<p id="storeCountLine"${attrs}>${doors.keys.length} tiendas activas</p>`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const doors = storeDoors();
  const targets = [["search.html", writeDoors], ["marca.html", writeStorePages], ["tiendas.html", writeDirectory]];
  let stale = false;
  for (const [name, write] of targets) {
    const file = join(ROOT, name);
    const src = readFileSync(file, "utf8");
    const out = write(src, doors);
    if (process.argv.includes("--check")) {
      if (out !== src) { console.error(`${name} store doors are stale: run node scripts/build-store-doors.mjs`); stale = true; }
    } else writeFileSync(file, out);
  }
  if (stale) process.exit(1);
  if (process.argv.includes("--check")) console.log(`store doors current: ${doors.keys.length} stores`);
  else console.log(`search.html + marca.html + tiendas.html: ${doors.keys.length} store doors, ${Object.keys(doors.full).length} full names; no products (no door): ${doors.empty.join(", ") || "none"}`);
}

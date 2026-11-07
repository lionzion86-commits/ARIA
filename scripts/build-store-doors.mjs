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

   THE ONE STORE COUNT (#443 c.6693598650 s.5, the full-page audit). The
   homepage said «comparando 4 tiendas», «Ocho tiendas, todas reales» and
   showed a 22-tile directory on the same page: three numbers, none
   computed. Every store-count claim is now this set's size, the stores
   with products for sale, written here and nowhere else:
     tiendas.html     «N tiendas activas» (above)
     index.html       every [data-store-count] slot (Tiendas heading, the
                      results bar), as text a page without scripts reads;
                      the bundle reads the number back from the slot
                      (storeCountTruth) for Cómo funciona's «+N» chip
                      and the Tiendas grid's «Y N tiendas más» link
   scripts/build-home-shelves.mjs (the homepage data build) runs the same
   writers, so a homepage rebuild can never leave the count behind.
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

/* ---------- the one store count ---------- */
/* The way the page writes a small count (the bundle's spanishCount):
   a word up to twenty, the digits past it. */
const SPANISH_NUMBERS = ["Cero", "Una", "Dos", "Tres", "Cuatro", "Cinco", "Seis", "Siete", "Ocho", "Nueve", "Diez",
  "Once", "Doce", "Trece", "Catorce", "Quince", "Dieciséis", "Diecisiete", "Dieciocho", "Diecinueve", "Veinte"];
export function spanishCount(n) { return SPANISH_NUMBERS[n] || String(n); }
export const STORE_COUNT_SLOT_RX = /<span data-store-count(?:="\d*")?([^>]*)>[^<]*<\/span>/g;
/** index.html: every count slot holds the number, as data and as text. */
export function writeHomeStoreCount(src, { keys }) {
  const n = keys.length;
  if (!STORE_COUNT_SLOT_RX.test(src)) throw new Error("index.html: no [data-store-count] slot to rewrite");
  STORE_COUNT_SLOT_RX.lastIndex = 0;
  return src.replace(STORE_COUNT_SLOT_RX, (_, rest) => {
    /* The results bar shows digits («comparando 120 tiendas»); a heading
       slot spells a small count («Doce tiendas, todas reales»). */
    const text = /data-store-count-digits/.test(rest) ? String(n) : spanishCount(n);
    return `<span data-store-count="${n}"${rest}>${text}</span>`;
  });
}
/** Every file the count lives in, as { path: [src, out] } (src null when absent). */
export function storeCountFiles(root = ROOT, doors = storeDoors(root)) {
  const out = {};
  const page = join(root, "index.html");
  const src = readFileSync(page, "utf8");
  out["index.html"] = [src, writeHomeStoreCount(src, doors)];
  return out;
}
/** Write (or, with check, only compare) the count's files. Returns the stale paths. */
export function syncStoreCount(root = ROOT, { check = false, doors = storeDoors(root) } = {}) {
  const stale = [];
  for (const [name, [src, out]] of Object.entries(storeCountFiles(root, doors))) {
    if (src === out) continue;
    stale.push(name);
    if (!check) writeFileSync(join(root, name), out);
  }
  return { count: doors.keys.length, stale };
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
  const counted = syncStoreCount(ROOT, { check: process.argv.includes("--check"), doors });
  if (process.argv.includes("--check") && counted.stale.length) {
    console.error(`${counted.stale.join(" + ")}: the store count is stale: run node scripts/build-store-doors.mjs`);
    stale = true;
  }
  if (stale) process.exit(1);
  if (process.argv.includes("--check")) console.log(`store doors current: ${doors.keys.length} stores`);
  else console.log(`search.html + marca.html + tiendas.html + index.html: ${doors.keys.length} store doors, ${Object.keys(doors.full).length} full names; no products (no door): ${doors.empty.join(", ") || "none"}`);
}

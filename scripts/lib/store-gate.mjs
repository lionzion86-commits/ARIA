/* ============================================================
   THE STORE GATE: A STORE WITH ZERO PRODUCTS NEVER SHOWS
   (#443 c.6643334129, Marc Jacobs).

   A store registered ahead of its catalogue (Marc Jacobs: the registry,
   the store page, the shipping rule, the bundle's Tiendas tile are all
   wired; the products arrive later as Lucifer's data drop) must stay out
   of the Tiendas carousel, the menus and the search until its catalogue
   has products. The gate is /off-sale.js's AWAITING_CATALOG line: every
   page, builder, function and the app bundle already honour
   isOffSaleRetailer(), so a gated store with nothing in it shows
   nowhere, and the day the drop lands the line empties and every
   surface opens -- no flag to flip by hand (the DSW lesson).

   EVERY STORE, NOT ONE (#443 c.6693598650 s.5, the full-page audit: an
   empty catalogue must never be presented as a store). The gate reads
   every storefront in tienda.html's registry (var STORES, each with its
   catalogue `files`) plus GATED_STORES (Marc Jacobs, registered ahead of
   its file). A store is AWAITING while its files hold no product of its
   own: no record with a name and a price. The line is computed from those
   files and rewritten by syncStoreGate(), which
   scripts/ingest-marcjacobs.mjs (after writing the catalogue) and
   scripts/build-store-slices.mjs (first thing) both run; every other
   builder reads the rewritten line. scripts/test/marcjacobs-store-tests.mjs
   fails when the line and the catalogues disagree.
   ============================================================ */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { OFF_SALE_RETAILERS } from "./off-sale.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const GATED_STORES = { marcjacobs: "marcjacobs-catalog.json" };
/* The off-sale list proper (not the gate line this module writes). */
const OFF_SALE = new Set(OFF_SALE_RETAILERS);
export const GATE_FILE = "off-sale.js";
const LINE_RX = /var AWAITING_CATALOG = \[[^\]\n]*\];/;

/* A record a store could sell: a name and a price, in the fields the
   catalogues spell them (Foot Locker's productName, Old Navy's
   effectivePrice). The storefront build applies the full page rules;
   this only tells an empty catalogue from a stocked one. */
const NAME_FIELDS = ["name", "title", "productName"];
const PRICE_FIELDS = ["price", "effectivePrice", "salePrice", "finalPrice", "currentPrice", "regularPrice"];
export function isProductRecord(it) {
  if (!it || typeof it !== "object") return false;
  if (!NAME_FIELDS.some((f) => typeof it[f] === "string" && it[f].trim())) return false;
  return PRICE_FIELDS.some((f) => Number(it[f]) > 0);
}

/* A shared file (moms-catalog.json: seventeen stores) is parsed once per count, not once per store. */
function readEnvelope(root, file, cache = null) {
  const p = join(root, String(file).replace(/^\//, ""));
  if (cache && cache.has(p)) return cache.get(p);
  let env = null;
  if (existsSync(p)) { try { env = JSON.parse(readFileSync(p, "utf8")); } catch { env = null; } }
  if (cache) cache.set(p, env);
  return env;
}

/** Products in a catalogue envelope ({ retailers: { k: { departments } } }), 0 when missing or broken.
    With `store`, only that store's own products (a shared file holds several stores). */
export function catalogueCount(root, file, store = null, cache = null) {
  const env = readEnvelope(root, file, cache);
  let n = 0;
  for (const [rk, r] of Object.entries((env && env.retailers) || {})) {
    for (const d of Object.values((r && r.departments) || {})) {
      const items = Array.isArray(d) ? d : (d && d.items) || [];
      for (const it of items) {
        if (!isProductRecord(it)) continue;
        if (store && String(it.retailer || rk).toLowerCase() !== store && rk !== store) continue;
        n++;
      }
    }
  }
  return n;
}

/** Every store the gate reads: { key: [files] }. tienda.html's registry
    (when the root has one) and GATED_STORES; the stores on the off-sale
    list proper are hidden already and are not read. */
export function gatedStores(root = ROOT, base = GATED_STORES) {
  const out = {};
  for (const [k, f] of Object.entries(base)) out[k] = [].concat(f);
  const page = join(root, "tienda.html");
  if (existsSync(page)) {
    const m = /\nvar STORES = (\{.*\});\r?\n/.exec(readFileSync(page, "utf8"));
    const registry = m ? JSON.parse(m[1]) : {};
    for (const [k, meta] of Object.entries(registry)) {
      if (OFF_SALE.has(k)) continue;
      const files = (meta && Array.isArray(meta.files) ? meta.files : []).map((f) => String(f).replace(/^\//, ""));
      out[k] = [...new Set([...(out[k] || []), ...files])];
    }
  }
  return out;
}

/** Each gated store's own product count. */
export function storeCounts(root = ROOT, gated = null) {
  const stores = gated || gatedStores(root);
  const cache = new Map();
  return Object.fromEntries(Object.entries(stores).map(([k, files]) =>
    [k, [].concat(files).reduce((n, f) => n + catalogueCount(root, f, k, cache), 0)]));
}

/** The gated stores whose catalogue has no products, sorted. */
export function awaitingStores(root = ROOT, gated = null) {
  const counts = storeCounts(root, gated);
  return Object.keys(counts).filter((k) => counts[k] === 0).sort();
}

/** The keys the committed gate line holds now. */
export function gateLine(root = ROOT) {
  const m = LINE_RX.exec(readFileSync(join(root, GATE_FILE), "utf8"));
  if (!m) throw new Error(GATE_FILE + ": no AWAITING_CATALOG line");
  return JSON.parse(m[0].replace(/^var AWAITING_CATALOG = /, "").replace(/;$/, "").replace(/'/g, '"'));
}

/** Rewrite the gate line from the catalogues. { awaiting, changed, counts }. */
export function syncStoreGate(root = ROOT, { check = false, gated = null } = {}) {
  const file = join(root, GATE_FILE);
  const src = readFileSync(file, "utf8");
  if (!LINE_RX.test(src)) throw new Error(GATE_FILE + ": no AWAITING_CATALOG line");
  const counts = storeCounts(root, gated);
  const awaiting = Object.keys(counts).filter((k) => counts[k] === 0).sort();
  const line = "var AWAITING_CATALOG = [" + awaiting.map((k) => "'" + k + "'").join(", ") + "];";
  const out = src.replace(LINE_RX, line);
  const changed = out !== src;
  if (changed && !check) writeFileSync(file, out);
  return { awaiting, changed, counts };
}

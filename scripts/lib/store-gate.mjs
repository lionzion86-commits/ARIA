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

   GATED_STORES: each gated store's catalogue file. The line is computed
   from those files (a store is AWAITING while its file is missing or has
   no product) and rewritten by syncStoreGate(), which
   scripts/ingest-marcjacobs.mjs (after writing the catalogue) and
   scripts/build-store-slices.mjs (first thing) both run; every other
   builder reads the rewritten line. scripts/test/marcjacobs-store-tests.mjs
   fails when the line and the catalogues disagree.
   ============================================================ */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const GATED_STORES = { marcjacobs: "marcjacobs-catalog.json" };
export const GATE_FILE = "off-sale.js";
const LINE_RX = /var AWAITING_CATALOG = \[[^\]\n]*\];/;

/** Products in a catalogue envelope ({ retailers: { k: { departments } } }), 0 when missing or broken. */
export function catalogueCount(root, file) {
  const p = join(root, file);
  if (!existsSync(p)) return 0;
  let env;
  try { env = JSON.parse(readFileSync(p, "utf8")); } catch { return 0; }
  let n = 0;
  for (const r of Object.values((env && env.retailers) || {})) {
    for (const d of Object.values((r && r.departments) || {})) {
      const items = Array.isArray(d) ? d : (d && d.items) || [];
      n += items.filter((it) => it && (it.name || it.title) && Number(it.price) > 0).length;
    }
  }
  return n;
}

/** The gated stores whose catalogue has no products, sorted. */
export function awaitingStores(root = ROOT, gated = GATED_STORES) {
  return Object.keys(gated).filter((k) => catalogueCount(root, gated[k]) === 0).sort();
}

/** The keys the committed gate line holds now. */
export function gateLine(root = ROOT) {
  const m = LINE_RX.exec(readFileSync(join(root, GATE_FILE), "utf8"));
  if (!m) throw new Error(GATE_FILE + ": no AWAITING_CATALOG line");
  return JSON.parse(m[0].replace(/^var AWAITING_CATALOG = /, "").replace(/;$/, "").replace(/'/g, '"'));
}

/** Rewrite the gate line from the catalogues. { awaiting, changed, counts }. */
export function syncStoreGate(root = ROOT, { check = false, gated = GATED_STORES } = {}) {
  const file = join(root, GATE_FILE);
  const src = readFileSync(file, "utf8");
  if (!LINE_RX.test(src)) throw new Error(GATE_FILE + ": no AWAITING_CATALOG line");
  const awaiting = awaitingStores(root, gated);
  const line = "var AWAITING_CATALOG = [" + awaiting.map((k) => "'" + k + "'").join(", ") + "];";
  const out = src.replace(LINE_RX, line);
  const changed = out !== src;
  if (changed && !check) writeFileSync(file, out);
  const counts = Object.fromEntries(Object.keys(gated).map((k) => [k, catalogueCount(root, gated[k])]));
  return { awaiting, changed, counts };
}

#!/usr/bin/env node
/* ============================================================
   THE SHADE-PULL WORKLIST (Danny: "every single makeup has to have a
   color dropdown; selling makeup with no colors is ripping people off").

   Every product the shade gate (/shade-gate.js) keeps out of the cart --
   sold in shades, but no shade list reached us -- one JSON per store,
   for the data lane to pull every missing shade list at once:

     data/shade-pull-worklist-<date>/<store>.json
       [{ store, title, brand, url, ariaId, ariaUrl, category }]
         url       the retailer's product page, from the catalogue
         ariaId    the listing's id on Aria (the product page's ?v=)
         ariaUrl   the Aria product page that shows «Tonos en camino»
         category  what made it a shade product: the noun in its title,
                   the store's "- N Colors", or the store's makeup aisle

   It reads what the product page reads: the committed catalogues and the
   built shards (assets/pdp, scripts/build-pdp-slices.mjs). A product is on
   the list when its record is a shade product (`sk`) and carries no shade
   (no family, no shade of its own) -- exactly the page's gate.

   RUN (after node scripts/build-pdp-slices.mjs):
     node scripts/build-shade-worklist.mjs [--date 2026-11-02]
   The README beside the lists says what the pull must return and where
   to drop it so scripts/ingest-variant-pulls.mjs picks it up.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { liftPage, sourceFiles } from "./build-pdp-slices.mjs";
import { variantIdOf } from "./lib/variants.mjs";
import "../shade-gate.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const G = globalThis.AriaShadeGate;
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };

export function buildWorklist(root = ROOT) {
  const P = liftPage(root);
  const shards = new Map();
  const shard = (key) => {
    const s = P.pdpShard(key);
    if (!shards.has(s)) shards.set(s, JSON.parse(readFileSync(join(root, "assets/pdp/p", s + ".json"), "utf8")));
    return shards.get(s)[key] || null;
  };
  const byStore = new Map(), seen = new Set();
  for (const f of sourceFiles(P)) {
    const p = join(root, f.slice(1));
    if (!existsSync(p)) continue;
    const raw = JSON.parse(readFileSync(p, "utf8"));
    const types = new Map();
    const st = [raw];
    while (st.length) {
      const n = st.pop();
      if (Array.isArray(n)) { for (const x of n) if (x && typeof x === "object") st.push(x); continue; }
      if (!n || typeof n !== "object") continue;
      if (typeof n.name === "string" && typeof n.type === "string" && n.type && !types.has(n.name)) types.set(n.name, n.type);
      for (const k in n) if (n[k] && typeof n[k] === "object") st.push(n[k]);
    }
    for (const it of P.extractItems(raw)) {
      const store = String(it.retailer || "").toLowerCase();
      const k = store + "|" + it.name;
      if (seen.has(k)) continue;
      const item = { name: it.name, retailer: store, dept: it.dept, type: types.get(it.name) || "" };
      if (!G.kindOf(item)) continue;
      /* The record the store page's card opens (producto.html pickRecord). */
      const rec = P.pickRecord(shard(P.norm(it.name)), (P.STORE_FILES[store] || []).concat(P.CATALOG_FILES), "");
      if (!rec || !rec.sk || String(rec.c || "").trim()) continue;
      seen.add(k);
      if (!byStore.has(store)) byStore.set(store, []);
      byStore.get(store).push({
        store, title: it.name, brand: it.brand || "", url: String(rec.url || it.url || ""),
        ariaId: rec.v || variantIdOf(it.url, store + "|" + it.name + "|" + it.image),
        ariaUrl: "/producto.html?producto=" + encodeURIComponent(it.name) + "&tienda=" + encodeURIComponent(store),
        category: G.reasonOf(item),
      });
    }
  }
  return byStore;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const date = arg("--date") || "2026-11-02";
  const dir = join(ROOT, "data", "shade-pull-worklist-" + date);
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (/\.json$/.test(f)) unlinkSync(join(dir, f));
  const byStore = buildWorklist();
  const counts = {};
  for (const [store, list] of [...byStore].sort()) {
    list.sort((a, b) => a.title.localeCompare(b.title));
    writeFileSync(join(dir, store + ".json"), JSON.stringify(list, null, 1) + "\n");
    counts[store] = list.length;
  }
  console.log(JSON.stringify({ dir: "data/shade-pull-worklist-" + date, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) }, null, 1));
}

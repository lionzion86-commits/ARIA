#!/usr/bin/env node
/* ============================================================
   assets/search/catalog-index.json — SEARCH'S CATALOGUE, PRECOMPUTED.

   WHY (2026-10-08 search brief: "150k+ products, must feel instant on
   mobile; precompute at build time if needed"). search.html fetched
   64 catalogue files -- 218MB of JSON, 28MB gzipped -- on every visit,
   and parsed all of it on the phone before the first search could
   run. Search needs ten fields of each product, not the whole record (the
   card links to producto.html by name and store, so not even the URL),
   so they are collected here once: one file, ~43MB raw / ~7MB gzipped,
   with each product's category already computed.

   Built from exactly what search.html used to load: its CATALOG_FILES
   list, then the sale feed for deals no catalogue carries. Products
   with no image are left out (no "Sin imagen" cards), and one product
   listed twice by the same store (two department buckets, same URL) is
   one row. Product data is not changed -- this file is derived from it.

   REGENERATE after any catalogue change:
     node scripts/build-search-index.mjs
   scripts/test/search-brief-tests.mjs fails when the index has fallen
   behind the catalogues (a removed product would still be searchable).
   ============================================================ */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const INDEX_PATH = "assets/search/catalog-index.json";
export const INDEX_FIELDS = ["title", "brand", "price", "originalPrice", "onSale", "department", "retailer", "finalPrice", "image", "cat"];

/* search.html's own file list, so the two can never disagree. */
export function catalogFiles() {
  const page = readFileSync(ROOT + "search.html", "utf8");
  return JSON.parse("[" + /var CATALOG_FILES = \[([\s\S]*?)\];/.exec(page)[1] + "]").map(f => f.slice(1));
}

function loadEngine() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(ROOT + "search-engine.js", "utf8"), sandbox, { filename: "search-engine.js" });
  return sandbox.window.AriaSearch;
}

function normalize(it, retailer, department, finalPrice) {
  if (!it || typeof it !== "object") return null;
  const title = it.name || it.title || "";
  const price = Number(it.price);
  if (!title || !(price > 0)) return null;
  let image = it.thumbnail || it.image || "";
  if (!image && Array.isArray(it.images) && it.images[0]) image = it.images[0];
  const orig = Number(it.originalPrice || it.wasPrice || it.listPrice);
  return {
    title: String(title), brand: String(it.brand || ""), price,
    originalPrice: orig > price ? orig : 0, onSale: it.onSale === true,
    department: department ? String(department) : "", retailer: String(it.retailer || retailer || ""),
    finalPrice: !!finalPrice, image: typeof image === "string" ? image : "", url: String(it.url || it.link || ""),
  };
}

export function buildIndex() {
  const S = loadEngine();
  const products = [];
  const seen = new Set();
  for (const f of catalogFiles()) {
    if (!existsSync(ROOT + f)) continue;
    let data;
    try { data = JSON.parse(readFileSync(ROOT + f, "utf8")); } catch { continue; }
    for (const [rkey, r] of Object.entries((data && data.retailers) || {})) {
      for (const section of ["departments", "brands"]) {
        for (const [skey, bucket] of Object.entries((r && r[section]) || {})) {
          const arr = Array.isArray(bucket) ? bucket : (bucket && bucket.items) || [];
          for (const it of arr) {
            const n = normalize(it, rkey, section === "departments" ? skey : "", false);
            if (!n) continue;
            const k = (n.retailer + "|" + (n.url || n.title)).toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            products.push(n);
          }
        }
      }
    }
  }
  /* The sale feed last: only deals no catalogue carries (prices final). */
  const have = new Set(products.map(p => (p.retailer + "|" + p.title).toLowerCase()));
  for (const it of JSON.parse(readFileSync(ROOT + "ofertas-feed.json", "utf8")).items || []) {
    const n = normalize(it, it && it.retailer, "", true);
    if (!n) continue;
    const k = (n.retailer + "|" + n.title).toLowerCase();
    if (have.has(k)) continue;
    have.add(k);
    products.push(n);
  }
  const rows = [];
  for (const p of products) {
    if (!p.image) continue;
    const cat = S.catalogItemCategory({ title: p.title, name: p.title, brand: p.brand, retailer: p.retailer,
      departments: p.department ? [p.department] : [] }) || "";
    rows.push([p.title, p.brand, p.price, p.originalPrice, p.onSale ? 1 : 0, p.department, p.retailer,
      p.finalPrice ? 1 : 0, p.image, cat]);
  }
  return { v: 1, generatedAt: null, fields: INDEX_FIELDS, count: rows.length, rows };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = buildIndex();
  index.generatedAt = new Date().toISOString();
  mkdirSync(ROOT + "assets/search", { recursive: true });
  const out = JSON.stringify(index);
  writeFileSync(ROOT + INDEX_PATH, out);
  console.log(`${INDEX_PATH}: ${index.count} products, ${(out.length / 1e6).toFixed(1)}MB`);
}

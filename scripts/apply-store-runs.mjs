#!/usr/bin/env node
/* ============================================================
   EVERY SHOE STORE'S WHOLE SIZE RUN (#443 c.6633182280; the SNIPES
   pass did it first, #654).

   A store whose own data marks sizes sold out hands us its whole run:
   the catalogue's shoes sell only the sizes the store has in stock
   (`sizes`) and show the rest marked agotada (`sizesOut`), the rule in
   scripts/lib/store-pull-normalize.js (applyStoreRuns / setSizeRun).

   The data: the stores' own Shopify products.json feeds, pulled
   2026-11-01 (data/colorways-2026-11-01/dataset-<store>.json; every
   variant with its `available` flag). Any dataset there in that shape
   whose store has a catalogue is read; the rest (Kohl's, Zumiez: no
   sizes in their pulls) are skipped and said so.

     node scripts/apply-store-runs.mjs [--src data/colorways-2026-11-01] [--dry]

   Footwear only (the Zapatos door, scripts/lib/footwear.js
   isShoeForDept). Re-running gives the same catalogue. Writes
   reports/store-runs-2026-11-01.json: per store, what changed, and the
   shoes the store has none of our sizes for (left as they were).
   Then, in order:
     node scripts/build-store-slices.mjs
     node scripts/build-ofertas-feed.mjs && node scripts/build-ofertas-slices.mjs && node scripts/build-ofertas-lite.mjs
     node scripts/build-search-index.mjs && node scripts/build-price-index.mjs
     node scripts/build-pdp-slices.mjs && node scripts/build-department-slices.mjs
     node scripts/build-vuelve-pronto.mjs
   ============================================================ */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyStoreRuns, shopifyRunIndex } from "./lib/store-pull-normalize.js";
import { isShoeForDept } from "./lib/footwear.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const SRC = resolve(ROOT, arg("--src") || "data/colorways-2026-11-01");
const DRY = process.argv.includes("--dry");
const NOTE = "; footwear size runs (in stock / sold out) from the store's own products.json, 2026-11-01 (apply-store-runs)";

/* Every item a catalogue holds, wherever it sits (departments, brands). */
function itemsOf(cat) {
  const out = [], seen = new Set();
  for (const r of Object.values(cat.retailers || {})) for (const sec of ["departments", "brands"]) {
    for (const b of Object.values((r && r[sec]) || {})) {
      const arr = Array.isArray(b) ? b : b && b.items;
      if (Array.isArray(arr)) for (const it of arr) if (it && typeof it === "object" && it.name && !seen.has(it)) { seen.add(it); out.push(it); }
    }
  }
  return out;
}
const isShopifyFeed = (d) => Array.isArray(d) && d.length > 0 && d.slice(0, 50).some((p) => p && p.handle && Array.isArray(p.variants) && p.variants.some((v) => v && typeof v.available === "boolean"));

const result = { generatedAt: new Date().toISOString(), src: SRC.replace(ROOT, ""), stores: {}, skipped: {} };
for (const f of readdirSync(SRC).filter((x) => /^dataset-[a-z0-9]+\.json$/.test(x)).sort()) {
  const store = f.slice(8, -5);
  const catFile = join(ROOT, store + "-catalog.json");
  if (!existsSync(catFile)) { result.skipped[store] = "no catalogue"; continue; }
  const feed = JSON.parse(readFileSync(join(SRC, f), "utf8"));
  if (!isShopifyFeed(feed)) { result.skipped[store] = "not a products.json feed (no per-variant availability)"; continue; }
  const cat = JSON.parse(readFileSync(catFile, "utf8"));
  const shoes = itemsOf(cat).filter((it) => isShoeForDept(it, it.retailer || store));
  if (!shoes.length) { result.skipped[store] = "no footwear in the catalogue"; continue; }
  const { report, allSoldOut } = applyStoreRuns(shoes, shopifyRunIndex(feed));
  result.stores[store] = { ...report, allSoldOutTitles: allSoldOut.map((it) => it.name) };
  console.log(store.padEnd(18), JSON.stringify(report));
  if (DRY || report.unchanged === report.matched - report.noSizes - report.allSoldOut) continue;
  if (!String(cat.source || "").includes(NOTE)) cat.source = String(cat.source || "") + NOTE;
  writeFileSync(catFile, JSON.stringify(cat));
}
for (const [k, why] of Object.entries(result.skipped)) console.log(k.padEnd(18), "skipped:", why);
if (!DRY) {
  mkdirSync(join(ROOT, "reports"), { recursive: true });
  writeFileSync(join(ROOT, "reports/store-runs-2026-11-01.json"), JSON.stringify(result, null, 1) + "\n");
}

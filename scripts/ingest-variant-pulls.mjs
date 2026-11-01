#!/usr/bin/env node
/* ============================================================
   EVERY VARIANT PULL -> scripts/data/variant-families/<store>.json
   (#443 universal variant truth, Data Drops 1 and 2).

   Commit each drop as a folder under scripts/data/variant-pulls/:

     walmart-beauty-<date>/dataset.json   Drop 1, Walmart shade families
                                          (scripts/ingest-walmart-variants.mjs;
                                          a sibling detail pass is more
                                          JSON in that folder)
     <drop>/dataset-<store>.json          Drop 2 (color-pull-2026-11-01):
                                          dataset-kohls.json (colors[],
                                          swatches[], display_color,
                                          sku_ids), dataset-zumiez.json
                                          (one product per colourway) and
                                          the Shopify products.json feeds
                                          (dataset-ccs.json, ...: options
                                          Color, variants option1..3,
                                          featured_image, images[])

   then:
     node scripts/ingest-variant-pulls.mjs
     node scripts/build-pdp-slices.mjs && node scripts/build-price-index.mjs

   Parsers and rules: scripts/lib/variant-families.mjs. A store's file is
   rewritten whole from its datasets; a store with no dataset keeps its
   file (scripts/build-macys-colourways.mjs writes macys.json).
     --src <dir>   default scripts/data/variant-pulls
     --out <dir>   default scripts/data/variant-families
     --dry         counts only
   ============================================================ */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStoreDataset, readStorePulls, readWalmartPulls, parseWalmartFamilies, FAMILIES_DIR } from "./lib/variant-families.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };

export function ingestAll(src) {
  const out = new Map();
  const w = readWalmartPulls(src);
  if (w.files.length) out.set("walmart-beauty", { files: w.files, ...parseWalmartFamilies(w.products) });
  for (const [store, { rows, files }] of readStorePulls(src)) out.set(store, { files, ...parseStoreDataset(store, rows) });
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const src = arg("--src") || join(ROOT, "scripts/data/variant-pulls");
  const dir = arg("--out") || join(ROOT, FAMILIES_DIR);
  const all = ingestAll(src);
  if (!all.size) { console.log(`no variant pulls under ${relative(ROOT, src) || src}: nothing to ingest (the drops are not committed yet)`); process.exit(0); }
  for (const [store, r] of all) {
    console.log(store + ": " + JSON.stringify({ files: r.files, ...r.stats }));
    if (process.argv.includes("--dry")) continue;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, store + ".json"), JSON.stringify({ source: "variant pull: " + r.files.join(", "), generatedAt: new Date().toISOString(), stats: r.stats, families: r.families }));
  }
}

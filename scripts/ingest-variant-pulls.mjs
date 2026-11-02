#!/usr/bin/env node
/* ============================================================
   EVERY VARIANT PULL -> scripts/data/variant-families/<store>.json
   (#443 universal variant truth, Data Drops 1 and 2).

   The drops are committed on #585 (branch data/shade-colorway-drops) as
   data/shades-walmart-2026-11-01/ (Drop 1) and data/colorways-2026-11-01/
   (Drop 2); this reads data/ first, then the older layout below. Any
   folder holding them can be passed with --src.

   The older layout, folders under scripts/data/variant-pulls/:

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
     --keep-all    keep families none of whose members our catalogue lists
   ============================================================ */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStoreDataset, readStorePulls, readWalmartPulls, parseWalmartFamilies, anchoredFamilies, FAMILIES_DIR } from "./lib/variant-families.mjs";
import { liftPage, sourceFiles } from "./build-pdp-slices.mjs";
import { readFileSync, existsSync } from "node:fs";
import { variantIdOf } from "./lib/variants.mjs";

/* Every catalogue listing the product pages are built from. */
export function catalogueListings(root = ROOT) {
  const P = liftPage(root);
  const out = [];
  for (const f of sourceFiles(P)) {
    const p = root + f.slice(1);
    if (!existsSync(p)) continue;
    for (const it of P.extractItems(JSON.parse(readFileSync(p, "utf8")))) out.push({ ...it, v: variantIdOf(it.url) });
  }
  return out;
}

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
  /* Where #585 commits the drops (data/shades-walmart-2026-11-01/,
     data/colorways-2026-11-01/), then the older scripts/data/variant-pulls/. */
  const src = arg("--src") || [join(ROOT, "data"), join(ROOT, "scripts/data/variant-pulls")];
  const dir = arg("--out") || join(ROOT, FAMILIES_DIR);
  const all = ingestAll(src);
  const listings = process.argv.includes("--keep-all") ? null : catalogueListings();
  if (!all.size) { console.log(`no variant pulls under ${[].concat(src).map((x) => relative(ROOT, x) || x).join(", ")}: nothing to ingest (the drops are not committed yet)`); process.exit(0); }
  for (const [store, r] of all) {
    console.log(store + ": " + JSON.stringify({ files: r.files, ...r.stats }));
    if (process.argv.includes("--dry")) continue;
    mkdirSync(dir, { recursive: true });
    const families = listings ? anchoredFamilies(r.families, listings) : r.families;
    console.log("  kept " + families.length + " of " + r.families.length + " families (a member in our catalogue)");
    const out = join(dir, store + ".json");
    if (!families.length) { if (existsSync(out)) writeFileSync(out, JSON.stringify({ source: "variant pull: " + r.files.join(", "), stats: r.stats, families: [] })); continue; }
    writeFileSync(out, JSON.stringify({ source: "variant pull: " + r.files.join(", "), stats: { ...r.stats, keptFamilies: families.length }, families }));
  }
}

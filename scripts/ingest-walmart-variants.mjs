#!/usr/bin/env node
/* ============================================================
   WALMART SHADE FAMILIES -> scripts/data/variant-families/walmart-beauty.json
   (#443 universal variant truth).

   Walmart sells a makeup line's shades as child listings of one variant
   family. The pull (productDetails, sian.agency walmart-data-scraper)
   gives, per product:

     variants: [{ name: "Actual Color", values: [{ name, product_id,
                  available, swatch_url, selected }] },
                { name: "Pack Size", values: [...] }]   (sometimes)

   Commit the pull as scripts/data/variant-pulls/walmart-beauty-<date>/
   dataset.json (families.json beside it is ignored here: the families
   are rebuilt from the variant lists themselves), then:

     node scripts/ingest-walmart-variants.mjs
     node scripts/build-pdp-slices.mjs
     node scripts/build-price-index.mjs

   The second detail pass (each sibling product_id's own price and
   photos) is just more JSON in the same shape: drop it into that folder,
   or a second walmart-beauty-* folder, and re-run. No code changes.

   Rules (scripts/lib/variant-families.mjs): one member per shade, the
   current generation ("07 Warm Up" over the old "WARM UP"); Pack Size
   values are never shades, and a multipack listing never prices a shade
   sold singly; a family with no variant list stays a single product; a
   shade with no real price and photo is listed as pending, never sold.

     --src <dir>   a folder holding walmart-beauty-* pull folders
                   (default scripts/data/variant-pulls)
     --out <file>  default scripts/data/variant-families/walmart-beauty.json
     --dry         print the counts, write nothing
   ============================================================ */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseWalmartFamilies, readWalmartPulls, FAMILIES_DIR } from "./lib/variant-families.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };

export function ingest(srcDir) {
  const { products, files } = readWalmartPulls(srcDir);
  const { families, stats } = parseWalmartFamilies(products);
  return { files, families, stats };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  /* Where #585 commits the drops (data/shades-walmart-2026-11-01/,
     data/colorways-2026-11-01/), then the older scripts/data/variant-pulls/. */
  const src = arg("--src") || [join(ROOT, "data"), join(ROOT, "scripts/data/variant-pulls")];
  const out = arg("--out") || join(ROOT, FAMILIES_DIR, "walmart-beauty.json");
  const { files, families, stats } = ingest(src);
  if (!files.length) {
    console.log(`no walmart-beauty-*/dataset.json under ${[].concat(src).map((x) => relative(ROOT, x) || x).join(", ")}: nothing to ingest (the pull is not committed yet)`);
    process.exit(0);
  }
  console.log(JSON.stringify({ files, ...stats }, null, 2));
  if (process.argv.includes("--dry")) process.exit(0);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ source: "Walmart productDetails variant families (" + files.join(", ") + ")",
    generatedAt: new Date().toISOString(), stats, families }));
  console.log("wrote " + relative(ROOT, out));
}

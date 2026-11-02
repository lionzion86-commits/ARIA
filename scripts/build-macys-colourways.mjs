#!/usr/bin/env node
/* ============================================================
   MACY'S COLOURS -> scripts/data/variant-families/macys.json
   (#443 universal variant truth, Route A: colour already in the source
   feed, lost at normalisation).

   build-macys-catalog.mjs keeps one listing per Macy's product and drops
   the colour swatches. The Apify export it reads carries each product's
   colours (traits.colors.colorMap: name, swatch, the colour's own
   photos). This re-reads that export and keeps the colour structure as
   variant families, which build-pdp-slices.mjs turns into the colour
   picker. The raw export lives on branch data/macys-catalog-2026-09-21
   (data/macys-catalog-2026-09-21.json); point --src at it:

     git show origin/data/macys-catalog-2026-09-21:data/macys-catalog-2026-09-21.json > /tmp/macys-raw.json
     node scripts/build-macys-colourways.mjs --src /tmp/macys-raw.json
     node scripts/build-pdp-slices.mjs && node scripts/build-price-index.mjs

   Never invented (scripts/lib/variant-families.mjs parseMacysFamilies):
   a colour is offered only with its own photos and only when Macy's
   says the price applies to every colour (applicableToAllUpcs); its
   sizes are the product's, not the colour's, so they stay "por
   confirmar" for every colour but the one the catalogue listing is.
   A colour without its own photo or price is listed as pending.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMacysFamilies, FAMILIES_DIR } from "./lib/variant-families.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const src = arg("--src");
  if (!src) { console.error("usage: node scripts/build-macys-colourways.mjs --src <raw Macy's Apify export>"); process.exit(2); }
  const out = arg("--out") || join(ROOT, FAMILIES_DIR, "macys.json");
  const raw = JSON.parse(readFileSync(src, "utf8"));
  const products = Array.isArray(raw) ? raw : raw.products || [];
  const { families, stats } = parseMacysFamilies(products);
  console.log(JSON.stringify(stats, null, 2));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ source: String(raw.source || "Macy's Apify export") + ", traits.colors.colorMap (branch data/macys-catalog-2026-09-21)",
    generatedAt: new Date().toISOString(), stats, families }));
  console.log("wrote " + relative(ROOT, out));
}

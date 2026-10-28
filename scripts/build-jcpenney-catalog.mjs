#!/usr/bin/env node
/* ============================================================
   jcpenney-catalog.json FROM THE 2026-10-27 PULL + THE CAPTURED PHOTOS
   (#443 c.6470386941 item 1; the store build waits on this file).

     node scripts/build-jcpenney-catalog.mjs --pull <jcpenney.json> --images <jcpenney-images.json>

   --images is scripts/resolve-jcpenney-images.mjs's output. Only products
   whose main photo was captured from JCPenney's own page are written (no
   image, no card); the rest are counted in reports/jcpenney-pull.json
   with why. The rules are scripts/lib/jcpenney.mjs normalizeJcpenney.
   Weights follow the estimado doctrine at the next step (as SNIPES):
   none came with the pull.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeJcpenney } from "./lib/jcpenney.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const pull = arg("--pull"), imagesFile = arg("--images");
if (!pull || !imagesFile) { console.error("usage: --pull <jcpenney.json> --images <jcpenney-images.json>"); process.exit(2); }
const rows = JSON.parse(readFileSync(pull, "utf8"));
const images = new Map(Object.entries(JSON.parse(readFileSync(imagesFile, "utf8")).map || {}));
const { departments, skipped, products } = normalizeJcpenney(rows, images);
const kept = Object.values(departments).reduce((n, d) => n + d.items.length, 0);
const report = { generatedAt: new Date().toISOString(), products, kept, skipped,
  byDepartment: Object.fromEntries(Object.entries(departments).map(([k, d]) => [k, d.items.length])),
  onSale: Object.values(departments).reduce((n, d) => n + d.items.filter((i) => i.onSale).length, 0),
  sizesPending: Object.values(departments).reduce((n, d) => n + d.items.filter((i) => i.sizesPending).length, 0) };
mkdirSync(join(ROOT, "reports"), { recursive: true });
writeFileSync(join(ROOT, "reports/jcpenney-pull.json"), JSON.stringify(report, null, 1));
if (!kept) { console.log("no product has a captured photo: nothing written", report); process.exit(1); }
writeFileSync(join(ROOT, "jcpenney-catalog.json"), JSON.stringify({ generatedAt: report.generatedAt,
  source: "jcpenney.com search results via Apify stealth_mode/jcpenney-product-search-scraper, pulled 2026-10-27 (#443 c.6457579787); photos captured from each product's own page",
  declaredProductCount: kept, retailers: { jcpenney: { label: "JCPenney", departments } } }));
console.log(`jcpenney: ${kept} of ${products} products`, report.byDepartment, skipped);

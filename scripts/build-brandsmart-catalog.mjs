#!/usr/bin/env node
/* ============================================================
   brandsmart-catalog.json FROM THE 2026-10-28 PULL (Build Order B, #443).

   The drop is on branch brandsmart-2026-10-28, file
   data-drops/brandsmart-2026-10-28/dataset.json (not on main: it is the
   pull, not the site). Point --src at it:

     node scripts/build-brandsmart-catalog.mjs --src <dataset.json>

   The rules (aisles, the 220 V gate, what is held and why) are
   scripts/lib/brandsmart.js. Counts: reports/brandsmart-2026-10-28.json.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeBrandsmart } from "./lib/brandsmart.js";
import { loadShippable } from "./build-store-slices.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const SRC = arg("--src");
if (!SRC) { console.error("usage: node scripts/build-brandsmart-catalog.mjs --src <brandsmart-2026-10-28/dataset.json>"); process.exit(2); }

const rows = JSON.parse(readFileSync(SRC, "utf8"));
const { departments, held } = normalizeBrandsmart(rows, { isShippableItem: loadShippable(ROOT) });
const all = Object.values(departments).flatMap((d) => d.items);
const generatedAt = new Date().toISOString();
writeFileSync(join(ROOT, "brandsmart-catalog.json"), JSON.stringify({ generatedAt,
  source: "brandsmartusa.com public Shopify storefront via Apify autofacts/shopify, pulled 2026-10-28 (#443 Build Order B)",
  declaredProductCount: all.length, retailers: { brandsmart: { label: "BrandsMart USA", departments } } }));
const report = { generatedAt, rawProducts: rows.length, kept: all.length, held,
  byAisle: Object.fromEntries(Object.entries(departments).map(([k, d]) => [k, d.items.length])),
  onSale: all.filter((i) => i.onSale).length, withWeight: all.filter((i) => i.weightKg).length,
  withSpanish: all.filter((i) => i.description).length };
mkdirSync(join(ROOT, "reports"), { recursive: true });
writeFileSync(join(ROOT, "reports/brandsmart-2026-10-28.json"), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));

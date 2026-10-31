#!/usr/bin/env node
/* ============================================================
   THE 2026-10-28 ELECTRONICS DROPS (Order C, #443) INTO CATALOGUES:
     walmart-electronics-catalog.json  (retailer walmart)
     costco-electronics-catalog.json   (retailer costco)
     microcenter-catalog.json          (retailer microcenter, new store)

     node scripts/build-electronics-drops.mjs --walmart <json> --costco <json> --microcenter <json>
     python3 apply-weight-estimates.py weight-estimates.json <each catalogue> --in-place

   Each --flag is the drop's dataset.json, from the branches
   walmart-electronics-2026-10-28, costco-electronics-2026-10-28,
   microcenter-2026-10-28. Rules: scripts/lib/electronics-drops.js.
   Counts: reports/electronics-drops-2026-10-28.json.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeWalmartElectronics, normalizeCostcoElectronics, normalizeMicroCenter } from "./lib/electronics-drops.js";
import { loadShippable } from "./build-store-slices.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const isShippableItem = loadShippable(ROOT);
const rowsOf = (p) => { const d = JSON.parse(readFileSync(p, "utf8")); return Array.isArray(d) ? d : d.products; };
const STORES = [
  { flag: "--walmart", file: "walmart-electronics-catalog.json", key: "walmart", label: "Walmart", norm: normalizeWalmartElectronics,
    source: "walmart.com electronics (category crawls + PDP detail pass), pulled 2026-10-28 (#443 c.6474272664)" },
  { flag: "--costco", file: "costco-electronics-catalog.json", key: "costco", label: "Costco", norm: normalizeCostcoElectronics,
    source: "costco.com electronics via Apify sian.agency/costco-data-scraper, pulled 2026-10-28 (#443 electronics wave)" },
  { flag: "--microcenter", file: "microcenter-catalog.json", key: "microcenter", label: "Micro Center", norm: normalizeMicroCenter,
    source: "microcenter.com product pages (detail mode, ship-to-home pool only) via Apify sian.agency/microcenter-product-scraper, pulled 2026-10-28 (#443 electronics wave)" },
];
const generatedAt = new Date().toISOString();
const report = { generatedAt, stores: {} };
for (const s of STORES) {
  const src = arg(s.flag);
  if (!src) { console.error(`missing ${s.flag}`); process.exit(2); }
  const rows = rowsOf(src);
  const { departments, held } = s.norm(rows, { isShippableItem });
  const items = Object.values(departments).flatMap((d) => d.items);
  writeFileSync(join(ROOT, s.file), JSON.stringify({ generatedAt, source: s.source, declaredProductCount: items.length,
    retailers: { [s.key]: { label: s.label, departments } } }));
  report.stores[s.key] = { raw: rows.length, kept: items.length, held,
    byAisle: Object.fromEntries(Object.entries(departments).map(([k, d]) => [k, d.items.length])),
    onSale: items.filter((i) => i.onSale).length };
}
mkdirSync(join(ROOT, "reports"), { recursive: true });
writeFileSync(join(ROOT, "reports/electronics-drops-2026-10-28.json"), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));

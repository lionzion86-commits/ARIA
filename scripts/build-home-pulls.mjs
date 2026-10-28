#!/usr/bin/env node
/* ============================================================
   crateandbarrel-catalog.json + pier1-catalog.json FROM THE 2026-10-27
   PULLS (#443 c.6457579787), the Casa Aria wing (c.6458486219).

   The raw datasets are on branch catalog-pulls-2026-10-27, folder
   catalog-pulls/2026-10-27/. Point --src at a checkout of it:

     node scripts/build-home-pulls.mjs --src <dir with crate-and-barrel.json and pier-1.json>

   The rules (light home, the 5 kg cap with estimates, the aisles) are
   scripts/lib/home-pull-normalize.js. Counts: reports/home-pulls-2026-10-27.json.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCrateAndBarrel, normalizePier1, toDepartments } from "./lib/home-pull-normalize.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const SRC = arg("--src");
if (!SRC) { console.error("usage: node scripts/build-home-pulls.mjs --src <catalog-pulls/2026-10-27 dir>"); process.exit(2); }
const STORES = [
  { key: "crateandbarrel", label: "Crate & Barrel", raw: "crate-and-barrel.json", norm: normalizeCrateAndBarrel,
    source: "crateandbarrel.com product pages via Apify sian.agency/crate-and-barrel-product-scraper (detail mode), pulled 2026-10-27 (#443 c.6457579787)" },
  { key: "pier1", label: "Pier 1", raw: "pier-1.json", norm: normalizePier1,
    source: "pier1.com (Shopify) product pages via Apify digital_influx/product-data (store mode), pulled 2026-10-27 (#443 c.6457579787)" },
];
const report = { generatedAt: new Date().toISOString(), stores: {} };
for (const s of STORES) {
  const rows = JSON.parse(readFileSync(join(SRC, s.raw), "utf8"));
  const { items, skipped } = s.norm(rows);
  const departments = toDepartments(items);
  writeFileSync(join(ROOT, s.key + "-catalog.json"), JSON.stringify({ generatedAt: report.generatedAt, source: s.source,
    declaredProductCount: items.length, retailers: { [s.key]: { label: s.label, departments } } }));
  report.stores[s.key] = { kept: items.length, skipped,
    byAisle: Object.fromEntries(Object.entries(departments).map(([k, d]) => [k, d.items.length])),
    onSale: items.filter((i) => i.onSale).length, withEnglishCopy: items.filter((i) => i.description_en).length };
  console.log(s.key, items.length, JSON.stringify(skipped), JSON.stringify(report.stores[s.key].byAisle));
}
mkdirSync(join(ROOT, "reports"), { recursive: true });
writeFileSync(join(ROOT, "reports/home-pulls-2026-10-27.json"), JSON.stringify(report, null, 1));

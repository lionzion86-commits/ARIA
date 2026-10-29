#!/usr/bin/env node
/* ============================================================
   sleekshop-catalog.json FROM THE 2026-10-28 PULL (#443 c.6475799491).

   The drop is on branch sleekshop-2026-10-28, file
   data-drops/sleekshop-2026-10-28/dataset.json. Point --src at it:

     node scripts/build-sleekshop-catalog.mjs --src <dataset.json>
     python3 apply-weight-estimates.py weight-estimates.json sleekshop-catalog.json --in-place

   The rules are scripts/lib/sleekshop.js; the second step weighs, from
   the house table, only what states no size. Counts:
   reports/sleekshop-2026-10-28.json.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSleekshop } from "./lib/sleekshop.js";
import { loadShippable } from "./build-store-slices.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const SRC = arg("--src");
if (!SRC) { console.error("usage: node scripts/build-sleekshop-catalog.mjs --src <sleekshop-2026-10-28/dataset.json>"); process.exit(2); }
const rows = JSON.parse(readFileSync(SRC, "utf8"));
const { departments, held } = normalizeSleekshop(rows, { isShippableItem: loadShippable(ROOT) });
const all = Object.values(departments).flatMap((d) => d.items);
const generatedAt = new Date().toISOString();
writeFileSync(join(ROOT, "sleekshop-catalog.json"), JSON.stringify({ generatedAt,
  source: "sleekshop.com product pages (direct HTTP, JSON-LD + PDP detail), pulled 2026-10-28 (#443 c.6475799491)",
  declaredProductCount: all.length, retailers: { sleekshop: { label: "SleekShop", departments } } }));
const report = { generatedAt, rawProducts: rows.length, kept: all.length, held,
  byAisle: Object.fromEntries(Object.entries(departments).map(([k, d]) => [k, d.items.length])),
  keratin: all.filter((i) => i.treatment.includes("keratin")).length, alisado: all.filter((i) => i.treatment.includes("alisado")).length,
  onSale: all.filter((i) => i.onSale).length, weighedFromSize: all.filter((i) => i.weightKg).length,
  withSpanish: all.filter((i) => i.description).length };
mkdirSync(join(ROOT, "reports"), { recursive: true });
writeFileSync(join(ROOT, "reports/sleekshop-2026-10-28.json"), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));

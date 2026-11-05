#!/usr/bin/env node
/* ============================================================
   marcjacobs-catalog.json FROM LUCIFER'S DIRECT PULL (#443 c.6643310622,
   amended c.6643334129: Marc Jacobs is a first-class DIRECT store).

   The drop is data, not the site: it lands as a file or a folder (see
   data/drops/marcjacobs/README.md for the exact accepted formats -- our
   standard pull row, a Shopify /products.json, or a JSON-LD Product
   list). This is the same pipeline as the SNIPES / Carolina Herrera
   pulls (scripts/build-pull-catalogs.mjs, apply-snipes-pass.mjs); the
   rules are scripts/lib/marcjacobs.js.

     node scripts/ingest-marcjacobs.mjs --drop <file.json | dir>
     node scripts/ingest-marcjacobs.mjs --drop <...> --regen
     node scripts/ingest-marcjacobs.mjs --drop <...> --dry-run

   What it does, in order:
     1. reads every .json in the drop, detects each file's shape, turns
        it into standard pull rows;
     2. normalizes them (scripts/lib/marcjacobs.js normalizeMarcJacobs);
     3. writes marcjacobs-catalog.json (the envelope every store uses);
     4. estimates weights (apply-weight-estimates.py, +10%, flagged) and
        writes the stored Spanish descriptions (apply-description-memory);
     5. rewrites the shown-not-sold list (scripts/lib/sizes-pending-
        data.js + assets/data/sizes-pending.json; Marc Jacobs' entries
        only, every other store's stay);
     6. opens the store gate (scripts/lib/store-gate.mjs: /off-sale.js
        AWAITING_CATALOG) once the catalogue has products;
     7. writes reports/marcjacobs-ingest.json (kept, left out and why,
        by aisle; sized, sold-out sizes, pending, on sale).
   --regen then runs the one regenerate (REGEN below): the storefront
   slices, doors, search, brand and department indexes, product pages,
   prices, Ofertas, menus and home pills. --dry-run prints the counts and
   writes nothing.

   PRICES are the store's raw USD (the Miami sales tax and Aria's margin
   are applied by the pages, x1.07 like every non-exempt store: see the
   header of scripts/lib/marcjacobs.js).
   ============================================================ */
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { MJ_KEY, MJ_LABEL, MJ_CATALOG_FILE, MJ_DEPT_ORDER, dropRows, normalizeMarcJacobs } from "./lib/marcjacobs.js";
import { sizesPendingKey } from "./lib/sizes-pending.js";
import { syncStoreGate } from "./lib/store-gate.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/* The one regenerate after a catalogue lands (the #611 generator chain,
   in its order). */
export const REGEN = [
  "scripts/build-store-slices.mjs", "scripts/build-ofertas-feed.mjs", "scripts/build-ofertas-lite.mjs",
  "scripts/build-ofertas-slices.mjs", "scripts/build-search-index.mjs", "scripts/build-department-slices.mjs",
  "scripts/build-brand-index.mjs", "scripts/build-pdp-slices.mjs", "scripts/build-price-index.mjs",
  "scripts/build-home-shelves.mjs --truth", "scripts/build-store-doors.mjs", "scripts/build-home-category-pills.mjs",
  "scripts/build-store-rail-pills.mjs", "scripts/build-search-destinations.mjs", "scripts/build-nav-menu.mjs",
];

/** Every .json of a drop (a file, or a folder's .json files), parsed. */
export function readDrop(path) {
  const p = resolve(path);
  const files = statSync(p).isDirectory()
    ? readdirSync(p).filter((f) => f.endsWith(".json")).sort().map((f) => join(p, f))
    : [p];
  return files.map((f) => ({ file: f, json: JSON.parse(readFileSync(f, "utf8")) }));
}

/** Drop files -> { catalogue, report } (no writes). */
export function buildCatalogue(dropFiles, { base, generatedAt = new Date().toISOString() } = {}) {
  const rows = [], shapes = {};
  for (const { file, json } of dropFiles) {
    const { shape, rows: r } = dropRows(json, { base });
    if (!shape) throw new Error(`${basename(file)}: not an accepted drop shape (data/drops/marcjacobs/README.md)`);
    shapes[basename(file)] = { shape, rows: r.length };
    rows.push(...r);
  }
  const n = normalizeMarcJacobs(rows);
  const byAisle = Object.fromEntries(MJ_DEPT_ORDER.map((k) => [k, (n.departments[k] || { items: [] }).items.length]));
  const kept = Object.values(byAisle).reduce((a, b) => a + b, 0);
  const catalogue = {
    generatedAt,
    source: "marcjacobs.com direct pull (Lucifer's lane, #443 c.6643334129), ingested by scripts/ingest-marcjacobs.mjs",
    declaredProductCount: kept,
    retailers: { [MJ_KEY]: { label: MJ_LABEL, departments: n.departments } },
  };
  const report = {
    generatedAt, drop: shapes, rawRows: rows.length, kept, byAisle, skipped: n.skipped,
    sized: n.sized, soldOutSizes: n.soldOutSizes, sizesPending: n.sizesPending, onSale: n.onSale,
  };
  return { catalogue, report };
}

/* The shown-not-sold list: this store's entries replaced, the rest kept. */
export function writeSizesPending(root, catalogue) {
  const dataJs = join(root, "scripts/lib/sizes-pending-data.js");
  if (!existsSync(dataJs)) return null;
  const cur = JSON.parse(/export const SIZES_PENDING = (\[[\s\S]*?\]);/.exec(readFileSync(dataJs, "utf8"))[1]);
  const pending = new Set(cur.filter((k) => !k.startsWith(MJ_KEY + "::")));
  for (const d of Object.values(catalogue.retailers[MJ_KEY].departments)) for (const it of d.items) if (it.sizesPending) pending.add(sizesPendingKey(MJ_KEY, it.name));
  const list = [...pending].sort();
  writeFileSync(dataJs,
    "/* GENERATED by scripts/build-pull-catalogs.mjs -- the items shown but not sold until their sizes are confirmed\n" +
    "   (scripts/lib/sizes-pending.js). Do not edit by hand. */\n" +
    "export const SIZES_PENDING = " + JSON.stringify(list) + ";\n");
  mkdirSync(join(root, "assets/data"), { recursive: true });
  writeFileSync(join(root, "assets/data/sizes-pending.json"), JSON.stringify(list));
  return list.filter((k) => k.startsWith(MJ_KEY + "::")).length;
}

/** The whole ingest into `root` (the repo by default). */
export function ingest({ drop, root = ROOT, base, weights = true, descriptions = true, dryRun = false } = {}) {
  const { catalogue, report } = buildCatalogue(readDrop(drop), { base });
  if (dryRun) return { report, gate: null };
  const out = join(root, MJ_CATALOG_FILE);
  writeFileSync(out, JSON.stringify(catalogue));
  if (weights && report.kept) {
    const w = spawnSync("python3", [join(ROOT, "apply-weight-estimates.py"), join(ROOT, "weight-estimates.json"), out, "--in-place"], { encoding: "utf8" });
    if (w.status !== 0) throw new Error("apply-weight-estimates.py failed: " + (w.stderr || w.stdout));
  }
  if (descriptions && report.kept && root === ROOT) {
    const d = spawnSync(process.execPath, [join(ROOT, "scripts/apply-description-memory.mjs"), MJ_CATALOG_FILE], { cwd: ROOT, encoding: "utf8" });
    if (d.status !== 0) throw new Error("apply-description-memory failed: " + (d.stderr || d.stdout));
  }
  report.sizesPendingListed = writeSizesPending(root, JSON.parse(readFileSync(out, "utf8")));
  const gate = syncStoreGate(root);
  report.gate = { awaiting: gate.awaiting, live: !gate.awaiting.includes(MJ_KEY) };
  if (existsSync(join(root, "reports"))) writeFileSync(join(root, "reports/marcjacobs-ingest.json"), JSON.stringify(report, null, 1) + "\n");
  return { report, gate };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const drop = arg("--drop");
  if (!drop) { console.error("usage: node scripts/ingest-marcjacobs.mjs --drop <file.json | dir> [--base https://www.marcjacobs.com] [--regen] [--dry-run]"); process.exit(2); }
  const { report } = ingest({ drop, base: arg("--base") || undefined, dryRun: process.argv.includes("--dry-run") });
  console.log(JSON.stringify(report, null, 1));
  if (process.argv.includes("--regen") && !process.argv.includes("--dry-run")) {
    for (const step of REGEN) {
      const [script, ...args] = step.split(" ");
      const t0 = Date.now();
      const r = spawnSync(process.execPath, [join(ROOT, script), ...args], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
      console.log(`${step}: exit ${r.status} (${Math.round((Date.now() - t0) / 1000)}s)`);
      if (r.status !== 0) process.exit(r.status || 1);
    }
  }
}

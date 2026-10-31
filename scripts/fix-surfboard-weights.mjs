#!/usr/bin/env node
/* ============================================================
   SURFBOARD WEIGHTS, SWEPT (#443 c.6539551122, c.6539602786).

   Every surfboard in the committed catalogues gets the weight it really
   ships at (scripts/lib/surfboard-weight.js): a plausible store figure
   stays; a placeholder or implausible one is replaced from the
   estimator table, per size, and marked weightEstimated. Only the
   weight fields change (weightKg, weightEstimated, weightBySize,
   weightSource); the catalogue is written back in its own JSON style.

     node scripts/fix-surfboard-weights.mjs            write, and report
     node scripts/fix-surfboard-weights.mjs --dry-run  report only
   ============================================================ */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isSurfboard, surfboardWeight } from "./lib/surfboard-weight.js";
import { serializerFor } from "./lib/gallery-backfill.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const dryRun = process.argv.includes("--dry-run");

function* recordsOf(catalog) {
  for (const r of Object.values((catalog && catalog.retailers) || {}))
    for (const section of ["departments", "brands"])
      for (const bucket of Object.values((r && r[section]) || {})) {
        const arr = Array.isArray(bucket) ? bucket : (bucket && Array.isArray(bucket.items) ? bucket.items : []);
        for (const rec of arr) if (rec && typeof rec === "object") yield rec;
      }
}

export function sweep(root = ROOT, { write = false } = {}) {
  const report = { boards: 0, kept: 0, replaced: 0, perSize: 0, oversizeNonBoard: 0, byStore: {}, files: [] };
  for (const f of readdirSync(root)) {
    if (!/catalog.*\.json$|^department-cache-.*\.json$/.test(f)) continue;
    const text = readFileSync(join(root, f), "utf8");
    if (!text.includes("urf")) continue;
    const write_ = serializerFor(text);
    const catalog = write_ && write_.parse ? write_.parse(text) : JSON.parse(text);
    let changed = 0;
    for (const rec of recordsOf(catalog)) {
      if (!isSurfboard(rec)) { if (rec.oversize === true) report.oversizeNonBoard++; continue; }
      report.boards++;
      const store = String(rec.retailer || "?");
      const s = (report.byStore[store] ||= { boards: 0, replaced: 0 });
      s.boards++;
      const w = surfboardWeight(rec);
      if (w.kept) { report.kept++; continue; }
      report.replaced++; s.replaced++;
      if (w.weightBySize) report.perSize++;
      const before = JSON.stringify([rec.weightKg, rec.weightEstimated, rec.weightBySize, rec.weightSource]);
      rec.weightKg = w.weightKg;
      rec.weightEstimated = true;
      if (w.weightBySize) rec.weightBySize = w.weightBySize; else delete rec.weightBySize;
      rec.weightSource = "surfboard-estimator";
      if (JSON.stringify([rec.weightKg, rec.weightEstimated, rec.weightBySize, rec.weightSource]) !== before) changed++;
    }
    if (changed) {
      report.files.push(`${f} (${changed})`);
      if (write) {
        if (!write_) throw new Error(`${f}: cannot reproduce its JSON style; refusing to rewrite it`);
        writeFileSync(join(root, f), write_(catalog));
      }
    }
  }
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = sweep(ROOT, { write: !dryRun });
  console.log(`surfboards: ${r.boards}; store weight kept ${r.kept}; replaced from the estimator ${r.replaced} (${r.perSize} with a weight per size)`);
  console.log(`oversize items that are not surfboards (left as they are): ${r.oversizeNonBoard}`);
  for (const [s, v] of Object.entries(r.byStore).sort((a, b) => b[1].boards - a[1].boards)) console.log(`  ${s.padEnd(18)} ${v.boards} boards, ${v.replaced} replaced`);
  console.log((dryRun ? "would write: " : "wrote: ") + r.files.join(", "));
}

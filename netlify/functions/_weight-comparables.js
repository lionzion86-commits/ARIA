/* ============================================================
   assets/data/weight-comparables.json, read once per warm container
   (#443 weight ruling, 2026-10-26).

   The padded estimates from similar products for the products the
   weight rules cannot place (scripts/build-weight-comparables.mjs).
   Shipped beside the functions that resolve weights by netlify.toml
   included_files; probed for rather than assumed, like
   _price-index.js, because the bundled layout differs from the source
   layout (and no import.meta here, for the same reason). Absent, every
   lookup answers null and the resolver behaves as it did before.

   ARIA_WEIGHT_COMPARABLES=off turns the table off (the build script
   reads the resolver without it).
   ============================================================ */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
/* comparable-key.js, not weight-comparables.mjs: a function may not
   import a .mjs (the default bundler leaves it ESM and require() of it
   crashes the function at load). */
import { comparableKey } from "../../scripts/lib/comparable-key.js";

export const COMPARABLES_FILE = "assets/data/weight-comparables.json";

const CANDIDATES = [
  process.env.LAMBDA_TASK_ROOT,
  "/var/task",
  typeof __dirname === "string" ? resolve(__dirname, "..", "..") : null,
  typeof __dirname === "string" ? __dirname : null,
  process.cwd(),
].filter(Boolean);
let cached;

export function loadComparables() {
  if (cached !== undefined) return cached;
  cached = null;
  for (const dir of CANDIDATES) {
    const p = join(dir, COMPARABLES_FILE);
    try {
      if (existsSync(p)) { cached = JSON.parse(readFileSync(p, "utf8")).estimates || null; break; }
    } catch { /* try the next */ }
  }
  return cached;
}

/** The padded estimate for one product, with its comparables, or null. */
export function comparableWeight(retailer, title) {
  if (String(process.env.ARIA_WEIGHT_COMPARABLES || "").toLowerCase() === "off") return null;
  const table = loadComparables();
  if (!table || !retailer || !title) return null;
  return table[comparableKey(retailer, title)] || null;
}

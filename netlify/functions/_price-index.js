/* ============================================================
   price-index.json, read once per warm container.

   Built by scripts/build-price-index.mjs from index.html's own pricing
   over the committed catalogues (see _checkout-model.js repriceCart).
   Shipped beside the function by netlify.toml included_files; probed
   for rather than assumed, like scripts/lib/mcp/paths.mjs, because the
   bundled layout differs from the source layout. Null when absent: every
   line is then "unverified" and the order is flagged, never trusted.
   ============================================================ */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CANDIDATES = [resolve(HERE, "..", ".."), "/var/task", process.cwd()];
let cached;

export function loadPriceIndex() {
  if (cached !== undefined) return cached;
  cached = null;
  for (const dir of CANDIDATES) {
    const p = join(dir, "price-index.json");
    try {
      if (existsSync(p)) { cached = JSON.parse(readFileSync(p, "utf8")).prices || null; break; }
    } catch { /* try the next */ }
  }
  return cached;
}

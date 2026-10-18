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
import { join, resolve } from "node:path";

/* NO import.meta HERE (2026-10-18, #367 rehearsal round 2: Pagar ->
   "502 · TypeError"). Netlify's bundler compiles this function to
   CommonJS and replaces import.meta with {}, so the old
   fileURLToPath(import.meta.url) at module scope threw a TypeError while
   the function was still loading -- before the handler, its try/catch or
   any log line existed. The bundle puts price-index.json at the task
   root; the repo root is the source layout (tests, local runs). */
const CANDIDATES = [
  process.env.LAMBDA_TASK_ROOT,
  "/var/task",
  typeof __dirname === "string" ? resolve(__dirname, "..", "..") : null,
  typeof __dirname === "string" ? __dirname : null,
  process.cwd(),
].filter(Boolean);
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

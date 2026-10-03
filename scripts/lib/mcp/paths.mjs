/* ============================================================
   WHERE THE SITE'S DATA FILES LIVE.

   The connector reads index.html and the catalogue JSONs off disk.
   That path is layout-dependent:

   - Local dev / CI container: this file sits at
     <repo>/scripts/lib/mcp/paths.mjs, so the repo root is ../../..
   - Netlify Functions (esbuild-bundled): everything is inlined into
     <bundle>/netlify/functions/mcp.mjs and `included_files` copies
     index.html + the catalogue JSONs to <bundle>/, so the root is
     ../.. relative to the bundle file.

   We probe for index.html instead of assuming a layout, so a new
   bundler arrangement fails with a clear message rather than a
   cryptic ENOENT. Cached after the first hit.
   ============================================================ */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

const CANDIDATES = [
  resolve(HERE, "..", "..", ".."), // source layout: scripts/lib/mcp -> repo root
  resolve(HERE, "..", ".."), // bundled layout: netlify/functions -> bundle root
  "/var/task", // Netlify Lambda bundle root (absolute fallback)
  process.cwd(),
];

let cached = null;

/** Absolute path of the repo/bundle root — the directory containing index.html. */
export function repoRoot() {
  if (cached) return cached;
  for (const c of CANDIDATES) {
    try {
      if (existsSync(join(c, "index.html"))) {
        cached = c;
        return c;
      }
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error(
    "mcp paths: index.html not found in any candidate root. " +
      "The function bundle is missing its data files — netlify.toml needs " +
      '[functions] included_files = ["index.html", "*-catalog.json", "department-cache*.json"]. ' +
      "Tried: " +
      CANDIDATES.join(", ")
  );
}

/** Absolute path of a repo-relative data file (e.g. "index.html", "nike-catalog.json"). */
export function repoFile(rel) {
  return join(repoRoot(), rel);
}

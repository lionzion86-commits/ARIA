#!/usr/bin/env node
/* ============================================================
   assets/css/tailwind.css — THE HOME PAGE'S TAILWIND, PREBUILT.

   WHY (2026-10-19, #417 iPhone QA). index.html loaded Tailwind from
   cdn.tailwindcss.com: a 107KB script that blocks rendering, then
   compiles every class on the shopper's phone and recompiles as rails
   insert cards. On Danny's iPhone the page sat white and the search box
   ignored taps until the whole page had loaded. Tailwind documents that
   runtime as development-only. Until it has compiled, nothing styled by
   Tailwind exists -- overlays hidden only by its `hidden` class take up
   the screen (the lightbox had to be patched for exactly that).

   This builds the same CSS ahead of time from the class names in
   index.html and the app bundle. Measured against the runtime on the
   home page (phone and desktop width, cart, assistant and login opened):
   every selector the runtime generated is in this file.

   REGENERATE after changing classes in index.html or the bundle:
     node scripts/build-tailwind.mjs
   scripts/test/tailwind-tests.mjs fails when this file is stale.
   ============================================================ */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const CSS_PATH = "assets/css/tailwind.css";

export function buildTailwindCss() {
  const bin = join(ROOT, "node_modules", ".bin", "tailwindcss");
  if (!existsSync(bin)) throw new Error("tailwindcss is not installed — run: npm install");
  const dir = mkdtempSync(join(tmpdir(), "aria-tw-"));
  const input = join(dir, "in.css"), output = join(dir, "out.css");
  writeFileSync(input, "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
  const r = spawnSync(bin, ["-c", join(ROOT, "scripts", "tailwind.config.cjs"), "-i", input, "-o", output, "--minify"], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("tailwindcss failed: " + (r.stderr || r.stdout));
  return readFileSync(output, "utf8");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const css = buildTailwindCss();
  writeFileSync(join(ROOT, CSS_PATH), css);
  console.log(`${CSS_PATH}: ${(css.length / 1024).toFixed(1)}KB`);
}

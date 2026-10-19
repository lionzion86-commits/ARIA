#!/usr/bin/env node
/* ============================================================
   build/min/app-<hash>.js — THE APP BUNDLE, AS PHONES DOWNLOAD IT.

   WHY (2026-10-19, #417 night order 3). The app bundle is the site's
   source: build/app-<hash>.js, with the long comments that explain every
   rule in it, read by the tests and the MCP connector (they lift
   functions out of it by name). Shipped as written it was 596KB
   gzipped -- on a slow mountain connection (400kbps) that alone is
   twelve seconds, and it shared the link with the page's photos.

   Minified it is 241KB. Only local names are shortened: top-level
   functions and variables keep their names, because the page's inline
   handlers (onclick="doSearch()") and its other scripts call them.

   netlify.toml rewrites /build/app-<hash>.js to this file, so the page,
   the tests and every tool keep naming the source while the phone gets
   the small copy.

   REGENERATE after the bundle changes (after the rehash):
     node scripts/build-app-min.mjs
   scripts/test/app-min-tests.mjs fails when the copy is missing or stale.
   ============================================================ */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const MIN_DIR = "build/min";

export async function minify(source) {
  const { transform } = await import("esbuild");
  const out = await transform(source, { minify: true, target: "esnext", charset: "utf8", legalComments: "none" });
  return out.code;
}

/* The bundle index.html loads. */
export function bundleName() {
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const m = /<script src="\/build\/(app-[0-9a-f]+\.js)"><\/script>/.exec(html);
  if (!m) throw new Error("index.html loads no build/app-<hash>.js");
  return m[1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const name = bundleName();
  const code = await minify(readFileSync(join(ROOT, "build", name), "utf8"));
  const dir = join(ROOT, MIN_DIR);
  if (existsSync(dir)) for (const f of readdirSync(dir)) rmSync(join(dir, f));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), code);
  console.log(`${MIN_DIR}/${name}: ${(code.length / 1024).toFixed(0)}KB`);
}

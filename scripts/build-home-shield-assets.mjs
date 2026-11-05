#!/usr/bin/env node
/* ==================================================================
   ARIA HOME SHIELD: PHOTO AND BADGE SLOTS (#443 c.6660278927).

   "No image, no slot": the homeowner page has photo slots and a badge
   slot that render ONLY when the file exists. This script looks at what
   is in the repo and stamps the list into home-shield/index.html
   (between the HS-ASSETS markers), so the page never requests a file
   that is not there and never fetches a manifest.

     node scripts/build-home-shield-assets.mjs           write the manifest
     node scripts/build-home-shield-assets.mjs --check   fail if it is stale

   Drop real photography (never stock, never generated people) at
     home-shield/photos/<slot>.webp  (or .jpg)
   with optional alt text in home-shield/photos/alt.json:
     { "<slot>": { "en": "...", "es": "..." } }
   The badge: assets/aria-star/shield-badge.webp (or .png).
   ================================================================== */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const PAGE = "home-shield/index.html";
export const SLOTS = {
  hero: { w: 1600, h: 1000, note: "homeowners at home, warm and real (wide band under the hero)" },
  door1: { w: 1200, h: 800, note: "a homeowner reading their policy at the kitchen table" },
  door2: { w: 1200, h: 800, note: "a homeowner with a letter / on the phone with their insurer" },
  door3: { w: 1200, h: 800, note: "a roofer on a roof (the real trade at work)" },
  pros: { w: 1200, h: 800, note: "a licensed pro meeting a homeowner at the front door" },
  how: { w: 1600, h: 900, note: "a homeowner talking on the phone, calm" },
  privacy: { w: 1600, h: 900, note: "a family on their porch" },
};
const MARK = /\/\*HS-ASSETS:START\*\/[\s\S]*?\/\*HS-ASSETS:END\*\//;

function sizeOf(buf) {
  if (buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") {
    const fourcc = buf.slice(12, 16).toString("latin1");
    if (fourcc === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (fourcc === "VP8L") { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) }; }
    if (fourcc === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

export function buildManifest(root = ROOT) {
  let alt = {};
  try { alt = JSON.parse(readFileSync(join(root, "home-shield/photos/alt.json"), "utf8")); } catch { /* none yet */ }
  const photos = {};
  for (const slot of Object.keys(SLOTS)) {
    for (const ext of ["webp", "jpg"]) {
      const rel = `home-shield/photos/${slot}.${ext}`;
      if (!existsSync(join(root, rel))) continue;
      const dim = sizeOf(readFileSync(join(root, rel))) || {};
      photos[slot] = { src: "/" + rel, w: dim.w || null, h: dim.h || null, alt: alt[slot] || null };
      break;
    }
  }
  let badge = null;
  for (const ext of ["webp", "png"]) {
    const rel = `assets/aria-star/shield-badge.${ext}`;
    if (existsSync(join(root, rel))) { badge = "/" + rel; break; }
  }
  return { photos, badge };
}

export function stamp(html, manifest) {
  return html.replace(MARK, `/*HS-ASSETS:START*/${JSON.stringify(manifest)}/*HS-ASSETS:END*/`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = join(ROOT, PAGE);
  const html = readFileSync(file, "utf8");
  if (!MARK.test(html)) { console.error("HS-ASSETS markers missing in " + PAGE); process.exit(1); }
  const next = stamp(html, buildManifest());
  if (process.argv.includes("--check")) {
    if (next !== html) { console.error("home-shield asset manifest is stale: run node scripts/build-home-shield-assets.mjs"); process.exit(1); }
    console.log("home-shield assets: manifest matches the files");
  } else {
    if (next !== html) writeFileSync(file, next);
    const m = buildManifest();
    console.log(`home-shield assets: ${Object.keys(m.photos).length} photo(s), badge ${m.badge ? "yes" : "no"}`);
  }
}

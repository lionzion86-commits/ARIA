#!/usr/bin/env node
/* ============================================================
   THE HOMEPAGE CAROUSELS KNOW WHICH CARDS HOLD 2+ PHOTOS (#443).

   Every card file the homepage paints from -- the store and category
   shelves (assets/home/shelves/), the audience pill shelves
   (assets/home/pills/) and the store rail pills
   (assets/home/store-pills/) and the Tiendas carousels' rails
   (assets/home/tiendas/) -- gets `ph` on each card with two or more
   photos (scripts/lib/photo-counts.js), so the card shows its arrows
   without a request and never a dead button. Idempotent; the shelf
   builders call it after writing.

   RUN after the PDP slices and the homepage builders:
     node scripts/stamp-home-photos.mjs
   ============================================================ */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stampPhotoCounts } from "./lib/photo-counts.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const HOME_CARD_DIRS = ["assets/home/shelves", "assets/home/pills", "assets/home/store-pills", "assets/home/tiendas"];

export function stampHomePhotos(root = ROOT, dirs = HOME_CARD_DIRS) {
  const out = {};
  for (const d of dirs) {
    const dir = join(root, d);
    if (!existsSync(dir)) continue;
    let stamped = 0;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const file = join(dir, f), text = readFileSync(file, "utf8"), body = JSON.parse(text);
      stamped += stampPhotoCounts(root, body);
      const next = JSON.stringify(body);
      if (next !== text) writeFileSync(file, next);
    }
    out[d] = stamped;
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [d, n] of Object.entries(stampHomePhotos())) console.log(`${d}: ${n} cards with 2+ photos`);
}

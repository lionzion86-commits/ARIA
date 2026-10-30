/* ============================================================
   HOW MANY PHOTOS A PRODUCT HAS (#443 c.6522824310, #538 P1).

   assets/js/card-photos.js gives a card arrows only when the card is
   known to hold two or more photos -- never a dead button -- and it must
   know that without a request (the page loads the cover alone). The
   count comes from the product's PDP shard (assets/pdp/p/, written by
   scripts/build-pdp-slices.mjs), the very record card-photos.js fetches
   on the first tap, so a card's count and the gallery it opens agree.
   One photo at several sizes (Dennis Kirk's 75/290/600px, Finish Line's
   crop presets) is collapsed by that build and counts as one.

   Builders stamp `ph` (2..8) on a card only when it is 2 or more.
   ============================================================ */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(s) {
  return String(s || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] ?? m));
}
/* producto.html norm(): the shard key. */
export const titleKey = (s) => decode(s).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
/* producto.html unpackImages(). */
export function unpack(list, image) {
  if (!Array.isArray(list) || !list.length) return image ? [String(image)] : [];
  const out = [];
  let prev = String(image || "");
  for (const e0 of list) {
    const e = String(e0 || ""), m = e.match(/^(\d+)\|/);
    const u = m ? prev.slice(0, +m[1]) + e.slice(m[0].length) : e;
    if (u) out.push(u);
    prev = u;
  }
  return out;
}

const CACHE = new Map();
/* key -> [{ retailer, n }] for every product with 2+ distinct photos. */
export function galleryCounts(root) {
  if (CACHE.has(root)) return CACHE.get(root);
  const dir = join(root, "assets/pdp/p");
  const map = new Map();
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const d = JSON.parse(readFileSync(join(dir, f), "utf8"));
      for (const [key, cands] of Object.entries(d)) {
        for (const r of Array.isArray(cands) ? cands : []) {
          const n = new Set([r.image, ...unpack(r.images, r.image)].filter(Boolean)).size;
          if (n < 2) continue;
          if (!map.has(key)) map.set(key, []);
          map.get(key).push({ retailer: String(r.retailer || "").toLowerCase(), n: Math.min(n, 8) });
        }
      }
    }
  }
  CACHE.set(root, map);
  return map;
}

/* The photo count for a card: 2..8, or 0 when it has one photo. */
export function photoCount(root, title, retailer) {
  const c = galleryCounts(root).get(titleKey(title));
  if (!c) return 0;
  const r = String(retailer || "").toLowerCase();
  const hit = (r && c.find((x) => x.retailer === r)) || (!r && c[0]);
  return hit ? hit.n : 0;
}

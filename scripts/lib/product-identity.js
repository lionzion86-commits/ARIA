/* ============================================================
   ONE PRODUCT, ONE ROW -- THE SAME RULE EVERYWHERE (#443 c.6585655315 P5).

   The storefront (scripts/build-store-slices.mjs dedupeMerged), the
   search index (scripts/build-search-index.mjs) and the brand pages
   (scripts/build-brand-index.mjs) each counted a store's products their
   own way: search merged every row sharing a product link (Victoria's
   Secret's colourways share one: 1,643 on the storefront, 1,308 in
   search), the storefront kept the same photo at two sizes as two cards
   (Kohl's: ?wid=180 and ?wid=342 of one shirt), and rows with no link
   (Old Navy) were one product per title in search, one per photo on the
   storefront.

   A product is its store, its link (or, with none, its title) and its
   photo; the photo is compared without the size knobs a store's image
   server takes (wid, hei, width, odnHeight...). A colourway has its own
   photo and stays its own product.

   Not shared (yet): the generic storefront's audit key (#443
   c.6534989244: same link, same title, same price is one product even
   with another photo) also merges colourways sold under one link --
   Gap 109, New Balance 50 rows -- which search, the brand pages and the
   themed storefronts (Calzedonia, Intimissimi) keep apart.
   ============================================================ */
const SIZE_PARAMS = new Set(["wid", "hei", "width", "height", "w", "h", "odnwidth", "odnheight", "odnbg", "op_sharpen", "qlt", "fmt", "fit", "resmode", "sw", "sh", "size", "dpr", "quality", "q"]);

/* The photo with its size parameters dropped; other query keys kept
   (some image servers name the picture in the query). */
export function imageKey(src) {
  const s = String(src || "").trim();
  const q = s.indexOf("?");
  if (q < 0) return s.toLowerCase();
  const kept = s.slice(q + 1).split("&").filter((kv) => kv && !SIZE_PARAMS.has(kv.split("=")[0].toLowerCase()));
  return (s.slice(0, q) + (kept.length ? "?" + kept.sort().join("&") : "")).toLowerCase();
}

/* The row key: store | link-or-title | photo. */
export function productKey(retailer, url, title, image) {
  return (String(retailer || "") + "|" + (String(url || "") || String(title || "")) + "|" + imageKey(image)).toLowerCase();
}

/* The storefront's title and link keys (build-store-slices.mjs dedupeMerged). */
export const titleKey = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
export function urlKey(u) {
  const m = /^https?:\/\/([^/?#]+)(\/[^?#]*)/i.exec(String(u || ""));
  if (!m) return "";
  const path = m[2].toLowerCase().replace(/\/+$/, "");
  return path.length > 8 ? m[1].toLowerCase().replace(/^www\./, "") + path : "";
}
/* Every key a row answers to (search, brand pages). */
export function productKeys(retailer, url, title, image) {
  return [productKey(retailer, url, title, image)];
}
/* A seen-set over productKeys: true when the row is new (and records it). */
export function firstSighting(seen, keys) {
  if (keys.some((k) => seen.has(k))) { for (const k of keys) seen.add(k); return false; }
  for (const k of keys) seen.add(k);
  return true;
}

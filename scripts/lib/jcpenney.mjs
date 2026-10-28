/* ============================================================
   JCPENNEY: THE PHOTO ROUTE AND THE SLICE (#443 c.6470386941 item 1).

   The 2026-10-27 pull (catalog-pulls/2026-10-27/jcpenney.json, 10,104
   variation rows, 9,647 products) carries every photo as a Scene7 ASSET
   ID ("DP70235361-20260805203003M"), not a URL. The standing data rule
   forbids constructing an image URL, so the IDs are resolved from
   JCPenney's own product pages: each PDP's HTML embeds the full Scene7
   URLs of its photos, and the URL whose path holds the asset ID is that
   photo, captured, not built (scripts/resolve-jcpenney-images.mjs
   fetches the pages; scene7UrlsIn reads them).

   No image, no card: a product whose main photo did not resolve is left
   out of the catalogue, whatever else it has.
   ============================================================ */

const ASSET_RX = /^DP[0-9A-Z]+-\d{14}[A-Z]$/;
/* A Scene7 image URL in the page: any scene7.com host, path /is/image/. */
const SCENE7_URL_RX = /https?:\/\/[a-z0-9.-]*scene7\.com\/is\/image\/[^\s"'<>\\)]+/gi;

export const isAssetId = (s) => ASSET_RX.test(String(s || ""));

/** Every asset ID a pulled row names, main photo first. */
export function assetIdsOf(row) {
  const ids = [row?.image_url, row?.group_image, ...(Array.isArray(row?.alt_images) ? row.alt_images : [])]
    .map((s) => String(s || "").trim()).filter(isAssetId);
  return [...new Set(ids)];
}

/** asset ID -> the URL the page itself uses for it (query string dropped, https). */
export function scene7UrlsIn(html, wanted = null) {
  const out = new Map();
  const text = String(html || "").replace(/\\u002F/gi, "/").replace(/\\\//g, "/").replace(/&amp;/g, "&");
  for (const m of text.matchAll(SCENE7_URL_RX)) {
    const url = m[0].replace(/^http:/i, "https:").split(/[?#]/)[0];
    const last = decodeURIComponent(url.split("/").pop() || "");
    const id = last.replace(/\.(jpe?g|png|webp|tif)$/i, "");
    if (!isAssetId(id)) continue;
    if (wanted && !wanted.has(id)) continue;
    if (!out.has(id)) out.set(id, url);
  }
  return out;
}

/** The product page a row belongs to (absolute, without the tracking query). */
export function pdpUrlOf(row) {
  const u = String(row?.url || "").split("?")[0];
  if (!u) return "";
  return /^https?:\/\//i.test(u) ? u : "https://www.jcpenney.com" + (u.startsWith("/") ? u : "/" + u);
}

/* ---------------- the slice ---------------- */
const first = (v) => (Array.isArray(v) ? v[0] : v) || "";
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const DEPTS = {
  shoes: "Zapatos", jewelry: "Joyas y relojes", handbags: "Carteras y accesorios", fragrance: "Perfumes",
  beauty: "Belleza", home: "Hogar", women: "Mujer", men: "Hombre", kids: "Niños", clothing: "Ropa",
};
const TYPE_DEPT = [
  [/^(shoes|sandals|boots)$/, "shoes"],
  [/^(watches|earrings|necklaces|jewelry sets|bracelets|rings)$/, "jewelry"],
  [/^(handbags|bags|small accessories|wallets)$/, "handbags"],
  [/^fragrance$/, "fragrance"],
  [/^(makeup|makeup tools & brushes|skincare|bath & body)$/, "beauty"],
  [/^(sheets|towels|bed coverings|pillow & cushion covers|bedding sets|organizers)$/, "home"],
];
export function deptOf(row) {
  const t = String(first(row.product_type)).toLowerCase();
  for (const [rx, d] of TYPE_DEPT) if (rx.test(t)) return d;
  const g = String(first(row.gender)).toLowerCase();
  if (g === "girls" || g === "boys") return "kids";
  if (g === "women") return "women";
  if (g === "mens") return "men";
  return "clothing";
}
const SIZED = new Set(["shoes", "women", "men", "kids", "clothing"]);
const stripHtml = (s) => String(s || "").replace(/<li[^>]*>/gi, ". ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").replace(/^[\s.]+/, "").trim();
const title = (s) => String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());

/** Rows -> { departments, skipped }. `images` maps asset ID -> captured URL. */
export function normalizeJcpenney(rows, images) {
  const skipped = {};
  const skip = (why) => { skipped[why] = (skipped[why] || 0) + 1; };
  const byId = new Map();
  for (const r of rows || []) {
    if (!r || !r.id) { skip("no id"); continue; }
    if (!byId.has(r.id)) byId.set(r.id, []);
    byId.get(r.id).push(r);
  }
  const departments = {};
  for (const [id, group] of byId) {
    const r = group[0];
    const name = String(r.product_title || "").trim();
    if (!name) { skip("no name"); continue; }
    const price = num(r.effective_price_min) || num(r.price_min);
    if (!price) { skip("no price"); continue; }
    const ids = [...new Set(group.flatMap(assetIdsOf))];
    const photos = ids.map((a) => images.get ? images.get(a) : images[a]).filter(Boolean);
    const main = images.get ? images.get(assetIdsOf(r)[0]) : images[assetIdsOf(r)[0]];
    if (!main) { skip("no captured photo"); continue; }
    const dept = deptOf(r);
    const sizes = [...new Set(group.flatMap((g) => (Array.isArray(g.size) ? g.size : [])).map((s) => String(s).trim()).filter(Boolean))];
    const orig = num(r.original_price_min);
    const brand = String(r.brand || "").trim().toLowerCase() === "more brands" ? "" : title(r.brand);
    const it = {
      name, brand, price, currency: "USD", image: main, images: [main, ...photos.filter((p) => p !== main)],
      url: pdpUrlOf(r), sku: id, retailer: "jcpenney", type: String(first(r.product_type)),
      color: String(first(r.color)), sizes,
      description: "", description_en: stripHtml(r.description),
    };
    if (orig > price) { it.originalPrice = orig; it.onSale = true; }
    if (SIZED.has(dept) && !sizes.length) it.sizesPending = true;
    (departments[dept] = departments[dept] || { label: DEPTS[dept], items: [] }).items.push(it);
  }
  return { departments, skipped, products: byId.size };
}

/* ============================================================
   VARIANT FAMILIES: THE STORE'S OWN VARIANT STRUCTURE (#443, universal
   variant truth; supersedes the title-only Phase 1 for any store whose
   source carries real variants).

   scripts/lib/variants.mjs finds colourways from what a store writes in
   its titles, URLs and photo names. Some sources say it outright:

     Walmart   productDetails (the variant-family pull): per product,
               variants: [{ name: "Actual Color", values: [{ name,
               product_id, available, swatch_url, selected }] }], and
               sometimes a "Pack Size" axis. walmart.com/ip/<product_id>
               resolves to each child.
     Macy's    the Apify export's traits.colors.colorMap: each colour's
               own photos; the price says whether it applies to every
               colour (pricing.price.priceType.applicableToAllUpcs).

   Each parser turns its source into FAMILIES, one shape for every store
   (scripts/data/variant-families/<source>.json):

     { key, retailer, axis: "Tono" | "Color", members: [Member],
       pending: [{ id, label, reason }] }
     Member: { id, label, url, vkey?, name?, brand?, price?, wasPrice?,
               image?, images?, available?, selected?, sizesPending?,
               priceFromAnchor? }

   NEVER INVENT. A member is offered only with a real price and a real
   photo -- from the pull itself, or from the catalogue listing it
   matches at build time (applyFamilies). Anything else is listed as
   pending ("detalle pendiente"), never shown as buyable. A family with
   no variant list, or one child, stays a single product.

   A SECOND DETAIL PASS DROPS IN. The Walmart parser merges every entry
   it is given by product_id: an entry for a sibling (its own selected
   value, price, photos) turns that sibling from pending into a member.
   So a later pull of the siblings' details is one more JSON file in a
   scripts/data/variant-pulls/walmart-beauty-* folder; no code changes.
   ============================================================ */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { variantIdOf, groupIdOf, colourSuffix, midColour } from "./variants.mjs";
import { isShoeForDept } from "./footwear.js";

export const FAMILIES_DIR = "scripts/data/variant-families";

const low = (s) => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
const titleCase = (s) => String(s).toLowerCase().replace(/(^|[\s\/(&-])([a-z])/g, (m, a, c) => a + c.toUpperCase());
const num = (x) => {
  if (x && typeof x === "object") return num(x.price ?? x.amount ?? x.value ?? x.currentPrice ?? x.current_price);
  const n = Number(String(x ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};
const httpUrl = (u) => (typeof u === "string" && /^https?:\/\/[^\s\/?#]+/i.test(u.trim()) ? u.trim() : "");

/* ---------------- shade names ---------------- */
/* "07 Warm Up", "#07 Warm Up", "Warm Up 07", "WARM UP", "No. 7 Warm Up"
   are one shade. Digits and punctuation at the ends go; case goes. */
export function shadeKey(name) {
  let s = low(name).replace(/[‘’']/g, "");
  s = s.replace(/^(?:no\.?\s*|n[°º]\s*|#\s*)?\d{1,4}[a-z]?\s*[-.:,)]?\s+/, "");
  s = s.replace(/\s+[-(,]?\s*(?:no\.?\s*|#\s*)?\d{1,4}[a-z]?\)?$/, "");
  return s.replace(/[^a-z0-9]+/g, " ").trim();
}
const numbered = (name) => /(^|\s)#?\d{1,4}[a-z]?(\s|$)/i.test(String(name || "").trim());
/* The store's own text; an ALL-CAPS old name is title-cased at most. */
export function shadeLabel(name) {
  const t = String(name || "").trim().replace(/\s+/g, " ");
  return /[a-z]/.test(t) ? t : titleCase(t);
}

/* ---------------- pack sizes ---------------- */
const PACK_AXIS = /\b(pack|count|quantity|multi-?pack)\b/i;
const COLOR_AXIS = /\b(colou?r|shade|tono)\b/i;
export function packCount(name) {
  const s = low(name);
  if (/\b(single|individual)\b/.test(s)) return 1;
  let m = /\b(?:pack|set) of (\d+)\b/.exec(s) || /\b(\d+)\s*-?\s*(?:pk|pack|packs|count|ct|piece|pieces|pc|pcs|units?)\b/.exec(s);
  if (m) return Number(m[1]);
  if (/\bmulti-?pack\b/.test(s)) return 2;
  return /\d/.test(s) ? 0 : 1;
}
export const isMultipack = (name) => packCount(name) > 1;

/* ---------------- Walmart productDetails ---------------- */
const pidOf = (x) => String((x && (x.product_id ?? x.productId ?? x.id)) || "").trim();
/* The numeric item id in a walmart.com/ip/<slug>/<id> URL, or the
   product_id in /ip/<product_id>. */
export function walmartIds(url) {
  const u = String(url || "").replace(/[?#].*$/, "");
  const out = [];
  const m = /\/ip\/(?:[^\/]+\/)?([A-Za-z0-9]+)\/?$/.exec(u);
  if (m) out.push(m[1].toUpperCase());
  return out;
}
function imagesOf(e) {
  const raw = [];
  for (const k of ["images", "image_urls", "imageUrls", "gallery"]) if (Array.isArray(e[k])) raw.push(...e[k]);
  for (const k of ["image", "main_image", "mainImage", "image_url", "imageUrl", "thumbnail"]) if (e[k]) raw.unshift(e[k]);
  const seen = new Set(), out = [];
  for (const x of raw) {
    const u = httpUrl(typeof x === "string" ? x : x && (x.url || x.src || x.large || x.main));
    if (u && !seen.has(u)) { seen.add(u); out.push(u); }
  }
  return out.slice(0, 12);
}
function availableOf(e) {
  for (const k of ["available", "in_stock", "inStock", "is_available"]) if (typeof e[k] === "boolean") return e[k];
  const s = low(e.availability || e.availabilityStatus || e.stock_status || "");
  if (s) return !/out|unavailable|not available|sold/.test(s);
  return undefined;
}
function axesOf(e) {
  const list = Array.isArray(e && e.variants) ? e.variants : Array.isArray(e && e.variantList) ? e.variantList : [];
  let color = null, pack = null;
  for (const a of list) {
    const vals = Array.isArray(a && a.values) ? a.values : [];
    if (!color && COLOR_AXIS.test(String(a && a.name || ""))) color = vals;
    else if (!pack && PACK_AXIS.test(String(a && a.name || ""))) pack = vals;
  }
  return { color: color || [], pack: pack || [] };
}

/* THE SHAPE THE PULL REALLY RETURNED (Data Drop 1, data/shades-walmart-
   2026-11-01/dataset.json, e-commerce/walmart-product-detail-scraper):
   each page carries variantList: [{ productId, usItemId, url, imageUrl,
   allImages, priceInfo: { price: "$10.97", wasPrice }, availabilityStatus,
   variants: ["actual_color-07warmup", "multipack_quantity-1", "size-..."] }]
   -- every child with its own URL, price and photo. */
const isVariantListShape = (products) => (products || []).some((e) => e && Array.isArray(e.variantList) && e.variantList.some((v) => v && v.usItemId && Array.isArray(v.variants)));
const tokenOf = (v, axis) => {
  const t = (v.variants || []).find((x) => String(x).startsWith(axis + "-"));
  return t ? String(t).slice(axis.length + 1) : "";
};
const squash = (s) => low(s).replace(/[^a-z0-9]/g, "");
/* The shade's words as the store writes them in the child's own URL: the
   token "07warmup" is the run "Warm-Up" of ".../Lip-Lingerie-XXL-Liquid-
   Lipstick-Warm-Up-0-13-fl-oz/161629972"; a leading shade number in the
   token is kept ("07 Warm Up"). No run: the page's own name when it is
   in the pull, else the token's words as they are. */
export function walmartShadeLabel(token, url, pageName) {
  const num = (/^(\d{1,4})(?=-?[a-z])/i.exec(token) || [])[1] || "";
  const core = squash(token).replace(/^\d+/, "");
  const slug = (/\/ip\/([^\/?#]+)\//.exec(String(url || "")) || [])[1] || "";
  const words = slug.split("-").filter(Boolean);
  /* Exact first; then without vowels ("undressd" is the URL's "Undressed"). */
  const bare = (x) => x.replace(/[aeiou]/g, "");
  for (const same of [(a, b) => a === b, (a, b) => bare(a) === bare(b) && bare(b).length >= 4]) {
    if (!core) break;
    for (let i = 0; i < words.length; i++) {
      let acc = "";
      for (let j = i; j < words.length && acc.length < core.length + 3; j++) {
        acc += squash(words[j]);
        if (same(acc, core)) {
          const run = words.slice(i, j + 1).join(" ");
          const text = /[a-z]/.test(run) ? run : titleCase(run);
          /* THE NUMBER THE STORE PRINTS BEFORE THE NAME (Danny after #583:
             "a dropdown with the numbers"): "...-Lip-Liner-857-Nude-Beige"
             is "857 Nude Beige", not "Nude Beige". */
          const lead = num || (i > 0 && /^\d{2,4}$/.test(words[i - 1]) && !/^(?:spf|up|to|pack|of|x|hr|hrs|\d+)$/i.test(words[i - 2] || "") ? words[i - 1] : "");
          return (lead && !new RegExp("^" + lead + "\\b", "i").test(text) ? lead + " " : "") + text;
        }
      }
    }
  }
  if (pageName) {
    const parts = String(pageName).split(",").map((x) => x.trim());
    const hit = parts.find((x) => squash(x).replace(/^\d+/, "") === core);
    if (hit) return shadeLabel(hit);
  }
  return shadeLabel(String(token).replace(/[-_,]+/g, " ").trim());
}
/* The shade a variant names: "actual_color-..." (makeup), or Walmart's
   "hair_color_shade-..." (TRESemmé Root Touch-Up: black, dark brown). */
const shadeTok = (v) => tokenOf(v, "actual_color") || tokenOf(v, "hair_color_shade");
export function parseWalmartVariantLists(products, opts = {}) {
  const retailer = opts.retailer || "walmart";
  const stats = { pages: 0, families: 0, emptyVariantList: 0, single: 0, members: 0, withDetail: 0, awaitingDetail: 0, multipackSkipped: 0, outOfStock: 0, superseded: 0 };
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const add = (x) => { if (!parent.has(x)) parent.set(x, x); };
  const union = (a, b) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb); };
  const child = new Map(), pageName = new Map(), brandOf = new Map();
  for (const e of products || []) {
    if (!e || typeof e !== "object") continue;
    stats.pages++;
    const own = String(e.usItemId || "");
    if (own) { add(own); pageName.set(own, String(e.name || "")); }
    const list = Array.isArray(e.variantList) ? e.variantList : [];
    if (!list.length) { stats.emptyVariantList++; continue; }
    for (const v of list) {
      const id = String(v && v.usItemId || "");
      if (!id) continue;
      if (own) union(own, id);
      if (!child.has(id)) child.set(id, v);
      if (e.brand) brandOf.set(id, String(e.brand));
    }
  }
  const byRoot = new Map();
  for (const id of child.keys()) { const r = find(id); if (!byRoot.has(r)) byRoot.set(r, []); byRoot.get(r).push(id); }
  const families = [];
  for (const [root, ids] of [...byRoot].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const kids = ids.map((id) => child.get(id)).filter((v) => shadeTok(v));
    const singles = kids.filter((v) => { const q = tokenOf(v, "multipack_quantity"); return !q || Number(q) <= 1; });
    /* A multipack is a shade's pack, never a shade; it stays only when
       the family sells nothing singly. */
    const use = singles.length ? singles : kids;
    stats.multipackSkipped += kids.length - use.length;
    const byShade = new Map();
    for (const v of use) {
      const k = squash(shadeTok(v)).replace(/^\d+/, "") || squash(shadeTok(v));
      if (!byShade.has(k)) byShade.set(k, []);
      byShade.get(k).push(v);
    }
    /* ONE SHADE IS STILL A SHADE (2026-11-03 shade pulls): Costco sells
       each shade as its own item, and Sephora / Ulta list some products
       in one shade. For a gated beauty store that one shade is the
       listing's tono (applyFamilies `own`): named, no picker. Walmart's
       one-shade listings keep their title rule (build-pdp-slices). */
    if (!byShade.size || (byShade.size < 2 && (retailer === "walmart" || !SHADE_PULL_STORES.has(retailer)))) { stats.single++; continue; }
    const members = [], aliases = [];
    const memberOf = (v) => {
      const id = String(v.usItemId);
      const url = httpUrl(v.url) || (retailer === "walmart" ? "https://www.walmart.com/ip/" + id : "");
      const m = { id, itemId: id, label: walmartShadeLabel(shadeTok(v), url, pageName.get(id)), url };
      if (pageName.get(id)) m.name = pageName.get(id);
      if (brandOf.get(id)) m.brand = brandOf.get(id);
      const price = num(v.priceInfo && v.priceInfo.price);
      const was = num(v.priceInfo && v.priceInfo.wasPrice);
      if (price > 0) m.price = price;
      if (was > price && price > 0) m.wasPrice = was;
      const imgs = imagesOf({ image: v.imageUrl, images: v.allImages });
      if (imgs.length) { m.image = imgs[0]; m.images = imgs; }
      const pack = tokenOf(v, "multipack_quantity");
      if (pack && Number(pack) > 1) m.pack = pack + " pack";
      if (v.availabilityStatus) m.available = v.availabilityStatus === "IN_STOCK";
      if (m.available === false) stats.outOfStock++;
      if (m.price > 0 && m.image) stats.withDetail++; else stats.awaitingDetail++;
      return m;
    };
    for (const group of byShade.values()) {
      const score = (v) => (pageName.has(String(v.usItemId)) ? 8 : 0) + (num(v.priceInfo && v.priceInfo.price) > 0 && (v.imageUrl || (v.allImages || []).length) ? 4 : 0)
        + (v.availabilityStatus === "IN_STOCK" ? 2 : 0) + (/^\d/.test(shadeTok(v)) ? 1 : 0);
      group.sort((a, b) => score(b) - score(a));
      stats.superseded += group.length - 1;
      members.push(memberOf(group[0]));
      /* THE SAME SHADE UNDER ANOTHER SKU (a gated beauty store's mini or
         second size: Sephora's «M·A·CStack ... Mini» is «Blackstack» too):
         not a second entry in the picker, but that SKU's listing is sold
         in that shade -- a one-shade family of its own. */
      if (retailer !== "walmart" && SHADE_PULL_STORES.has(retailer)) {
        const seen = new Set([String(group[0].usItemId)]);
        for (const v of group.slice(1)) {
          const id = String(v.usItemId);
          if (seen.has(id)) continue;
          seen.add(id);
          aliases.push(memberOf(v));
        }
      }
    }
    /* Walmart titles each shade; a beauty store's shades share the product's title. */
    families.push({ key: (retailer === "walmart" ? "walmart" : retailer) + ":" + root, retailer, axis: opts.axis || "Tono", members, pending: [],
      ...(retailer === "walmart" ? { nameFromUrl: true } : { sameTitle: true }), ...(members.length === 1 ? { oneShade: true } : {}) });
    stats.families++; stats.members += members.length;
    if (members.length === 1) stats.oneShade = (stats.oneShade || 0) + 1;
    for (const m of aliases) {
      families.push({ key: retailer + ":" + root + ":" + m.id, retailer, axis: opts.axis || "Tono", members: [m], pending: [], sameTitle: true, oneShade: true });
      stats.sameShadeSku = (stats.sameShadeSku || 0) + 1;
    }
  }
  return { families, stats };
}

/* ---------------- manual shade curation (2026-11-03) ---------------- */
/* data/shade-pulls-2026-11-03/MANUAL-REPORT.md: the data lane read each
   gated listing's own page and wrote its shades down, verbatim, in the
   same variantList shape -- but with no price, photo or stock per shade
   (none written). Each row is ONE LISTING: its top-level url is the
   worklist listing, its variantList the shades that page sells.

     SKU stores (Sephora, Ulta, Walmart, Costco): a shade is its own SKU.
       The listing whose SKU is a shade's is sold in that shade; a shade
       our catalogue has no listing for (no price, no photo) is pending,
       never offered. One SKU listing several shades with
       multipack_quantity-N is a pack's contents (Costco «Shades: nOOHde,
       MUAH-ve, p-INKED, HEY-zel»): one listing, sold as those shades.
     Page stores (YesStyle pid, Victoria's Secret catalog id): one product
       page sells every shade (YesStyle: one pid per family, verified;
       the slug changes, the pid never does). The shades are choices ON
       THAT LISTING -- its own page, price and photos (`page`); nothing
       new is listed. A Victoria's Secret listing whose title names one of
       the shades is that shade.
   The label is the store's text exactly as written (no title-casing,
   no hyphens turned to spaces). */
export const PAGE_STORES = new Set(["yesstyle", "victoriassecret"]);
const manualLabel = (v) => String(tokenOf(v, "actual_color") || tokenOf(v, "hair_color_shade") || "").trim().replace(/\s+/g, " ");
export function parseManualShades(rows, opts = {}) {
  const retailer = String(opts.retailer || "").toLowerCase();
  const stats = { listings: 0, families: 0, members: 0, packContents: 0, notOnPage: 0 };
  const families = [];
  for (const e of rows || []) {
    if (!e || typeof e !== "object" || !Array.isArray(e.variantList)) continue;
    stats.listings++;
    const kids = e.variantList.filter((v) => v && manualLabel(v));
    if (!kids.length) continue;
    const top = String(e.usItemId || "").trim();
    if (PAGE_STORES.has(retailer)) {
      const page = shadeSkuOf(e.url) || top.toUpperCase();
      const seen = new Set(), members = [];
      for (const v of kids) {
        const label = manualLabel(v);
        if (seen.has(low(label))) continue;
        seen.add(low(label));
        const m = { id: page + ":" + label, label, url: httpUrl(v.url) || "" };
        if (v.usItemId) m.itemId = String(v.usItemId);
        /* YesStyle: a shade whose own URL is another pid is not on this page. */
        const pid = retailer === "yesstyle" ? shadeSkuOf(v.url) : "";
        if (pid && pid !== page) { m.otherPage = pid; stats.notOnPage++; }
        members.push(m);
      }
      families.push({ key: retailer + ":page:" + page, retailer, axis: "Tono", page, manual: true, members, pending: [] });
      stats.families++; stats.members += members.length;
      continue;
    }
    /* SKU stores: one member per SKU; one SKU naming several shades in a
       multipack is the pack's contents. */
    const byId = new Map();
    for (const v of kids) {
      const id = String(v.usItemId || "").trim();
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(v);
    }
    const members = [];
    for (const [id, vs] of byId) {
      const labels = [...new Set(vs.map(manualLabel))];
      const q = Number(tokenOf(vs[0], "multipack_quantity")) || 0;
      if (labels.length > 1 && !(q > 1)) continue;   // two shades on one SKU, no pack: not ours to guess
      const url = httpUrl(vs[0].url) || (retailer === "walmart" ? "https://www.walmart.com/ip/" + id : "");
      const m = { id, itemId: id, label: labels.join(", "), url };
      if (q > 1) m.pack = q + " pack";
      if (labels.length > 1) { m.contents = labels; stats.packContents++; }
      members.push(m);
    }
    if (!members.length) continue;
    /* Two listings on one SKU (Sephora's «Lash Brag» and its mini): one family. */
    const key = retailer + ":manual:" + (top || members[0].id);
    if (families.some((f) => f.key === key)) { stats.sameSku = (stats.sameSku || 0) + 1; continue; }
    families.push({ key, retailer, axis: "Tono", manual: true, members, pending: [],
      ...(retailer === "walmart" ? { nameFromUrl: true } : { sameTitle: true }), ...(members.length === 1 ? { oneShade: true } : {}) });
    stats.families++; stats.members += members.length;
  }
  return { families, stats };
}
const isManualRow = (e) => !!(e && e.__manual);
/* A pull's rows, the manual ones parsed apart. */
function withManual(list, retailer, parse) {
  const manual = (list || []).filter(isManualRow);
  const rest = manual.length ? (list || []).filter((e) => !isManualRow(e)) : list;
  const a = rest && rest.length ? parse(rest) : { families: [], stats: {} };
  if (!manual.length) return a;
  const b = parseManualShades(manual, { retailer });
  return { families: a.families.concat(b.families), stats: { ...a.stats, manual: b.stats } };
}

/* products: every productDetails entry from every pull file (first pass
   and any sibling detail pass). Returns { families, stats }. */
export function parseWalmartFamilies(products, opts = {}) {
  if ((products || []).some(isManualRow)) return withManual(products, opts.retailer || "walmart", (rest) => parseWalmartFamilies(rest, opts));
  if (isVariantListShape(products)) return parseWalmartVariantLists(products, opts);
  const retailer = opts.retailer || "walmart";
  const stats = { entries: 0, families: 0, single: 0, members: 0, withDetail: 0, awaitingDetail: 0, superseded: 0, multipackSkipped: 0 };
  /* 1. Every entry's own child id and its detail. */
  const detail = new Map();          // product_id -> { e, price, images, available, pack }
  const entries = [];
  for (const e of products || []) {
    if (!e || typeof e !== "object") continue;
    stats.entries++;
    const { color, pack } = axesOf(e);
    const sel = color.find((v) => v && v.selected === true);
    const own = pidOf(e) || pidOf(sel);
    const selPack = pack.find((v) => v && v.selected === true);
    /* A multipack listing is not the shade's price when the store also
       sells it singly (the pack is the only option otherwise). */
    const singles = pack.filter((v) => !isMultipack(v && v.name));
    const multipack = !!(selPack && isMultipack(selPack.name) && singles.length);
    const d = { e, own, color, pack, price: num(e.price ?? e.current_price ?? e.sale_price ?? (e.priceInfo && e.priceInfo.currentPrice)),
      wasPrice: num(e.was_price ?? e.wasPrice ?? e.list_price ?? (e.priceInfo && e.priceInfo.wasPrice)),
      images: imagesOf(e), available: availableOf(e), multipack, selPack: selPack ? String(selPack.name || "") : "" };
    entries.push(d);
    if (multipack) { stats.multipackSkipped++; continue; }
    if (own && !detail.has(own)) detail.set(own, d);
    else if (own && detail.has(own) && !(detail.get(own).price > 0 && detail.get(own).images.length) && d.price > 0 && d.images.length) detail.set(own, d);
  }
  /* 2. Families: the Actual Color children that list each other. */
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { if (!parent.has(a)) parent.set(a, a); if (!parent.has(b)) parent.set(b, b); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb); };
  const values = new Map();          // product_id -> [{ name, available, selected }]
  const packOnly = new Set();
  for (const d of entries) {
    const ids = d.color.map(pidOf).filter(Boolean);
    if (d.own) { if (!parent.has(d.own)) parent.set(d.own, d.own); }
    for (const v of d.color) {
      const id = pidOf(v);
      if (!id) continue;
      if (!values.has(id)) values.set(id, []);
      values.get(id).push({ name: String(v.name || "").trim(), available: v.available, selected: v.selected === true && id === d.own });
      union(ids[0], id);
    }
    if (d.own && ids.length) union(d.own, ids[0]);
    for (const v of d.pack) { const id = pidOf(v); if (id && id !== d.own) packOnly.add(id); }
  }
  for (const id of values.keys()) packOnly.delete(id);
  /* A multipack child (sold singly too) is never a shade of its own. */
  for (const d of entries) if (d.multipack && d.own) packOnly.add(d.own);
  const byRoot = new Map();
  for (const id of parent.keys()) {
    if (packOnly.has(id)) continue;
    const r = find(id);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(id);
  }
  /* 3. Each family: one member per shade, the current generation. */
  const families = [];
  for (const [root, ids] of [...byRoot].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const kids = ids.filter((id) => values.has(id));
    if (kids.length < 2) { stats.single++; continue; }
    const cands = kids.map((id) => {
      const vs = values.get(id);
      const d = detail.get(id);
      const sel = vs.find((v) => v.selected) || null;
      const name = (sel || vs.find((v) => v.name) || {}).name || "";
      const avail = d && typeof d.available === "boolean" ? d.available
        : vs.some((v) => v.available === true) ? true : vs.some((v) => v.available === false) ? false : undefined;
      const hasDetail = !!(d && d.price > 0 && d.images.length);
      const score = (vs.some((v) => v.selected) ? 8 : 0) + (hasDetail ? 4 : 0) + (avail === true ? 2 : 0) + (numbered(name) ? 1 : 0);
      return { id, name, key: shadeKey(name), d, avail, hasDetail, score, selected: vs.some((v) => v.selected) };
    }).filter((c) => c.key);
    const byShade = new Map();
    for (const c of cands) { if (!byShade.has(c.key)) byShade.set(c.key, []); byShade.get(c.key).push(c); }
    const members = [], pending = [];
    for (const group of byShade.values()) {
      group.sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : 1));
      const best = group[0];
      stats.superseded += group.length - 1;
      const label = shadeLabel(best.name);
      const url = httpUrl(best.d && (best.d.e.url || best.d.e.product_url || best.d.e.canonical_url)) || "https://www.walmart.com/ip/" + best.id;
      const m = { id: best.id, label, url };
      const usItem = best.d && String(best.d.e.us_item_id || best.d.e.usItemId || best.d.e.item_id || "").trim();
      if (usItem) m.itemId = usItem;
      if (best.d) {
        const e = best.d.e;
        const name = String(e.name || e.title || e.product_name || "").trim();
        if (name) m.name = name;
        const brand = String(e.brand || (e.brand_info && e.brand_info.name) || "").trim();
        if (brand) m.brand = brand;
        if (best.d.price > 0) m.price = best.d.price;
        if (best.d.wasPrice > best.d.price) m.wasPrice = best.d.wasPrice;
        if (best.d.images.length) { m.image = best.d.images[0]; m.images = best.d.images; }
        if (best.d.selPack) m.pack = best.d.selPack;
      }
      if (typeof best.avail === "boolean") m.available = best.avail;
      if (best.selected) m.selected = true;
      if (m.price > 0 && m.image) stats.withDetail++; else stats.awaitingDetail++;
      members.push(m);
    }
    /* Members without real detail stay pending until applyFamilies finds
       them in the catalogue; the order is the store's (as listed). */
    const fam = { key: "walmart:" + root, retailer, axis: opts.axis || "Tono", members, pending };
    families.push(fam);
    stats.families++;
    stats.members += members.length;
  }
  return { families, stats };
}

/* Every productDetails entry under a variant-pulls folder: each
   walmart-beauty-* directory's JSON files (dataset.json first, then any
   later detail pass), arrays or { items | products | data }. */
export function readWalmartPulls(dir) {
  const out = [], files = [];
  if (Array.isArray(dir)) {
    for (const d of dir) { const r = readWalmartPulls(d); if (r.files.length) return r; }
    return { products: out, files };
  }
  if (!existsSync(dir)) return { products: out, files };
  for (const sub of readdirSync(dir).sort()) {
    if (!/^(walmart-beauty-|shades-walmart-)/.test(sub)) continue;
    const d = join(dir, sub);
    let names = [];
    try { names = readdirSync(d).filter((f) => /\.json$/i.test(f) && !/^families\.json$/i.test(f)); } catch { continue; }
    names.sort((a, b) => (a === "dataset.json" ? -1 : b === "dataset.json" ? 1 : a < b ? -1 : 1));
    for (const f of names) {
      const j = JSON.parse(readFileSync(join(d, f), "utf8"));
      const list = Array.isArray(j) ? j : (j && (j.items || j.products || j.data)) || [];
      if (!Array.isArray(list)) continue;
      /* Only product pages (classification.json, urls.json sit beside them). */
      const pages = list.filter((e) => e && typeof e === "object" && (Array.isArray(e.variantList) || Array.isArray(e.variants)));
      if (!pages.length) continue;
      out.push(...pages);
      files.push(join(sub, f));
    }
  }
  return { products: out, files };
}

/* ---------------- Macy's colorMap ---------------- */
/* The image base and parameters build-macys-catalog.mjs uses. */
const MACYS_IMAGE_BASE = "https://slimages.macysassets.com/is/image/MCY/products/";
const MACYS_IMAGE_PARAMS = "?wid=600&qlt=85&fmt=jpeg";
const macysImage = (fp) => (typeof fp === "string" && fp.trim() ? MACYS_IMAGE_BASE + fp.trim().replace(/^\/+/, "") + MACYS_IMAGE_PARAMS : "");
export function macysId(url) {
  const m = /[?&]ID=(\d+)/i.exec(String(url || ""));
  return m ? m[1] : "";
}
export function parseMacysFamilies(products) {
  const stats = { products: 0, families: 0, single: 0, members: 0, pending: 0 };
  const families = [];
  for (const p of products || []) {
    if (!p || typeof p !== "object") continue;
    stats.products++;
    const colors = (p.traits && p.traits.colors) || {};
    const map = Array.isArray(colors.colorMap) ? colors.colorMap : [];
    const id = String((p.identifier && p.identifier.productId) || p.id || "");
    if (!id || map.length < 2) { stats.single++; continue; }
    const selId = colors.selectedColor && colors.selectedColor.id;
    const allUpcs = !!(p.pricing && p.pricing.price && p.pricing.price.priceType && p.pricing.price.priceType.applicableToAllUpcs === true);
    const seen = new Set(), members = [], pending = [];
    for (const c of map) {
      const label = String(c && c.name || "").trim();
      if (!label || seen.has(low(label))) continue;
      seen.add(low(label));
      const im = (c.imagery || {});
      const imgs = [im.primaryImage && im.primaryImage.filePath, ...((im.additionalImageSource || []).map((x) => x && x.filePath))].map(macysImage).filter(Boolean);
      const images = [...new Set(imgs)].slice(0, 8);
      const selected = c.id === selId;
      const m = { id: id + ":" + c.id, label, anchorId: id, selected };
      if (!selected) m.vkey = "macys:" + id + ":color:" + c.id;
      if (images.length) { m.image = images[0]; m.images = images; }
      /* One price for every colour only when Macy's says so; otherwise
         this colour's price is not in the export. */
      if (!selected && allUpcs) m.priceFromAnchor = true;
      /* The export's sizes are the product's, not this colour's. */
      if (!selected) m.sizesPending = true;
      if (selected || (images.length && allUpcs)) members.push(m);
      else pending.push({ id: m.id, label, reason: images.length ? "precio por color no publicado" : "sin foto del color" });
    }
    if (members.length < 2) { stats.single++; continue; }
    families.push({ key: "macys:" + id, retailer: "macys", axis: "Color", anchorId: id, sameTitle: true, members, pending });
    stats.families++; stats.members += members.length; stats.pending += pending.length;
  }
  return { families, stats };
}

/* A child the pull has no page for: its title is the store's own words
   from its product URL ("...-Lipstick-Peach-Flirt-0-13-fl-oz" ->
   "... Lipstick Peach Flirt 0.13 fl oz"). */
export function nameFromUrl(url) {
  const slug = (/\/ip\/([^\/?#]+)\//.exec(String(url || "")) || [])[1] || "";
  if (!slug) return "";
  return decodeURIComponent(slug).replace(/(\d)-(\d)/g, "$1.$2").replace(/-+/g, " ").replace(/\s+/g, " ").trim();
}

/* ---------------- loading and applying ---------------- */
export function loadFamilies(root) {
  const dir = join(root, FAMILIES_DIR);
  const out = [];
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => /\.json$/.test(x)).sort()) {
    const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const fam of (j && j.families) || []) out.push({ ...fam, source: FAMILIES_DIR + "/" + f });
  }
  return out;
}

const listingKeys = (l) => {
  const r = String(l.retailer || "").toLowerCase();
  const keys = [];
  if (r === "walmart") for (const id of walmartIds(l.url)) keys.push("walmart|id|" + id);
  if (r === "macys") { const id = macysId(l.url); if (id) keys.push("macys|id|" + id); }
  if (SHADE_PULL_STORES.has(r)) { const sku = shadeSkuOf(l.url); if (sku) keys.push(r + "|sku|" + sku); }
  if (l.url) keys.push(r + "|url|" + normUrl(l.url));
  const h = /\/products\/([^\/?#]+)/.exec(String(l.url || ""));
  if (h) keys.push(r + "|handle|" + h[1].toLowerCase());
  if (l.name) keys.push(r + "|name|" + low(l.name));
  return keys;
};
/* A catalogue listing's model, as a live-feed family names it. */
function modelKeyOf(l) {
  const r = String(l.retailer || "").toLowerCase();
  if (r === "zumiez") { const m = midColour(l.name); return m ? [low(l.brand) + "|" + low(m.model) + "|" + low(m.tail), m.colour] : null; }
  const m = colourSuffix(l.name);
  return m ? [low(l.brand) + "|" + low(m.model), m.colour] : null;
}
/* SHADE PULLS FOR THE GATED BEAUTY STORES (data/shade-pull-worklist-*):
   each shade is its own SKU, and the store's URL names it -- Ulta
   "?sku=2640692", Sephora "?skuId=2985836", YesStyle "pid.1113888108",
   Costco ".product.100519419.html", Victoria's Secret "/5000011132". A
   catalogue listing and a pulled shade meet on that id, never on the
   product URL alone (every shade of a product shares it). */
export const SHADE_PULL_STORES = new Set(["ulta", "sephora", "yesstyle", "costco", "victoriassecret"]);
export function shadeSkuOf(url) {
  const u = String(url || "");
  const m = /[?&](?:sku|skuid|sku_id)=([A-Za-z0-9_-]+)/i.exec(u) || /\/pid\.(\d+)/i.exec(u) || /\.product\.(\d+)\.html/i.exec(u) || /\/(\d{6,})(?:[\/?#]|$)/.exec(u);
  return m ? m[1].toUpperCase() : "";
}
const memberKeys = (fam, m) => {
  const r = String(fam.retailer || "").toLowerCase();
  const keys = [];
  if (SHADE_PULL_STORES.has(r)) {
    const own = shadeSkuOf(m.url);
    if (own) keys.push(r + "|sku|" + own);
    if (m.itemId) keys.push(r + "|sku|" + String(m.itemId).toUpperCase());
  }
  if (r === "walmart") {
    for (const id of walmartIds(m.url)) keys.push("walmart|id|" + id);
    if (m.itemId) keys.push("walmart|id|" + String(m.itemId).toUpperCase());
    keys.push("walmart|id|" + String(m.id).toUpperCase());
  }
  if (r === "macys" && m.selected && m.anchorId) keys.push("macys|id|" + m.anchorId);
  if (m.anchor && m.productUrl) keys.push(r + "|url|" + normUrl(m.productUrl));
  if (m.anchor && m.handle) keys.push(r + "|handle|" + String(m.handle).toLowerCase());
  if (m.name && r !== "macys" && (r === "walmart" || m.anchor)) keys.push(r + "|name|" + low(m.name));
  return keys;
};

/* listings: [{ v, retailer, name, brand, url, image, images, price, dept,
   sizes, ... }] (the catalogue, one per v). Returns:
     assign:  Map v -> { g, c, ax, so? }  (catalogue listings in a family)
     own:     Map v -> { c, ax, so? }     (a gated beauty listing sold in
              the one shade its store's list names: no group, no picker)
     extra:   [listing]  members the catalogue lacks, each with its own
              real price and photo, ready to become records
     pending: Map g -> [label]
     stats */
/* all (optional): every catalogue listing, two titles on one URL (one v)
   included -- Victoria's Secret files three nail lacquers on one catalog
   page; each names its own shade (ownByName: v|title -> { c, ax }). */
export function applyFamilies(listings, families, all = null) {
  const index = new Map();
  for (const l of listings) for (const k of listingKeys(l)) if (!index.has(k)) index.set(k, l);
  const assign = new Map(), extra = [], pending = new Map(), own = new Map(), ownByName = new Map();
  let byModel = null, bySku = null;
  const stats = { families: 0, grouped: 0, fromCatalogue: 0, fromPull: 0, pending: 0, single: 0 };
  /* Every catalogue listing on one store SKU / product page (two listings
     can carry one: a full size and its mini, a title filed twice). */
  const skuListings = (k) => {
    if (!bySku) {
      bySku = new Map();
      const seen = new Set();
      for (const l of all || listings) {
        if (seen.has(l.v + "|" + l.name)) continue;
        seen.add(l.v + "|" + l.name);
        for (const x of listingKeys(l)) if (x.includes("|sku|")) { if (!bySku.has(x)) bySku.set(x, []); bySku.get(x).push(l); }
      }
    }
    return bySku.get(k) || [];
  };
  const manualStat = (r, kind) => {
    const M = (stats.manual = stats.manual || {});
    const R = (M[r] = M[r] || { dropdown: 0, oneShade: 0 });
    R[kind]++;
  };
  for (const fam of families) {
    if (fam.page) { applyPageFamily(fam); continue; }
    const g = groupIdOf("family|" + fam.key);
    const ax = fam.axis && fam.axis !== "Color" ? fam.axis : "";
    const matched = fam.members.map((m) => {
      for (const k of memberKeys(fam, m)) if (index.has(k)) return index.get(k);
      return null;
    });
    const anchor = matched.find(Boolean);
    if (!anchor) { stats.single++; continue; }
    const out = [], waiting = (fam.pending || []).map((p) => p.label);
    const labels = new Set(), vs = new Set();
    /* A colourway always has its own photo: a second member showing a
       photo the group already shows is not offered (pending instead). */
    const photos = new Set(matched.filter(Boolean).map((l) => normUrl(l.image)).filter(Boolean));
    fam.members.forEach((m, i) => {
      const l = matched[i];
      if (labels.has(low(m.label))) return;
      if (l) {
        if (vs.has(l.v) || assign.has(l.v)) return;
        out.push({ l, m, own: true });
        labels.add(low(m.label)); vs.add(l.v);
        return;
      }
      const price = m.priceFromAnchor && anchor.price > 0 ? anchor.price : m.price > 0 ? m.price : 0;
      let image = httpUrl(m.image), gallery = null;
      if (!image && m.photoKey) {
        const key = String(m.photoKey).toLowerCase();
        gallery = (Array.isArray(anchor.images) ? anchor.images : []).filter((u) => (String(u).replace(/[?#].*$/, "").split("/").pop() || "").toLowerCase() === key);
        image = httpUrl(gallery[0]);
      }
      const name = fam.sameTitle ? anchor.name : (m.name || (fam.nameFromUrl ? nameFromUrl(m.url) : ""));
      if (!(price > 0) || !image || !name || photos.has(normUrl(image))) { waiting.push(m.label); return; }
      /* A feed row without a URL: the store's own /products/<handle>
         on the host its catalogue listing lives on. */
      const host = (/^https?:\/\/[^\/?#]+/i.exec(String(anchor.url || "")) || [""])[0];
      const url = httpUrl(m.url) || (m.handle && host ? host + "/products/" + m.handle + (m.variantId ? "?variant=" + m.variantId : "") : "") || httpUrl(anchor.url);
      const v = variantIdOf(m.vkey || url, fam.key + "|" + m.id);
      if (vs.has(v)) return;
      const x = { v, retailer: anchor.retailer, name, brand: m.brand || anchor.brand || "", url, price, image,
        images: Array.isArray(m.images) && m.images.length ? m.images.slice(0, 12) : gallery && gallery.length ? gallery : [image], dept: anchor.dept || "",
        __family: fam.source || fam.key };
      if (m.wasPrice > price) x.wasPrice = m.wasPrice;
      if (Array.isArray(m.sizes) && m.sizes.length) {
        x.sizes = m.sizes.slice();
        /* A shoe's colour carries the rest of its run, sold out at the
           store (parseShopifyFamilies soldOutOf): shown agotada, never sold. */
        if (Array.isArray(m.sizesOut) && m.sizesOut.length && isShoeForDept(anchor, anchor.retailer)) {
          const out = m.sizesOut.filter((z) => typeof z === "string" && !x.sizes.includes(z));
          if (out.length) x.sizesOut = out;
        }
      }
      /* A product sold by size never sells without one: no size list of
         its own, sizes por confirmar. */
      else if (m.sizesPending || (Array.isArray(anchor.sizes) && anchor.sizes.length) || anchor.sizesPending) x.sizesPending = true;
      else if (fam.retailer === "macys" && Array.isArray(anchor.sizes)) x.sizes = anchor.sizes;
      out.push({ l: x, m, own: false });
      labels.add(low(m.label)); vs.add(v); photos.add(normUrl(image));
    });
    /* A live feed is the store today: a colourway of this model we still
       hold that the feed no longer sells stays on the page as agotado,
       never buyable at its old price. */
    if (fam.liveFeed && fam.model) {
      if (!byModel) {
        byModel = new Map();
        for (const l of listings) {
          const mk = modelKeyOf(l);
          if (!mk) continue;
          const k = String(l.retailer || "").toLowerCase() + "|" + mk[0];
          if (!byModel.has(k)) byModel.set(k, []);
          byModel.get(k).push({ l, colour: mk[1] });
        }
      }
      for (const { l, colour } of byModel.get(String(fam.retailer).toLowerCase() + "|" + fam.model) || []) {
        /* "White/Black" and "Black/White" are one colourway: the live one stands. */
        const words = (x) => low(x).split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");
        if (vs.has(l.v) || assign.has(l.v) || labels.has(low(colour)) || [...labels].some((x) => words(x) === words(colour))) continue;
        out.push({ l, m: { label: colour, available: false }, own: true });
        labels.add(low(colour)); vs.add(l.v);
        stats.retired = (stats.retired || 0) + 1;
      }
    }
    if (out.length < 2) {
      /* The listing's own shade, from the store's own list (a one-shade
         family, or the only shade of its family that can be offered):
         the tono the page names and the cart line carries. Never a
         shade the pull does not list. */
      const o = out[0];
      if (o && o.own && (SHADE_PULL_STORES.has(String(fam.retailer || "").toLowerCase()) || fam.manual) && (fam.axis || "Tono") === "Tono" && String(o.m.label || "").trim()) {
        own.set(o.l.v, { c: o.m.label, ax: "Tono", ...(o.m.available === false ? { so: 1 } : {}) });
        stats.ownShade = (stats.ownShade || 0) + 1;
        if (fam.manual) {
          manualStat(fam.retailer, "oneShade");
          /* Every listing on that same SKU is that shade too (Sephora files
             «Lash Brag» and its mini under one skuId). */
          const r = String(fam.retailer || "").toLowerCase();
          const sku = shadeSkuOf(o.l.url) || (r === "walmart" ? walmartIds(o.l.url)[0] : "");
          for (const l of sku ? skuListings(r + "|sku|" + sku) : []) {
            if (l.v === o.l.v || own.has(l.v) || assign.has(l.v)) continue;
            own.set(l.v, { c: o.m.label, ax: "Tono" });
            manualStat(fam.retailer, "oneShade");
          }
        }
        const wait = [...new Set(waiting.filter((x) => x && !labels.has(low(x))))];
        if (wait.length) stats.pending += wait.length;
        continue;
      }
      stats.single++; continue;
    }
    stats.families++;
    if (fam.manual) manualStat(fam.retailer, "dropdown");
    const by = (stats.byRetailer = stats.byRetailer || {});
    const R = (by[fam.retailer] = by[fam.retailer] || { pickers: 0, added: 0, pending: 0, agotado: 0 });
    R.pickers++;
    R.added += out.filter((o) => !o.own).length;
    R.agotado += out.filter((o) => o.m.available === false).length;
    R.pending += new Set(waiting.filter((x) => x && !labels.has(low(x)))).size;
    for (const { l, m, own } of out) {
      const a = { g, c: m.label };
      if (ax) a.ax = ax;
      if (m.available === false) a.so = 1;
      assign.set(l.v, a);
      if (own) stats.fromCatalogue++;
      else { extra.push(l); stats.fromPull++; }
      stats.grouped++;
    }
    const wait = [...new Set(waiting.filter((x) => x && !labels.has(low(x))))];
    if (wait.length) { pending.set(g, wait); stats.pending += wait.length; }
  }

  /* ONE PAGE, EVERY SHADE (manual curation, YesStyle pid / Victoria's
     Secret catalog id; parseManualShades). The listings on the page: */
  function applyPageFamily(fam) {
    const r = String(fam.retailer || "").toLowerCase();
    const ls = skuListings(r + "|sku|" + fam.page).filter((l) => !assign.has(l.v) && !own.has(l.v) && !ownByName.has(l.v + "|" + l.name));
    if (!ls.length) { stats.single++; return; }
    const onPage = fam.members.filter((m) => !m.otherPage);
    const waitingOff = fam.members.filter((m) => m.otherPage).map((m) => m.label);
    /* A Victoria's Secret listing whose title names a shade is that shade
       («Very Sexy Scarlet Amber Blossom Nail Lacquer»). */
    const named = new Map(), free = [];
    for (const l of ls) {
      const i = r === "victoriassecret" ? titleNames(onPage, l.name) : -1;
      if (i >= 0 && !named.has(i)) named.set(i, l); else free.push(l);
    }
    if (named.size) {
      const pairs = [...named].map(([i, l]) => ({ l, m: onPage[i] }));
      const waiting = onPage.filter((m, i) => !named.has(i)).map((m) => m.label).concat(waitingOff);
      /* One listing, or titles that share one URL (one id, so no picker
         can tell them apart): each is sold in the shade its title names. */
      if (pairs.length === 1 || new Set(pairs.map((p) => p.l.v)).size < pairs.length) {
        for (const { l, m } of pairs) {
          ownByName.set(l.v + "|" + l.name, { c: m.label, ax: "Tono" });
          stats.ownShade = (stats.ownShade || 0) + 1; manualStat(r, "oneShade");
        }
        return;
      }
      /* Each its own catalogue listing (own photo, own price): the picker. */
      const g = groupIdOf("family|" + fam.key);
      for (const { l, m } of pairs) assign.set(l.v, { g, c: m.label, ax: "Tono" });
      if (waiting.length) { pending.set(g, waiting); stats.pending += waiting.length; }
      stats.families++; stats.grouped += pairs.length; stats.fromCatalogue += pairs.length;
      manualStat(r, "dropdown");
      return;
    }
    if (!onPage.length) { stats.single++; return; }
    const done = new Set();
    for (const l of free) {
      /* Two titles on one URL are one id: the first carries the picker,
         and the other's record shares it (build-pdp-slices). */
      if (done.has(l.v)) continue;
      done.add(l.v);
      /* The listing's own shade, when its URL names it ("...-55n-espresso");
         otherwise the store's first, preselected (the page sells them all). */
      const at = r === "yesstyle" ? slugNames(onPage, l.url, l.name) : -1;
      const ordered = at >= 0 ? [onPage[at], ...onPage.filter((m, i) => i !== at)] : onPage.slice();
      if (ordered.length === 1) {
        own.set(l.v, { c: ordered[0].label, ax: "Tono" });
        stats.ownShade = (stats.ownShade || 0) + 1; manualStat(r, "oneShade");
        continue;
      }
      const g = groupIdOf("family|" + fam.key + "|" + l.v);
      /* sp on the listing too: in this picker no shade has a swatch photo. */
      assign.set(l.v, { g, c: ordered[0].label, ax: "Tono", sp: 1 });
      if (at < 0) stats.pagePreset = (stats.pagePreset || 0) + 1;
      for (const m of ordered.slice(1)) {
        /* The same listing in another shade: its page, its price, its
           photos (sp: the photo is the page's, not the shade's swatch). */
        const v = variantIdOf("page:" + fam.key + "|" + l.v + "|" + encodeURIComponent(m.label));
        const x = { v, retailer: l.retailer, name: l.name, brand: l.brand || "", url: l.url, price: l.price, image: l.image,
          images: Array.isArray(l.images) && l.images.length ? l.images.slice(0, 12) : [l.image], dept: l.dept || "", sp: 1,
          __family: fam.source || fam.key };
        if (l.wasPrice > l.price) x.wasPrice = l.wasPrice;
        if (!(x.price > 0) || !httpUrl(x.image)) continue;
        extra.push(x);
        assign.set(v, { g, c: m.label, ax: "Tono" });
        stats.fromPull++; stats.grouped++;
      }
      stats.grouped++; stats.fromCatalogue++; stats.families++;
      if (waitingOff.length) { pending.set(g, waitingOff); stats.pending += waitingOff.length; }
      manualStat(r, "dropdown");
    }
  }
  return { assign, extra, pending, own, ownByName, stats };
}
/* The member a title names, as whole words ("Scarlet Red"), or -1. */
function titleNames(members, title) {
  const t = " " + low(title).replace(/[^a-z0-9]+/g, " ") + " ";
  let best = -1, len = 0;
  members.forEach((m, i) => {
    const k = low(m.label).replace(/[^a-z0-9]+/g, " ").trim();
    if (k.length >= 3 && t.includes(" " + k + " ") && k.length > len) { best = i; len = k.length; }
  });
  return best;
}
/* The member a YesStyle URL slug names ("...-40-colors-55n-espresso",
   "...-05-light-brown" for «No. 5 Light Brown»), or -1 when none -- or
   more than one equally -- does. Only the slug's shade part is read: the
   words after "- N Colors", or the words the title does not have. */
function slugNames(members, url, title) {
  const slug = (/\/([^\/]+)\/info\.html/i.exec(String(url || "")) || [])[1] || "";
  if (!slug) return -1;
  const words = slug.toLowerCase().split("-").filter(Boolean);
  let at = -1;
  words.forEach((w, i) => { if (/^(?:colou?rs|shades|types|tones)$/.test(w)) at = i; });
  const own = new Set(low(title).split(/[^a-z0-9]+/).filter(Boolean));
  const part = (at >= 0 ? words.slice(at + 1) : words.filter((w) => !own.has(w))).filter((w) => !/^\d+(?:ml|g|pcs?)$/.test(w));
  const p = squash(part.join(""));
  if (!p) return -1;
  const last = part[part.length - 1] || "";
  const scores = members.map((m) => {
    const full = squash(m.label);
    const bare = squash(String(m.label).replace(/^\s*(?:#|no\.?\s*)/i, ""));
    let sc = 0;
    for (const k of [full, bare]) {
      if (k.length >= 3 && p.endsWith(k)) sc = Math.max(sc, 100 + k.length);
      if (p.length >= 3 && k.startsWith(p)) sc = Math.max(sc, 50 + p.length);   // a slug that stops short ("-dark", "-01-ash")
      if (k.length >= 4 && p.includes(k)) sc = Math.max(sc, k.length);
    }
    if (!sc && /^\d+$/.test(last) && new RegExp("^0*" + Number(last) + "(?!\\d)").test(bare)) sc = 1;   // "...-version-02"
    return sc;
  });
  const top = Math.max(0, ...scores);
  if (!top || scores.filter((x) => x === top).length > 1) return -1;
  return scores.indexOf(top);
}

/* ---------------- Shopify products.json (Data Drop 2) ---------------- */
/* Two shapes in one feed:
     in-record   one product, a Color option with several values: each
                 value is a member, priced from its own variants, its
                 photo the variants' featured_image (or the image the
                 store ties to those variant ids), its sizes the other
                 option's values that are available in that colour;
     siblings    one product per colourway (a single Color value, or the
                 colour after " - " in the title): grouped by vendor +
                 model text, exactly as the title rule groups them.
   A colour with no photo of its own, or no price, is pending. */
export const normUrl = (u) => String(u || "").trim().toLowerCase().replace(/[?#].*$/, "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
const SIZE_AXIS = /\b(size|talla|length|width|fit)\b/i;
function shopifyUrl(p, base) {
  const u = httpUrl(p.url || p.product_url || p.link || "");
  if (u) return u.replace(/[?#].*$/, "");
  if (p.handle && base) return String(base).replace(/\/+$/, "") + "/products/" + p.handle;
  return "";
}
/* The rest of a colour's run, sold out at the store (#443 c.6633182280):
   its sizes whose every variant says available:false. They ride as the
   member's `sizesOut` -- shown agotada on a shoe's page, never sold. */
function soldOutOf(m, vs, sizeOf) {
  const out = [...new Set(vs.filter((v) => v.available === false).map(sizeOf).filter(Boolean))].filter((s) => !m.sizes.includes(s));
  if (out.length && m.sizes.length) m.sizesOut = out;
}
function shopifyImage(x) { return httpUrl(typeof x === "string" ? x : x && (x.src || x.url)); }
export function parseShopifyFamilies(products, opts = {}) {
  const retailer = String(opts.retailer || "").toLowerCase();
  const stats = { products: 0, inRecord: 0, siblingFamilies: 0, single: 0, members: 0, awaitingDetail: 0, sizeRuns: 0 };
  const families = [], singles = [], sizeRuns = [];
  for (const p of products || []) {
    if (!p || typeof p !== "object") continue;
    stats.products++;
    const options = Array.isArray(p.options) ? p.options : [];
    const ci = options.findIndex((o) => COLOR_AXIS.test(String(o && (o.name || o) || "")));
    const si = options.findIndex((o, i) => i !== ci && SIZE_AXIS.test(String(o && (o.name || o) || "")));
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const url = shopifyUrl(p, opts.baseUrl);
    const images = (Array.isArray(p.images) ? p.images : []);
    const name = String(p.title || p.name || "").trim();
    const brand = String(p.vendor || p.brand || "").trim();
    const optOf = (v, i) => (i < 0 ? "" : String(v["option" + (i + 1)] ?? (Array.isArray(v.options) ? v.options[i] : "") ?? "").trim());
    const colours = [...new Set(variants.map((v) => optOf(v, ci)).filter(Boolean))];
    sizeRuns.push(...shopifySizeRuns(p, variants, ci, si, colours, optOf));
    let m0images = null;
    if (ci >= 0 && colours.length > 1) {
      const members = [];
      colours.forEach((c, k) => {
        const vs = variants.filter((v) => optOf(v, ci) === c);
        const live = vs.filter((v) => v.available !== false);
        const prices = (live.length ? live : vs).map((v) => num(v.price)).filter((n) => n > 0);
        const ids = new Set(vs.map((v) => v.id).filter(Boolean));
        let image = vs.map((v) => shopifyImage(v.featured_image)).find(Boolean) || "";
        if (!image) image = images.filter((im) => im && Array.isArray(im.variant_ids) && im.variant_ids.some((id) => ids.has(id))).map(shopifyImage).find(Boolean) || "";
        /* The stores' feeds (Data Drop 2) carry plain image URLs: a photo
           the store files under one of this colour's own SKUs is its photo
           ("210000266634.jpg", "210000266634-1.jpg"). */
        if (!image) {
          const skus = vs.map((v) => String(v.sku || "").trim().toLowerCase()).filter((x) => x.length >= 5);
          const fileOf = (u) => decodeURIComponent(String(u).replace(/[?#].*$/, "").split("/").pop() || "").toLowerCase();
          const own = images.map(shopifyImage).filter((u) => u && skus.some((k) => { const f = fileOf(u); return f.startsWith(k + ".") || f.startsWith(k + "-") || f.startsWith(k + "_"); }));
          if (own.length) { image = own[0]; m0images = own; }
        }
        const m = { id: (p.id || p.handle || name) + ":" + c, label: c, url: url ? url + (vs[0] && vs[0].id ? "?variant=" + vs[0].id : "") : "", productUrl: url, name, brand };
        if (p.handle) m.handle = String(p.handle);
        if (vs[0] && vs[0].id) m.variantId = String(vs[0].id);
        if (k === 0) m.anchor = true;
        if (prices.length) m.price = Math.min(...prices);
        const was = vs.map((v) => num(v.compare_at_price ?? v.compareAtPrice)).filter((n) => n > 0);
        if (was.length && m.price && Math.max(...was) > m.price) m.wasPrice = Math.max(...was);
        if (image) { m.image = image; m.images = m0images && m0images.length ? m0images.slice(0, 12) : [image]; }
        m0images = null;
        m.available = live.length > 0;
        if (si >= 0) { m.sizes = [...new Set(live.map((v) => optOf(v, si)).filter(Boolean))]; soldOutOf(m, vs, (v) => optOf(v, si)); }
        if (!(m.price > 0 && m.image)) stats.awaitingDetail++;
        members.push(m);
      });
      /* The catalogue listing is the product: it anchors the colour its
         card photo shows, else the first. */
      const card = shopifyImage(images[0]);
      const at = members.findIndex((m) => m.image && card && normUrl(m.image) === normUrl(card));
      if (at > 0) { members[0].anchor = false; members[at].anchor = true; }
      families.push({ key: retailer + ":" + (p.id || p.handle || name), retailer, axis: "Color", members, pending: [] });
      stats.inRecord++; stats.members += members.length;
      continue;
    }
    /* One colourway per product: a sibling candidate. */
    const colour = colours[0] || (colourSuffixOf(name) || {}).colour || "";
    const model = colours[0] ? name.replace(new RegExp("\\s+[-|\u2013\u2014]\\s+" + colours[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"), "") : (colourSuffixOf(name) || {}).model || "";
    const live = variants.filter((v) => v.available !== false);
    const prices = (live.length ? live : variants).map((v) => num(v.price)).filter((n) => n > 0);
    const imgs = images.map(shopifyImage).filter(Boolean).slice(0, 12);
    if (!colour || !model || model === name && !colours[0]) { stats.single++; continue; }
    const m = { id: String(p.id || p.handle || url), label: colour, url, productUrl: url, anchor: true, name, brand, available: variants.length ? live.length > 0 : undefined };
    if (p.handle) m.handle = String(p.handle);
    if (prices.length) m.price = Math.min(...prices);
    if (imgs.length) { m.image = imgs[0]; m.images = imgs; }
    if (si >= 0) { m.sizes = [...new Set(live.map((v) => optOf(v, si)).filter(Boolean))]; soldOutOf(m, variants, (v) => optOf(v, si)); }
    singles.push({ key: low(brand) + "|" + low(model), m });
  }
  const byModel = new Map();
  for (const s of singles) { if (!byModel.has(s.key)) byModel.set(s.key, []); byModel.get(s.key).push(s.m); }
  for (const [key, ms] of byModel) {
    if (ms.length < 2) { stats.single++; continue; }
    families.push({ key: retailer + ":model:" + key, retailer, axis: "Color", model: key, members: ms, pending: [], liveFeed: true });
    stats.siblingFamilies++; stats.members += ms.length;
    stats.awaitingDetail += ms.filter((m) => !(m.price > 0 && m.image)).length;
  }
  stats.sizeRuns = sizeRuns.length;
  return { families, stats, sizeRuns };
}
/* THE STORE'S OWN SIZE RUN, FOR EVERY PRODUCT (#443 c.6644778221, the
   per-store size accounting). The colourway pass above keeps a product
   only when it has two colours or a sibling colourway: a boot sold in one
   colour was dropped whole, and with it the size run its own feed lists
   (Silvia Tcherassi "Mele Heels": Size 36-41 in options and variants;
   Farm Rio, Johanna Ortiz, PatBO, ViX, Montce the same) -- so the shoe
   showed «Tallas por confirmar» although the pull had its sizes. A
   colour family's catalogue listing never took its colour's run either.
   Every product with a size axis now hands its run over by handle: one
   run, or one per colour (with that colour's variant ids, so a listing
   ".../products/x?variant=<id>" takes its own colour's run and a
   multi-colour listing with no variant id takes none). In stock: the
   sizes whose variant says available; the sold-out rest rides as
   sizesOut (agotada, never sold). A run with no size in stock is not
   handed over: it is not a run anyone can buy, and an empty list must
   never sell plainly. The store's own values only, never inferred. */
function shopifySizeRuns(p, variants, ci, si, colours, optOf) {
  const h = String(p.handle || "").trim().toLowerCase();
  if (si < 0 || !h || !variants.length) return [];
  const runOf = (vs) => {
    const sizes = [...new Set(vs.filter((v) => v.available !== false).map((v) => optOf(v, si)).filter(Boolean))];
    if (!sizes.length) return null;
    const out = [...new Set(vs.filter((v) => v.available === false).map((v) => optOf(v, si)).filter(Boolean))].filter((z) => !sizes.includes(z));
    const run = { h, sizes };
    if (out.length) run.sizesOut = out;
    return run;
  };
  if (ci >= 0 && colours.length > 1) {
    return colours.map((c) => {
      const vs = variants.filter((v) => optOf(v, ci) === c);
      const run = runOf(vs);
      if (!run) return null;
      run.c = c;
      run.ids = vs.map((v) => String(v.id || "")).filter(Boolean);
      return run;
    }).filter(Boolean);
  }
  const run = runOf(variants);
  return run ? [run] : [];
}
/* The runs a catalogue listing can take (scripts/build-pdp-slices.mjs):
   by store and handle, as ingest-variant-pulls.mjs keeps them. */
export function loadSizeRuns(root) {
  const dir = join(root, FAMILIES_DIR);
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => /\.json$/.test(x)).sort()) {
    const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
    if (!j || !Array.isArray(j.sizeRuns)) continue;
    const store = f.replace(/\.json$/, "").toLowerCase();
    for (const r of j.sizeRuns) {
      const k = store + "|" + r.h;
      if (!out.has(k)) out.set(k, []);
      out.get(k).push({ ...r, source: FAMILIES_DIR + "/" + f });
    }
  }
  return out;
}
/* The one run a listing takes: its store's product by handle; for a
   product sold in several colours, only the colour its own ?variant=
   names. Nothing else matches -- no title, no sibling, no guess. */
export function sizeRunFor(runs, retailer, url) {
  const u = String(url || "");
  const h = /\/products\/([^\/?#]+)/i.exec(u);
  if (!h || !runs) return null;
  const list = runs.get(String(retailer || "").toLowerCase() + "|" + decodeURIComponent(h[1]).toLowerCase());
  if (!list || !list.length) return null;
  const plain = list.filter((r) => !r.c);
  if (plain.length === 1 && list.length === 1) return plain[0];
  const vid = (/[?&]variant=(\d+)/.exec(u) || [])[1];
  if (!vid) return null;
  return list.find((r) => Array.isArray(r.ids) && r.ids.includes(vid)) || null;
}
/* The title rule's own colour split (variants.mjs colourSuffix). */
const colourSuffixOf = (t) => colourSuffix(t);

/* ---------------- Kohl's (Data Drop 2) ---------------- */
/* Per product: colors[] (names), swatches[] (each colour's swatch and,
   when the pull has it, its own product photo), display_color (the one
   the listing shows) and sku_ids. A colour is offered with its own photo
   and the product's price (Kohl's prices a product, not a colour, in
   this pull); its sizes stay "por confirmar" unless the pull gives them
   per colour. No photo of its own: pending. */
export function parseKohlsFamilies(products) {
  const stats = { products: 0, families: 0, single: 0, members: 0, awaitingDetail: 0 };
  const families = [];
  for (const p of products || []) {
    if (!p || typeof p !== "object") continue;
    stats.products++;
    const names = [...new Set((Array.isArray(p.colors) ? p.colors : []).map((c) => String(c && (c.name || c.color) || c || "").trim()).filter(Boolean))];
    if (names.length < 2) { stats.single++; continue; }
    const url = httpUrl(p.url || p.product_url || "");
    const price = num(p.final_price ?? p.price ?? p.sale_price ?? p.salePrice ?? p.regular_price);
    const shown = String(p.display_color || p.displayColor || "").trim();
    const sw = Array.isArray(p.swatches) ? p.swatches : [];
    const name = String(p.title || p.name || "").trim();
    const members = names.map((c) => {
      const s = sw.find((x) => x && low(x.color || x.name || x.colorName) === low(c)) || {};
      /* A swatch chip ("..._sw") is not a product photo. */
      const raw = s.product_image || s.productImage || s.large_image || s.image || s.img || "";
      const photo = /_sw(?:[?#]|$)/i.test(String(raw)) ? "" : httpUrl(raw);
      const m = { id: String(p.web_id || p.id || p.product_id || url) + ":" + c, label: c, url, productUrl: url, name, brand: String(p.brand || "").trim() };
      if (low(c) === low(shown)) { m.anchor = true; m.selected = true; }
      if (photo) { m.image = photo; m.images = [photo]; }
      /* Kohl's files each colour's photo as <web id>_<Colour_Name>: the
         catalogue listing's own gallery holds them (applyFamilies). */
      if (p.web_id) m.photoKey = String(p.web_id) + "_" + c.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
      /* One price per product in this pull: every colour at the listing's. */
      if (!m.selected) m.priceFromAnchor = true;
      else if (price > 0) m.price = price;
      if (!m.selected) { m.vkey = "kohls:" + (p.web_id || p.id || p.product_id || url) + ":color:" + c; m.sizesPending = true; }
      if (typeof s.available === "boolean") m.available = s.available;
      if (!m.image && !m.photoKey) stats.awaitingDetail++;
      return m;
    });
    if (!members.some((m) => m.anchor)) members[0].anchor = true;
    families.push({ key: "kohls:" + (p.web_id || p.id || p.product_id || url), retailer: "kohls", axis: "Color", sameTitle: true, members, pending: [] });
    stats.families++; stats.members += members.length;
  }
  return { families, stats };
}

/* ---------------- Zumiez (Data Drop 2) ---------------- */
/* No colour axis: each colourway is its own product. They are grouped by
   model with the title rule Zumiez already uses (variants.mjs midColour:
   brand + the model words before the colour + the kind after it). */
const midColourOf = (t) => midColour(t);
export function parseZumiezFamilies(products) {
  const stats = { products: 0, families: 0, single: 0, members: 0 };
  const byModel = new Map();
  for (const p of products || []) {
    if (!p || typeof p !== "object") continue;
    stats.products++;
    const name = String(p.title || p.name || "").trim();
    const mid = midColourOf(name);
    const url = httpUrl(p.url || "") || (p.url_key ? "https://www.zumiez.com/" + p.url_key + ".html" : "");
    if (!mid || !url) { stats.single++; continue; }
    const key = low(p.brand || name.split(/\s+/)[0]) + "|" + low(mid.model) + "|" + low(mid.tail);
    const imgs = imagesOf({ ...p, image: p.image || (p.small_image && p.small_image.url) });
    const brand = String(p.brand || "").trim() || (name.split(/\s+/)[0] || "");
    const m = { id: url, label: mid.colour, url, productUrl: url, anchor: true, name, brand };
    const pr = p.price_range && p.price_range.minimum_price;
    const price = num(p.special_price ?? (pr && pr.final_price && pr.final_price.value) ?? p.price);
    if (price > 0) m.price = price;
    if (p.stock_status) m.available = p.stock_status === "IN_STOCK";
    const was = num((pr && pr.regular_price && pr.regular_price.value) ?? p.originalPrice ?? p.was_price);
    if (was > price) m.wasPrice = was;
    if (imgs.length) { m.image = imgs[0]; m.images = imgs; }
    if (Array.isArray(p.sizes) && p.sizes.length) m.sizes = p.sizes.map(String);
    if (!byModel.has(key)) byModel.set(key, []);
    byModel.get(key).push(m);
  }
  const families = [];
  for (const [key, ms] of byModel) {
    if (ms.length < 2) { stats.single++; continue; }
    families.push({ key: "zumiez:model:" + key, retailer: "zumiez", axis: "Color", model: key, members: ms, pending: [], liveFeed: true });
    stats.families++; stats.members += ms.length;
  }
  return { families, stats };
}

/* ---------------- Data Drop 2 folders ---------------- */
/* scripts/data/variant-pulls/<drop>/dataset-<store>.json -> the store's
   families. Kohl's and Zumiez have their own shapes; every other store
   is a Shopify products.json feed. */
export function parseStoreDataset(store, rows) {
  const s = String(store).toLowerCase();
  const list = Array.isArray(rows) ? rows : (rows && (rows.products || rows.items || rows.data)) || [];
  if (s === "kohls") return parseKohlsFamilies(list);
  if (s === "zumiez") return parseZumiezFamilies(list);
  if (s === "walmart" || s === "walmart-beauty") return parseWalmartFamilies(list);
  /* The manual curation's rows (readStorePulls marks them). */
  if (list.some(isManualRow)) return withManual(list, s, (rest) => parseStoreDataset(s, rest));
  /* A shade pull in the Walmart variantList shape (README in
     data/shade-pull-worklist-2026-11-02/), for any gated beauty store. */
  if (isVariantListShape(list)) return parseWalmartVariantLists(list, { retailer: s });
  return parseShopifyFamilies(list, { retailer: s });
}
/* The manual curation's datasets: the ones its MANUAL-REPORT.md totals. */
function manualDatasets(dir) {
  const p = join(dir, "MANUAL-REPORT.md");
  if (!existsSync(p)) return new Set();
  return new Set([...readFileSync(p, "utf8").matchAll(/^\|\s*(dataset-[a-z0-9_-]+\.json)[\s(|]/gim)].map((m) => m[1].toLowerCase()));
}
/* A row's store by its own URL (dataset-rescue.json holds four stores). */
const STORE_HOSTS = [[/(^|\.)sephora\.com$/, "sephora"], [/(^|\.)ulta\.com$/, "ulta"], [/(^|\.)costco\.com$/, "costco"], [/(^|\.)walmart\.com$/, "walmart"], [/(^|\.)yesstyle\.com$/, "yesstyle"], [/(^|\.)victoriassecret(beauty)?\.[a-z.]+$/, "victoriassecret"]];
function storeOfUrl(u) {
  const h = (/^https?:\/\/([^\/?#:]+)/i.exec(String(u || "").trim()) || [])[1] || "";
  for (const [rx, s] of STORE_HOSTS) if (rx.test(h.toLowerCase())) return s;
  return "";
}
export function readStorePulls(dir) {
  if (Array.isArray(dir)) {
    for (const d of dir) { const r = readStorePulls(d); if (r.size) return r; }
    return new Map();
  }
  const byStore = new Map();
  if (!existsSync(dir)) return byStore;
  for (const sub of readdirSync(dir).sort()) {
    let names = [];
    try { names = readdirSync(join(dir, sub)).filter((f) => /^dataset-[a-z0-9_-]+\.json$/i.test(f)); } catch { continue; }
    const manual = manualDatasets(join(dir, sub));
    for (const f of names.sort()) {
      /* "dataset-ulta-makeup-finish.json": a second batch of a shade-pull
         store's pull (data/shade-pulls-2026-11-03/FINISH-REPORT.md). */
      let store = f.replace(/^dataset-|\.json$/gi, "").toLowerCase();
      const batch = /^([a-z0-9]+)-/.exec(store);
      if (batch && SHADE_PULL_STORES.has(batch[1])) store = batch[1];
      const j = JSON.parse(readFileSync(join(dir, sub, f), "utf8"));
      const list = Array.isArray(j) ? j : (j && (j.products || j.items || j.data)) || [];
      /* A manual dataset's rows are marked, and each goes to the store its
         own URL names ("dataset-rescue.json": Sephora, Walmart, Costco, Ulta). */
      const isManual = manual.has(f.toLowerCase());
      for (const row of list) {
        const s = isManual ? storeOfUrl(row && row.url) || store : store;
        if (!byStore.has(s)) byStore.set(s, { rows: [], files: [] });
        byStore.get(s).rows.push(isManual && row && typeof row === "object" ? { ...row, __manual: true } : row);
        if (!byStore.get(s).files.includes(join(sub, f))) byStore.get(s).files.push(join(sub, f));
      }
    }
  }
  return byStore;
}

/* THE DERIVED FILE STAYS SMALL. Only a family with at least one member
   our catalogue lists can ever reach a product page, so only those are
   kept (re-run the ingest after a catalogue refresh); each member keeps
   at most 6 photos and no field the page and checkout do not use. */
export function anchoredFamilies(families, listings) {
  const index = new Set();
  for (const l of listings) for (const k of listingKeys(l)) index.add(k);
  const out = [];
  for (const fam of families) {
    const onPage = fam.page && index.has(String(fam.retailer || "").toLowerCase() + "|sku|" + fam.page);
    if (!onPage && !fam.members.some((m) => memberKeys(fam, m).some((k) => index.has(k)))) continue;
    out.push({ ...fam, members: fam.members.map((m) => compactMember(m, fam)) });
  }
  return out;
}
function compactMember(m, fam) {
  const x = { ...m };
  /* A colour of the same listing (Macy's, Kohl's): its title, brand and
     product page are the listing's own. */
  /* A shade-pull store's shade keeps its own URL: that URL carries the
     shade's SKU (?sku=, ?skuId=), its own listing id and its checkout link. */
  const shadePull = fam && SHADE_PULL_STORES.has(String(fam.retailer || "").toLowerCase());
  if (fam && fam.sameTitle && !x.anchor && !x.selected) { delete x.name; delete x.brand; if (!shadePull) delete x.url; delete x.productUrl; }
  if (!x.url) delete x.url;
  if (!x.brand) delete x.brand;
  if (x.productUrl && x.productUrl === x.url) delete x.productUrl;
  if (Array.isArray(x.images)) { x.images = x.images.slice(0, 6); if (x.images.length === 1 && x.images[0] === x.image) delete x.images; }
  if (Array.isArray(x.sizes) && !x.sizes.length) delete x.sizes;
  return x;
}

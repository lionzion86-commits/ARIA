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

/* products: every productDetails entry from every pull file (first pass
   and any sibling detail pass). Returns { families, stats }. */
export function parseWalmartFamilies(products, opts = {}) {
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
  if (!existsSync(dir)) return { products: out, files };
  for (const sub of readdirSync(dir).sort()) {
    if (!/^walmart-beauty-/.test(sub)) continue;
    const d = join(dir, sub);
    let names = [];
    try { names = readdirSync(d).filter((f) => /\.json$/i.test(f) && !/^families\.json$/i.test(f)); } catch { continue; }
    names.sort((a, b) => (a === "dataset.json" ? -1 : b === "dataset.json" ? 1 : a < b ? -1 : 1));
    for (const f of names) {
      const j = JSON.parse(readFileSync(join(d, f), "utf8"));
      const list = Array.isArray(j) ? j : (j && (j.items || j.products || j.data)) || [];
      if (!Array.isArray(list)) continue;
      out.push(...list);
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
    families.push({ key: "macys:" + id, retailer: "macys", axis: "Color", anchorId: id, members, pending });
    stats.families++; stats.members += members.length; stats.pending += pending.length;
  }
  return { families, stats };
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
const memberKeys = (fam, m) => {
  const r = String(fam.retailer || "").toLowerCase();
  const keys = [];
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
     extra:   [listing]  members the catalogue lacks, each with its own
              real price and photo, ready to become records
     pending: Map g -> [label]
     stats */
export function applyFamilies(listings, families) {
  const index = new Map();
  for (const l of listings) for (const k of listingKeys(l)) if (!index.has(k)) index.set(k, l);
  const assign = new Map(), extra = [], pending = new Map();
  let byModel = null;
  const stats = { families: 0, grouped: 0, fromCatalogue: 0, fromPull: 0, pending: 0, single: 0 };
  for (const fam of families) {
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
      const price = m.price > 0 ? m.price : (m.priceFromAnchor && anchor.price > 0 ? anchor.price : 0);
      const image = httpUrl(m.image);
      const name = m.name || (fam.retailer === "macys" ? anchor.name : "");
      if (!(price > 0) || !image || !name || photos.has(normUrl(image))) { waiting.push(m.label); return; }
      /* A feed row without a URL: the store's own /products/<handle>
         on the host its catalogue listing lives on. */
      const host = (/^https?:\/\/[^\/?#]+/i.exec(String(anchor.url || "")) || [""])[0];
      const url = httpUrl(m.url) || (m.handle && host ? host + "/products/" + m.handle + (m.variantId ? "?variant=" + m.variantId : "") : "") || httpUrl(anchor.url);
      const v = variantIdOf(m.vkey || url, fam.key + "|" + m.id);
      if (vs.has(v)) return;
      const x = { v, retailer: anchor.retailer, name, brand: m.brand || anchor.brand || "", url, price, image,
        images: Array.isArray(m.images) && m.images.length ? m.images.slice(0, 12) : [image], dept: anchor.dept || "",
        __family: fam.source || fam.key };
      if (m.wasPrice > price) x.wasPrice = m.wasPrice;
      if (Array.isArray(m.sizes) && m.sizes.length) x.sizes = m.sizes.slice();
      else if (m.sizesPending) x.sizesPending = true;
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
        if (vs.has(l.v) || assign.has(l.v) || labels.has(low(colour))) continue;
        out.push({ l, m: { label: colour, available: false }, own: true });
        labels.add(low(colour)); vs.add(l.v);
        stats.retired = (stats.retired || 0) + 1;
      }
    }
    if (out.length < 2) { stats.single++; continue; }
    stats.families++;
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
  return { assign, extra, pending, stats };
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
function shopifyImage(x) { return httpUrl(typeof x === "string" ? x : x && (x.src || x.url)); }
export function parseShopifyFamilies(products, opts = {}) {
  const retailer = String(opts.retailer || "").toLowerCase();
  const stats = { products: 0, inRecord: 0, siblingFamilies: 0, single: 0, members: 0, awaitingDetail: 0 };
  const families = [], singles = [];
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
    if (ci >= 0 && colours.length > 1) {
      const members = [];
      colours.forEach((c, k) => {
        const vs = variants.filter((v) => optOf(v, ci) === c);
        const live = vs.filter((v) => v.available !== false);
        const prices = (live.length ? live : vs).map((v) => num(v.price)).filter((n) => n > 0);
        const ids = new Set(vs.map((v) => v.id).filter(Boolean));
        let image = vs.map((v) => shopifyImage(v.featured_image)).find(Boolean) || "";
        if (!image) image = images.filter((im) => im && Array.isArray(im.variant_ids) && im.variant_ids.some((id) => ids.has(id))).map(shopifyImage).find(Boolean) || "";
        const m = { id: (p.id || p.handle || name) + ":" + c, label: c, url: url ? url + (vs[0] && vs[0].id ? "?variant=" + vs[0].id : "") : "", productUrl: url, name, brand };
        if (p.handle) m.handle = String(p.handle);
        if (vs[0] && vs[0].id) m.variantId = String(vs[0].id);
        if (k === 0) m.anchor = true;
        if (prices.length) m.price = Math.min(...prices);
        const was = vs.map((v) => num(v.compare_at_price ?? v.compareAtPrice)).filter((n) => n > 0);
        if (was.length && m.price && Math.max(...was) > m.price) m.wasPrice = Math.max(...was);
        if (image) { m.image = image; m.images = [image]; }
        m.available = live.length > 0;
        if (si >= 0) m.sizes = [...new Set(live.map((v) => optOf(v, si)).filter(Boolean))];
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
    if (si >= 0) m.sizes = [...new Set(live.map((v) => optOf(v, si)).filter(Boolean))];
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
  return { families, stats };
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
    const price = num(p.price ?? p.sale_price ?? p.salePrice ?? p.regular_price);
    const shown = String(p.display_color || p.displayColor || "").trim();
    const sw = Array.isArray(p.swatches) ? p.swatches : [];
    const name = String(p.title || p.name || "").trim();
    const members = names.map((c) => {
      const s = sw.find((x) => x && low(x.color || x.name || x.colorName) === low(c)) || {};
      const photo = httpUrl(s.image || s.product_image || s.productImage || s.large_image || s.img || "");
      const m = { id: String(p.id || p.product_id || url) + ":" + c, label: c, url, productUrl: url, name, brand: String(p.brand || "").trim() };
      if (low(c) === low(shown)) { m.anchor = true; m.selected = true; }
      if (photo) { m.image = photo; m.images = [photo]; }
      if (price > 0) m.price = price;
      if (!m.selected) { m.vkey = "kohls:" + (p.id || p.product_id || url) + ":color:" + c; m.sizesPending = true; }
      if (typeof s.available === "boolean") m.available = s.available;
      if (!(m.price > 0 && m.image)) stats.awaitingDetail++;
      return m;
    });
    if (!members.some((m) => m.anchor)) members[0].anchor = true;
    families.push({ key: "kohls:" + (p.id || p.product_id || url), retailer: "kohls", axis: "Color", members, pending: [] });
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
    const url = httpUrl(p.url || "");
    if (!mid || !url) { stats.single++; continue; }
    const key = low(p.brand) + "|" + low(mid.model) + "|" + low(mid.tail);
    const imgs = imagesOf(p);
    const m = { id: url, label: mid.colour, url, productUrl: url, anchor: true, name, brand: String(p.brand || "").trim() };
    const price = num(p.price);
    if (price > 0) m.price = price;
    const was = num(p.originalPrice ?? p.was_price);
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
  return parseShopifyFamilies(list, { retailer: s });
}
export function readStorePulls(dir) {
  const byStore = new Map();
  if (!existsSync(dir)) return byStore;
  for (const sub of readdirSync(dir).sort()) {
    let names = [];
    try { names = readdirSync(join(dir, sub)).filter((f) => /^dataset-[a-z0-9_-]+\.json$/i.test(f)); } catch { continue; }
    for (const f of names.sort()) {
      const store = f.replace(/^dataset-|\.json$/gi, "").toLowerCase();
      const j = JSON.parse(readFileSync(join(dir, sub, f), "utf8"));
      const list = Array.isArray(j) ? j : (j && (j.products || j.items || j.data)) || [];
      if (!byStore.has(store)) byStore.set(store, { rows: [], files: [] });
      byStore.get(store).rows.push(...list);
      byStore.get(store).files.push(join(sub, f));
    }
  }
  return byStore;
}

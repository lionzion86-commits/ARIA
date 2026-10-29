#!/usr/bin/env node
/* ============================================================
   assets/search/catalog-index.json — SEARCH'S CATALOGUE, PRECOMPUTED.

   WHY (2026-10-08 search brief: "150k+ products, must feel instant on
   mobile; precompute at build time if needed"). search.html fetched
   64 catalogue files -- 218MB of JSON, 28MB gzipped -- on every visit,
   and parsed all of it on the phone before the first search could
   run. Search needs ten fields of each product, not the whole record (the
   card links to producto.html by name and store, so not even the URL),
   so they are collected here once: one file, ~43MB raw / ~7MB gzipped,
   with each product's category already computed.

   Built from exactly what search.html used to load: its CATALOG_FILES
   list, then the sale feed for deals no catalogue carries. Products
   with no image are left out (no "Sin imagen" cards), and one product
   listed twice by the same store (two department buckets, same URL) is
   one row. Product data is not changed -- this file is derived from it.

   SERVER-SIDE SINCE 2026-10-19 (#409). A customer on an iPhone in Peru
   searched "dolls" and the page downloaded this whole file to her
   phone, reloaded ~10 times and froze. The phone no longer downloads
   it: netlify/functions/search.js loads it once per warm container and
   answers ?q=&page= with 48 ranked cards. This file ships only beside
   that function (netlify.toml included_files); search.html never
   fetches it, nor any catalogue.

   Each row also carries an id (stable hash of store + product URL),
   titles and brands with HTML entities decoded ("Lizzie &#38; Oliver"
   was printed raw on the cards), Foot Locker's productName/imageUrl
   (726 products were missing: its feed has no name/title field), and
   the was-price fields of the site's one sale rule (SALE_ORIGINAL_FIELDS).

   DEMAND (2026-10-19, #416 generic lanes). Each row also carries the
   store's review count and star rating, where the store published
   them (about half the catalogue): the "Más vendidos" lane and the
   lead slots of every lane rank by them. 0 means not published.

   STORES (2026-10-19, #416 comparison block). The index also carries
   a small `stores` table -- each store's name and logo, as the Tiendas
   page draws them (tienda.html's STORES, then scripts/lib/retailers.js,
   then a logo file named after the store) -- so the comparison block
   can show the store's own logo without the function shipping the
   logos folder. A logo is listed only when its file exists.

   REGENERATE after any catalogue change:
     node scripts/build-search-index.mjs
   scripts/test/search-brief-tests.mjs fails when the index has fallen
   behind the catalogues (a removed product would still be searchable).
   ============================================================ */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { RETAILERS } from "./lib/retailers.js";
import { isOffSaleRetailer } from "./lib/off-sale.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const INDEX_PATH = "assets/search/catalog-index.json";
export const INDEX_FIELDS = ["id", "title", "brand", "price", "originalPrice", "onSale", "department", "retailer", "finalPrice", "image", "cat", "reviews", "rating"];

/* Everything search covers: the catalogues below, then the sale feed
   for deals no catalogue carries. (This list lived in search.html while
   the page loaded the catalogues itself.) */
export const CATALOG_FILES = [
  "department-cache-walmart.json",
  "department-cache-oldnavy.json", "department-cache-footlocker.json",
  "macys-catalog.json", "ssense-catalog.json", "beauty-catalog.json",
  /* Served on their store pages but missing from search (#443 audit F3,
     caught by scripts/test/search-coverage-tests.mjs). */
  "abercrombie-catalog.json", "hollister-catalog.json",
  "lanebryant-catalog.json", "dicks-catalog.json", "pacsun-catalog.json",
  "skims-catalog.json", "revolve-catalog.json", "ulta-catalog.json",
  "yesstyle-catalog.json", "miumiu-catalog.json", "partycity-catalog.json",
  "costco-catalog.json", "gymrat-catalog.json",
  "kohls-catalog.json", "crateandbarrel-catalog.json", "pier1-catalog.json", "newbalance-catalog.json", "bhphoto-catalog.json",
  "advanceauto-catalog.json", "nautilus-catalog.json",
  "islandwatersports-catalog.json", "quietstorm-catalog.json",
  "surfstation-catalog.json",
  "mainland-catalog.json", "parrot-catalog.json", "ccs-catalog.json",
  "valsurf-catalog.json", "venum-catalog.json", "tatami-catalog.json",
  "everlast-catalog.json", "mmawarehouse-catalog.json",
  "combatcorner-catalog.json", "fuji-catalog.json", "fightclub-catalog.json",
  "crocs-catalog.json", "baublebar-catalog.json", "jwpei-catalog.json",
  "meliebianco-catalog.json", "bentgo-catalog.json", "mushie-catalog.json",
  "ezpz-catalog.json", "statebags-catalog.json", "books-catalog.json",
  "moms-catalog.json", "ae-catalog.json", "farfetch-catalog.json",
  "soccer-catalog.json", "tennis-catalog.json",
  "latino-designers-dtc-catalog.json", "jewelry-catalog.json",
  "moto-catalog.json", "juguetes-catalog.json", "sunglasses-catalog.json",
  "finishline-catalog.json", "zumiez-catalog.json", "hottopic-catalog.json",
  "boxlunch-catalog.json",
  /* Best Buy (2026-10-19, #413): the third electronics leg beside
     Walmart and Target. */
  "bestbuy-catalog.json",
  /* DSW (#443): the committed empty envelope until the pull lands. */
  "dsw-catalog.json",
  /* SNIPES + Carolina Herrera (#443, pulled 2026-10-27). */
  "snipes-catalog.json",
  /* BrandsMart USA (Build Order B, #443, pulled 2026-10-28). */
  "brandsmart-catalog.json",
  /* SleekShop (#443 c.6475799491, pulled 2026-10-28): the Cabello shelf. */
  "sleekshop-catalog.json",
  "carolinaherrera-catalog.json",
  /* Aria Perfumes (#443 item 32). */
  "perfumes-catalog.json",
];
export function catalogFiles() { return CATALOG_FILES.slice(); }

/* "Lizzie &#38; Oliver", "18&#34; Dolls", "Li&#39;l Woodzeez": scraped
   titles carry HTML entities, and the cards printed them raw. Decoded
   once, here, so every consumer of the index gets plain text. */
const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", reg: "\u00ae", trade: "\u2122", copy: "\u00a9", deg: "\u00b0", eacute: "\u00e9", ntilde: "\u00f1", rsquo: "\u2019", lsquo: "\u2018", rdquo: "\u201d", ldquo: "\u201c", ndash: "\u2013", mdash: "\u2014", hellip: "\u2026" };
export function decodeEntities(s) {
  let out = String(s ?? "");
  /* Twice: "&amp;#38;" is an entity escaped once more. */
  for (let pass = 0; pass < 2 && out.includes("&"); pass++) {
    out = out.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") {
        const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
      }
      const v = NAMED_ENTITIES[e.toLowerCase()];
      return v === undefined ? m : v;
    });
  }
  return out;
}

/* A product's id: store + product URL (title when there is none),
   FNV-1a, base 36. Stable across rebuilds while the product exists. */
export function productId(retailer, url, title) {
  const s = String(retailer || "").toLowerCase() + "|" + String(url || title || "");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  let h2 = 0x9e3779b9;
  for (let i = s.length - 1; i >= 0; i--) { h2 ^= s.charCodeAt(i); h2 = Math.imul(h2, 0x85ebca6b) >>> 0; }
  return h.toString(36) + h2.toString(36).slice(0, 3);
}

/* index.html's one sale rule reads these, in this order. */
const SALE_ORIGINAL_FIELDS = ["regularPrice", "wasPrice", "was_price", "originalPrice", "compareAt"];

function loadEngine() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(ROOT + "search-engine.js", "utf8"), sandbox, { filename: "search-engine.js" });
  return sandbox.window.AriaSearch;
}

/* The first positive finite number among the store's spellings. */
function firstNumber(...vals) {
  for (const v of vals) { const n = Number(v); if (v != null && Number.isFinite(n) && n > 0) return n; }
  return 0;
}

function normalize(it, retailer, department, finalPrice) {
  if (!it || typeof it !== "object") return null;
  const title = decodeEntities(it.name || it.title || it.productName || "").trim();
  const price = Number(it.price);
  if (!title || !(price > 0)) return null;
  let image = it.thumbnail || it.image || it.imageUrl || "";
  if (!image && Array.isArray(it.images) && it.images[0]) image = it.images[0];
  let orig = NaN;
  for (const k of SALE_ORIGINAL_FIELDS) { const v = Number(it[k]); if (v > 0) { orig = v; break; } }
  return {
    title, brand: decodeEntities(it.brand || "").trim(), price,
    originalPrice: orig > price ? orig : 0, onSale: it.onSale === true,
    department: department ? String(department) : "", retailer: String(it.retailer || retailer || ""),
    finalPrice: !!finalPrice, image: typeof image === "string" ? image : "", url: String(it.url || it.link || it.productUrl || ""),
    reviews: firstNumber(it.reviewCount, it.reviews), rating: Math.round(firstNumber(it.rating, it.averageRating, it.reviewScore) * 10) / 10,
  };
}

/* ============================================================
   A BRAND THE ROW LEAVES BLANK, READ FROM ITS TITLE (#443 follow-up).

   Walmart's feed carries no brand field. While Target was on sale its
   rows said "LEGO", so search knew LEGO was carried; with Target off
   sale the only LEGO left is 860 Walmart sets with brand "", and the
   pipeline's "a brand we do not carry is an honest no" guard answered
   "lego" with "Todavía no vendemos LEGO". The same gap hit Play-Doh,
   Fisher-Price, Maybelline, CeraVe and L'Oréal.

   The rule: a row with no brand whose title STARTS with a brand from
   search's own brand list (assets/search/synonyms-es.json `brands`, the
   list that makes a query word a brand slot) takes that brand. Only the
   first three words are read, and whole words must spell the brand
   ("Legoland" is not LEGO). The spelling kept is the one the catalogue
   already uses for that brand, else the titles' most common one.
   FALSE_BRAND_PREFIXES are titles whose first words name a product,
   not its maker ("Guess Who?" is a Hasbro game).
   ============================================================ */
export const BRAND_LIST_FILE = "assets/search/synonyms-es.json";
export const FALSE_BRAND_PREFIXES = ["guess who", "champion sports"];
export const brandKey = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
export function knownBrands(root = ROOT) {
  const d = JSON.parse(readFileSync(root + BRAND_LIST_FILE, "utf8"));
  return new Set((d.brands || []).map(brandKey).filter(Boolean));
}
/* The brand a title opens with, as the title spells it, or "". */
export function brandFromTitle(title, brands) {
  const toks = String(title || "").trim().split(/\s+/).slice(0, 3);
  const lead = brandKey(toks.join(" "));
  if (FALSE_BRAND_PREFIXES.some((f) => lead.startsWith(brandKey(f)))) return "";
  let acc = "";
  for (let n = 0; n < toks.length; n++) {
    acc += brandKey(toks[n]);
    if (brands.has(acc)) return toks.slice(0, n + 1).join(" ").replace(/[^\p{L}\p{N}]+$/u, "");
  }
  return "";
}
/* Fills blank brands in place; returns { brandKey: rows filled }. */
export function inferBrands(products, brands) {
  const forms = new Map();
  const count = (k, form, w) => {
    if (!forms.has(k)) forms.set(k, new Map());
    const m = forms.get(k);
    m.set(form, (m.get(form) || 0) + w);
  };
  /* The catalogue's own spelling outweighs any title's. */
  for (const p of products) if (p.brand) count(brandKey(p.brand), p.brand, 1e6);
  const pending = [];
  for (const p of products) {
    if (p.brand) continue;
    const b = brandFromTitle(p.title, brands);
    if (!b) continue;
    count(brandKey(b), b, 1);
    pending.push([p, brandKey(b)]);
  }
  const filled = {};
  for (const [p, k] of pending) {
    p.brand = [...forms.get(k).entries()].sort((a, b) => b[1] - a[1])[0][0];
    filled[k] = (filled[k] || 0) + 1;
  }
  return filled;
}

/* Each store's display name and logo path (relative, no leading slash). */
export function storeTable(keys) {
  let site = {};
  try {
    const m = /^var STORES = (\{.*\});\s*$/m.exec(readFileSync(ROOT + "tienda.html", "utf8"));
    if (m) site = JSON.parse(m[1]);
  } catch { /* the retailers table answers */ }
  const exists = (rel) => !!rel && existsSync(ROOT + rel);
  const out = {};
  for (const k of [...keys].sort()) {
    const s = site[k] || {}, r = RETAILERS[k] || {};
    const label = s.label || r.label || k;
    const tries = [s.logo, r.logo, `logos/${k}.svg`, `logos/${k}.png`, `logos/brands/${k}.svg`, `logos/brands/${k}.png`]
      .filter(Boolean).map((x) => String(x).replace(/^\//, ""));
    const logo = tries.find(exists) || "";
    out[k] = logo ? { label, logo } : { label };
  }
  return out;
}

export function buildIndex() {
  const S = loadEngine();
  const products = [];
  const seen = new Set();
  for (const f of catalogFiles()) {
    if (!existsSync(ROOT + f)) continue;
    let data;
    try { data = JSON.parse(readFileSync(ROOT + f, "utf8")); } catch { continue; }
    for (const [rkey, r] of Object.entries((data && data.retailers) || {})) {
      for (const section of ["departments", "brands"]) {
        for (const [skey, bucket] of Object.entries((r && r[section]) || {})) {
          const arr = Array.isArray(bucket) ? bucket : (bucket && bucket.items) || [];
          for (const it of arr) {
            const n = normalize(it, rkey, section === "departments" ? skey : "", false);
            /* Off sale (/off-sale.js): kept in the catalogue, never searchable. */
            if (!n || isOffSaleRetailer(n.retailer) || isOffSaleRetailer(rkey)) continue;
            const k = (n.retailer + "|" + (n.url || n.title)).toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            products.push(n);
          }
        }
      }
    }
  }
  /* The sale feed last: only deals no catalogue carries (prices final). */
  const have = new Set(products.map(p => (p.retailer + "|" + p.title).toLowerCase()));
  for (const it of JSON.parse(readFileSync(ROOT + "ofertas-feed.json", "utf8")).items || []) {
    const n = normalize(it, it && it.retailer, "", true);
    if (!n || isOffSaleRetailer(n.retailer)) continue;
    const k = (n.retailer + "|" + n.title).toLowerCase();
    if (have.has(k)) continue;
    have.add(k);
    products.push(n);
  }
  inferBrands(products, knownBrands());
  const rows = [];
  for (const p of products) {
    if (!p.image) continue;
    const cat = S.catalogItemCategory({ title: p.title, name: p.title, brand: p.brand, retailer: p.retailer,
      departments: p.department ? [p.department] : [] }) || "";
    rows.push([productId(p.retailer, p.url, p.title), p.title, p.brand, p.price, p.originalPrice, p.onSale ? 1 : 0, p.department, p.retailer,
      p.finalPrice ? 1 : 0, p.image, cat, Math.round(p.reviews), p.rating]);
  }
  const stores = storeTable(new Set(rows.map((r) => r[7]).filter(Boolean)));
  return { v: 1, generatedAt: null, fields: INDEX_FIELDS, count: rows.length, stores, rows };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = buildIndex();
  index.generatedAt = new Date().toISOString();
  mkdirSync(ROOT + "assets/search", { recursive: true });
  const out = JSON.stringify(index);
  writeFileSync(ROOT + INDEX_PATH, out);
  console.log(`${INDEX_PATH}: ${index.count} products, ${(out.length / 1e6).toFixed(1)}MB`);
}

#!/usr/bin/env node
/* ============================================================
   assets/sections/marca/ — EVERY BRAND PAGE, WITHOUT CATALOGUES.

   WHY (2026-10-19, #409 track T5). marca.html (one template for every
   brand: Nike, Gymshark, Crocs, LEGO, Miu Miu, ...) downloaded 63
   catalogue files to show one brand's carousels. The Mountain Test:
   nothing catalogue-sized on any path a shopper takes.

   WHAT THIS WRITES
     _fn/items.json      one row per product of the 63 files (title,
                         brand, store, price, was-price, % off, photo,
                         product type) -- for netlify/functions/brand.js,
                         never sent to a phone
     <key>.json          a brand's head (its carousels and their first
                         12 cards), for every brand with at least
                         STATIC_MIN products: the first screen is one
                         small static file, no function on the way

   Brands not written here (and every "Ver todo" / "Mostrar más") are
   answered by the endpoint with the same core
   (netlify/functions/_brand-core.js). The rules are the page's own,
   moved here unchanged: the same files in the same order, the same
   de-dup (store + url-or-name), the same sale rule (sale-rule.js), the
   same classifier (product-type.js), the same brand match.

   REGENERATE after any catalogue change:
     node scripts/build-brand-index.mjs
   scripts/test/marca-thin-tests.mjs fails when they drift.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { RETAILERS } from "./lib/retailers.js";
import { photoCount } from "./lib/photo-counts.js";
import { productKeys, firstSighting } from "./lib/product-identity.js";
import { isOffSaleRetailer } from "./lib/off-sale.js";
import { FN_FILE, brandKeyOf, legacyKeyOf, plainKey, filterByBrand, headOf, fnRow } from "../netlify/functions/_brand-core.js";
import { CATALOG_FILES as SEARCH_FILES, decodeEntities, inferBrands, knownBrands } from "./build-search-index.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const OUT_DIR = "assets/sections/marca";
export const STATIC_MIN = 12;

/* ONE CATALOGUE (#443 c.6585655315 P5): the brand pages read the very
   files the search index reads (scripts/build-search-index.mjs
   CATALOG_FILES), in its order -- Abercrombie and Hollister were in
   search and missing here. */
export const CATALOG_FILES = SEARCH_FILES.map((f) => "/" + f);
/* A brand needs this many products for a static head; a brand with
   BRAND_PAGE_MIN+ products must have one (scripts/test/brand-landing-tests.mjs). */
export const BRAND_PAGE_MIN = 20;

const EXTRA_LABELS = {
  americaneagle: "American Eagle", partycity: "Party City", elite: "Elite Sports", gameness: "Gameness",
  tennisexpress: "Tennis Express", academy: "Academy Sports", prosoccer: "Pro Soccer", xtremesoccer: "Xtreme Soccer",
};
export const ALL_LABELS = { ...EXTRA_LABELS, ...Object.fromEntries(Object.entries(RETAILERS).map(([k, r]) => [k, r.label || k])) };

function runBrowserScript(root, file) {
  const win = {};
  new Function("window", readFileSync(join(root, file), "utf8"))(win);
  return win;
}

/* The selling price, as the store's scrape spells it (Old Navy:
   effectivePrice) -- the same reading as the storefront builder. */
export function priceOf(it) {
  const p = Number(it.price);
  if (p > 0) return p;
  const alt = Number(it.effectivePrice ?? it.currentPrice ?? it.salePrice);
  return alt > 0 ? alt : NaN;
}
/* One product, one row (scripts/lib/product-identity.js), as in search. */
export const rowKeysOf = (retailer, url, name, image, price) => productKeys(retailer, url, name, image, price);

/* Every product, normalized and de-duplicated. No photo, no card. */
export function loadAllItems(root = ROOT) {
  const { AriaSale } = runBrowserScript(root, "sale-rule.js");
  const { AriaProductType } = runBrowserScript(root, "product-type.js");
  const out = [], seen = new Set();
  for (const f of CATALOG_FILES) {
    let data;
    try { data = JSON.parse(readFileSync(join(root, f), "utf8")); } catch { continue; }
    const retailers = data && data.retailers;
    if (!retailers || typeof retailers !== "object") continue;
    for (const rkey of Object.keys(retailers)) {
      const r = retailers[rkey];
      if (!r || typeof r !== "object") continue;
      for (const section of ["departments", "brands"]) {
        const sec = r[section];
        if (!sec || typeof sec !== "object") continue;
        for (const skey of Object.keys(sec)) {
          const bucket = sec[skey];
          const arr = Array.isArray(bucket) ? bucket : (bucket && Array.isArray(bucket.items) ? bucket.items : null);
          if (!arr) continue;
          for (const it0 of arr) {
            if (!it0 || typeof it0 !== "object") continue;
            const name = decodeEntities(it0.name || it0.title || it0.productName || "").trim();
            const price = priceOf(it0);
            if (!name || !(price > 0)) continue;
            const it = it0.price === price ? it0 : { ...it0, price };
            let img = it.thumbnail || it.image || it.imageUrl || "";
            if (!img && Array.isArray(it.images) && it.images[0]) img = it.images[0];
            if (!img || typeof img !== "string") continue;
            const onSale = AriaSale.isOnSale(it);
            const orig = onSale ? Number(AriaSale.originalPrice(it)) : 0;
            const retailer = String(it.retailer || rkey || "");
            if (isOffSaleRetailer(retailer) || isOffSaleRetailer(rkey)) continue;   /* /off-sale.js */
            const url = String(it.url || it.link || it.productUrl || "");
            if (!firstSighting(seen, rowKeysOf(retailer, url, name, img, price))) continue;
            const brand = decodeEntities(it.brand || "").trim();
            const p = {
              name, brand, price, orig, image: img, url, retailer,
              ptype: AriaProductType.classify({ name, type: it.type, retailer: it.retailer || rkey, brand: it.brand, bucket: section === "departments" ? skey : "" }),
            };
            p.pct = AriaSale.discountPct({ name: p.name, price: p.price, originalPrice: onSale ? orig : null, onSale });
            /* ph: the photo count when 2+ (#443 c.6546035414): photo arrows on brand cards. */
            const ph = photoCount(root, p.name, (rkey || retailer).toLowerCase());
            if (ph > 1) p.ph = ph;
            out.push(p);
          }
        }
      }
    }
  }
  fillBrands(out, root);
  for (const p of out) p.brandKey = brandKeyOf(p.brand);
  return out;
}

/* A BLANK BRAND takes the brand its title opens with -- the search
   index's rule (build-search-index.mjs inferBrands, the same brand
   list), so "lego" is one set of products on the brand page and in
   search (Walmart's LEGO sets carry no brand field). */
export function fillBrands(items, root = ROOT) {
  const rows = items.map((p) => ({ p, title: p.name, brand: p.brand }));
  inferBrands(rows, knownBrands(root.endsWith("/") ? root : root + "/"));
  for (const r of rows) if (r.brand) r.p.brand = r.brand;
}

/* Brand keys worth a static head: every brand with STATIC_MIN+ products. */
export function staticBrands(items) {
  const n = {};
  for (const p of items) if (p.brandKey) n[p.brandKey] = (n[p.brandKey] || 0) + 1;
  return Object.keys(n).filter((k) => n[k] >= STATIC_MIN).sort();
}

/* Old slugs -> the brand's key: the pre-2026-11-02 key of each spelling
   ("maisonkitsun") and each spelling's plain key ("herschelsupply"),
   where that is not itself a brand. spellingsOnly: the plain keys alone
   (search's brand names: a shopper types "herschel supply"). */
export function brandAliases(items, { spellingsOnly = false } = {}) {
  const keys = new Set(items.map((p) => p.brandKey).filter(Boolean));
  const out = {};
  for (const p of items) {
    if (!p.brandKey) continue;
    for (const a of spellingsOnly ? [plainKey(p.brand)] : [legacyKeyOf(p.brand), plainKey(p.brand)]) {
      if (a && a !== p.brandKey && !keys.has(a) && !(a in out)) out[a] = p.brandKey;
    }
  }
  return Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
}

export function build(root = ROOT) {
  const items = loadAllItems(root);
  const out = join(root, OUT_DIR);
  if (existsSync(out)) rmSync(out, { recursive: true });
  mkdirSync(join(root, OUT_DIR, "_fn"), { recursive: true });
  const labels = {};
  for (const p of items) if (ALL_LABELS[p.retailer]) labels[p.retailer] = ALL_LABELS[p.retailer];
  writeFileSync(join(root, FN_FILE), JSON.stringify({ v: 1, labels, aliases: brandAliases(items), spellings: brandAliases(items, { spellingsOnly: true }), rows: items.map(fnRow) }));
  const keys = staticBrands(items);
  const byKey = new Map();
  for (const p of items) { if (!byKey.has(p.brandKey)) byKey.set(p.brandKey, []); byKey.get(p.brandKey).push(p); }
  for (const key of keys) writeFileSync(join(out, key + ".json"), JSON.stringify(headOf(key, byKey.get(key) || filterByBrand(items, key), labels)));
  return { items: items.length, heads: keys.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const t = Date.now();
  const s = build();
  console.log(`${s.items} products, ${s.heads} static brand heads, ${((Date.now() - t) / 1000).toFixed(1)}s -> ${OUT_DIR}/`);
}

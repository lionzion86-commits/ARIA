#!/usr/bin/env node
/* ============================================================
   bestbuy-catalog.json — BEST BUY, INGESTED (Issue #413, 2026-10-19).

   SOURCE. The one dataset Lucifer QA'd on the issue (comment
   6251619527): data/bestbuy/bestbuy-catalog.json on the branch
   data/bestbuy-2026-10-18 -- 5,142 products, already in Aria's catalogue
   envelope. No other Best Buy data is read. The raw file is never
   committed to main: this script reads it from that branch (or from a
   local copy given with --src) and writes the ingested catalogue.

   WHAT INGESTING DOES, AND NOTHING ELSE.
     1. THIRD-PARTY SELLERS OUT, BY FLAG (Danny's ruling, comment
        6266366539). Records the pull marked sellerType "3P" are
        bestbuy.com marketplace sellers, not Best Buy; Aria buys from
        Best Buy the retailer (the DR-13 exemption, returns and the buying
        flow all assume it). EXCLUDED_SELLER_TYPES below is the whole
        rule: the records never enter the catalogue, nothing is deleted by
        hand, and flipping the ruling is a one-line change plus a rebuild.
     2. BUCKETS RENAMED TO SAFE KEYS. The pull's department keys stay
        (laptops, gaming, audio, ...); "small-appliances" becomes
        small_appliances so it is a plain identifier like every other
        bucket. index.html's BUCKET_SPEC (and scripts/lib/department-map.js)
        map each bucket into the site's taxonomy: Electrónica for the
        tech buckets, Hogar for small appliances.
     3. WEIGHT: THE RECORD'S OWN, OR THE SITE'S ESTIMATE. A record whose
        weightKg was parsed from Best Buy's spec table (weightEstimated
        false, weight above zero) keeps it. Every other record gets no
        weight from the pull -- the site's existing estimator
        (apply-weight-estimates.py over weight-estimates.json, the same
        one the other catalogues went through) fills it and flags it
        weightEstimated. Nothing is invented here.
     4. SIZES ARE NEVER INVENTED. Best Buy variants are separate SKUs
        (each its own record); availableSizes stays exactly as pulled
        (empty for all 5,142).
     5. CARD + PRODUCT-PAGE FIELDS ONLY. The spec table and feature
        bullets (two thirds of the raw file) are not read by any page;
        they stay in the dataset branch. Kept: what cards, the product
        page, search, pricing and cross-store comparison read -- plus the
        SKU, model number and UPC, which identify the same product in
        another store's catalogue (#416 comparison grouping).

   Prices are the pull's Best Buy shelf prices. The customer stack
   (tiered margin + Miami's 7%) is applied where every store's is, in
   normalizeLiveItem; the Florida DR-13 exemption converts Aria's buying
   cost and is never itemized to shoppers (TAX_EXEMPT_STATUS keeps
   bestbuy at 'unknown', i.e. x1.07, like every unverified store).

   REGENERATE:
     node scripts/build-bestbuy-catalog.mjs [--src <raw json>]
   then the derived builds, in this order:
     node scripts/build-store-slices.mjs        (the storefront)
     node scripts/build-ofertas-feed.mjs        (then -lite is written too)
     node scripts/build-ofertas-slices.mjs
     node scripts/build-search-index.mjs
     node scripts/build-price-index.mjs
     node scripts/build-pdp-slices.mjs
     node scripts/build-department-slices.mjs
     node scripts/build-home-shelves.mjs
   scripts/test/bestbuy-tests.mjs fails when a 3P record is in the
   catalogue or the counts drift.
   ============================================================ */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const OUT_FILE = "bestbuy-catalog.json";
export const SOURCE_REF = "origin/data/bestbuy-2026-10-18";
export const SOURCE_PATH = "data/bestbuy/bestbuy-catalog.json";

/* Danny, 2026-10-19: third-party marketplace records are excluded. */
export const EXCLUDED_SELLER_TYPES = new Set(["3P"]);
export function isExcludedRecord(p) {
  return !!(p && EXCLUDED_SELLER_TYPES.has(String(p.sellerType || "").toUpperCase()));
}

/* Pull bucket key -> catalogue bucket key. */
export const BUCKET_KEYS = {
  laptops: "laptops", gaming: "gaming", audio: "audio", "small-appliances": "small_appliances",
  phones: "phones", cameras: "cameras", accessories: "accessories", wearables: "wearables",
  tablets: "tablets", monitors: "monitors", electronics: "electronics",
};

const KEEP = ["name", "retailer", "brand", "price", "originalPrice", "onSale", "image", "images", "url", "type",
  "weightKg", "weightEstimated", "description", "descriptionSource", "rating", "reviewCount",
  "sku", "modelNumber", "upc", "variantAttributes", "availableSizes"];
const MAX_IMAGES = 6;

export function readSource(srcPath) {
  if (srcPath) return JSON.parse(readFileSync(srcPath, "utf8"));
  const local = ROOT + SOURCE_PATH;
  if (existsSync(local)) return JSON.parse(readFileSync(local, "utf8"));
  const text = execFileSync("git", ["show", `${SOURCE_REF}:${SOURCE_PATH}`], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, encoding: "utf8" });
  return JSON.parse(text);
}

function ingestRecord(p) {
  const out = {};
  for (const k of KEEP) {
    const v = p[k];
    if (v === undefined || v === null || v === "") continue;
    out[k] = v;
  }
  out.retailer = "bestbuy";
  if (Array.isArray(out.images)) out.images = out.images.filter((u) => typeof u === "string" && u).slice(0, MAX_IMAGES);
  /* A sale needs a real was-price; the flag alone is not one. */
  if (!(Number(out.originalPrice) > Number(out.price))) { delete out.originalPrice; out.onSale = false; }
  /* The record's own weight when Best Buy's spec table gave one. */
  const w = Number(p.weightKg);
  if (p.weightEstimated === false && Number.isFinite(w) && w > 0) { out.weightKg = w; out.weightEstimated = false; }
  else { delete out.weightKg; delete out.weightEstimated; }
  if (!Array.isArray(out.availableSizes)) out.availableSizes = [];
  return out;
}

export function ingest(src) {
  const bb = src && src.retailers && src.retailers.bestbuy;
  if (!bb || !bb.departments) throw new Error("the source has no retailers.bestbuy.departments");
  const departments = {};
  const stats = { source: 0, excluded3P: 0, ingested: 0, onSale: 0, realWeight: 0, perDepartment: {} };
  for (const [srcKey, dept] of Object.entries(bb.departments)) {
    const key = BUCKET_KEYS[srcKey];
    if (!key) throw new Error("unmapped Best Buy department: " + srcKey);
    const items = [];
    for (const p of dept.items || []) {
      stats.source++;
      if (isExcludedRecord(p)) { stats.excluded3P++; continue; }
      const rec = ingestRecord(p);
      if (rec.onSale) stats.onSale++;
      if (rec.weightEstimated === false) stats.realWeight++;
      items.push(rec);
    }
    stats.ingested += items.length;
    stats.perDepartment[key] = items.length;
    departments[key] = { label: dept.label, items };
  }
  return {
    catalog: {
      generatedAt: src.generatedAt || null,
      source: (src.source || "") + " -- ingested by scripts/build-bestbuy-catalog.mjs (3P excluded)",
      declaredProductCount: stats.ingested,
      retailers: { bestbuy: { label: "Best Buy", departments } },
    },
    stats,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--src");
  const src = readSource(i > 0 ? process.argv[i + 1] : null);
  const { catalog, stats } = ingest(src);
  writeFileSync(ROOT + OUT_FILE, JSON.stringify(catalog));
  /* The site's own weight estimator fills every weight the pull did not
     really have (never overwrites a real one). */
  execFileSync("python3", ["apply-weight-estimates.py", "weight-estimates.json", OUT_FILE, "--in-place"], { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] });
  console.log(`${OUT_FILE}: ${stats.ingested} ingested of ${stats.source} (${stats.excluded3P} third-party excluded), ${stats.onSale} with a was-price, ${stats.realWeight} real weights`);
  console.log(JSON.stringify(stats.perDepartment));
}

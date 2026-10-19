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

/* SOLD BY BEST BUY, ONLY (#432 audit, Lucifer, 2026-10-19). On some
   product pages the pull captured a Marketplace seller's offer instead
   of Best Buy's own price: the PS5 Pro at $1,553.39 (Best Buy sells it
   at $699.99), a DJI Mini 4 Pro + RC 2 at $4,000, Switch 2 "bundles"
   from $584.95, a duplicate $879 Xbox, a $710 PS5 Slim. Every one of
   them is a Marketplace listing: Best Buy's own SKUs are 7 digits
   (6601524), Marketplace listings carry 8-digit SKUs (12906125). The
   pull agrees exactly -- all 178 records it tagged "3P" have 8-digit
   SKUs, all 59 it tagged "1P" have 7. So a record is Best Buy's own
   when the pull says 1P, or says nothing and the SKU is Best Buy's
   (7 digits or fewer); a marketplace price never becomes the store's. */
export function isMarketplaceRecord(p) {
  const seller = String((p && p.sellerType) || "").toUpperCase();
  if (seller === "1P") return false;
  if (EXCLUDED_SELLER_TYPES.has(seller)) return true;
  const sku = String((p && p.sku) || "").trim();
  return !/^\d{1,7}$/.test(sku);
}
export function isExcludedRecord(p) {
  return !!p && isMarketplaceRecord(p);
}

/* FIRST-PARTY PRICES VERIFIED ON BESTBUY.COM (#432 cross-store audit,
   hidden_files/price-audit-cross-store-2026-10-19.md). The pull only
   reached these products through a Marketplace listing; the audit read
   Best Buy's own price on the live product page. Keyed by the
   Marketplace SKU the pull holds; the record keeps its photos and specs
   (same product) and takes Best Buy's SKU and price. */
export const FIRST_PARTY_REPLACEMENTS = {
  "12906125": { name: "PlayStation 5 Pro Console", sku: "6601524", price: 699.99 },
  "10926658": { name: "Samsung - Galaxy Tab S11 Ultra - 14.6\" 1TB", sku: null, price: 1899.99 },
};

/* HELD FOR A PRICE RE-CHECK (#432): Best Buy's own SKUs whose price the
   audit could not confirm. They stay out of the catalogue until a
   person verifies them on bestbuy.com, then come off this list. */
export const HELD_FOR_PRICE_REVIEW = {
  "6522258": "Echo Dot (5th Gen) at $79.99 vs Target $49.59 (+61%)",
  "6566039": "PlayStation 5 Slim Console at $439.99 (stray row)",
};

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
  const stats = { source: 0, excluded3P: 0, excludedMarketplace: 0, replaced: 0, held: 0, ingested: 0, onSale: 0, realWeight: 0, perDepartment: {} };
  for (const [srcKey, dept] of Object.entries(bb.departments)) {
    const key = BUCKET_KEYS[srcKey];
    if (!key) throw new Error("unmapped Best Buy department: " + srcKey);
    const items = [];
    for (const p of dept.items || []) {
      stats.source++;
      const fix = FIRST_PARTY_REPLACEMENTS[String(p.sku)];
      if (HELD_FOR_PRICE_REVIEW[String(p.sku)]) { stats.held++; continue; }
      if (isExcludedRecord(p) && !fix) {
        if (String(p.sellerType || "").toUpperCase() === "3P") stats.excluded3P++;
        else stats.excludedMarketplace++;
        continue;
      }
      const rec = ingestRecord(p);
      if (fix) {
        stats.replaced++;
        rec.price = fix.price;
        if (fix.sku) rec.sku = fix.sku; else delete rec.sku;
        /* Best Buy's own shelf price; the Marketplace was-price is not it. */
        delete rec.originalPrice; rec.onSale = false;
        delete rec.url;
      }
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
      source: (src.source || "") + " -- ingested by scripts/build-bestbuy-catalog.mjs (sold by Best Buy only)",
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
  console.log(`${OUT_FILE}: ${stats.ingested} ingested of ${stats.source} (${stats.excluded3P} tagged third-party + ${stats.excludedMarketplace} other Marketplace listings excluded, ${stats.replaced} replaced by Best Buy's verified price, ${stats.held} held for a price re-check), ${stats.onSale} with a was-price, ${stats.realWeight} real weights`);
  console.log(JSON.stringify(stats.perDepartment));
}

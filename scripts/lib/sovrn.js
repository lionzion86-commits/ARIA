/* ============================================================
   NEIMAN MARCUS VIA SOVRN COMMERCE — THE API HARVEST (#443).

   Sovrn Commerce ships NO bulk product feed file: product data is
   API-only. Neiman Marcus is Sovrn merchant 2243. Two APIs, as the
   publisher docs were read into #443 (nothing else about them is known
   in this repo):

   (a) Product Recommendation API
         POST https://shopping-gallery.prd-commerce.sovrnservices.com/ai-orchestration/products
         `apiKey` query parameter (SOVRN_API_KEY, the site API key);
         filter includeMerchants=<Neiman Marcus group ID, from Sovrn's
         Approved Merchants API>; numProducts default 4, MAX 50 per
         request; rate limit 30,000 requests per 5 minutes.
       THIS is what the harvest uses: Neiman Marcus's assortment is
       enumerated by keyword sweeps (scripts/neimanmarcus/sovrn-sweep-
       plan.json), 50 products per request, de-duplicated by product id
       and by brand + name + colour.

   (b) Price Comparisons API
         GET https://comparisons.sovrn.com/api/affiliate/v3.5/sites/{site-key}/compare/prices/{market}/by/accuracy
         secret key in the Authorization header (SOVRN_SECRET_KEY,
         SOVRN_SITE_KEY); search by barcode / plainlink / keywords;
         100 requests per second.
       NOT used here. Follow-up: enrich harvested rows by barcode (GTIN)
       through it once the first real run shows what (a) returns.

   ASSUMPTIONS (nothing in this repo documents more; each is stated so the
   first real run can confirm or fix it from the raw responses saved
   under data/neimanmarcus/sovrn-raw-<stamp>/):
     A1  The request: apiKey, includeMerchants and numProducts as query
         parameters, the sweep term in a JSON body as `keywords`. This is
         the `request` template in the sweep plan file; change it there
         (no code change) once Sovrn's docs are in hand. The key is
         substituted at run time and NEVER written to a raw file.
     A2  The response carries the products as an array: the body itself,
         or under products / items / results / recommendations / data
         (or data.products / data.items). productsOf() records which.
     A3  Field names in a product (none documented): read tolerantly by
         sovrnToRow() from the SOVRN_FIELD_KEYS lists below. A mapped
         field missing in more than half the rows makes the field report
         list every raw key name seen, so the mapping can be fixed.
     A4  When a row carries both a list price and a sale price, the
         lower is the price the shopper pays and the higher the was-price.
     A5  Currency must be stated by the row (USD) or the row is held
         (currency-unstated) — the same rule as every pull; --assume-usd
         only once Sovrn's docs state US dollars for the market used.
     A6  A row naming a merchant id other than 2243 (or the group id in
         use) is not Neiman Marcus's own listing: its seller is set from
         that id and the shared seller rule quarantines it.
     A7  Sovrn's links are affiliate/redirect URLs. THE SITE NEVER LINKS
         OUT. Only a plain neimanmarcus.com product page URL is kept, in
         `url` (query and fragment cut) — the field every catalogue in
         this repo keeps its source page in, which no page renders as a
         link (build-pdp-slices.mjs drops it). Any other URL (a Sovrn or
         redirect link, a tracked deep link) is dropped, never stored.

   Pure functions plus one injectable async sweep (no network of its own,
   no files): scripts/build-neimanmarcus-catalog.mjs is the command and
   supplies fetch and the raw-file writer; scripts/test/neimanmarcus-
   pull-tests.mjs pins the rules offline. NOTHING HERE INVENTS A PRODUCT
   FACT, AN ID OR A URL.
   ============================================================ */

import { bannerOf } from "./nmg-banners.js";

export const SOVRN_PRODUCTS_URL = "https://shopping-gallery.prd-commerce.sovrnservices.com/ai-orchestration/products";
export const SOVRN_NM_MERCHANT_ID = "2243";
export const SOVRN_MAX_PER_REQUEST = 50;
export const SOVRN_RATE_LIMIT = { requests: 30000, windowMs: 5 * 60 * 1000 };
/* The throttle: a share of the published limit, well under it. 10% =
   3,000 requests per 5 minutes = one request every 100 ms. */
export const SOVRN_THROTTLE_SHARE = 0.1;
export const SOVRN_MAX_REQUESTS = 3000;
/* The yield stop: a department's sweep stops when its last
   YIELD_WINDOW requests found fewer than MIN_YIELD new products per
   request on average (2 of 50 = 4%). */
export const SOVRN_MIN_YIELD = 2;
export const SOVRN_YIELD_WINDOW = 8;
export const SOVRN_ENV = { apiKey: "SOVRN_API_KEY", secretKey: "SOVRN_SECRET_KEY", siteKey: "SOVRN_SITE_KEY", groupId: "NM_SOVRN_GROUP_ID", approvedMerchantsUrl: "SOVRN_APPROVED_MERCHANTS_URL", productsUrl: "SOVRN_PRODUCTS_URL" };

const first = (...vals) => {
  for (const v of vals) if (v !== undefined && v !== null && v !== "") return v;
  return null;
};

/* ---------------- the group id ---------------- */

/** How to get the group id. Printed when it is missing; nothing is invented. */
export function groupIdGuidance({ approvedMerchantsUrl = null, banner = bannerOf() } = {}) {
  const b = bannerOf(banner);
  if (b.key !== "neimanmarcus") return bannerGroupIdGuidance(b, approvedMerchantsUrl);
  const out = [];
  out.push("");
  out.push("  ====================================================");
  out.push("  NEIMAN MARCUS GROUP ID MISSING -- nothing was requested");
  out.push("  ====================================================");
  out.push("  The Product Recommendation API filters by merchant with includeMerchants=<group ID>.");
  out.push("  Neiman Marcus's group ID comes from Sovrn's Approved Merchants API (Neiman Marcus is");
  out.push(`  Sovrn merchant ${SOVRN_NM_MERCHANT_ID}; the group ID is a separate value and is not guessed here).`);
  out.push("  This repo does not record the Approved Merchants API's URL. Either:");
  out.push("    1. open the Approved Merchants API in Sovrn's publisher docs / dashboard (the account must");
  out.push("       be approved first), find the Neiman Marcus entry and its group ID, then set");
  out.push(`       ${SOVRN_ENV.groupId}=<id>   (or pass --merchant-group <id>);  or`);
  out.push("    2. give this script that API's URL exactly as Sovrn documents it:");
  out.push(`       --approved-merchants-url <url>   (or ${SOVRN_ENV.approvedMerchantsUrl})`);
  out.push("       It is fetched once (with apiKey from SOVRN_API_KEY added as a query parameter when the URL");
  out.push("       has none -- an ASSUMPTION, the same auth as the Recommendation API), the raw answer is");
  out.push("       saved, and every entry that names Neiman Marcus or merchant 2243 is printed in full.");
  out.push(`       Read the group ID from it and set ${SOVRN_ENV.groupId}. The script still stops there.`);
  if (approvedMerchantsUrl) out.push(`  (approved-merchants URL given: ${approvedMerchantsUrl})`);
  out.push("  ====================================================");
  return out.join("\n");
}

/* The same guidance for Bergdorf Goodman / Horchow: their own merchant id and env var. */
function bannerGroupIdGuidance(b, approvedMerchantsUrl) {
  const out = [];
  out.push("");
  out.push("  ====================================================");
  out.push(`  ${b.label.toUpperCase()} GROUP ID MISSING -- nothing was requested`);
  out.push("  ====================================================");
  out.push("  The Product Recommendation API filters by merchant with includeMerchants=<group ID>.");
  out.push(`  ${b.label} is Sovrn merchant ${b.merchantId}; its group ID comes from Sovrn's Approved Merchants API`);
  out.push("  and may not equal the merchant id. It is not guessed here. Either:");
  out.push(`    1. read it from the Approved Merchants API / dashboard and set ${b.groupEnv}=<id> (or --merchant-group <id>); or`);
  out.push(`    2. pass --approved-merchants-url <url> (or ${SOVRN_ENV.approvedMerchantsUrl}): it is fetched once, saved, and every`);
  out.push(`       entry naming ${b.label} or merchant ${b.merchantId} is printed. The script still stops there.`);
  if (approvedMerchantsUrl) out.push(`  (approved-merchants URL given: ${approvedMerchantsUrl})`);
  out.push("  ====================================================");
  return out.join("\n");
}

/** Entries of an Approved Merchants answer that name a banner / its merchant id (Neiman Marcus / 2243 by default). */
export function bannerEntries(body, banner = bannerOf()) {
  const b = bannerOf(banner);
  const hits = [];
  const walk = (x, depth) => {
    if (!x || typeof x !== "object" || depth > 6) return;
    if (Array.isArray(x)) { for (const y of x) walk(y, depth + 1); return; }
    const flat = Object.entries(x).filter(([, v]) => v == null || typeof v !== "object").map(([, v]) => String(v)).join(" | ");
    if (b.sellerRx.test(flat) || Object.values(x).some((v) => String(v) === b.merchantId)) { hits.push(x); return; }
    for (const v of Object.values(x)) walk(v, depth + 1);
  };
  walk(body, 0);
  return hits;
}

/** Entries of an Approved Merchants answer that name Neiman Marcus / 2243. */
export function neimanEntries(body) {
  const hits = [];
  const walk = (x, depth) => {
    if (!x || typeof x !== "object" || depth > 6) return;
    if (Array.isArray(x)) { for (const y of x) walk(y, depth + 1); return; }
    const flat = Object.entries(x).filter(([, v]) => v == null || typeof v !== "object").map(([, v]) => String(v)).join(" | ");
    if (/neiman\s*marcus/i.test(flat) || Object.values(x).some((v) => String(v) === SOVRN_NM_MERCHANT_ID)) { hits.push(x); return; }
    for (const v of Object.values(x)) walk(v, depth + 1);
  };
  walk(body, 0);
  return hits;
}

/* ---------------- the sweep plan ---------------- */

/** Validate a sweep plan file's object. Throws on a malformed plan. */
export function checkSweepPlan(plan) {
  if (!plan || !Array.isArray(plan.departments) || !plan.departments.length) throw new Error("sweep plan: `departments` must be a non-empty array");
  const seen = new Set();
  for (const d of plan.departments) {
    if (!d || typeof d.category !== "string" || !d.category) throw new Error("sweep plan: every department needs a `category`");
    if (seen.has(d.category)) throw new Error(`sweep plan: department "${d.category}" listed twice`);
    seen.add(d.category);
    if (!Array.isArray(d.terms) || !d.terms.length || d.terms.some((t) => typeof t !== "string" || !t.trim())) throw new Error(`sweep plan: department "${d.category}" needs a non-empty list of string terms`);
  }
  if (plan.modifiers != null && (!Array.isArray(plan.modifiers) || plan.modifiers.some((m) => typeof m !== "string"))) throw new Error("sweep plan: `modifiers` must be a list of strings");
  const req = plan.request || {};
  const text = JSON.stringify(req);
  if (!/\{term\}/.test(text)) throw new Error("sweep plan: the `request` template must carry {term} somewhere");
  return plan;
}

/** A department's request terms, in order: its own terms, then (expand: true) modifier x term. */
export function termsOf(dept, modifiers = []) {
  const out = [], seen = new Set();
  const add = (t) => { const k = t.replace(/\s+/g, " ").trim().toLowerCase(); if (k && !seen.has(k)) { seen.add(k); out.push(t.replace(/\s+/g, " ").trim()); } };
  for (const t of dept.terms) add(t);
  if (dept.expand) for (const m of modifiers || []) for (const t of dept.terms) add(`${m} ${t}`);
  return out;
}

const fill = (v, vars) => (typeof v === "string" ? v.replace(/\{(apiKey|groupId|numProducts|term)\}/g, (_, k) => String(vars[k] ?? "")) : v);
function fillDeep(x, vars) {
  if (Array.isArray(x)) return x.map((y) => fillDeep(y, vars));
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, fillDeep(v, vars)]));
  if (x === "{numProducts}") return Number(vars.numProducts);
  return fill(x, vars);
}

/**
 * One request from the plan's template: { method, url, body, logged }.
 * `logged` is what the raw file records: the same request with the key
 * cut out (never written anywhere).
 */
export function buildRequest(plan, { term, apiKey, groupId, numProducts = SOVRN_MAX_PER_REQUEST, endpoint = SOVRN_PRODUCTS_URL }) {
  const n = Math.min(SOVRN_MAX_PER_REQUEST, Math.max(1, Math.floor(Number(numProducts) || SOVRN_MAX_PER_REQUEST)));
  const req = plan.request || {};
  const vars = { apiKey, groupId, numProducts: n, term };
  const q = new URLSearchParams();
  const qLogged = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query || {})) {
    const val = String(fill(v, vars));
    q.set(k, val);
    qLogged.set(k, /\{apiKey\}/.test(String(v)) ? "<redacted>" : val);
  }
  const body = req.body ? fillDeep(req.body, vars) : null;
  const sep = endpoint.includes("?") ? "&" : "?";
  return {
    method: String(req.method || "POST").toUpperCase(),
    url: endpoint + (q.toString() ? sep + q.toString() : ""),
    body,
    logged: { method: String(req.method || "POST").toUpperCase(), url: endpoint + (qLogged.toString() ? sep + qLogged.toString() : ""), body, term, numProducts: n },
  };
}

/* ---------------- the throttle ---------------- */

/** Milliseconds between requests to stay at `share` of the published limit. */
export function throttleIntervalMs({ limit = SOVRN_RATE_LIMIT.requests, windowMs = SOVRN_RATE_LIMIT.windowMs, share = SOVRN_THROTTLE_SHARE } = {}) {
  const s = Math.min(1, Math.max(0.001, Number(share) || SOVRN_THROTTLE_SHARE));
  return Math.ceil(windowMs / (limit * s));
}

/** Requests that can start in one rate window at a given interval (the first at t=0). */
export function requestsPerWindow(intervalMs, windowMs = SOVRN_RATE_LIMIT.windowMs) {
  return Math.floor((windowMs - 1) / intervalMs) + 1;
}

/**
 * A spacing throttle: every wait() returns no sooner than intervalMs
 * after the previous one returned. `now` and `sleep` are injectable.
 */
export function makeThrottle({ intervalMs = throttleIntervalMs(), now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let last = null;
  return {
    intervalMs,
    async wait() {
      if (last != null) {
        const d = last + intervalMs - now();
        if (d > 0) await sleep(d);
      }
      last = now();
      return last;
    },
    sleep,
  };
}

/* ---------------- the response and the mapper ---------------- */

const LIST_KEYS = ["products", "items", "results", "recommendations", "data", "hits", "offers"];
/** The product array in a response body, and where it was found (A2). */
export function productsOf(body) {
  if (Array.isArray(body)) return { list: body, at: "(body)" };
  if (!body || typeof body !== "object") return { list: [], at: null };
  for (const k of LIST_KEYS) {
    if (Array.isArray(body[k])) return { list: body[k], at: k };
  }
  for (const k of LIST_KEYS) {
    const inner = body[k];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      for (const j of LIST_KEYS) if (Array.isArray(inner[j])) return { list: inner[j], at: `${k}.${j}` };
    }
  }
  return { list: [], at: null };
}

/**
 * THE MAPPER'S KEYS (A3), per field, in the order tried. The field
 * report checks the same lists, so a key added here is a key read.
 * Dotted keys read one level down (price.amount).
 */
export const SOVRN_FIELD_KEYS = {
  id: ["productId", "product_id", "id", "itemId", "item_id", "sku", "offerId", "offer_id", "groupId"],
  name: ["name", "title", "productName", "product_name", "productTitle"],
  brand: ["brand", "brandName", "brand_name", "manufacturer", "designer"],
  price: ["salePrice", "sale_price", "price", "currentPrice", "current_price", "finalPrice", "price.amount", "price.value"],
  originalPrice: ["retailPrice", "retail_price", "originalPrice", "original_price", "listPrice", "list_price", "regularPrice", "regular_price", "msrp", "wasPrice"],
  currency: ["currency", "currencyCode", "currency_code", "priceCurrency", "price.currency", "price.currencyCode"],
  images: ["images", "imageUrls", "image_urls", "additionalImages", "additional_images", "image", "imageUrl", "image_url", "imageURL", "thumbnail", "thumbnailUrl", "thumbnail_url"],
  gtin: ["gtin", "gtin13", "gtin12", "gtin14", "gtin8", "upc", "ean", "barcode", "isbn"],
  sizes: ["variants", "sizes", "availableSizes", "available_sizes", "size"],
  description: ["description", "longDescription", "long_description", "shortDescription", "short_description"],
  url: ["merchantUrl", "merchant_url", "productUrl", "product_url", "plainlink", "plainLink", "url", "link", "deepLink", "deep_link", "affiliateUrl", "affiliate_url", "clickUrl", "redirectUrl"],
  merchant: ["merchantName", "merchant_name", "merchant", "retailer", "retailerName", "store", "merchantId", "merchant_id", "merchant.id", "merchant.name"],
  category: ["category", "categories", "categoryPath", "category_path", "breadcrumbs", "productType", "product_type", "googleCategory", "google_product_category"],
  color: ["color", "colour", "colorName", "color_name"],
  availability: ["availability", "inStock", "in_stock", "stock", "stockStatus", "available"],
};

function at(raw, key) {
  if (!raw || typeof raw !== "object") return null;
  if (!key.includes(".")) return raw[key];
  const [a, b] = key.split(".");
  const o = raw[a];
  return o && typeof o === "object" && !Array.isArray(o) ? o[b] : null;
}
const pick = (raw, field) => first(...SOVRN_FIELD_KEYS[field].map((k) => at(raw, k)));
const scalar = (v) => (v && typeof v === "object" && !Array.isArray(v) ? first(v.name, v.title, v.value, v.label) : v);
const money = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v === "object") return money(first(v.amount, v.value, v.price));
  const m = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/.exec(String(v));
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, "") + (m[2] ? "." + m[2] : ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const ISO_IN_TEXT = /\b(USD|CAD|EUR|GBP|MXN|AUD|PEN)\b/;

/** A plain neimanmarcus.com product page (A7), or null. Query/fragment cut. */
export function plainNmUrl(u) {
  return plainBannerUrl(u, "neimanmarcus.com");
}

/** A plain product page on the banner's own host (A7), or null. Query/fragment cut. */
export function plainBannerUrl(u, host) {
  const s = typeof u === "string" ? u.trim() : "";
  const h = String(host).replace(/[.]/g, "\\.");
  const m = new RegExp(`^https:\\/\\/((?:[a-z0-9-]+\\.)*${h})(\\/[^?#\\s]*)(?:[?#]\\S*)?$`, "i").exec(s);
  /* A page, not the home page: a path beyond "/". */
  return m && m[2].length > 1 ? `https://${m[1].toLowerCase()}${m[2]}` : null;
}

/**
 * One Sovrn product in, one raw row in the shape ingestRow reads out.
 * Only fills what the product states; returns null for a non-object.
 */
export function sovrnToRow(raw, { merchantIds = [SOVRN_NM_MERCHANT_ID], banner = bannerOf() } = {}) {
  const b = bannerOf(banner);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = {};
  const id = pick(raw, "id");
  if (id != null && typeof id !== "object") row.productId = String(id);
  const name = scalar(pick(raw, "name"));
  if (name) row.name = String(name);
  const brand = scalar(pick(raw, "brand"));
  if (brand) row.brand = String(brand);

  /* Price (A4): every stated price; the lowest is paid, a higher one is the was-price. */
  const paid = SOVRN_FIELD_KEYS.price.map((k) => money(at(raw, k))).filter((x) => x != null);
  const listed = SOVRN_FIELD_KEYS.originalPrice.map((k) => money(at(raw, k))).filter((x) => x != null);
  if (paid.length || listed.length) {
    const all = [...paid, ...listed];
    const low = Math.min(...(paid.length ? paid : listed));
    const high = Math.max(...all);
    row.price = low;
    if (high > low) row.originalPrice = high;
  }
  let cur = scalar(pick(raw, "currency"));
  if (!cur) {
    const txt = SOVRN_FIELD_KEYS.price.concat(SOVRN_FIELD_KEYS.originalPrice).map((k) => at(raw, k)).filter((x) => typeof x === "string").join(" ");
    const m = ISO_IN_TEXT.exec(txt);
    if (m) cur = m[1];
  }
  if (cur) row.currency = String(cur).trim().toUpperCase();

  /* Images: every one the product lists (gallery dedupe and size charts
     last happen in the shared ingestRow). */
  const imgs = [];
  for (const k of SOVRN_FIELD_KEYS.images) {
    const v = at(raw, k);
    if (Array.isArray(v)) imgs.push(...v);
    else if (v) imgs.push(v);
  }
  if (imgs.length) row.images = imgs;

  const gtin = pick(raw, "gtin");
  if (gtin != null && typeof gtin !== "object") row.gtin = String(gtin);

  /* Sizes as given: variants with a size (and their own stock / GTIN),
     or a plain size list. */
  const vlist = Array.isArray(raw.variants) ? raw.variants : null;
  if (vlist && vlist.some((v) => v && typeof v === "object")) row.variants = vlist.filter((v) => v && typeof v === "object");
  else {
    const sz = first(raw.sizes, raw.availableSizes, raw.available_sizes);
    if (Array.isArray(sz) && sz.length) row.availableSizes = sz;
    else if (typeof sz === "string" && sz.trim()) row.availableSizes = sz.split(/\s*[,|]\s*/).filter(Boolean);
  }

  const desc = pick(raw, "description");
  if (desc && typeof desc === "string") row.description = desc;
  const crumbs = pick(raw, "category");
  if (crumbs != null) row.breadcrumbs = crumbs;
  const color = scalar(pick(raw, "color"));
  if (color) row.color = String(color);

  /* Availability, as the product states it. */
  for (const k of SOVRN_FIELD_KEYS.availability) {
    const v = at(raw, k);
    if (v == null || v === "") continue;
    if (typeof v === "boolean") { row.inStock = v; break; }
    if (typeof v === "number") { if (v <= 0) row.inStock = false; break; }
    row.availability = String(v); break;
  }

  /* Seller (A6). */
  const mName = first(raw.merchantName, raw.merchant_name, raw.retailerName, scalar(raw.merchant), scalar(raw.retailer), scalar(raw.store));
  const mId = first(raw.merchantId, raw.merchant_id, raw.merchant && typeof raw.merchant === "object" ? raw.merchant.id : null);
  const ok = new Set(merchantIds.filter((x) => x != null && x !== "").map(String));
  if (mId != null && !ok.has(String(mId))) row.seller = mName && !b.sellerRx.test(String(mName)) ? String(mName) : `Sovrn merchant ${mId}`;
  else if (mName && typeof mName !== "object") row.seller = String(mName);

  /* The source page (A7): a plain URL on the banner's own host only. */
  for (const k of SOVRN_FIELD_KEYS.url) {
    const u = plainBannerUrl(at(raw, k), b.host);
    if (u) { row.url = u; break; }
  }
  return row;
}

/** Keys used to de-duplicate a mapped row: product id, and brand + name + colour. */
export function dedupeKeys(row) {
  const id = row && row.productId ? `id:${row.productId}` : null;
  const look = row && row.name ? `look:${[row.brand || "", row.name, row.color || ""].join("::").replace(/\s+/g, " ").trim().toLowerCase()}` : null;
  return { id, look };
}

/* ---------------- the field report ---------------- */

const REPORT_FIELDS = ["id", "name", "price", "currency", "images", "brand", "gtin", "sizes", "description", "url", "merchant", "category", "color", "availability"];
const rowHas = {
  id: (r) => r.productId != null,
  name: (r) => !!r.name,
  price: (r) => r.price > 0,
  currency: (r) => !!r.currency,
  images: (r) => Array.isArray(r.images) && r.images.length > 0,
  brand: (r) => !!r.brand,
  gtin: (r) => !!r.gtin || (Array.isArray(r.variants) && r.variants.some((v) => v.gtin || v.upc || v.ean)),
  sizes: (r) => (Array.isArray(r.variants) && r.variants.length > 0) || (Array.isArray(r.availableSizes) && r.availableSizes.length > 0),
  description: (r) => !!r.description,
  url: (r) => !!r.url,
  merchant: (r) => !!r.seller,
  category: (r) => r.breadcrumbs != null,
  color: (r) => !!r.color,
  availability: (r) => r.inStock != null || r.availability != null,
};

/**
 * Field coverage of the mapper over [{ raw, row }]: per field, how many
 * rows it filled; for a field missing in more than `missingShare` of
 * rows, every raw key name seen (with counts, one level of nesting) so
 * the mapping can be fixed after the first real run.
 */
export function fieldReport(pairs, { missingShare = 0.5 } = {}) {
  const n = pairs.length;
  const keyCount = new Map();
  for (const { raw } of pairs) {
    if (!raw || typeof raw !== "object") continue;
    for (const [k, v] of Object.entries(raw)) {
      keyCount.set(k, (keyCount.get(k) || 0) + 1);
      if (v && typeof v === "object" && !Array.isArray(v)) for (const j of Object.keys(v)) keyCount.set(`${k}.${j}`, (keyCount.get(`${k}.${j}`) || 0) + 1);
      if (Array.isArray(v) && v[0] && typeof v[0] === "object") for (const j of Object.keys(v[0])) keyCount.set(`${k}[].${j}`, (keyCount.get(`${k}[].${j}`) || 0) + 1);
    }
  }
  const read = new Set(Object.values(SOVRN_FIELD_KEYS).flat());
  const seen = [...keyCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const fields = REPORT_FIELDS.map((f) => {
    const have = pairs.filter((p) => p.row && rowHas[f](p.row)).length;
    const missing = n ? (n - have) / n : 0;
    return { field: f, have, missing, flagged: n > 0 && missing > missingShare, reads: SOVRN_FIELD_KEYS[f] || [] };
  });
  return {
    rows: n,
    fields,
    flagged: fields.filter((f) => f.flagged).map((f) => f.field),
    rawKeys: seen.map(([k, c]) => ({ key: k, count: c, read: read.has(k) })),
    unreadKeys: seen.filter(([k]) => !read.has(k) && !k.includes(".")).map(([k, c]) => ({ key: k, count: c })),
  };
}

export function formatFieldReport(rep) {
  const out = [];
  const pc = (x) => (100 * x).toFixed(1) + "%";
  out.push("");
  out.push("  ====================================================");
  out.push("  SOVRN FIELD MAPPING — what the mapper read from the raw responses");
  out.push("  ====================================================");
  out.push(`  products mapped: ${rep.rows.toLocaleString("en-US")}`);
  for (const f of rep.fields) {
    out.push(`    ${f.field.padEnd(13)} ${pc(rep.rows ? f.have / rep.rows : 0).padStart(6)} filled  (${f.have}/${rep.rows})${f.flagged ? "   MISSING IN >50% OF ROWS" : ""}`);
  }
  if (rep.flagged.length) {
    out.push("  ----------------------------------------------------");
    out.push(`  MAPPING TO FIX: ${rep.flagged.join(", ")} missing in more than half the rows.`);
    for (const f of rep.fields.filter((x) => x.flagged)) out.push(`    ${f.field}: the mapper reads ${f.reads.join(" | ") || "(derived)"}`);
    out.push(`  raw key names seen (count): ${rep.rawKeys.slice(0, 80).map((k) => `${k.key}(${k.count})${k.read ? "" : "*"}`).join(", ") || "(none -- no product objects found)"}`);
    out.push("  (* = a key the mapper does not read.) Fix SOVRN_FIELD_KEYS in scripts/lib/sovrn.js, then re-ingest");
    out.push("  the saved raw responses with --src <sovrn-raw dir> -- no new requests needed.");
  } else if (rep.unreadKeys.length) {
    out.push(`  raw keys not read by the mapper: ${rep.unreadKeys.slice(0, 40).map((k) => `${k.key}(${k.count})`).join(", ")}`);
  }
  out.push("  ====================================================");
  return out.join("\n");
}

/* ---------------- the sweep ---------------- */

/**
 * The de-duplicated pool. add() maps each product, keeps the first copy
 * of a product id or of a brand + name + colour, and returns how many
 * were new. Shared by the live sweep and the replay of saved raw files.
 */
export function makePool({ merchantIds = [SOVRN_NM_MERCHANT_ID], banner = bannerOf() } = {}) {
  const seenId = new Set(), seenLook = new Set();
  const found = [];
  return {
    found,
    add(department, list, stats = null, cap = Infinity) {
      let fresh = 0;
      for (const raw of list || []) {
        if (found.length >= cap) break;
        const row = sovrnToRow(raw, { merchantIds, banner });
        if (!row) continue;
        if (stats) stats.returned++;
        const { id, look } = dedupeKeys(row);
        if ((id && seenId.has(id)) || (look && seenLook.has(look))) continue;
        if (id) seenId.add(id);
        if (look) seenLook.add(look);
        found.push({ department, raw, row });
        fresh++;
      }
      return fresh;
    },
  };
}

/**
 * Re-read saved raw responses ([{ department, status, body }] in request
 * order) through the CURRENT mapper -- the way to fix the field mapping
 * after the first real run without one new request.
 */
export function replayResponses(responses, { merchantIds = [SOVRN_NM_MERCHANT_ID], banner = bannerOf() } = {}) {
  const pool = makePool({ merchantIds, banner });
  const perDepartment = {};
  const shapes = {};
  for (const r of responses) {
    const pd = perDepartment[r.department] = perDepartment[r.department] || { requests: 0, returned: 0, new: 0, terms: 0, stoppedBy: "replay" };
    pd.requests++;
    if (!(r.status >= 200 && r.status < 300)) continue;
    const { list, at: where } = productsOf(r.body);
    if (where == null) continue;
    shapes[where] = (shapes[where] || 0) + 1;
    pd.new += pool.add(r.department, list, pd);
  }
  return { requests: responses.length, found: pool.found, perDepartment, shapes, stopped: "replay of saved responses", unique: pool.found.length };
}

/**
 * THE SWEEP. Departments in plan order; per department its terms; one
 * request per term (numProducts 50). Every product is mapped and
 * de-duplicated across the whole sweep (product id, then brand + name +
 * colour). Stops:
 *   - target:       unique products found >= target;
 *   - max-requests: requests made >= maxRequests;
 *   - yield (per department): the last `yieldWindow` requests found
 *     fewer than minYield * yieldWindow new products -> next department;
 *   - first-request-failed: a request fails (not a 2xx, or no product
 *     array in the answer) before any request has succeeded -> stop (auth / template / shape problem;
 *     the raw answer is saved for it);
 *   - errors: 5 failed requests in a row.
 * `request(term, dept)` is async and returns { status, ok, body }.
 * `onResponse(seq, dept, logged, res)` saves the raw answer.
 */
export async function runSweep({
  plan, request, onResponse = () => {}, throttle = makeThrottle(), log = () => {},
  target = 30000, maxRequests = SOVRN_MAX_REQUESTS, minYield = SOVRN_MIN_YIELD, yieldWindow = SOVRN_YIELD_WINDOW,
  merchantIds = [SOVRN_NM_MERCHANT_ID], retries429 = 3, backoffMs = 60000, banner = bannerOf(),
}) {
  checkSweepPlan(plan);
  const pool = makePool({ merchantIds, banner });
  const found = pool.found;       // { department, raw, row }
  const perDepartment = {};
  const shapes = {};
  let requests = 0, consecutiveErrors = 0, stopped = null, everOk = false;
  const out = () => ({ requests, found, perDepartment, shapes, stopped: stopped || "plan-exhausted", unique: found.length });

  for (const dept of plan.departments) {
    const pd = perDepartment[dept.category] = { requests: 0, returned: 0, new: 0, terms: 0, stoppedBy: null };
    const terms = termsOf(dept, plan.modifiers);
    const yields = [];
    for (const term of terms) {
      if (requests >= maxRequests) { stopped = "max-requests"; return out(); }
      if (found.length >= target) { stopped = "target"; return out(); }
      let res = null, attempt = 0;
      for (;;) {
        await throttle.wait();
        requests++; pd.requests++;
        res = await request(term, dept);
        onResponse(requests, dept, term, res);
        if (res && res.status === 429 && attempt < retries429 && requests < maxRequests) {
          attempt++;
          log(`      429 from Sovrn: backing off ${Math.round((backoffMs * attempt) / 1000)}s`);
          await throttle.sleep(backoffMs * attempt);
          continue;
        }
        break;
      }
      pd.terms++;
      const { list, at: where } = res && res.ok ? productsOf(res.body) : { list: [], at: null };
      if (!res || !res.ok || where == null) {
        consecutiveErrors++;
        if (!everOk) {
          stopped = `first-request-failed (HTTP ${res ? res.status : "?"}${res && res.ok && where == null ? ", no product array in the answer" : ""})`;
          return out();
        }
        if (consecutiveErrors >= 5) { stopped = `errors (5 failed requests in a row, last HTTP ${res ? res.status : "?"})`; return out(); }
        yields.push(0);
      } else {
        consecutiveErrors = 0;
        everOk = true;
        shapes[where] = (shapes[where] || 0) + 1;
        const fresh = pool.add(dept.category, list, pd, target);
        pd.new += fresh;
        yields.push(fresh);
      }
      if (yields.length >= yieldWindow) {
        const recent = yields.slice(-yieldWindow).reduce((a, b) => a + b, 0);
        if (recent < minYield * yieldWindow) { pd.stoppedBy = `yield (${recent} new in the last ${yieldWindow} requests)`; break; }
      }
    }
    if (!pd.stoppedBy) pd.stoppedBy = "terms-exhausted";
  }
  if (found.length >= target) stopped = "target";
  return out();
}

/** The sweep's products as the `pulled` list ingestPull reads: one quota per department, plan order. */
export function sweepToPulled(found, plan) {
  const byDept = new Map(plan.departments.map((d) => [d.category, { quota: { category: d.category, phase: d.phase || 2, ...(d.gender ? { gender: d.gender } : {}), ...(d.bucket ? { bucket: d.bucket } : {}) }, items: [] }]));
  for (const f of found) {
    if (!byDept.has(f.department)) byDept.set(f.department, { quota: { category: f.department, phase: 2 }, items: [] });
    byDept.get(f.department).items.push(f.row);
  }
  return [...byDept.values()].filter((p) => p.items.length);
}

/** The sweep summary block (requests, unique pool, per department, against the target). */
export function formatSweep(sweep, { target = 30000, intervalMs = null, rawDir = null, banner = bannerOf() } = {}) {
  const n = (x) => Number(x).toLocaleString("en-US");
  const out = [];
  out.push("");
  out.push("  ====================================================");
  out.push(`  ${bannerOf(banner).label.toUpperCase()} VIA SOVRN — THE SWEEP`);
  out.push("  ====================================================");
  out.push(`  requests made: ${n(sweep.requests)}${intervalMs ? `  (one every ${intervalMs} ms = ${n(requestsPerWindow(intervalMs))} per 5 min max; Sovrn's limit is ${n(SOVRN_RATE_LIMIT.requests)})` : ""}`);
  out.push(`  stopped by: ${sweep.stopped}`);
  out.push(`  unique products found (the candidate pool before ingest): ${n(sweep.unique)}`);
  out.push(`  coverage against the ~${n(target)} target: ${(100 * sweep.unique / (target || 1)).toFixed(1)}%${sweep.unique < target ? "  -- PARTIAL: a keyword sweep of a 50-per-request API does not enumerate the whole catalogue" : ""}`);
  out.push("  per department (requests / returned / new unique / stop):");
  for (const [k, d] of Object.entries(sweep.perDepartment)) out.push(`    ${k.padEnd(14)} ${String(d.requests).padStart(5)} / ${String(d.returned).padStart(6)} / ${String(d.new).padStart(6)}   ${d.stoppedBy || "-"}`);
  out.push(`  response shape (where the product array was found): ${Object.entries(sweep.shapes).map(([k, v]) => `${k} x${v}`).join(", ") || "(none)"}`);
  if (rawDir) out.push(`  raw responses: ${rawDir}`);
  out.push("  ====================================================");
  return out.join("\n");
}

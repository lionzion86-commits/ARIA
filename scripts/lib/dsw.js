/* ============================================================
   DSW — THE PULL PLAN, THE COST ESTIMATE AND THE INGEST RULES
   (Issue #443, c.6323171170 as amended by c.6323202929).

   Pure functions only: no network, no files. scripts/build-dsw-catalog.mjs
   is the command that uses them, and scripts/test/dsw-store-tests.mjs
   pins them. Kept apart so the rules can be tested without spending a
   cent and without a catalogue existing.

   WHAT DANNY ORDERED, AND WHERE EACH POINT LIVES
     best sellers + ALL sale/clearance first   pullPlan() (phase 1 first)
     shippable-only, no oversize               shippingVerdict()
     real weights / dimensions                 weightOf(), dimensionsOf()
     full specs                                specsOf()
     GTIN/UPC where present                    gtinOf() (checksum-valid only)
     multi-image galleries                     imagesOf()
     sizes AS SCRAPED (variant truth)          sizesOf() — never invented
     Spanish 1-2 sentence descriptions         pdpSentences() keeps the
                                               PDP's own first sentences;
                                               scripts/translate-catalog-
                                               descriptions.mjs (the repo's
                                               description pipeline) makes
                                               them Spanish
     estimated cost BEFORE running             estimatePull()
     stop if materially above the quote        spendCheck()
     per-row USD + sanity band (#432)          ingestRow()

   NOTHING HERE INVENTS A PRODUCT FACT. Every field written comes from
   the scraped row; a field the row does not carry is left out, and the
   site's own estimators (weight) or the translator (Spanish) take it
   from there, each flagged as what it is.
   ============================================================ */
import { quotasFor } from "./catalog-quotas.js";

export const DSW_KEY = "dsw";
export const DSW_LABEL = "DSW";
export const OUT_FILE = "dsw-catalog.json";

/* The ceiling for a `target: "all"` quota (sale, clearance). "All sale"
   is the order; this only stops a runaway listing from becoming a
   runaway bill. Raise it with --sale-max when the estimate allows. */
export const DSW_SALE_MAX = 2500;

/* THE SANITY BAND (#432's lesson: a $1,553 PS5 came in through a
   Marketplace page). DSW's own shelf is branded footwear and bags; a row
   priced outside this band is held for a person, never published and
   never silently dropped. Override per run with --min-usd / --max-usd. */
export const PRICE_BAND_USD = { min: 5, max: 400 };
/* A was-price more than this many times the price is not a markdown, it
   is a parsing error (a size-run total, a bundle price). */
export const MAX_WAS_RATIO = 10;

/* Cost model. The per-run figure is the repo's own (scripts/lib/
   refresh-tiers.js, the top of the observed $0.01-$0.06). The per-result
   figure is the one real detail-mode actor price the repo has on record
   (~$5.70 per 1,000, AutoZone, apify-scrape-start.js) — an assumption,
   not DSW's actor's price, which is unknown until an actor is chosen.
   Both are overridable from the environment, and the estimate prints
   which numbers it used. */
export const DEFAULT_COST_PER_1000_RESULTS_USD = 5.7;
/* "Materially above the quote": more than this fraction over it. */
export const MATERIAL_OVERRUN = 0.25;

/* ---------------- the plan ---------------- */

/**
 * The pull, in the order it runs: phase 1 (clearance, sale, best
 * sellers) before phase 2 (category depth). Each entry carries the
 * maxItems the run asks for.
 */
export function pullPlan({ saleMax = DSW_SALE_MAX, urls = null } = {}) {
  return quotasFor(DSW_KEY)
    .map((q, i) => ({
      ...q,
      maxItems: q.target === "all" ? saleMax : Number(q.target) || 0,
      url: urls && typeof urls[q.category] === "string" ? urls[q.category] : null,
      order: i,
    }))
    .sort((a, b) => (a.phase - b.phase) || (a.order - b.order));
}

/**
 * The actor input for one quota. UNVERIFIED: no Apify actor has been
 * confirmed against dsw.com (see RETAILER_CONFIG.dsw). This is the most
 * common Apify input convention — `startUrls` of {url} objects (the shape
 * rigelbytes/target-scraper confirmed for Target) or a keyword list —
 * and it is the one place to change when the chosen actor's schema
 * names its fields differently.
 */
export function dswActorInput(quota, maxItems) {
  const n = Math.max(1, Number(maxItems) || 1);
  if (quota && quota.url) return { startUrls: [{ url: quota.url }], maxItems: n };
  return { searchQueries: [String((quota && quota.query) || "shoes")], maxItems: n };
}

/* ---------------- the estimate ---------------- */

function num(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && raw !== "" && raw != null ? n : fallback;
}

export function costRatesFromEnv(env = process.env, defaults = {}) {
  return {
    costPerRun: num(env.APIFY_COST_PER_RUN_USD, defaults.costPerRun ?? 0.06),
    costPer1000: num(env.APIFY_COST_PER_1000_RESULTS_USD, defaults.costPer1000 ?? DEFAULT_COST_PER_1000_RESULTS_USD),
  };
}

const cents = (x) => Math.round(x * 100) / 100;

/** What one quota is projected to cost at its full maxItems. */
export function quotaCostUsd(quota, rates) {
  return cents(rates.costPerRun + (quota.maxItems * rates.costPer1000) / 1000);
}

/**
 * The quote: { runs, items, estimateUsd, quoteUsd, stopAboveUsd, lines }.
 * `quoteUsd` is the figure posted on the issue (--quote), or the
 * estimate itself; the pull stops when it projects above stopAboveUsd.
 */
export function estimatePull(plan, rates, { quoteUsd = null } = {}) {
  const lines = plan.map((q) => ({
    category: q.category, phase: q.phase, maxItems: q.maxItems, usd: quotaCostUsd(q, rates),
  }));
  const estimateUsd = cents(lines.reduce((s, l) => s + l.usd, 0));
  const quote = Number(quoteUsd) > 0 ? cents(Number(quoteUsd)) : estimateUsd;
  return {
    runs: plan.length,
    items: plan.reduce((s, q) => s + q.maxItems, 0),
    estimateUsd,
    quoteUsd: quote,
    stopAboveUsd: cents(quote * (1 + MATERIAL_OVERRUN)),
    rates,
    lines,
  };
}

/** The block printed before anything runs. Plain text, no colour codes. */
export function formatEstimate(est) {
  const out = [];
  out.push("");
  out.push("  ====================================================");
  out.push("  ESTIMATED COST — DSW catalogue pull (Apify usage only)");
  out.push("  ====================================================");
  for (const l of est.lines) {
    out.push(`    phase ${l.phase}  ${l.category.padEnd(12)} up to ${String(l.maxItems).padStart(5)} items  ~$${l.usd.toFixed(2)}`);
  }
  out.push(`  runs: ${est.runs}   items requested (max): ${est.items.toLocaleString("en-US")}`);
  out.push(`  rates: $${est.rates.costPerRun.toFixed(2)} per run (APIFY_COST_PER_RUN_USD), $${est.rates.costPer1000.toFixed(2)} per 1,000 results (APIFY_COST_PER_1000_RESULTS_USD)`);
  out.push(`  ESTIMATED COST: ~$${est.estimateUsd.toFixed(2)}`);
  out.push(`  quote: $${est.quoteUsd.toFixed(2)}   the pull stops if it projects above $${est.stopAboveUsd.toFixed(2)} (+${Math.round(MATERIAL_OVERRUN * 100)}%)`);
  out.push("  ====================================================");
  return out.join("\n");
}

/**
 * Mid-run check, after each completed run. `done` is [{ quota, usd }]
 * (usd: Apify's own usageTotalUsd for the run when it reported one, else
 * the per-quota estimate). The remaining quotas are projected at the
 * observed ratio of real to estimated spend (never below 1), so a pull
 * that is running hot is caught after its first expensive run, not
 * after its last.
 */
export function spendCheck(done, remaining, est) {
  const rates = est.rates;
  const spent = cents(done.reduce((s, d) => s + (Number(d.usd) || 0), 0));
  const estimatedDone = done.reduce((s, d) => s + quotaCostUsd(d.quota, rates), 0);
  const ratio = estimatedDone > 0 ? Math.max(1, spent / estimatedDone) : 1;
  const projected = cents(spent + remaining.reduce((s, q) => s + quotaCostUsd(q, rates) * ratio, 0));
  const stop = projected > est.stopAboveUsd;
  return {
    spentUsd: spent,
    projectedUsd: projected,
    ratio: Math.round(ratio * 100) / 100,
    stop,
    reason: stop
      ? `PROYECCIÓN SOBRE LA COTIZACIÓN: $${projected.toFixed(2)} > $${est.stopAboveUsd.toFixed(2)} (cotización $${est.quoteUsd.toFixed(2)} +${Math.round(MATERIAL_OVERRUN * 100)}%). Se detiene el pull y se reporta en el issue antes de seguir.`
      : null,
  };
}

/* ---------------- ingest: reading a scraped row ---------------- */

const first = (...vals) => {
  for (const v of vals) if (v !== undefined && v !== null && v !== "") return v;
  return null;
};

function stripHtml(s) {
  return String(s || "")
    .replace(/<\s*br\s*\/?>/gi, " ")
    .replace(/<\/(p|li|div)>/gi, ". ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .replace(/(\.\s*){2,}/g, ". ")
    .trim();
}

/** A money value from a number or a price string ("$49.99", "49.99 USD"). */
export function moneyOf(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v === "object") return moneyOf(first(v.value, v.amount, v.price));
  const m = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/.exec(String(v));
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, "") + (m[2] ? "." + m[2] : ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function offersOf(raw) {
  const o = raw && raw.offers;
  if (Array.isArray(o)) return o[0] || null;
  return o && typeof o === "object" ? o : null;
}

/**
 * The row's currency, as the row states it — or null when it does not.
 * A bare "$" is NOT proof of US dollars (CA$, MX$, AU$ all print "$"),
 * so only an ISO code or an unambiguous "US$"/"USD" counts.
 */
export function currencyOf(raw) {
  const offers = offersOf(raw) || {};
  const stated = first(raw.currency, raw.priceCurrency, raw.currencyCode, offers.priceCurrency,
    raw.price && typeof raw.price === "object" ? raw.price.currency : null);
  if (stated) return String(stated).trim().toUpperCase();
  const text = [raw.price, raw.salePrice, raw.currentPrice, raw.priceText].filter((x) => typeof x === "string").join(" ");
  if (/\bUSD\b|US\$/.test(text)) return "USD";
  const other = /\b(CAD|MXN|EUR|GBP|AUD|PEN)\b|CA\$|MX\$|AU\$|€|£|S\/\s?\d/.exec(text);
  if (other) return other[1] || other[0].replace(/\$|\s|\d/g, "") || "OTHER";
  return null;
}

export function priceOf(raw) {
  const offers = offersOf(raw) || {};
  return moneyOf(first(raw.salePrice, raw.currentPrice, raw.finalPrice, raw.price, offers.price, offers.lowPrice));
}

export function originalPriceOf(raw) {
  return moneyOf(first(raw.originalPrice, raw.regularPrice, raw.listPrice, raw.wasPrice, raw.was_price,
    raw.compareAtPrice, raw.msrp));
}

function urlOf(u) {
  if (!u) return null;
  const s = typeof u === "string" ? u : first(u.url, u.src, u.href, u.contentUrl);
  if (!s) return null;
  const t = String(s).trim().replace(/^\/\//, "https://");
  return /^https:\/\//i.test(t) ? t : null;
}

/** Every photo the row carries, https only, de-duplicated, capped. */
export function imagesOf(raw, cap = 8) {
  const pool = [];
  for (const k of ["images", "imageUrls", "gallery", "image", "imageUrl", "thumbnail", "mainImage"]) {
    const v = raw[k];
    if (Array.isArray(v)) pool.push(...v);
    else if (v) pool.push(v);
  }
  const out = [];
  for (const u of pool.map(urlOf)) if (u && !out.includes(u)) out.push(u);
  return out.slice(0, cap);
}

/** The spec table, as [{ name, value }] strings, exactly as published. */
export function specsOf(raw) {
  const src = first(raw.specifications, raw.specs, raw.additionalProperty, raw.attributes, raw.details);
  const out = [];
  if (Array.isArray(src)) {
    for (const s of src) {
      if (!s || typeof s !== "object") continue;
      const name = first(s.name, s.key, s.label, s.title);
      const value = first(s.value, s.text, s.values && [].concat(s.values).join(", "));
      if (name != null && value != null) out.push({ name: String(name).trim(), value: String(value).trim() });
    }
  } else if (src && typeof src === "object") {
    for (const [k, v] of Object.entries(src)) {
      if (v == null || typeof v === "object") continue;
      out.push({ name: String(k).trim(), value: String(v).trim() });
    }
  }
  return out.filter((s) => s.name && s.value);
}

/** GS1 check digit: true for a valid GTIN-8/12/13/14. */
export function validGtin(code) {
  const d = String(code || "").replace(/\s|-/g, "");
  if (!/^\d+$/.test(d) || ![8, 12, 13, 14].includes(d.length)) return false;
  const digits = d.split("").map(Number);
  const check = digits.pop();
  let sum = 0;
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i] * w;
  return (10 - (sum % 10)) % 10 === check;
}

/** The product's GTIN/UPC when the row publishes a valid one, else null. */
export function gtinOf(raw, specs = specsOf(raw)) {
  const cands = [raw.gtin, raw.gtin14, raw.gtin13, raw.gtin12, raw.gtin8, raw.upc, raw.ean, raw.barcode];
  for (const s of specs) if (/^(upc|gtin|ean|barcode)\b/i.test(s.name)) cands.push(s.value);
  for (const c of cands) {
    if (c == null) continue;
    const code = String(c).replace(/\s|-/g, "");
    if (validGtin(code)) return code;
  }
  return null;
}

/**
 * THE SIZE RUN, AS SCRAPED (variant-truth rule). The row's own size
 * list, in its own order and its own words ("8.5", "8.5 W", "Big Kid
 * 4"). When the row lists variants with stock, the in-stock ones; when
 * it lists sizes with no stock signal, the list as given. Never
 * generated, never padded, never normalised into a run the PDP did not
 * show. An empty array means the row published no sizes — the size gate
 * (#411) then decides from the record, as it does for every store.
 */
export function sizesOf(raw) {
  const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  const uniq = (arr) => { const o = []; for (const s of arr) if (s && !o.includes(s)) o.push(s); return o; };
  if (Array.isArray(raw.variants) && raw.variants.length) {
    const rows = raw.variants.filter((v) => v && typeof v === "object" && first(v.size, v.sizeLabel, v.name) != null);
    if (rows.length) {
      const hasStock = rows.some((v) => typeof v.inStock === "boolean" || typeof v.available === "boolean" || v.availability != null);
      const inStock = (v) => {
        if (typeof v.inStock === "boolean") return v.inStock;
        if (typeof v.available === "boolean") return v.available;
        if (v.availability != null) return !/out\s*of\s*stock|sold\s*out|unavailable/i.test(String(v.availability));
        return true;
      };
      return { sizes: uniq(rows.filter((v) => !hasStock || inStock(v)).map((v) => clean(first(v.size, v.sizeLabel, v.name)))), source: hasStock ? "variants-in-stock" : "variants" };
    }
  }
  const list = first(raw.availableSizes, raw.sizes, raw.sizeOptions);
  if (Array.isArray(list)) {
    const vals = list.map((s) => (s && typeof s === "object" ? first(s.size, s.label, s.name, s.value) : s)).map(clean);
    return { sizes: uniq(vals), source: "listed" };
  }
  return { sizes: [], source: "none" };
}

/** The published weight, through the checkout's own reader. */
export function weightOf(raw, specs, specWeightKg) {
  if (typeof specWeightKg !== "function") return null;
  const hit = specWeightKg({ ...raw, specifications: specs, weightEstimated: false });
  return hit && hit.kg > 0 ? hit : null;
}

/** Published dimensions, verbatim, when the spec table carries them. */
export function dimensionsOf(raw, specs) {
  const direct = first(raw.dimensions, raw.packageDimensions, raw.boxDimensions);
  if (typeof direct === "string" && /\d/.test(direct)) return direct.trim();
  for (const s of specs) if (/dimension|measurements/i.test(s.name) && /\d/.test(s.value)) return s.value;
  return null;
}

/**
 * The PDP's own first one or two sentences — extracted, never written.
 * Capped at 320 characters on a sentence boundary when one exists. The
 * Spanish comes from translate-catalog-descriptions.mjs afterwards; a
 * catalogue with English left in it fails dsw-store-tests.
 */
export function pdpSentences(text, max = 2, cap = 320) {
  const t = stripHtml(text);
  if (!t) return null;
  const parts = t.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [t];
  let out = "";
  for (const p of parts.slice(0, max)) {
    const next = (out + " " + p.trim()).trim();
    if (out && next.length > cap) break;
    out = next;
  }
  if (out.length > cap) out = out.slice(0, cap).replace(/\s+\S*$/, "") + "…";
  return out || null;
}

/** The breadcrumb as a list, from whichever shape the row uses. */
export function breadcrumbOf(raw) {
  const b = first(raw.breadcrumbs, raw.breadcrumb, raw.categoryPath, raw.category, raw.categories);
  if (Array.isArray(b)) return b.map((x) => String(x && typeof x === "object" ? first(x.name, x.label, x.title) || "" : x).trim()).filter(Boolean);
  if (typeof b === "string") return b.split(/\s*(?:>|\/|\|)\s*/).map((s) => s.trim()).filter(Boolean);
  return [];
}

/** The scraped kind of product: the breadcrumb leaf, or the row's own type. */
export function typeOf(raw, crumbs = breadcrumbOf(raw)) {
  const own = first(raw.productType, raw.type);
  if (own && typeof own === "string") return own.trim();
  const leaf = crumbs.length ? crumbs[crumbs.length - 1] : null;
  return leaf && !/^(home|dsw)$/i.test(leaf) ? leaf : null;
}

const BAG_RX = /\b(handbags?|bags?|purses?|totes?|crossbody|backpacks?|wallets?|clutch(es)?|satchels?)\b/i;
/**
 * Which catalogue bucket the row files under. The bucket names are the
 * site's existing ones (women / men / kids / purses — BUCKET_SPEC in the
 * app bundle and scripts/lib/department-map.js) so the shoes reach
 * Zapatos and the gendered aisles with no new taxonomy; a shoe with no
 * gender signal files under `footwear` (the Crocs precedent).
 */
export function bucketOf(raw, quota, crumbs = breadcrumbOf(raw)) {
  const hay = [crumbs.join(" "), raw.name || raw.title || "", raw.gender || ""].join(" ");
  if (quota && quota.bucket) return quota.bucket;
  if (BAG_RX.test(crumbs.join(" ")) || (BAG_RX.test(raw.name || raw.title || "") && !/\bshoes?\b/i.test(hay))) return "purses";
  if (/\b(kids?|girls?|boys?|toddlers?|baby|little kid|big kid|youth)\b/i.test(hay)) return "kids";
  if (/\b(women'?s?|womens|ladies)\b/i.test(hay)) return "women";
  if (/\b(men'?s?|mens)\b/i.test(hay)) return "men";
  if (quota && quota.gender) return quota.gender;
  return "footwear";
}

/**
 * SHIPPABLE ONLY. A row is out when the PDP says it does not ship to a
 * home address, when it is out of stock, or when it is oversize/freight;
 * then the site's own isShippableItem (lifted from the app bundle by the
 * caller) has the last word, exactly as for every other store.
 */
export function shippingVerdict(raw, isShippableItem) {
  const offers = offersOf(raw) || {};
  if (raw.shipToHome === false || raw.shippable === false || raw.isShippable === false) return "not-shippable";
  const avail = String(first(raw.availability, raw.stockStatus, offers.availability) || "");
  if (raw.inStock === false || raw.available === false || /out\s*of\s*stock|sold\s*out|discontinued/i.test(avail)) return "out-of-stock";
  const msg = [raw.shippingMessage, raw.fulfillment, raw.shipping, avail]
    .map((x) => (x && typeof x === "object" ? JSON.stringify(x) : String(x || ""))).join(" ");
  if (/in[-\s]?store\s+only|store\s+pick-?up\s+only|not\s+available\s+for\s+(home\s+)?shipping|ship\s+to\s+store\s+only/i.test(msg)) return "store-only";
  if (/\b(oversized?|freight|truck\s+delivery|white\s+glove)\b/i.test(msg)) return "oversize";
  /* The site's rule reads the published weight, so it runs on the
     ingested item (ingestRow) when the caller passes no isShippableItem
     here. */
  if (typeof isShippableItem === "function" && !isShippableItem(raw)) return "site-unshippable";
  return null;
}

function idOf(raw) {
  const id = first(raw.productId, raw.sku, raw.id, raw.styleId, raw.itemId);
  if (id != null) return String(id);
  const u = first(raw.url, raw.productUrl, raw.canonicalUrl);
  return u ? String(u).split("?")[0] : null;
}

/**
 * One scraped row in, one verdict out:
 *   { item }                      publishable
 *   { quarantine: reason, row }   held for a person (currency, band)
 *   { drop: reason }              not a product we list (unshippable,
 *                                 unnamed, no price, no photo)
 */
export function ingestRow(raw, quota, ctx = {}) {
  if (!raw || typeof raw !== "object") return { drop: "not-an-object" };
  const name = String(first(raw.name, raw.title, raw.productName) || "").replace(/\s+/g, " ").trim();
  if (!name) return { drop: "no-name" };
  const price = priceOf(raw);
  if (!(price > 0)) return { drop: "no-price" };

  /* PER-ROW CURRENCY. USD or held; never converted, never assumed —
     unless the operator passed --assume-usd for an actor whose own docs
     state US dollars, in which case every such row says so. */
  const currency = currencyOf(raw);
  let currencyAssumed = false;
  if (currency && currency !== "USD") return { quarantine: `currency-${currency}`, row: raw };
  if (!currency) {
    if (!ctx.assumeUsd) return { quarantine: "currency-unstated", row: raw };
    currencyAssumed = true;
  }

  const band = ctx.band || PRICE_BAND_USD;
  if (price < band.min || price > band.max) return { quarantine: `price-outside-band-$${band.min}-$${band.max}`, row: raw };
  let was = originalPriceOf(raw);
  if (was != null && was > price * MAX_WAS_RATIO) return { quarantine: "was-price-implausible", row: raw };
  if (!(was > price)) was = null;

  const ship = shippingVerdict(raw, null);
  if (ship) return { drop: ship };

  const images = imagesOf(raw);
  if (!images.length) return { drop: "no-image" };

  const specs = specsOf(raw);
  const crumbs = breadcrumbOf(raw);
  const { sizes, source: sizeSource } = sizesOf(raw);
  const weight = weightOf(raw, specs, ctx.specWeightKg);

  const brandRaw = first(raw.brand && typeof raw.brand === "object" ? raw.brand.name : raw.brand, raw.brandName, raw.manufacturer);
  const item = {
    name,
    retailer: DSW_KEY,
    brand: brandRaw ? String(brandRaw).trim() : undefined,
    price,
    currency: "USD",
    ...(currencyAssumed ? { currencyAssumed: true } : {}),
    onSale: was != null,
    ...(was != null ? { originalPrice: was } : {}),
    image: images[0],
    images,
    type: typeOf(raw, crumbs) || undefined,
    ...(crumbs.length ? { category: crumbs.join(" > ") } : {}),
    availableSizes: sizes,
    sizeSource,
    ...(Array.isArray(raw.availableWidths) ? { availableWidths: raw.availableWidths.map(String) } : {}),
    ...(first(raw.color, raw.colorName) ? { color: String(first(raw.color, raw.colorName)) } : {}),
    ...(weight ? { weightKg: weight.kg, weightEstimated: false, weightSource: weight.from } : {}),
    ...(dimensionsOf(raw, specs) ? { dimensions: dimensionsOf(raw, specs) } : {}),
    ...(specs.length ? { specifications: specs } : {}),
    ...(gtinOf(raw, specs) ? { gtin: gtinOf(raw, specs) } : {}),
    ...(first(raw.sku, raw.productId) != null ? { sku: String(first(raw.sku, raw.productId)) } : {}),
  };
  const desc = pdpSentences(first(raw.description, raw.productDescription, raw.longDescription, raw.summary));
  if (desc) { item.description = desc; item.descriptionSource = "dsw-pdp"; }
  const rating = Number(first(raw.rating, raw.averageRating, raw.aggregateRating && raw.aggregateRating.ratingValue));
  if (rating > 0 && rating <= 5) item.rating = Math.round(rating * 10) / 10;
  const reviews = Number(first(raw.reviewCount, raw.reviewsCount, raw.aggregateRating && raw.aggregateRating.reviewCount));
  if (reviews > 0) item.reviewCount = Math.round(reviews);
  const url = first(raw.url, raw.productUrl, raw.canonicalUrl);
  if (url) item.url = String(url);
  for (const k of Object.keys(item)) if (item[k] === undefined) delete item[k];
  /* The site's own shippable rule (no bulky freight, nothing over the
     parcel weight), over the item as every page will see it. */
  if (typeof ctx.isShippableItem === "function" && !ctx.isShippableItem(item)) return { drop: "site-unshippable" };
  return { item, id: idOf(raw), bucket: bucketOf(raw, quota, crumbs) };
}

export const BUCKET_LABELS = {
  women: "Zapatos de mujer",
  men: "Zapatos de hombre",
  kids: "Zapatos de niños",
  footwear: "Más zapatos",
  purses: "Carteras y bolsos",
};

/**
 * The whole pull in, the catalogue envelope out, plus the report.
 * `pulled` is [{ quota, items: [raw rows] }] in pull order: a product
 * seen twice keeps its first (sale/clearance) copy, and its place in the
 * best-sellers listing becomes `bestSellerRank`.
 */
export function ingestPull(pulled, ctx = {}) {
  const departments = {};
  const seen = new Map();
  const quarantined = [];
  const stats = { rows: 0, published: 0, quarantined: {}, dropped: {}, perBucket: {}, onSale: 0, realWeight: 0, gtin: 0, withSizes: 0, gallery: 0, described: 0, currencyAssumed: 0 };
  for (const { quota, items } of pulled) {
    (items || []).forEach((raw, idx) => {
      stats.rows++;
      const v = ingestRow(raw, quota, ctx);
      if (v.quarantine) {
        stats.quarantined[v.quarantine] = (stats.quarantined[v.quarantine] || 0) + 1;
        quarantined.push({ reason: v.quarantine, quota: quota.category, row: v.row });
        return;
      }
      if (v.drop) { stats.dropped[v.drop] = (stats.dropped[v.drop] || 0) + 1; return; }
      const key = v.id || (v.item.brand || "") + "::" + v.item.name;
      if (seen.has(key)) {
        const prev = seen.get(key);
        if (quota.category === "bestsellers" && !prev.bestSellerRank) prev.bestSellerRank = idx + 1;
        stats.dropped.duplicate = (stats.dropped.duplicate || 0) + 1;
        return;
      }
      if (quota.category === "bestsellers") v.item.bestSellerRank = idx + 1;
      seen.set(key, v.item);
      (departments[v.bucket] = departments[v.bucket] || { label: BUCKET_LABELS[v.bucket] || v.bucket, items: [] }).items.push(v.item);
    });
  }
  for (const [b, d] of Object.entries(departments)) {
    stats.perBucket[b] = d.items.length;
    for (const it of d.items) {
      stats.published++;
      if (it.onSale) stats.onSale++;
      if (it.weightEstimated === false) stats.realWeight++;
      if (it.gtin) stats.gtin++;
      if (it.availableSizes.length) stats.withSizes++;
      if (it.images.length > 1) stats.gallery++;
      if (it.description) stats.described++;
      if (it.currencyAssumed) stats.currencyAssumed++;
    }
  }
  return {
    catalog: {
      generatedAt: ctx.generatedAt || new Date().toISOString(),
      source: "dsw.com (Apify pull) -- ingested by scripts/build-dsw-catalog.mjs",
      declaredProductCount: stats.published,
      retailers: { [DSW_KEY]: { label: DSW_LABEL, departments } },
    },
    quarantined,
    stats,
  };
}

/** The committed zero state: a valid envelope with no products. */
export function emptyCatalog() {
  return {
    generatedAt: null,
    source: "dsw.com -- catalogue pull pending (Issue #443); scripts/build-dsw-catalog.mjs writes this file",
    declaredProductCount: 0,
    retailers: { [DSW_KEY]: { label: DSW_LABEL, departments: {} } },
  };
}

/** Products in a catalogue envelope (any shape the site reads). */
export function productCount(catalog) {
  const r = catalog && catalog.retailers && catalog.retailers[DSW_KEY];
  if (!r || !r.departments) return 0;
  return Object.values(r.departments).reduce((n, d) => n + ((d && Array.isArray(d.items)) ? d.items.length : 0), 0);
}

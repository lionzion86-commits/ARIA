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

/* The ceiling for a `target: "all"` quota (clearance). "All sale" is the
   order: DSW's clearance listing showed 5,812 results live (#443,
   2026-10-22), so the ceiling sits just above it. It only stops a
   runaway listing from becoming a runaway bill. --sale-max moves it. */
export const DSW_SALE_MAX = 6000;

/* THE WAVE CAP. Danny pre-approved at most this much Apify spend for
   the whole DSW wave (listing pass + optional GTIN enrichment), #443.
   The stop line is min(quote x 1.25, what is left of the cap); a pull
   whose estimate is above what is left is refused before it starts.
   --max-spend-usd moves it, --spent-usd says what was already spent. */
export const WAVE_CAP_USD = 200;

/* VERIFIED ACTOR (Lucifer, #443, 2026-10-22). */
export const DSW_ACTOR = "apify/e-commerce-scraping-tool";

/* THE GALLERY: every image the source offers. This number is a guard
   against a runaway field, not a selection; no real PDP comes near it.
   (What a page SHOWS is the storefront's business, unchanged here.) */
export const GALLERY_CAP = 40;

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
      url: urls && typeof urls[q.category] === "string" ? urls[q.category] : (q.url || null),
      order: i,
    }))
    .sort((a, b) => (a.phase - b.phase) || (a.order - b.order));
}

/**
 * The actor input for one quota, in apify/e-commerce-scraping-tool's
 * shape as verified by Lucifer (#443, 2026-10-22):
 *   { listingUrls: [{ url }], maxProductResults }
 * A quota with no listing URL cannot run on this actor (it takes URLs,
 * not keywords), so it throws instead of guessing a search page.
 */
export function dswActorInput(quota, maxItems) {
  const n = Math.max(1, Number(maxItems) || 1);
  if (quota && quota.url) return { listingUrls: [{ url: String(quota.url) }], maxProductResults: n };
  throw new Error(`no listing URL for quota "${quota && quota.category}": apify/e-commerce-scraping-tool takes listingUrls, not keywords`);
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
export function estimatePull(plan, rates, { quoteUsd = null, capUsd = null, spentBeforeUsd = 0 } = {}) {
  const lines = plan.map((q) => ({
    category: q.category, phase: q.phase, maxItems: q.maxItems, usd: quotaCostUsd(q, rates),
    ...(q.url ? { url: q.url } : {}), ...(q.listed ? { listed: q.listed } : {}),
  }));
  const estimateUsd = cents(lines.reduce((s, l) => s + l.usd, 0));
  const quote = Number(quoteUsd) > 0 ? cents(Number(quoteUsd)) : estimateUsd;
  const overrunLine = cents(quote * (1 + MATERIAL_OVERRUN));
  const cap = Number(capUsd) > 0 ? cents(Number(capUsd)) : null;
  const spentBefore = cents(Math.max(0, Number(spentBeforeUsd) || 0));
  const capRemainingUsd = cap != null ? cents(Math.max(0, cap - spentBefore)) : null;
  return {
    runs: plan.length,
    items: plan.reduce((s, q) => s + q.maxItems, 0),
    estimateUsd,
    quoteUsd: quote,
    /* The stop line: the quote +25%, or what is left of the wave cap,
       whichever is lower. */
    stopAboveUsd: capRemainingUsd != null ? Math.min(overrunLine, capRemainingUsd) : overrunLine,
    overrunLineUsd: overrunLine,
    capUsd: cap,
    spentBeforeUsd: spentBefore,
    capRemainingUsd,
    /* An estimate above what is left of the cap is refused before any run. */
    overCap: capRemainingUsd != null && estimateUsd > capRemainingUsd,
    rates,
    lines,
  };
}

/**
 * The hard cap, checked BEFORE each run starts: would starting this run
 * (at its estimate x the observed overrun ratio) take the wave past what
 * is left of the cap? Returns { ok, spentUsd, nextUsd, capRemainingUsd,
 * chargeLimitUsd } — chargeLimitUsd is what Apify may charge this one
 * run (passed to it as maxTotalChargeUsd, Apify's own per-run limit).
 */
export function capGuard(done, quota, est) {
  if (est.capRemainingUsd == null) return { ok: true, chargeLimitUsd: null };
  const rates = est.rates;
  const spent = cents(done.reduce((s, d) => s + (Number(d.usd) || 0), 0));
  const estimatedDone = done.reduce((s, d) => s + quotaCostUsd(d.quota, rates), 0);
  const ratio = estimatedDone > 0 ? Math.max(1, spent / estimatedDone) : 1;
  const nextUsd = cents(quotaCostUsd(quota, rates) * ratio);
  const left = cents(est.capRemainingUsd - spent);
  return {
    ok: spent + nextUsd <= est.capRemainingUsd,
    spentUsd: spent,
    nextUsd,
    capRemainingUsd: left,
    chargeLimitUsd: Math.max(0, left),
    reason: spent + nextUsd > est.capRemainingUsd
      ? `TOPE DE GASTO: $${spent.toFixed(2)} gastado + ~$${nextUsd.toFixed(2)} de la siguiente corrida > $${est.capRemainingUsd.toFixed(2)} disponibles del tope de $${(est.capUsd || 0).toFixed(2)}. No se inicia la corrida.`
      : null,
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
    out.push(`    phase ${l.phase}  ${l.category.padEnd(12)} up to ${String(l.maxItems).padStart(5)} items  ~$${l.usd.toFixed(2)}${l.listed ? `   (listing showed ${l.listed.toLocaleString("en-US")})` : ""}${l.url ? `   ${l.url}` : ""}`);
  }
  out.push(`  runs: ${est.runs}   items requested (max): ${est.items.toLocaleString("en-US")}`);
  out.push(`  rates: $${est.rates.costPerRun.toFixed(2)} per run (APIFY_COST_PER_RUN_USD), $${est.rates.costPer1000.toFixed(2)} per 1,000 results (APIFY_COST_PER_1000_RESULTS_USD)`);
  out.push("  inputs: items are per-run caps (maxProductResults), not counts; a product in two listings is paid twice, kept once.");
  out.push(`  ESTIMATED COST: ~$${est.estimateUsd.toFixed(2)}`);
  if (est.capUsd != null) {
    out.push(`  wave cap: $${est.capUsd.toFixed(2)} (--max-spend-usd), already spent $${est.spentBeforeUsd.toFixed(2)} (--spent-usd), left $${est.capRemainingUsd.toFixed(2)}`);
  }
  out.push(`  quote: $${est.quoteUsd.toFixed(2)}   the pull stops if it projects above $${est.stopAboveUsd.toFixed(2)} (min of quote +${Math.round(MATERIAL_OVERRUN * 100)}% = $${est.overrunLineUsd.toFixed(2)}${est.capRemainingUsd != null ? `, cap left $${est.capRemainingUsd.toFixed(2)}` : ""})`);
  if (est.overCap) out.push(`  OVER THE CAP: the estimate is above the $${est.capRemainingUsd.toFixed(2)} left. --confirm-spend will refuse; lower the caps (--only, --sale-max) first.`);
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
      ? `PROYECCIÓN SOBRE LA COTIZACIÓN: $${projected.toFixed(2)} > $${est.stopAboveUsd.toFixed(2)} (cotización $${est.quoteUsd.toFixed(2)} +${Math.round(MATERIAL_OVERRUN * 100)}%${est.capRemainingUsd != null ? `, o el tope restante de $${est.capRemainingUsd.toFixed(2)}, lo que sea menor` : ""}). Se detiene el pull y se reporta en el issue antes de seguir.`
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

/* ---------------- the e-commerce tool's row, read tolerantly ----------------
   apify/e-commerce-scraping-tool is the verified DSW actor (#443,
   2026-10-22). Its OUTPUT field names are not recorded anywhere in this
   repo (no earlier run of it here), so normalizeRow() reads the shapes a
   generic product extractor publishes — schema.org Product / JSON-LD and
   the common flat spellings — and folds them into the fields ingestRow
   already reads. ASSUMPTIONS (each one only FILLS a field the row left
   empty; nothing is invented, and a field none of these names carries
   stays empty and shows up as a hole in the INGEST REPORT):
     name        name | title | productName
     price       offers.price | offers.lowPrice (AggregateOffer) | price
                 (number, "$49.99", or {value|amount, currency})
     currency    offers.priceCurrency | currency | priceCurrency
     availability offers.availability ("https://schema.org/OutOfStock"
                 and friends, read as words) | availability
     images      image | images | imageUrls | additionalImages | gallery
                 | media | photos (strings or ImageObject {url|contentUrl})
     brand       brand.name | brand
     GTIN        gtin | gtin8/12/13/14 | upc | ean | offers[].gtin* | spec
                 rows named UPC/GTIN/EAN (checksum-valid only)
     sizes       variants[].size | hasVariant[] (schema.org ProductGroup)
                 | offers[] with a size | sizes | availableSizes; a
                 variant's size may sit in .size, .attributes.size,
                 .options.size or selectedOptions[{name:"Size"}]
     weight      weight ({value, unitText|unitCode} or "1.2 lb")
     dimensions  dimensions | width/height/depth ({value, unitText})
     materials   material(s) | additionalProperty(ies) | specifications
     description description | descriptionText | descriptionHtml
     url         url | canonicalUrl | productUrl
     breadcrumb  breadcrumbs | breadcrumb (incl. BreadcrumbList) | category
   ------------------------------------------------------------------ */
const SCHEMA_WORDS = (s) => String(s == null ? "" : s)
  .replace(/^https?:\/\/schema\.org\//i, "")
  .replace(/([a-z])([A-Z])/g, "$1 $2");

const UNIT_WORD = { LBR: "lb", KGM: "kg", GRM: "g", ONZ: "oz", INH: "in", CMT: "cm", MMT: "mm" };
function measureText(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "object") {
    const val = first(v.value, v.amount);
    if (val == null) return null;
    const unit = first(v.unitText, v.unit, UNIT_WORD[String(v.unitCode || "").toUpperCase()], v.unitCode);
    return `${val}${unit ? " " + unit : ""}`;
  }
  return null;
}

const GTIN_KEYS = ["gtin", "gtin14", "gtin13", "gtin12", "gtin8", "upc", "ean", "barcode"];
const gtinFrom = (o) => (o && typeof o === "object" ? first(...GTIN_KEYS.map((k) => o[k])) : null);

/** A variant's size, wherever the row keeps it. */
function variantSize(v) {
  if (!v || typeof v !== "object") return null;
  const own = first(v.size, v.sizeLabel);
  if (own != null) return own;
  for (const bag of [v.attributes, v.options]) {
    if (bag && typeof bag === "object" && !Array.isArray(bag)) {
      for (const [k, val] of Object.entries(bag)) if (/^size$/i.test(k) && val != null && typeof val !== "object") return val;
    }
  }
  for (const list of [v.selectedOptions, v.additionalProperty, Array.isArray(v.attributes) ? v.attributes : null, Array.isArray(v.options) ? v.options : null]) {
    if (!Array.isArray(list)) continue;
    const hit = list.find((x) => x && /^size$/i.test(String(first(x.name, x.key, x.label) || "")));
    if (hit && first(hit.value, hit.text) != null) return first(hit.value, hit.text);
  }
  return null;
}

function variantAvailability(v) {
  if (typeof v.inStock === "boolean" || typeof v.available === "boolean") return {};
  const o = Array.isArray(v.offers) ? v.offers[0] : v.offers;
  const a = first(v.availability, o && o.availability);
  return a != null ? { availability: SCHEMA_WORDS(a) } : {};
}

/**
 * The verified actor's row (or any schema.org-style row) folded into
 * the fields ingestRow reads. Returns a new object; never removes or
 * overwrites a field the row already filled.
 */
export function normalizeRow(raw) {
  if (!raw || typeof raw !== "object") return raw;
  const r = { ...raw };
  const offers = Array.isArray(r.offers) ? r.offers : (r.offers && typeof r.offers === "object" ? [r.offers] : []);
  const inner = offers.flatMap((o) => (o && Array.isArray(o.offers) ? o.offers : [o])).filter((o) => o && typeof o === "object");

  /* Availability, as words ("Out Of Stock"), product-level first. */
  if (r.availability == null) {
    const own = offers[0] && offers[0].availability;
    if (own != null) r.availability = SCHEMA_WORDS(own);
    else if (inner.length && inner.every((o) => o.availability != null)) {
      const words = inner.map((o) => SCHEMA_WORDS(o.availability));
      r.availability = words.some((w) => !/out\s*of\s*stock|sold\s*out|discontinued/i.test(w)) ? "In Stock" : words[0];
    }
  } else r.availability = SCHEMA_WORDS(r.availability);

  if (r.name == null && r.title == null && r.productName == null && typeof r.productTitle === "string") r.name = r.productTitle;
  if (r.description == null) r.description = first(r.descriptionText, r.descriptionHtml, r.productDescription, r.longDescription) || undefined;
  if (r.url == null) r.url = first(r.canonicalUrl, r.productUrl) || undefined;

  /* GTIN: the product's own, else an offer's when there is one offer. */
  if (gtinFrom(r) == null && inner.length === 1 && gtinFrom(inner[0]) != null) r.gtin = gtinFrom(inner[0]);

  /* Variants: schema.org hasVariant, or per-size offers. */
  if (!Array.isArray(r.variants) || !r.variants.length) {
    const src = Array.isArray(r.hasVariant) && r.hasVariant.length ? r.hasVariant
      : inner.length > 1 && inner.some((o) => variantSize(o) != null || variantSize(o.itemOffered) != null) ? inner.map((o) => ({ ...(o.itemOffered || {}), ...o })) : null;
    if (src) r.variants = src.filter((v) => v && typeof v === "object");
  }
  if (Array.isArray(r.variants)) {
    r.variants = r.variants.map((v) => {
      if (!v || typeof v !== "object") return v;
      const size = variantSize(v);
      const g = gtinFrom(v) != null ? gtinFrom(v) : gtinFrom(Array.isArray(v.offers) ? v.offers[0] : v.offers);
      return { ...v, ...(size != null && v.size == null ? { size } : {}), ...(g != null && v.gtin == null ? { gtin: g } : {}), ...variantAvailability(v) };
    });
  }

  /* Weight and dimensions, as text the checkout's reader parses. */
  for (const k of ["weight", "shippingWeight", "itemWeight"]) {
    if (r[k] && typeof r[k] === "object") { const w = measureText(r[k]); if (w) r[k] = w; else delete r[k]; }
  }
  if (!r.dimensions) {
    const parts = [["width", r.width], ["height", r.height], ["depth", r.depth]].map(([k, v]) => [k, measureText(v)]).filter(([, v]) => v && /\d/.test(v));
    if (parts.length) r.dimensions = parts.map(([k, v]) => `${k} ${v}`).join(" x ");
  }
  if (r.breadcrumbs == null && r.breadcrumb && typeof r.breadcrumb === "object" && Array.isArray(r.breadcrumb.itemListElement)) {
    r.breadcrumbs = r.breadcrumb.itemListElement.map((x) => (x && typeof x === "object" ? first(x.name, x.item && x.item.name) : x)).filter(Boolean);
  }
  return r;
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

/* ---------------- the gallery policy (binding on every pull) ----------------
   1. Every image the source offers (GALLERY_CAP is a runaway guard).
   2. Exact duplicates dropped: the same file twice, including the same
      file asked for at another render size/format (only the CDN's
      render parameters differ: wid/hei/w/h/fmt/qlt/impolicy/$preset$).
      Different paths are different photos and are all kept.
   3. Size charts / size guides LAST, never the card photo. A gallery
      that is nothing but a size chart has no product photo. */
const RENDER_PARAM = /^(w|h|wid|hei|width|height|size|sz|fmt|format|fm|qlt|quality|q|fit|crop|dpr|impolicy|policy|op_sharpen|op_usm|resmode|scl|bgc|bg|auto|sw|sh|sm|align|extend|ext|v|cb|ts|version)$/i;
export function galleryKey(u) {
  const m = /^https?:\/\/([^/?#\s]+)([^?#\s]*)(\?[^#\s]*)?/i.exec(String(u || ""));
  if (!m) return null;
  const params = (m[3] || "").slice(1).split("&").filter(Boolean)
    .filter((p) => { const k = decodeURIComponent(p.split("=")[0]); return !(RENDER_PARAM.test(k) || /^\$.*\$?$/.test(k)); })
    .sort();
  return m[1].toLowerCase() + m[2] + (params.length ? "?" + params.join("&") : "");
}

const SIZE_CHART_RX = /size[\s_-]*(chart|guide|grid|table)|sizechart|sizeguide|sizing[\s_-]*(chart|guide)|fit[\s_-]*guide|measurement[\s_-]*(chart|guide)|tabla[\s_-]*de[\s_-]*tallas|gu[ií]a[\s_-]*de[\s_-]*tallas/i;
/** True for a size chart / size guide image (by its URL or its own label). */
export function isSizeChart(u) {
  if (!u) return false;
  if (typeof u === "string") return SIZE_CHART_RX.test(u);
  return [u.url, u.src, u.contentUrl, u.alt, u.caption, u.name, u.title, u.type, u.role]
    .some((x) => typeof x === "string" && SIZE_CHART_RX.test(x));
}

/**
 * The gallery: every https photo the row carries, exact duplicates
 * dropped, size charts last. Returns the URL list; `.sizeCharts` on the
 * result (a non-enumerable count) says how many trailing entries are
 * size charts. imagesOf(raw).length - sizeCharts = real product photos.
 */
export function imagesOf(raw, cap = GALLERY_CAP) {
  const pool = [];
  for (const k of ["images", "imageUrls", "gallery", "additionalImages", "imageGallery", "media", "photos", "image", "imageUrl", "thumbnail", "mainImage"]) {
    const v = raw[k];
    if (Array.isArray(v)) pool.push(...v);
    else if (v) pool.push(v);
  }
  const photos = [], charts = [], seen = new Set();
  for (const entry of pool) {
    const u = urlOf(entry);
    if (!u) continue;
    const key = galleryKey(u);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    (isSizeChart(entry) ? charts : photos).push(u);
  }
  const keepPhotos = photos.slice(0, cap);
  const out = keepPhotos.concat(charts.slice(0, Math.max(0, cap - keepPhotos.length)));
  Object.defineProperty(out, "sizeCharts", { value: out.length - keepPhotos.length, enumerable: false });
  return out;
}

/** The spec table, as [{ name, value }] strings, exactly as published,
 *  from every place a row keeps one (first copy of a name+value wins). */
export function specsOf(raw) {
  const out = [];
  const push = (name, value) => {
    if (name == null || value == null) return;
    const n = String(name).trim(), v = String(value).trim();
    if (n && v && !out.some((s) => s.name === n && s.value === v)) out.push({ name: n, value: v });
  };
  for (const src of [raw.specifications, raw.specs, raw.additionalProperty, raw.additionalProperties, raw.attributes, raw.details]) {
    if (Array.isArray(src)) {
      for (const s of src) {
        if (!s || typeof s !== "object") continue;
        push(first(s.name, s.key, s.label, s.title), first(s.value, s.text, s.values && [].concat(s.values).join(", ")));
      }
    } else if (src && typeof src === "object") {
      for (const [k, v] of Object.entries(src)) if (v != null && typeof v !== "object") push(k, v);
    }
  }
  /* Materials the row states outside its spec table. */
  if (!out.some((s) => /^materials?$/i.test(s.name))) {
    const m = first(raw.material, raw.materials);
    if (m != null) push("Material", Array.isArray(m) ? m.filter(Boolean).join(", ") : (typeof m === "object" ? first(m.name, m.value) : m));
  }
  return out;
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
  const cands = GTIN_KEYS.map((k) => raw[k]);
  const o = offersOf(raw);
  if (o) cands.push(...GTIN_KEYS.map((k) => o[k]));
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
  /* SIBLING INFERENCE IS FLAGGED, never passed off as scraped: a row
     whose size list says it was copied from a sibling product (another
     colour, the parent style) keeps the list, marked as such, and the
     INGEST REPORT counts it apart from the as-scraped runs. */
  if (raw.sizesInferred === true || /sibling|infer/i.test(String(raw.sizeSource || raw.sizesSource || ""))) {
    const list = first(raw.availableSizes, raw.sizes, raw.sizeOptions);
    const vals = Array.isArray(list) ? list.map((s) => (s && typeof s === "object" ? first(s.size, s.label, s.name, s.value) : s)).map(clean) : [];
    return { sizes: uniq(vals), source: "sibling-inferred" };
  }
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
  let b = first(raw.breadcrumbs, raw.breadcrumb, raw.categoryPath, raw.category, raw.categories);
  if (b && typeof b === "object" && !Array.isArray(b) && Array.isArray(b.itemListElement)) b = b.itemListElement;
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
export function ingestRow(rawIn, quota, ctx = {}) {
  if (!rawIn || typeof rawIn !== "object") return { drop: "not-an-object" };
  const raw = normalizeRow(rawIn);
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

  const images = imagesOf(raw, ctx.galleryCap || GALLERY_CAP);
  if (!images.length) return { drop: "no-image" };
  /* A size chart is never the card photo: a gallery of charts only has
     no product photo. */
  if (images.length === images.sizeCharts) return { drop: "no-product-photo" };

  const specs = specsOf(raw);
  const crumbs = breadcrumbOf(raw);
  /* The bags slot reads DSW's accessories listing, which also carries
     socks, insoles and shoe care: only bags are in scope there. */
  if (quota && quota.scope === "bags" && !(BAG_RX.test(crumbs.join(" ")) || BAG_RX.test(name))) return { drop: "out-of-scope-accessory" };
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
    images: images.slice(),
    ...(images.sizeCharts ? { sizeChartImages: images.sizeCharts } : {}),
    type: typeOf(raw, crumbs) || undefined,
    ...(crumbs.length ? { category: crumbs.join(" > ") } : {}),
    availableSizes: sizes,
    sizeSource,
    ...(sizeSource === "sibling-inferred" ? { sizeInferred: true } : {}),
    ...(Array.isArray(raw.availableWidths) ? { availableWidths: raw.availableWidths.map(String) } : {}),
    ...(first(raw.color, raw.colorName) ? { color: String(first(raw.color, raw.colorName)) } : {}),
    ...(weight ? { weightKg: weight.kg, weightEstimated: false, weightSource: weight.from } : {}),
    ...(dimensionsOf(raw, specs) ? { dimensions: dimensionsOf(raw, specs) } : {}),
    ...(specs.length ? { specifications: specs } : {}),
    ...(gtinOf(raw, specs) ? { gtin: gtinOf(raw, specs) } : {}),
    ...(first(raw.sku, raw.productId) != null ? { sku: String(first(raw.sku, raw.productId)) } : {}),
  };
  /* GTIN PER VARIANT (size), when the row's variants carry them.
     Checksum-valid only; keyed by the size exactly as scraped. */
  if (Array.isArray(raw.variants)) {
    const vg = {};
    for (const x of raw.variants) {
      const code = x && String(gtinFrom(x) || "").replace(/\s|-/g, "");
      const size = x && first(x.size, x.sizeLabel, x.name);
      if (size != null && validGtin(code)) vg[String(size).replace(/\s+/g, " ").trim()] = code;
    }
    if (Object.keys(vg).length) item.variantGtins = vg;
  }
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
      if (it.gtin || it.variantGtins) stats.gtin++;
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

/* ---------------- optional second step: GTIN enrichment ----------------
   Only when the listing pass leaves GTIN coverage LOW (below
   GTIN_ENRICH_BELOW). pistachio_implementation/product-page-extractor
   reads a product page's JSON-LD (gtin*) at $0.0015 per successful row
   (Lucifer, #443). It is estimated separately, spends from the same
   wave cap, and needs its own --confirm-spend.
   Its input takes the page URLs as `productUrls`, an array of plain
   URL strings (the actor's live input schema, read by Lucifer on
   2026-10-22, #443). --gtin-input-key renames that field without a
   code change; `startUrls` is sent as [{url}], Apify's usual shape. Its output is read
   tolerantly: the row itself, or any JSON-LD Product it carries
   (jsonLd / jsonld / structuredData / data), for gtin* and per-size
   hasVariant / offers GTINs. Nothing but a checksum-valid GTIN is
   taken from it, and only onto a product (and sizes) the listing pass
   already scraped. */
export const GTIN_ENRICH_ACTOR = "pistachio_implementation/product-page-extractor";
export const GTIN_ENRICH_USD_PER_ROW = 0.0015;
export const GTIN_ENRICH_BELOW = 0.5;
export const GTIN_ENRICH_URLS_PER_RUN = 1000;

const bareUrl = (u) => String(u || "").split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase();

/** Product page URLs of shippable, published rows that carry no valid GTIN. */
export function gtinEnrichTargets(pulled, ctx = {}) {
  const urls = [];
  const seen = new Set();
  for (const { quota, items } of pulled) {
    for (const rawIn of items || []) {
      const v = ingestRow(rawIn, quota, ctx);
      if (!v.item || v.item.gtin || v.item.variantGtins || !v.item.url) continue;
      const k = bareUrl(v.item.url);
      if (seen.has(k) || !/^https:\/\//i.test(v.item.url)) continue;
      seen.add(k); urls.push(v.item.url);
    }
  }
  return urls;
}

export function estimateGtinEnrich(urlCount, rates, { capRemainingUsd = null } = {}) {
  const runs = Math.ceil(urlCount / GTIN_ENRICH_URLS_PER_RUN);
  const usd = cents(runs * rates.costPerRun + urlCount * GTIN_ENRICH_USD_PER_ROW);
  return { urls: urlCount, runs, usdPerRow: GTIN_ENRICH_USD_PER_ROW, estimateUsd: usd, capRemainingUsd, overCap: capRemainingUsd != null && usd > capRemainingUsd };
}

export const GTIN_ENRICH_INPUT_KEY = "productUrls";

export function gtinEnrichInput(urls, key = GTIN_ENRICH_INPUT_KEY) {
  return { [key]: key === "startUrls" ? urls.map((url) => ({ url })) : urls.slice() };
}

function* productNodes(x, depth = 0) {
  if (!x || typeof x !== "object" || depth > 6) return;
  if (Array.isArray(x)) { for (const y of x) yield* productNodes(y, depth + 1); return; }
  const t = [].concat(x["@type"] || []).join(" ");
  if (/Product/.test(t) || gtinFrom(x) != null) yield x;
  for (const k of ["@graph", "jsonLd", "jsonld", "jsonLD", "structuredData", "data", "hasVariant", "offers", "itemOffered"]) {
    if (x[k] && typeof x[k] === "object") yield* productNodes(x[k], depth + 1);
  }
}

/** { url, gtin, sizes: {size: gtin} } read from one extractor row. */
export function extractedGtins(row) {
  const url = first(row && row.url, row && row.loadedUrl, row && row.pageUrl);
  let gtin = null;
  const sizes = {};
  for (const n of productNodes(row)) {
    const code = String(gtinFrom(n) || "").replace(/\s|-/g, "");
    if (!validGtin(code)) continue;
    const size = variantSize(n);
    if (size != null) sizes[String(size).replace(/\s+/g, " ").trim()] = code;
    else if (!gtin) gtin = code;
  }
  return { url, gtin, sizes };
}

/**
 * Fold the extractor's GTINs into the raw pull (a new copy). A product
 * gets its own GTIN when it had none; a size gets one only when the
 * listing pass already scraped that size. Returns { pulled, filled }.
 */
export function mergeGtins(pulled, extractorRows) {
  const byUrl = new Map();
  for (const r of extractorRows || []) {
    const e = extractedGtins(r);
    if (e.url && (e.gtin || Object.keys(e.sizes).length)) byUrl.set(bareUrl(e.url), e);
  }
  let filled = 0;
  const out = pulled.map((p) => ({
    ...p,
    items: (p.items || []).map((rawIn) => {
      const raw = normalizeRow(rawIn);
      const e = raw && raw.url ? byUrl.get(bareUrl(raw.url)) : null;
      if (!e) return rawIn;
      const next = { ...rawIn };
      let hit = false;
      if (e.gtin && !gtinOf(raw)) { next.gtin = e.gtin; hit = true; }
      if (Array.isArray(raw.variants) && Object.keys(e.sizes).length) {
        next.variants = raw.variants.map((v) => {
          const s = v && v.size != null ? String(v.size).replace(/\s+/g, " ").trim() : null;
          if (s && e.sizes[s] && !validGtin(String(gtinFrom(v) || ""))) { hit = true; return { ...v, gtin: e.sizes[s] }; }
          return v;
        });
      }
      if (hit) { next.gtinSource = "product-page-json-ld"; filled++; }
      return next;
    }),
  }));
  return { pulled: out, filled };
}

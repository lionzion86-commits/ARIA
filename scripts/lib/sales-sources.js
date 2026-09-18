// Shared definition of WHERE Ofertas looks for deals and HOW a scraped row
// becomes a deal.
//
// index.html carries its own copy of all of this because it is a plain
// <script> and cannot import a module — the same reason the retailer badge
// and the batch-hour helpers are duplicated there. That duplication is
// only safe because it is asserted: test-sales-parity cross-checks this
// module against index.html's own SALES_SOURCES and normalizeLiveItem over
// the real cached payloads. Change one, change the other, or the test
// fails.
//
// The refresh script (scripts/refresh-sales-cache.js) is the only writer
// of the deals cache in normal operation, so what it considers a deal has
// to match what the page would have considered a deal.

// Confirmed department sources — see the SALES_SOURCES comment in
// index.html for why these and not a keyword search.
export const SALES_SOURCES = [
  { retailer: "oldnavy", department: "men" },
  { retailer: "oldnavy", department: "women" },
  { retailer: "oldnavy", department: "kids" },
  { retailer: "footlocker", department: "sale" },
  { retailer: "footlocker", department: "women" },
  { retailer: "footlocker", department: "kids" },
  { retailer: "walmart", department: "clothing" },
  { retailer: "walmart", department: "electronics" },
  { retailer: "walmart", department: "sporting_goods" },
  { retailer: "target", department: "clothing" },
  { retailer: "target", department: "electronics" },
  { retailer: "target", department: "sporting_goods" },
];

// Must match index.html exactly.
export const SALES_TAX_RATE = 1.07;
export const LIVE_PRICE_MARKUP = 1.24;
export const MIN_DISCOUNT_PCT = 5;

import { bulkyWeightKg, freightUsd, freightShare, withBuffer, withoutBundledClauses, billableWeightKg, MAX_FREIGHT_SHARE } from "./item-weight.js";

// The public charged rate, and only that. weight-data.js also exports our
// internal courier cost and margin; neither may travel with anything that
// reaches a customer, so this module imports neither.
export const CHARGE_PER_KG_USD = 13;

// General-retail fallbacks. This is an EXACT mirror of
// RETAIL_WEIGHT_ESTIMATES_KG in index.html -- same rows, same order, same
// confidence tiers -- because both sides must produce the identical weight
// for the same title. They diverged once: this table was written without
// the `tier` field, so every row got the 1.20 'reasoned' buffer while the
// page gave 'cited' rows 1.10, and a pair of sneakers came out 1.32kg here
// against 1.21kg there. The freight gate runs on these numbers, so a
// mismatch means the page can show a deal the refresh suppressed.
// test-freight asserts row-for-row agreement.
const RETAIL_WEIGHT_FALLBACK_KG = [
  { match: /\bjeans?\b|denim/i, kg: 1, tier: "cited" },
  { match: /t-?shirt|\btee\b|undershirt/i, kg: 0.2, tier: "cited" },
  { match: /hoodie|sweatshirt/i, kg: 0.8, tier: "cited" },
  { match: /jacket|\bcoat\b/i, kg: 1.3, tier: "reasoned" },
  { match: /sneaker|\bshoe|\bboot/i, kg: 1.4, tier: "cited", dimCm: [33, 22, 13] },
  { match: /underwear|boxer|\bbrief|panty|panties/i, kg: 0.08, tier: "cited" },
  { match: /\bsocks?\b/i, kg: 0.1, tier: "cited" },
  { match: /smartphone|iphone|galaxy s\d|\bphone\b/i, kg: 0.3, tier: "cited", dimCm: [20, 12, 8] },
  { match: /laptop|notebook|macbook|chromebook/i, kg: 2.4, tier: "cited", dimCm: [45, 32, 10] },
  { match: /\bhdmi\b|\busb\b|\bcable\b|\bcord\b/i, kg: 0.25, tier: "cited" },
  { match: /\bremote\b/i, kg: 0.2, tier: "reasoned" },
  { match: /\bwall mount\b|\btv mount\b/i, kg: 3.5, tier: "reasoned" },
  // Rigid boxed goods, where the box bills for more than the contents
  // weigh (dimCm = typical retail box, L x W x H in cm). All reasoned.
  { match: /airpods max|over-?ear|\bheadphones?\b|\bheadset\b|aud[ií]fonos|auriculares/i, kg: 0.9, tier: "reasoned", dimCm: [25, 22, 12] },
  { match: /\bsoundbar\b|\bspeaker\b|\bparlante\b|barra de sonido/i, kg: 4, tier: "reasoned", dimCm: [95, 20, 15] },
  { match: /\bmonitor\b/i, kg: 5.5, tier: "reasoned", dimCm: [70, 45, 15] },
  { match: /\bprinter\b|impresora/i, kg: 7, tier: "reasoned", dimCm: [55, 45, 35] },
  { match: /\bstroller\b|car seat|silla de auto/i, kg: 8, tier: "reasoned", dimCm: [60, 45, 35] },
  { match: /airpods|earbuds/i, kg: 0.35, tier: "reasoned", dimCm: [12, 10, 6] },
  { match: /\bipad\b|\btablet\b/i, kg: 1.1, tier: "reasoned", dimCm: [30, 22, 5] },
  { match: /smartwatch|apple watch/i, kg: 0.4, tier: "reasoned", dimCm: [15, 12, 8] },
];
const DEFAULT_RETAIL_WEIGHT_KG = 0.8; // unclassified: a rough placeholder, so 'reasoned'
const TV_ACCESSORY_RE = /\bcable\b|\bcord\b|\bmount\b|\bstand\b|\bremote\b|\bantenna\b|\bbracket\b|\badapter\b|\bconverter\b|\bscreen protector\b/i;

function tvWeightKg(title) {
  const m = /(\d{2})\s*(?:"|in\b|inch)/i.exec(title);
  const inches = m ? parseInt(m[1], 10) : null;
  const kg = inches == null ? 14 : inches <= 32 ? 8 : inches <= 43 ? 12
    : inches <= 50 ? 19 : inches <= 55 ? 23 : inches <= 65 ? 31 : 40;
  return withBuffer(kg, "cited");
}

/**
 * Billable weight for a title when a real category matches, else null.
 *
 * Returning null for "nothing matched" is what lets the checkout weight
 * resolver tell a category estimate apart from the generic fallback, and
 * label them differently to the customer.
 */
export function categoryWeightKg(title) {
  const t = String(title || "");
  const bulky = bulkyWeightKg(t);
  if (bulky != null) return bulky;
  if (/\btv\b|television/i.test(t) && !TV_ACCESSORY_RE.test(withoutBundledClauses(t))) return tvWeightKg(t);
  const hit = RETAIL_WEIGHT_FALLBACK_KG.find((p) => p.match.test(t));
  if (!hit) return null;
  return billableWeightKg(withBuffer(hit.kg, hit.tier), hit.dimCm);
}

/** Estimated shipping weight for a scraped title. Bulky goods win first. */
export function estimateWeightKg(title) {
  const category = categoryWeightKg(title);
  if (category != null) return category;
  return withBuffer(DEFAULT_RETAIL_WEIGHT_KG, "reasoned");
}

const round2 = (n) => Math.round(n * 100) / 100;

function num(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseFloat(value.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

function safeUrl(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

// Mirrors normalizeLiveItem() in index.html for the fields the deals cache
// stores. Deliberately NOT a full copy — weight/size estimation lives in
// the page and is not needed here.
export function normalizeDeal(item, retailer) {
  const title = item.title || item.name || item.productTitle || item.productName || "";
  const rawPrice = num(item.price ?? item.currentPrice ?? item.salePrice ?? item.effectivePrice
    ?? item?.priceInfo?.price ?? item?.priceInfo?.currentPrice);
  const price = Number.isFinite(rawPrice) ? round2(rawPrice * SALES_TAX_RATE * LIVE_PRICE_MARKUP) : null;

  const rawImages = Array.isArray(item.images) ? item.images : [];
  const images = [...new Set([item.image, item.imageUrl, item.thumbnail, ...rawImages].map(safeUrl).filter(Boolean))].slice(0, 8);

  const ratingRaw = Number(item.rating ?? item.stars ?? item.reviewScore ?? item.averageRating);
  const rating = Number.isFinite(ratingRaw) && ratingRaw > 0 && ratingRaw <= 5 ? Math.round(ratingRaw * 10) / 10 : null;

  const sizes = Array.isArray(item.availableSizes)
    ? item.availableSizes.filter((s) => typeof s === "string" && s.trim()).slice(0, 40)
    : [];

  const onSaleFlag = item.onSale === true || item.isOnSale === true
    || (typeof item.savingsAmount === "number" && item.savingsAmount > 0)
    || (typeof item.savingsPercent === "number" && item.savingsPercent > 0)
    || (typeof item.percentageOff === "number" && item.percentageOff > 0)
    || (typeof item.percentOff === "number" && item.percentOff > 0);

  const rawOriginal = num(item.regularPrice ?? item.wasPrice ?? item.was_price ?? item.originalPrice);
  const hasAny = onSaleFlag && Number.isFinite(rawOriginal) && Number.isFinite(rawPrice) && rawOriginal > rawPrice;
  const pct = hasAny ? Math.round((1 - rawPrice / rawOriginal) * 100) : 0;
  const isDeal = hasAny && pct >= MIN_DISCOUNT_PCT;

  if (!isDeal || !title || price == null) return null;

  /* FREIGHT GATE. A 45%-off TV stand is not a deal if it weighs 40kg and
     costs $520 to fly here. The scraper gives us no weight, so it is
     estimated from the title (see estimateWeightKg / item-weight.js) and
     joined here, at ranking time, rather than being discovered by the
     customer at checkout.

     Weight and freight are stored on the item so the card can show the
     real cost and, if anything slips through, badge it instead of
     printing a discount the freight wipes out. */
  const weightKg = estimateWeightKg(title);
  const freight = freightUsd(weightKg, CHARGE_PER_KG_USD);
  const share = freightShare(weightKg, price, CHARGE_PER_KG_USD);
  if (share > MAX_FREIGHT_SHARE) return null; // suppressed: freight kills it

  return {
    retailer,
    title,
    price,
    originalPrice: round2(rawOriginal * SALES_TAX_RATE * LIVE_PRICE_MARKUP),
    rating,
    weightKg,
    freightUsd: freight,
    freightShare: Math.round(share * 1000) / 1000,
    sizes,
    image: images[0] || null,
    images,
    onSale: true,
  };
}

// Same collapse the page does: colour/size variants of one product share a
// title, so key on retailer+title (never price) and keep the cheapest.
export function dedupeKey(retailer, title) {
  return retailer + "::" + String(title || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function collapseVariants(deals) {
  const byKey = new Map();
  for (const d of deals) {
    const k = dedupeKey(d.retailer, d.title);
    const existing = byKey.get(k);
    if (!existing || d.price < existing.price) byKey.set(k, d);
  }
  return [...byKey.values()];
}

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

import {
  bulkyWeightKg, freightUsd, freightShare, withBuffer, withoutBundledClauses,
  billableWeightKg, titleWeight, MAX_FREIGHT_SHARE, weightSanity, footwearWeightKg, ballWeightKg,
} from "./item-weight.js";

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
  // Footwear is owned by footwearWeightKg() — one source, sized by what
  // is in the box rather than one number for every pair.
  { match: /underwear|boxer|\bbrief|panty|panties/i, kg: 0.08, tier: "cited" },
  { match: /\bsocks?\b/i, kg: 0.1, tier: "cited" },
  /* 2026-09-19: these were the biggest slice of the "unclassified guess"
     review queue — a clothing-heavy catalogue with no row for trousers,
     shorts or a button-up shirt. Every one of them was quoting the 1.08 kg
     generic fallback. Cited tier: these are ordinary garment weights. */
  { match: /\b(pants|trousers|chinos?|cargo pants|sweatpants|joggers|leggings?|overalls)\b/i, kg: 0.55, tier: "cited" },
  { match: /\b(shorts)\b/i, kg: 0.32, tier: "cited" },
  { match: /\b(shirt|polo|blouse|button[- ]?up|button[- ]?down)\b/i, kg: 0.35, tier: "cited" },
  { match: /\b(dress|skirt|romper|jumpsuit)\b/i, kg: 0.42, tier: "cited" },
  { match: /\b(sweater|cardigan|fleece|vest|pullover)\b/i, kg: 0.6, tier: "cited" },
  { match: /\b(pajamas?|pyjamas?|robe|sleepwear|loungewear)\b/i, kg: 0.6, tier: "reasoned" },
  { match: /\b(towels?|washcloths?|dishcloths?)\b/i, kg: 0.3, tier: "reasoned" },
  { match: /\b(blu-?ray|\bdvd\b|4k ultra hd|box set|complete series)\b/i, kg: 0.3, tier: "reasoned" },
  { match: /\b(knee brace|ankle brace|elbow brace|wrist brace|compression sleeve|back brace|ankle wraps?)\b/i, kg: 0.2, tier: "reasoned" },
  // Balls are handled by ballWeightKg() (real mass x count vs the box),
  // not by a single row that made a golf ball and a basketball equal.
  { match: /\bfootballs?\b/i, kg: 0.45, tier: "cited" },
  // Bedding is the heaviest thing a clothing-and-home catalogue sells by
  // volume, and it had no row at all: a queen comforter is nearly 3 kg.
  { match: /\b(comforter|duvet|quilt|bedspread|coverlet)\b/i, kg: 2.8, tier: "reasoned" },
  { match: /\b(sheet set|bed sheets?|pillowcases?|bedding set|mattress pad|mattress protector)\b/i, kg: 1.6, tier: "reasoned" },
  { match: /\b(pillows?|cushions?|throw blanket|blankets?)\b/i, kg: 1.2, tier: "reasoned" },
  { match: /\b(curtains?|drapes?|shower curtain)\b/i, kg: 1, tier: "reasoned" },
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
  { match: /\bvitamins?\b|multivitamin|\bsupplement\b|suplementos?\b|\bsoftgels?\b|\btablets?\b.*\bcount\b/i, kg: 0.5, tier: "reasoned" },
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
  // A sneaker listed by model name ("New Balance 204L") is still a sneaker.
  const shoes = footwearWeightKg(t);
  if (shoes != null) return shoes;
  // A ball's real mass and count, against the box that gets billed.
  const ball = ballWeightKg(t);
  if (ball != null) return ball;
  if (/\btv\b|television/i.test(t) && !TV_ACCESSORY_RE.test(withoutBundledClauses(t))) return tvWeightKg(t);
  const hit = RETAIL_WEIGHT_FALLBACK_KG.find((p) => p.match.test(t));
  if (!hit) return null;
  return billableWeightKg(withBuffer(hit.kg, hit.tier), hit.dimCm);
}

/**
 * Estimated shipping weight for a scraped title.
 *
 * The chain, in order of how much it is worth trusting:
 *   1. a weight the retailer stated in the title ("4 oz") — a fact
 *   2. our category table — a reasoned guess, biased high
 *   3. the generic floor — never zero
 * (A scraped spec weight beats all three, and is applied before this is
 * ever called: see netlify/functions/_weight-resolve.js.)
 */
export function estimateWeightKg(title) {
  return estimateWeightDetail(title).kg;
}

/**
 * The same chain, with its reasoning attached — and with the sanity
 * bounds applied at the end, so nothing implausible leaves this function.
 *
 * { kg, source: "title"|"category"|"fallback", flagged, bound, reason }
 *
 * `flagged` means the chain produced a weight the bounds rejected: the
 * floor is used instead (never under-quote) and the caller is expected to
 * SAY SO rather than publish it quietly. That is the whole point — a
 * wrong weight is money straight off the margin, because we honour the
 * freight we quoted.
 */
export function estimateWeightDetail(title) {
  const stated = titleWeight(title);
  const raw = stated ? { kg: stated.kg, source: "title" }
    : (() => {
        const category = categoryWeightKg(title);
        return category != null
          ? { kg: category, source: "category" }
          : { kg: withBuffer(DEFAULT_RETAIL_WEIGHT_KG, "reasoned"), source: "fallback" };
      })();

  const check = weightSanity(title, raw.kg);
  const kg = check.kg;
  /* NEVER PUBLISH A GUESS SILENTLY (2026-09-19). Two different things
     used to look identical on a card: a weight the retailer stated, and
     the generic fallback. Every product we could not classify showed the
     same 1.08 kg next to a freight figure, which reads as a measurement.
     A fallback weight is now flagged on its way out — it is a review
     queue for the refresh scripts, and the card labels it an estimate
     instead of printing it as fact. */
  const guessed = raw.source === "fallback";
  if (!check.ok) {
    return { kg, source: raw.source, estimated: true, flagged: true, bound: check.key, reason: check.reason };
  }
  if (guessed) {
    return { kg, source: raw.source, estimated: true, flagged: true, bound: check.key,
      reason: `sin categoría — estimado genérico de ${kg} kg, necesita una fila de categoría` };
  }
  // A category estimate is still an estimate; only a stated weight is a fact.
  return { kg, source: raw.source, estimated: raw.source !== "title", flagged: false, bound: check.key, reason: null };
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
  const weight = estimateWeightDetail(title);
  const weightKg = weight.kg;
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
    // Set only when the sanity bounds had to correct the estimate — the
    // refresh script prints these so a real category row gets added.
    // The card must be able to say "estimado" rather than print a guess
    // as a measurement; the refresh script prints the flagged ones.
    weightEstimated: weight.estimated,
    ...(weight.flagged ? { weightFlagged: true, weightFlagReason: weight.reason } : {}),
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

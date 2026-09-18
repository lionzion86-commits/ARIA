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
  return {
    retailer,
    title,
    price,
    originalPrice: round2(rawOriginal * SALES_TAX_RATE * LIVE_PRICE_MARKUP),
    rating,
    weightKg: null, // the page estimates this; not stored
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

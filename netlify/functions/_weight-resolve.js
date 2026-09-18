/* ============================================================
   CHECKOUT WEIGHT RESOLUTION — server side, per cart item.

   THE BUG THIS EXISTS FOR
   checkout.html filled "Peso del paquete" straight from the cart item's
   weightKg and disabled the field, under helper text promising "Peso
   estimado automáticamente según el tipo de producto". There was no
   estimation anywhere in that path: whatever the cart happened to carry
   was the answer, and addToCartFromProduct() wrote a literal 0 when a
   card was built without a weight (an older cart in localStorage, a
   server cart from cart-get, a card from a payload with no weight field).
   0.00 kg then fails the `kg > 0` guard in requestQuote(), so the freight
   line reads "—", the total reads S/ 0.00 and Pagar stays disabled.
   Reproduced with "Apple AirPods Max 2 - Starlight".

   RESOLUTION ORDER (the caller sees which one answered)
     1. spec       — a real weight or real dimensions from the retailer
     2. category   — our category table, at BILLABLE weight (actual vs
                     volumetric, whichever the courier would charge)
     3. fallback   — a labeled generic, never zero

   Nothing here may return 0: a zero weight is not a cheap package, it is
   a missing measurement, and it silently breaks the whole quote.

   PRICING PROMISE: an estimate that comes in low is our cost, not the
   customer's. The quote shown at checkout is the price honored; freight
   is never re-billed after the fact. Keep that true — do not add any
   post-hoc adjustment against a customer here.
   ============================================================ */
import { categoryWeightKg } from "../../scripts/lib/sales-sources.js";
import { billableWeightKg, dimensionalWeightKg } from "../../scripts/lib/item-weight.js";

// Deliberately the same generic the product cards and cart already show
// (DEFAULT_RETAIL_WEIGHT_KG x the reasoned buffer, index.html), so an
// unclassified item does not quietly get heavier between the cart and
// checkout. Where it is too light, we absorb it — see PRICING PROMISE.
export const GENERIC_FALLBACK_KG = 0.6;

const KG_PER_LB = 0.45359237;
const KG_PER_OZ = 0.028349523;
const CM_PER_IN = 2.54;
const MAX_ITEM_KG = 1000;  // anything past this is a bad unit, not a heavy box

function toKg(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = String(unit || "").toLowerCase();
  const kg = u.startsWith("lb") || u === "pound" || u === "pounds" ? n * KG_PER_LB
    : u.startsWith("oz") || u === "ounce" || u === "ounces" ? n * KG_PER_OZ
    : u === "g" || u === "gram" || u === "grams" ? n / 1000
    : n; // already kg
  return kg > 0 && kg < MAX_ITEM_KG ? Math.round(kg * 100) / 100 : null;
}

// "2.5 lbs", "40 oz", "1,2 kg", "shipping weight: 3 pounds"
function parseWeightString(text) {
  const m = /(\d+(?:[.,]\d+)?)\s*(kilograms?|kgs?|grams?|g|pounds?|lbs?|lb|ounces?|oz)\b/i.exec(String(text || ""));
  if (!m) return null;
  return toKg(m[1].replace(",", "."), m[2]);
}

// "10 x 8 x 4 inches", "25 x 22 x 12 cm"
function parseDimsCm(text) {
  const s = String(text || "");
  const m = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(cm|centimet\w*|in\b|inch\w*|"|')?/i.exec(s);
  if (!m) return null;
  const nums = [m[1], m[2], m[3]].map((v) => Number(String(v).replace(",", ".")));
  if (nums.some((n) => !Number.isFinite(n) || n <= 0)) return null;
  const unit = String(m[4] || "").toLowerCase();
  const inInches = unit.startsWith("in") || unit === '"' || unit === "'";
  return inInches ? nums.map((n) => Math.round(n * CM_PER_IN * 10) / 10) : nums;
}

const WEIGHT_FIELDS = [
  "weightKg", "weight_kg", "shippingWeightKg",
  "weight", "itemWeight", "item_weight", "shippingWeight", "shipping_weight",
  "weightLb", "weight_lb", "weightPounds",
];
const DIM_FIELDS = ["dimensions", "itemDimensions", "item_dimensions", "packageDimensions", "size", "productDimensions"];

/**
 * A real weight from the retailer, or null. Reads the plain fields, the
 * unit-suffixed ones, and the key/value `specifications` array Walmart's
 * schema exposes (empty at listing level today, populated in detail
 * scrapes — so this is ready for the data rather than assuming it).
 */
export function specWeightKg(item) {
  if (!item || typeof item !== "object") return null;

  for (const field of WEIGHT_FIELDS) {
    const raw = item[field];
    if (raw == null) continue;
    const unit = /lb|pound/i.test(field) ? "lb" : /kg/i.test(field) ? "kg" : null;
    const kg = typeof raw === "number"
      ? toKg(raw, unit || "kg")
      : parseWeightString(raw) || toKg(raw, unit);
    // A weightKg of 0 is the bug this module exists for, not a fact.
    if (kg) return { kg, from: field };
  }

  const specs = Array.isArray(item.specifications) ? item.specifications : [];
  for (const spec of specs) {
    const name = String(spec?.name ?? spec?.key ?? "");
    const value = spec?.value ?? spec?.text ?? "";
    if (/weight/i.test(name)) {
      const kg = parseWeightString(value);
      if (kg) return { kg, from: `specifications:${name}` };
    }
  }

  // Real dimensions are a real measurement too: they give the volumetric
  // weight the courier would bill even when no weight is published.
  for (const field of [...DIM_FIELDS]) {
    const dims = parseDimsCm(item[field]);
    if (dims) {
      const dim = dimensionalWeightKg(...dims);
      if (dim) return { kg: dim, from: `${field} (volumétrico)`, volumetric: true };
    }
  }
  for (const spec of specs) {
    if (/dimension|size/i.test(String(spec?.name ?? spec?.key ?? ""))) {
      const dims = parseDimsCm(spec?.value ?? spec?.text ?? "");
      const dim = dims ? dimensionalWeightKg(...dims) : null;
      if (dim) return { kg: dim, from: "specifications:dimensions (volumétrico)", volumetric: true };
    }
  }
  return null;
}

/**
 * One item's shipping weight, always > 0.
 * Returns { weightKg, source, estimated, basis } where source is
 * "spec" | "category" | "fallback".
 */
export function resolveItemWeight(item) {
  const title = String(item?.title ?? item?.name ?? "");

  const spec = specWeightKg(item);
  if (spec) {
    // Even a published weight is billed against the box when the retailer
    // also tells us the box.
    const dims = parseDimsCm(item?.dimensions) || parseDimsCm(item?.packageDimensions);
    const kg = dims ? billableWeightKg(spec.kg, dims) : spec.kg;
    return { weightKg: kg, source: "spec", estimated: false, basis: spec.from };
  }

  const category = categoryWeightKg(title);
  if (category != null && category > 0) {
    return { weightKg: category, source: "category", estimated: true, basis: "categoría del producto" };
  }

  return { weightKg: GENERIC_FALLBACK_KG, source: "fallback", estimated: true, basis: "estimado genérico" };
}

/** Whole cart: per-item weights plus the total the quote is built on. */
export function resolveCartWeights(items) {
  const list = Array.isArray(items) ? items : [];
  const resolved = list.map((it) => {
    const qty = Math.max(1, Math.round(Number(it?.qty) || 1));
    const r = resolveItemWeight(it);
    return { ...r, qty, lineKg: Math.round(r.weightKg * qty * 100) / 100, title: String(it?.title ?? it?.name ?? "") };
  });
  const totalKg = Math.round(resolved.reduce((sum, r) => sum + r.lineKg, 0) * 100) / 100;
  return {
    items: resolved,
    totalKg,
    // Exact only when every line came from real retailer data.
    estimated: resolved.some((r) => r.estimated),
    anyFallback: resolved.some((r) => r.source === "fallback"),
  };
}

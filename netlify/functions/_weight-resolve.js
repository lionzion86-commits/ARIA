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
     1. spec       — a real weight the retailer published
     2. beauty     — our beauty/fragrance shipped-weight table
     3. title      — a net weight the retailer stated in the product title
                     ("4 oz"), plus a flat packaging allowance
     4. category   — our category table, at actual scale weight
     5. fallback   — a labeled generic, never zero

   WHY BEAUTY OUTRANKS THE TITLE: a cosmetic's title states the volume of
   liquid in the bottle, not what ships. "Eau de Toilette 3.4 oz" read as
   a weight is 0.16 kg for a parcel that really weighs 0.35 kg, because
   the glass and the box are most of it. See scripts/lib/beauty-weight.js.

   ACTUAL SCALE WEIGHT ONLY (2026-09-20): the courier contract has no
   dimensional/volumetric component, so retailer-published DIMENSIONS are
   no longer a weight source and the category table is no longer billed
   against a box. Only a published WEIGHT counts as spec data now.

   Nothing here may return 0: a zero weight is not a cheap package, it is
   a missing measurement, and it silently breaks the whole quote.

   PRICING PROMISE: an estimate that comes in low is our cost, not the
   customer's. The quote shown at checkout is the price honored; freight
   is never re-billed after the fact. Keep that true — do not add any
   post-hoc adjustment against a customer here.
   ============================================================ */
import { categoryWeightKg } from "../../scripts/lib/sales-sources.js";
import { titleWeight } from "../../scripts/lib/item-weight.js";
import { beautyWeightDetail, fragranceLimitState } from "../../scripts/lib/beauty-weight.js";

// Deliberately the same generic the product cards and cart already show
// (DEFAULT_RETAIL_WEIGHT_KG x the reasoned buffer, index.html), so an
// unclassified item does not quietly get heavier between the cart and
// checkout. Where it is too light, we absorb it — see PRICING PROMISE.
export const GENERIC_FALLBACK_KG = 0.6;

const KG_PER_LB = 0.45359237;
const KG_PER_OZ = 0.028349523;
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

const WEIGHT_FIELDS = [
  "weightKg", "weight_kg", "shippingWeightKg",
  "weight", "itemWeight", "item_weight", "shippingWeight", "shipping_weight",
  "weightLb", "weight_lb", "weightPounds",
];

/**
 * A real WEIGHT from the retailer, or null. Reads the plain fields, the
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

  /* Published DIMENSIONS used to answer here too, converted to a
     dimensional weight. They no longer do: the courier bills the scale
     reading, so a box's size tells us nothing we are charged for. A
     listing with dimensions but no weight now falls through to the
     estimator, same as a listing with neither. */
  return null;
}

/**
 * One item's shipping weight, always > 0.
 * Returns { weightKg, source, estimated, basis } where source is
 * "spec" | "beauty" | "title" | "category" | "fallback".
 */
export function resolveItemWeight(item) {
  const title = String(item?.title ?? item?.name ?? "");
  const hints = { retailer: item?.retailer, department: item?.department };

  // A weight the retailer published is the one fact here, and it wins
  // over everything below, beauty included.
  const spec = specWeightKg(item);
  if (spec) {
    return { weightKg: spec.kg, source: "spec", estimated: false, basis: spec.from };
  }

  // Beauty before the title parse — a fragrance title states the liquid's
  // volume, not the parcel's weight. See beauty-weight.js.
  const beauty = beautyWeightDetail(title, hints);
  if (beauty) {
    return {
      weightKg: beauty.kg, source: "beauty", estimated: true,
      basis: `peso estimado de belleza (${beauty.key})`,
    };
  }

  // A weight the retailer wrote in the title is a stated fact, not a
  // guess — it beats any category table. The carousel truncates titles on
  // screen, so this reads the full source title (see titleWeight).
  const stated = titleWeight(title);
  if (stated) {
    return {
      weightKg: stated.kg, source: "title", estimated: false,
      basis: `peso declarado en el título (${stated.token} + empaque)`,
    };
  }

  const category = categoryWeightKg(title, hints);
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
    /* The courier's four-fragrance-per-shipment clause, answered by the
       same call that answers the weight — so checkout never has to
       re-derive it from titles on its own. */
    fragrance: fragranceLimitState(list),
  };
}

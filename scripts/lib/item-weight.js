// Shipping-weight estimates for bulky general-retail goods.
//
// WHY THIS EXISTS
// The scraper captures NO per-item weight — verified across all 613
// cached items: not one carries a weight, lb, kg or dimension field. So
// freight has to be estimated from the title, and the estimate table in
// index.html had no furniture or appliance category at all. Everything
// bulky fell through to DEFAULT_RETAIL_WEIGHT_KG (0.5kg):
//
//   "Mainstay 4-Shelf TV Stand"   0.6 kg  ->  $8 freight on a $120 item
//   "6 Drawer Dresser"            0.6 kg  ->  $8 freight on a $180 item
//   "Queen Size Mattress"         0.6 kg  ->  $8 freight on a $300 item
//
// A real 40kg TV stand is $520 of freight at CHARGE_PER_KG. So a freight
// gate alone would never have fired on exactly the items that need it —
// the weights had to be fixed first.
//
// EVERY NUMBER BELOW IS 'reasoned', NOT CITED. They are real-world
// plausible shipping weights for the category, not sourced measurements,
// and they carry the same 1.2x confidence buffer the rest of the site
// applies to reasoned estimates. They exist to keep obviously-heavy goods
// out of Ofertas and to stop checkout under-quoting freight — not to be
// precise. A real per-SKU weight from a retailer feed should replace them.
//
// NOTE: this module is imported by the refresh script. index.html carries
// its own copy because it is a plain <script> and cannot import;
// test-item-weight asserts the two agree on every category.

export const CONFIDENCE_BUFFER = { cited: 1.10, reasoned: 1.20 };

export function withBuffer(kg, tier) {
  return Math.round(kg * CONFIDENCE_BUFFER[tier] * 100) / 100;
}

// Checked BEFORE the general table and before the TV branch, because
// "TV Stand" is furniture, not a television.
export const BULKY_WEIGHT_ESTIMATES_KG = [
  { match: /\b(sofa|loveseat|couch|sectional|futon)\b/i, kg: 60 },
  { match: /\b(mattress|box spring|boxspring)\b/i, kg: 30 },
  { match: /\b(bed frame|headboard|bunk bed|platform bed)\b/i, kg: 35 },
  { match: /\b(wardrobe|armoire|china cabinet)\b/i, kg: 50 },
  { match: /\b(dresser|chest of drawers|drawer chest)\b/i, kg: 45 },
  { match: /\b(treadmill|elliptical|exercise bike|weight bench|home gym)\b/i, kg: 70 },
  { match: /\b(refrigerator|fridge|freezer|washer|dryer|dishwasher|range oven|stove)\b/i, kg: 70 },
  { match: /\b(dining table|coffee table|desk|console table|end table|nightstand)\b/i, kg: 30 },
  { match: /\b(tv stand|media console|entertainment center|credenza)\b/i, kg: 30 },
  { match: /\b(bookshelf|bookcase|shelving unit|storage cabinet|cabinet)\b/i, kg: 25 },
  { match: /\b(grill|smoker|bbq)\b/i, kg: 40 },
  { match: /\b(patio set|outdoor set|sofa set|dining set)\b/i, kg: 40 },
  { match: /\b(air conditioner|dehumidifier|space heater)\b/i, kg: 25 },
  { match: /\b(mini fridge|microwave|air fryer)\b/i, kg: 15 },
  { match: /\b(recliner|armchair|accent chair|office chair|dining chair)\b/i, kg: 15 },
  { match: /\b(rug|carpet|area rug)\b/i, kg: 12 },
  { match: /\b(vacuum|stroller|car seat)\b/i, kg: 8 },
  { match: /\b(suitcase|luggage)\b/i, kg: 4 },
];

/**
 * Bulky-category weight for a title, or null when nothing matches.
 * Callers fall through to their own general table.
 */
export function bulkyWeightKg(text) {
  const t = String(text || "");
  const hit = BULKY_WEIGHT_ESTIMATES_KG.find((p) => p.match.test(t));
  return hit ? withBuffer(hit.kg, "reasoned") : null;
}

/**
 * Drops "with ..." clauses from a title before accessory keywords are
 * tested against it.
 *
 * Found against real Target data: "Roku 40\" Select Series 1080p Full HD
 * Smart Roku TV with Voice Remote ..." matched the TV-accessory guard on
 * the word "remote", so a 40-inch television was priced as a remote
 * control -- 0.12kg, $1.56 of freight against a real ~$143. An accessory
 * word inside a "with ..." clause names what comes bundled WITH the
 * product, not the product itself. Clauses end at a comma or semicolon,
 * which keeps genuine accessories intact: "Fireplace TV Stand with LED
 * Light for up to 70 inch TV, ..." still reads as a stand.
 */
export function withoutBundledClauses(text) {
  return String(text || "").replace(/\bwith\b[^,;]*/gi, " ");
}

/**
 * Freight the customer is charged for a given weight.
 *
 * chargePerKg is passed in rather than imported so this module never has
 * to reach into weight-data.js, which also holds internal cost/margin
 * figures that must not travel with customer-facing code.
 */
export function freightUsd(weightKg, chargePerKg) {
  const kg = Number(weightKg);
  const rate = Number(chargePerKg);
  if (!Number.isFinite(kg) || !Number.isFinite(rate) || kg <= 0) return 0;
  return Math.round(kg * rate * 100) / 100;
}

// A markdown is not a deal if getting it here costs a third of the price
// again. 0.30 is a judgement call, not a derived figure.
export const MAX_FREIGHT_SHARE = 0.30;

/** Share of the sale price that freight represents. */
export function freightShare(weightKg, priceUsd, chargePerKg) {
  const price = Number(priceUsd);
  if (!Number.isFinite(price) || price <= 0) return Infinity;
  return freightUsd(weightKg, chargePerKg) / price;
}

/** True when freight eats too much of the price for this to be a deal. */
export function freightKillsDeal(weightKg, priceUsd, chargePerKg) {
  return freightShare(weightKg, priceUsd, chargePerKg) > MAX_FREIGHT_SHARE;
}

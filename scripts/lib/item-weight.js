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

/* CONSERVATIVE BIAS — the standing rule for every weight in this codebase.
   We honor the freight we quote, so an underestimate is money off our
   margin on every single order, while an overestimate costs at most a
   marginal sale. Estimates therefore lean HIGH: base values are the upper
   end of the realistic range for the category, and these buffers add a
   further margin on top (raised 2026-09-18 from 1.10/1.20). Never lower
   an entry to make a price look better. */
export const CONFIDENCE_BUFFER = { cited: 1.15, reasoned: 1.35 };

export function withBuffer(kg, tier) {
  return Math.round(kg * CONFIDENCE_BUFFER[tier] * 100) / 100;
}

// Checked BEFORE the general table and before the TV branch, because
// "TV Stand" is furniture, not a television.
export const BULKY_WEIGHT_ESTIMATES_KG = [
  { match: /\b(sofa|loveseat|couch|sectional|futon)\b/i, kg: 70 },
  { match: /\b(mattress|box spring|boxspring)\b/i, kg: 40 },
  { match: /\b(bed frame|headboard|bunk bed|platform bed)\b/i, kg: 45 },
  { match: /\b(wardrobe|armoire|china cabinet)\b/i, kg: 60 },
  { match: /\b(dresser|chest of drawers|drawer chest)\b/i, kg: 55 },
  { match: /\b(treadmill|elliptical|exercise bike|weight bench|home gym)\b/i, kg: 90 },
  { match: /\b(refrigerator|fridge|freezer|washer|dryer|dishwasher|range oven|stove)\b/i, kg: 90 },
  { match: /\b(dining table|coffee table|desk|console table|end table|nightstand)\b/i, kg: 40 },
  { match: /\b(tv stand|media console|entertainment center|credenza)\b/i, kg: 35 },
  { match: /\b(bookshelf|bookcase|shelving unit|storage cabinet|cabinet)\b/i, kg: 30 },
  { match: /\b(grill|smoker|bbq)\b/i, kg: 50 },
  { match: /\b(patio set|outdoor set|sofa set|dining set)\b/i, kg: 55 },
  { match: /\b(air conditioner|dehumidifier|space heater)\b/i, kg: 30 },
  { match: /\b(mini fridge|microwave|air fryer)\b/i, kg: 18 },
  { match: /\b(recliner|armchair|accent chair|office chair|dining chair)\b/i, kg: 18 },
  { match: /\b(rug|carpet|area rug)\b/i, kg: 16 },
  { match: /\b(vacuum|stroller|car seat)\b/i, kg: 12 },
  { match: /\b(suitcase|luggage)\b/i, kg: 6 },
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

/* ============================================================
   BILLABLE (VOLUMETRIC) WEIGHT

   Air freight is charged on whichever is greater: what the box weighs, or
   what it would weigh if it were as dense as the carrier's standard —
   L x W x H in cm divided by 5000, the IATA volumetric divisor AVI
   Courier's rate card uses. A pair of over-ear headphones is 0.7kg of
   product in a 25x22x12 box: we are billed for 1.32kg, not 0.7.

   Only rigid, genuinely boxed goods get dimensions here. Apparel and soft
   goods ship compressed in poly bags, so applying a box volume to them
   would inflate freight against the customer for no reason.
   ============================================================ */

export const DIM_DIVISOR_CM3_PER_KG = 5000;

/** Volumetric weight for a box in centimetres, or null if not measurable. */
export function dimensionalWeightKg(lCm, wCm, hCm) {
  const dims = [lCm, wCm, hCm].map(Number);
  if (dims.some((d) => !Number.isFinite(d) || d <= 0)) return null;
  return Math.round((dims[0] * dims[1] * dims[2] / DIM_DIVISOR_CM3_PER_KG) * 100) / 100;
}

/** What the courier actually bills: the heavier of actual and dimensional. */
export function billableWeightKg(actualKg, dimCm) {
  const actual = Number(actualKg);
  if (!Number.isFinite(actual) || actual <= 0) return null;
  const dim = Array.isArray(dimCm) ? dimensionalWeightKg(...dimCm) : null;
  return dim != null && dim > actual ? dim : actual;
}

/* ============================================================
   WEIGHT PARSED FROM THE TITLE

   Retailers put the net weight in the title — "Great Value Gummy Bears
   Chewy Candy, 4 oz" — and we were ignoring it and guessing a category
   instead. Worse, the carousel cards truncate the title on screen
   ("BUBS Swedish Candy ..."), so the one number that mattered was
   invisible to the customer AND unused by us. This reads the FULL title
   from the source record, never the display string.

   Order of authority: a scraped spec weight beats this, this beats a
   category estimate, and a category estimate beats the generic floor.

   TRAPS THIS AVOIDS, all from real titles:
   - "up to 70 inch", "300 lb capacity", "holds 50 lbs" — a limit, not a
     weight. Anything introduced by a capacity word is skipped.
   - "(4 pack) ... 5.5 oz" — the pack count is not a weight; a bare number
     with no unit never matches.
   - "16 fl oz" is a volume, but for food and drink one fluid ounce of
     water is ~1.04 oz by weight, so treating it as oz is right to within
     a rounding error and always errs heavy.
   - A parsed value above MAX_TITLE_WEIGHT_KG is not believed: it is far
     more likely a capacity, a shipping limit or a typo than a 90kg
     grocery item, and the category table handles genuinely heavy goods.
   ============================================================ */
const OZ_TO_KG = 0.0283495;
const LB_TO_KG = 0.453592;

// Packaging is a FLAT addition, never a multiplier: a bag, a box and a
// label weigh about the same whether the contents are 4 oz or 10 oz.
// 60g sits mid-range of the 50-80g the operations side uses for small
// grocery items, so a 4 oz bag of gummy bears lands at ~0.17kg.
export const PACKAGING_ALLOWANCE_KG = 0.06;
export const MAX_TITLE_WEIGHT_KG = 25;

// "(4 pack)", "4-pack", "pack of 4", "paquete de 4" — a real multiplier of
// what is in the box. Capped, because "100 pack" of anything heavy is a
// number to distrust rather than to bill.
const MAX_PACK_COUNT = 24;
function titlePackCount(text) {
  const m = /\(?\b(\d{1,2})\s*[- ]?\s*(?:pack|pk|count|ct|unidades|piezas)\b/i.exec(text)
    || /\b(?:pack|paquete) of\s*(\d{1,2})\b/i.exec(text)
    || /\bpaquete de\s*(\d{1,2})\b/i.exec(text);
  const n = m ? parseInt(m[1], 10) : 1;
  return Number.isFinite(n) && n >= 2 && n <= MAX_PACK_COUNT ? n : 1;
}

const UNIT_SHORT = { "fl oz": "fl oz", "fluid ounce": "fl oz", "fluid ounces": "fl oz",
  ounce: "oz", ounces: "oz", oz: "oz", lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  kg: "kg", kilogram: "kg", kilograms: "kg", gram: "g", grams: "g", g: "g" };
const CAPACITY_BEFORE_RE = /(capacity|capacidad|holds?|supports?|up to|hasta|max(?:imum)?|rated|load|weight limit)\s*(?:of\s*)?[^,;]{0,12}$/i;

/**
 * Net weight stated in a product title, with the unit as written.
 * Returns { kg, netKg, token, grams } or null when the title states none.
 */
export function titleWeight(title) {
  const text = String(title || "");
  if (!text) return null;
  const re = /(\d+(?:[.,]\d+)?)\s*(fl\s*oz|fluid\s*ounces?|ounces?|oz|lbs?|pounds?|kg|kilograms?|grams?|g)\b\.?/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    const before = text.slice(0, match.index);
    if (CAPACITY_BEFORE_RE.test(before)) continue;   // "up to 70 lb" is a limit
    const value = parseFloat(match[1].replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) continue;
    const unit = match[2].toLowerCase().replace(/\s+/g, " ");
    const netKg =
      /^(fl oz|fluid ounce|fluid ounces|ounce|ounces|oz)$/.test(unit) ? value * OZ_TO_KG
      : /^(lb|lbs|pound|pounds)$/.test(unit) ? value * LB_TO_KG
      : /^(kg|kilogram|kilograms)$/.test(unit) ? value
      : value / 1000; // g
    if (!(netKg > 0) || netKg > MAX_TITLE_WEIGHT_KG) continue;
    // "(4 pack) ... 5.5 oz" is 4 x 5.5 oz in one box, and quoting freight
    // for one of them is exactly the underestimate this codebase keeps
    // paying for. The allowance is still flat — one box, one allowance.
    const packs = titlePackCount(text);
    const totalNetKg = netKg * packs;
    if (totalNetKg > MAX_TITLE_WEIGHT_KG) continue;
    const token = `${match[1].replace(",", ".")} ${UNIT_SHORT[unit] || unit}`;
    return {
      netKg: Math.round(totalNetKg * 1000) / 1000,
      kg: Math.round((totalNetKg + PACKAGING_ALLOWANCE_KG) * 1000) / 1000,
      token: packs > 1 ? `${packs} x ${token}` : token,
      packs,
      grams: Math.round(totalNetKg * 1000),
    };
  }
  return null;
}

/** "10 oz / 283 g" — what the card shows, so a truncated title cannot hide it. */
export function titleWeightLabel(title) {
  const parsed = titleWeight(title);
  if (!parsed) return null;
  const grams = parsed.grams;
  const metric = grams >= 1000 ? `${Math.round(grams / 10) / 100} kg` : `${grams} g`;
  return /^(g|kg)$/i.test(parsed.token.split(" ")[1]) ? metric : `${parsed.token} / ${metric}`;
}

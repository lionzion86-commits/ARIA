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

/* Words that look like a big appliance but are not: windshield washer
   fluid is not a washing machine, a hair dryer is not a tumble dryer.
   Caught by test-weight-bounds: a hair dryer matched the appliance row
   and came out at 121.5 kg — $1,580 of freight quoted on a $40 item.
   Guards both the estimate row below and the sanity bound further down. */
const APPLIANCE_IMPOSTOR_RE =
  /\b(washer\s*fluid|windshield\s*washer|windscreen\s*washer|washer\s*(?:nozzle|pump|hose)|rubber\s*washers?|hair\s*dryer|blow\s*dryer|dryer\s*(?:sheets?|balls?|vent))\b/i;

// Checked BEFORE the general table and before the TV branch, because
// "TV Stand" is furniture, not a television.
export const BULKY_WEIGHT_ESTIMATES_KG = [
  { match: /\b(sofa|loveseat|couch|sectional|futon)\b/i, kg: 70 },
  { match: /\b(mattress|box spring|boxspring)\b/i, kg: 40 },
  { match: /\b(bed frame|headboard|bunk bed|platform bed)\b/i, kg: 45 },
  { match: /\b(wardrobe|armoire|china cabinet)\b/i, kg: 60 },
  { match: /\b(dresser|chest of drawers|drawer chest)\b/i, kg: 55 },
  { match: /\b(treadmill|elliptical|exercise bike|weight bench|home gym)\b/i, kg: 90 },
  { match: /\b(refrigerator|fridge|freezer|washer|dryer|dishwasher|range oven|stove)\b/i, not: APPLIANCE_IMPOSTOR_RE, kg: 90 },
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

  /* SPORTING AND OUTDOOR GOODS (2026-09-19).
     Reported: a 12x6ft soccer goal was quoting 1.08 kg of freight — the
     generic fallback (0.8 x the reasoned buffer), because nothing in any
     table matched "Soccer Goal". It was not a bad parse from the
     title-weight change: the same title resolved to the same 1.08 kg
     before that change landed, it simply had no category to land in.
     These are the bulky sports categories a general retailer actually
     sells, with the same conservative bias as everything above. */
  { match: /\b(trampoline)\b/i, kg: 45 },
  { match: /\b(swing set|play ?set|playhouse|jungle gym|climbing frame)\b/i, kg: 55 },
  { match: /\b(ping ?pong|table tennis|foosball|air hockey|pool table)\b/i, kg: 45 },
  { match: /\b(basketball (hoop|system|goal)|backboard)\b/i, kg: 40 },
  { match: /\b(punching bag|heavy bag|boxing bag)\b/i, kg: 35 },
  { match: /\b(lawn ?mower|snow blower)\b/i, kg: 35 },
  { match: /\b(kayak|canoe|paddle ?board)\b/i, kg: 25 },
  { match: /\b(canopy|gazebo|pergola|car ?port)\b/i, kg: 25 },
  { match: /\b(wheelbarrow)\b/i, kg: 20 },
  { match: /\b(weight set|barbell|kettlebell|dumbbell|weight plates?)\b/i, kg: 20 },
  { match: /\b(bicycle|mountain bike|road bike|kids'? bike|bmx|tricycle)\b/i, kg: 16 },
  { match: /\b(above ?ground pool|swimming pool|inflatable pool|pool set)\b/i, kg: 15 },
  { match: /\b(step ladder|extension ladder)\b/i, kg: 12 },
  { match: /\b(hitting mat|golf mat|putting green|golf net|batting cage)\b/i, kg: 12 },
  { match: /\b(garden cart|utility wagon|folding wagon)\b/i, kg: 12 },
  { match: /\b(kick ?scooter|electric scooter)\b/i, kg: 10 },
  { match: /\b(rebounder)\b/i, kg: 10 },
  { match: /\b(cornhole|picnic table|park bench|garden bench|sandbox|see ?saw)\b/i, kg: 13 },
  // Both flagged by the bounds on the first audit run, so they got real
  // rows rather than sitting on the floor the bound gave them.
  { match: /\b(projector screen|movie screen)\b/i, kg: 12 },
  { match: /\b(car cover|vehicle cover)\b/i, kg: 5 },
  { match: /\b(tent)\b/i, kg: 8 },
  // Long but genuinely light — they state feet and weigh almost nothing,
  // which is why they also need a bound of their own below.
  { match: /\b(?:agility|speed|training)\b[^,]{0,30}?\bladder\b/i, kg: 2 },
];

/* A goal is the one sports category where the title reliably states the
   size, and size is most of the weight: a 4ft training goal is a bag of
   plastic tube, a 12ft one is a steel-framed pallet. Read like
   tvWeightKg() does, and checked before the table above. */
export const GOAL_RE = /\b(?:soccer|football|f[uú]tbol|hockey|lacrosse)\s+goals?\b|\bgoals?\s+(?:net|post)s?\b|\bportable\s+goals?\b/i;

/** The largest dimension a title states in feet, or null. */
export function largestFeet(title) {
  const t = String(title || "");
  let max = 0;
  /* "8' x 5' x 2.7'", "6 ft", "12 feet" — but NOT inches. A single
     apostrophe is feet; a doubled one is inches, and reading 28.5'' as
     28 feet is how a basketball came out needing a pallet. */
  /* The leading character is matched and rejected rather than using a
     lookbehind, which Safari only learned in 16.4 — a regex literal the
     browser cannot parse takes the whole page script down with it.
     It exists to stop "BEST 24/7 Foot Care" reading as 7 feet. */
  const unit = /(^|[^\d/.,-])(\d+(?:\.\d+)?)\s*(?:'(?!')|ft\b|feet\b|foot\b)/gi;
  let m;
  while ((m = unit.exec(t))) max = Math.max(max, parseFloat(m[2]));
  // "12 x 6FT" — only the last number carries the unit, but both are feet.
  const pair = /(\d+(?:\.\d+)?)\s*[x\u00d7*]\s*(\d+(?:\.\d+)?)\s*(?:'(?!')|ft\b|feet\b|foot\b)/i.exec(t);
  if (pair) max = Math.max(max, parseFloat(pair[1]), parseFloat(pair[2]));
  return max > 0 ? max : null;
}

export function goalWeightKg(title) {
  const t = String(title || "");
  if (!GOAL_RE.test(t)) return null;
  const ft = largestFeet(t);
  const kg = ft == null ? 14 : ft <= 4 ? 5 : ft <= 6 ? 8 : ft <= 8 ? 13 : ft <= 12 ? 20 : 28;
  return withBuffer(kg, "reasoned");
}

/**
 * Bulky-category weight for a title, or null when nothing matches.
 * Callers fall through to their own general table.
 */
export function bulkyWeightKg(text) {
  const t = String(text || "");
  const goal = goalWeightKg(t);
  if (goal != null) return goal;
  const hit = BULKY_WEIGHT_ESTIMATES_KG.find((p) => p.match.test(t) && !(p.not && p.not.test(t)));
  return hit ? withBuffer(hit.kg, "reasoned") : null;
}

/* ============================================================
   SANITY BOUNDS (2026-09-19) — the tripwire under every estimate.

   The tables above only help for a title they recognise. The soccer goal
   showed what happens when one slips past: it published at 1.08 kg, the
   generic fallback, and we would have honoured $14 of freight on a
   pallet. These bounds are deliberately BROADER than the estimate table —
   they match the kind of thing being sold, not a specific product — so an
   unrecognised title still cannot publish an implausible weight.

   A weight under its floor is NOT silently corrected and forgotten: the
   floor is applied (we must quote something, and under-quoting is money
   off our own margin) AND the item is flagged, so the refresh scripts can
   print it and a human can add a real category row.
   ============================================================ */
export const MIN_PUBLISHABLE_KG = 0.01;

/* A cable "for TV" is not a TV. Shared with sales-sources.js, which uses
   it for the same reason in its own TV branch. */
export const TV_ACCESSORY_RE =
  /\bcable\b|\bcord\b|\bmount\b|\bstand\b|\bremote\b|\bantenna\b|\bbracket\b|\badapter\b|\bconverter\b|\bscreen protector\b/i;

/* Long, and light. These state a length in feet because that is what the
   customer buys them by, and it says nothing about bulk — a 4ft HDMI
   cable is not a 4-foot object in the freight sense. Without this the
   catch-all bound below floored a cable to 4 kg, which is $52 of freight
   on a $20 item: over-quoting loses the sale just as surely as
   under-quoting loses the margin. */
const LONG_BUT_LIGHT_RE =
  /\b(cable|cord|hose|rope|twine|tape|wire|chain|leash|strap|lanyard|ribbon|garland|banner|streamer|string lights?|extension|charger|socks?|sleeve|bandage|wrap)\b/i;


export const WEIGHT_SANITY_BOUNDS = [
  { key: "goal", match: GOAL_RE, minKg: 3 },
  { key: "trampolín/columpio", match: /\b(trampoline|swing set|play ?set|playhouse|jungle gym|climbing frame)\b/i, minKg: 20 },
  { key: "mesa de juego", match: /\b(ping ?pong|table tennis|foosball|air hockey|pool table)\b/i, minKg: 15 },
  { key: "aro de básquet", match: /\b(basketball (hoop|system|goal)|backboard)\b/i, minKg: 10 },
  { key: "equipo de gimnasio", match: /\b(treadmill|elliptical|exercise bike|weight bench|home gym|punching bag|heavy bag|weight set|barbell|kettlebell|weight plates?)\b/i, minKg: 10 },
  { key: "electrodoméstico grande",
    test: (t) => /\b(refrigerator|fridge|freezer|washer|dryer|dishwasher|range oven|stove|air conditioner|dehumidifier|lawn ?mower|snow blower)\b/i.test(t)
      && !APPLIANCE_IMPOSTOR_RE.test(t),
    minKg: 8 },
  { key: "muebles", match: /\b(sofa|loveseat|couch|sectional|futon|mattress|box spring|bed frame|headboard|bunk bed|platform bed|wardrobe|armoire|dresser|chest of drawers|dining table|coffee table|console table|end table|nightstand|tv stand|media console|entertainment center|credenza|bookshelf|bookcase|shelving unit|recliner|armchair)\b/i, minKg: 8 },
  { key: "exterior/camping", match: /\b(kayak|canoe|paddle ?board|canopy|gazebo|pergola|wheelbarrow|above ?ground pool|swimming pool|grill|smoker|bbq)\b/i, minKg: 6 },
  { key: "bicicleta", match: /\b(bicycle|mountain bike|road bike|kids'? bike|bmx|tricycle|kick ?scooter|electric scooter)\b/i, minKg: 6 },
  { key: "televisor",
    test: (t) => /\b(tv|television|televisor)\b/i.test(t) && !TV_ACCESSORY_RE.test(withoutBundledClauses(t)),
    minKg: 4 },
  /* Long AND light: these state their length in feet but are nylon and
     air. Named before the catch-all so it never floors them to 4 kg. */
  { key: "accesorio plegable", match: /\b(?:agility|speed|training)\b[^,]{0,30}?\bladder\b|\b(jump rope|yoga mat|resistance bands?|slip ?n ?slide)\b/i, minKg: 0.3 },
  /* The catch-all, and the one that would have caught the soccer goal
     even with no sports category at all: a title that states a dimension
     of several FEET is not describing something that weighs a kilo. Runs
     last, so a named category's own floor always wins. */
  { key: "artículo de gran tamaño",
    test: (t) => (largestFeet(t) || 0) >= 4 && !LONG_BUT_LIGHT_RE.test(t),
    minKg: 4 },
];

/**
 * Is this weight plausible for what the title is selling?
 *
 * Returns { ok, kg, key, minKg, reason }. `kg` is always the weight to
 * USE: the input when it is fine, the category floor when it is not.
 */
export function weightSanity(title, kg) {
  const t = String(title || "");
  const bound = WEIGHT_SANITY_BOUNDS.find((b) => (b.match ? b.match.test(t) : b.test(t)));
  const n = Number(kg);

  if (!Number.isFinite(n) || n <= 0) {
    const floor = bound ? bound.minKg : MIN_PUBLISHABLE_KG;
    return { ok: false, kg: floor, key: bound ? bound.key : "sin categoría", minKg: floor,
      reason: `peso ausente o cero (${kg}) — no se publica un peso de 0 kg` };
  }
  if (bound && n < bound.minKg) {
    return { ok: false, kg: bound.minKg, key: bound.key, minKg: bound.minKg,
      reason: `${n} kg es implausible para "${bound.key}" (mínimo ${bound.minKg} kg)` };
  }
  return { ok: true, kg: n, key: bound ? bound.key : null, minKg: bound ? bound.minKg : null, reason: null };
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

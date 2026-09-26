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
import { beautyRowFor, PERFUME_RE, beautyBandKg } from "./beauty-weight.js";
import { supplementWeightDetail, SUPPLEMENT_RE } from "./supplement-weight.js";

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
/* FOOTWEAR, BY WHAT IS ACTUALLY IN THE BOX (2026-09-19).

   Reported twice. First: "New Balance 204L" and "Jordan AJ 1 Retro High"
   both quoting 1.08 kg — the generic fallback, because the table only
   knew the words sneaker/shoe/boot and a listing rarely uses them. Then:
   every shoe quoting the SAME weight, which is the same complaint one
   level up. A toddler sneaker and a men's work boot are not one number.

   HONESTY ABOUT WHERE THESE COME FROM: they are reasoned figures —
   typical pair masses for the size, plus the retail shoebox — not
   sourced measurements, and they carry the 'reasoned' buffer
   accordingly. A per-SKU weight from a retailer feed should replace all
   of it, and specWeightKg() already prefers one when a scrape has it.

   ACTUAL SCALE WEIGHT ONLY (2026-09-20). These rows used to carry box
   dimensions and quote max(mass, volumetric) — a shoebox is mostly air,
   so the volumetric figure won every row and a men's boot billed at
   2.76 kg instead of the 2.24 kg it weighs. The courier contract bills
   on the scale reading with no dimensional component at all, so the box
   dimensions are gone and what a pair weighs is the whole answer. */
/* Each tier carries the PLAUSIBLE SHIPPED BAND for its size, not just a
   point estimate — see WEIGHT_SANITY_BOUNDS. One "calzado" band cannot
   serve both a 0.28 kg infant shoe and a 2.24 kg work boot, and a band
   wide enough for both is wide enough to wave through the half-kilo of
   phantom freight this exists to catch. */
export const FOOTWEAR_TIERS = [
  // Size wins over style: a kids' boot ships in a kids' box.
  { key: "bebé",        match: /\b(baby|infant|newborn|crib shoe)\b/i,                        kg: 0.15, bandKg: [0.1, 0.6] },
  { key: "toddler",     match: /\b(toddler|little kids?)\b/i,                                 kg: 0.3,  bandKg: [0.2, 0.9] },
  { key: "niños",       match: /\b(kids?|youth|big kids?|grade school|preschool|junior|boys'?|girls'?)\b/i, kg: 0.55, bandKg: [0.3, 1.3] },
  { key: "bota mujer",  match: /\bwomen'?s\b[^,]{0,40}\bboots?\b|\bboots?\b[^,]{0,40}\bwomen'?s\b/i,   kg: 1.2,  bandKg: [0.8, 2.6] },
  { key: "bota",        match: /\bboots?\b(?!\s*cut)/i,                                       kg: 1.6,  bandKg: [0.9, 3.2] },
  /* Sandals ship in a polybag, not a shoebox, so they never carried the
     shoebox figure in the first place — the shipped weight is stated
     outright. 0.40-0.50 kg is what they actually weigh packed; 0.60 is
     that with the conservative margin, and it replaced a 1.14 kg
     shoebox figure that was quoting S/ 52 of freight on S/ 60 sandals. */
  { key: "sandalia",    match: /\b(sandals?|flip[- ]?flops?|slides?)\b/i,                      kg: 0.45, shippedKg: 0.6, bandKg: [0.2, 1.2] },
  { key: "pantufla",    match: /\b(slippers?)\b/i,                                            kg: 0.4,  bandKg: [0.2, 1.2] },
  { key: "suecos",      match: /\b(clogs?)\b/i,                                               kg: 0.5,  bandKg: [0.3, 1.4] },
  { key: "chimpunes",   match: /\b(cleats?)\b/i,                                              kg: 0.55, bandKg: [0.3, 1.4] },
  { key: "mujer",       match: /\b(women'?s?|womens|ladies|mujer)\b/i,                        kg: 0.65, bandKg: [0.4, 1.4] },
  /* 0.8-1.6 kg is the reported plausible shipped band for a men's
     leather sneaker. The estimator used to answer 1.94 kg here — half a
     kilo of air, about S/ 22 of phantom freight on every pair — because
     it billed the shoebox's volume rather than the shoe's mass. That is
     fixed at source (see ACTUAL SCALE WEIGHT ONLY above, now 1.30 kg);
     this band is the tripwire that would have caught it, and will catch
     the next one. */
  { key: "hombre",      match: /\b(men'?s?|mens|hombre)\b/i,                                  kg: 0.9,  bandKg: [0.8, 1.6] },
];
// No size and no style stated — the middle of the range, not a guess at
// the small end, because under-quoting is money off our own margin.
export const FOOTWEAR_DEFAULT = { key: "calzado", kg: 0.8, bandKg: [0.4, 2.0] };

/* A listing is footwear if it names a shoe, or names a shoe brand or a
   shoe model — Foot Locker's catalogue is model names and almost never
   the word "shoe". */
export const FOOTWEAR_NOUN_RE =
  /\b(sneakers?|trainers?|shoes?|boots?(?!\s*cut)|loafers?|moc toe|slip[- ]ons?|sandals?|flip[- ]?flops?|clogs?|slippers?|cleats?|zapatillas|zapatos)\b/i;
export const FOOTWEAR_BRAND_RE =
  /\b(nike|jordan|adidas|new balance|puma|reebok|converse|vans|asics|crocs|ugg|timberland|brooks|hoka|saucony|fila|skechers|birkenstock|florsheim|dr\.? martens)\b/i;
export const FOOTWEAR_MODEL_RE =
  /\b(air force|air max|air jordan|dunk low|dunk high|\bdunk\b|samba|gazelle|superstar|stan smith|forum low|blazer|pegasus|ultraboost|nmd|chuck taylor|all star|old skool|sk8-hi|classic clog|tasman|retro (?:high|low|mid)|\b(?:530|550|574|990|993|9060|2002r|204l|327)\b)/i;
/* Same brand, different product: clothing, accessories, and the things
   sold NEXT to shoes (racks, cleaners, insoles) are not shoes. */
export const FOOTWEAR_NOT_RE =
  /\b(shirt|tee|t-shirt|hoodie|sweatshirt|crewneck|jacket|windbreaker|pants|joggers|sweatpants|shorts|legging|bra|jersey|socks?|hat|cap|beanie|backpack|bag|duffel|glove|ball|tracksuit|track suit|short sleeve|long sleeve|romper|onesie|swim|towel|laces?|insoles?|cleaner|polish|shoe ?care|shoe ?rack|shoe ?box|organizer|deodorizer|water bottle)\b/i;

export function footwearTierFor(title) {
  const t = String(title || "");
  if (FOOTWEAR_NOT_RE.test(t)) return null;
  if (!FOOTWEAR_NOUN_RE.test(t) && !FOOTWEAR_BRAND_RE.test(t) && !FOOTWEAR_MODEL_RE.test(t)) return null;
  return FOOTWEAR_TIERS.find((x) => x.match.test(t)) || FOOTWEAR_DEFAULT;
}

/** The plausible shipped band for a footwear title, or null. */
export function footwearBandKg(title) {
  const tier = footwearTierFor(title);
  return tier ? (tier.bandKg || FOOTWEAR_DEFAULT.bandKg) : null;
}

export function footwearWeightKg(title) {
  const tier = footwearTierFor(title);
  if (!tier) return null;
  // A tier that states its shipped weight (soft packs) is taken at its word.
  if (tier.shippedKg != null) return tier.shippedKg;
  return withBuffer(tier.kg + PACKAGING_ALLOWANCE_KG, "reasoned");
}

/* ============================================================
   BOOKS AND PAPER GOODS (2026-09-20)

   REPORTED LIVE: a 64-page Hello Kitty colouring book listed at S/ 4.48
   was quoted S/ 47.29 of freight — ten times the price of the book. The
   estimator had no book row of any kind, so the title fell through to
   the generic 1.08 kg placeholder, and there was no band for "libro"
   for the sanity check to argue with. Both halves of that are fixed
   here: a real row so the estimate is right, and a band so the next
   thing that lands in this category cannot quote a kilo of paper.

   TIERED, LIKE FOOTWEAR, AND FOR THE SAME REASON. A stapled activity
   book, a mass-market paperback and a hardcover textbook are an order of
   magnitude apart, and one band wide enough to hold all three is wide
   enough to wave through the exact error this exists to catch. Each tier
   carries the plausible shipped band for its own kind of book.
   ============================================================ */

/* Named first and matched most specifically: a colouring book is the
   lightest thing in the category and the one that was reported. */
export const BOOK_TIERS = [
  { key: "libro para colorear",
    match: /\b(colou?ring|activity|sticker|puzzle|maze|doodle|workbooks?)\b[^,]{0,24}\bbooks?\b|\bbooks?\b[^,]{0,24}\b(colou?ring|activity|sticker)\b|\blibros? para colorear\b/i,
    kg: 0.12, bandKg: [0.05, 0.6] },
  // Comics and magazines are stapled sheets; a graphic novel is a thin
  // paperback and sits in the same place.
  { key: "revista/cómic",
    match: /\b(magazines?|revistas?|comic books?|comics?|manga|graphic novels?)\b/i,
    kg: 0.18, bandKg: [0.05, 0.8] },
  // Board books are cardboard, several times a paperback of the same size.
  { key: "libro de cartón",
    match: /\b(board books?)\b/i,
    kg: 0.35, bandKg: [0.15, 1.2] },
  /* The heavy end: a cookbook or a textbook is the one kind of book that
     legitimately approaches three kilos, which is why the paperback band
     must not be stretched to cover it. */
  { key: "libro de tapa dura",
    match: /\b(hardcovers?|hardbacks?|textbooks?|cookbooks?|recipe books?|coffee ?table books?|encyclopedias?|dictionar(?:y|ies)|atlas(?:es)?)\b/i,
    kg: 0.75, bandKg: [0.3, 3.5] },
  // Paper stationery: a spiral notebook, a planner, a journal. Bound
  // paper, so it belongs here rather than next to the laptops — and the
  // laptop row is exactly what "notebook" used to match.
  { key: "cuaderno/agenda",
    match: /\b(composition|spiral|subject|college ?ruled|wide ?ruled)\b[^,]{0,16}\bnotebooks?\b|\b(journals?|planners?|diar(?:y|ies)|sketchbooks?|cuadernos?|agendas?)\b/i,
    kg: 0.4, bandKg: [0.1, 1.5] },
];

/* No tier stated — a paperback, which is what most of a book catalogue
   is. The band is the widest of the ordinary ones and still an order of
   magnitude below the generic 1.08 kg placeholder this replaces. */
export const BOOK_DEFAULT = { key: "libro", kg: 0.3, bandKg: [0.1, 1.2] };

export const BOOK_RE =
  /\b(books?|libros?|paperbacks?|hardcovers?|hardbacks?|novels?|textbooks?|cookbooks?|workbooks?|magazines?|revistas?|comics?|manga|journals?|planners?|sketchbooks?|cuadernos?|agendas?)\b/i;

/* Things whose names contain "book" and are not books. Every one of
   these has a row of its own — a bookcase is furniture, a book bag is a
   backpack, a MacBook is a laptop — and judging any of them against
   0.3 kg of paper would be the same class of error in reverse.
   "Bookmark" is not a book either, and weighs nothing. */
export const BOOK_IMPOSTOR_RE =
  /\b(book ?bags?|book ?cases?|bookshel(?:f|ves)|book ?ends?|book ?lights?|book ?covers?|book ?marks?|scrapbooks?|macbooks?|chromebooks?|notebook computers?|facebook|e-?readers?|kindle|audiobooks?|coloring pages?)\b/i;

/** The book tier for a title, or null when the title is not a book. */
export function bookTierFor(title) {
  const t = String(title || "");
  if (BOOK_IMPOSTOR_RE.test(t)) return null;
  if (!BOOK_RE.test(t)) return null;
  return BOOK_TIERS.find((x) => x.match.test(t)) || BOOK_DEFAULT;
}

/** The plausible shipped band for a book title, or null. */
export function bookBandKg(title) {
  const tier = bookTierFor(title);
  return tier ? (tier.bandKg || BOOK_DEFAULT.bandKg) : null;
}

/** Shipped weight for a book title, or null when it is not a book. */
export function bookWeightKg(title) {
  const tier = bookTierFor(title);
  if (!tier) return null;
  return withBuffer(tier.kg + PACKAGING_ALLOWANCE_KG, "reasoned");
}

/* BALLS (2026-09-19, reported).

   A Rawlings Official League baseball was quoting 1.08 kg — seven times
   what a baseball weighs (145 g). The first fix put every ball in one
   0.25 kg row, which is better but still guesses: a golf ball and a
   basketball are not the same parcel, and a 12-count is not a 1-count.

   So: the ball's REAL mass, times the count the title states. These
   masses are regulation figures, not estimates, so they take the 'cited'
   buffer. Never the 1.08 kg fallback.

   ACTUAL SCALE WEIGHT ONLY (2026-09-20): these rows used to carry box
   dimensions and bill max(mass, volumetric), because a ball is light for
   its volume. The courier contract has no dimensional component, so the
   box is gone and the mass is the answer. */
export const BALL_SPECS = [
  { match: /\bbaseballs?\b/i, kg: 0.145 },
  { match: /\bsoftballs?\b/i, kg: 0.19 },
  { match: /\btennis balls?\b/i, kg: 0.058 },
  { match: /\bgolf balls?\b/i, kg: 0.046 },
  { match: /\bpickleballs?\b/i, kg: 0.024 },
  { match: /\bbasketballs?\b/i, kg: 0.62 },
  { match: /\b(?:soccer|f[uú]tbol)\s*balls?\b/i, kg: 0.43 },
  { match: /\bvolleyballs?\b/i, kg: 0.27 },
];

export function ballWeightKg(title) {
  const t = String(title || "");
  const hit = BALL_SPECS.find((b) => b.match.test(t));
  if (!hit) return null;
  const packs = titlePackCount(t);
  return withBuffer(hit.kg * packs + PACKAGING_ALLOWANCE_KG, "cited");
}

/* CANDLES: THE WAX-WEIGHT TRAP (2026-09-25). A candle title states the WAX
   weight — "Yankee Candle Large Jar 22 oz" — but the parcel ships the glass
   jar too, roughly another half kilo. Reading 22 oz as the shipped weight
   underquotes freight on every big candle, so candleWeightKg is consulted
   BEFORE the titleWeight stated-weight path in every estimator chain
   (estimateWeightDetail, estimateRetailWeightDetail, resolveItemWeight).

   Figures are shippable weights with the +10% already baked in (large jar
   measured 1.14 kg product / 1.19 kg packaged -> 1.3 kg), so no buffer is
   applied here; multi-packs multiply the single-unit figure. */
export const CANDLE_GATE_RE = /\bcandles?\b|\bwicks?\b|\bwax\b|\bvotives?\b|\btea\s*lights?\b/i;
/* Accessories that are not the candle: a holder ships empty, a warmer
   ships a hot plate. These must return null, never a candle weight. */
export const CANDLE_IMPOSTOR_RE = /\bcandles?\s+(?:holder|sleeve|shade|topper|warmer|lamp)s?\b|\bwax\s+warmer\b|\bsnuffers?\b/i;
export const CANDLE_SPECS = [
  { match: /\bflameless\b|\bled\s+candles?\b/i, kg: 0.3 },
  { match: /\bwax\s*(?:melt|tart)s?\b/i, kg: 0.25 },
  { match: /\bvotives?\b|\btea\s*lights?\b/i, kg: 0.15 },
  { match: /\b3[\s-]*wick\b/i, kg: 1.3 },
  { match: /\blarge\b|\b22\s*oz\b/i, kg: 1.3 },
  { match: /\bmedium\b|\b14\.5\s*oz\b/i, kg: 1.05 },
  { match: /\bsmall\b|\b3\.7\s*oz\b/i, kg: 0.45 },
  { match: /\bpillars?\b/i, kg: 0.55 },
];

export function candleWeightKg(title) {
  const t = String(title || "");
  if (!CANDLE_GATE_RE.test(t)) return null;
  if (CANDLE_IMPOSTOR_RE.test(t)) return null;
  const hit = CANDLE_SPECS.find((b) => b.match.test(t));
  if (!hit) return null;
  return Math.round(hit.kg * titlePackCount(t) * 100) / 100;
}

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

   BANDS, NOT JUST FLOORS (2026-09-20). A floor only catches an estimate
   that is too LIGHT. The other half of the bleed is an estimate that is
   too HEAVY: a men's leather sneaker answered at 1.94 kg against a
   plausible 0.8-1.6, which is half a kilo of air and roughly S/ 22 of
   phantom freight on a single pair. Every bound now carries a maxKg as
   well, and an estimate outside its band FAILS CLOSED — see weightSanity
   and the `needsReview` flag it raises. Nothing renders a freight quote
   from a weight we do not believe; the item goes to manual review, and
   the customer is told the freight is being confirmed rather than shown
   a number that is wrong in either direction.

   A weight outside its band is NOT silently corrected and forgotten.
   Under the floor, the floor is applied for any internal use (we never
   under-quote ourselves); over the ceiling the original figure is kept,
   because clamping DOWN would turn a display problem into a margin loss
   the day some path ignores the flag. Either way the item is flagged and
   the refresh scripts print it.

   BANDS APPLY TO ESTIMATES, NOT TO FACTS. A weight the retailer
   published is a measurement and is never band-checked — see
   resolveItemWeight().
   ============================================================ */
/* THE ONE GENERIC FALLBACK, AND WHY IT IS LOW (2026-09-20).

   There were two. The card and the Ofertas feed used
   withBuffer(0.8, "reasoned") = 1.08 kg; the checkout resolver used 0.6
   and carried a comment claiming the two matched. They did not, and had
   not since the comment was written: an unclassified item got heavier
   between the cart and the payment page. Live, that 1.08 kg charged
   S/ 47.29 of freight on a S/ 40.18 conditioner.

   Now there is one number, and it is the lower of the two. A generic
   fallback is not an estimate — it is the admission that no table
   matched — so it should be small, it should always be labelled "peso
   estimado", it should never be quotable when it would cost more than
   the product (see freightQuotable), and it should reach the review
   queue every time (reviewKind "gap", printed by the refresh scripts).
   Where it is too light we absorb the difference and reconcile it when
   the parcel is weighed in Miami; where it was too heavy we lost the
   sale, which is worse and is what happened. */
export const GENERIC_FALLBACK_KG = 0.6;

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


/* A projector had no row and no bound at all, which is how "5G WiFi
   Bluetooth Projector" published a 0.065 kg freight quote. The band is
   deliberately wide — a pocket pico projector and a 4K home-theatre unit
   are genuinely far apart — because its job is to catch nonsense, not to
   price the category. The category rows do that. */
export const PROJECTOR_RE = /\b(projectors?|proyectores?|proyector)\b/i;
const PROJECTOR_ACCESSORY_RE = /\b(screen|pantalla|mount|soporte|bracket|lamp|bulb|l[áa]mpara|case|funda|stand|tr[ií]pode|tripod|cable)\b/i;

export const WEIGHT_SANITY_BOUNDS = [
  /* Beauty runs FIRST and low. A cosmetic is the one category on this
     site that legitimately weighs 20 grams, and several fragrance houses
     share a name with a shoe brand ("Puma Energy Eau de Toilette"), so
     without this row a perfume could be floored to the calzado minimum
     and quoted as a pair of trainers. */
  { key: "belleza", test: (t) => beautyRowFor(t) != null || PERFUME_RE.test(t), band: beautyBandKg },
  /* SUPPLEMENTS RUN EARLY AND LOW, for the same reason beauty does.
     REPORTED LIVE: a 180-softgel bottle and a 5 fl oz liquid both quoted
     0.68 kg — one coarse category row serving a whole aisle. A vitamin
     bottle above half a kilo is a bottle we have got wrong, so the
     ceiling is where the smell starts and anything past it fails closed
     into review rather than quoting. Protein tubs are excluded from the
     table itself (SUPPLEMENT_BULK_RE) and so are not judged here. */
  { key: "suplemento", test: (t) => supplementWeightDetail(t) != null, minKg: 0.02, maxKg: 0.5 },
  /* Books run early and light, for the same reason beauty does: a
     colouring book weighs 120 grams, and every catch-all bound below it
     is written for objects that weigh kilos. Tier-aware, so a paperback
     is judged against 0.1-1.2 and a textbook against 0.3-3.5 — see
     BOOK_TIERS for the reported case this came from. */
  { key: "libro", test: (t) => bookTierFor(t) != null, band: bookBandKg },
  { key: "goal", match: GOAL_RE, minKg: 3, maxKg: 45 },
  { key: "trampolín/columpio", match: /\b(trampoline|swing set|play ?set|playhouse|jungle gym|climbing frame)\b/i, minKg: 20, maxKg: 130 },
  { key: "mesa de juego", match: /\b(ping ?pong|table tennis|foosball|air hockey|pool table)\b/i, minKg: 15, maxKg: 130 },
  { key: "aro de básquet", match: /\b(basketball (hoop|system|goal)|backboard)\b/i, minKg: 10, maxKg: 90 },
  { key: "equipo de gimnasio", match: /\b(treadmill|elliptical|exercise bike|weight bench|home gym|punching bag|heavy bag|weight set|barbell|kettlebell|weight plates?)\b/i, minKg: 10, maxKg: 220 },
  { key: "electrodoméstico grande",
    test: (t) => /\b(refrigerator|fridge|freezer|washer|dryer|dishwasher|range oven|stove|air conditioner|dehumidifier|lawn ?mower|snow blower)\b/i.test(t)
      && !APPLIANCE_IMPOSTOR_RE.test(t),
    minKg: 8, maxKg: 220 },
  { key: "muebles", match: /\b(sofa|loveseat|couch|sectional|futon|mattress|box spring|bed frame|headboard|bunk bed|platform bed|wardrobe|armoire|dresser|chest of drawers|dining table|coffee table|console table|end table|nightstand|tv stand|media console|entertainment center|credenza|bookshelf|bookcase|shelving unit|recliner|armchair)\b/i, minKg: 8, maxKg: 160 },
  { key: "exterior/camping", match: /\b(kayak|canoe|paddle ?board|canopy|gazebo|pergola|wheelbarrow|above ?ground pool|swimming pool|grill|smoker|bbq)\b/i, minKg: 6, maxKg: 90 },
  { key: "bicicleta", match: /\b(bicycle|mountain bike|road bike|kids'? bike|bmx|tricycle|kick ?scooter|electric scooter)\b/i, minKg: 6, maxKg: 45 },
  /* Lowered from 0.4 to 0.2 when dimensional billing was removed
     (2026-09-20): 0.4 came from a baby shoe box's ~0.47 kg dimensional
     figure, and on actual scale weight the same box is 0.28 kg. Leaving
     the old floor in place would have flagged and re-inflated every
     infant shoe. "Boot Cut Jeans" is excluded by the regex itself. */
  /* Tier-aware: the band comes from the same tier that produced the
     estimate, so a men's sneaker is judged against 0.8-1.6 and an infant
     shoe against 0.1-0.6. `test` rather than `match` because a shoe is
     often listed by brand or model alone ("New Balance 204L"), which
     FOOTWEAR_NOUN_RE cannot see but footwearTierFor() can. */
  { key: "calzado", test: (t) => footwearTierFor(t) != null, band: footwearBandKg },
  /* A projector, and not a projector screen, lamp or mount — those are
     their own objects and two of them already have rows elsewhere. */
  { key: "proyector",
    test: (t) => PROJECTOR_RE.test(t) && !PROJECTOR_ACCESSORY_RE.test(t),
    minKg: 0.5, maxKg: 12 },
  /* No "televisor" row: Danny banned TVs and TV mounts outright (2026-09-26),
     so no television can ever reach the estimator — and the row's \btv\b
     could only misfire on the parcel accessories that stay (Apple TV).
     TV stands weigh as furniture through the default bands. */
  /* Long AND light: these state their length in feet but are nylon and
     air. Named before the catch-all so it never floors them to 4 kg. */
  { key: "accesorio plegable", match: /\b(?:agility|speed|training)\b[^,]{0,30}?\bladder\b|\b(jump rope|yoga mat|resistance bands?|slip ?n ?slide)\b/i, minKg: 0.3, maxKg: 6 },
  /* The catch-all, and the one that would have caught the soccer goal
     even with no sports category at all: a title that states a dimension
     of several FEET is not describing something that weighs a kilo. Runs
     last, so a named category's own floor always wins. */
  { key: "artículo de gran tamaño",
    test: (t) => (largestFeet(t) || 0) >= 4 && !LONG_BUT_LIGHT_RE.test(t),
    minKg: 4, maxKg: 250 },
];

/** The plausible band for a title, or null when no bound claims it. */
export function bandFor(title) {
  const t = String(title || "");
  const bound = WEIGHT_SANITY_BOUNDS.find((b) => (b.match ? b.match.test(t) : b.test(t)));
  if (!bound) return null;
  // A bound can name its band outright, or compute it (footwear, where
  // the band belongs to the size tier rather than to "shoes" in general).
  const pair = typeof bound.band === "function" ? bound.band(t) : null;
  const minKg = pair ? pair[0] : bound.minKg;
  const maxKg = pair ? pair[1] : (bound.maxKg ?? null);
  return { key: bound.key, minKg, maxKg };
}

/**
 * Is this weight plausible for what the title is selling?
 *
 * Returns { ok, outOfBand, kg, key, minKg, maxKg, reason }.
 *
 * `kg` is the weight to USE INTERNALLY — never a number to render a
 * freight quote from when `outOfBand` is true. Below the floor it is
 * raised to the floor (we must have a figure, and under-quoting is money
 * off our own margin); above the ceiling the ORIGINAL is kept, because
 * quietly clamping down would turn a display problem into a real loss
 * the first time some path forgets to check the flag.
 *
 * `outOfBand` is the fail-closed signal: the caller must flag the item
 * for manual review and must not print a freight figure for it.
 */
export function weightSanity(title, kg) {
  const band = bandFor(title);
  const n = Number(kg);
  const key = band ? band.key : "sin categoría";
  const range = band && band.maxKg != null ? `${band.minKg}–${band.maxKg} kg` : `mínimo ${band?.minKg} kg`;

  if (!Number.isFinite(n) || n <= 0) {
    const floor = band ? band.minKg : MIN_PUBLISHABLE_KG;
    return { ok: false, outOfBand: true, kg: floor, key, minKg: floor, maxKg: band?.maxKg ?? null,
      reason: `peso ausente o cero (${kg}) — no se publica un peso de 0 kg` };
  }
  if (band && n < band.minKg) {
    return { ok: false, outOfBand: true, kg: band.minKg, key, minKg: band.minKg, maxKg: band.maxKg,
      reason: `${n} kg está por debajo de la banda plausible de "${key}" (${range})` };
  }
  if (band && band.maxKg != null && n > band.maxKg) {
    return { ok: false, outOfBand: true, kg: n, key, minKg: band.minKg, maxKg: band.maxKg,
      reason: `${n} kg está por encima de la banda plausible de "${key}" (${range})` };
  }
  return { ok: true, outOfBand: false, kg: n, key: band ? key : null,
    minKg: band?.minKg ?? null, maxKg: band?.maxKg ?? null, reason: null };
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

/* FREIGHT SHARE — TWO LINES, NOT ONE (2026-09-20).

   There used to be a single 30% SUPPRESSION threshold: a deal whose
   freight exceeded a third of its price simply vanished from Ofertas.
   That hid the cost rather than disclosing it, which is the opposite of
   the argument this shop is built on. It is replaced by two named lines,
   and the deliberately ambiguous MAX_FREIGHT_SHARE alias is gone with
   it — with two thresholds in play, a name that does not say which one
   it means is how they drift apart.

   ONE LINE IS LEFT (2026-09-21), and the badge line is gone with the
   badge. FREIGHT_BADGE_SHARE fired at 50% of price, which meant it fired
   on CHEAP items rather than HEAVY ones: a 0.23 kg t-shirt at S/ 25.29
   with S/ 10.07 of freight wore "Flete alto", and S/ 10.07 is not a high
   freight bill by any measure a shopper would recognise. The share was
   the wrong quantity to threshold, so moving the threshold would not
   have helped. Freight is itemised on every card either way, which is
   the disclosure the shop actually promises.

     any share    an ordinary deal. Freight is itemised, as always.
     over 100%    freight costs more than the product. Still listed in
                  search, in its category and in its store — but NOT
                  FEATURABLE as a deal. Ofertas is the one surface that
                  promotes a product, and calling something a bargain
                  when getting it here costs more than the thing itself
                  is not a claim we can stand behind.

   The ceiling only decides what Ofertas may FEATURE. It never labels a
   product, never hides one and never blocks a purchase: a shopper who
   wants the item can find it, see exactly what the freight is, and buy
   it. A future heavy-item indicator triggers on ABSOLUTE freight and
   reads as neutral information — never a share of price, never a
   warning. */
export const FREIGHT_FEATURE_CEILING = 1.00;

/* A SHARE IS COMPUTED ON THE NUMBERS THE SHOPPER CAN SEE (2026-09-20).

   REPORTED LIVE: a card showing S/ 25.29 and S/ 10.07 of freight — 40%,
   comfortably under the 50% line — was wearing the "Flete alto" badge.
   Two separate things were wrong with it. The first was the threshold,
   and the badge has since been removed outright because a share of
   price was the wrong quantity to threshold at all. The second survives
   the badge, because the feature ceiling still divides by a price:

        the share was divided by the RAW scraped price while the card
        printed the DISPLAYED one. Over the $200 import-tax threshold
        those are not the same number: a $250 item prints $307.50 and the
        badge was being decided on $250. A smaller denominator means a
        bigger share, so the badge fired on a ratio the shopper could not
        reproduce from anything in front of them — and a warning nobody
        can check is worse than no warning.

   So a share is freight over the price ON THE CARD. Anyone can divide
   the two numbers they see and land on the same answer we did. This is
   the same rule doorToDoorUsd() sorts by, for the same reason. */
export const IMPORT_TAX_THRESHOLD_USD = 200;
export const IMPORT_TAX_RATE = 0.23;

/** What a card prints for a product: with import tax over the threshold. */
export function shownPriceUsd(priceUsd) {
  const price = Number(priceUsd);
  if (!Number.isFinite(price) || price <= IMPORT_TAX_THRESHOLD_USD) return price;
  return Math.round(price * (1 + IMPORT_TAX_RATE) * 100) / 100;
}

/** Share of the price the shopper sees that freight represents. */
export function freightShare(weightKg, priceUsd, chargePerKg) {
  const price = shownPriceUsd(priceUsd);
  if (!Number.isFinite(price) || price <= 0) return Infinity;
  return freightUsd(weightKg, chargePerKg) / price;
}

/* ============================================================
   ONE RULE FOR "WE WILL NOT QUOTE THIS FREIGHT"

   REPORTED LIVE (2026-09-20): a conditioner's product page said "Flete
   por confirmar — lo cotizamos antes de que pagues", and the cart then
   charged S/ 47.29 of freight on the same S/ 40.18 item. Two surfaces,
   two different rules, and the one that took the money was the one that
   had not been told.

   The card had the newer rule (an unbelievable weight, OR a generic
   guess whose freight exceeds the product's own price) and the cart and
   checkout still had only the older half of it. So the rule lives here
   now, in one function, and every surface that could print a freight
   figure asks it: the card, the cart, and the checkout resolver.

   A PROMISE NEEDS A MECHANISM. "Lo cotizamos antes de que pagues" is
   only honest because checkout actually stops: an unquotable line
   withholds the total and disables Pagar until a human confirms the
   freight (see checkout.html's weightReview branch and the cart's own
   blocked button). The copy and the behaviour are the same fact.
   ============================================================ */

/**
 * May we print a freight figure for this item?
 *
 * @param {object} detail  an estimate from estimateWeightDetail() /
 *                         resolveItemWeight(): { kg, needsReview, reviewKind }
 * @param {number} priceUsd  the product price the shopper is seeing
 * @returns {{ quotable: boolean, reason: string|null }}
 */
export function freightQuotable(detail, priceUsd, chargePerKg) {
  if (!detail) return { quotable: true, reason: null };

  // A weight outside its category's plausible band is not a number to
  // build a price on, in either direction.
  if (detail.needsReview) {
    return { quotable: false, reason: detail.reviewReason || detail.reason || "peso fuera de banda" };
  }

  /* A GENERIC GUESS THAT COSTS MORE THAN THE PRODUCT. A "gap" is
     quotable by design — most of the time the generic estimate is
     roughly right, and saying nothing is worse. But when that guess
     produces a freight bill larger than the item itself, the guess is
     doing all the work and none of it is knowledge. */
  if (detail.reviewKind === "gap" || detail.source === "fallback") {
    const share = freightShare(detail.kg, priceUsd, chargePerKg);
    if (share > FREIGHT_FEATURE_CEILING) {
      return {
        quotable: false,
        reason: `estimado genérico de ${detail.kg} kg: el flete supera el precio del producto`,
      };
    }
  }

  return { quotable: true, reason: null };
}

/**
 * True when freight costs more than the product does.
 *
 * The item stays listed and badged everywhere else — this only decides
 * that Ofertas may not FEATURE it as a deal.
 */
export function freightAboveFeatureCeiling(weightKg, priceUsd, chargePerKg) {
  return freightShare(weightKg, priceUsd, chargePerKg) > FREIGHT_FEATURE_CEILING;
}

/* ============================================================
   ACTUAL SCALE WEIGHT ONLY (2026-09-20)

   This file used to hold a dimensional-weight helper, a billable-weight
   helper and a 5000 cm3/kg IATA divisor, and every rigid boxed category
   quoted whichever of mass and dimensional weight was larger.

   That is gone. The courier contract bills on the ACTUAL SCALE WEIGHT of
   the parcel, with no dimensional component and no exceptions, so
   quoting a customer for air was charging them for something we are
   never billed for. If the contract ever changes, this is one function
   and one multiplication — do not reintroduce it speculatively.
   ============================================================ */

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
   - "5G WiFi Bluetooth Projector" — REPORTED LIVE 2026-09-20. The "5G"
     cellular spec parsed as five grams, and a projector shipped a freight
     quote built on 0.065 kg. A bare "G" after a single digit is a radio
     generation, not a unit of mass, in every catalogue on earth; 2G-6G
     are refused outright. Two to six grams is also below anything this
     estimator needs to tell apart from its category row, so nothing real
     is lost. "802.11g" is refused too, by the boundary rule below.
   - A unit must be a STANDALONE token. The number may not be preceded by
     a word character, a dot, a dash or a slash, so a version string, a
     model code or a dotted spec cannot donate its digits to a weight.
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
export const MAX_PACK_COUNT = 24;
export function titlePackCount(text) {
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
/* A radio generation, not a mass. The leading boundary is matched and
   rejected rather than using a lookbehind, which Safari only learned in
   16.4 — a regex literal the browser cannot parse takes the whole page
   script down with it (same reason largestFeet() is written this way). */
export const NETWORK_GENERATION_RE = /(^|[^\w.,\-/])([2-6])\s*G\b/i;

/* "802.11g" / "802.11ac" — a WiFi standard. The boundary rule cannot
   catch it (the number starts the token) and it parsed as 802 grams of
   router. Named here because it is a real title, not a hypothetical. */
export const WIFI_STANDARD_RE = /\b802\.11\s*[abgnxac]{1,2}\b/i;

/** True when a number+unit pair is really a cellular spec like "5G". */
export function isNetworkGenerationToken(value, unit) {
  return unit === "g" && Number.isInteger(value) && value >= 2 && value <= 6;
}

export function titleWeight(title) {
  const text = String(title || "");
  if (!text) return null;
  /* The leading group is a BOUNDARY, matched and thrown away: a unit only
     counts when its number starts a token. Without it "802.11g" reads as
     eleven grams of WiFi. Group 2 is the number, group 3 the unit. */
  const re = /(^|[^\w.\-/])(\d+(?:[.,]\d+)?)\s*(fl\s*oz|fluid\s*ounces?|ounces?|oz|lbs?|pounds?|kg|kilograms?|grams?|g)\b\.?/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    const before = text.slice(0, match.index + match[1].length);
    if (CAPACITY_BEFORE_RE.test(before)) continue;   // "up to 70 lb" is a limit
    const value = parseFloat(match[2].replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) continue;
    const unit = match[3].toLowerCase().replace(/\s+/g, " ");
    // "5G WiFi", "4G LTE" — a radio generation, never five grams.
    if (isNetworkGenerationToken(value, unit)) continue;
    if (WIFI_STANDARD_RE.test(match[0])) continue;   // "802.11g" is a protocol
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
    const token = `${match[2].replace(",", ".")} ${UNIT_SHORT[unit] || unit}`;
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

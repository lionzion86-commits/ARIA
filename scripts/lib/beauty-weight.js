/* ============================================================
   BEAUTY & FRAGRANCE — SHIPPED WEIGHTS (2026-09-20)

   WHY THIS EXISTS
   Nothing in the general-retail tables knew what a lipstick is. Every
   cosmetic that reached the estimator fell through to the generic
   DEFAULT_RETAIL_WEIGHT_KG floor — 1.08 kg for a 4-gram mascara, which is
   $14 of freight on an $11 product. With Sephora and Victoria's Secret
   coming online that stops being an edge case and becomes most of the
   catalogue.

   WHAT THE NUMBERS ARE
   TYPICAL SHIPPED weight: product + its own container + the retail box +
   a small packing allowance, rounded up conservatively. They are the
   figures the operations side signed off on, not scraped measurements,
   and they are already all-in — nothing else is added on top of them.

   WHEN THEY APPLY
   Only when the retailer does not state a weight. A real spec weight from
   the retailer always wins (specWeightKg, _weight-resolve.js) — that rule
   is unchanged.

   ... BUT THEY DO BEAT A WEIGHT PARSED OUT OF THE TITLE, and that is
   deliberate. "Versace Eros EDT 3.4 oz" states the VOLUME OF LIQUID, not
   what ships: the glass, the cap and the box are most of the mass. Read
   as a weight it gives 0.16 kg for a bottle that really ships at 0.35 kg,
   so for beauty the table is checked BEFORE titleWeight(). Everywhere
   else, a stated title weight still wins.

   PACKAGING IS CONFIG, NOT A CONSTANT (rule 5 of the brief)
   Small cosmetics ship in a polybag — no box, no overhead beyond the
   table value (same principle as the sandals polybag fix). Fragile goods
   (glass bottles, pressed palettes, nail polish, perfume) may need a
   protective carton. Nobody knows what that costs yet; it gets calibrated
   from the first real test order. So every row declares which pack it
   uses and BEAUTY_PACK_ALLOWANCE_KG holds the allowance per pack type —
   both currently 0. Tune that object, not the rows.
   ============================================================ */

/* Per-pack-type allowance ADDED ON TOP of a row's shipped weight, in kg.
   Both are 0 today: the table values are already all-in, and rule 4 of
   the brief is explicit that small cosmetics get no packaging overhead
   beyond them. This is the single dial to turn once a real test order has
   been weighed — e.g. { polybag: 0, carton: 0.05 }. */
export const BEAUTY_PACK_ALLOWANCE_KG = {
  polybag: 0,
  carton: 0,
};

/* A beauty title that matches no row at all. NEVER the old 1.08 kg
   generic — a cosmetic we cannot name is still a cosmetic, and 0.05 kg
   (a lipstick) is the honest middle of this catalogue. */
export const BEAUTY_DEFAULT_KG = 0.05;

/* Courier contract clause: no shipment may carry more than four
   fragrances. Alcohol-based fragrance is a restricted air-freight
   commodity and the consolidator's allowance per parcel is four units.
   Surfaced in the UI, not buried — see the cart and the beauty pages. */
export const MAX_FRAGRANCES_PER_SHIPMENT = 4;

/* ------------------------------------------------------------
   DETECTION

   Titles come in English (the retailer's own) and Spanish (our own copy,
   the assistant, and anything typed by a shopper). Both are matched.
   ------------------------------------------------------------ */

/* Words that borrow a beauty term for something that is not beauty at
   all. "Protein powder" is not a face powder; "esmalte" on its own is
   enamel paint. Without this guard a 2 lb tub of whey would quote as an
   80-gram compact. */
export const BEAUTY_IMPOSTOR_RE =
  /\b(protein|whey|creatine|collagen|drink mix|laundry|detergent|dish(?:washer|washing)?|bleach|baby powder|talcum|talco|washing powder|powdered (?:sugar|milk|drink)|hot cocoa|cocoa powder|garlic powder|onion powder|chili powder|protein[- ]?bar)\b/i;

/* Ordered most specific first — the first row whose pattern matches wins,
   exactly like BULKY_WEIGHT_ESTIMATES_KG. `kg` is the shipped weight;
   `pack` selects the (currently zero) allowance above. */
export const BEAUTY_FALLBACK_KG = [
  /* --- eyes --------------------------------------------------- */
  // A pro palette states its pan count or calls itself "pro"/"XL". Read
  // before the small-palette row, which is the general case.
  { key: "paleta de sombras grande",
    match: /\b(?:3[5-9]|[4-9]\d|1\d\d)\s*(?:-|\s)?(?:pan|colou?r|shade|tono|color)s?\b|\b(?:pro|xl|mega|jumbo)\s+(?:eyeshadow\s+)?(?:palette|paleta)\b/i,
    needs: /\b(eye ?shadow|shadow|sombra|palette|paleta)\b/i,
    kg: 0.30, pack: "carton" },
  { key: "paleta de sombras",
    match: /\b(eye ?shadow|shadow|sombras?)\b[^,]{0,24}\b(palette|paleta)\b|\b(palette|paleta)\b[^,]{0,24}\b(eye ?shadow|shadow|sombras?)\b/i,
    kg: 0.10, pack: "carton" },
  { key: "sombra individual",
    match: /\b(eyeshadow|eye shadow|sombra de ojos|sombras de ojos)\b/i,
    kg: 0.03, pack: "polybag" },
  // A liquid/felt-tip liner is a different object from a wooden pencil,
  // and the title always says which.
  { key: "delineador líquido",
    match: /\b(liquid eyeliner|eyeliner pen|felt[- ]?tip liner|delineador l[ií]quido|delineador en pluma)\b/i,
    kg: 0.03, pack: "polybag" },
  { key: "delineador en lápiz",
    match: /\b(eyeliner|eye liner|kohl|kajal|delineador)\b/i,
    kg: 0.02, pack: "polybag" },
  { key: "máscara de pestañas",
    match: /\b(mascara|rimel|r[ií]mel|pestañina|pesta[ñn]ina)\b/i,
    kg: 0.05, pack: "polybag" },

  /* --- lips ---------------------------------------------------- */
  { key: "labial líquido / brillo",
    match: /\b(liquid lipstick|lip ?gloss|lip ?oil|lip ?lacquer|brillo labial|labial l[ií]quido|gloss labial|aceite labial)\b/i,
    kg: 0.05, pack: "polybag" },
  { key: "labial",
    match: /\b(lipstick|lip ?stick|lip ?balm|lip ?tint|lip ?crayon|labial|b[áa]lsamo labial|tinte labial)\b/i,
    kg: 0.05, pack: "polybag" },

  /* --- face ---------------------------------------------------- */
  { key: "corrector",
    match: /\b(concealer|corrector)\b/i,
    kg: 0.05, pack: "polybag" },
  // Glass pump bottle — heavier than everything above it.
  { key: "base de maquillaje",
    match: /\b(foundation|base de maquillaje|base l[ií]quida)\b/i,
    needs: /\b(foundation|base)\b/i,
    not: /\b(foundation (?:repair|crack|vent|wall)|bed foundation|mattress foundation)\b/i,
    kg: 0.15, pack: "carton", refMl: 30 },
  { key: "polvo / rubor / bronceador",
    match: /\b(pressed powder|setting powder|loose powder|face powder|compact powder|blush|bronzer|highlighter|contour|polvo compacto|polvos? (?:sueltos?|compactos?|traslúcidos?)|rubor|colorete|bronceador|iluminador)\b/i,
    kg: 0.08, pack: "carton" },
  { key: "spray fijador",
    match: /\b(setting spray|makeup setting|fixing spray|spray fijador|fijador de maquillaje|bruma fijadora)\b/i,
    kg: 0.15, pack: "carton", refMl: 118 },

  /* --- nails --------------------------------------------------- */
  { key: "esmalte de uñas",
    match: /\b(nail ?polish|nail ?lacquer|nail ?enamel|gel polish|esmalte de u[ñn]as|esmalte para u[ñn]as)\b/i,
    kg: 0.05, pack: "carton", refMl: 15 },

  /* --- skincare ------------------------------------------------ */
  // Glass dropper bottle.
  { key: "sérum",
    match: /\b(serum|s[ée]rum|suero facial|ampolla)\b/i,
    kg: 0.10, pack: "carton", refMl: 30 },
  // A 50 ml jar is the heaviest thing on this list that is not a bottle:
  // most of the mass is the glass.
  { key: "crema hidratante",
    match: /\b(moisturi[sz]er|moisturi[sz]ing (?:cream|lotion|gel)|face cream|night cream|day cream|gel cream|crema hidratante|hidratante facial|crema facial|crema de noche|crema de d[ií]a)\b/i,
    kg: 0.20, pack: "carton", refMl: 50 },

  /* --- EXTENSIONS beyond the brief's 18 rows -------------------
     Victoria's Secret's catalogue is overwhelmingly body mists and
     lotions, and neither has a row above. Falling to BEAUTY_DEFAULT_KG
     would quote 0.05 kg for a 250 ml bottle — the exact class of error
     this file exists to stop — so both get a real row, sized the same
     conservative way as everything else. Flagged here as extensions so
     they are easy to find when the brief's table is next revised. */
  { key: "bruma corporal",
    match: /\b(body mist|body splash|fragrance mist|bruma corporal|body spray)\b/i,
    kg: 0.35, pack: "carton", refMl: 250 },
  { key: "loción / crema corporal",
    match: /\b(body lotion|body cream|body butter|hand cream|loci[óo]n corporal|crema corporal|manteca corporal|crema de manos)\b/i,
    kg: 0.35, pack: "carton", refMl: 236 },
];

/* PERFUME sizes its own row: the bottle is most of the weight and the
   title always states the volume, so reading it is strictly better than
   one flat number for 30 ml and 100 ml alike. */
export const PERFUME_RE =
  /\b(perfume|parfum|eau de parfum|eau de toilette|eau de cologne|cologne|colonia|fragancia|fragrance|\bedp\b|\bedt\b|\bedc\b)\b/i;

/* Perfume shipped weights, by bottle volume in ml. Checked in order. */
export const PERFUME_TIERS_ML = [
  { maxMl: 35, kg: 0.15 },    // 30 ml / 1 oz
  { maxMl: 60, kg: 0.25 },    // 50 ml / 1.7 oz
  { maxMl: Infinity, kg: 0.35 }, // 100 ml / 3.4 oz and up
];
/* No volume in the title. 50 ml is far and away the most common retail
   size, so this is the middle of the range rather than a guess at either
   end — the same reasoning FOOTWEAR_DEFAULT uses. */
export const PERFUME_DEFAULT_KG = 0.25;

const ML_PER_FL_OZ = 29.5735;

/** Bottle volume in ml stated in a title ("50ml", "1.7 oz"), or null. */
export function titleVolumeMl(title) {
  const t = String(title || "");
  const ml = /(\d+(?:[.,]\d+)?)\s*(?:ml|mL|millilit\w*|mililitros?)\b/i.exec(t);
  if (ml) {
    const n = parseFloat(ml[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const oz = /(\d+(?:[.,]\d+)?)\s*(?:fl\.?\s*oz|oz\.?|ounces?|onzas?)\b/i.exec(t);
  if (oz) {
    const n = parseFloat(oz[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return Math.round(n * ML_PER_FL_OZ * 10) / 10;
  }
  return null;
}

/** True when a title is a fragrance the courier's 4-per-shipment clause covers. */
export function isFragrance(title) {
  const t = String(title || "");
  if (BEAUTY_IMPOSTOR_RE.test(t)) return false;
  // A body mist is alcohol-based fragrance, so it counts against the
  // same allowance even though it is not sold as "perfume".
  return PERFUME_RE.test(t) || /\b(body mist|body splash|fragrance mist|bruma corporal)\b/i.test(t);
}

/** Shipped weight for a perfume title, or null when it is not one. */
export function perfumeWeightKg(title) {
  const t = String(title || "");
  if (!PERFUME_RE.test(t) || BEAUTY_IMPOSTOR_RE.test(t)) return null;
  const ml = titleVolumeMl(t);
  if (ml == null) return PERFUME_DEFAULT_KG;
  return (PERFUME_TIERS_ML.find((x) => ml <= x.maxMl) || PERFUME_TIERS_ML[PERFUME_TIERS_ML.length - 1]).kg;
}

/* Generic "this is a beauty product" markers, for titles that name no
   specific item. These never pick a weight on their own — they are only
   what lets BEAUTY_DEFAULT_KG fire instead of the 1.08 kg generic. */
export const BEAUTY_CATEGORY_RE =
  /\b(makeup|make[- ]?up|cosmetics?|skin ?care|beauty|maquillaje|cosm[ée]tic\w*|belleza|cuidado de la piel|primer|prebase|toner|t[óo]nico|micellar|micelar|cleanser|limpiador facial|sunscreen|protector solar|face mask|mascarilla|exfoliant|exfoliante|eye cream|contorno de ojos|brow|cejas|lash|pesta[ñn]as|nail|u[ñn]as|fragrance|fragancia|perfume)\b/i;

/** Retailers whose whole catalogue is beauty — their items are beauty by origin. */
export const BEAUTY_RETAILERS = new Set(["sephora", "victoriassecret"]);

/** Scraped department buckets that hold beauty. */
export const BEAUTY_DEPARTMENTS = new Set(["beauty", "fragrance", "skincare", "makeup"]);

/**
 * Is this title (or its origin) beauty at all?
 *
 * `hints` lets a caller add what the title cannot say: the retailer it
 * came from, or the department bucket it was scraped into.
 */
export function isBeautyItem(title, hints = {}) {
  const t = String(title || "");
  if (BEAUTY_IMPOSTOR_RE.test(t)) return false;
  if (BEAUTY_RETAILERS.has(String(hints.retailer || "").toLowerCase())) return true;
  if (BEAUTY_DEPARTMENTS.has(String(hints.department || "").toLowerCase())) return true;
  if (BEAUTY_CATEGORY_RE.test(t)) return true;
  return beautyRowFor(t) != null;
}

/** The table row a title matches, or null. */
export function beautyRowFor(title) {
  const t = String(title || "");
  if (!t || BEAUTY_IMPOSTOR_RE.test(t)) return null;
  return BEAUTY_FALLBACK_KG.find(
    (r) => r.match.test(t) && (!r.needs || r.needs.test(t)) && !(r.not && r.not.test(t)),
  ) || null;
}

/**
 * Shipped weight for a beauty title, with its reasoning, or null when the
 * title is not beauty at all.
 *
 * { kg, key, pack } — `key` is the Spanish row name shown in the review
 * queue, "belleza (sin fila)" for the 0.05 kg catch-all.
 */
export function beautyWeightDetail(title, hints = {}) {
  const t = String(title || "");
  if (!t || BEAUTY_IMPOSTOR_RE.test(t)) return null;

  const perfume = perfumeWeightKg(t);
  if (perfume != null) {
    return { kg: beautyRound2(perfume + packAllowance("carton")), key: "perfume", pack: "carton" };
  }

  const row = beautyRowFor(t);
  if (row) {
    /* A STATED VOLUME BEATS THE ROW'S FLAT FIGURE (2026-09-20).

       Each liquid row's kg is calibrated for one typical size — the
       sérum row is a 30 ml dropper bottle. A title that says "5 fl oz"
       is selling five times that, and answering 0.10 kg for a 148 ml
       bottle under-quotes by half. Fragrances have read their own volume
       since this file was written (see perfumeWeightKg); this extends
       the same courtesy to everything else that arrives in a bottle.

       The row's figure is still the anchor: the container mass is
       derived from it (row kg minus its reference volume), and only the
       contents scale. So a calibrated row stays calibrated, and a size
       it was not written for is answered by arithmetic rather than by
       the wrong number. */
    const ml = row.refMl != null ? titleVolumeMl(t) : null;
    if (ml != null && ml > 0) {
      const containerKg = Math.max(0.01, row.kg - row.refMl / 1000);
      return {
        kg: beautyRound2(containerKg + ml / 1000 + packAllowance(row.pack)),
        key: `${row.key} (${ml} ml)`,
        pack: row.pack,
      };
    }
    return { kg: beautyRound2(row.kg + packAllowance(row.pack)), key: row.key, pack: row.pack };
  }

  // Nothing matched, but we know it is beauty: 0.05 kg, never the generic.
  if (isBeautyItem(t, hints)) {
    return { kg: beautyRound2(BEAUTY_DEFAULT_KG + packAllowance("polybag")), key: "belleza (sin fila)", pack: "polybag" };
  }
  return null;
}

/* THE PLAUSIBLE BAND FOR A BEAUTY TITLE.

   Flat [0.02, 0.6] was right while every row answered one fixed size. Now
   that a stated volume scales the estimate (see beautyWeightDetail), a
   473 ml tub of moisturiser legitimately weighs 0.62 kg and a flat
   ceiling of 0.6 would flag it for review — the band would be rejecting
   the arithmetic that made it accurate.

   So the band follows the size when the title states one: roughly half
   to a bit over twice the liquid's own mass, which catches a bottle
   quoted as if it were empty and one quoted as if it were a brick,
   while leaving the honest middle alone. With no volume stated, the
   original flat band applies unchanged. */
export const BEAUTY_BAND_KG = [0.02, 0.6];

export function beautyBandKg(title) {
  const t = String(title || "");
  if (!beautyRowFor(t) && !PERFUME_RE.test(t)) return null;
  const ml = titleVolumeMl(t);
  if (ml == null || ml <= 0) return BEAUTY_BAND_KG;
  const contents = ml / 1000;
  return [
    Math.max(BEAUTY_BAND_KG[0], beautyRound2(contents * 0.6)),
    beautyRound2(contents * 2.2 + 0.2),
  ];
}

/** Just the weight. Null when the title is not beauty. */
export function beautyWeightKg(title, hints = {}) {
  const detail = beautyWeightDetail(title, hints);
  return detail ? detail.kg : null;
}

/**
 * How many fragrance UNITS a cart holds, and whether that breaks the
 * courier's per-shipment limit. Quantity counts: four bottles of one
 * perfume is still four bottles.
 */
export function fragranceCount(items) {
  return (Array.isArray(items) ? items : []).reduce((sum, it) => {
    const title = String(it?.title ?? it?.name ?? "");
    if (!isFragrance(title)) return sum;
    return sum + Math.max(1, Math.round(Number(it?.qty) || 1));
  }, 0);
}

export function fragranceLimitState(items) {
  const count = fragranceCount(items);
  return {
    count,
    limit: MAX_FRAGRANCES_PER_SHIPMENT,
    overLimit: count > MAX_FRAGRANCES_PER_SHIPMENT,
    remaining: Math.max(0, MAX_FRAGRANCES_PER_SHIPMENT - count),
  };
}

function packAllowance(pack) {
  const kg = BEAUTY_PACK_ALLOWANCE_KG[pack];
  return Number.isFinite(kg) ? kg : 0;
}

function beautyRound2(n) {
  return Math.round(n * 100) / 100;
}

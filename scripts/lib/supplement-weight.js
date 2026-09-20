/* ============================================================
   VITAMINS AND SUPPLEMENTS — a table, not a constant

   THE BUG THIS EXISTS FOR, reported live: a Nature Made D3 bottle of 180
   softgels and a 5 fl oz liquid both quoted "peso estimado 0.68 kg",
   S/ 29.77 of freight each, and both wore a "Flete alto" badge. Two
   unrelated products, one number — which is what a constant looks like
   when it is pretending to be an estimate.

   It was not the generic fallback, and that matters for the fix: 0.68 is
   `withBuffer(0.5, "reasoned")`, the single `vitamins|supplement` row in
   the category table. One row for an entire category, covering a bottle
   of 30 tablets and a tub of protein alike, and set high. On a S/ 46.88
   item it manufactured a 63% freight ratio out of nothing, and the badge
   — which is working correctly — faithfully reported it.

   A 5 fl oz bottle is about 150 grams of liquid plus its container. A
   180-count softgel bottle is about 200 grams. Neither is 680.

   HOW THIS ESTIMATES
   Supplements are one of the few categories where the title states
   almost everything needed: a count and a form ("180 Softgels", "60
   Gummies"), or a volume ("5 fl oz"). So it is arithmetic, not a guess:
   unit mass x count, plus the container the count implies. Gummies are
   dense and get their own per-unit figure — 60 gummies weigh several
   times 60 tablets, and a table keyed on count alone would say they are
   the same.

   THE BIAS IS DOWNWARD, deliberately and against the house rule.
   Everywhere else in this codebase weights lean HIGH, because an
   underestimate comes out of our margin. Here Danny's standing call is
   the opposite: freight quotes must not scare buyers off a category
   where the parcel is genuinely light, and the first real order is what
   calibrates it. Under-quoting a 200 g bottle costs cents; over-quoting
   it by 5x costs the sale. Every figure below is the low end of its
   plausible range.

   RETAILER-STATED WEIGHT ALWAYS WINS. This never runs when the retailer
   published a weight, and never when the title states one outright —
   see the chain in sales-sources.js. It is the third-best answer, used
   only when the first two have nothing.

   ALL VALUES ARE CONFIG. Same rule as the beauty table: these are
   starting points to be calibrated against the first real parcel on a
   real scale, not researched constants. Change the numbers here, not the
   arithmetic at the call sites.
   ============================================================ */

const ML_PER_FL_OZ = 29.5735;

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/* GRAMS PER UNIT, SHIPPED. The pill plus its share of the fill. Low end
   of the plausible range, per the downward bias above. */
export const SUPPLEMENT_FORM_G = {
  softgel: 0.75,
  capsule: 0.55,
  tablet: 0.9,
  caplet: 0.9,
  /* Gummies are the outlier this table exists to respect: a gummy is
     several times the mass of a tablet, so 60 gummies and 60 tablets are
     nothing alike. Form, not just count. */
  gummy: 3.0,
  chewable: 1.6,
  lozenge: 1.4,
  packet: 3.5,
};

/* THE BOTTLE. A count implies a container size — 60 capsules ship in a
   small bottle, 300 in a large one — so the allowance steps with the
   count rather than being flat. HDPE bottle plus cap, lid seal and
   label. */
export const SUPPLEMENT_BOTTLE_G = [
  { maxCount: 60, g: 28 },
  { maxCount: 120, g: 42 },
  { maxCount: 250, g: 60 },
  { maxCount: Infinity, g: 85 },
];

/* Liquids: the contents weigh what they measure (density ~1 for a syrup
   or a tincture), plus the bottle and its dropper or pump. */
export const SUPPLEMENT_LIQUID_CONTAINER_G = 55;

/* Nothing parseable in the title, but we know it is a supplement. A
   small bottle — never the old 0.68, and never the 1.08 generic. */
export const SUPPLEMENT_DEFAULT_KG = 0.12;

/* What makes a title a supplement at all. Broad on purpose: this is the
   gate, and the arithmetic below is what makes the answer specific. */
export const SUPPLEMENT_RE =
  /\b(vitamins?|vitaminas?|multivitamins?|multivitam[íi]nico|supplements?|suplementos?|softgels?|c[áa]psulas?|capsules?|caplets?|tablets?|gummies|gummy|gomitas?|probi[óo]ticos?|probiotics?|omega[- ]?3|fish oil|aceite de pescado|collagen|col[áa]geno|melatonin|melatonina|biotin|biotina|magnesium|magnesio|elderberry|s[áa]uco|ashwagandha|turmeric|c[úu]rcuma|creatine|creatina|electrolytes?|electrolitos?)\b/i;

/* Things that read as supplements and are not. A protein tub or a case
   of drinks is heavy and states its own weight; a pill ORGANISER is
   plastic. Letting any of them through this table would under-quote
   badly, which is the one direction the downward bias must not go. */
export const SUPPLEMENT_IMPOSTOR_RE =
  /\b(organi[sz]er|pill ?box|dispenser|case|holder|rack|shaker|bottle opener|blender|scale|book|guide|chart|poster|shirt|mug|sticker|gift ?card)\b/i;

/* Sold by weight, not by count: protein, greens and meal powders come in
   tubs that state their own mass, and titleWeight() reads it before this
   file is ever consulted. Named here so that if one ever arrives with no
   stated weight it falls to a category row rather than being priced as a
   handful of capsules. */
export const SUPPLEMENT_BULK_RE =
  /\b(protein powder|whey|mass gainer|meal replacement|greens powder|pre[- ]?workout|proteina|prote[íi]na en polvo)\b/i;

const FORM_PATTERNS = [
  [/\bsoft ?gels?\b|\bc[áa]psulas? blandas?\b/i, "softgel"],
  [/\bveg(?:gie|etarian)? ?caps?\b|\bcapsules?\b|\bc[áa]psulas?\b/i, "capsule"],
  [/\bcaplets?\b/i, "caplet"],
  [/\btablets?\b|\btabletas?\b|\bcomprimidos?\b/i, "tablet"],
  [/\bgummies\b|\bgummy\b|\bgomitas?\b/i, "gummy"],
  [/\bchewables?\b|\bmasticables?\b/i, "chewable"],
  [/\blozenges?\b|\bpastillas para chupar\b/i, "lozenge"],
  [/\bpackets?\b|\bstick ?packs?\b|\bsobres?\b/i, "packet"],
];

/** The dosage form named in a title, or null. */
export function supplementForm(title) {
  const t = String(title || "");
  for (const [re, form] of FORM_PATTERNS) if (re.test(t)) return form;
  return null;
}

/**
 * How many units the title says are in the bottle.
 *
 * Reads "180 Softgels", "60 Count", "120 ct", "90 Tablets" and their
 * Spanish forms. Deliberately does NOT read a bare number: "Vitamin D3
 * 2000 IU" is a dose, not a count, and treating it as one would produce
 * a two-kilo bottle of vitamin D.
 */
export function supplementCount(title) {
  const t = String(title || "");
  const patterns = [
    /(\d{1,4})\s*(?:soft ?gels?|capsules?|c[áa]psulas?|caplets?|tablets?|tabletas?|comprimidos?|gummies|gummy|gomitas?|chewables?|masticables?|lozenges?|packets?|sobres?)\b/i,
    /(\d{1,4})\s*(?:count|ct\.?|unidades?|u\.?)\b/i,
    /\bcount(?:\s*of)?\s*(\d{1,4})\b/i,
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (m) {
      const n = parseInt(m[1], 10);
      // A four-digit "count" is almost always an IU dose or a year.
      if (Number.isFinite(n) && n > 0 && n <= 1000) return n;
    }
  }
  return null;
}

/** Volume in millilitres stated in the title, or null. */
export function supplementVolumeMl(title) {
  const t = String(title || "");
  const ml = /(\d+(?:[.,]\d+)?)\s*(?:ml|mL|millilit\w*|mililitros?)\b/i.exec(t);
  if (ml) {
    const n = parseFloat(ml[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const oz = /(\d+(?:[.,]\d+)?)\s*(?:fl\.?\s*oz|fluid ounces?|onzas? l[íi]quidas?)\b/i.exec(t);
  if (oz) {
    const n = parseFloat(oz[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return Math.round(n * ML_PER_FL_OZ * 10) / 10;
  }
  return null;
}

function bottleGramsFor(count) {
  return (SUPPLEMENT_BOTTLE_G.find((b) => count <= b.maxCount) || SUPPLEMENT_BOTTLE_G.at(-1)).g;
}

/** How many bottles the title sells at once ("2 Pack", "Pack of 3"). */
export function supplementPackCount(title) {
  const t = String(title || "");
  const m = /\b(\d{1,2})\s*[- ]?\s*(?:pack|pk|count bottles?|bottles?)\b/i.exec(t)
    || /\bpack of\s*(\d{1,2})\b/i.exec(t);
  const n = m ? parseInt(m[1], 10) : 1;
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : 1;
}

/**
 * Shipped weight for a supplement title, with its reasoning, or null.
 *
 * Returns { kg, key, basis } — `basis` is the arithmetic in words, so the
 * review queue can show why a number is what it is rather than only that
 * it is wrong.
 */
export function supplementWeightDetail(title, hints = {}) {
  const t = String(title || "");
  if (!t) return null;
  if (SUPPLEMENT_IMPOSTOR_RE.test(t)) return null;

  const looksLikeSupplement = SUPPLEMENT_RE.test(t)
    || String(hints.department || "").toLowerCase() === "pharmacy";
  if (!looksLikeSupplement) return null;

  // Sold by mass, not by count: let the category tables answer.
  if (SUPPLEMENT_BULK_RE.test(t)) return null;

  const packs = supplementPackCount(t);

  // A stated volume is the most specific thing a liquid title can say.
  const ml = supplementVolumeMl(t);
  if (ml != null) {
    const kg = round3(((ml + SUPPLEMENT_LIQUID_CONTAINER_G) / 1000) * packs);
    return {
      kg,
      key: "suplemento líquido",
      basis: `${ml} ml + ${SUPPLEMENT_LIQUID_CONTAINER_G} g de envase${packs > 1 ? ` x ${packs}` : ""}`,
    };
  }

  const count = supplementCount(t);
  const form = supplementForm(t);
  if (count != null) {
    // A count with no form named: capsules are the commonest and the
    // lightest of the plausible readings, which is the right way to be
    // wrong in this category.
    const useForm = form || "capsule";
    const unitG = SUPPLEMENT_FORM_G[useForm];
    const grams = count * unitG + bottleGramsFor(count);
    return {
      kg: round3((grams / 1000) * packs),
      key: `suplemento (${useForm})`,
      basis: `${count} x ${unitG} g + ${bottleGramsFor(count)} g de frasco${packs > 1 ? ` x ${packs}` : ""}`,
    };
  }

  /* A form with no count — "Softgels" in the title and the number only
     on the label. Treat it as a small bottle rather than refusing: the
     category's whole problem was a number far too big, and the default
     below is a plausible small bottle. */
  return {
    kg: round3(SUPPLEMENT_DEFAULT_KG * packs),
    key: form ? `suplemento (${form}, sin conteo)` : "suplemento (sin detalle)",
    basis: `frasco pequeño, sin conteo en el título${packs > 1 ? ` x ${packs}` : ""}`,
  };
}

/** Just the weight. Null when the title is not a supplement. */
export function supplementWeightKg(title, hints = {}) {
  const detail = supplementWeightDetail(title, hints);
  return detail ? detail.kg : null;
}

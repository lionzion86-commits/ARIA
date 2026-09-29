/* ============================================================
   IS THIS A SHOE?

   Zapatos is the first department that is not a scraped CATEGORY. Every
   other one maps to a bucket a retailer already declares — apparel,
   grocery, electronics — and footwear declares nothing: it sits inside
   men, women, kids, clothing and sporting_goods, at five retailers that
   describe it five different ways.

   SO IT IS ANSWERED BY THREE SIGNALS, MOST TRUSTWORTHY FIRST. The order
   matters, and it was chosen by measuring the real catalogues rather
   than by assuming:

   1. A PUBLISHED TYPE — with one exception: an explicit NOT_FOOTWEAR
      title veto (shoelaces, insoles, bootcut trousers) outranks even
      the type, because the type field is sometimes just wrong
      (2026-09-29: CCS files shoelaces as 'Zapatillas'). SSENSE and
      Macy's ship a `type` on every item —
      "SLIPPERS & LOAFERS", "LACE UPS & OXFORDS", "SHOE". That is the
      retailer's own classification and beats anything we could infer.
      It accounts for 463 of the 539 shoes on this site — SSENSE 442,
      Macy's 21 — and, just as importantly, it is what keeps the other
      garments OUT (see isFootwear).

   2. A FOOTWEAR RETAILER. Foot Locker's titles are model names — "New
      Balance 9060 - Men's", "ASICS GEL-1130 - Women's", "Nike KD 19".
      MEASURED: a keyword list catches 2 of its 65 products. Nothing in
      those strings says "shoe" because nobody browsing Foot Locker
      needs telling. The store is the signal, and its whole cached
      catalogue is footwear (checked: 0 of 65 titles name a garment).

   3. A TITLE KEYWORD. The last resort, and the only thing the
      generalists give us: Walmart, Target and Old Navy publish no type
      and sell shoes among everything else.

   WHAT THE KEYWORDS HAD TO LEARN NOT TO MATCH, each found by running
   them over the real 3,990-item catalogue:

     * "Boot-Cut" jeans are trousers. Two retailers sell them.
     * "Oxford Shirt" is a shirt. Old Navy alone had ten.
     * SOCKS ARE NOT SHOES. Four Target sock packs and a Walmart
       compression sock matched on descriptions that mention shoes.
       Hosiery in a shoe department is wrong even though it is close.
     * Shoe racks, shoe trays, insoles and polish are shoe ACCESSORIES.

   AND TWO WORDS THAT CANNOT BE USED AT ALL, both from the brief's own
   list, both because this is a catalogue of US retailers:

     * "taco" is Peruvian Spanish for a heel and American English for
       dinner. Matching it would put taco seasoning in Zapatos.
       "Tacones" — the plural, unambiguous — is in the list.
     * "trainer" is a sneaker in Britain and a coach or a piece of gym
       equipment in the States. MEASURED: it matched exactly two items,
       "SKLZ Star Kick Sports Trainer" and "SKLZ Recoil 360 Resistance
       Trainer", and zero shoes.
   ============================================================ */

/* Matched against the retailer's own `type`, upper-cased. These are the
   real values in ssense-catalog.json and macys-catalog.json, not a
   guess at what a type field might contain. */
const FOOTWEAR_TYPE = /\b(SHOES?|SNEAKERS?|BOOTS?|SANDALS?|SLIPPERS?|LOAFERS?|MOCCASINS?|ESPADRILLES?|MONKSTRAPS?|CLOGS?|MULES?|HEELS?|PUMPS?|DERBY|DERBIES|BROGUES?|LACE UPS|OXFORDS?|ZAPATILLAS?|ZAPATOS?|BOTAS?|BOTINES?|SANDALIAS?|TACONES?|PANTUFLAS?|MOCASINES?|ZUECOS?)\b/;

/* Spanish and English, because the shopper is Peruvian and the
   catalogue is American. Ordered loosely by how often they appear. */
const FOOTWEAR_TITLE =
  /\b(shoes?|sneakers?|boots?|booties|bootie|sandals?|slides?|flip[- ]?flops?|cleats?|loafers?|moccasins?|espadrilles?|heels?|clogs?|slippers?|mules?|oxfords?|zapatillas?|zapatos?|botas?|botines?|sandalias?|tacones?|pantuflas?|mocasines?|zuecos?)\b/i;

/* Every one of these was a real false positive, not a hypothetical.
   "Sock" is a shoe STYLE as well as a garment: "Sock Sneakers" and
   "Sock Boots" are real SSENSE footwear, so the socks veto carries a
   negative lookahead and does not fire when a footwear noun follows. */
const NOT_FOOTWEAR =
  /\b(socks?\b(?!\s+(sneakers?|boots?|booties|shoes?))|boot[- ]?cut|bootcut|oxford\s+(shirt|dress|cloth|button|fabric)|shoe\s*(rack|organizer|organiser|box|tray|horn|care|cleaner|polish|insert|bag)|boot\s*tray|insoles?|shoe\s*laces?|shoelaces?|heel\s*(cup|pad|grip|protector))\b/i;

/** Retailers whose whole catalogue is footwear. See signal 2 above. */
export const FOOTWEAR_RETAILERS = new Set(["footlocker"]);

export function isFootwearType(type) {
  const t = String(type ?? "").toUpperCase();
  if (!t) return false;
  return FOOTWEAR_TYPE.test(t);
}

export function isFootwearTitle(title) {
  const t = String(title ?? "");
  if (!t) return false;
  if (NOT_FOOTWEAR.test(t)) return false;
  return FOOTWEAR_TITLE.test(t);
}

/**
 * The three signals in order. `retailer` is optional — without it the
 * type and the title still answer, which is what keeps this usable from
 * anywhere that has an item but not its store.
 */
export function isFootwear(item, retailer) {
  if (!item || typeof item !== "object") return false;
  const title = item.title || item.name || item.productTitle || item.productName || "";
  /* A NEGATIVE TITLE OUTRANKS A PUBLISHED TYPE, and it has to be
     CHECKED FIRST to do so (2026-09-29, Danny: shoelaces in the
     Zapatillas rail). CCS files its shoelaces and Remind insoles
     under type 'Zapatillas', and SSENSE files bootcut trousers
     under 'BOOTS' and oxford shirts under 'SHOES' — the retailer's
     type field is wrong there, and the title ('shoelaces',
     'insoles', 'bootcut', 'oxford shirt') is unambiguous.
     NOT_FOOTWEAR is a deliberately narrow list of real false
     positives, so it vetoes before the type is read. The published
     type still outranks the positive title keyword (the
     oxford-cloth blazer stays out), and the veto still outranks a
     footwear store (Foot Locker's crew socks). */
  if (NOT_FOOTWEAR.test(title)) return false;
  /* A PUBLISHED TYPE SETTLES IT, EITHER WAY — with the one
     exception above. Signal 1 is the most trustworthy, so it has
     to be able to say NO as well as yes — otherwise a keyword
     overrules the retailer's own classification.

     MEASURED, and the reason this is not just tidiness: "oxford" is a
     shoe and also a CLOTH. Before this, SSENSE's "Gray Oxford Single
     Blazer" and "Green Oxford Nylon-TC Jacket" landed in Zapatos on the
     strength of the fabric, while their own type fields said BLAZERS
     and JACKETS. The retailer was right and we were arguing with it. */
  if (item.type) return isFootwearType(item.type);
  if (retailer && FOOTWEAR_RETAILERS.has(retailer)) return true;
  return isFootwearTitle(title);
}

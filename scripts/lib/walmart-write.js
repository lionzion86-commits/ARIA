/* ============================================================
   THE WALMART WRITE STAGE (#443, Lucifer's ingest-replay findings
   items 1-28 across the 14 department stages, 2026-10-23, and Danny's
   rulings filed with them).

   Pure rules, one per finding, so each can be pinned by a test named
   after its item. walmart-density.js calls them from exclusionOf /
   detailToRow / ingestRow; build-walmart-catalog.mjs calls joinKeys in
   mergePull. Nothing here invents a product fact: sizes are decoded only
   from the tokens the PDP lists (in stock, verbatim), gender only from
   the PDP's own field or the name's words, voltage only from text the
   product states, condition only from words it carries.
   ============================================================ */

/* ---------- item 1: join on the trailing item ID ---------- */

/** Walmart's numeric item ID from a product URL (/ip/<slug>/<id>), or null. */
export function itemIdOf(url) {
  const m = /\/ip\/(?:[^/?#]*\/)?(\d{5,})(?:[/?#]|$)/i.exec(String(url || ""));
  return m ? m[1] : null;
}

/* Rider (a): an ID join must agree on the variant. "15-pc" against
   "21-pc" is two different products sharing a parent page. */
const PIECES_RX = /\b(\d{1,4})\s?-?\s?(?:pc|pcs|piece|pieces)\b/i;
export function variantsAgree(listingName, detailName) {
  const a = PIECES_RX.exec(String(listingName || ""));
  const b = PIECES_RX.exec(String(detailName || ""));
  return !(a && b && a[1] !== b[1]);
}

/* ---------- exclusion guards (items 2, 6, 7, 9, 17, 18, 20, 27) ---------- */

/* Item 2: compressed-gas dusters are aerosols whatever their name says. */
/* ITEM 29 (Danny's #483 iPhone pass): fresh food never flies this lane --
   perishable through Miami consolidation, and fresh produce sits under
   SENASA phytosanitary control. Walmart's own grocery marker ("Fresh
   Produce" as brand or department) is the detector, then a title that
   opens with "Fresh" + a produce, meat or seafood noun, and fresh eggs or
   milk. Shelf-stable packaged food is not this class. The same three
   patterns run on the site (isShippableItem in build/app-*.js); a test
   holds them equal. */
export const PERISHABLE_TITLE_RX = /^\s*(?:organic\s+)?fresh\s+(?:(?:whole|seedless|sweet|baby|organic|large|small|jumbo|red|yellow|white|green|gala|honeycrisp|fuji|russet|roma|hass|atlantic|boneless|skinless|ground|all natural)[\s,]+)*(?:onions?|potato(?:es)?|tomato(?:es)?|bananas?|apples?|avocados?|lemons?|limes?|carrots?|celery|lettuce|broccoli|cauliflower|cabbage|strawberr(?:y|ies)|blueberr(?:y|ies)|raspberr(?:y|ies)|blackberr(?:y|ies)|grapes|oranges?|peppers?|cucumbers?|garlic|cilantro|parsley|spinach|kale|mushrooms?|pineapples?|mangoe?s?|watermelons?|cantaloupes?|honeydew|peach(?:es)?|pears?|plums?|kiwis?|zucchini|squash|corn|asparagus|green beans|chicken|beef|pork|steaks?|salmon|shrimp|tilapia|cod|tuna steaks?|turkey|eggs|milk|bread)\b(?![^,]*\b(?:tees?|t-shirts?|shirts?|hoodies?|sweatshirts?|print|graphic|stickers?|candles?|scent(?:ed)?|toys?|plush|costumes?|socks|pajamas?|onesies?|bodysuits?|cases?|wraps?|decor|ornaments?|magnets?|squishmallows?|air fresheners?)\b)/i;
export const PERISHABLE_BRAND_RX = /^\s*(?:fresh produce|freshness guaranteed|marketside|fresh meat|fresh seafood|fresh bakery)\s*$/i;
export const PERISHABLE_DAIRY_RX = /\b(?:(?:large|extra large|jumbo|medium) (?:white|brown|grade a) eggs|(?:whole|2%|1%|skim|fat free|reduced fat) milk,? (?:1 |one )?(?:gallon|half gallon))\b/i;
export const PERISHABLE_CRUMB_RX = /\b(fresh produce|fresh meat|fresh seafood|meat & seafood|fresh dairy|deli|bakery & bread|fresh fruit|fresh vegetables)\b/i;
export function perishableFood(name, brand = "", crumbs = "") {
  return PERISHABLE_TITLE_RX.test(name) || PERISHABLE_BRAND_RX.test(brand) || PERISHABLE_DAIRY_RX.test(name) || PERISHABLE_CRUMB_RX.test(crumbs);
}

/* ITEM 30 (Danny's ruling, 2026-10-23): the $2 floor no longer holds a
   product at write. What held the junk was never the price; it is held
   now on the evidence the audit named (sub2-quarantine-audit-2026-10-23
   §2), and the sellable sub-$2 products publish.
     - a title that states a price ("Clearance Under $1") is spam;
     - under $1.10 a pack, set or N-piece title is a variant minimum or
       per-piece price, not the titled product (Stage 8 / Stage 2);
     - marketplace apparel under $2 gets one PDP check first (Stage 9);
     - per-letter ornaments are fragments of one product (item 24): held
       for the parent PDP, never published alone, never deleted.
   And two write-time scrubs: a was-price over 5x a sub-$2 price is not
   credible and is dropped (the HARIBO peg bag), and "Clearance 2023!"
   comes off a title. The $1,500 ceiling is unchanged. */
export const SUB2_USD = 2;
export const PRICE_STUFFED_TITLE_RX = /\b(?:clearance|deals?|items?|everything|all)\s+under\s+\$?\d+(?:\.\d+)?\b|\$\d*\.\d\d\s*(?:deals?|items?|each|only)\b/i;
export const MULTI_UNIT_TITLE_RX = /\b\d+\s*-?\s*(?:pack|pk|pcs|pieces?|pairs?|sets?)\b|\b(?:two|three|four|five|2|3|4|5)[- ]piece\b|\boutfit sets?\b/i;
export const APPAREL_TITLE_RX = /\b(?:t-?shirts?|tees?|tops?|blouses?|shorts|pants|leggings|dress(?:es)?|skirts?|hoodies?|sweatshirts?|tank(?: tops?)?|panties|underwear|bras?|socks|pajamas?|outfits?|rompers?|jumpsuits?)\b/i;
export const LETTER_ORNAMENT_RX = /\b(?:letter|initial|alphabet|monogram)\b(?=.*\bornaments?\b)|\bornaments?\b(?=.*\b(?:letter|initial)\s+[a-z]\b)/i;
export const TITLE_SPAM_RX = /\s*[-|,!]*\s*\b(?:hot |big |mega )?(?:clearance|sale)\s+20\d\d\b!*\s*/gi;

/** The item-30 verdict for one ingested row: a hold, scrubs, or nothing. */
export function sub2Verdict({ name = "", price = 0, wasPrice = null, seller = "", dept = "" } = {}) {
  const out = {};
  if (LETTER_ORNAMENT_RX.test(name)) return { hold: "fragment-letter-variant" };
  if (price < SUB2_USD) {
    if (PRICE_STUFFED_TITLE_RX.test(name)) return { hold: "price-stuffed-title" };
    if (price < 1.1 && MULTI_UNIT_TITLE_RX.test(name)) return { hold: "variant-floor" };
    const marketplace = seller && !/^walmart(\.com)?$/i.test(String(seller).trim());
    if (marketplace && (APPAREL_TITLE_RX.test(name) || /^(apparel|basics|womens|mens|fashion|clothing|kids)/i.test(dept))) return { hold: "verify-pdp-price" };
    if (wasPrice != null && wasPrice > price * 5) out.dropWasPrice = true;
  }
  const clean = name.replace(TITLE_SPAM_RX, " ").replace(/\s{2,}/g, " ").trim();
  if (clean && clean !== name.trim()) out.name = clean;
  return Object.keys(out).length ? out : null;
}

export const COMPRESSED_GAS_RX = /\b(compressed (gas|air)|canned air|air duster|dust[- ]?off|gas duster|electronics duster)\b/i;

/* Item 6: camp furniture (chairs, cots, airbeds) is parcel-shippable. */
export const CAMP_CONTEXT_RX = /\b(camping|camp|folding (camp )?(chair|cot)|cots?|air ?bed|airbed|air mattress|self[- ]inflating|inflatable (mattress|bed)|sleeping pad)\b/i;
export const ROOFTOP_TENT_RX = /\broof ?top tent\b|\bhard[- ]shell (roof )?tent\b/i;

/* Items 7/18: care wording and accessories are not appliances. */
const APPLIANCE_CARE_RX = /\bdishwasher[- ](safe|friendly|proof)\b|\bdishwasher (detergent|pods?|tablets?|cleaner|rinse)\b|\b(fridge|refrigerator|freezer) (organizers?|bins?|storage|magnets?|deodori[sz]er|containers?|thermometer)\b|\bfor (the )?(fridge|refrigerator|freezer)\b|\btoy (dryer|washer)\b/gi;
export function stripApplianceCare(text) {
  return String(text || "").replace(APPLIANCE_CARE_RX, " ");
}

/* Item 9: tool vocabulary is not a firearm. The hard line (no firearms,
   no ammunition, ever) is untouched. */
export const TOOL_GUN_RX = /\b(pistol[- ]grip|nail ?gun|nailer|staple ?gun|stapler|glue ?gun|impact ?gun|heat ?gun|caulk(ing)? ?gun|grease ?gun|spray ?gun|paint ?gun|massage ?gun|soldering|screwdriver|drill|wrench)\b/i;

/* Items 17/20 + Danny's ruling (c.6373206706): lethal chemical pest
   control is OUT; non-lethal repellents and empty trap hardware are IN.
   The test is lethal-vs-repellent, never chemical-vs-natural, and a
   device phrase always outranks a brand token. */
export const LETHAL_BAIT_RX = /\b(bait (blocks?|pellets?|chunks?|bits|packs?|stations? with \d+ baits?|refills?)|with \d+ baits?|\d+ bait (blocks?|pellets?)|mouse killer|rat killer|rodent ?killer|rodenticide|poison (pellets?|blocks?|bait)|fly bait|ant bait|roach bait|kill(s|ing)? (mice|rats|roaches|ants|flies) (on contact|fast|dead))\b/i;
export const PEST_DEVICE_RX = /\b(glue (traps?|boards?)|sticky (traps?|pads?)|snap traps?|mouse traps?|rat traps?|fly (ribbons?|sticks?|traps?|paper)|uv (fly |insect |bug )?(traps?|zappers?)|bug zappers?|live[- ]catch|humane traps?|empty bait stations?|bait stations?(?! with))\b/i;
export const NON_CHEMICAL_RX = /\b(insecticide|pesticide|chemical)[- ]free\b|\bnon[- ]toxic\b/i;
export const REPELLENT_RX = /\brepell(ent|er|ing)s?\b/i;

/* Item 27: a supplement needs ingestible form; topical products that
   name an ingredient (vitamin C, melatonin, biotin, collagen) are not. */
export const STRONG_SUPPLEMENT_RX = /\b(multivitamins?|dietary supplements?|supplement facts|protein powder|pre-?workout|creatine|probiotics?|whey protein|mass gainer)\b/i;
export const WEAK_SUPPLEMENT_RX = /\b(vitamins?|supplements?|melatonin|biotin|collagen|elderberry|zinc|magnesium|ashwagandha|fish oil|omega[- ]?3)\b/i;
export const INGESTIBLE_FORM_RX = /\b(gummies|gummy|capsules?|caps\b|tablets?|softgels?|chewables?|lozenges?|drink mix|powder stick|drops? \(oral\)|oral drops|liquid supplement|\d+\s?(ct|count) (gummies|capsules|tablets|softgels))\b/i;
export const TOPICAL_RX = /\b(lotion|cream|serum|shampoo|conditioner|mask|body wash|moisturi[sz]er|cleanser|toner|balm|hair oil|face oil|body oil|scrub|gel cream|sunscreen|deodorant|lip)\b/i;

export function supplementVerdict(name) {
  const n = String(name || "");
  if (TOPICAL_RX.test(n)) return false;
  if (STRONG_SUPPLEMENT_RX.test(n)) return true;
  return WEAK_SUPPLEMENT_RX.test(n) && INGESTIBLE_FORM_RX.test(n);
}

/* Item 3: the class by weight, not only the word. A fitness weight the
   title states above the 15 kg parcel line is freight. */
const FITNESS_WEIGHT_RX = /\b(kettle ?bells?|dumb ?bells?|barbells?|weight plates?|bumper plates?|medicine balls?|sand ?bags?|weight sets?)\b/i;
const PARCEL_MAX_KG = 15;
export function statedFitnessKg(name) {
  const n = String(name || "");
  if (!FITNESS_WEIGHT_RX.test(n)) return null;
  let best = null;
  for (const m of n.matchAll(/\b(\d{1,3}(?:\.\d+)?)\s?(lbs?|pounds?|kg|kgs)\b/gi)) {
    const kg = /k/i.test(m[2]) ? Number(m[1]) : Number(m[1]) * 0.4536;
    if (best == null || kg > best) best = kg;
  }
  return best;
}
export const heavyByTitle = (name) => { const kg = statedFitnessKg(name); return kg != null && kg > PARCEL_MAX_KG; };

/* ---------- items 12/15/21/22: sizes from variantList ---------- */

/* The PDP lists its variants as attribute tokens ("clothing_size-xl",
   "shoe_size-9women/7men", "bed_size-queen") with a per-variant stock
   status. Only in-stock tokens, only the families that ARE sizes for
   the department, and the values verbatim (alpha sizes upper-cased). */
const SIZE_FAMILIES_BY_DEPT = {
  apparel: ["clothing_size", "size"],
  basics: ["clothing_size", "size"],
  shoes: ["shoe_size", "size"],
  home: ["bed_size", "bed_pillow_size"],
  seasonal: ["clothing_size"],          /* plain size-* there is a dimension */
  kids_baby: ["clothing_size", "shoe_size"],
};
const TOKEN_RX = /^([a-z_]+)-(.+)$/i;
const ALPHA_SIZE_RX = /^(x{0,3}s|s|m|l|x{0,4}l|\d?x{1,4}l|one size|os)$/i;

function tokensOf(entry) {
  const out = [];
  const visit = (v) => {
    if (typeof v === "string") { if (TOKEN_RX.test(v.trim())) out.push(v.trim()); }
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") Object.values(v).forEach(visit);
  };
  visit(entry);
  return out;
}
function inStock(entry) {
  if (!entry || typeof entry !== "object") return true;
  const s = JSON.stringify([entry.availabilityStatus, entry.availability, entry.status, entry.stockStatus, entry.inStock]);
  if (/OUT_OF_STOCK|out of stock|false/i.test(s) && !/IN_STOCK/.test(s)) return false;
  return true;
}
function prettySize(value) {
  const v = String(value).trim();
  return ALPHA_SIZE_RX.test(v) ? v.toUpperCase() : v;
}

/** { sizes, widths, review } from a detail row's variantList for this department. */
export function decodeVariantSizes(variantList, dept) {
  const families = SIZE_FAMILIES_BY_DEPT[dept] || [];
  const sizes = [];
  const widths = [];
  const review = [];
  if (!Array.isArray(variantList) || !families.length) return { sizes, widths, review };
  for (const entry of variantList) {
    if (!inStock(entry)) continue;
    for (const tok of tokensOf(entry)) {
      const [, fam, raw] = TOKEN_RX.exec(tok);
      const family = fam.toLowerCase();
      if (family === "shoe_width") { if (!widths.includes(raw)) widths.push(raw); continue; }
      if (!families.includes(family)) continue;
      /* Item 15: hybrid "8usw(eu39)" forms go to review, never silent decoding. */
      if (family === "size" && dept === "shoes" && /usw?\(|\(eu/i.test(raw)) { review.push(tok); continue; }
      const s = prettySize(raw);
      if (!sizes.includes(s)) sizes.push(s);
    }
  }
  return { sizes, widths, review };
}

/* ---------- items 11/13/15: route by age, then gender ---------- */

const KIDS_RX = /\b(kids?|boys?|girls?|toddlers?|baby|babies|infants?|newborn|youth|little kid|big kid|juniors?)\b|\b\d{1,2}t\b|\b\d+-\d+ (months|years|yrs)\b/i;
const WOMENS_RX = /\b(women'?s|womens|ladies|ladies'|female|maternity)\b/i;
const MENS_RX = /\b(men'?s|mens|male)\b/i;
const ROUTED_DEPTS = new Set(["basics", "apparel", "shoes"]);

/** The bucket a gendered department's product belongs in: age first, then gender. */
export function routeBucket(run, name, pdpGender) {
  const planned = (run && run.bucket) || "clearance";
  if (!run || !ROUTED_DEPTS.has(run.dept)) return planned;
  const n = String(name || "");
  if (KIDS_RX.test(n)) return "kids_baby";
  const g = String(pdpGender || "").toLowerCase();
  if (g === "female" || (!g && WOMENS_RX.test(n)) || (g === "unisex" && WOMENS_RX.test(n) && !MENS_RX.test(n))) {
    return run.dept === "shoes" ? "shoes" : run.dept === "apparel" ? "fashion" : "womens";
  }
  if (g === "male" || (!g && MENS_RX.test(n))) return run.dept === "shoes" ? "shoes" : "mens";
  return planned === "mens" ? "basics" : planned;
}

/* ---------- items 10/14/16: merchandising flags ---------- */

export function merchFlags(name) {
  const n = String(name || "");
  const flags = [];
  const pairs = /\b(\d{2,4})\s?pairs?\b/i.exec(n);
  if (/\b(bundle )?lot of \d+|\bwholesale lot\b|\bbulk lot\b/i.test(n) || (pairs && Number(pairs[1]) >= 20)) flags.push("bulk-lot");
  const pcs = PIECES_RX.exec(n);
  if (pcs && Number(pcs[1]) >= 200 && /\b(tools?|socket|wrench|mechanic|drill bit|trolley|rolling)\b/i.test(n)) flags.push("mega-kit-weight-check");
  return flags;
}

/* ---------- items 25/26: the voltage gate (Danny, Oct 23) ---------- */

/* A mains-powered product sells only when its stated input range
   includes 220 V. 110 V-only is excluded; unstated or self-contradicting
   is held -- never published on a guess. Battery, USB and solar devices
   are not mains-rated and are untouched. */
const NOT_MAINS_RX = /\b(battery[- ](operated|powered)|batteries (included|required)|usb[- ](powered|rechargeable|charging|charged)|rechargeable|solar[- ]powered|cordless|aa batter|aaa batter)\b/i;
const MAINS_SIGNAL_RX = /\b(plug[- ]?in|plugs into|ac adapter|power adapter|power cord|corded|wall outlet|outlet|ac power|mains|\d{3,4}\s?w(atts?)?\b|1[12]0\s?v|2[2-4]0\s?v)\b/i;
const MAINS_CLASS_RX = /\b(air fryers?|blenders?|toasters?|microwaves?|coffee makers?|espresso machines?|electric kettles?|slow cookers?|pressure cookers?|instant pot|rice cookers?|stand mixers?|hand mixers?|food processors?|juicers?|waffle makers?|griddles?|hair dryers?|blow dryers?|flat irons?|hair straighteners?|curling (irons?|wands?)|hot air brush|space heaters?|electric blankets?|heating pads?|vacuums?|steam mops?|humidifiers?|dehumidifiers?|air purifiers?|digital pianos?|electric (pianos?|keyboards?)|amplifiers?|electric grills?|sewing machines?|printers?)\b/i;
const DUAL_RX = /\b(100|110|120)\s?(-|–|~|to)\s?(220|230|240)\s?v|\b(220|230|240)\s?v\b|\bdual[- ]voltage\b|\buniversal voltage\b|\bworldwide voltage\b/i;
const ONLY_110_RX = /\bonly\s(100|110|120)\s?v\b|\b(100|110|120)\s?v\s?only\b|\bus plug only\b|\bnorth america only\b|\b(100|110|120)\s?v?\s?(-|–|~|to)\s?(120|125|127)\s?v\b|(?:^|[^\d\-–~.])(?:ac\s?)?1[12]0\s?v(?!\s?(?:-|–|~|to)\s?\d)/i;

/** "not-mains" | "verified" | "excluded-110v" | "held-unstated" | "held-contradicting" */
export function voltageVerdict(name, description = "") {
  const text = `${name || ""} ${description || ""}`;
  const mainsClass = MAINS_CLASS_RX.test(text);
  const signal = MAINS_SIGNAL_RX.test(text);
  if (!mainsClass && !signal) return "not-mains";
  if (!mainsClass && NOT_MAINS_RX.test(text)) return "not-mains";
  const dual = DUAL_RX.test(text);
  const only110 = ONLY_110_RX.test(text);
  if (dual && only110) return "held-contradicting";
  if (dual) return "verified";
  if (only110) return "excluded-110v";
  return "held-unstated";
}

/* ---------- item 28 + Danny's ruling: condition ---------- */

const REFURB_RX = /\b(refurbished|renewed|remanufactured|reconditioned|restored|certified pre-?owned|reacondicionad[oa])\b/i;
const USED_RX = /\b(pre-?owned|used|second[- ]hand|segunda mano)\b/i;
const OPEN_BOX_RX = /\bopen[- ]box\b|\bcaja abierta\b/i;
const CLOTHING_FOOTWEAR_RX = /\b(shirts?|t-shirts?|tees?|pants|jeans|dress(es)?|skirts?|jackets?|coats?|hoodies?|sweaters?|leggings|shorts|socks|underwear|bras?|pajamas?|shoes?|sneakers?|boots?|sandals?|slippers?|heels|loafers?|cleats)\b/i;
const AUTO_PART_RX = /\b(brake|rotor|alternator|starter motor|radiator|transmission|engine|headlight assembly|bumper|fender|auto part)s?\b/i;
const CLOTHING_DEPTS = new Set(["apparel", "basics", "shoes"]);

/** { condition, label } for a stated condition, { excluded } for a prohibited one, or null. */
export function conditionOf(name, dept = "") {
  const n = String(name || "");
  const refurb = REFURB_RX.test(n);
  const used = !refurb && USED_RX.test(n) && !/\bused (for|to|in|with|by|as)\b/i.test(n);
  const open = OPEN_BOX_RX.test(n);
  if (!refurb && !used && !open) return null;
  /* Ley 28514: used clothing and footwear may not be imported; SUNAT's
     list bars used auto parts. Open-box apparel counts with them. */
  const clothing = CLOTHING_DEPTS.has(dept) || CLOTHING_FOOTWEAR_RX.test(n);
  if (clothing) return { excluded: "excluded-used-clothing-footwear" };
  if ((refurb || used) && AUTO_PART_RX.test(n)) return { excluded: "excluded-used-auto-part" };
  /* INDECOPI (Ley 29571 art. 11): disclosed on the product and the receipt. */
  if (refurb) return { condition: "refurbished", label: "Reacondicionado" };
  if (used) return { condition: "used", label: "Usado" };
  return { condition: "open-box", label: "Caja abierta" };
}

/* Refurbished phones sell unlocked only (the refurb spec, c.6373874319). */
export function lockedPhone(name) {
  const n = String(name || "");
  return /\b(iphone|galaxy|pixel|smartphone|cell ?phone|flip phone|rugged phone|razr|moto g|tcl \d+|tcl flip|kyocera)\b/i.test(n)
    && /\b(locked|straight talk|tracfone|total wireless|cricket|metro ?pcs|boost mobile|visible|verizon|at&t|t-mobile|spectrum mobile|xfinity mobile|us cellular|carrier)\b/i.test(n)
    && !/\bunlocked\b/i.test(n);
}

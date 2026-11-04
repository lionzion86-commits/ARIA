/* ============================================================
   MARC JACOBS: ONE PRODUCT ACROSS THE OFFICIAL STORE AND THE RETAILERS
   (#443 c.6643334129, Danny's amendment: the official store is a row in
   the Comparador, so a shopper sees marcjacobs.com's price beside every
   store that carries the same bag or shoe, and the best price wins).

   The Comparador (netlify/functions/_search-core.js productGroups) joins
   listings by a model key. The generic key drops quoted names, which is
   exactly where a retailer writes a Marc Jacobs model: SSENSE titles
   read «Black 'The 400 Bleekerina' Flats», «Red 'The Everyday Lipstick
   Case' Bag Charm». The house names every product «The <model>» («The
   Tote Bag», «The Snapshot»), so the model name IS the key:

     - a quoted «The ...» segment, when the title has one (SSENSE);
     - otherwise the title from its «The» on (the official store's own
       names, «The Leather Medium Tote Bag»);
     - no «The», no key: a title that does not name the model is never
       guessed into a chart (a false «Mejor precio» is worse than none);
     - the kind is a FAMILY, because the house and the stores word it
       differently («The Medium Tote Bag» / «'The Medium' Tote»): bag,
       accessory (a «Bag Charm» is not a bag), clothing, and shoes by
       their kind (the same model name comes as a flat and as a platform
       sandal); a title with no kind word takes it from its department
       (the official catalogue's bolsos / accesorios / ropa), else no key;
     - the size and the material are read from the whole title (a
       retailer moves them out of the quotes: «'The Scene' Small
       Shoulder Bag»); «The Small Tote» and «The Large Tote» are two
       products at two prices;
     - the colourway is set aside (colour words, the part after a dash
       or in brackets): a chart compares the MODEL, as every other chart
       does.

   THE STYLE NUMBER. The official pull carries the house's style number
   (`sku` in the drop). A retailer listing joins it by style number only
   when that exact code appears in its own record (link, photo file or
   title) -- matched against the official catalogue's codes, never a
   pattern guessed here. Today no retailer feed Aria holds carries a
   Marc Jacobs style number (SSENSE's productCode is SSENSE's own), so
   the model name does the matching; reports/marcjacobs-aggregation-
   2026-11-04.json counts both.

   Beauty and fragrance are left to the generic key: they are compared
   by name and size already, and they are not this store's scope.

   No imports: the search function loads this file.
   ============================================================ */

/* The house's spellings as the catalogues write them («Marc Jacobs» at
   SSENSE, Macy's, Ulta and Aria Perfumes; «Marc Jacobs Beauty» at
   Sephora), plus the line names the directive lists («The Marc Jacobs»,
   «Marc by Marc Jacobs»), which no catalogue Aria holds uses today. */
export const MJ_BRAND_RX = /^(?:the\s+)?marc\s+jacobs(?:\s+beauty)?$|^marc\s+by\s+marc\s+jacobs$/i;
export const MJ_FASHION_BRAND_RX = /^(?:the\s+)?marc\s+jacobs$|^marc\s+by\s+marc\s+jacobs$/i;
const clean = (s) => String(s == null ? "" : s).replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
export function isMarcJacobsBrand(brand) { return MJ_BRAND_RX.test(clean(brand)); }
export function isMarcJacobsFashionBrand(brand) { return MJ_FASHION_BRAND_RX.test(clean(brand)); }

/* Beauty and fragrance words: those listings keep the generic key. */
export const MJ_BEAUTY_RX = /\b(?:eau de|eau so|parfum|perfumes?|fragrances?|fragancias?|cologne|body mist|hair mist|mascara|lipstick|lip gloss|lip|concealer|foundation|bronzer|eyeliner|eye ?shadow|primer|powder|blush|highlighter|serum|cream|lotion|loci(?:o|\u00f3)n)(?![a-z])/i;
/* ...but a bag charm shaped like a lipstick case is a bag charm. */
const NOT_BEAUTY_RX = /\b(?:bag charms?|charms?|case|pouch|bag|tote|keychain|key ?ring)\b/i;
export function isBeautyTitle(title) {
  const t = clean(title);
  return MJ_BEAUTY_RX.test(t) && !NOT_BEAUTY_RX.test(t);
}

const COLOURS = new Set(("black white red blue green gray grey pink purple yellow orange brown beige tan navy cream gold silver khaki olive " +
  "maroon burgundy teal ivory sand multi multicolor multicolour camo charcoal slate mint lilac lavender coral rose natural indigo wine plum rust " +
  "copper bronze metallic neon royal sky aqua turquoise lime leopard heather oatmeal stone sage mocha espresso peach blush fuchsia magenta " +
  "scarlet crimson ash cement wheat ecru taupe camel chocolate cognac argan nude off light dark pale deep bright azure cobalt cherry berry " +
  "tangerine lemon marine petal bubblegum violet cloud fog moss forest hunter emerald jade pistachio butter vanilla").split(" "));
const STOP = new Set(["the", "and", "with", "in", "of", "a"]);
/* Where a retailer moves a word out of the model's quotes («'The Scene'
   Small Shoulder Bag», «'The Camp Patchwork' Denim Medium Tote»), the
   size and the material still name the product: they are read from the
   whole title. */
const SIZE_WORDS = new Set(["nano", "micro", "mini", "small", "medium", "large", "oversized", "jumbo", "xl"]);
const MATERIAL_WORDS = new Set(["leather", "suede", "canvas", "nylon", "denim", "satin", "crochet", "mesh", "quilted", "patent", "velvet", "raffia", "straw", "shearling", "faux", "fur", "puffy", "woven", "jacquard", "terry", "sequin", "metallic"]);
/* The kind, which the house and the stores word differently («The
   Medium Tote Bag» at the house, «'The Medium' Tote» at SSENSE): read
   into a family, and stripped from the end of the model name. */
const KIND_FAMILY = [
  [/^(?:bag charms?|charms?|keychains?|key ?rings?|straps?|wallets?|holders?|card ?(?:holders?|cases?)|cases?|passport)$/, "acc"],
  [/^(?:bags?|totes?|handbags?|shoulder|crossbody|satchels?|clutch(?:es)?|hobo|backpacks?|pouch(?:es)?|top handle|handle|duffle|duffel|messenger|vanity|sack)$/, "bag"],
  /* Shoes by their kind: the same model name comes as a flat and as a
     platform sandal («The Pop J Marc»), two products at two prices. */
  [/^(?:sandals?)$/, "shoe-sandal"],
  [/^(?:flats?|ballerinas?)$/, "shoe-flat"],
  [/^(?:sneakers?|trainers?)$/, "shoe-sneaker"],
  [/^(?:boots?|booties)$/, "shoe-boot"],
  [/^(?:mules?|clogs?|slides?)$/, "shoe-mule"],
  [/^(?:loafers?)$/, "shoe-loafer"],
  [/^(?:pumps?|heels?|slingbacks?)$/, "shoe-heel"],
  [/^(?:t-?shirts?|tees?|shirts?|tops?|sweaters?|cardigans?|hoodies?|sweatshirts?|jackets?|coats?|dress(?:es)?|skirts?|pants|trousers|jeans|shorts|knit|jumpers?)$/, "wear"],
];
/* Family words that are never a model's own name. */
const KIND_TAIL = /^(?:bag charms?|charms?|keychains?|straps?|wallets?|holders?|bags?|totes?|handbags?|shoulder|crossbody|satchels?|clutch(?:es)?|backpacks?|pouch(?:es)?|top|handle|flats?|ballerinas?|sandals?|platforms?|heeled|heels?|pumps?|mules?|loafers?|sneakers?|trainers?|boots?|ankle|booties|clogs?|slides?|shoes?|t-?shirts?|tees?|shirts?|sweaters?|cardigans?|hoodies?|sweatshirts?|jackets?|coats?|dress(?:es)?|skirts?|pants|trousers|jeans|shorts)$/;
/* The site's category (the index's `cat`), when the title names no kind. */
const CAT_FAMILY = { bolsos: "bag", carteras: "bag", ropa: "wear", accesorios: "acc" };

const norm = (s) => clean(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/&/g, " and ").replace(/[^a-z0-9' -]+/g, " ").replace(/'/g, "").replace(/\s+/g, " ").trim();

/** The model name a Marc Jacobs title carries, or null. */
export function mjModelName(title) {
  const t = clean(title);
  if (!t) return null;
  const q = /(?:^|[\s(])['"\u201c]\s*(the\s[^'"\u201d]{2,70}?)\s*['"\u201d](?=[\s,).]|$)/i.exec(t);
  let model = q ? q[1] : null;
  if (!model) {
    const m = /(?:^|\s)(the\s.+)$/i.exec(t);
    if (!m) return null;
    model = m[1];
  }
  /* The colourway: after a dash, in brackets, after a comma. */
  model = model.split(/\s+[-\u2013\u2014|]\s+|\s*\(|,\s/)[0];
  return model.trim() || null;
}

/** The family a title's kind words say (acc / bag / shoe-<kind> / wear), or "".
    An accessory word wins (a «Bag Charm» is not a bag), then the table's order. */
export function mjFamily(title) {
  const w = norm(title).split(" ");
  const grams = w.flatMap((x, i) => (i + 1 < w.length ? [x, x + " " + w[i + 1]] : [x]));
  for (const [rx, fam] of KIND_FAMILY) if (grams.some((g) => rx.test(g))) return fam;
  return "";
}

/** The comparison key of a Marc Jacobs fashion listing, or null.
    `cat` (optional): the site's category, when the title names no kind. */
export function mjModelKey(title, brand, cat) {
  if (!isMarcJacobsFashionBrand(brand)) return null;
  if (isBeautyTitle(title)) return null;
  const model = mjModelName(title);
  if (!model) return null;
  let words = norm(model).split(" ").filter((w) => w && !STOP.has(w) && !COLOURS.has(w));
  /* «The Leather Medium Tote Bag» -> leather medium (+ the bag family). */
  while (words.length > 1 && KIND_TAIL.test(words[words.length - 1])) words.pop();
  if (words.length === 1 && KIND_TAIL.test(words[0])) return null;
  const all = norm(title).split(" ");
  const set = new Set(words);
  for (const w of all) if (SIZE_WORDS.has(w) || MATERIAL_WORDS.has(w)) set.add(w);
  if (!set.size) return null;
  const fam = mjFamily(title) || CAT_FAMILY[String(cat || "").toLowerCase()] || "";
  if (!fam) return null;
  return "marcjacobs|" + fam + "|" + [...set].sort().join(" ");
}

/* THE STYLE NUMBER: an official code found, whole, in a retailer record. */
const tokens = (s) => String(s == null ? "" : s).toUpperCase().split(/[^A-Z0-9]+/).filter((x) => x.length >= 6);
/** The official style number this record carries, from `codes` (a Set of
    the official catalogue's codes, upper case), or null. */
export function mjStyleMatch(record, codes) {
  if (!codes || !codes.size || !record) return null;
  const file = String(record.image || "").split("?")[0].split("/").pop();
  for (const src of [record.sku, record.styleNumber, record.url, file, record.title || record.name]) {
    for (const tk of tokens(src)) if (codes.has(tk)) return tk;
  }
  return null;
}

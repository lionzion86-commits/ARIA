/* ============================================================
   SECTION ALLOWLISTS — WHAT A SECTION MAY HOLD, BY PRODUCT TYPE
   (#443 c.6615548354, Danny: "every section/department page builds
   from an explicit TYPE ALLOWLIST").

   THE LEAK. Lencería and the Moda «Lencería» / «Ropa interior» lenses
   took a product in when a lingerie WORD appeared anywhere in its type
   or its title ("Bra Free Cami", "Bralette Swim Top", "Built-In Bra
   Tank Top", "Thong Heeled Sandals", "Bra Bag", "Boxer Shorts", "Baby
   Doll", "Teddy Jumper"). The data was right -- those records say
   Camisa, Bikinis, HEELED SANDALS, SHOULDER BAGS, SHORTS -- the
   builders read a keyword instead of the type.

   THE RULE. Membership is the product's own TYPE field, normalised
   (case, "_", "-", ">" folded) and looked up in an explicit list:

     INTIMATE_TYPES   bra / panty / lingerie / shapewear / underwear
     SOCK_TYPES       socks (the department's Medias half)

   A type that says nothing (WEAK_TYPES: "", Ropa, Prenda, Apparel,
   Accessory, a store's SKU-like code, and the generic Spanish words a
   store's translation put on every garment -- Camisa, Camiseta,
   Pantalón) hands the decision to the title's HEAD NOUN: the last
   garment noun of the name's main phrase ("Plunge Molded T-Shirt Bra
   2801" is a bra; "Bra Free Cami" is a cami; "Built-In Bra Tank Top" is
   a top). A keyword elsewhere in the title never admits anything.

   Narrow vetoes, applied to every type (each a different category the
   site already files elsewhere): sports bras are Gym Rat kit, swimwear
   is Ropa de baño, a feeding accessory is Mama's Fashion, and
   bra hardware (extenders, strap holders, nipple covers, pads) is an
   accessory; a "bra-free" top is a top. A strong intimates type whose
   head noun is plainly another garment (top, polo, blazer, skirt,
   sandal, bag, doll...) is refused: the record contradicts itself, and
   a section fails closed.

   Used by the builders (build-ropa-interior-feed.mjs, the Moda lenses
   in netlify/functions/_department-core.js) and asserted over the
   generated files by scripts/test/section-allowlist-tests.mjs.
   ============================================================ */

/* "SHAPEWEAR_BOTTOMS" -> "shapewear bottoms"; "Mens>Apparel>Underwear>boxer" -> segments. */
export function normType(t) {
  return String(t == null ? "" : t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

/* The intimates types, by class. Every entry is a type a store in the
   catalogues actually publishes for that garment. */
export const INTIMATE_TYPES = {
  bra: ["bra", "bras", "sostenes", "sosten", "bralette", "bralettes", "bralette pack", "bralettes and bandeau"],
  panty: ["panty", "panties", "panty pack", "panty packs", "briefs", "thongs", "undies"],
  lingerie: ["lenceria", "lingerie", "corset", "corsets", "corsets & bodysuits", "intimates"],
  shapewear: ["shapewear", "shapewear bodysuit", "shapewear bodysuits", "shapewear bottom", "shapewear bottoms",
    "shapewear top", "shapewear tops", "shapewear slips"],
  underwear: ["underwear", "ropa interior", "mens underwear", "boxers", "boxer", "boxer briefs", "men s boxer brief", "trunks"],
};
export const SOCK_TYPES = ["socks", "sock", "medias", "calcetines", "hosiery", "tights"];
const TYPE_CLASS = new Map();
for (const [cls, list] of Object.entries(INTIMATE_TYPES)) for (const t of list) TYPE_CLASS.set(t, cls);
for (const t of SOCK_TYPES) TYPE_CLASS.set(t, "socks");

/* Types that say nothing about the garment. */
export const WEAK_TYPES = new Set(["", "ropa", "prenda", "apparel", "accessory", "accessories", "accesorios", "product",
  "other", "otros", "women", "men", "for him", "for her", "camisa", "camiseta", "pantalon", "pantalones", "general", "clothing",
  "ready to wear", "calzado", "vestido",
  /* The maternity stores' department labels, not garment types: Kindred
     Bravely files its nursing bras and postpartum briefs "Lactancia" and
     "Maternidad" -- the head noun decides (Danny asked for them, #443). */
  "lactancia", "maternidad", "maternity", "nursing"]);
const SKU_TYPE = /^[a-z]{2,4}\s?\d{2,5}$/;

/* The type's class, its weakness, or "" for a type that names another garment. */
function typeClass(type) {
  const n = normType(type);
  if (TYPE_CLASS.has(n)) return { cls: TYPE_CLASS.get(n), weak: false };
  if (WEAK_TYPES.has(n) || SKU_TYPE.test(n) || /^(accesorios|accessories) (de|para) /.test(n)) return { cls: "", weak: true };
  /* A type that names the garment in more words ("Women's Crew Sock",
     "Men's Boxer Brief", "MENS_SOCKS"); never a sport's or a board's. */
  if (!/sport|board|surf|fin\b/.test(n)) {
    if (/\bsocks?\b/.test(n)) return { cls: "socks", weak: false };
    if (/\b(underwear|boxer briefs?)\b/.test(n)) return { cls: "underwear", weak: false };
  }
  /* A path type ("mens>apparel>underwear>boxer"): its own segments. */
  if (n.includes(">")) {
    const segs = n.split(">").map((s) => s.trim());
    for (let i = segs.length - 1; i >= 0; i--) if (TYPE_CLASS.has(segs[i])) return { cls: TYPE_CLASS.get(segs[i]), weak: false };
  }
  return { cls: "", weak: false };
}

/* ---------- the head noun ---------- */
const NOUNS = [
  ["bra", /\b(bra(?:lette)?\s+tops?|bras?|bralettes?|bandeaus?|brassieres?|sostenes|sost[eé]n)\b/],
  ["panty", /\b(panty|panties|thongs?|g-?strings?|briefs?|hipsters?|cheeky|cheekies|boy\s?shorts?|boyshorts?|brazilians?|bikini\s+(?:panty|panties|briefs?)|tangas?|calzones?|bragas?)\b/],
  ["underwear", /\b(underwear|undies|boxer\s+briefs?|boxer\s+shorts|underwear\s+trunks?|boxers?|jockstraps?|ropa\s+interior)\b/],
  ["lingerie", /\b(lingerie|lencer[ií]a|corset\s+tops?|bustier\s+tops?|corsets?|bustiers?|thigh[- ]highs|teddy|teddies|chemises?|babydolls?|garter\s+belts?|garters?|camisoles?|slips?(?![- ]?ons?\b))\b/],
  ["shapewear", /\b(shapewear|bodybriefers?|body\s?shapers?|shapers?|waist\s+cinchers?|thigh\s+slimmers?)\b/],
  ["socks", /\b(socks?|medias|calcetines|tights|pantyhose|hosiery|stockings?|leg\s?warmers?)\b/],
  /* Neutral: an intimates type may sell one (a lace bodysuit, a cami set); a title alone cannot. */
  ["neutral", /\b(bodysuits?|bodies|cami\s+tops?|cami|camis|shorts?|catsuits?|trunks?)\b/],
  ["other", /\b(tops?|tanks?|tees?|t-?shirts?|shirts?|polos?|blouses?|sweaters?|jumpers?|hoodies?|sweatshirts?|cardigans?|blazers?|jackets?|coats?|vests?|skirts?|miniskirts?|(?:shirt|sweater|slip|tee|t-?shirt)?dress(?:es)?|pants|leggings|jeans|trousers|joggers?|capris?|robes?|pajamas?|pyjamas?|sleep\s?shirts?|slippers?|sandals?|shoes?|sneakers?|heels?|boots?|bags?|totes?|wallets?|belts?|dolls?|toys?|plush|stickers?|scarf|scarves|mugs?|keychains?|blankets?|swimsuits?|one[- ]pieces?|rash\s?guards?)\b/],
];
const CUT = /\s[-–—|]\s|,\s|\s\(|\s(?:with|w\/|for|featuring|con|para)\s/i;
const MASK = /\b(t-?shirt|tee-?shirt)\s+(?=bras?\b)/gi; /* "T-Shirt Bra": the shirt is the bra's style */

/** The class of the title's head noun ("" when it names none). */
export function headNoun(title) {
  const full = String(title || "").toLowerCase().replace(MASK, (m) => " ".repeat(m.length));
  const cut = full.search(CUT);
  for (const seg of cut > 0 ? [full.slice(0, cut), full] : [full]) {
    let best = null;
    for (const [cls, rx] of NOUNS) {
      const g = new RegExp(rx.source, "gi");
      let m;
      while ((m = g.exec(seg))) {
        const end = m.index + m[0].length;
        if (!best || end > best.end || (end === best.end && m[0].length > best.len)) best = { cls, end, len: m[0].length };
      }
    }
    if (best) return best.cls;
  }
  return "";
}

/* ---------- the vetoes: another section's product ---------- */
export const VETOES = [
  ["kit (Gym Rat)", /\b(sports?|workout|training|running|yoga|gym|(?:high|medium|low|mid)[- ]impact|impact)\s+bras?\b|\bsports?\s?bras?\b/i, /sport/],
  ["swimwear (Ropa de baño)", /\b(swim\w*|bikini\s+(?:tops?|bottoms?)|bathing\s+suits?)\b/i, /swim|bikini|bano/],
  /* A feeding accessory filed with the pumps (Dr. Brown's "Alimentación"). */
  ["Mama's Fashion", /\bbreast\s?pumps?\b/i, /alimentacion|feeding/],
  ["accessory", /\b(band\s+extenders?|bra\s+extenders?|extenders?|strap\s+(?:holders?|converters?)|replacement\s+straps?|bra\s+straps?|nipple\s+covers?|nippies|enhancers?|anti[- ]abrasion\s+bands?|breast\s+petals?|pasties|(?:silicone|stick[- ]on|fabric|push[- ]up)\s+cups|bra\s+inserts?|removable\s+padding|fabric\s+cups|laundry\s+bags?|wash\s+bags?|bra\s+bags?)\b/i, null],
  ["a top", /\bbra[- ]free\b/i, null],
];

/** "bra" | "panty" | "lingerie" | "shapewear" | "underwear" | "socks" | "" -- by the TYPE allowlist. */
export function intimateClass(item) {
  if (!item) return "";
  const title = String(item.title || item.name || item.t || "");
  const type = item.type != null ? item.type : item.pt;
  const nt = normType(type);
  for (const [, rx, trx] of VETOES) if (rx.test(title) || (trx && trx.test(nt))) return "";
  const { cls, weak } = typeClass(type);
  const head = headNoun(title);
  if (cls) {
    /* Shapewear is cut as capris, shorts, slips and tops: its type decides. */
    if (head === "other" && cls !== "shapewear") return "";
    /* A shapewear type sells shorts, slips and bodysuits; the rest sell what they name. */
    return cls;
  }
  if (!weak) return "";
  return ["bra", "panty", "lingerie", "shapewear", "underwear", "socks"].includes(head) ? head : "";
}
export const isIntimate = (item) => { const c = intimateClass(item); return !!c && c !== "socks"; };
export const isSockTyped = (item) => intimateClass(item) === "socks";

/* ---------- the sections ----------
   Every curated section and what its type must be. `allow(row)` gets a
   row with { title, type, retailer } -- the catalogue record's own type. */
export const SECTION_ALLOWLISTS = {
  lenceria: { label: "Lencería", types: "INTIMATE_TYPES (bra, panty, lingerie, shapewear, underwear) -- never a sock", allow: (p) => isIntimate(p) },
  "interior-mujer": { label: "Ropa Interior Mujer (página)", types: "INTIMATE_TYPES + SOCK_TYPES", allow: (p) => !!intimateClass(p) },
  "interior-hombre": { label: "Ropa Interior Hombre", types: "INTIMATE_TYPES (underwear, panty=briefs) + SOCK_TYPES", allow: (p) => !!intimateClass(p) },
};

/* ---------- Joyas y accesorios ----------
   The department takes a jewel or an accessory by its NAME (scripts/
   build-department-slices.mjs KIND_MATCH.joyas); its TYPE may still veto
   it: a type that names a home piece, a book or a toy is that thing,
   whatever a word in its name says ("Napkin Ring", "Pendant Lantern",
   "Framed Canvas ... Stud", "Candle Ring"). */
export const JOYAS_DENY_TYPE_RX = /\b(napkin|ornaments?|wall\s*art|framed|decor|d[eé]cor|candles?|candle\s+rings?|pillar|vases?|lanterns?|tableware|kitchen|bedding|furniture|coffee\s+table\s+book|books?|libros?|peluches?|plush|toys?|juguetes?|figuras?\s+coleccionables?|figurines?)\b/i;
export function joyasTypeAllowed(p) {
  const t = normType(p && p.type);
  return !t || !JOYAS_DENY_TYPE_RX.test(t);
}

/* ---------- Perfumes ----------
   Fragancia, and a fragrance line's own body care (Cuidado corporal,
   build-department-slices perfumeType -- deliberate, #443 item 32). */
export const PERFUME_TYPES = new Set(["fragancia", "fragrance", "cuidado corporal"]);

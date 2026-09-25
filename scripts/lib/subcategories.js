/* ============================================================
   SUBCATEGORIES — the aisle inside a department.

   THE BUG THIS EXISTS FOR (2026-09-22, QA on an iPhone). Macy's "Women"
   was one bucket of 754 products, and the first several minutes of
   scrolling were bras and panties. A shopper looking for a dress or
   jeans never reached them. Nothing was wrong with the data: 305
   dresses and 64 pairs of jeans were sitting right there. It was a
   navigation failure, and a flat list of 754 anything is one.

   WHY THIS IS NOT A MACY'S FILE. Macy's is simply the first store whose
   export carries a product type. The rule is generic: a department
   splits into aisles when its items say what they ARE, and any store
   that starts reporting a type gets the same split with no code change.
   A store whose items carry no type does not split, and loses nothing —
   its items are still in "Ver todo".

   ------------------------------------------------------------
   THE ORDER IS EDITORIAL, NOT BY COUNT.

   Sorting the aisles by how many products each holds would put the
   biggest first, which is how the original bucket ended up leading with
   underwear. The order below is the order a womenswear floor is walked,
   and LINGERIE IS LAST ON PURPOSE. That is the whole fix: it is not
   hidden, it is simply not in front of the dresses.
   ------------------------------------------------------------

   NOTHING IS EVER LOST. A type that maps to no aisle is not dropped and
   not silently filed somewhere wrong — it is reachable in "Ver todo",
   which always holds the complete department. unmappedTypes() below is
   what tells us when a new type has shown up and deserves an aisle.
   ============================================================ */

/**
 * A type token, however a retailer spells it.
 *
 * Macy's sends "BACKPACK_MESSENGER"; another store might send
 * "Backpack / Messenger" or "backpack-messenger". One normalisation, so
 * the map below is written once and not once per retailer's punctuation.
 */
export function normalizeType(raw) {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    /* ACCENTS ARE FOLDED, NOT DELETED (2026-09-22). The beauty catalogue
       is the first whose types are written in Spanish, and "Uñas" hit the
       [^A-Z0-9] rule as U + (dropped) + AS -> "U_AS", which matches no
       token anyone would think to write. Decomposing first turns Ñ into
       N + a combining tilde, and only the tilde is stripped. No existing
       token changes: Macy's and SSENSE send pure ASCII. */
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/* One aisle per row, in the order they are shown. `types` are normalized
   tokens. Gendered departments share this table because the tokens are
   gender-neutral — a DRESS is a dress in Moda Mujer and in Moda Niños. */
export const SUBCATEGORY_SPEC = [
  { key: "dresses",      label: "Vestidos y faldas",     types: ["DRESS", "DRESSES", "SKIRT", "GOWN"] },
  { key: "tops",         label: "Tops y blusas",         types: ["TOP", "BLOUSE", "SHIRT", "TSHIRT", "T_SHIRT", "POLO", "HENLEY", "TANK_TOP"] },
  { key: "knitwear",     label: "Chompas y sudaderas",   types: ["SWEATER", "SWEATSHIRT", "HOODIE", "CARDIGAN",
                 "CREWNECK", "V_NECK", "TURTLENECK", "SHAWLNECK", "HOODIES_ZIPUPS", "KNIT"] },
  { key: "jeans",        label: "Jeans",                 types: ["JEANS", "DENIM"] },
  { key: "pants",        label: "Pantalones y shorts",   types: ["PANTS", "SHORTS", "TROUSERS", "LEGGINGS",
                 "CARGO_PANTS", "SWEATPANTS", "LEATHER_PANTS", "CHINOS"] },
  { key: "outerwear",    label: "Casacas y abrigos",     types: ["JACKET", "COAT", "BLAZER", "VEST",
                 "LEATHER_JACKETS", "BOMBER", "WAISTCOAT", "PARKA", "PUFFER"] },
  { key: "sets",         label: "Conjuntos y trajes",    types: ["SUIT", "OUTFIT", "JUMPSUIT", "ROMPER"] },
  { key: "swim",         label: "Ropa de baño",          types: ["SWIMSUIT", "SWIMWEAR", "BIKINI"] },
  { key: "shoes",        label: "Zapatos",               types: ["SHOE", "SHOES", "BOOT", "SANDAL", "SNEAKER",
                 "SLIPPERS_LOAFERS", "LACE_UPS_OXFORDS", "BOAT_SHOES_MOCCASINS",
                 "MONKSTRAP", "ESPADRILLE", "LOAFER", "OXFORD"] },
  { key: "bags",         label: "Bolsos y mochilas",     types: ["BACKPACK_MESSENGER", "BACKPACK", "HANDBAG", "BAG", "TOTE"] },
  { key: "accessories",  label: "Accesorios",            types: ["BELT", "SCARF", "SCARVES", "HAT", "JEWELRY", "WATCH", "SUNGLASSES", "WALLET",
                 "NECK_TIE", "TIE", "GLOVE", "CAP"] },
  /* LAST, DELIBERATELY. Grouped exactly as the brief grouped it, and
     placed where it stops being the thing you scroll past to reach a
     dress. */
  { key: "lingerie",     label: "Ropa interior y pijamas",
    types: ["BRA", "BRAS", "PANTY", "PANTIES", "UNDERWEAR", "LINGERIE", "SHAPEWEAR", "SLEEPWEAR", "ROBE", "SOCKS", "HOSIERY",
            "PYJAMAS_LOUNGEWEAR", "PYJAMA", "LOUNGEWEAR", "BOXER"] },

  /* ---- BEAUTY (2026-09-22) -------------------------------------
     The same mechanism, a different floor. These rows only ever fire
     for a beauty department, because no apparel export sends ROSTRO and
     no beauty export sends DRESS — which is why one table serves both
     and a third vertical needs no new code either.

     ORDER, again editorially: a beauty floor is walked base -> lips ->
     eyes -> skincare -> nails, and FRAGRANCE IS LAST for the same
     reason lingerie is. It is the restricted category (four per
     shipment), it is the smallest aisle in the catalogue, and putting
     it first would have it meet a shopper with a limit before a
     product.

     "BELLEZA" IS DELIBERATELY NOT HERE. 37 of the 197 items carry it,
     and it is the export's own catch-all — a lip gloss, an undereye
     patch, a pencil sharpener and a gift set all wear it. Filing them
     under a made-up aisle would be guessing; they stay in "Ver todo",
     which holds the whole department, and unmappedTypes() reports the
     token so it stays visible rather than becoming folklore. */
  { key: "face",        label: "Rostro",              types: ["ROSTRO", "FACE", "FOUNDATION", "CONCEALER", "BLUSH", "BRONZER", "HIGHLIGHTER", "PRIMER"] },
  { key: "lips",        label: "Labios",              types: ["LABIOS", "LIP", "LIPSTICK", "LIP_GLOSS", "LIP_BALM"] },
  { key: "eyes",        label: "Ojos",                types: ["OJOS", "EYE", "MASCARA", "EYELINER", "EYESHADOW", "BROW"] },
  { key: "skincare",    label: "Cuidado de la piel",  types: ["CUIDADO_DE_LA_PIEL", "SKINCARE", "SKIN_CARE", "MOISTURIZER", "SERUM", "CLEANSER", "SUNSCREEN", "MASK"] },
  { key: "nails",       label: "U\u00f1as",              types: ["UNAS", "NAIL", "NAIL_POLISH", "MANICURE"] },
  { key: "fragrance",   label: "Fragancia",           types: ["FRAGANCIA", "FRAGRANCE", "PERFUME", "EAU_DE_PARFUM", "COLOGNE", "BODY_MIST"] },
];

/** type token -> aisle key. Built once, from the rows above. */
const TYPE_TO_KEY = new Map();
for (const row of SUBCATEGORY_SPEC) {
  for (const t of row.types) TYPE_TO_KEY.set(normalizeType(t), row.key);
}

/**
 * The aisle a type token belongs to, or null.
 *
 * PLURALS ARE NOT A NEW VOCABULARY. Macy's says "JACKET"; SSENSE says
 * "JACKETS". Listing both spellings of every noun would double the table
 * and still miss the third retailer, so an exact miss falls back to the
 * singular. That alone placed JACKETS, SHIRTS, BLAZERS, SUITS,
 * SWEATSHIRTS, CARDIGANS, POLOS and T-SHIRTS when SSENSE landed.
 *
 * Compound and irregular tokens ("SLIPPERS & LOAFERS", "SCARVES") are
 * still written out, because guessing at those is how a shirt ends up
 * in the shoe aisle.
 */
export function subcategoryForType(rawType) {
  const t = normalizeType(rawType);
  if (!t) return null;
  const exact = TYPE_TO_KEY.get(t);
  if (exact) return exact;
  // "JACKETS" -> "JACKET". Only ever tried after an exact miss, so a
  // token that really ends in S ("PANTS", "JEANS") is never mangled.
  if (t.endsWith("S")) {
    const singular = TYPE_TO_KEY.get(t.slice(0, -1));
    if (singular) return singular;
  }
  return null;
}

export function subcategoryLabel(key) {
  return SUBCATEGORY_SPEC.find((r) => r.key === key)?.label || null;
}

/** The aisle an item belongs to, from whichever field its store used. */
export function subcategoryOfItem(item) {
  return subcategoryForType(item?.type ?? item?.typeName ?? item?.productType ?? null);
}

/**
 * Split a department's items into aisles.
 *
 * Returns only NON-EMPTY aisles, in SUBCATEGORY_SPEC order, plus the
 * counts a caller needs to decide whether splitting is worth doing at
 * all:
 *
 *   rows     [{ key, label, count }] — the aisles, in editorial order
 *   typed    how many items carry a type we could place
 *   total    how many items there are
 *   untyped  total - typed, which is what "Ver todo" alone still holds
 */
export function groupBySubcategory(items) {
  const bucket = new Map();
  /* A FACE FOR EACH AISLE (2026-09-22). An aisle card that is a word and
     a bar is a table of contents; Danny's standing rule for this site is
     that a shopper picks with their eyes. So each row carries the image
     of the FIRST item it holds — a real product photo from the store's
     own CDN, never an illustration and never an emoji.

     First, not "best": any deterministic pick is stable across renders,
     and the feed is already ordered the way the store sent it. A row
     whose items carry no image simply has none, and the card falls back
     to the text-only treatment rather than to a placeholder. */
  const face = new Map();
  let typed = 0;
  for (const item of items || []) {
    const key = subcategoryOfItem(item);
    if (!key) continue;
    typed += 1;
    bucket.set(key, (bucket.get(key) || 0) + 1);
    if (!face.has(key)) {
      const img = item?.image || (Array.isArray(item?.images) ? item.images[0] : null);
      if (typeof img === "string" && img) face.set(key, img);
    }
  }
  const rows = SUBCATEGORY_SPEC
    .filter((r) => bucket.get(r.key))
    .map((r) => ({ key: r.key, label: r.label, count: bucket.get(r.key), image: face.get(r.key) || null }));
  const total = (items || []).length;
  return { rows, typed, total, untyped: total - typed };
}

/* WHEN A SPLIT IS WORTH SHOWING. Three conditions, and all of them are
   about not making navigation worse:

     the feed is big enough that a flat list is the problem
     enough of it can actually be placed in an aisle, so the aisles are
       not a thin veneer over a mostly-untyped list
     there is more than one aisle, because a single aisle plus "Ver
       todo" is two routes to the same page

   A department that fails any of these renders exactly as it did
   before. */
export const SPLIT_MIN_ITEMS = 40;
export const SPLIT_MIN_TYPED_SHARE = 0.6;
export const SPLIT_MIN_AISLES = 3;

export function shouldSplit({ rows, typed, total }) {
  if (!total || total < SPLIT_MIN_ITEMS) return false;
  if (rows.length < SPLIT_MIN_AISLES) return false;
  return typed / total >= SPLIT_MIN_TYPED_SHARE;
}

/** Items in one aisle. An unknown key yields nothing, never everything. */
export function itemsInSubcategory(items, key) {
  if (!key) return items || [];
  return (items || []).filter((it) => subcategoryOfItem(it) === key);
}

/**
 * Types present in the data that no aisle claims.
 *
 * This is the maintenance hook: when a store adds a product type, it
 * lands in "Ver todo" and shows up here rather than disappearing. The
 * catalogue builder prints it, so a new type is noticed on the run that
 * introduces it instead of the quarter someone happens to look.
 */
export function unmappedTypes(items) {
  const out = new Map();
  for (const item of items || []) {
    const raw = item?.type ?? item?.typeName ?? item?.productType ?? null;
    const t = normalizeType(raw);
    /* Through the RESOLVER, not the raw table. Checking TYPE_TO_KEY
       directly reported every plural as an orphan while the grouping
       was placing it perfectly well — a maintenance report that sends
       someone chasing a problem that does not exist is worse than no
       report. */
    if (!t || subcategoryForType(t)) continue;
    out.set(t, (out.get(t) || 0) + 1);
  }
  return [...out.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count }));
}

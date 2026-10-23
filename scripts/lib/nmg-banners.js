/* ============================================================
   THE NEIMAN MARCUS GROUP BANNERS ON SOVRN (#443, Danny's order of
   2026-10-22: build all three, not Neiman Marcus alone).

   Each banner is its own Sovrn merchant listing (Lucifer verified them
   in the Sovrn account, read-only, c.6341843561):
     Neiman Marcus     merchant 2243
     Bergdorf Goodman  merchant 6756
     Horchow           merchant 666
   The Product Recommendation API filters by GROUP id
   (includeMerchants), which may not equal the merchant id: each banner
   has its own env var for it, and the first harvest call logs what the
   Approved Merchants API says. Nothing here guesses a group id.

   One builder serves all three (scripts/build-neimanmarcus-catalog.mjs
   --banner <key>): the same sweep, mapper, ingest, 30k selection,
   INGEST REPORT and Spanish step. A banner differs only in what is
   below: its key and label, the merchant id, the one host its source
   page URL may live on, the seller names that count as itself, its
   group-id env var, its catalogue file, its sweep plan and its target.

   HORCHOW IS PARCEL-ONLY (binding, Danny): Horchow is furniture-heavy
   and Aria does not ship freight-killers. A Horchow row enters the
   catalogue only when (1) it names one of the five parcel departments
   -- bedding, bath, tabletop, small decor, kitchen -- in its category
   or name, (2) it names no furniture, lighting, rug, mirror, wall art
   or other large piece, (3) its published weight (if any) is within
   the site's parcel limit, and (4) its published dimensions (if any)
   have no side over PARCEL_MAX_SIDE_CM. Anything else is dropped and
   counted, never used to pad the target.
   ============================================================ */

export const NMG_BANNERS = {
  neimanmarcus: {
    key: "neimanmarcus",
    label: "Neiman Marcus",
    merchantId: "2243",
    host: "neimanmarcus.com",
    sellerRx: /neiman\s*marcus/i,
    groupEnv: "NM_SOVRN_GROUP_ID",
    outFile: "neimanmarcus-catalog.json",
    sweepPlan: "scripts/neimanmarcus/sovrn-sweep-plan.json",
    target: 30000,
    quarantineSeller: "seller-not-neiman-marcus",
    parcelOnly: false,
  },
  bergdorfgoodman: {
    key: "bergdorfgoodman",
    label: "Bergdorf Goodman",
    merchantId: "6756",
    host: "bergdorfgoodman.com",
    sellerRx: /bergdorf(\s*goodman)?/i,
    groupEnv: "BG_SOVRN_GROUP_ID",
    outFile: "bergdorfgoodman-catalog.json",
    sweepPlan: "scripts/neimanmarcus/sovrn-sweep-plan-bergdorfgoodman.json",
    /* A ceiling, not a quota: the selection trims only a larger pool. */
    target: 30000,
    quarantineSeller: "seller-not-bergdorf-goodman",
    parcelOnly: false,
  },
  horchow: {
    key: "horchow",
    label: "Horchow",
    merchantId: "666",
    host: "horchow.com",
    sellerRx: /horchow/i,
    groupEnv: "HORCHOW_SOVRN_GROUP_ID",
    outFile: "horchow-catalog.json",
    sweepPlan: "scripts/neimanmarcus/sovrn-sweep-plan-horchow.json",
    target: 30000,
    quarantineSeller: "seller-not-horchow",
    parcelOnly: true,
  },
};

export const DEFAULT_BANNER = "neimanmarcus";

/** The banner config for a key (case-insensitive); throws on an unknown one. */
export function bannerOf(key = DEFAULT_BANNER) {
  if (key && typeof key === "object" && key.key && NMG_BANNERS[key.key] === key) return key;
  const b = NMG_BANNERS[String(key || DEFAULT_BANNER).toLowerCase().replace(/[\s_-]+/g, "")];
  if (!b) throw new Error(`unknown banner "${key}": one of ${Object.keys(NMG_BANNERS).join(", ")}`);
  return b;
}

/* ---------------- Horchow: the parcel filter ---------------- */

/* Longest published side a parcel may have. Larger is freight. */
export const PARCEL_MAX_SIDE_CM = 100;

/* The five parcel departments (Danny). Read in the category first, then the name. */
export const PARCEL_DEPARTMENTS = [
  ["bedding", /\b(bedding|sheets?|sheet\s*sets?|duvets?|duvet\s*covers?|comforters?|quilts?|coverlets?|shams?|pillow\s*cases?|pillowcases?|bed\s*skirts?|blankets?|throws?|decorative\s+pillows?|throw\s+pillows?|pillows?)\b/i],
  ["bath", /\b(bath|towels?|bath\s*mats?|bath\s*rugs?|robes?|shower\s*curtains?|soap\s*(dish(es)?|dispensers?|pumps?)|tumblers?|toothbrush\s*holders?|vanity\s*trays?|tissue\s*(box(es)?|covers?))\b/i],
  ["tabletop", /\b(tabletop|dinnerware|dinner\s*plates?|salad\s*plates?|plates?|bowls?|chargers?|flatware|cutlery|glassware|wine\s*glass(es)?|stemware|tumblers?|highballs?|coupes?|mugs?|cups?\s*(and|&)\s*saucers?|serveware|serving\s*(bowls?|platters?|trays?|pieces?)|platters?|pitchers?|carafes?|decanters?|ice\s*buckets?|barware|napkins?|napkin\s*rings?|placemats?|place\s*mats?|table\s*runners?|tablecloths?|table\s*linens?|coasters?|cake\s*stands?|salt\s*(and|&)\s*pepper)\b/i],
  ["small_decor", /\b(candles?|candle\s*holders?|candlesticks?|hurricanes?|votives?|vases?|picture\s*frames?|photo\s*frames?|frames?|decorative\s*(box(es)?|objects?|trays?|bowls?)|trays?|bookends?|figurines?|ornaments?|diffusers?|potpourri|boxes|trinket|jewelry\s*box(es)?|catchalls?|desk\s*accessories|paperweights?|faux\s*(flowers?|stems?|plants?)|wreaths?|garlands?|stockings?)\b/i],
  ["kitchen", /\b(kitchen|cookware|skillets?|saucepans?|fry\s*pans?|dutch\s*ovens?|bakeware|baking\s*(dish(es)?|sheets?|pans?)|cutting\s*boards?|cheese\s*boards?|charcuterie|utensils?|knives|knife\s*sets?|aprons?|oven\s*mitts?|pot\s*holders?|dish\s*towels?|tea\s*towels?|canisters?|storage\s*jars?|teapots?|tea\s*kettles?|kettles?|french\s*press|salad\s*servers?)\b/i],
];

/* Never a parcel at Horchow, whatever else the row says. */
export const HORCHOW_FREIGHT_RX = /\b(furniture|sofas?|sectionals?|loveseats?|settees?|couch(es)?|chaises?|(arm|accent|dining|side|desk|office|lounge|swivel|club|wing|counter|bar)\s*chairs?|chairs?|recliners?|ottomans?|poufs?|benches|bench|stools?|(coffee|side|end|accent|console|dining|cocktail|bedside|occasional|writing|game|bistro|nesting|garden|patio|outdoor|drum|pedestal)\s+tables?|desks?|vanit(y|ies)(?!\s*trays?)|dressers?|chests?(\s*of\s*drawers)?|nightstands?|night\s*stands?|cabinets?|curio|consoles?|credenzas?|sideboards?|buffets?|hutch(es)?|armoires?|wardrobes?|bookcases?|book\s*shelves|bookshelves|etageres?|shelving|bar\s*carts?|trunks?|beds?(?!\s*(skirts?|sheets?|linens?|spreads?|ding))|bed\s*frames?|headboards?|daybeds?|mattress(es)?|(area|accent|hand[-\s]*knotted|wool|outdoor)\s*rugs?|rugs?(?<!bath\s*rugs?)|runners?(?<!table\s*runners?)|mirrors?|lamps?|lighting|chandeliers?|pendants?|sconces?|floor\s*lamps?|wall\s*art|canvas(es)?|paintings?|art\s*prints?|framed\s*art|sculptures?|statues?|screens?|room\s*dividers?|planters?|fountains?|umbrellas?|fire\s*pits?|hammocks?)\b/i;

const first = (...vals) => {
  for (const v of vals) if (v !== undefined && v !== null && v !== "") return v;
  return null;
};
const crumbText = (raw) => {
  const c = first(raw.breadcrumbs, raw.breadcrumb, raw.categories, raw.category, raw.productType);
  if (Array.isArray(c)) return c.map((x) => (x && typeof x === "object" ? first(x.name, x.label, x.title) || "" : String(x))).join(" ");
  return c == null ? "" : String(c);
};

/** The parcel department a row names (category first, then name), or null. */
export function parcelDepartmentOf(raw) {
  const crumbs = crumbText(raw);
  const name = String(first(raw.name, raw.title, raw.productName) || "");
  for (const where of [crumbs, name]) for (const [dept, rx] of PARCEL_DEPARTMENTS) if (rx.test(where)) return dept;
  return null;
}

/** Longest side, in cm, of a published dimensions text ("12 x 8 x 4 in", "40 cm W x ..."), or null. */
export function longestSideCm(text) {
  if (text == null) return null;
  const s = String(text).toLowerCase();
  const nums = (s.match(/\d+(\.\d+)?/g) || []).map(Number).filter((n) => n > 0);
  if (!nums.length) return null;
  const cm = /\bcm\b|centimet/.test(s) ? 1 : /\bmm\b/.test(s) ? 0.1 : /\b(ft|feet|foot)\b|'/.test(s) && !/\bin\b|"|inch/.test(s) ? 30.48 : /\bm\b|met(er|re)s?\b/.test(s) && !/\bin\b|"|inch/.test(s) ? 100 : 2.54;
  return Math.max(...nums) * cm;
}

/**
 * Horchow's parcel verdict: null when the row may enter, else the drop
 * reason. `item` is the ingested item (weightKg, dimensions) when there
 * is one; `isShippableItem` is the site's own rule (index.html).
 */
export function parcelVerdict(raw, item = null, { isShippableItem = null } = {}) {
  const crumbs = crumbText(raw);
  const name = String(first(raw.name, raw.title, raw.productName) || "");
  if (HORCHOW_FREIGHT_RX.test(name) || HORCHOW_FREIGHT_RX.test(crumbs)) return "not-parcel-freight";
  if (!parcelDepartmentOf(raw)) return "not-parcel-department";
  if (item) {
    if (typeof isShippableItem === "function" && !isShippableItem(item)) return "not-parcel-site-rule";
    const side = longestSideCm(item.dimensions);
    if (side != null && side > PARCEL_MAX_SIDE_CM) return "not-parcel-dimensions";
  }
  return null;
}

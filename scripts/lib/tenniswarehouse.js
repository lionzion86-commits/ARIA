/* ============================================================
   TENNIS WAREHOUSE — THE 2026-11-01 STORE-SWEEP DELIVERY, NORMALISED
   (#443 c.6565357697, c.6578887587).

   The delivery (branch data/store-sweep-2026-11-01,
   data/store-sweep-2026-11-01/tenniswarehouse-catalog.json, with its
   tenniswarehouse-report.md) is an assembled catalogue envelope: twelve
   departments, real tennis-warehouse.com rows, USD prices, photos,
   estimated weights. Pure functions only; the builder is
   scripts/build-tenniswarehouse-catalog.mjs.

   THE RULES
   - WHAT A PRODUCT IS decides its aisle (category from the real product
     type, never the listing it was harvested from): the delivery filed
     skirts under Pelotas and overgrip packs under Cuerdas. Each item
     keeps its delivered department unless its own name says it is
     something else (whatItIs below); a moved garment or shoe takes its
     gender from its name.
   - NO IMAGE, NO CARD; no price, no product; the same name and photo
     listed twice is one product.
   - SIZES exactly as the source exposed them; a label the scrape caught
     in place of a size ("US Men's Shoe Size:") is not a size. A shoe, a
     garment or a racquet (grip size) with no size list is shown, not
     sold (`sizesPending`, scripts/lib/sizes-pending.js). Never invented.
   - DESCRIPTIONS Spanish only: from the description memory
     (scripts/lib/description-es.js) when it holds one; otherwise none
     is shown and the English stays as description_en.
   ============================================================ */
export const TW_KEY = "tenniswarehouse";
export const TW_LABEL = "Tennis Warehouse";
export const OUT_FILE = "tenniswarehouse-catalog.json";

/* The storefront order (#443 c.6578887587): ropa mujer / hombre / junior,
   zapatos, raquetas, cuerdas, grips, pelotas, bolsos, accesorios. */
export const DEPT_ORDER = [
  "ropa-mujer", "ropa-hombre", "ropa-junior",
  "zapatos-mujer", "zapatos-hombre", "zapatos-junior",
  "raquetas", "cuerdas", "grips", "pelotas", "bolsos", "accesorios",
];
export const DEPT_LABELS = {
  "ropa-mujer": "Ropa de mujer", "ropa-hombre": "Ropa de hombre", "ropa-junior": "Ropa de niños",
  "zapatos-mujer": "Zapatos de mujer", "zapatos-hombre": "Zapatos de hombre", "zapatos-junior": "Zapatos de niños",
  raquetas: "Raquetas de tenis", cuerdas: "Cuerdas", grips: "Grips y overgrips",
  pelotas: "Pelotas de tenis", bolsos: "Bolsos y mochilas", accesorios: "Accesorios",
};

const family = (dept) => String(dept || "").split("-")[0];

/* The kind of thing a name names, or null when the name alone cannot
   tell (then the delivered department stands). First match wins: a
   "Pure Drive 6 Pack Bag" is a bag, an "Overgrip 12 Pack" a grip. */
const RULES = [
  ["accesorios", /\b(ball\s+(hopper|tube|pick[- ]?up|machine|launcher|basket)|hoppers?|stringing\s+machines?|grommets?|bumper\s+guards?|butt\s+caps?|dampeners?|vibration|lead\s+tape|weight\s+tape|stencil|string\s+savers?|clamps?|cutters?|tools?|awls?|pliers|inserts?|insoles?|towels?)\b/i],
  ["bolsos", /\b(bags?|backpacks?|duffle|duffel|totes?)\b/i],
  ["grips", /\b(over\s?grips?|replacement\s+grips?|grip\s+tape|grips?|rosin)\b/i],
  ["cuerdas", /\b(strings?|string\s+reel)\b/i],
  ["pelotas", /\b(tennis\s+balls?|pickleballs?|balls?)\b/i],
  ["zapatos", /\b(shoes?|sneakers?)\b/i],
  ["ropa", /\b(skirts?|skorts?|dress(es)?|tanks?|tops?|tees?|t-shirts?|shirts?|polos?|shorts?|pants?|jackets?|hoodies?|sweatshirts?|pullovers?|leggings?|tights|bras?|socks?|joggers?|vests?|crews?|sweaters?|shorties?|rompers?|jumpsuits?|bodysuits?|capris?|hats?|visors?|caps?|beanies?|headbands?|wristbands?|tight|long\s+sleeve|(1\/4|1\/2|half|quarter)\s+zip|henley|cardigan|crewneck|skapri|skirty|pajamas?)\b/i],
];
export function kindsOf(name) {
  const n = String(name || "");
  return RULES.filter(([, rx]) => rx.test(n)).map(([kind]) => kind);
}
export function whatItIs(name) {
  return kindsOf(name)[0] || null;
}

/* Gender from the name: the junior words first (a "Girl's Tank" is a
   child's), then women's, then men's. */
export function genderOf(name) {
  const n = String(name || "");
  if (/\b(junior|jr\.?|youth|kids?'?|girls?'?s?|boys?'?s?|toddlers?|gs)\b/i.test(n)) return "junior";
  if (/\b(women'?s?|womens|wom'?s|ladies|female)\b/i.test(n)) return "mujer";
  if (/\b(men'?s?|mens|male)\b/i.test(n)) return "hombre";
  return null;
}

/** The department an item belongs in. */
export function twDept(name, delivered) {
  /* The delivered aisle stands whenever the name agrees with it at all
     (a "Grip Sock" in Ropa is a sock; a "Bag" in Bolsos is a bag). */
  const kinds = kindsOf(name);
  const kind = kinds[0];
  if (!kind || kinds.includes(family(delivered))) return delivered;
  /* A racquet's own listing names its grip, string and bag in passing
     ("Pure Drive" bags are bags, but a racquet called "... Strung" is a
     racquet): only a bag, a ball or a part moves a racquet out. */
  if (delivered === "raquetas" && !["bolsos", "pelotas", "accesorios"].includes(kind)) return delivered;
  if (kind === "zapatos" || kind === "ropa") {
    const g = genderOf(name) || (["zapatos", "ropa"].includes(family(delivered)) ? delivered.split("-")[1] : null);
    return g ? `${kind}-${g}` : (kind === "ropa" ? "accesorios" : delivered);
  }
  return kind;
}

/* A size the source exposed, or nothing: a field label is not a size. */
export function cleanSizes(list) {
  const out = [];
  for (const s of Array.isArray(list) ? list : []) {
    const v = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    if (!v || /:$/.test(v) || /^(select|choose|size)\b/i.test(v)) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

export function needsSize(dept) {
  const f = family(dept);
  return f === "ropa" || f === "zapatos" || dept === "raquetas";
}

/**
 * The delivered envelope in, the served catalogue out, plus what moved
 * and what was left out. `spanishFor(english)` is the description
 * memory lookup.
 */
export function normalizeTennisWarehouse(delivered, { spanishFor = () => null, isShippableItem = null } = {}) {
  const src = delivered && delivered.retailers && delivered.retailers[TW_KEY];
  if (!src || !src.departments) throw new Error("not a Tennis Warehouse catalogue envelope (retailers.tenniswarehouse.departments)");
  const departments = {};
  const moved = [];
  const held = { noImage: 0, noPrice: 0, unshippable: 0, junkSizes: 0, duplicate: 0 };
  /* One product, one card: the same name with the same photo listed twice
     (two harvest pages) is one product -- the first copy stays. */
  const seen = new Set();
  for (const [dept, d] of Object.entries(src.departments)) {
    for (const it0 of (d && d.items) || []) {
      const it = { ...it0, retailer: TW_KEY };
      if (!(Number(it.price) > 0)) { held.noPrice++; continue; }
      if (!/^https?:\/\//.test(String(it.image || ""))) { held.noImage++; continue; }
      if (typeof isShippableItem === "function" && !isShippableItem(it)) { held.unshippable++; continue; }
      const dupKey = it.name + "||" + it.image;
      if (seen.has(dupKey)) { held.duplicate++; continue; }
      seen.add(dupKey);
      const to = twDept(it.name, dept);
      if (to !== dept) moved.push({ name: it.name, from: dept, to });
      const sizes = cleanSizes(it.availableSizes);
      if (sizes.length !== (it.availableSizes || []).length) held.junkSizes++;
      it.availableSizes = sizes;
      if (!sizes.length) it.sizeSource = "none";
      if (!sizes.length && needsSize(to)) it.sizesPending = true; else delete it.sizesPending;
      if (!(it.originalPrice > it.price)) { delete it.originalPrice; it.onSale = false; }
      const en = String(it.description_en || it.description || "").trim();
      if (en) {
        const es = spanishFor(en);
        it.description = es || "";
        it.description_en = en;
        if (!es) delete it.descriptionSource;
      }
      (departments[to] = departments[to] || { label: DEPT_LABELS[to] || to, items: [] }).items.push(it);
    }
  }
  const ordered = {};
  for (const k of DEPT_ORDER) if (departments[k]) ordered[k] = departments[k];
  for (const k of Object.keys(departments)) if (!ordered[k]) ordered[k] = departments[k];
  const count = Object.values(ordered).reduce((n, x) => n + x.items.length, 0);
  return {
    catalog: {
      generatedAt: delivered.generatedAt || new Date().toISOString(),
      source: delivered.source || "tennis-warehouse.com (Apify pull 2026-11-01)",
      declaredProductCount: count,
      retailers: { [TW_KEY]: { label: TW_LABEL, departments: ordered } },
    },
    moved,
    held,
  };
}

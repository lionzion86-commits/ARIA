/* ============================================================
   AUTO CATALOG — the browsable parts catalogue behind the AutoZone
   and RockAuto storefronts.

   The cached pulls (auto-cache.json) are query-indexed: one entry per
   (vehicle, search-term) with that query's results. A storefront needs
   the opposite shape — one de-duplicated parts list per SOURCE, with
   every part filed under a category — so this module flattens the
   cache into exactly that, data-agnostically: whatever sources and
   fields a future pull (RockAuto) brings get the same treatment.

   It also holds the pure merchandising logic:
   - SALE-FIRST ordering: anything marked down leads, biggest discount
     first (the same sale-first brief as the retail carousels).
   - SIMILAR PARTS: same part type first, then same brand, then the
     same category — the ordering under every part's detail view.
   - CATALOG LOOKUP: brand, part name and part number search over the
     cached catalogue (live search stays the fallback).

   index.html mirrors this module line for line (a plain <script>
   cannot import) and the test suite pins both copies.
   ============================================================ */

/* Category filing. part_type values are whatever the source's actor
   returned (English, e.g. "Brake Pads"); the label is what the
   shopper reads. Accessories is a real slot even while the pulls
   carry none yet — the storefront renders it as "Próximamente"
   rather than pretending the shelf does not exist. */
export const AUTO_CATALOG_CATEGORIES = [
  {
    key: "brakes",
    label: "Frenos",
    types: [
      "Brake Pads", "Brake Rotor", "Brake Shoes", "Disc Brake Kit",
      "Brake Pad Wear Sensor", "Brake Fluid", "Brake Caliper Guide Pin Bolt",
      "Brake Caliper Piston Tool", "Brake Caliper",
    ],
  },
  {
    key: "ignition",
    label: "Encendido",
    types: [
      "Spark Plugs", "Spark Plug Boots & Wires", "Spark Plug Tube Seal",
      "Spark Plug Wire Heat Sleave", "Spark Plug Socket", "Ignition Coil",
      "Distributor Cap",
    ],
  },
  {
    key: "filters",
    label: "Filtros y aceite",
    types: [
      "Oil Filter", "Motor Oil", "Oil Filter Wrenches",
      "Oil Filter Housing & Cap", "Oil Drain Plug", "Coolant Filter",
      "Cabin Air Filter", "Air Filter", "Fuel Filter",
    ],
  },
  {
    key: "wipers",
    label: "Limpiaparabrisas",
    types: [
      "Windshield Wiper Blade", "Windshield Washer Fluid",
      "Glass Cleaners & Treatment",
    ],
  },
  {
    key: "accessories",
    label: "Accesorios",
    types: [
      "Air Freshener", "Keychain", "Key Chain", "Stickers", "Decals",
      "Seat Cover", "Antenna Topper", "Antenna Cover",
      "Steering Wheel Cover", "Floor Mat", "Trash Can", "Organizer",
    ],
  },
];

export const AUTO_CATALOG_OTHER = { key: "other", label: "Otros repuestos" };

function normType(t) {
  return String(t || "").trim().toLowerCase();
}

/* File one part_type under its category. Unknown types land in
   "Otros repuestos" rather than vanishing. */
export function autoCategoryOf(partType) {
  const want = normType(partType);
  if (!want) return AUTO_CATALOG_OTHER;
  for (const cat of AUTO_CATALOG_CATEGORIES) {
    if (cat.types.some((t) => normType(t) === want)) return { key: cat.key, label: cat.label };
  }
  return AUTO_CATALOG_OTHER;
}

function numOrNull(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/* The catalogue's dedupe key: same source + same part number is the
   same part, however many queries returned it. Parts without a number
   fall back to the title — a weaker key, but better than printing the
   same listing twice. */
export function autoPartKey(sourceKey, partNumber, title) {
  const pn = String(partNumber || "").trim().toLowerCase();
  const t = String(title || "").trim().toLowerCase();
  return `${sourceKey}::${pn || t}`;
}

/* Discount off the list price, 0 when the pull carries no sale fields.
   Sale-first ordering degrades to stable order on data without sales
   instead of breaking — the 2026-09 pulls have no was_price yet. */
export function autoDiscountPct(raw) {
  const price = numOrNull(raw && (raw.discounted_price ?? raw.price));
  const was = numOrNull(raw && raw.was_price);
  if (price == null || was == null || was <= price) return 0;
  return Math.round(((was - price) / was) * 100);
}

function autoImageOf(raw) {
  if (!raw) return "";
  const cands = [raw.image, raw.imageUrl, raw.thumbnail];
  if (Array.isArray(raw.images)) cands.push(...raw.images);
  for (const c of cands) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

/* One flat, de-duplicated parts list per source, straight out of the
   query-indexed cache. Keeps the raw payload: the card builders and
   the detail view read fitment, specs and part number from it. */
export function buildAutoCatalogIndex(partSearches) {
  const index = {};
  const seen = new Set();
  for (const queries of Object.values(partSearches || {})) {
    for (const [sourceKey, items] of Object.entries(queries || {})) {
      if (!Array.isArray(items)) continue;
      for (const raw of items) {
        if (!raw) continue;
        const partNumber = raw.part_number || raw.partNumber || "";
        const title = raw.title || raw.productTitle || raw.name || "";
        const key = autoPartKey(sourceKey, partNumber, title);
        if (seen.has(key)) continue;
        seen.add(key);
        const partType = raw.part_type || raw.partType || "";
        const price = numOrNull(raw.discounted_price ?? raw.price);
        (index[sourceKey] = index[sourceKey] || []).push({
          sourceKey,
          key,
          partNumber: String(partNumber || ""),
          title,
          brand: String(raw.brand || ""),
          partType: String(partType || ""),
          categoryKey: autoCategoryOf(partType).key,
          price,
          wasPrice: numOrNull(raw.was_price),
          discountPct: autoDiscountPct(raw),
          image: autoImageOf(raw),
          raw,
        });
      }
    }
  }
  return index;
}

/* The storefront's category tiles: only categories the source actually
   carries, in catalogue order, "other" last. Accessories is added by
   the page as a permanent tile even at zero — the slot matters. */
export function autoCatalogCategories(parts) {
  const groups = new Map();
  for (const p of parts || []) {
    if (!p) continue;
    if (!groups.has(p.categoryKey)) groups.set(p.categoryKey, []);
    groups.get(p.categoryKey).push(p);
  }
  const order = new Map(AUTO_CATALOG_CATEGORIES.map((c, i) => [c.key, i]));
  return [...groups.entries()]
    .map(([key, items]) => {
      const cat = AUTO_CATALOG_CATEGORIES.find((c) => c.key === key);
      return { key, label: cat ? cat.label : AUTO_CATALOG_OTHER.label, items, count: items.length };
    })
    .sort((a, b) => (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999));
}

/* SALE-FIRST: marked-down parts lead, biggest discount first; stable
   otherwise. Data-agnostic — a pull with no sale fields keeps its own
   order instead of erroring. */
export function saleFirstAutoParts(items) {
  return (items || [])
    .map((it, i) => [it, i])
    .filter(([it]) => it && it.discountPct > 0)
    .sort((a, b) => b[0].discountPct - a[0].discountPct || a[1] - b[1])
    .map(([it]) => it);
}

function autoAnchorOf(a) {
  return {
    key: a && a.key ? String(a.key) : "",
    partType: normType(a && a.partType),
    brand: normType(a && a.brand),
    categoryKey: normType(a && a.categoryKey),
  };
}

/* SIMILAR PARTS, in the brief's order: same part type first, then the
   same brand, then the same category, then everything else. Photos
   lead inside each tier (a rail is for looking); order is otherwise
   the catalogue's own, never shuffled. The anchor and duplicates are
   out; the rail is capped (default 14, the brief's 12–16 band). */
export const SIMILAR_AUTO_MAX = 14;

export function similarAutoParts(anchorIn, pool, max) {
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : SIMILAR_AUTO_MAX;
  const anchor = autoAnchorOf(anchorIn);
  const tiers = [[], [], [], []];
  const seen = new Set();
  if (anchor.key) seen.add(anchor.key);
  for (const p of pool || []) {
    if (!p || !p.key || seen.has(p.key)) continue;
    seen.add(p.key);
    const a = autoAnchorOf(p);
    let tier = 3;
    if (anchor.partType && a.partType === anchor.partType) tier = 0;
    else if (anchor.brand && a.brand === anchor.brand) tier = 1;
    else if (anchor.categoryKey && a.categoryKey === anchor.categoryKey) tier = 2;
    tiers[tier].push(p);
  }
  const photoFirst = (list) => {
    const withPhoto = [];
    const without = [];
    for (const p of list) (p.image ? withPhoto : without).push(p);
    return withPhoto.concat(without);
  };
  return tiers.map(photoFirst).flat().slice(0, limit);
}

/* CATALOG LOOKUP: brand, part name, part number. A bare brand ("duralast")
   pulls that brand's shelf; a part number ("D2076") jumps straight to
   the part; anything else matches title / type / category words.
   Ranked: number > brand > title > category. Empty query matches
   nothing — the page, not this function, decides the fallback. */
export function searchAutoCatalog(parts, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const scored = [];
  for (const p of parts || []) {
    if (!p) continue;
    const pn = normType(p.partNumber);
    const brand = normType(p.brand);
    const title = normType(p.title);
    const type = normType(p.partType);
    const catLabel = normType(
      (AUTO_CATALOG_CATEGORIES.find((c) => c.key === p.categoryKey) || AUTO_CATALOG_OTHER).label
    );
    let score = 0;
    if (pn && pn === q) score = 100;
    else if (pn && pn.includes(q)) score = 60;
    else if (brand && tokens.some((t) => t === brand)) score = 50;
    else if (brand && brand.includes(q)) score = 40;
    else if (tokens.length && tokens.every((t) => title.includes(t))) score = 30;
    else if (tokens.some((t) => title.includes(t) || type.includes(t))) score = 20;
    else if (catLabel && catLabel.includes(q)) score = 10;
    if (score > 0) scored.push([p, score]);
  }
  return scored
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p);
}

/* ============================================================
   CALZEDONIA + INTIMISSIMI -- the 2026-10-29 drop (#443 c.6512405832,
   Danny c.6512451192: two separate stores, each with its own tile and
   store page, and a carousel each under Lencería).

   The drop is on branch data/calzedonia-intimissimi-2026-10-29, folder
   data-drops/2026-10-29-calzedonia-intimissimi/ (intimissimi.json,
   calzedonia.json, manifest.json). What these rules decide:

     - in stock on the store's own page only;
     - one aisle per the drop's subcategory, in Spanish;
     - the photos the drop captured, never a constructed one;
     - the drop's weight is an ESTIMATE (neither storefront publishes
       one): it rides as weightKg with weightEstimated + its basis;
     - Calzedonia's records carry no size run: shown, not sold
       (sizesPending, scripts/lib/sizes-pending.js) -- sizes are never
       invented;
     - no compare-at price was exposed: nothing is marked on sale.

   The Spanish descriptions are the drop's machine translation of the
   store's own text. A few words came out in Spain's Spanish or plainly
   wrong ("vasos de encaje" for lace cups); SPANISH_FIXES corrects those
   to the words a Peruvian shopper reads. Nothing else is rewritten.
   ============================================================ */

export const STORES = {
  intimissimi: {
    label: "Intimissimi",
    aisles: { bras: "brasieres", panties: "calzones", bodysuits: "bodies", slips_babydolls: "babydolls" },
    order: ["brasieres", "calzones", "bodies", "babydolls"],
    labels: { brasieres: "Brasieres", calzones: "Calzones", bodies: "Bodies", babydolls: "Babydolls y camisones" },
    /* The type each aisle files under, in the words the Lencería rules
       (ropa-interior-engine.js) and the Mujer rails read. */
    types: { brasieres: "Sostenes", calzones: "Ropa interior", bodies: "Lencería", babydolls: "Lencería" },
  },
  calzedonia: {
    label: "Calzedonia",
    aisles: { tights: "medias_panty", stockings: "medias_altas", leggings: "leggings" },
    order: ["medias_panty", "medias_altas", "leggings"],
    labels: { medias_panty: "Medias panty", medias_altas: "Medias altas", leggings: "Leggings" },
    types: { medias_panty: "Medias", medias_altas: "Medias", leggings: "Leggings" },
  },
};

const SPANISH_FIXES = [
  [/\bsujetadores\b/gi, "brasieres"], [/\bsujetador\b/gi, "brasier"],
  [/\bbragas\b/gi, "calzones"], [/\bbraga\b/gi, "calzón"],
  [/\bvasos\b/gi, "copas"], [/\bvaso\b/gi, "copa"],
];
export function fixSpanish(text) {
  let t = String(text || "");
  for (const [rx, to] of SPANISH_FIXES) t = t.replace(rx, (m) => (m[0] === m[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to));
  return t.trim();
}

const realPhoto = (u) => typeof u === "string" && /^https:\/\//.test(u);

export function normalizeStore(key, rows) {
  const cfg = STORES[key];
  const held = {};
  const hold = (why) => { held[why] = (held[why] || 0) + 1; };
  const seen = new Set();
  const departments = {};
  for (const r of rows) {
    if (!r || r.store !== key) continue;
    if (r.availability !== "InStock" || r.inStock !== true) { hold("out of stock on its page"); continue; }
    const aisle = cfg.aisles[r.subcategory];
    if (!aisle) { hold("no aisle"); continue; }
    const id = r.sku || r.url;
    if (seen.has(id)) { hold("duplicate"); continue; }
    seen.add(id);
    const price = Number(r.price);
    if (!(price > 0)) { hold("no price"); continue; }
    const images = [r.image, ...(Array.isArray(r.images) ? r.images : [])].filter(realPhoto).filter((u, i, a) => a.indexOf(u) === i);
    if (!images.length) { hold("no photo"); continue; }
    const name = String(r.name || "").trim();
    if (!name) { hold("no name"); continue; }
    const it = { name, brand: cfg.label, price, currency: "USD", image: images[0], images,
      url: r.url || "", sku: String(r.sku || ""),
      description: fixSpanish(r.description), description_en: String(r.description_en || "").trim(),
      retailer: key, type: cfg.types[aisle], department: "women" };
    const sizes = Array.isArray(r.sizes) ? r.sizes.map((s) => String(s).trim()).filter(Boolean) : [];
    if (sizes.length) it.sizes = sizes;
    else it.sizesPending = true;
    const kg = Number(r.weightKg) > 0 ? Number(r.weightKg) : Number(r.weightEstimateKg);
    if (kg > 0) {
      it.weightKg = kg;
      if (!(Number(r.weightKg) > 0)) { it.weightEstimated = true; it.weightSource = String(r.weightEstimateBasis || "estimado").slice(0, 160); }
    }
    (departments[aisle] ||= { label: cfg.labels[aisle], items: [] }).items.push(it);
  }
  const ordered = {};
  for (const k of cfg.order) if (departments[k]) ordered[k] = departments[k];
  return { departments: ordered, held };
}

/* Every aisle key, for the Mujer department's buckets. */
export const CI_BUCKETS = Object.values(STORES).flatMap((s) => s.order);

/* ============================================================
   SLEEKSHOP -- the 2026-10-28 hair-treatment pull into the catalogue
   (#443 c.6475799491; drop sleekshop-2026-10-28). The keratin and
   alisado shelf the Cabello aisle was missing: 271 keratin and 82
   alisado products in the drop.

   What sells:
   - in stock on its own page only (half the drop is out of stock: it
     cannot be bought, so it is not listed);
   - the store's own photo and price; a was-price only where the page
     shows one above the price;
   - Spanish copy only where it was translated from the page's own text;
     the drop's title-template lines ("Tratamiento de keratina
     profesional de X: <title>") are left empty, never shown as copy;
   - courier holds, counted, never deleted: aerosols (hairspray, dry
     shampoo) and chemical relaxers (corrosive) wait for a courier ruling;
   - THE WEIGHT: the store publishes none. A liquid weighs what its
     stated volume weighs: the size the page states (fl oz, ml, g) plus
     20% for the bottle, then the estimado cushion (+10%), flagged
     weightEstimated. A kit sums the sizes it states. With no stated
     size the house weight table answers (apply-weight-estimates.py).
   Aisle keys are cab_*: unique to this store, Belleza's (TECH_BUCKETS'
   pattern, scripts/lib/brandsmart.js).
   ============================================================ */

export const AISLES = {
  keratin_treatment: "cab_keratina", keratin_care: "cab_keratina", alisado_straightening: "cab_keratina",
  mask: "cab_mascarillas", deep_conditioner: "cab_mascarillas",
  bond_repair: "cab_reparacion",
  oil: "cab_aceites", serum: "cab_aceites",
  scalp: "cab_cuero",
  leave_in: "cab_sin_enjuague",
  shampoo: "cab_champu", conditioner: "cab_champu",
  treatment_other: "cab_tratamientos",
};
export const AISLE_LABELS = {
  cab_keratina: "Keratina y alisados", cab_mascarillas: "Mascarillas", cab_reparacion: "Reparación",
  cab_aceites: "Aceites y sérums", cab_cuero: "Cuero cabelludo", cab_sin_enjuague: "Sin enjuague",
  cab_champu: "Champú y acondicionador", cab_tratamientos: "Más tratamientos",
};
export const AISLE_ORDER = ["cab_keratina", "cab_mascarillas", "cab_reparacion", "cab_aceites", "cab_cuero",
  "cab_sin_enjuague", "cab_champu", "cab_tratamientos"];
export const CAB_BUCKETS = AISLE_ORDER;

const AEROSOL_RX = /\baerosol\b|\bdry shampoo\b|\bhair ?spray\b/i;
const RELAXER_RX = /\brelaxers?\b|\bno[- ]lye\b|\blye\b|\bperm(anent wave)?\b/i;
const SIZE_RX = /(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|oz|ml|liters?|litres?|l\b|g\b|grams?)/gi;
const KIT_RX = /\b(kit|system|set|duo|trio)\b/i;

/** Grams of product the page states (a kit sums its stated sizes), or 0. */
export function statedGrams(r) {
  const txt = [r.size, r.title, String(r.description_full_en || "").slice(0, 300)].filter(Boolean).join(" ");
  const g = [];
  for (const m of txt.matchAll(SIZE_RX)) {
    const n = Number(m[1]), u = m[2].toLowerCase().replace(/\s|\./g, "");
    const grams = u === "floz" || u === "oz" ? n * 29.57 : u === "ml" || u === "g" || u.startsWith("gram") ? n : n * 1000;
    if (grams > 0 && grams < 5000) g.push(grams);
  }
  if (!g.length) return 0;
  return KIT_RX.test(r.title) ? g.slice(0, 4).reduce((a, b) => a + b, 0) : g[0];
}

const realPhoto = (u) => typeof u === "string" && /^https:\/\//.test(u);

export function normalizeSleekshop(rows, { isShippableItem } = {}) {
  const held = {};
  const hold = (why) => { held[why] = (held[why] || 0) + 1; };
  const seen = new Set();
  const departments = {};
  for (const r of rows) {
    if (!r || r.store !== "sleekshop") continue;
    if (r.availability !== "InStock") { hold("out of stock on its page"); continue; }
    const aisle = AISLES[r.category];
    if (!aisle) { hold("no aisle"); continue; }
    const key = r.sku || r.url;
    if (seen.has(key)) { hold("duplicate"); continue; }
    seen.add(key);
    const price = Number(r.price);
    if (!(price > 0)) { hold("no price"); continue; }
    const images = (Array.isArray(r.images) && r.images.length ? r.images : [r.image]).filter(realPhoto);
    if (!images.length) { hold("no photo"); continue; }
    const name = String(r.title).trim();
    if (AEROSOL_RX.test(name)) { hold("aerosol (courier ruling)"); continue; }
    if (RELAXER_RX.test(name)) { hold("chemical relaxer (courier ruling)"); continue; }
    const translated = r.description_source === "pdp";
    /* The store's own tool words in a brand field ("GHD Flat Iron
       Straightener" on a GHD serum) are not the brand. */
    const brand = String(r.brand || "").trim().replace(/\s+(flat iron|straightener|hair dryer|curling iron)\b.*$/i, "");
    const it = { name, brand, price, currency: "USD", image: images[0], images,
      url: r.url || "", sku: String(r.sku || ""), upc: r.upc || undefined,
      description: translated ? String(r.description || "").trim() : "", description_en: String(r.description_en || "").trim(),
      retailer: "sleekshop", type: "HAIR CARE", department: "beauty", treatment: r.treatment_types || [] };
    if (!it.upc) delete it.upc;
    const was = Number(r.compare_at_price);
    if (r.on_sale === true && was > price) { it.originalPrice = was; it.onSale = true; }
    const g = statedGrams(r);
    if (g > 0) { it.weightKg = Math.round((g * 1.2 * 1.1) / 10) / 100; it.weightEstimated = true; it.weightSource = "stated size + bottle, +10%"; }
    if (isShippableItem && !isShippableItem(it)) { hold("site-unshippable"); continue; }
    (departments[aisle] ||= { label: AISLE_LABELS[aisle], items: [] }).items.push(it);
  }
  const ordered = {};
  for (const k of AISLE_ORDER) if (departments[k]) ordered[k] = departments[k];
  return { departments: ordered, held };
}

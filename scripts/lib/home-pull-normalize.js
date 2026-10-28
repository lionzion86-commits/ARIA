/* ============================================================
   CRATE & BARREL + PIER 1 -> CASA ARIA (#443 c.6458486219, the build
   order c.6459811185, pulls c.6457579787).

   Light home only (the build order): furniture, rugs, outdoor furniture,
   trees and anything over the 5 kg cap are cut at slice time. The cap
   counts the estimate: neither store publishes a weight, so each kept
   item carries a weight estimated from its own category (the estimado
   doctrine: padded +10%, flagged `weightEstimated`, `weightBasis` says
   which category). An item whose category has no defensible estimate
   stays OUT of v1 -- nothing is guessed.

   Only captured data: the store's own photos (Pier 1's Shopify CDN URLs
   arrive as http:// -- the same URL is served over https, and only the
   scheme is changed), its price, and a was-price only where the store
   printed one (Crate & Barrel's "reg. $X" in its own price text, Pier 1's
   Shopify compare-at).
   ============================================================ */

/* Casa Aria's aisles, in the wing's order (Navidad is the seasonal wedge). */
import { spanishFor } from "./description-es.js";

export const CASA_AISLES = {
  casa_navidad: "Navidad",
  casa_velas: "Velas y aromas",
  casa_textiles: "Cojines y mantas",
  casa_cama_bano: "Cama y baño",
  casa_mesa: "Mesa y vajilla",
  casa_cocina: "Cocina",
  casa_iluminacion: "Lámparas",
  casa_decoracion: "Decoración",
};
const AISLE_RULES = [
  ["casa_navidad", /christmas|ornament|wreath|garland|holiday|nutcracker|stocking|advent|tree (?:accessor|skirt)/i],
  ["casa_velas", /candle|diffuser|fragrance|room spray|hurricane|votive|tealight|lantern|candlestick|pillar stand|incense|scents/i],
  ["casa_textiles", /pillow|throw|blanket|sham|cushion|curtain(?!s? (?:&|and) bath)/i],
  ["casa_cama_bano", /sheet|duvet|comforter|quilt|bedding|towel|bath|shower|soap|lotion/i],
  ["casa_cocina", /cookware|bakeware|baking|frying|skillet|\bpans?\b|saucepan|utensil|kitchen|knife|knives|cutting board|cheese board|pantry|cleaning|measuring|food storage/i],
  ["casa_mesa", /plate|bowl|glass|mug|cup|flatware|dinnerware|drinkware|charger|placemat|napkin|runner|tablecloth|table linen|serv|platter|appetizer|pitcher|cakestand|tray|flute|coaster|salt & pepper|ramekin|carafe|decanter|cocktail|wine (?:tools|& bar)/i],
  ["casa_iluminacion", /\blamps?\b/i],
  ["casa_decoracion", /vase|decor|object|sculpture|figurine|frame|art|mirror|basket|planter|pot|plant|stem|spray|floral|storage|door mat|led|sphere|orb|sign|clock|bookend/i],
];
export function casaAisle(category) {
  const c = String(category || "");
  for (const [k, rx] of AISLE_RULES) if (rx.test(c)) return k;
  return null;
}

/* Not light home: what the build order cuts, by the store's own category. */
const NOT_LIGHT_HOME_RX = /\b(chairs?|tables?(?!\s*(runners?|lamps?|linens?|cloths?))|sofas?|loveseats?|sectionals?|stools?|benches?|beds?(?!\s*pillows?)|headboards?|nightstands?|dressers?|cabinets?|chests?|sideboards?|buffets?|bookcases?|shelves|desks?|tv stands?|ottomans?|poufs?|chaise|bistro|bar carts?|umbrellas?|firepits?|rugs?|swing|beanbag|dining room sets?|seating sets?|furniture|christmas trees?|potted trees?|floor lamps?|ceiling lights?|cushions)\b/i;
export const isLightHomeCategory = (category) => !NOT_LIGHT_HOME_RX.test(String(category || ""));

/* Estimated packed weight by category, kg before the +10% cushion. A
   category not listed has no defensible estimate: the item stays out. */
const WEIGHT_RULES = [
  [/floor mirror/i, 15], [/comforter/i, 4.0], [/quilt/i, 3.0], [/duvet/i, 2.0], [/sheet/i, 1.8], [/sham/i, 0.6],
  [/towel/i, 1.0], [/bath accessor/i, 1.0], [/kitchen (dish )?towel|kitchen textile/i, 0.5],
  [/led pillar|pillar candle|taper|jar & filled|scented candle|candles?$/i, 0.8], [/diffuser|room spray|fragrance oil|refill|fragrance bundle/i, 0.6],
  [/votive|tealight/i, 0.6], [/candlestick|candle holder|pillar stand/i, 1.0], [/hurricane|lantern/i, 2.0],
  [/christmas ornament|ornament/i, 0.4], [/nutcracker/i, 1.0], [/stocking/i, 0.4], [/tree (?:accessor|skirt)/i, 0.8],
  [/serving utensil|kitchen gadget|baking tool|measuring/i, 0.4], [/utensil holder|bath storage|candle warmer|candle ring|candle accessor/i, 1.0],
  [/pie, bread|cake pan|roasting pan|saute pan|saucepan/i, 2.5], [/cake plates? & stand/i, 2.0], [/appetizer & dessert plate/i, 1.5],
  [/coffee & tea serving set/i, 2.0], [/coaster|salt & pepper|cocktail shaker|wine tools|wine & bar tool/i, 0.7], [/ramekin|carafe|decanter/i, 1.2],
  [/champagne flute/i, 1.5], [/soaps?(?:,| &) lotion|soaps & lotions/i, 0.6], [/shower curtain|curtains/i, 1.2], [/food storage|kitchen counter organ|drawer organ/i, 1.5],
  [/decorative sphere|decorative sign|bookend|clock/i, 1.5], [/wooden wall art/i, 2.5], [/[a-z]+ (?:square )?(?:stoneware )?dinnerware$|carson serveware/i, 2.0], [/wreath|garland/i, 1.5], [/christmas decor|holiday decor/i, 1.0],
  [/pillow/i, 1.0], [/throw|blanket/i, 1.5],
  [/cookware set/i, 7.0], [/bakeware set/i, 4.0], [/frying pan|skillet/i, 2.0], [/baking dish/i, 2.5], [/baking sheet/i, 1.0],
  [/cooking utensil|kitchen tool/i, 0.5], [/pantry storage/i, 1.5], [/cleaning|soap/i, 0.6], [/cutting board|cheese board/i, 1.5],
  [/dinnerware set/i, 5.5], [/charger/i, 2.0], [/dinner plate/i, 2.0], [/salad plate|appetizer plate/i, 1.5], [/appetizer serveware/i, 1.2],
  [/serving platter|serving tray|platters/i, 1.8], [/serving bowl|bowls/i, 1.8], [/cakestand/i, 2.0], [/pitcher/i, 1.5],
  [/mug|tea cup/i, 0.6], [/drinkware set/i, 2.5], [/wine glass|champagne glass|cocktail|drinking glass|glasses/i, 1.5],
  [/open stock flatware/i, 0.3], [/flatware/i, 2.0], [/placemat/i, 0.6], [/napkin ring/i, 0.4], [/napkin/i, 0.4],
  [/table runner/i, 0.4], [/tablecloth|table linen/i, 0.8],
  [/table lamp/i, 3.5],
  [/vase/i, 1.5], [/decorative tray/i, 1.2], [/decorative bowl/i, 1.5], [/decorative object|sculpture|figurine|garden statue/i, 1.5],
  [/basket/i, 1.0], [/decorative storage/i, 1.5], [/stem|spray|floral/i, 0.5], [/potted plant/i, 2.0], [/planter|pot/i, 2.5],
  [/picture frame|^frames$/i, 0.7], [/canvas wall art/i, 3.0], [/framed wall art/i, 3.5], [/art print/i, 2.5], [/wall decor/i, 2.0],
  [/wall mirror|^mirrors$/i, 4.5], [/door mat/i, 1.5], [/led decor|decor$/i, 1.0],
];
export const CUSHION = 1.1;
export const WEIGHT_CAP_KG = 5;
export function estimateWeight(category) {
  const c = String(category || "");
  for (const [rx, kg] of WEIGHT_RULES) if (rx.test(c)) return Math.round(kg * CUSHION * 100) / 100;
  return null;
}

const https = (u) => (typeof u === "string" ? u.replace(/^http:\/\//i, "https://") : u);
const realPhoto = (u) => typeof u === "string" && /^https:\/\/\S+$/.test(u);
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

function finish(it, category, skipped) {
  if (!isLightHomeCategory(category)) { skipped["not light home"] = (skipped["not light home"] || 0) + 1; return null; }
  /* A Santa figurine filed under "Decor" is Navidad. */
  const aisle = /\b(christmas|xmas|santa|ornaments?|nutcrackers?|snowm[ae]n|reindeer|navidad)\b/i.test(it.name) ? "casa_navidad" : casaAisle(category);
  if (!aisle) { skipped["no aisle"] = (skipped["no aisle"] || 0) + 1; return null; }
  const kg = estimateWeight(category);
  if (kg == null) { skipped["no defensible weight"] = (skipped["no defensible weight"] || 0) + 1; return null; }
  if (kg > WEIGHT_CAP_KG) { skipped["over 5 kg"] = (skipped["over 5 kg"] || 0) + 1; return null; }
  return { ...it, type: category, department: "home", weightKg: kg, weightEstimated: true, weightBasis: category, aisle };
}

/* Crate & Barrel: the sian.agency detail rows. */
export function normalizeCrateAndBarrel(rows) {
  const skipped = {};
  const seen = new Set();
  const items = [];
  for (const r of rows) {
    const name = String((r && r.productTitle) || "").trim();
    if (!name) continue;
    const sku = String(r.sku || "");
    if (sku && seen.has(sku)) { skipped.duplicate = (skipped.duplicate || 0) + 1; continue; }
    if (sku) seen.add(sku);
    const price = num(r.price);
    if (!price || (r.currency && r.currency !== "USD")) { skipped["no price"] = (skipped["no price"] || 0) + 1; continue; }
    const images = (Array.isArray(r.images) ? r.images : [r.image]).filter(realPhoto);
    if (!images.length) { skipped["no photo"] = (skipped["no photo"] || 0) + 1; continue; }
    /* The store's own "reg. $X" -- the low end of its regular range, against
       the low end of its sale range. */
    const reg = /\breg\.\s*\$([\d,]+(?:\.\d+)?)/i.exec(String(r.formatted_price || ""));
    const regular = reg ? num(reg[1].replace(/,/g, "")) : 0;
    const it = { name, brand: "", price, currency: "USD", image: images[0], images, url: r.url || "", sku,
      description: "", description_en: String(r.description || "").trim(), rating: num(r.rating), reviewCount: num(r.review_count) };
    /* Spanish only (#443 c.6402691998): the stored translation, else nothing. */
    it.description = spanishFor("crateandbarrel", it.description_en) || "";
    if (regular > price) { it.originalPrice = regular; it.onSale = true; }
    const done = finish(it, r.category_name, skipped);
    if (done) items.push({ ...done, retailer: "crateandbarrel" });
  }
  return { items, skipped };
}

/* Pier 1: the digital_influx Shopify rows. The brand field carries the
   operator's supplier codes ("Gigacloudtech_DSFabricsCIS"): not a brand.
   (Both stores sell their own label: the card already names the store,
   so no brand is repeated under it.) */
export function normalizePier1(rows) {
  const skipped = {};
  const seen = new Set();
  const items = [];
  for (const r of rows) {
    if (!r || r.type !== "product" || r.status !== "ok") continue;
    const name = String(r.name || "").replace(/\s+-\s+Pier 1\s*$/i, "").trim();
    if (!name || /pier 1 rewards/i.test(name)) { skipped.junk = (skipped.junk || 0) + 1; continue; }
    if (r.inStock === false || r.availability !== "in_stock") { skipped["out of stock"] = (skipped["out of stock"] || 0) + 1; continue; }
    const key = r.url || name;
    if (seen.has(key)) { skipped.duplicate = (skipped.duplicate || 0) + 1; continue; }
    seen.add(key);
    const price = num(r.price);
    if (!price || (r.currency && r.currency !== "USD")) { skipped["no price"] = (skipped["no price"] || 0) + 1; continue; }
    const images = (Array.isArray(r.images) && r.images.length ? r.images : [r.image]).map(https).filter(realPhoto);
    if (!images.length) { skipped["no photo"] = (skipped["no photo"] || 0) + 1; continue; }
    /* "Buy X for only $Y at Pier 1!" is the store's template, not copy. */
    const desc = String(r.description || "").trim();
    const it = { name, brand: "", price, currency: "USD", image: images[0], images, url: r.canonicalUrl || r.url || "", sku: String(r.sku || r.productId || ""),
      description: "", description_en: /^buy .* at pier 1!?$/i.test(desc) ? "" : desc };
    it.description = spanishFor("pier1", it.description_en) || "";
    const list = num(r.listPrice);
    if (r.onSale === true && list > price) { it.originalPrice = list; it.onSale = true; }
    const done = finish(it, r.category, skipped);
    if (done) items.push({ ...done, retailer: "pier1" });
  }
  return { items, skipped };
}

/* The catalogue envelope: one department per Casa Aria aisle. */
export function toDepartments(items) {
  const deps = {};
  for (const k of Object.keys(CASA_AISLES)) deps[k] = { label: CASA_AISLES[k], items: [] };
  for (const it of items) { const { aisle, ...rest } = it; deps[aisle].items.push(rest); }
  for (const k of Object.keys(deps)) if (!deps[k].items.length) delete deps[k];
  return deps;
}

/* ============================================================
   THE 2026-10-27 STORE PULLS, NORMALIZED (#443 c.6457579787: SNIPES
   c.6450358688, Carolina Herrera c.6450670024).

   Lucifer's wave pulled each store's product pages through Apify's
   digital_influx/product-data actor; the raw rows (JSON-LD and Open
   Graph off each product page) live on branch catalog-pulls-2026-10-27.
   This turns them into the catalogue shape every other store uses
   ({ retailers: { <key>: { label, departments: { <dept>: { label,
   items } } } } }) without inventing anything:

     - a row is kept only with a name, a real captured https photo and a
       price above zero; out-of-stock rows are left out (they cannot be
       bought) and counted;
     - the store's own photos, as captured -- never a constructed URL;
     - no compare-at price was captured, so nothing is marked on sale and
       no "was" price is made up;
     - no size runs were captured: an item whose kind is sold in sizes
       (footwear, apparel) carries `sizesPending: true`, and the product
       page and the order endpoint refuse to sell it until a size pass
       lands -- a size is never guessed;
     - the category is read from the name (and Carolina Herrera's URL
       path, /p-<category>/), never guessed from the price;
     - SNIPES: hyped release SKUs are cut (the order excludes them), by
       the names sneaker stores give their drops; each cut is listed in
       the ingest report.
   ============================================================ */
import { isFootwearTitle } from "./footwear.js";

const KIDS_RX = /\b(big kids?'?|little kids?'?|grade school|pre-?school|toddler|infants?|kids'?|big boys|big girls|boys'?|girls'?|baby|youth|crib)\b/i;
const HEADWEAR_RX = /\b(59fifty|9fifty|9forty|39thirty|fitted|snapback|hats?|caps?|beanies?|bucket|trucker|visors?|durags?|headband|balaclava|ski mask)\b/i;
const UNDER_RX = /\b(boxers?|briefs?|socks?|underwear|trunks)\b/i;
const BAG_RX = /\b(bags?|backpacks?|crossbody|duffle|duffel|waist ?pack|fanny|tote|sling|pouch|wallets?)\b/i;
const APPAREL_RX = /\b(corsets?|shorty|bustier|rugby|bomber|skort|swim trunks?|trunks?|racerback|bra top|sports bra|unitard|catsuit|tee|t-shirt|shirts?|hoodie|hoody|sweatshirt|crewneck|crew neck|crew|pullover|jacket|coat|parka|puffer|anorak|windbreaker|vest|pants?|joggers?|sweatpants?|shorts?|jerseys?|fleece|tracksuit|track top|track pant|top|tank|polo|dress|skirt|leggings?|jeans?|denim|cargo|overalls?|set|onesie|romper|bodysuit|tights|bra|sweater|cardigan|quarter.zip|half.zip|full.zip|zip|flannel|button.up|thermal|long sleeve|short sleeve)\b/i;

/* The names sneaker stores give their hyped drops: OG / SP retros,
   collaborations, the limited lines. */
export const RELEASE_RX = /\b(retro high og|retro low og|retro og|og sp|\bsp\b|travis scott|off-white|fragment|union la|a ma mani[eè]re|yeezy|j\.? ?balvin|bad bunny|supreme|concepts|sacai|stussy|st[uü]ssy|cactus jack|aleali may|kaws|patta|levi'?s x|x nike|nike x|jordan x|x jordan|pe\b|player exclusive|limited edition|chicago lost)\b/i;

/* The model lines a sneaker store sells by name alone ("990v6",
   "KD19", "Samba OG") and the words a shoe's own description uses. */
const SHOE_MODEL_RX = /\b(air force 1|air max|dunk|jordan \d|air jordan|jumpman|samba|gazelle|campus|spezial|old skool|knu skool|sk8|authentic|chuck taylor|chuck 70|run star|\d{3,4}v\d|\b(?:550|574|990|991|992|993|9060|2002r|1906r?|1000|327|530|740|204l|480)\b|abzorb|gel-|clogs?|slides?|uggs?|tasman|tazz|ultra mini|timberland|6 inch|6-inch|foamposite|vapormax|pegasus|vomero|blazer|cortez|court vision|forum|superstar|stan smith|rs-x|speedcat|palermo|suede classic|nmd|ozweego|p-6000|shox|kd ?\d+|lebron|giannis|ja \d|sabrina|harden|zoom|reactx|skyjet|matrix|baltoro|lowmel|chukka|ac runner|v5 rnr|premier road|progrid|omni|manoa|202xa|air dt|velum|crib|bootie)\b/i;
const SHOE_DESC_RX = /\b(sneakers?|shoes?|outsole|midsole|cushioning|lace-up|laces|footbed|insole|heel counter|toe box|traction|rubber sole|boots?|sandals?)\b/i;

const GARMENT_RX = /\b(tee|t-shirt|shirt|hoodie|sweatshirt|jacket|pants?|shorts?|jersey|socks?|crewneck|fleece|top|tank)\b/i;
const ACCESSORY_RX = /\b(jibbitz|charms?|reviver|cleaner|cleaning|protect|crep|repellent|wipes?|kit|keychains?|key ?rings?|chains?|necklaces?|pendants?|bracelets?|rings?|earrings?|grillz|watch(es)?|sunglasses|shades|belts?|gloves?|scarf|scarves|mask|towels?|stickers?|shoelaces?|laces|insoles?|bottles?|umbrella|phone|case|lanyard|pins?|patch(es)?|candles?|fragrance|cologne|perfume|air freshener|balls?|basketball|football|soccer ball|card|gift|wristbands?|sweatbands?|arm sleeve|leg sleeve|headphones|earbuds|speaker|deodorizer|trees|shoe trees|crease|protector)\b/i;

export function snipesKind(name, description = "", brand = "") {
  const n = String(name || "");
  /* Ethika sells underwear by the pattern's name, sized in brackets:
     "Kool Aid Half Stripe (L)". */
  if (UNDER_RX.test(n) || /^ethika$/i.test(String(brand || "").trim()) || /\((XS|S|M|L|XL|XXL|2XL|3XL|Small|Medium|Large|X-Large)\)\s*$/i.test(n)) return "underwear";
  if (HEADWEAR_RX.test(n)) return "headwear";
  if (isFootwearTitle(n)) return "footwear";
  /* A shoe line whose name borrows another word ("6 Rings", "Air Max 90
     \"Denim\"") is a shoe -- unless the name says it is a garment
     ("LeBron \"Shoe Bag\" Basketball T-Shirt"). */
  if (/\b(6 rings|air max \d+|air jordan \d+|dunk (low|high)|air force 1)\b/i.test(n) && !GARMENT_RX.test(n)) return "footwear";
  if (APPAREL_RX.test(n)) return "apparel";
  if (BAG_RX.test(n)) return "bags";
  if (ACCESSORY_RX.test(n)) return "accessories";
  if (SHOE_MODEL_RX.test(n) || SHOE_DESC_RX.test(String(description || ""))) return "footwear";
  /* SNIPES is a sneaker store: what is neither a garment, a cap, a bag
     nor a named accessory is a shoe sold by its model name ("Max Aura",
     "Shai 001", "Cloud 6"). */
  return "footwear";
}

export const SNIPES_DEPTS = {
  calzado: "Calzado",
  calzado_ninos: "Calzado de niños",
  ropa: "Ropa streetwear",
  ropa_ninos: "Ropa de niños",
  gorras: "Gorras",
  accesorios: "Accesorios",
};
/* Types the weight table reads (weight-estimates.json keywords: the
   type is tried before the name, so apparel carries the garment its name
   says -- a hoodie is not weighed as a tee). The department is the
   table's fallback band. */
const SNIPES_TYPE = { footwear: "SNEAKERS", headwear: "HAT", underwear: "UNDERWEAR", bags: "BAG", accessories: "ACCESSORY" };
const WEIGHT_DEPT = { footwear: "footwear", apparel: "apparel", underwear: "apparel", headwear: "accessories", bags: "accessories", accessories: "accessories" };
export function garmentType(name) {
  const m = APPAREL_RX.exec(String(name || ""));
  return m ? m[1].toUpperCase().replace(/[^A-Z]+/g, " ").trim() : "APPAREL";
}

export function snipesDept(kind, kids) {
  if (kind === "footwear") return kids ? "calzado_ninos" : "calzado";
  if (kind === "apparel" || kind === "underwear") return kids ? "ropa_ninos" : "ropa";
  if (kind === "headwear") return "gorras";
  return "accesorios";
}

const realPhoto = (u) => typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u);

/* One raw row, or { skip: <reason> }. */
function baseRow(r) {
  if (!r || r.type !== "product" || r.status !== "ok") return { skip: "not a product row" };
  const name = String(r.name || "").trim();
  if (!name) return { skip: "no name" };
  const price = Number(r.price);
  if (!(price > 0)) return { skip: "no price" };
  if (String(r.currency || "USD").toUpperCase() !== "USD") return { skip: "not USD" };
  const images = (Array.isArray(r.images) ? r.images : []).filter(realPhoto);
  const image = realPhoto(r.image) ? r.image : images[0];
  if (!image) return { skip: "no photo" };
  if (r.inStock === false || r.availability === "out_of_stock") return { skip: "out of stock" };
  /* A "description" that is a number, a fragment or the product's own name
     is not copy: no description rather than a fake one. */
  let description = String(r.description || "").trim();
  if (description.length < 12 || (description.length < 60 && description.toLowerCase().endsWith(name.toLowerCase()))) description = "";
  return {
    item: {
      name, brand: String(r.brand || "").trim(), price: Math.round(price * 100) / 100, currency: "USD",
      image, images: images.length ? [...new Set([image, ...images])] : [image],
      url: r.canonicalUrl || r.url, sku: String(r.sku || r.productId || ""),
      onSale: false,
      description,
    },
  };
}

export function normalizeSnipes(rows) {
  const depts = Object.fromEntries(Object.keys(SNIPES_DEPTS).map((k) => [k, { label: SNIPES_DEPTS[k], items: [] }]));
  const skipped = {}, released = [];
  const seen = new Set();
  for (const r of rows) {
    const b = baseRow(r);
    if (b.skip) { if (b.skip !== "not a product row") skipped[b.skip] = (skipped[b.skip] || 0) + 1; continue; }
    const it = b.item;
    if (seen.has(it.sku || it.url)) { skipped.duplicate = (skipped.duplicate || 0) + 1; continue; }
    seen.add(it.sku || it.url);
    const kind = snipesKind(it.name, it.description, it.brand);
    if (kind === "footwear" && RELEASE_RX.test(it.name)) { released.push({ name: it.name, brand: it.brand, price: it.price, sku: it.sku }); continue; }
    const kids = KIDS_RX.test(it.name) || /snipesusa\.com\/(kids|boys|girls|toddler|infant)-/i.test(it.url);
    const dept = snipesDept(kind, kids);
    it.type = kind === "apparel" ? garmentType(it.name) : SNIPES_TYPE[kind];
    it.department = WEIGHT_DEPT[kind];
    it.kind = kind;
    it.audience = kids ? "kids" : "adult";
    if (kind === "footwear" || kind === "apparel" || kind === "underwear") it.sizesPending = true;
    it.retailer = "snipes";
    depts[dept].items.push(it);
  }
  for (const k of Object.keys(depts)) if (!depts[k].items.length) delete depts[k];
  return { departments: depts, skipped, released };
}

/* Carolina Herrera: the US storefront's own category, /p-<category>/. */
export const CH_DEPTS = {
  zapatos: "Zapatos",
  ropa: "Ready-to-wear",
  accesorios: "Joyas y accesorios",
  fragancias: "Fragancias",
  maquillaje: "Maquillaje y accesorios de belleza",
};
/* The storefront files its jewellery and bags under ready-to-wear: the
   name says which they are (and they are sold without a size). */
const CH_ACCESSORY_RX = /\b(earrings?|necklaces?|bracelets?|brooch(es)?|rings?|pendants?|cuffs?|bags?|clutch|tote|minaudi[eè]re|belts?|scarf|scarves|headbands?|hair clips?|sunglasses)\b/i;
/* ...and its shoes: pumps, flats, mules, boots get their own aisle. */
const CH_SHOE_RX = /\b(pumps?|flats?|mules?|boots?|sandals?|loafers?|sneakers?|espadrilles?|heels?|slingbacks?)\b/i;
/* "V-Neck Gown with Stand Collar and Self Belt" is a gown. */
const CH_GARMENT_RX = /\b(gown|dress|coat|jacket|trench|cape|top|blouse|shirt|skirt|pants?|trousers?|jumpsuit|sweater|cardigan|shorts?|blazer|vest)\b/i;
export function chDept(url, name = "") {
  const m = /\/p-([a-z-]+)\//.exec(String(url || ""));
  const c = m ? m[1] : "";
  if (c === "ready-to-wear" && CH_SHOE_RX.test(String(name || "")) && !CH_GARMENT_RX.test(String(name || ""))) return "zapatos";
  if (c === "ready-to-wear") return CH_ACCESSORY_RX.test(String(name || "")) && !CH_GARMENT_RX.test(String(name || "")) ? "accesorios" : "ropa";
  if (c === "fragrance") return "fragancias";
  if (c === "makeup" || c === "makeup-accessory") return "maquillaje";
  return null;
}
const CH_TYPE = { zapatos: "SHOES", ropa: "DRESS", accesorios: "JEWELRY", fragancias: "FRAGRANCE", maquillaje: "MAKEUP" };
const CH_WEIGHT_DEPT = { zapatos: "footwear", ropa: "apparel", accesorios: "accessories", fragancias: "beauty", maquillaje: "beauty" };

export function normalizeCarolinaHerrera(rows) {
  const depts = Object.fromEntries(Object.keys(CH_DEPTS).map((k) => [k, { label: CH_DEPTS[k], items: [] }]));
  const skipped = {};
  const seen = new Set();
  for (const r of rows) {
    const b = baseRow(r);
    if (b.skip) { if (b.skip !== "not a product row") skipped[b.skip] = (skipped[b.skip] || 0) + 1; continue; }
    const it = b.item;
    const dept = chDept(it.url, it.name);
    if (!dept) { skipped["no category"] = (skipped["no category"] || 0) + 1; continue; }
    if (seen.has(it.url)) { skipped.duplicate = (skipped.duplicate || 0) + 1; continue; }
    seen.add(it.url);
    /* "Carolina Herrera" is the whole description on 273 pages: that is
       the brand, not copy -- no description rather than a fake one. */
    if (/^carolina herrera\.?$/i.test(it.description)) it.description = "";
    it.type = CH_TYPE[dept];
    if (dept === "accesorios") { const a = CH_ACCESSORY_RX.exec(it.name); it.type = a ? a[1].toUpperCase() : "JEWELRY"; }
    it.department = CH_WEIGHT_DEPT[dept];
    if (dept === "zapatos") {
      it.sizesPending = true;
      it.type = /\bboots?\b/i.test(it.name) ? "BOOTS" : /\b(pumps?|mules?|heels?)\b/i.test(it.name) ? "HEELS" : "SHOES";
    }
    if (dept === "ropa") {
      it.sizesPending = true;
      if (/\b(coat|trench|cape|parka)\b/i.test(it.name)) it.type = "OVERCOAT";
      else if (/\b(jacket|blazer)\b/i.test(it.name)) it.type = garmentType(it.name);
      else if (/\b(gown)\b/i.test(it.name)) it.type = "GOWN";
      else if (/\b(shirt|blouse|top|sweater|cardigan|pants?|trousers?|skirt|shorts?)\b/i.test(it.name)) it.type = garmentType(it.name);
    }
    it.retailer = "carolinaherrera";
    depts[dept].items.push(it);
  }
  for (const k of Object.keys(depts)) if (!depts[k].items.length) delete depts[k];
  return { departments: depts, skipped };
}

/* ============================================================
   THE MARC JACOBS STORE (#443 c.6643310622, amended c.6643334129).

   Danny: marcjacobs.com ships to Miami (free UPS Ground over $50, no
   forwarder ban, no resale clause -- the addability note), so Marc Jacobs
   is a DIRECT store on Aria, first-class, and the official store is a
   row in the Comparador beside every retailer that carries the same bag
   or shoe. Scope is fashion: bags, shoes, ready-to-wear, accessories.
   Beauty and fragrance are already sold through Sephora, Ulta, Macy's and
   Aria Perfumes, so the store leaves them out (counted, never shown).

   The catalogue arrives as a data drop from Lucifer's lane
   (data/drops/marcjacobs/README.md is the exact format). These are the
   rules that turn a drop into marcjacobs-catalog.json; the CLI is
   scripts/ingest-marcjacobs.mjs. Nothing here invents anything:

     - a row is kept only with a name, a real https photo, an https link
       and a USD price above zero; out of stock, or every size sold out,
       is left out (it cannot be bought) and counted;
     - the category is the store's own product type (`type`), then the
       title's own noun; neither saying bag, shoe, clothing or accessory
       is "no category" and left out -- never guessed from the price;
     - a was-price only where the drop carries a struck-through price
       above the selling price (the site's one sale rule, sale-rule.js);
     - SIZES ONLY FROM THE PULL (#654/#661): the in-stock sizes in
       `sizes`, the store's sold-out sizes in `sizesOut` (shown agotada
       on the product page, never sellable). A kind sold in sizes with
       no sizes in the pull carries `sizesPending` (shown, not sold:
       scripts/lib/sizes-pending.js);
     - prices stay the store's raw USD, as in every catalogue. The Miami
       sales tax is applied where every store's is, on the page: the
       customer price is (raw + tieredMarginUsd(raw)) x salesTaxRateFor
       (retailer) -- 1.07 for every store not proven exempt (TAX_EXEMPT_
       STATUS in the pages and the bundle; only Walmart is exempt), the
       same x1.07 in _search-core's salesTaxRate and store-shipping.js.
       marcjacobs is not exempt, so it pays the 7% like Carolina Herrera
       and SNIPES; scripts/test/marcjacobs-store-tests.mjs pins it.
   ============================================================ */
import { isFootwearTitle } from "./footwear.js";
import { garmentType } from "./store-pull-normalize.js";
import { isMarcJacobsBrand, isBeautyTitle } from "./marcjacobs-match.js";

export const MJ_KEY = "marcjacobs";
export const MJ_LABEL = "Marc Jacobs";
export const MJ_CATALOG_FILE = "marcjacobs-catalog.json";

/* The storefront's aisles, in Danny's luxury-house order (Carolina
   Herrera's pattern): what the house is known for first. */
export const MJ_DEPT_ORDER = ["bolsos", "zapatos", "ropa", "accesorios"];
export const MJ_DEPTS = { bolsos: "Bolsos", zapatos: "Zapatos", ropa: "Ropa", accesorios: "Accesorios" };
/* The weight table's fallback band per aisle (weight-estimates.json). */
const WEIGHT_DEPT = { bolsos: "accessories", zapatos: "footwear", ropa: "apparel", accesorios: "accessories" };

/* The product's own kind. An accessory phrase first (a «Bag Charm», a
   «Card Case», a «Strap» is not a bag), then shoes, bags, clothing, the
   other accessories; beauty and fragrance last (out of scope). */
const ACC_FIRST_RX = /\b(bag accessor(?:y|ies)|bag charms?|charms?|keychains?|key ?rings?|key fobs?|straps?|wallets?|card (?:holders?|cases?)|passport (?:holders?|covers?)|coin purses?|small leather goods?|phone cases?|airpods? cases?|tech accessor(?:y|ies))\b/i;
const SHOE_RX = /\b(shoes?|footwear|sneakers?|trainers?|boots?|booties|sandals?|flats?|ballerinas?|mules?|loafers?|pumps?|heels?|clogs?|slides?|slingbacks?|espadrilles?|slippers?)\b/i;
const BAG_RX = /\b(bags?|handbags?|totes?|crossbody|shoulder bags?|satchels?|hobo|clutch(?:es)?|backpacks?|duffle|duffel|pouch(?:es)?|top handle|bucket bags?|messenger|camera bags?|minaudi[eè]re)\b/i;
const WEAR_RX = /\b(ready[- ]to[- ]wear|clothing|apparel|t-?shirts?|tees?|shirts?|blouses?|tops?|tanks?|sweaters?|cardigans?|knitwear|knits?|hoodies?|sweatshirts?|jackets?|coats?|blazers?|vests?|dress(?:es)?|skirts?|pants|trousers|jeans|denim|shorts|jumpsuits?|leggings|swimwear|swimsuits?|polos?)\b/i;
const ACC_RX = /\b(accessor(?:y|ies)|belts?|hats?|caps?|beanies?|bucket hats?|scarves|scarf|gloves?|sunglasses|eyewear|jewel(?:le)?ry|earrings?|necklaces?|bracelets?|rings?|brooch(?:es)?|hair (?:clips?|accessor(?:y|ies))|headbands?|socks?|umbrellas?|cases?)\b/i;
const BEAUTY_TYPE_RX = /\b(beauty|fragrances?|fragancias?|perfumes?|parfum|eau de|cologne|makeup|make-up|maquillaje|belleza|cosm[eé]tic|skincare|cuidado corporal|body care|lipstick|mascara|body mist|loci(?:o|ó)n)/i;

/** The aisle a product belongs to, from its own type then its title:
    bolsos | zapatos | ropa | accesorios | "belleza" (out of scope) | null. */
export function mjAisle(type, title = "") {
  /* A title that names a fragrance or a cosmetic is one, whatever a
     store's type field says (Macy's files its Daisy Eau de Parfum under
     «APPAREL»). */
  if (isBeautyTitle(title)) return "belleza";
  for (const src of [String(type || ""), String(title || "")]) {
    if (!src.trim()) continue;
    if (BEAUTY_TYPE_RX.test(src) && !ACC_FIRST_RX.test(src) && !BAG_RX.test(src)) return "belleza";
    if (ACC_FIRST_RX.test(src)) return "accesorios";
    if (SHOE_RX.test(src) || (src === String(title || "") && isFootwearTitle(src))) return "zapatos";
    if (BAG_RX.test(src)) return "bolsos";
    if (WEAR_RX.test(src)) return "ropa";
    if (ACC_RX.test(src)) return "accesorios";
  }
  return null;
}

/* Accessories sold in sizes: with no sizes in the pull, shown not sold. */
const SIZED_ACC_RX = /\b(belts?|rings?|gloves?|socks?)\b/i;
export function soldInSizes(aisle, title = "") {
  return aisle === "zapatos" || aisle === "ropa" || (aisle === "accesorios" && SIZED_ACC_RX.test(String(title)));
}

const https = (u) => typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u.trim());
const money = (n) => Math.round(Number(n) * 100) / 100;
const cleanList = (l) => [...new Set((Array.isArray(l) ? l : []).map((s) => (typeof s === "number" ? String(s) : s))
  .filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()))];
const text = (s) => String(s == null ? "" : s).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/* ============================================================
   THE THREE ACCEPTED SHAPES -> THE STANDARD PULL ROW
   (data/drops/marcjacobs/README.md documents each one exactly).
   ============================================================ */

/** "pull" | "shopify" | "jsonld" | null for one parsed drop file. */
export function dropShape(json) {
  if (json && !Array.isArray(json) && Array.isArray(json.products) && json.products.some((p) => p && Array.isArray(p.variants))) return "shopify";
  const list = Array.isArray(json) ? json : json && Array.isArray(json.products) ? json.products
    : json && Array.isArray(json.items) ? json.items : json && Array.isArray(json["@graph"]) ? json["@graph"] : null;
  if (!list) return null;
  if (list.some((p) => p && (p["@type"] === "Product" || (Array.isArray(p["@type"]) && p["@type"].includes("Product"))))) return "jsonld";
  if (list.some((p) => p && typeof p === "object" && ("title" in p || "name" in p) && "price" in p)) return "pull";
  return null;
}

/* Shopify's /products.json: one product, its variants (one per size or
   colour), each with `available`. The size option is the one named
   Size/Talla; a size is in stock when any variant of it is available. */
export function rowsFromShopify(json, { base = "https://www.marcjacobs.com" } = {}) {
  const out = [];
  for (const p of (json && json.products) || []) {
    if (!p || !Array.isArray(p.variants)) continue;
    const opts = Array.isArray(p.options) ? p.options : [];
    const sizeIdx = opts.findIndex((o) => /^(size|talla|shoe size)$/i.test(String((o && o.name) || "").trim()));
    const colorIdx = opts.findIndex((o) => /^(colou?r|color)$/i.test(String((o && o.name) || "").trim()));
    const avail = p.variants.filter((v) => v && v.available !== false);
    const priced = (avail.length ? avail : p.variants).filter((v) => Number(v.price) > 0);
    const cheapest = priced.sort((a, b) => Number(a.price) - Number(b.price))[0];
    const sizes = [], sizesOut = [];
    if (sizeIdx >= 0) {
      const key = "option" + (sizeIdx + 1);
      const run = [...new Set(p.variants.map((v) => v && v[key]).filter(Boolean).map(String))];
      for (const s of run) (p.variants.some((v) => v && String(v[key]) === s && v.available !== false) ? sizes : sizesOut).push(s);
    }
    const color = colorIdx >= 0 && opts[colorIdx].values && opts[colorIdx].values.length === 1 ? String(opts[colorIdx].values[0]) : "";
    out.push({
      title: p.title, url: p.handle ? String(base).replace(/\/+$/, "") + "/products/" + p.handle : p.url,
      price: cheapest ? Number(cheapest.price) : 0,
      wasPrice: cheapest && Number(cheapest.compare_at_price) > 0 ? Number(cheapest.compare_at_price) : null,
      images: (p.images || []).map((i) => (i && typeof i === "object" ? i.src : i)).filter(Boolean),
      type: p.product_type || "", sizes, sizesOut, sku: (cheapest && cheapest.sku) || "",
      brand: p.vendor || "", color, description: text(p.body_html), currency: "USD",
      inStock: avail.length > 0,
    });
  }
  return out;
}

/* A JSON-LD Product list (an array, {products|items|@graph: [...]}).
   Offers: one Offer, an array (one per size: `size` or `name`), or an
   AggregateOffer with `offers`. A struck-through price only from a
   priceSpecification whose priceType is ListPrice / StrikethroughPrice. */
const IN_STOCK = /InStock|LimitedAvailability|OnlineOnly|PreOrder/i;
export function rowsFromJsonLd(json) {
  const list = Array.isArray(json) ? json : (json && (json.products || json.items || json["@graph"])) || [];
  const out = [];
  for (const p of list) {
    if (!p || !(p["@type"] === "Product" || (Array.isArray(p["@type"]) && p["@type"].includes("Product")))) continue;
    let offers = p.offers;
    if (offers && !Array.isArray(offers) && Array.isArray(offers.offers)) offers = offers.offers;
    offers = (Array.isArray(offers) ? offers : offers ? [offers] : []).filter((o) => o && typeof o === "object");
    const usd = offers.filter((o) => String(o.priceCurrency || "USD").toUpperCase() === "USD");
    const live = usd.filter((o) => !o.availability || IN_STOCK.test(String(o.availability)));
    const priced = (live.length ? live : usd).filter((o) => Number(o.price ?? o.lowPrice) > 0)
      .sort((a, b) => Number(a.price ?? a.lowPrice) - Number(b.price ?? b.lowPrice));
    const first = priced[0];
    let was = null;
    for (const o of priced.length ? [first] : []) {
      for (const ps of [].concat(o.priceSpecification || [])) {
        if (ps && /ListPrice|StrikethroughPrice/i.test(String(ps.priceType || "")) && Number(ps.price) > 0) was = Number(ps.price);
      }
    }
    const sizeOf = (o) => o.size || (o.itemOffered && o.itemOffered.size) || (offers.length > 1 ? o.name : "") || "";
    const sized = offers.filter((o) => sizeOf(o));
    const sizes = [...new Set(sized.filter((o) => !o.availability || IN_STOCK.test(String(o.availability))).map((o) => String(sizeOf(o))))];
    const sizesOut = [...new Set(sized.filter((o) => o.availability && !IN_STOCK.test(String(o.availability))).map((o) => String(sizeOf(o))))].filter((s) => !sizes.includes(s));
    const img = [].concat(p.image || []).map((i) => (i && typeof i === "object" ? i.url || i.contentUrl : i)).filter(Boolean);
    out.push({
      title: p.name, url: p.url || (first && first.url) || "", price: first ? Number(first.price ?? first.lowPrice) : 0, wasPrice: was,
      images: img, type: p.category || p.additionalType || "", sizes, sizesOut,
      sku: p.sku || p.mpn || p.productID || "", brand: (p.brand && (p.brand.name || p.brand)) || "",
      color: p.color || "", description: text(p.description), currency: (first && first.priceCurrency) || "USD",
      inStock: live.length > 0 || (!offers.length ? undefined : false),
    });
  }
  return out;
}

/** Any accepted drop file -> standard pull rows. */
export function dropRows(json, opts) {
  const shape = dropShape(json);
  if (shape === "shopify") return { shape, rows: rowsFromShopify(json, opts) };
  if (shape === "jsonld") return { shape, rows: rowsFromJsonLd(json) };
  if (shape === "pull") return { shape, rows: Array.isArray(json) ? json : json.products || json.items };
  return { shape: null, rows: [] };
}

/* ============================================================
   STANDARD PULL ROWS -> marcjacobs-catalog.json's departments
   ============================================================ */
export function normalizeMarcJacobs(rows) {
  const depts = Object.fromEntries(MJ_DEPT_ORDER.map((k) => [k, { label: MJ_DEPTS[k], items: [] }]));
  const skipped = {};
  const skip = (why) => { skipped[why] = (skipped[why] || 0) + 1; };
  const seen = new Set();
  let sized = 0, pending = 0, soldOutSizes = 0, onSale = 0;
  for (const r of rows || []) {
    if (!r || typeof r !== "object") { skip("not a product row"); continue; }
    const title = text(r.title || r.name);
    if (!title) { skip("no name"); continue; }
    const brand = text(r.brand) || MJ_LABEL;
    if (!isMarcJacobsBrand(brand)) { skip("not Marc Jacobs"); continue; }
    if (String(r.currency || "USD").toUpperCase() !== "USD") { skip("not USD"); continue; }
    const price = Number(r.price);
    if (!(price > 0)) { skip("no price"); continue; }
    const url = String(r.url || "").trim();
    if (!https(url)) { skip("no product link"); continue; }
    const images = cleanList([].concat(r.images || [], r.image || [])).filter(https);
    if (!images.length) { skip("no photo"); continue; }
    if (r.inStock === false || r.availability === "out_of_stock") { skip("out of stock"); continue; }
    const aisle = mjAisle(r.type, title);
    if (aisle === "belleza") { skip("beauty or fragrance (out of scope: sold through Sephora, Ulta, Macy's, Aria Perfumes)"); continue; }
    if (!aisle) { skip("no category"); continue; }
    const sizes = cleanList(r.sizes);
    const sizesOut = cleanList(r.sizesOut).filter((s) => !sizes.includes(s));
    if (!sizes.length && sizesOut.length) { skip("every size out of stock"); continue; }
    const color = text(r.color);
    const name = color && !new RegExp("\\b" + color.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(title) ? title + " - " + color : title;
    const idKey = url + "|" + images[0];
    if (seen.has(idKey)) { skip("duplicate"); continue; }
    seen.add(idKey);
    let description = text(r.description);
    if (description.length < 12 || description.toLowerCase() === title.toLowerCase()) description = "";
    const it = {
      name, brand: MJ_LABEL, price: money(price), currency: "USD",
      image: images[0], images, url, sku: String(r.sku || r.styleNumber || "").trim(),
      onSale: false, description,
    };
    const was = Number(r.wasPrice ?? r.compareAtPrice ?? r.originalPrice);
    if (was > it.price) { it.originalPrice = money(was); it.onSale = true; onSale++; }
    it.type = String(r.type || "").trim().toUpperCase() || (aisle === "ropa" ? garmentType(title) : aisle === "zapatos" ? "SHOES" : aisle === "bolsos" ? "BAG" : "ACCESSORY");
    it.department = WEIGHT_DEPT[aisle];
    if (r.gender) it.gender = String(r.gender).toLowerCase();
    if (sizes.length) {
      it.sizes = sizes;
      it.sizeSource = "marcjacobs-pull";
      if (sizesOut.length) { it.sizesOut = sizesOut; soldOutSizes++; }
      sized++;
    } else if (soldInSizes(aisle, title)) { it.sizesPending = true; pending++; }
    it.retailer = MJ_KEY;
    depts[aisle].items.push(it);
  }
  for (const k of Object.keys(depts)) if (!depts[k].items.length) delete depts[k];
  return { departments: depts, skipped, sized, sizesPending: pending, soldOutSizes, onSale };
}

/* ============================================================
   THE STORE'S PAGE AND BANNER (tienda.html STORES.marcjacobs is the
   page entry; this is its header-banner entry in the shape of the
   banner registry, scripts/lib/banner-registry.js on claude/banners-
   sample, not on main yet: one line there, `"store:marcjacobs":
   MJ_BANNER`, once it lands).
   NO LOGO: no Marc Jacobs logo file exists anywhere in the repo
   (logos/, logos/brands/, assets/logos/, assets/brands/), so the store
   renders as its name on black -- the registry's wordmark fallback,
   never a drawn mark. TODO(marcjacobs-logo): the real wordmark file,
   from the house's own brand assets (Lucifer's lane).
   ============================================================ */
export const MJ_BANNER = {
  page: "/tienda.html?tienda=marcjacobs",
  label: MJ_LABEL,
  color: "#000000",
  logo: null,
  backdrop: null,
  /* The house's own product photos, as the store's rails serve them. */
  source: { from: "store", key: MJ_KEY, rails: ["d-bolsos", "d-zapatos", "d-ropa", "d-accesorios"] },
  fit: "contain",
  scrim: "dark",
  tiles: 4,
  tier1: ["Marc Jacobs logo file (wordmark, SVG or PNG)", "Marc Jacobs campaign image or storefront photo"],
};

/* ============================================================
   OFERTAS POR CATEGORÍA (Danny, #443 c.6544455377, c.6544469782).

   Ofertas has two views: [Por tienda] (the store rails, unchanged) and
   [Por categoría] -- the same deals regrouped by what they are. One
   deal, one category, decided here from the site's own classifiers:

     what it is   product-type.js's family (productClass), the classifier
                  every department and store rail already uses;
     who for      store-subrails.js audienceOf (the title's words, then
                  the store's own facet / bucket), and when the item
                  says nothing, its store's audience if that store
                  sells (nearly) only to one;
     sneakers     footwear.js footwearClass: Zapatillas are sneakers
                  and running shoes; every other shoe is Zapatos.

   A category is offered only where offers honestly exist (MIN_CAT);
   a deal with no category still shows in Todas and Por tienda.
   ============================================================ */
import { audienceOf } from "./store-subrails.js";
import { footwearClass, isFootwear } from "./footwear.js";

/* Danny's order first, then the rest by volume. */
export const OFFER_CATEGORIES = [
  ["ropa_hombre", "Ropa Hombre"], ["ropa_mujer", "Ropa Mujer"], ["ropa_ninos", "Ropa Niños"],
  ["juguetes", "Juguetes"], ["zapatillas", "Zapatillas"], ["electronica", "Electrónica"],
  ["zapatos", "Zapatos"], ["hogar", "Hogar"], ["deportes", "Deportes"],
  ["accesorios", "Joyas y accesorios"], ["belleza", "Belleza"], ["bebe", "Bebé"],
];
export const DANNY_ORDER = 6;
export const CATEGORY_LABEL = Object.fromEntries(OFFER_CATEGORIES);
/* "Real offer volume": fewer than this and the category gets no pill. */
export const MIN_CAT = 24;

const DIRECT = { juguetes: "juguetes", electronica: "electronica", hogar: "hogar", deportes: "deportes", bebe: "bebe",
  belleza: "belleza", perfumes: "belleza", accesorios: "accesorios", sombreros: "accesorios", carteras: "accesorios", joyas: "accesorios" };
const AUDIENCE_CAT = { women: "ropa_mujer", men: "ropa_hombre", kids: "ropa_ninos" };

/* Niños needs a child's word, not a band's: "The Golden Girls" and
   "Ethika Baby Girl" tees are not children's clothing. */
const KID_BUCKET_RX = /(^|[_\-\s])(kids?|baby|babies|boys?|girls?|toddlers?|ninos?|youth|juniors?)([_\-\s]|$)/i;
const KID_WORD_RX = /\b(kids?|toddlers?|infants?|newborns?|youth|ni[ñn][oa]s?|little\s+kids?|big\s+kids?|baby\s+(boys?|girls?)\s+(clothes|outfits?|sets?|rompers?|bodysuits?|onesies?))\b|\b(boy|girl|boys|girls)['’]s?\b|\b(boys|girls)\s+(tees?|t-?shirts?|shirts?|tops?|pants|shorts|jeans|dress(es)?|leggings|hoodies?|sweatshirts?|jackets?|pajamas?|sets?|swim\w*|uniforms?)\b|\b\d{1,2}T\b/i;
/** The audience of a garment: its own, else its store's (one-audience stores only). */
export function garmentAudience(item, storeAudience) {
  let a = audienceOf({ name: item.title, brand: item.brand, type: item.type, dept: item.bucket }, "ropa");
  if (a === "kids" && !KID_BUCKET_RX.test(String(item.bucket || "")) && !KID_WORD_RX.test(String(item.title || ""))) a = null;
  return a || (storeAudience && storeAudience[item.retailer]) || null;
}

/** "" when the deal belongs to none of the categories. */
export function offerCategory(item, family, storeAudience) {
  /* A cleat or a shoe filed as clothing or an accessory is a shoe. */
  if (family !== "zapatos" && family !== "juguetes" && isFootwear({ title: item.title, name: item.title, type: item.type }, item.retailer)) family = "zapatos";
  if (family === "ropa" || family === "trajes_bano") return AUDIENCE_CAT[garmentAudience(item, storeAudience)] || "";
  if (family === "zapatos") return footwearClass({ title: item.title, type: item.type }, item.retailer) === "Zapatillas" ? "zapatillas" : "zapatos";
  return DIRECT[family] || "";
}

/* A store sells to one adult audience when 95%+ of its garments that
   say who they are for say the same, over at least 50 of them. (Never
   Niños by store: a store's "girls" are too often a band's.) */
export function storeAudiences(items, familyOf) {
  const n = {};
  for (const p of items) {
    const f = familyOf(p);
    if (f !== "ropa" && f !== "trajes_bano") continue;
    const a = audienceOf({ name: p.title, brand: p.brand, type: p.type, dept: p.bucket }, "ropa");
    if (!a) continue;
    const s = n[p.retailer] || (n[p.retailer] = { women: 0, men: 0, kids: 0, all: 0 });
    s[a]++; s.all++;
  }
  const out = {};
  for (const [k, s] of Object.entries(n)) {
    if (s.all < 50) continue;
    for (const a of ["women", "men"]) if (s[a] / s.all >= 0.95) out[k] = a;
  }
  return out;
}

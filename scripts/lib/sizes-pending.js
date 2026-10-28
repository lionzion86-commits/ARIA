/* ============================================================
   SIZES PENDING: SHOWN, NOT SOLD (#443 c.6457579787).

   The 2026-10-27 pulls (SNIPES, Carolina Herrera) came without size
   runs: the product pages' JSON-LD carries none. Danny's order is
   explicit -- "footwear BUY activation waits on a PDP-level size pass --
   do not invent sizes". On this site a record with no size list sells
   with no picker, so those items would have been bought sizeless.

   An item the catalogue marks `sizesPending: true` (footwear, apparel:
   scripts/lib/store-pull-normalize.js) is browsable -- storefront, search,
   product page -- but not buyable: the product page shows "Tallas por
   confirmar" instead of the cart button, and this is the rule at the
   door the money goes through (netlify/functions/orders-create.js),
   refused before anything is written or charged, like an off-sale line.

   The list is generated with the catalogues (scripts/build-pull-
   catalogs.mjs writes sizes-pending-data.js); when a size pass lands,
   the items it sizes lose the flag and leave the list on the next build.
   ============================================================ */
import { SIZES_PENDING } from "./sizes-pending-data.js";

export const SIZES_PENDING_NOTE = "Estamos confirmando las tallas de este producto con la tienda. Muy pronto podrás comprarlo aquí.";

export const sizesPendingKey = (retailer, title) =>
  String(retailer || "").toLowerCase().trim() + "::" + String(title || "").toLowerCase().replace(/\s+/g, " ").trim();

const SET = new Set(SIZES_PENDING);

export function isSizesPending(retailer, title) {
  return SET.has(sizesPendingKey(retailer, title));
}

/** The order lines that may not be sold yet. */
export function sizesPendingLines(items) {
  /* The list is keyed by name, and one name can be two colourways (one
     sized by the PDP pass, one not): a line that carries a chosen size
     is not being sold sizeless. */
  return (Array.isArray(items) ? items : []).filter((it) => it && isSizesPending(it.retailer, it.title || it.name)
    && !String(it.selectedSize ?? it.size ?? "").trim());
}

export function sizesPendingOrderError(title) {
  return `Todavía no podemos vender «${String(title || "este producto")}»: estamos confirmando sus tallas con la tienda. Quítalo del carrito para continuar.`;
}

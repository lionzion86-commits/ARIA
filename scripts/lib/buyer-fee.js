/* ============================================================
   ARIA'S OWN DELIVERY FEE -- THE BUYER'S SOL PER STORE CHECKOUT. ONE RULE.

   WHY (#443 c.6560848572, Danny, 2026-11-01): every STORE CHECKOUT in an
   order carries a flat S/ 1.00, charged to the customer, that funds the
   buying agent's pay for that checkout. 2 stores = S/ 2. Free-shipping
   store or not: one uniform rule.

   WHERE IT SITS, AND ONLY THERE: Aria's own delivery fee line at checkout
   ("Envío Aria"). It is never folded into
     - a store's shipping line (exact pass-through, /store-shipping.js),
     - the $13/kg freight (overage refunds are computed off it),
     - the provincia leg (Olva/Shalom, exact, /couriers.js).
   Browse-time surfaces (cards, product page, cart, the comparison door
   price) do not show it: totals live at checkout only.

   SOLES, NO EXCHANGE RATE. The fee is a soles figure, like the small-order
   fee and the provincia leg, so it is added to the soles total as it is;
   no rate is applied to it, and none is invented.

   ONE COUNT. A store checkout is a store in the cart, grouped exactly the
   way the store-shipping rule groups lines (cartShipping): a combo
   discount is not a store, a line with no retailer is not a store. The
   page (checkout.html) and the server (orders-create.js) both import this
   module, so the charged figure can never disagree with the one shown.

   Buyer pay itself is NOT decided here: the dispatch side keeps its locked
   per-item ladder, and Aria absorbs any difference.
   ============================================================ */
import { cartShipping } from "./store-shipping.js";

/** S/ per store checkout in the order. */
export const BUYER_FEE_PEN_PER_STORE = 1;

/** The line's name on the checkout summary. */
export const ARIA_DELIVERY_LABEL = "Envío Aria";

const r2 = (n) => Math.round(Number(n) * 100) / 100;

/** How many store checkouts this cart becomes. */
export function storeCheckoutCount(lines) {
  return cartShipping(Array.isArray(lines) ? lines : []).stores.length;
}

/** The buyer's sol per store checkout, in soles. 0 for an empty cart. */
export function buyerFeePen(lines) {
  return r2(storeCheckoutCount(lines) * BUYER_FEE_PEN_PER_STORE);
}

/** The note under the line: «Incluye servicio de compra por tienda: S/ 1.00 x 2 tiendas». */
export function ariaDeliveryNote(storeCount) {
  const n = Math.max(0, Math.round(Number(storeCount) || 0));
  return `Incluye servicio de compra por tienda: S/ ${BUYER_FEE_PEN_PER_STORE.toFixed(2)} × ${n} ${n === 1 ? "tienda" : "tiendas"}`;
}

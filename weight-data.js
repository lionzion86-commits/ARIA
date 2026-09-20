// This module is IMPORTED BY checkout.html, so the browser downloads it
// and everything in it is public. Only customer-facing figures may live
// here.
//
// COST_PER_KG and PROFIT_PER_KG used to be exported from this file. They
// are our internal AVI Courier cost and margin, and shipping them to every
// checkout visitor exposed both — the old comment forbade importing them
// into the frontend, but the values travelled with the file anyway. They
// now live in netlify/functions/_courier-economics.js, which is server
// only. Do not bring them back.
export const CHARGE_PER_KG = 13; // the rate actually charged to and shown to the customer
export const BASE_FEE = 0;

// Peru import duty/IGV policy, as already publicly disclosed on the site
// (resultsView's "Los envíos de hasta 200 dólares..." info box): shipments
// with a declared value over this threshold get an additional duty charge
// of roughly this rate on the declared value. AVI Courier's real live
// quote already applies this (and checkout.html shows it as a real,
// itemized line rather than letting it appear as an unexplained gap in
// the total) — these two constants exist so the LOCAL fallback quote
// (used only when AVI's API can't be reached) estimates the same charge
// instead of silently under-quoting a customer whose order is actually
// over the threshold.
export const DUTY_THRESHOLD_USD = 200;
export const DUTY_RATE = 0.23;

/* ============================================================
   SMALL-ORDER FEE (2026-09-20) — site-wide, not beauty-only.

   A S/ 30 lipstick costs the same to receive, unpack, check, label and
   hand to a courier in Lima as a S/ 300 laptop does. Below a certain
   basket the handling simply costs more than the order earns, and the
   two honest options are to refuse the order or to charge what it costs.
   This charges what it costs.

   It is presented as exactly that: a flat line item with its own name,
   shown in the cart and in the checkout breakdown before payment, with
   the threshold stated next to it so a shopper who is S/ 6 short can see
   it and decide. No countdown, no pressure, no "you're missing out" —
   the note is the rule, in plain words.

   Both numbers are config, not arithmetic scattered through the UI. The
   fee is in SOLES because it is a Peru-side handling cost, and because
   the threshold is compared against the price the shopper actually sees
   (which already carries the 24% markup and the FX conversion).
   ============================================================ */
export const SMALL_ORDER_THRESHOLD_PEN = 50;
export const SMALL_ORDER_FEE_PEN = 10;

/* WHAT THE THRESHOLD IS MEASURED AGAINST (2026-09-20, policy fix).

   REPORTED LIVE: a cart of one T-shirt at S/ 44.69 plus S/ 10.07 of
   freight — S/ 54.76 all in — was charged the S/ 10 "pedido pequeño"
   fee, under a label reading "Sin cargo en PEDIDOS desde S/ 50". The
   label said orders; the code compared the product subtotal alone. A
   S/ 54.76 order is not a small order, and a fee whose own note
   contradicts it is worse than a fee.

   So the base is PRODUCTS + INTERNATIONAL FREIGHT, which is what a
   shopper means by "mi pedido" and what the label always claimed. The
   fee keeps doing its job — a genuinely small basket still pays it,
   because handling a S/ 30 lipstick costs what it costs — it just stops
   firing on orders that are over the line once the freight they are
   really paying is counted.

   NOT INCLUDED: import duty. That is money collected for the Peruvian
   government on orders over $200, and an order that large is never a
   small one anyway — folding it in would only ever move the line in a
   direction that cannot matter. Also not the fee itself: a fee that
   pushes an order over its own threshold and thereby cancels itself is
   a circular rule. */

/**
 * The fee an ORDER attracts — products plus international freight, in
 * soles, as the shopper sees them. 0 at or above the threshold.
 *
 * @param {number} orderSubtotalPen products + freight, in PEN.
 */
export function smallOrderFeePen(orderSubtotalPen) {
  const subtotal = Number(orderSubtotalPen);
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;
  return subtotal < SMALL_ORDER_THRESHOLD_PEN ? SMALL_ORDER_FEE_PEN : 0;
}

/** "Sin cargo en pedidos desde S/ 50" — the note shown beside the fee. */
export const SMALL_ORDER_FEE_LABEL = "Pedido pequeño";
/* Says the basis out loud. The old note named a threshold without saying
   what it was measured against, which is exactly how the copy and the
   code drifted apart without anyone noticing. */
export const SMALL_ORDER_FEE_NOTE =
  `Sin cargo en pedidos desde S/ ${SMALL_ORDER_THRESHOLD_PEN} (productos + flete)`;

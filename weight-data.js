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

/* ============================================================
   THE IMPORT-TAX ESTIMATE (2026-09-21) — ARIA'S NUMBER, NOT THE
   COURIER'S

   WHAT THIS REPLACES. Checkout used to show the courier's own duty: the
   live quote returns a total that already has AVI's taxes folded into
   it, and the page derived the charge back out by subtracting value and
   freight. Two problems with that. It made the figure whatever AVI
   happened to charge that day, so nothing could be promised about it in
   advance; and the local fallback applied its own separate DUTY_RATE,
   so the number a customer saw depended on whether an API call had
   succeeded.

   Aria estimates it now, from one rule, and stands behind the estimate:

     OVER-ESTIMATE  -> the difference is credited back as saldo Aria.
     UNDER-ESTIMATE -> Aria absorbs it. The customer pays nothing extra.

   That promise is only possible because the number is ours. It is also
   why the row says "estimado" in the UI and never pretends to be a
   settled SUNAT assessment.

   THRESHOLD IS FOB, THE MATH IS CIF, and the two are deliberately
   different quantities:

     FOB  the goods alone — what the products cost. This decides WHETHER
          any tax applies, because Peru's $200 de minimis is a threshold
          on the value of the goods.
     CIF  goods + international freight — the base customs actually
          assesses against. This decides HOW MUCH.

   Mixing them up is the classic way to get this wrong in either
   direction: thresholding on CIF taxes a $180 order because its freight
   pushed it over $200, and computing on FOB under-collects on every
   heavy parcel. Both are handled by importTaxEstimateUsd() and nothing
   else is allowed to do this arithmetic.

   THE RATE IS CONFIG. 25% is a starting point, not a researched
   constant — Peru's real burden is roughly 6% ad valorem plus 18% IGV
   with a handful of per-category exceptions, and the first real SUNAT
   document is what should calibrate it. Change the number here; nothing
   downstream hardcodes it.
   ============================================================ */
export const TAX_ESTIMATE_THRESHOLD_USD = 200;   // measured on FOB
export const TAX_ESTIMATE_RATE = 0.25;           // applied to CIF

/**
 * Aria's estimated import tax for an order, in USD.
 *
 * @param {number} fobUsd      products only — decides whether tax applies
 * @param {number} freightUsd  international freight — part of the base
 * @returns {number} 0 when the order is at or under the FOB threshold.
 */
export function importTaxEstimateUsd(fobUsd, freightUsd = 0) {
  const fob = Number(fobUsd);
  if (!Number.isFinite(fob) || fob <= TAX_ESTIMATE_THRESHOLD_USD) return 0;
  const freight = Number(freightUsd);
  const cif = fob + (Number.isFinite(freight) && freight > 0 ? freight : 0);
  return Math.round(cif * TAX_ESTIMATE_RATE * 100) / 100;
}

/** The row's own label and the promise printed under it. */
export const TAX_ESTIMATE_LABEL = "Impuestos de importación (estimado)";
export const TAX_ESTIMATE_NOTE =
  "Impuestos estimados — si el monto real es menor, te devolvemos la diferencia como saldo Aria.";

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

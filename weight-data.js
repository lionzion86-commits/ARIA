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

/** The fee a product subtotal (in soles, as displayed) attracts. 0 at or above the threshold. */
export function smallOrderFeePen(productSubtotalPen) {
  const subtotal = Number(productSubtotalPen);
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;
  return subtotal < SMALL_ORDER_THRESHOLD_PEN ? SMALL_ORDER_FEE_PEN : 0;
}

/** "Sin cargo en pedidos desde S/ 50" — the note shown beside the fee. */
export const SMALL_ORDER_FEE_LABEL = "Pedido pequeño";
export const SMALL_ORDER_FEE_NOTE = `Sin cargo en pedidos desde S/ ${SMALL_ORDER_THRESHOLD_PEN}`;

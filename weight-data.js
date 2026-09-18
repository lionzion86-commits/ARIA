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

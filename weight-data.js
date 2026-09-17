// RULE: COST_PER_KG and PROFIT_PER_KG are our internal AVI Courier cost
// and margin — never import either into index.html, checkout.html, or any
// other customer-facing file. Only CHARGE_PER_KG (the $13/kg rate actually
// shown to and charged to the customer) and BASE_FEE belong in the
// frontend. This was violated once already (a homepage calculator showed
// "Mi costo"/"Mi ganancia" publicly) — don't reintroduce it.
export const COST_PER_KG = 9;
export const CHARGE_PER_KG = 13;
export const PROFIT_PER_KG = 4;
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

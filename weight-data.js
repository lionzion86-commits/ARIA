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

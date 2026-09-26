/* ============================================================
   RETAILER DELIVERY — the Miami transit dataset (2026-09-26).

   SINGLE SOURCE OF TRUTH for how long each retailer's orders take to
   reach Aria's Miami warehouse. Every figure comes from the delivery
   research briefs (store-delivery-research.md and
   department-store-shipping-research.md); nothing here is invented.
   A store with no researched figure has NO ROW — the UI shows no
   delivery line for it rather than guessing.

   Shape per retailer:
     miamiMin / miamiMax — business days, store -> Miami warehouse.
       miamiMin may be null ("hasta X días", e.g. Skims).
     tier — 'green' | 'yellow' | 'red'. Red-tier storefronts carry the
       honest-warning banner.
     plus — when true the max is open-ended ("7–30+ días", Alphalete).
     noteEs — Spanish origin/exception note, appended where shown.

   EXTENDING: to add a future store, add one row with researched
   numbers. No other file changes. B&H, Adorama, Kohl's, REI,
   New Balance, Madewell and Advance Auto Parts already have rows so
   their storefronts light up the moment their catalogues land — no
   storefront or rail is added for them here.

   MIRROR: index.html carries the same table as a page-level const
   (it cannot import). scripts/test/run-tests.mjs asserts the two stay
   identical — edit here, then mirror there.
   ============================================================ */

export const MIAMI_TO_DOOR_MIN = 2;
export const MIAMI_TO_DOOR_MAX = 7;

export const RETAILER_DELIVERY = {
  /* GREEN — reliable shippers, merchandised first. */
  revolve:    { miamiMin: 2, miamiMax: 2, tier: "green", noteEs: "Entrega típica: unos 2 días." },
  target:     { miamiMin: 2, miamiMax: 5, tier: "green" },
  footlocker: { miamiMin: 3, miamiMax: 5, tier: "green" },
  walmart:    { miamiMin: 2, miamiMax: 5, tier: "green" },
  autozone:   { miamiMin: 3, miamiMax: 5, tier: "green" },
  dyson:      { miamiMin: 2, miamiMax: 5, tier: "green" },
  bestbuy:    { miamiMin: 2, miamiMax: 3, tier: "green" },
  miumiu:     { miamiMin: 3, miamiMax: 5, tier: "green" },
  goldengoose:{ miamiMin: 2, miamiMax: 5, tier: "green" },
  /* YELLOW — standard. */
  sephora:        { miamiMin: 1, miamiMax: 3, tier: "yellow" },
  macys:          { miamiMin: 3, miamiMax: 6, tier: "yellow" },
  dicks:          { miamiMin: 3, miamiMax: 6, tier: "yellow" },
  costco:         { miamiMin: 5, miamiMax: 7, tier: "yellow" },
  skims:          { miamiMin: null, miamiMax: 7, tier: "yellow" },
  victoriassecret:{ miamiMin: 3, miamiMax: 6, tier: "yellow" },
  ulta:           { miamiMin: 3, miamiMax: 8, tier: "yellow" },
  pacsun:         { miamiMin: 5, miamiMax: 7, tier: "yellow" },
  /* SURF & SKATE BATCH (2026-09-26, Danny): nine surf/skate/spearfishing
     shops, browse-from-catalogue. All Florida shops at the standard
     3–6 day yellow tier; Val Surf ships from California (5–8). */
  nautilus:        { miamiMin: 3, miamiMax: 6, tier: "yellow" },
  islandwatersports:{ miamiMin: 3, miamiMax: 6, tier: "yellow" },
  quietstorm:      { miamiMin: 3, miamiMax: 6, tier: "yellow" },
  surfworld:       { miamiMin: 3, miamiMax: 6, tier: "yellow" },
  surfstation:     { miamiMin: 3, miamiMax: 6, tier: "yellow" },
  mainland:        { miamiMin: 3, miamiMax: 6, tier: "yellow" },
  parrot:          { miamiMin: 3, miamiMax: 6, tier: "yellow" },
  ccs:             { miamiMin: 3, miamiMax: 6, tier: "yellow" },
  valsurf:         { miamiMin: 5, miamiMax: 8, tier: "yellow" },
  bathandbodyworks:{ miamiMin: 3, miamiMax: 7, tier: "yellow" },
  oldnavy:        { miamiMin: 3, miamiMax: 5, tier: "yellow" },
  partycity:      { miamiMin: 5, miamiMax: 7, tier: "yellow" },
  samsclub:       { miamiMin: 3, miamiMax: 5, tier: "yellow" },
  kohls:          { miamiMin: 3, miamiMax: 6, tier: "yellow" },
  /* RED — honest-warning banner on the storefront. */
  yesstyle:   { miamiMin: 14, miamiMax: 28, tier: "red", noteEs: "Se envía desde Hong Kong." },
  lanebryant: { miamiMin: 5, miamiMax: 8, tier: "red" },
  alphalete:  { miamiMin: 7, miamiMax: 30, tier: "red", plus: true, noteEs: "Puede superar los 30 días." },
  ssense:     { miamiMin: 5, miamiMax: 5, tier: "red", noteEs: "Se envía desde Montreal, Canadá." },
  fendi:      { miamiMin: 3, miamiMax: 30, tier: "red", noteEs: "Normalmente unos 3 días, pero hasta 30 si el pedido se prepara en Italia." },
  qvc:        { miamiMin: 7, miamiMax: 10, tier: "red" },
  /* FUTURE STORES — researched, no catalogue yet. Rows exist so the UI
     lights up with zero code changes when they go live. */
  bhphoto:    { miamiMin: 1, miamiMax: 5, tier: "green" },
  adorama:    { miamiMin: 1, miamiMax: 3, tier: "green" },
  rei:        { miamiMin: 3, miamiMax: 5, tier: "green" },
  newbalance: { miamiMin: 2, miamiMax: 5, tier: "green" },
  advanceauto:{ miamiMin: 3, miamiMax: 4, tier: "green" },
  madewell:   { miamiMin: 3, miamiMax: 7, tier: "yellow" },
};

export function deliveryFor(key) {
  return RETAILER_DELIVERY[String(key || "").toLowerCase()] || null;
}

/* "2–5 días" · "2 días" · "hasta 7 días" · "7–30+ días" */
export function miamiRangeEs(entry) {
  if (!entry) return null;
  const { miamiMin, miamiMax, plus } = entry;
  const max = `${miamiMax}${plus ? "+" : ""}`;
  if (miamiMin == null) return `hasta ${max} días`;
  if (miamiMin === miamiMax && !plus) return `${miamiMin} días`;
  return `${miamiMin}–${max} días`;
}

/* "Llega a nuestro almacén en Miami en 2–5 días." — null when unresearched.
   When only a max is researched the copy reads "en 7 días como máximo"
   (never the awkward "en hasta 7 días"). */
export function storeDeliveryLineEs(key) {
  const e = deliveryFor(key);
  if (!e) return null;
  if (e.miamiMin == null) {
    const max = `${e.miamiMax}${e.plus ? "+" : ""}`;
    return `Llega a nuestro almacén en Miami en ${max} días como máximo.`;
  }
  return `Llega a nuestro almacén en Miami en ${miamiRangeEs(e)}.`;
}

/* Red-tier storefront banner. Null for non-red stores. */
export function redTierNoticeEs(key) {
  const e = deliveryFor(key);
  if (!e || e.tier !== "red") return null;
  const range = miamiRangeEs(e);
  let s = `Aviso honesto: los pedidos de esta tienda tardan ${range} en llegar a nuestro almacén en Miami. De ahí a tu puerta: ${MIAMI_TO_DOOR_MIN}–${MIAMI_TO_DOOR_MAX} días.`;
  if (e.noteEs) s += ` ${e.noteEs}`;
  return s;
}

/* The slowest store in a key list — sets the visible expectation at
   checkout. Ties break toward the larger min. Returns the key. */
export function slowestDeliveryKey(keys) {
  let best = null;
  for (const k of keys || []) {
    const e = deliveryFor(k);
    if (!e) continue;
    if (!best || e.miamiMax > best.e.miamiMax ||
        (e.miamiMax === best.e.miamiMax && (e.miamiMin || 0) > (best.e.miamiMin || 0))) {
      best = { key: String(k).toLowerCase(), e };
    }
  }
  return best ? best.key : null;
}

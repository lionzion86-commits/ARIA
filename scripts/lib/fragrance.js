/* ============================================================
   FRAGRANCE -- WHAT IS A PERFUME. ONE DEFINITION (#443, 2026-10-22).

   WHY. Two orders landed together: a Perfumes carousel on the home
   page and in Aria Beauty > Fragancias, and a cap of four perfume units
   per order (the courier's restricted-air-freight clause, now enforced
   as an order rule with a way out: the extras move to a second order).
   The carousel and the cap must agree on what a perfume is, or the
   shelf sells something the cart then refuses -- or the cart refuses
   "Fragrance Free" baby wipes, which the old title test counted.

   WHAT. /fragrance.js holds the one classifier:
     - a store's own declaration wins (restricted: "fragancia-max-4",
       then its product type: Fragancia, FRAGRANCE, COLOGNE, BODY_MIST,
       ... -- the beauty aisle's types);
     - then the title: "eau de parfum", "perfume", "cologne", "EDT" ...;
     - never: fragrance-free / unscented, trays, candles, diffusers,
       wipes, dolls, atomizers; a body wash or lotion "with fragrance"
       only counts when the title also names a perfume outright.
   isPerfumeBottle() narrows that to bottles for the carousel (no body
   or hair mists, samplers or vouchers). The cap counts every fragrance.

   WHO READS IT. scripts/build-perfumes-shelf.mjs (the carousel),
   scripts/lib/beauty-weight.js (isFragrance / fragranceLimitState, so
   the weight resolver, checkout and the shipping provider follow),
   netlify/functions/orders-create.js (the 400 at the money door),
   index.html's cart (window.AriaFragrance, loaded before the bundle)
   and checkout.html.

   SHAPE. Same as /off-sale.js: a plain script that works as a classic
   <script src>, as a side-effect ESM import (this file) and in a vm.
   ============================================================ */
import "../../fragrance.js";

const api = globalThis.AriaFragrance;
export const MAX_PERFUMES_PER_ORDER = api.MAX_PERFUMES_PER_ORDER;
export const NEXT_ORDER_KEY = api.NEXT_ORDER_KEY;
export const isFragranceItem = api.isFragranceItem;
export const isPerfumeBottle = api.isPerfumeBottle;
export const perfumeUnits = api.perfumeUnits;
export const capState = api.capState;
export const splitForCap = api.splitForCap;
export const CAP_GUIDANCE = api.CAP_GUIDANCE;
export const capOrderError = api.capOrderError;

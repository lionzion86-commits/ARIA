/* ============================================================
   OFF SALE — THE STORES ARIA NO LONGER SELLS FROM. ONE LIST.

   WHY (2026-10-20, issue #443). A store whose own terms forbid resale,
   or that refuses Aria's orders, is not a channel: every product shown
   from it is a promise Aria cannot keep. Its catalogue is RETAINED
   (photos, weights, Spanish descriptions, sizes -- the audit's salvage
   rule; a channel may open later, and products may port to a live
   source), but nothing from it is sold:

     - no storefront, store tile, home shelf or store rail;
     - no Ofertas slice, search row, PDP rail or comparison price;
     - the assistant neither names it nor routes to it;
     - its record cannot enter the cart, a cart line from it is shown
       as unavailable with Quitar and blocks Pagar, and orders-create
       refuses the order with a 400 before anything is charged.

   Every builder (scripts/build-*.mjs), the pages, the assistant and the
   checkout server read THIS list. Taking a store off sale is adding its
   retailer key here and re-running the builders; putting it back is
   removing it. Nothing else is edited by hand.

   SHAPE. A plain script that works three ways: a classic <script src>
   on the pages (sets window.AriaOffSale before the page code runs), a
   side-effect ESM import (scripts/lib/off-sale.js re-exports it for
   the builders, checkout.html and the Netlify functions), and a vm
   context. It must stay free of import/export for that reason.
   ============================================================ */

/* THE STORES ON THE LIST, AND WHY (keys as the catalogues spell them;
   the list itself is in /off-sale.js, kept short for the phone):
     target           Target (2026-10-20, c.6301033619, Danny): residential-
                      only shipping, no resale exemption, reseller account
                      flagged.
     the rest         Sourcing audit Part A, step 1 (c.6303274201): REMOVE as
                      a source -- bestbuy, costco (its costco.com catalogue;
                      the in-store channel is Part B and has no data key),
                      nike, footlocker, kohls, macys, gap, oldnavy,
                      bananarepublic, athleta, ulta, ssense, yesstyle,
                      newbalance, gymshark, alphalete, miumiu, fendi,
                      goldengoose, pacsun. Listings off sale, data retained;
                      porting to the fallback lanes is a later step. Nike
                      direct, Athleta, Fendi and Golden Goose direct have no
                      listings today and are listed so none is added by
                      mistake; Golden Goose through Farfetch/Revolve is
                      retailer `farfetch` / `revolve` and stays.
     surfworld        Surf World (#443 item 40): the store closed, Sept 2026.
                      Gone from every served file as well (closed-store-purge).
     samsclub         Sam's Club (#443 c.6468346931, Danny, 2026-10-28): one
                      2026-09-26 scrape of a disposables aisle (120 products)
                      cannot be a real store. Gone from every shopper surface
                      and registry; samsclub-catalog.json is shelved, not
                      deleted (the Sephora/SSENSE pattern), for a club that
                      can return real.
   BACK ON SALE AS UNTESTED LANES (#443, Danny, 2026-10-24; Item 35: real
   orders or a test order decide the verdict):
     ssense           22:50 -- Neiman Marcus is not secured; premium depth.
     footlocker       23:34 -- no forwarder ban on its shipping page; its
                      carousel returns with the lead store rails.
     victoriassecret  2026-10-29 -- Victoria's Secret direct (off
                      2026-10-20, c.6304525284) is BACK (Danny, c.6472207775,
                      c.6472266366, c.6495111883): the test order shipped
                      Oct 28. Its sale rail leads the homepage store band
                      and its markdowns open the Ofertas carousel. */

/* This module re-exports /off-sale.js for the builders, checkout.html and
   the Netlify functions; the list itself lives there, once. */
/* The held-used rule (isOffSaleItem) reads /condition.js. */
import "../../condition.js";
import "../../off-sale.js";

const api = globalThis.AriaOffSale;
export const OFF_SALE_RETAILERS = api.OFF_SALE_RETAILERS;
export const isOffSaleRetailer = api.isOffSaleRetailer;
export const isOffSaleItem = api.isOffSaleItem;
export const offSaleLines = api.offSaleLines;
export const OFF_SALE_LINE_NOTE = api.OFF_SALE_LINE_NOTE;
export const OFF_SALE_PRODUCT_NOTE = api.OFF_SALE_PRODUCT_NOTE;
export const offSaleOrderError = api.offSaleOrderError;

/** Drop the off-sale stores from a catalogue envelope ({ retailers: {...} }), in place. */
export function withoutOffSaleRetailers(env) {
  if (!env || typeof env !== "object" || !env.retailers || typeof env.retailers !== "object") return env;
  for (const k of Object.keys(env.retailers)) if (isOffSaleRetailer(k)) delete env.retailers[k];
  return env;
}

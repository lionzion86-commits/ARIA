/* NO CLAIM WITHOUT A CHOICE -- ONE RULE FOR EVERY TITLE A SHOPPER READS
   (#443 c.6568696054, Danny's phone pass: "sweep every makeup surface").

   A store title that says "- 16 Colors" or "- 3 Shades" promises a
   choice. YesStyle sells one listing per product and its shades are in
   no pull we hold, so no card, sheet or cart line can offer that choice:
   the title SHOWN drops the claim. The record, the cart line's stored
   title, the product-page link and the price lookups keep the store's
   words untouched (they are keyed by title) -- this is display only.

   The rule: a number followed by up to three words and a PLURAL
   "colors / colours / shades / tones / types / tonos / colores" (never
   "Color-Correcting", never a singular "Hair Color"). A palette's
   "12 Colors" is what is inside it, not a choice, and stays.

   A plain script on purpose (no import/export), like /off-sale.js: pages
   load it with <script src="/display-name.js">; producto.html,
   search.html, tienda.html, departamento.html, marca.html, ofertas.html,
   checkout.html and the app bundle (index.html) all call
   AriaDisplayName.displayName(title). Tests load it with vm. */
(function (root) {
  'use strict';
  var CHOICE_CLAIM_RX = /\s*(?:[-–—|,(]\s*)?\b\d+\s+(?:[A-Za-z][\w-]*\s+){0,3}?(?:colou?rs|shades|tones|types|tonos|colores)\b(?!-)\)?/gi;
  var PALETTE_RX = /\b(?:palettes?|paleta|quad|octet)\b/i;
  function displayName(name) {
    var t = String(name == null ? '' : name);
    if (!t || PALETTE_RX.test(t)) return t;
    var out = t.replace(CHOICE_CLAIM_RX, '').replace(/\s{2,}/g, ' ').replace(/\s*[-–—|:,]\s*$/, '').trim();
    return out || t;
  }
  root.AriaDisplayName = Object.freeze({
    CHOICE_CLAIM_RX: CHOICE_CLAIM_RX,
    PALETTE_RX: PALETTE_RX,
    displayName: displayName,
  });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));

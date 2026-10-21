/* OFF SALE -- the stores Aria no longer sells from. ONE LIST (#443).
   Every builder, page, the assistant and orders-create read it; see
   scripts/lib/off-sale.js for the why and the rules. A plain script on
   purpose (no import/export): pages load it with <script src>. */
(function (root) {
  'use strict';
  /* Retailer keys (the catalogue's `retailers.<key>` and every record's
     `retailer`). In-store / other-channel twins of a store are separate
     keys and are not listed here. */
  var OFF_SALE_RETAILERS = [
    /* Victoria's Secret direct (2026-10-20, #443 c.6304525284, Danny):
       personal-use-only terms, no warehouse channel. A VS carousel may
       return later sourced from Amazon's VS listings (retailer of
       record = Amazon), never from victoriassecret.com. */
    'victoriassecret',
  ];
  var SET = {};
  for (var i = 0; i < OFF_SALE_RETAILERS.length; i++) SET[OFF_SALE_RETAILERS[i]] = true;

  function isOffSaleRetailer(key) {
    return SET[String(key == null ? '' : key).trim().toLowerCase()] === true;
  }
  /* A record or a cart line: its store is `retailer` (`store` on the
     Ofertas cards). */
  function isOffSaleItem(it) {
    return !!it && typeof it === 'object' && isOffSaleRetailer(it.retailer || it.store);
  }
  /* The cart lines that cannot be sold. A combo-discount line has no
     store of its own. */
  function offSaleLines(items) {
    var out = [];
    var list = Array.isArray(items) ? items : [];
    for (var j = 0; j < list.length; j++) {
      var it = list[j];
      if (it && typeof it === 'object' && it.lineType !== 'bundle-discount' && isOffSaleItem(it)) out.push(it);
    }
    return out;
  }
  /* The words a shopper sees. No store is named: the line already shows
     which product it is. */
  var OFF_SALE_LINE_NOTE = 'Este producto ya no está disponible en Aria. Quítalo de tu carrito para poder pagar.';
  var OFF_SALE_PRODUCT_NOTE = 'Este producto ya no está disponible en Aria.';
  function offSaleOrderError(title) {
    return 'El producto “' + String(title || 'de tu carrito') + '” ya no está disponible en Aria. '
      + 'Quítalo de tu carrito para continuar. No se cobró nada.';
  }

  root.AriaOffSale = Object.freeze({
    OFF_SALE_RETAILERS: Object.freeze(OFF_SALE_RETAILERS.slice()),
    isOffSaleRetailer: isOffSaleRetailer,
    isOffSaleItem: isOffSaleItem,
    offSaleLines: offSaleLines,
    OFF_SALE_LINE_NOTE: OFF_SALE_LINE_NOTE,
    OFF_SALE_PRODUCT_NOTE: OFF_SALE_PRODUCT_NOTE,
    offSaleOrderError: offSaleOrderError,
  });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));

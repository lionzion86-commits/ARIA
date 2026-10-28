/* OFF SALE -- the stores Aria no longer sells from. ONE LIST (#443).
   Every builder, page, the assistant and orders-create read it; see
   scripts/lib/off-sale.js for the why and the rules. A plain script on
   purpose (no import/export): pages load it with <script src>. */
(function (root) {
  'use strict';
  /* Retailer keys. Why each store is here: scripts/lib/off-sale.js. */
  var OFF_SALE_RETAILERS = [
    'victoriassecret', 'target',
    'bestbuy', 'costco', 'nike', 'kohls', 'macys',
    'gap', 'oldnavy', 'bananarepublic', 'athleta',
    'ulta', 'yesstyle', 'newbalance', 'gymshark', 'alphalete',
    'miumiu', 'fendi', 'goldengoose', 'pacsun', 'surfworld', 'samsclub',
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

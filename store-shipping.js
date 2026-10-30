/* ============================================================
   STORE SHIPPING -- WHAT EACH US STORE CHARGES TO SHIP TO MIAMI. ONE RULE.

   WHY (2026-10-29, #443 c.6511807569, Danny): US domestic shipping is
   charged PER STORE, and the shopper always sees where she stands against
   each store's rule -- Precio Honesto, no surprise at payment. A $20 shirt
   at a store that charges $10.95 to ship (his Macy's test) shows that cost
   on the card and the product page, long before checkout.

   THE RULE IS THE STORE'S OWN: a fee under its free-shipping threshold,
   nothing at or over it. The threshold is measured in the STORE's prices
   (its merchandise subtotal, before the Miami sales tax and never Aria's
   card price), store by store: a Victoria's Secret meter counts only the
   Victoria's Secret lines. It is not the import-tax meter (that one is
   order-wide against US$ 200).

   NO GUESSED NUMBER. A store is on the table only with a source. A store
   that is not here shows no shipping line and is charged no shipping --
   the page says nothing it cannot back. scripts/test/store-shipping-tests.mjs
   lists which live stores still need their terms.

   SHAPE. A plain script, like /off-sale.js and /condition.js: a classic
   <script src> on the pages (window.AriaStoreShipping), and a side-effect
   ESM import (scripts/lib/store-shipping.js re-exports it for checkout's
   server side). It must stay free of import/export.
   ============================================================ */
(function (root) {
  'use strict';
  /* feeUsd: charged when the store subtotal is under freeOverUsd.
     freeOverUsd: null when the store publishes no free-shipping line.
     source: where the numbers come from; verified: read off the store's
     own published terms at build time (false: given by Danny, not yet
     re-read live -- this build's network cannot reach the stores). */
  var STORE_SHIPPING = {
    victoriassecret: { feeUsd: 7.99, freeOverUsd: 35, source: 'Danny, #443 c.6511807569', verified: false },
    calzedonia: { feeUsd: 9, freeOverUsd: 75, source: 'Danny, #443 c.6511807569', verified: false },
    intimissimi: { feeUsd: 9, freeOverUsd: 75, source: 'Danny, #443 c.6511807569', verified: false },
    macys: { feeUsd: 10.95, freeOverUsd: null, source: 'Danny, #443 c.6511829027 (his test case)', verified: false },
  };

  /* The Miami sales tax Aria pays at each register (Walmart exempt), the
     same rule as producto.html and _search-core.js (a test pins them
     together): the line's dutiable base divided by it is the store's own
     price. */
  var SALES_TAX_EXEMPT = { walmart: 1 };
  function salesTaxRateOf(store) { return SALES_TAX_EXEMPT[keyOf(store)] ? 1 : 1.07; }

  function r2(n) { return Math.round(Number(n) * 100) / 100; }
  function money(n) {
    var v = r2(n);
    return '$' + (v % 1 === 0 ? String(v) : v.toFixed(2));
  }
  function keyOf(k) { return String(k == null ? '' : k).trim().toLowerCase(); }

  /** The store's rule, or null when Aria has no sourced terms for it. */
  function ruleOf(store) {
    var r = STORE_SHIPPING[keyOf(store)];
    return r ? r : null;
  }

  /** The card line, both numbers: «Envío gratis desde $35 · $7.99 debajo de ese monto». */
  function ruleText(store) {
    var r = ruleOf(store);
    if (!r) return null;
    if (r.freeOverUsd == null) return 'Envío de la tienda en EE.UU.: ' + money(r.feeUsd);
    return 'Envío gratis desde ' + money(r.freeOverUsd) + ' · ' + money(r.feeUsd) + ' debajo de ese monto';
  }

  /* A cart line's value in the STORE's prices. The line carries the
     dutiable base (the store's price plus the sales tax Aria pays at its
     register); the caller's own tax rule takes the tax back out. */
  function storeValueOf(line, taxRateOf) {
    if (!line || typeof line !== 'object' || line.lineType === 'bundle-discount') return 0;
    var qty = Math.max(1, Math.round(Number(line.qty) || 1));
    var d = Number(line.dutiableUsd);
    if (!(d > 0)) return 0;
    var rate = Number((typeof taxRateOf === 'function' ? taxRateOf : salesTaxRateOf)(line.retailer));
    return r2(d / (rate > 0 ? rate : 1)) * qty;
  }

  /** One store's standing: { store, rule, subtotalUsd, feeUsd, met, missingUsd, progress }. */
  function standingOf(store, subtotalUsd) {
    var r = ruleOf(store);
    var sub = r2(Math.max(0, Number(subtotalUsd) || 0));
    if (!r) return { store: keyOf(store), rule: null, subtotalUsd: sub, feeUsd: 0, met: false, missingUsd: null, progress: null };
    if (r.freeOverUsd == null) return { store: keyOf(store), rule: r, subtotalUsd: sub, feeUsd: sub > 0 ? r.feeUsd : 0, met: false, missingUsd: null, progress: null };
    var met = sub >= r.freeOverUsd;
    return {
      store: keyOf(store), rule: r, subtotalUsd: sub,
      feeUsd: sub > 0 && !met ? r.feeUsd : 0,
      met: met,
      missingUsd: met ? 0 : r2(r.freeOverUsd - sub),
      progress: Math.min(1, sub / r.freeOverUsd),
    };
  }

  /** The cart's shipping, store by store, and the total charged. */
  function cartShipping(lines, taxRateOf) {
    var subs = {}, order = [];
    var list = Array.isArray(lines) ? lines : [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (!it || typeof it !== 'object' || it.lineType === 'bundle-discount') continue;
      var k = keyOf(it.retailer);
      if (!k) continue;
      if (!(k in subs)) { subs[k] = 0; order.push(k); }
      subs[k] += storeValueOf(it, taxRateOf);
    }
    var stores = order.map(function (k) { return standingOf(k, subs[k]); });
    var total = 0;
    for (var j = 0; j < stores.length; j++) total += stores[j].feeUsd;
    return { stores: stores, totalUsd: r2(total) };
  }

  /** «Estás en $10.99 de $35». */
  function meterText(s) {
    if (!s || !s.rule || s.rule.freeOverUsd == null) return null;
    return 'Estás en ' + money(s.subtotalUsd) + ' de ' + money(s.rule.freeOverUsd);
  }
  /** «Te faltan $X para envío gratis en Victoria's Secret», or that it is reached. */
  function standingText(s, label) {
    if (!s || !s.rule) return null;
    var name = label || s.store;
    if (s.rule.freeOverUsd == null) return 'Envío de ' + name + ' en EE.UU.: ' + money(s.rule.feeUsd);
    if (s.met) return 'Envío gratis en ' + name + ': ya lo tienes';
    return 'Te faltan ' + money(s.missingUsd) + ' para envío gratis en ' + name;
  }

  var api = {
    STORE_SHIPPING: STORE_SHIPPING, SALES_TAX_EXEMPT: SALES_TAX_EXEMPT, salesTaxRateOf: salesTaxRateOf,
    ruleOf: ruleOf, ruleText: ruleText, storeValueOf: storeValueOf,
    standingOf: standingOf, cartShipping: cartShipping,
    meterText: meterText, standingText: standingText,
    SHIPPING_LINE_LABEL: 'Envío de las tiendas en EE.UU.',
  };
  root.AriaStoreShipping = api;
})(typeof window !== 'undefined' ? window : globalThis);

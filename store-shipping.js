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
  /* feeUsd: charged when the store subtotal is under freeOverUsd; null
     when the store calculates it at its own checkout (by product, ZIP or
     weight) -- the box says so and never shows a number it cannot back.
     freeOverUsd: the free-shipping threshold; 0 when shipping is always
     free; null when the store publishes none.
     note: what the shopper should know (an exclusion, an approximate
     fee); basis: how Aria pays it (a member rule, an observed checkout)
     -- for the record, never shown.
     source: where the numbers come from -- Lucifer's sourced master
     table (shipping-rules-master-2026-10-30.md): each store's official
     policy page or an observed Miami 33166 checkout. A store missing
     here shows no line and is charged nothing.
     DOCTRINE (Danny, Oct 30): where a FREE loyalty program lowers the
     threshold, Aria enrolls its buying account and the rule here is the
     member rule; credit-card tiers never count. FUJI stays off until its
     threshold conflict (125 vs 150) is settled. */
  var STORE_SHIPPING = {
    victoriassecret: { feeUsd: 8, freeOverUsd: 50, source: 'Lucifer, #443 c.6524139671', basis: 'regla de miembro VS & PINK Rewards (Aria compra como miembro); público: gratis desde $100' },
    macys: { feeUsd: 10.95, freeOverUsd: 49, source: 'Lucifer, #443 c.6524139671' },
    calzedonia: { feeUsd: 9, freeOverUsd: 75, source: 'Lucifer, #443 c.6524139671' },
    intimissimi: { feeUsd: 9, freeOverUsd: 75, source: 'Lucifer, #443 c.6524139671' },
    abercrombie: { feeUsd: 7, freeOverUsd: 99, source: 'Lucifer, #443 c.6524139671' },
    americaneagle: { feeUsd: 7.95, freeOverUsd: 75, source: 'Lucifer, #443 c.6524139671' },
    baublebar: { feeUsd: 8, freeOverUsd: 75, source: 'Lucifer, #443 c.6524139671' },
    bentgo: { feeUsd: 9.99, freeOverUsd: 75, source: 'Lucifer, #443 c.6524139671' },
    bhphoto: { feeUsd: 0, freeOverUsd: 0, source: 'Lucifer, #443 c.6524139671', note: 'gratis en la mayoría de productos' },
    boxlunch: { feeUsd: 7.99, freeOverUsd: 75, source: 'Lucifer, #443 c.6524803125' },
    carolinaherrera: { feeUsd: 10, freeOverUsd: 250, source: 'Lucifer, #443 c.6524139671', note: 'tarifa aproximada' },
    costco: { feeUsd: 0, freeOverUsd: 0, source: 'Lucifer, #443 c.6524139671', note: 'incluido en el precio' },
    crocs: { feeUsd: 7.99, freeOverUsd: 49.99, source: 'Lucifer, #443 c.6524139671' },
    everlast: { feeUsd: 9.99, freeOverUsd: null, source: 'Lucifer, #443 c.6524139671' },
    finishline: { feeUsd: 9.99, freeOverUsd: 75, source: 'Lucifer, #443 c.6524139671' },
    gap: { feeUsd: 7.5, freeOverUsd: null, source: 'Lucifer, #443 c.6524139671' },
    hollister: { feeUsd: 7, freeOverUsd: 59, source: 'Lucifer, #443 c.6524139671' },
    hottopic: { feeUsd: 7.99, freeOverUsd: 75, source: 'Lucifer, #443 c.6524139671' },
    jwpei: { feeUsd: 9.9, freeOverUsd: 120, source: 'Lucifer, #443 c.6524139671' },
    kohls: { feeUsd: 8.95, freeOverUsd: 75, source: 'Lucifer, #443 c.6524139671' },
    lanebryant: { feeUsd: 8.95, freeOverUsd: 125, source: 'Lucifer, #443 c.6524139671' },
    miumiu: { feeUsd: 0, freeOverUsd: 0, source: 'Lucifer, #443 c.6524139671' },
    pacsun: { feeUsd: 7, freeOverUsd: 59, source: 'Lucifer, #443 c.6524139671' },
    partycity: { feeUsd: 8.99, freeOverUsd: 50, source: 'Lucifer, #443 c.6524139671' },
    revolve: { feeUsd: 0, freeOverUsd: 0, source: 'Lucifer, #443 c.6524139671', note: 'envío en 2 días' },
    skims: { feeUsd: 8, freeOverUsd: 75, source: 'Lucifer, #443 c.6524139671' },
    ssense: { feeUsd: 14, freeOverUsd: 100, source: 'Lucifer, #443 c.6524139671', note: 'productos en oferta: gratis desde $300' },
    statebags: { feeUsd: 11.5, freeOverUsd: 200, source: 'Lucifer, #443 c.6524139671' },
    ulta: { feeUsd: 6.95, freeOverUsd: 35, source: 'Lucifer, #443 c.6524139671' },
    target: { feeUsd: 5.99, freeOverUsd: 35, source: 'Lucifer, #443 c.6524139671' },
    walmart: { feeUsd: 6.99, freeOverUsd: 35, source: 'Lucifer, #443 c.6524139671', basis: 'observado en carrito de Miami' },
    bananarepublic: { feeUsd: 7.5, freeOverUsd: null, source: 'Lucifer, #443 c.6524139671' },
    tatami: { feeUsd: 29, freeOverUsd: null, source: 'Lucifer, #443 c.6524139671', note: 'envío desde el Reino Unido' },
    dsw: { feeUsd: 0, freeOverUsd: 0, source: 'Lucifer, #443 c.6524139671', basis: 'regla de miembro DSW VIP' },
    newbalance: { feeUsd: 0, freeOverUsd: 0, source: 'Lucifer, #443 c.6524139671', basis: 'regla de miembro New Balance' },
    dicks: { feeUsd: 9.99, freeOverUsd: 49, source: 'Lucifer, #443 c.6524139671', basis: 'regla de miembro ScoreCard' },
    bestbuy: { feeUsd: 0, freeOverUsd: 0, source: 'Lucifer, #443 c.6524139671', basis: 'regla de miembro My Best Buy' },
    snipes: { feeUsd: 9.95, freeOverUsd: 75, source: 'Lucifer, #443 c.6524803125' },
    ccs: { feeUsd: 7.95, freeOverUsd: 75, source: 'Lucifer, #443 c.6524803125' },
    yesstyle: { feeUsd: 6, freeOverUsd: 35, source: 'Lucifer, #443 c.6524803125' },
    meliebianco: { feeUsd: 9.99, freeOverUsd: 100, source: 'Lucifer, #443 c.6524803125' },
    islandwatersports: { feeUsd: 4.99, freeOverUsd: 50, source: 'Lucifer, #443 c.6524803125' },
    mmawarehouse: { feeUsd: 11.95, freeOverUsd: 170, source: 'Lucifer, #443 c.6524803125', note: 'artículos voluminosos aparte' },
    valsurf: { feeUsd: 7, freeOverUsd: 150, source: 'Lucifer, #443 c.6524803125', note: 'tablas excluidas' },
    farfetch: { feeUsd: 20, freeOverUsd: 400, source: 'Lucifer, #443 c.6524803125', note: 'puede variar según la boutique' },
    surfstation: { feeUsd: 9.99, freeOverUsd: 49, source: 'Lucifer, #443 c.6524139671', note: 'paquetes pequeños; tablas aparte' },
    zumiez: { feeUsd: null, freeOverUsd: 64.94, source: 'Lucifer, #443 c.6524803125' },
    ezpz: { feeUsd: null, freeOverUsd: 70, source: 'Lucifer, #443 c.6524803125' },
    venum: { feeUsd: null, freeOverUsd: 75, source: 'Lucifer, #443 c.6524803125' },
    mushie: { feeUsd: null, freeOverUsd: 75, source: 'Lucifer, #443 c.6524803125' },
    combatcorner: { feeUsd: null, freeOverUsd: 150, source: 'Lucifer, #443 c.6524803125', note: 'artículos grandes excluidos' },
    mainland: { feeUsd: null, freeOverUsd: 99.99, source: 'Lucifer, #443 c.6524803125' },
    pier1: { feeUsd: null, freeOverUsd: 99, source: 'Lucifer, #443 c.6524803125' },
    quietstorm: { feeUsd: null, freeOverUsd: 100, source: 'Lucifer, #443 c.6524803125', note: 'skateboards excluidos' },
    advanceauto: { feeUsd: null, freeOverUsd: 35, source: 'Lucifer, #443 c.6524803125' },
    brandsmart: { feeUsd: null, freeOverUsd: null, source: 'Lucifer, #443 c.6524139671' },
    microcenter: { feeUsd: null, freeOverUsd: null, source: 'Lucifer, #443 c.6524139671' },
    nautilus: { feeUsd: null, freeOverUsd: null, source: 'Lucifer, #443 c.6524139671' },
    parrot: { feeUsd: null, freeOverUsd: null, source: 'Lucifer, #443 c.6524139671' },
    crateandbarrel: { feeUsd: null, freeOverUsd: null, source: 'Lucifer, #443 c.6524139671', note: 'tarifa por escala, desde $6' },
    sleekshop: { feeUsd: null, freeOverUsd: null, source: 'Lucifer, #443 c.6524139671', note: 'tarifa por escala, $4.99 a $9.99' },
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

  function isFree(r) { return !!r && r.freeOverUsd === 0; }
  function isCalculated(r) { return !!r && r.feeUsd == null && !isFree(r); }

  /** The card line, both numbers: «Envío gratis desde $35 · $7.99 debajo de ese monto». */
  function ruleText(store) {
    var r = ruleOf(store);
    if (!r) return null;
    if (isFree(r)) return 'Envío gratis en EE.UU.';
    if (isCalculated(r)) return r.freeOverUsd == null
      ? 'Envío en EE.UU.: lo calcula la tienda al pagar'
      : 'Envío gratis desde ' + money(r.freeOverUsd) + ' · debajo de ese monto lo calcula la tienda al pagar';
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
    if (!r) return { store: keyOf(store), rule: null, subtotalUsd: sub, feeUsd: 0, met: false, missingUsd: null, progress: null, pending: false };
    if (isFree(r)) return { store: keyOf(store), rule: r, subtotalUsd: sub, feeUsd: 0, met: true, missingUsd: 0, progress: 1, pending: false };
    /* pending: the store sets the fee at its checkout; nothing is charged
       here that Aria cannot back, and the page says it is still to come. */
    if (r.freeOverUsd == null) return { store: keyOf(store), rule: r, subtotalUsd: sub, feeUsd: sub > 0 && !isCalculated(r) ? r.feeUsd : 0, met: false, missingUsd: null, progress: null, pending: sub > 0 && isCalculated(r) };
    var met = sub >= r.freeOverUsd;
    return {
      store: keyOf(store), rule: r, subtotalUsd: sub,
      feeUsd: sub > 0 && !met && !isCalculated(r) ? r.feeUsd : 0,
      met: met,
      missingUsd: met ? 0 : r2(r.freeOverUsd - sub),
      progress: Math.min(1, sub / r.freeOverUsd),
      pending: sub > 0 && !met && isCalculated(r),
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
    var total = 0, pending = [];
    for (var j = 0; j < stores.length; j++) { total += stores[j].feeUsd; if (stores[j].pending) pending.push(stores[j].store); }
    return { stores: stores, totalUsd: r2(total), pending: pending };
  }

  /** «Estás en $10.99 de $35». */
  function meterText(s) {
    if (!s || !s.rule || !(s.rule.freeOverUsd > 0)) return null;
    return 'Estás en ' + money(s.subtotalUsd) + ' de ' + money(s.rule.freeOverUsd);
  }
  /** «Te faltan $X para envío gratis en Victoria's Secret», or that it is reached. */
  function standingText(s, label) {
    if (!s || !s.rule) return null;
    var name = label || s.store;
    if (isFree(s.rule)) return 'Envío gratis en ' + name;
    if (s.rule.freeOverUsd == null) return isCalculated(s.rule)
      ? 'Envío de ' + name + ' en EE.UU.: lo calcula la tienda al pagar'
      : 'Envío de ' + name + ' en EE.UU.: ' + money(s.rule.feeUsd);
    if (s.met) return 'Envío gratis en ' + name + ': ya lo tienes';
    return 'Te faltan ' + money(s.missingUsd) + ' para envío gratis en ' + name +
      (isCalculated(s.rule) ? '; mientras tanto, lo calcula la tienda al pagar' : '');
  }

  var api = {
    STORE_SHIPPING: STORE_SHIPPING, SALES_TAX_EXEMPT: SALES_TAX_EXEMPT, salesTaxRateOf: salesTaxRateOf,
    ruleOf: ruleOf, ruleText: ruleText, storeValueOf: storeValueOf, isFree: isFree, isCalculated: isCalculated,
    standingOf: standingOf, cartShipping: cartShipping,
    meterText: meterText, standingText: standingText,
    SHIPPING_LINE_LABEL: 'Envío de las tiendas en EE.UU.',
  };
  root.AriaStoreShipping = api;
})(typeof window !== 'undefined' ? window : globalThis);

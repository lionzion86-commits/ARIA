/* ============================================================
   STORE CARRIER -- WHICH STORES SHIP USPS, THE ALERT, THE WIDER WINDOW,
   AND THE STORE'S OWN FASTER TIERS AT ARIA'S CHECKOUT.

   WHY (#443 c.6612459871 + addendum c.6612548967, Danny, 2026-11-03):
   Aria's own Victoria's Secret order shipped USPS, was marked delivered
   and was not received; USPS holds packages and drops them in weekly
   batches. Customers must see this BEFORE they buy.

   THE DATA is Lucifer's matrix (data/usps-carrier-matrix-*.md), every
   store classified from its own published US shipping policy, turned into
   /store-carrier-data.js + data/store-shipping-terms.json by
   scripts/build-store-carrier.mjs. Nothing here is typed by hand.

     usps / mixed   the alert (PDP, store page, checkout) and the store ->
                    Miami window widened by WIDEN_DAYS on its upper end
     group 1        (USPS-exposed AND a paid alternative the customer can
                    select) also gets both options at Aria's checkout: the
                    standard one, and the store's own paid tiers with the
                    retailer's names, speeds and prices, passed through at
                    cost. The buyer selects exactly that tier at the
                    store's checkout (the order record says so).
     non-usps /     nothing: no alert, no widening, no options. UNKNOWN
     unknown        waits for a matrix update (same build command).

   PRICES: a tier the store prices only at its own checkout reads
   «se calcula en la tienda al pagar» -- never a number, never $0 -- and is
   charged nothing here (the same doctrine as /store-shipping.js).

   SHAPE: a plain script like /store-shipping.js (window.AriaStoreCarrier);
   scripts/lib/store-carrier.js re-exports it for the server and tests.
   It reads window.AriaStoreCarrierData lazily, so script order between the
   two files does not matter. Free of import/export.
   ============================================================ */
(function (root) {
  'use strict';
  var WIDEN_DAYS = 5;
  var ALERT_USPS = 'Esta tienda envía con USPS, el servicio postal del gobierno de EE. UU. USPS a veces retiene los paquetes y los entrega por tandas: tu pedido puede tardar de 3 a 5 días más de lo que indica la tienda. El plazo que te mostramos ya incluye ese margen.';
  var ALERT_MIXED = 'Esta tienda elige el transportista al despachar y tu pedido puede viajar con USPS, el servicio postal del gobierno de EE. UU. USPS a veces retiene los paquetes y los entrega por tandas: tu pedido puede tardar de 3 a 5 días más de lo que indica la tienda. El plazo que te mostramos ya incluye ese margen.';
  var ALERT_GROUP1 = 'Si prefieres evitarlo, elige la otra opción de envío antes de pagar y la aplicamos tal cual en la tienda.';
  var PRICE_AT_STORE = 'se calcula en la tienda al pagar';
  var STANDARD_ID = 'standard';

  function keyOf(k) { return String(k == null ? '' : k).trim().toLowerCase(); }
  function r2(n) { return Math.round(Number(n) * 100) / 100; }
  function data() { return root.AriaStoreCarrierData || { stores: {} }; }
  function carrierOf(store) { return data().stores[keyOf(store)] || null; }
  function classOf(store) { var c = carrierOf(store); return c ? c.carrierClass : 'unknown'; }
  function isExposed(store) { var c = classOf(store); return c === 'usps' || c === 'mixed'; }
  function hasOptions(store) { var c = carrierOf(store); return !!(c && c.checkoutOptions && isExposed(store) && c.tiers && c.tiers.length); }

  /** The alert, as lines: [class copy] plus the group-1 line. [] when none applies. */
  function alertLines(store) {
    var c = classOf(store);
    if (c !== 'usps' && c !== 'mixed') return [];
    var out = [c === 'usps' ? ALERT_USPS : ALERT_MIXED];
    if (hasOptions(store)) out.push(ALERT_GROUP1);
    return out;
  }

  /** A retailer-delivery row ({miamiMin, miamiMax, ...}) with the upper end
      widened for a USPS-exposed store; the row itself otherwise. */
  function widen(store, entry) {
    if (!entry || !isExposed(store)) return entry || null;
    var out = {};
    for (var k in entry) if (Object.prototype.hasOwnProperty.call(entry, k)) out[k] = entry[k];
    out.miamiMax = Number(entry.miamiMax) + WIDEN_DAYS;
    out.widenedBy = WIDEN_DAYS;
    return out;
  }

  /** The store -> Miami window Aria shows: the quoted one, widened when
      exposed. null when nothing is quoted (never invented). */
  function windowOf(store) {
    var c = carrierOf(store);
    var q = c && c.quotedWindow;
    if (!q) return null;
    var max = q.max + (isExposed(store) ? WIDEN_DAYS : 0);
    return { min: q.min, max: max, plus: !!q.plus, quotedMax: q.max, source: q.source };
  }
  /* "3–11 días" · "hasta 12 días" (the same wording as retailer-delivery's miamiRangeEs) */
  function rangeEs(min, max, plus, unit) {
    var u = unit || 'días';
    var m = String(max) + (plus ? '+' : '');
    if (min == null) return 'hasta ' + m + ' ' + u;
    if (min === max && !plus) return min + ' ' + (min === 1 && u === 'días hábiles' ? 'día hábil' : min === 1 ? 'día' : u);
    return min + '–' + m + ' ' + u;
  }
  function windowText(store) { var w = windowOf(store); return w ? rangeEs(w.min, w.max, w.plus) : null; }
  function windowLineEs(store) { var t = windowText(store); return t ? 'Llega a nuestro almacén en Miami en ' + t + '.' : null; }
  function speedText(days) { return days ? rangeEs(days.min, days.max, false, 'días hábiles') : null; }

  /* ---------- tiers ---------- */
  function tierOf(store, id) {
    var c = carrierOf(store);
    if (!c || !c.tiers) return null;
    for (var i = 0; i < c.tiers.length; i++) if (c.tiers[i].id === id) return c.tiers[i];
    return null;
  }
  function tierLabel(t) { return t && t.named !== false && t.name ? t.name : 'Otra opción de envío de la tienda'; }

  /* A price rule at a store subtotal -> US$ number, or null (priced at the store). */
  function ruleUsd(rule, sub, standardFeeUsd) {
    if (!rule) return null;
    switch (rule.kind) {
      case 'flat': return r2(rule.usd);
      case 'percent': return r2(sub * rule.pct / 100);
      case 'byOrder': return ruleUsd(sub < rule.thresholdUsd ? rule.under : rule.atOrOver, sub, standardFeeUsd);
      case 'adder': return standardFeeUsd == null ? null : r2(standardFeeUsd + rule.usd);
      default: return null;
    }
  }
  /** What the tier costs for this store subtotal (store prices): a number or null. */
  function tierPriceUsd(t, subtotalUsd, standardFeeUsd) {
    if (!t) return null;
    var sub = Math.max(0, Number(subtotalUsd) || 0);
    if (t.freeOverUsd != null && sub > t.freeOverUsd) return 0;
    return ruleUsd(t.price, sub, standardFeeUsd);
  }
  function usdText(n) { return n === 0 ? 'Gratis' : 'US$ ' + Number(n).toFixed(2); }
  /** The rule in words, both sides of a threshold ("US$ 16.00 en pedidos de menos de US$ 50 · US$ 8.00 desde US$ 50"). */
  function ruleText(rule) {
    if (!rule) return PRICE_AT_STORE;
    switch (rule.kind) {
      case 'flat': return usdText(rule.usd);
      case 'percent': return rule.pct + '% del total del pedido';
      case 'adder': return 'envío estándar + US$ ' + Number(rule.usd).toFixed(2);
      case 'byOrder':
        return ruleText(rule.under) + ' en pedidos de menos de US$ ' + rule.thresholdUsd + ' · ' + ruleText(rule.atOrOver) + ' desde US$ ' + rule.thresholdUsd;
      default: return PRICE_AT_STORE;
    }
  }

  /** The options a group-1 store offers at Aria's checkout, standard first.
      standing: /store-shipping.js's standingOf for this store (its fee). */
  function optionsFor(store, subtotalUsd, standing) {
    if (!hasOptions(store)) return [];
    var c = carrierOf(store);
    /* No sourced standard rule, or one the store sets at its checkout: the
       standard fee is unknown here (never shown as $0). */
    var stdFee = standing && standing.rule && !standing.pending ? Number(standing.feeUsd) || 0 : null;
    var w = windowOf(store);
    var opts = [{
      id: STANDARD_ID, standard: true,
      name: c.standardTier && c.standardTier.name ? c.standardTier.name : null,
      label: 'Envío estándar de la tienda',
      speedText: w ? rangeEs(w.min, w.max, w.plus) + ' hasta nuestro almacén en Miami' : null,
      priceUsd: stdFee,
      priceText: stdFee == null ? PRICE_AT_STORE : usdText(stdFee),
      usps: true,
    }];
    for (var i = 0; i < c.tiers.length; i++) {
      var t = c.tiers[i];
      var p = tierPriceUsd(t, subtotalUsd, stdFee);
      opts.push({
        id: t.id, standard: false, name: t.named === false ? null : t.name, label: tierLabel(t),
        speedText: speedText(t.days),
        priceUsd: p,
        priceText: p == null ? PRICE_AT_STORE : usdText(p),
        ruleText: t.price && t.price.kind !== 'store' ? ruleText(t.price) + (t.freeOverUsd != null ? ' · gratis en pedidos de más de US$ ' + t.freeOverUsd : '') : PRICE_AT_STORE,
        usps: !!t.usps,
        viaCustomerService: !!t.viaCustomerService,
      });
    }
    return opts;
  }

  /** A standing (store-shipping) with the customer's tier applied. */
  function applyTier(standing, tierId) {
    if (!standing || !tierId || tierId === STANDARD_ID || !hasOptions(standing.store)) return standing;
    var t = tierOf(standing.store, tierId);
    if (!t) return standing;
    var stdFee = standing.rule && !standing.pending ? Number(standing.feeUsd) || 0 : null;
    var p = tierPriceUsd(t, standing.subtotalUsd, stdFee);
    var out = {};
    for (var k in standing) if (Object.prototype.hasOwnProperty.call(standing, k)) out[k] = standing[k];
    out.tierId = t.id;
    out.tierName = tierLabel(t);
    out.standardFeeUsd = standing.feeUsd;
    out.feeUsd = standing.subtotalUsd > 0 && p != null ? p : 0;
    out.pending = standing.subtotalUsd > 0 && p == null;
    out.tierPricedAtStore = p == null;
    return out;
  }

  /** The buyer-desk record for one store in an order. */
  function orderChoice(standing) {
    var store = standing.store, c = carrierOf(store);
    if (!c || !isExposed(store)) return null;
    var tierId = standing.tierId || STANDARD_ID;
    var t = tierId === STANDARD_ID ? null : tierOf(store, tierId);
    var tierName = t ? tierLabel(t) : 'Envío estándar de la tienda' + (c.standardTier && c.standardTier.name ? ' («' + c.standardTier.name + '»)' : '');
    var w = windowOf(store);
    return {
      store: store, storeName: c.name, carrierClass: c.carrierClass, group: c.group,
      tierId: tierId,
      tierName: tierName,
      tierNameAtStore: t ? (t.nameRaw || t.name) : (c.standardTier && c.standardTier.name) || null,
      speed: t ? speedText(t.days) : (w ? rangeEs(w.min, w.max, w.plus) : null),
      chargedUsd: Number(standing.feeUsd) || 0,
      pricedAtStore: !!standing.pending,
      priceRule: t ? t.price : null,
      buyerInstruction: c.checkoutOptions
        ? 'En el checkout de ' + c.name + ', elige exactamente «' + (t ? (t.nameRaw || t.name) : (c.standardTier && c.standardTier.name) || 'el envío estándar') + '»: es la opción que eligió el cliente.'
          + (standing.pending ? ' El precio de esa opción lo fija la tienda al pagar; anótalo en el pedido.' : '')
        : null,
      buyerNote: t && t.viaCustomerService ? c.buyerNote : null,
    };
  }

  /** Every store in a cart that must show the alert, in cart order. */
  function exposedStores(lines) {
    var seen = {}, out = [];
    (Array.isArray(lines) ? lines : []).forEach(function (it) {
      var k = keyOf(it && it.retailer);
      if (k && !seen[k] && isExposed(k)) { seen[k] = 1; out.push(k); }
    });
    return out;
  }

  /** Keep only valid picks for group-1 stores ({store: tierId}). */
  function sanitizeTiers(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (var k in raw) {
      if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
      var s = keyOf(k), id = String(raw[k] || '');
      if (!hasOptions(s)) continue;
      if (id === STANDARD_ID || tierOf(s, id)) out[s] = id;
    }
    return out;
  }

  root.AriaStoreCarrier = {
    WIDEN_DAYS: WIDEN_DAYS, ALERT_USPS: ALERT_USPS, ALERT_MIXED: ALERT_MIXED, ALERT_GROUP1: ALERT_GROUP1,
    PRICE_AT_STORE: PRICE_AT_STORE, STANDARD_ID: STANDARD_ID,
    data: data, carrierOf: carrierOf, classOf: classOf, isExposed: isExposed, hasOptions: hasOptions,
    alertLines: alertLines, widen: widen, windowOf: windowOf, windowText: windowText, windowLineEs: windowLineEs,
    speedText: speedText, tierOf: tierOf, tierLabel: tierLabel, tierPriceUsd: tierPriceUsd, ruleText: ruleText,
    optionsFor: optionsFor, applyTier: applyTier, orderChoice: orderChoice, exposedStores: exposedStores,
    sanitizeTiers: sanitizeTiers,
  };
})(typeof window !== 'undefined' ? window : globalThis);

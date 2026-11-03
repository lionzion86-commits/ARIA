/* ============================================================
   THE IMPORT TAX, ONE DEFINITION -- AND ITS LINE UNDER EVERY CARD
   (#443 c.6592753099, Danny's standing standard of Oct 28: directly
   under every card price, a small "+ S/ ___ IMP", so the import tax is
   never first seen at checkout).

   WHAT LIVES HERE. The arithmetic checkout charges, moved out of
   weight-data.js so a plain page can run it too:
     THRESHOLD_USD  200 -- Peru's de minimis, measured on the goods (FOB);
     RATE           0.25 -- applied to goods + international freight (CIF);
     CHARGE_PER_KG  13 -- the published freight rate;
     importTaxEstimateUsd(fob, freight) -- THE function. weight-data.js
                    re-exports it, so checkout.html, orders-create and
                    the door price run exactly this code.
   weight-data.js imports this file for its side effect and re-exports
   every name; nothing else may do this arithmetic.

   THE DUTIABLE BASE OF A CARD is the one every cart line is stamped with
   (normalizeLiveItem in the bundle, producto.html's tax line): the raw US
   price times the store's Miami sales tax (1.07; 1.00 where Aria is
   exempt -- TAX_EXEMPT mirrors index.html TAX_EXEMPT_STATUS), or, for a
   pre-priced store (PRE_PRICED, Aria Perfumes), the price divided by its
   factor. A card that carries only the final price gets the exact
   inversion of finalUsd().

   THE RULE IS PER ORDER (checkout sums every line's dutiable value and
   tests the sum against $200). A card cannot know the rest of the cart,
   so the card shows the tax THIS ITEM ALONE would pay: over the threshold
   on its own, importTaxEstimateUsd(its dutiable value, its freight).
   Under it, no line -- an under-$200 item owes nothing by itself.

   THE FREIGHT is the item's weight x CHARGE_PER_KG, the weight from the
   same resolver checkout and the product page use (resolve-weight). The
   line is drawn at once on the 0.2 kg line placeholder checkout's cart
   line starts with, then re-figured when the resolver answers (one
   request per 50 lines).

   WHAT THE LINE NEVER SHOWS: the dutiable value or the rate. Only the
   amount, soles first ("+ S/ 120.50 IMP"); dollars only without a rate.

   SHAPE. A plain script (no import/export), like /not-sold.js: pages load
   it with <script src="/import-tax.js"> before they draw a card; ES
   modules import it for its side effect and read globalThis.AriaImportTax.
   ============================================================ */
(function (root) {
  'use strict';

  var THRESHOLD_USD = 200;   // measured on FOB (the goods)
  var RATE = 0.25;           // applied to CIF (goods + freight)
  var CHARGE_PER_KG = 13;    // the freight rate charged to and shown to the customer
  var LINE_KG = 0.2;         // the cart line's placeholder before the resolver answers
  var PRE_PRICED = Object.freeze({ ariaperfumes: 1.18 });
  var TAX_EXEMPT = Object.freeze({ walmart: 1 });

  function r2(n) { return Math.round(n * 100) / 100; }

  /**
   * Aria's estimated import tax for an order, in USD.
   * fobUsd decides whether tax applies; freightUsd is part of the base.
   * 0 when the goods are at or under the threshold.
   */
  function importTaxEstimateUsd(fobUsd, freightUsd) {
    var fob = Number(fobUsd);
    if (!isFinite(fob) || fob <= THRESHOLD_USD) return 0;
    var freight = Number(freightUsd);
    var cif = fob + (isFinite(freight) && freight > 0 ? freight : 0);
    return Math.round(cif * RATE * 100) / 100;
  }

  /* The tiered margin's inverse (LOCKED 2026-10-02): raw + margin(raw) -> raw. */
  function rawFromTieredMarked(marked) {
    var m = Number(marked);
    if (!(m > 0)) return NaN;
    if (m <= 620) return m / 1.24;
    if (m <= 2390) return (m - 30) / 1.18;
    if (m <= 5750) return (m - 150) / 1.12;
    return (m - 350) / 1.08;
  }

  function storeKey(r) { return String(r == null ? '' : r).trim().toLowerCase(); }
  function salesTaxRate(retailer) { return TAX_EXEMPT[storeKey(retailer)] ? 1 : 1.07; }

  /**
   * A card's dutiable value, in USD: { raw, usd, retailer }.
   * raw -- the store's price as the catalogue carries it (for a pre-priced
   *        store that is already Aria's price);
   * usd -- the price the card shows, when the raw price is not on the card.
   * NaN when neither is usable.
   */
  function dutiableOf(it) {
    if (!it) return NaN;
    var key = storeKey(it.retailer);
    var pre = PRE_PRICED[key];
    var raw = Number(it.raw);
    if (isFinite(raw) && raw > 0) return r2(pre ? raw / pre : raw * salesTaxRate(key));
    var usd = Number(it.usd);
    if (!(isFinite(usd) && usd > 0)) return NaN;
    if (pre) return r2(usd / pre);
    var rate = salesTaxRate(key);
    return r2(rawFromTieredMarked(usd / rate) * rate);
  }

  /** The tax this item alone would pay at `kg` (0.2 kg when unknown). 0 under the threshold. */
  function cardImpUsd(it, kg) {
    var d = dutiableOf(it);
    if (!(isFinite(d) && d > THRESHOLD_USD)) return 0;
    var w = Number(kg) > 0 ? Number(kg) : LINE_KG;
    return importTaxEstimateUsd(d, r2(w * CHARGE_PER_KG));
  }

  /* ---------------- the line ---------------- */
  var FX_KEY = 'aria_fx_rate_v1', FX_TTL = 24 * 60 * 60 * 1000;
  function fxRate() {
    try {
      var c = JSON.parse(root.localStorage.getItem(FX_KEY) || 'null');
      if (c && typeof c.venta === 'number' && c.venta > 0 && Date.now() - c.fetchedAt < FX_TTL) return c.venta;
    } catch (e) {}
    return state.fx > 0 ? state.fx : 0;
  }
  function money(usd, fx) {
    if (fx > 0) return 'S/ ' + r2(usd * fx).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return 'US$ ' + Number(usd).toFixed(2);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function lineText(tax, fx) { return '+ ' + money(tax, fx) + ' IMP'; }

  /**
   * The card's IMP line, or '' under the threshold.
   * it: { raw | usd, retailer, title }. opts: { tag, cls } -- the page's
   * own price-row class rides along, so the line sits in the card's style.
   */
  function lineHTML(it, opts) {
    var tax = cardImpUsd(it, 0);
    if (!(tax > 0)) return '';
    var o = opts || {};
    var tag = o.tag === 'span' ? 'span' : 'div';
    var hasRaw = Number(it.raw) > 0;
    ensureRuntime();
    return '<' + tag + ' class="card-imp' + (o.cls ? ' ' + esc(o.cls) : '') + '" data-card-imp'
      + ' data-imp-r="' + esc(storeKey(it.retailer)) + '"'
      + (hasRaw ? ' data-imp-p="' + Number(it.raw) + '"' : ' data-imp-u="' + Number(it.usd) + '"')
      + ' data-imp-t="' + esc(it.title || '') + '"'
      + ' data-imp-usd="' + tax + '">' + esc(lineText(tax, fxRate())) + '</' + tag + '>';
  }

  /* ---------------- runtime: weights and soles ---------------- */
  var state = { fx: 0, kg: {}, pending: {}, queue: [], timer: null, mo: null, started: false, fxWait: null };
  function itemOf(el) {
    return { raw: el.getAttribute('data-imp-p'), usd: el.getAttribute('data-imp-u'), retailer: el.getAttribute('data-imp-r'), title: el.getAttribute('data-imp-t') || '' };
  }
  function keyOf(it) { return storeKey(it.retailer) + '|' + it.title; }
  function paint(el, fx) {
    var it = itemOf(el);
    var kg = state.kg[keyOf(it)];
    var tax = cardImpUsd(it, kg);
    if (!(tax > 0)) return;
    if (kg > 0) el.setAttribute('data-imp-kg', String(kg));
    el.setAttribute('data-imp-usd', String(tax));
    var t = lineText(tax, fx);
    if (el.textContent !== t) el.textContent = t;
  }
  function paintAll() {
    var els = root.document.querySelectorAll('[data-card-imp]'), fx = fxRate();
    for (var i = 0; i < els.length; i++) paint(els[i], fx);
  }
  function resolveBatch(items) {
    var body = JSON.stringify({ items: items.map(function (it) {
      var usd = Number(it.usd) > 0 ? Number(it.usd) : Number(it.raw);
      return { title: it.title, retailer: storeKey(it.retailer), priceUsd: usd, weightKg: LINE_KG, weightEstimated: true, qty: 1 };
    }) });
    return root.fetch('/.netlify/functions/resolve-weight', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var rows = (d && d.items) || [];
        items.forEach(function (it, i) {
          var kg = rows[i] && Number(rows[i].weightKg);
          state.kg[keyOf(it)] = kg > 0 ? kg : LINE_KG;
          delete state.pending[keyOf(it)];
        });
      }, function () { items.forEach(function (it) { delete state.pending[keyOf(it)]; }); });
  }
  function flush() {
    state.timer = null;
    var els = root.document.querySelectorAll('[data-card-imp]:not([data-imp-kg])');
    var want = [], seen = {}, fx = fxRate();
    for (var i = 0; i < els.length; i++) {
      var it = itemOf(els[i]), k = keyOf(it);
      if (state.kg[k] > 0) { paint(els[i], fx); continue; }
      if (state.pending[k] || seen[k]) continue;
      seen[k] = 1; state.pending[k] = 1; want.push(it);
    }
    var jobs = [];
    for (var j = 0; j < want.length; j += 50) jobs.push(resolveBatch(want.slice(j, j + 50)));
    if (jobs.length) Promise.all(jobs).then(paintAll);
  }
  function schedule() { if (!state.timer) state.timer = setTimeout(flush, 120); }
  function waitForFx() {
    if (state.fxWait || fxRate() > 0) return;
    var tries = 0;
    /* The page asks for the rate itself and caches it under the same key;
       read that first, and only ask once more if it never arrives. */
    state.fxWait = setInterval(function () {
      tries++;
      if (fxRate() > 0) { clearInterval(state.fxWait); paintAll(); return; }
      if (tries === 10) {
        try {
          root.fetch('/.netlify/functions/exchange-rate').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
            if (d && typeof d.venta === 'number' && d.venta > 0) state.fx = d.venta;
          }, function () {});
        } catch (e) {}
      }
      if (tries >= 40) clearInterval(state.fxWait);
    }, 300);
  }
  function ensureRuntime() {
    if (state.started || !root.document || typeof root.fetch !== 'function') return;
    state.started = true;
    var start = function () {
      if (!root.document.getElementById('aria-imp-css')) {
        var st = root.document.createElement('style');
        st.id = 'aria-imp-css';
        st.textContent = '.card-imp{display:block;font-size:11px;line-height:1.35;font-weight:700;color:#8A6D1F;margin-top:2px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
        (root.document.head || root.document.documentElement).appendChild(st);
      }
      if (typeof MutationObserver === 'function') {
        /* Only a new card wakes it: scrolling, focus classes and photo
           swaps never do (a phone swiping a rail pays nothing). */
        state.mo = new MutationObserver(function (muts) {
          for (var i = 0; i < muts.length; i++) {
            var added = muts[i].addedNodes;
            for (var j = 0; added && j < added.length; j++) {
              var n = added[j];
              if (n.nodeType === 1 && (n.hasAttribute('data-card-imp') || (n.querySelector && n.querySelector('[data-card-imp]')))) { schedule(); return; }
            }
          }
        });
        state.mo.observe(root.document.documentElement, { childList: true, subtree: true });
      }
      waitForFx();
      schedule();
    };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start);
    else start();
  }

  root.AriaImportTax = Object.freeze({
    THRESHOLD_USD: THRESHOLD_USD, RATE: RATE, CHARGE_PER_KG: CHARGE_PER_KG, LINE_KG: LINE_KG,
    PRE_PRICED: PRE_PRICED, TAX_EXEMPT: TAX_EXEMPT,
    importTaxEstimateUsd: importTaxEstimateUsd, rawFromTieredMarked: rawFromTieredMarked,
    salesTaxRate: salesTaxRate, dutiableOf: dutiableOf, cardImpUsd: cardImpUsd,
    lineHTML: lineHTML, refresh: function () { if (root.document) { ensureRuntime(); schedule(); } }
  });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));

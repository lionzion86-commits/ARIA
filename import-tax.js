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

   THE SALES TAX, TWO SIDES -- ONE RULE FOR THE WHOLE SITE (#443
   c.6684452115, Danny 2026-11-06; addendum c.6684509088):
     PRICE  every store's price is shelf x SALES_TAX_RATE (1.07) x tier,
            Walmart included: the customer pays what a US shopper pays at
            the register. salesTaxRate() is 1.07 for every store
            (TAX_EXEMPT, the price-side exemption list, is empty).
     COST   where Aria really pays no tax at the register (COST_TAX_EXEMPT:
            Walmart, CCS, Venum, verified), the goods' true value carries
            no 7% -- costTaxRate() is 1.00 there, 1.07 everywhere else; the
            7% inside those stores' prices is margin Aria keeps.
   Every pricing copy (the bundle's normalizeLiveItem and TAX_EXEMPT_STATUS,
   the pages' var TAX_EXEMPT / COST_TAX_EXEMPT / PRE_PRICED, _search-core,
   store-shipping.js, scripts/lib/sales-sources.js) mirrors these lists;
   scripts/test/sales-parity-tests.mjs pins them all to this file.

   THE DUTIABLE BASE OF A CARD is the one every cart line is stamped with
   (normalizeLiveItem in the bundle, producto.html's tax line): the raw US
   price times the store's COST-side rate (costTaxRate), or, for a
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
   amount, soles first ("+ S/ 120.50 IMP"); until a rate is known it reads
   dollars ("+ US$ 35.44 IMP") and turns to soles when one lands.

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
  var SALES_TAX_RATE = 1.07;
  /* PERFUME STACK (#443 c.6684758084, Danny 2026-11-06): Aria Perfumes'
     price is true cost x 1.07 x 1.18 during the 90-day launch promo
     (scripts/build-perfumes-catalog.mjs); price / 1.2626 is the cost. */
  var PRE_PRICED = Object.freeze({ ariaperfumes: 1.2626 });
  var TAX_EXEMPT = Object.freeze({});
  var COST_TAX_EXEMPT = Object.freeze({ ccs: 1, venum: 1, walmart: 1 });

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
  /* PRICE side: 1.07 at every store. */
  function salesTaxRate(retailer) { return TAX_EXEMPT[storeKey(retailer)] ? 1 : SALES_TAX_RATE; }
  /* COST side: 1.00 where Aria pays no tax at the register. */
  function costTaxRate(retailer) { return COST_TAX_EXEMPT[storeKey(retailer)] ? 1 : SALES_TAX_RATE; }
  /** The price every card shows for a raw shelf price: shelf x 1.07 x tier. */
  function finalUsd(raw, retailer) {
    var r = Number(raw);
    if (!(r > 0)) return NaN;
    if (PRE_PRICED[storeKey(retailer)]) return r2(r);
    return r2((r + tieredMarginUsd(r)) * salesTaxRate(retailer));
  }
  function tieredMarginUsd(rawUsd) {
    var r = Number(rawUsd);
    if (!(r > 0)) return 0;
    return Math.min(r, 500) * 0.24
      + Math.min(Math.max(r - 500, 0), 1500) * 0.18
      + Math.min(Math.max(r - 2000, 0), 3000) * 0.12
      + Math.max(r - 5000, 0) * 0.08;
  }

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
    if (isFinite(raw) && raw > 0) return r2(pre ? raw / pre : raw * costTaxRate(key));
    var usd = Number(it.usd);
    if (!(isFinite(usd) && usd > 0)) return NaN;
    if (pre) return r2(usd / pre);
    return r2(rawFromTieredMarked(usd / salesTaxRate(key)) * costTaxRate(key));
  }

  /** The tax this item alone would pay at `kg` (0.2 kg when unknown). 0 under the threshold. */
  function cardImpUsd(it, kg) {
    var d = dutiableOf(it);
    if (!(isFinite(d) && d > THRESHOLD_USD)) return 0;
    var w = Number(kg) > 0 ? Number(kg) : LINE_KG;
    return importTaxEstimateUsd(d, r2(w * CHARGE_PER_KG));
  }

  /* ---------------- the line ---------------- */
  var state = { fx: 0, kg: {}, pending: {}, queue: [], timer: null, mo: null, started: false, fxWait: null };
  /* ---------------- the rate: soles, always (#443 c.6629812301) ----------------
     Danny: "we only show soles. Then we show the import underneath." A
     card never falls back to dollars. The rate comes from, in order:
       1. the site's 24-hour cache (aria_fx_rate_v1, the key every page writes);
       2. /.netlify/functions/exchange-rate (SUNAT, or its last good rate);
       3. the last rate this browser saw, up to STALE_MAX old -- a real SUNAT
          rate, a few days old, for the card only (checkout asks afresh);
     and with none of them the price row keeps its placeholder while the rate
     is asked for again (RETRY_MS), never a dollar figure in its place.
     Every page asks through AriaImportTax.fx, so one request serves the
     page and its IMP lines. */
  var FX_KEY = 'aria_fx_rate_v1', FX_TTL = 24 * 60 * 60 * 1000;
  var FX_STALE_MAX = 14 * 24 * 60 * 60 * 1000;
  var FX_TIMEOUT_MS = 8000;
  var FX_RETRY_MS = [4000, 8000, 15000, 30000, 60000, 120000];
  function fxCached(maxAge) {
    try {
      var c = JSON.parse(root.localStorage.getItem(FX_KEY) || 'null');
      if (c && typeof c.venta === 'number' && c.venta > 0 && Date.now() - (Number(c.fetchedAt) || 0) < maxAge) return c.venta;
    } catch (e) {}
    return 0;
  }
  function fxRate() {
    return fxCached(FX_TTL) || (state.fx > 0 ? state.fx : 0);
  }
  var fxSubs = [], fxPromise = null, fxTry = 0;
  function fxSet(v) {
    if (!(v > 0)) return;
    var was = state.fx;
    state.fx = v;
    if (was === v) return;
    paintSlots();
    for (var i = 0; i < fxSubs.length; i++) { try { fxSubs[i](v); } catch (e) {} }
  }
  /* A price drawn before any rate was known: a soles placeholder that
     fills itself when one lands (fx.slot). */
  function paintSlots() {
    if (!root.document) return;
    var els = root.document.querySelectorAll('[data-soles-usd]');
    for (var i = 0; i < els.length; i++) {
      var t = fmtSoles(els[i].getAttribute('data-soles-usd'));
      if (t && els[i].textContent !== t) els[i].textContent = t;
    }
  }
  function slotHTML(usd, opts) {
    var o = opts || {};
    var tag = o.tag === 'div' ? 'div' : 'span';
    var n = Number(usd);
    if (!isFinite(n)) return '';
    if (!state.fxWait) waitForFx();
    return '<' + tag + (o.cls ? ' class="' + esc(o.cls) + '"' : '') + (o.style ? ' style="' + esc(o.style) + '"' : '')
      + ' data-soles-usd="' + r2(n) + '">' + esc(fmtSoles(n) || 'S/ \u2026') + '</' + tag + '>';
  }
  function fxAsk() {
    if (typeof root.fetch !== 'function') return Promise.resolve(0);
    return new Promise(function (done) {
      var t = setTimeout(function () { done(0); }, FX_TIMEOUT_MS);
      try {
        root.fetch('/.netlify/functions/exchange-rate')
          .then(function (r) { return r.json().then(function (d) { return r.ok ? d : null; }); })
          .then(function (d) {
            clearTimeout(t);
            if (!(d && typeof d.venta === 'number' && d.venta > 0)) return done(0);
            /* A stored (stale) answer from the function is not cached as today's. */
            if (!d.stale) { try { root.localStorage.setItem(FX_KEY, JSON.stringify(Object.assign({}, d, { fetchedAt: Date.now() }))); } catch (e) {} }
            done(d.venta);
          }, function () { clearTimeout(t); done(0); });
      } catch (e) { clearTimeout(t); done(0); }
    });
  }
  function fxRetry() {
    var wait = FX_RETRY_MS[Math.min(fxTry++, FX_RETRY_MS.length - 1)];
    if (fxTry > 20) return;
    setTimeout(function () {
      fxAsk().then(function (v) { if (v > 0) fxSet(v); else fxRetry(); });
    }, wait);
  }
  /* The rate for the cards: resolves with a number (0 only when none could
     be had yet -- a later arrival reaches fx.on). */
  function fxGet() {
    var now = fxRate();
    if (now > 0) { state.fx = now; return Promise.resolve(now); }
    if (fxPromise) return fxPromise;
    fxPromise = fxAsk().then(function (v) {
      if (v > 0) { fxSet(v); return v; }
      var stale = fxCached(FX_STALE_MAX);
      if (stale > 0) { fxSet(stale); fxRetryFresh(); return stale; }
      fxRetry();
      return 0;
    });
    return fxPromise;
  }
  /* On a stale rate, one more quiet try for today's (a fresh one repaints). */
  function fxRetryFresh() {
    setTimeout(function () { fxAsk().then(function (v) { if (v > 0) fxSet(v); }); }, FX_RETRY_MS[2]);
  }
  function fxOn(cb) {
    if (typeof cb !== 'function') return;
    fxSubs.push(cb);
  }
  /* "S/ 1,234.50" at the rate; '' without one (the caller keeps its placeholder). */
  function fmtSoles(usd, fx) {
    var r = fx > 0 ? fx : fxRate();
    var n = Number(usd);
    if (!(r > 0) || !isFinite(n)) return '';
    return 'S/ ' + r2(n * r).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  /* Without a rate the line reads dollars and turns to soles the moment a
     rate lands (paintAll on fx.on) -- the card paints at once, never a
     placeholder that waits (P0, #443 c.6648727667, the pre-#658 fallback). */
  function money(usd, fx) {
    return fmtSoles(usd, fx) || ('US$ ' + Number(usd).toFixed(2));
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
    if (state.fxWait) return;
    state.fxWait = true;
    fxOn(function () { paintAll(); });
    fxGet().then(function (v) { if (v > 0) paintAll(); });
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
    PRE_PRICED: PRE_PRICED, TAX_EXEMPT: TAX_EXEMPT, COST_TAX_EXEMPT: COST_TAX_EXEMPT, SALES_TAX_RATE: SALES_TAX_RATE,
    importTaxEstimateUsd: importTaxEstimateUsd, rawFromTieredMarked: rawFromTieredMarked,
    salesTaxRate: salesTaxRate, costTaxRate: costTaxRate, finalUsd: finalUsd, tieredMarginUsd: tieredMarginUsd,
    dutiableOf: dutiableOf, cardImpUsd: cardImpUsd,
    lineHTML: lineHTML, refresh: function () { if (root.document) { ensureRuntime(); schedule(); } },
    /* The page's rate (see "the rate" above): fx.get() -> Promise<number>,
       fx.now() -> number or 0, fx.on(cb) -> cb(rate) on every later rate,
       fx.soles(usd) -> "S/ 1,234.50" or '' without a rate,
       fx.slot(usd, {tag, cls, style}) -> that price as markup, a «S/ …»
       placeholder until a rate lands and then filled in place. */
    fx: Object.freeze({ get: fxGet, now: fxRate, on: fxOn, soles: fmtSoles, slot: slotHTML })
  });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));

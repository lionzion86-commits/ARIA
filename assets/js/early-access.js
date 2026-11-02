/* VENTAS ANTICIPADAS (Key Club, #443, Danny 2026-11-02).
   assets/keyclub/early-access.json flags sale items members-first until a
   public unlock time. Public pages load this helper: before unlockAt a
   flagged item is not shown (cards with its data-id are removed, and
   ariaEarlyAccess.isLocked(id) lets a renderer skip it). The members'
   dashboard (cuenta.html) shows the same items live. Same rule as
   netlify/functions/_keyclub.js lockedIds(), kept in step by
   scripts/test/key-club-tests.mjs. Tiny, and it never blocks a page:
   until the config arrives, nothing is hidden by it, and the sweep runs
   again once it does. */
(function(){
  var locked = {};
  var api = window.ariaEarlyAccess = {
    ready: false,
    lockedIds: function(config, now){
      var out = {}, t = now == null ? Date.now() : now;
      var sales = config && config.sales && config.sales.length ? config.sales : [];
      for (var i = 0; i < sales.length; i++) {
        var u = Date.parse(sales[i] && sales[i].unlockAt);
        if (!(u > t)) continue;
        var items = sales[i].items || [];
        for (var j = 0; j < items.length; j++) if (items[j] && items[j].id) out[String(items[j].id)] = 1;
      }
      return out;
    },
    isLocked: function(id){ return !!(id && locked[String(id)]); },
    sweep: function(root){
      var cards = (root || document).querySelectorAll('[data-id]');
      for (var i = 0; i < cards.length; i++) if (locked[cards[i].getAttribute('data-id')]) cards[i].remove();
    },
    apply: function(config){
      locked = api.lockedIds(config);
      api.ready = true;
      api.sweep(document);
      if (!api._mo && typeof MutationObserver === 'function' && Object.keys(locked).length) {
        api._mo = new MutationObserver(function(){ api.sweep(document); });
        api._mo.observe(document.body, { childList: true, subtree: true });
      }
    }
  };
  if (window.__ariaEarlyAccessNoAuto) return;
  fetch('/assets/keyclub/early-access.json', { cache: 'no-cache' })
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(c){ if (c) api.apply(c); })
    .catch(function(){});
})();

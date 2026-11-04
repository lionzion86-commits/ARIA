/* THE HEADER CART (#443 c.6619105467, Danny's live check: "the cart
   shows on the homepage only"). Every page's header carries the same
   cart link (markup and styles: scripts/header-search.mjs), which opens
   the one real cart, the homepage's cart view (/?carrito=1). This file
   only paints the count: it reads the same localStorage key the
   homepage's cart, producto.html and checkout.html write
   ('aria_cart_v1'), sums the line quantities the way the homepage's
   cartCount() does (a stored qty below 1 or not a number counts as 1),
   and hides the badge when the cart is empty. No network, no catalogue.
   Pages that change the cart call window.ariaHeaderCart() after saving;
   other tabs are picked up through the storage event. */
(function(){
  if (window.ariaHeaderCart) return;
  var KEY = 'aria_cart_v1';
  function count(){
    try {
      var c = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!Array.isArray(c)) return 0;
      var n = 0;
      for (var i = 0; i < c.length; i++){
        var it = c[i];
        if (!it || typeof it !== 'object') continue;
        var q = Math.floor(Number(it.qty));
        n += (isFinite(q) && q >= 1) ? q : 1;
      }
      return n;
    } catch (e) { return 0; }
  }
  function paint(){
    var n = count(), links = document.querySelectorAll('[data-hc]');
    for (var i = 0; i < links.length; i++){
      var a = links[i], b = a.querySelector('.hc-n');
      if (b){ b.textContent = n > 99 ? '99+' : String(n); b.hidden = n === 0; }
      a.setAttribute('aria-label', n ? 'Carrito, ' + n + (n === 1 ? ' producto' : ' productos') : 'Carrito');
    }
    return n;
  }
  window.ariaHeaderCart = paint;
  window.addEventListener('storage', function(e){ if (!e.key || e.key === KEY) paint(); });
  window.addEventListener('pageshow', paint);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint);
  else paint();
})();

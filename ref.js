/* INFLUENCER ATTRIBUTION (2026-10-08, Stripe checkout brief).
   A ?ref= link (ariashop.pe/?ref=ale) -- links, never codes: nobody
   remembers a code. The ref is kept in a first-party cookie for 30 days;
   the most recent link wins. orders-create.js reads the cookie and stores
   it on the order; commission is computed there on pre-discount figures.
   Format and rules: netlify/functions/_checkout-model.js (normalizeRef). */
(function () {
  try {
    var ref = new URLSearchParams(location.search).get('ref');
    if (!ref) return;
    ref = String(ref).trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(ref)) return;
    document.cookie = 'aria_ref=' + encodeURIComponent(ref + '|' + Date.now())
      + '; Max-Age=' + (30 * 24 * 60 * 60) + '; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
    try { localStorage.setItem('aria_ref', JSON.stringify({ ref: ref, at: Date.now() })); } catch (e) {}
  } catch (e) { /* attribution must never break a page */ }
})();

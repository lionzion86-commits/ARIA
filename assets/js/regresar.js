/* ==================================================================
   «← REGRESAR», BACK TO THE EXACT CARD (#443 c.6641939238, Danny live
   from his phone: "the only way back from a product is the browser back
   button"; carousels mix stores, so the way back is the carousel, not
   the product's store).

   Every page that renders cards, and producto.html, loads this file
   (defer; scripts/header-search.mjs places the tag).

   AT THE TAP (a capturing click on any card that opens a product):
     the origin is written down -- the page's address (its filters and
     pills already live there), the vertical scroll, every carousel's
     sideways scroll (the tapped one first) and the in-place views the
     URL does not keep (a department's hub-pill lens and its view
     switch). Two copies:
       - history.state.rg of the origin's own entry (the in-app router
         spreads history.state, so it keeps it);
       - sessionStorage 'aria_rg_v1': o[product] = where it was opened
         from, p[origin url] = the positions to put back.
   ON THE PRODUCT (producto.html's pill; index.html's in-app view calls
     AriaRegresar.fallback() from goBack() when the app pushed nothing):
       - the origin is the entry just behind -> history.back(), the very
         same step as the browser's back button (bfcache: the page comes
         back as it was, nothing is fetched again);
       - an origin further away -> its address, positions restored;
       - no origin (a shared link) -> the product's type section, from
         the site's own classifier (product-type.js): its department,
         with the type when the department has it. Never a dead end.
   BACK ON THE ORIGIN, when the browser could not keep the page (no
     bfcache): once the page has drawn, the scroll and each carousel go
     back where they were; a shopper who scrolls first wins.
   No unload handlers (they would cost the bfcache); no network.
   ================================================================== */
(function () {
  'use strict';
  if (window.AriaRegresar) return;
  var KEY = 'aria_rg_v1', MAX = 40;
  var ROW = '.ariaRail, div.rail, .track, .rel-row';
  var IN_ROW = ROW.split(', ').map(function (r) { return r + ' > *'; }).join(', ');

  function load() { try { return JSON.parse(sessionStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function save(s) {
    try {
      ['o', 'p'].forEach(function (k) {
        var m = s[k] || {}, ks = Object.keys(m);
        if (ks.length > MAX) ks.sort(function (a, b) { return (m[a].t || 0) - (m[b].t || 0); }).slice(0, ks.length - MAX).forEach(function (x) { delete m[x]; });
      });
      sessionStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) {}
  }
  function here() { return location.pathname + location.search + location.hash; }
  function noHash(u) { return String(u || '').split('#')[0]; }
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  /* A product, as its link names it: producto.html?producto=<title>&tienda=<store>. */
  function productKey(href) {
    try {
      var u = new URL(href, location.href);
      if (!/\/producto(\.html)?$/.test(u.pathname)) return '';
      return norm(u.searchParams.get('producto')) + '|' + norm(u.searchParams.get('tienda'));
    } catch (e) { return ''; }
  }

  /* ---------- the carousels ---------- */
  function scroller(el) {
    for (; el && el !== document.body; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth + 2) {
        var o = getComputedStyle(el).overflowX;
        if (o === 'auto' || o === 'scroll') return el;
      }
    }
    return null;
  }
  /* A carousel's name: its section's label or heading, else what its
     first card opens (the homepage's shelves: openCategoryRailProduct('toys'). */
  function heading(row) {
    var sec = row.closest('section, .rail-sec, .shelf, [aria-label]');
    var h = sec && sec.querySelector('h2, h3');
    var name = (sec && sec.getAttribute('aria-label')) || (h && h.textContent) || '';
    if (!/\S/.test(name) && row.firstElementChild) name = 'c:' + String(row.firstElementChild.getAttribute('onclick') || '').replace(/\d+\)$/, '');
    return norm(name).slice(0, 80);
  }
  /* the carousels on screen (a page may keep a hidden twin for the other width) */
  function section(h) {
    if (!h || h.indexOf('c:') === 0) return null;
    var secs = document.querySelectorAll('section, .rail-sec, .shelf, [aria-label]');
    for (var i = 0; i < secs.length; i++) {
      var s = secs[i], t = s.querySelector('h2, h3');
      if (s.getClientRects().length && norm(s.getAttribute('aria-label') || (t && t.textContent) || '').slice(0, 80) === h) return s;
    }
    return null;
  }
  function rows() { return Array.prototype.filter.call(document.querySelectorAll(ROW), function (r) { return r.getClientRects().length > 0; }); }
  /* A carousel, as it can be found again after a fresh render: its id,
     else its heading and the how-many-th carousel under that heading,
     else its place on the page. */
  function railId(row, all) {
    var h = heading(row), n = 0;
    for (var i = 0; i < all.length && all[i] !== row; i++) if (heading(all[i]) === h) n++;
    return { id: row.id || '', h: h, n: n, i: all.indexOf(row) };
  }
  function findRail(r, all) {
    if (r.id) { var e = document.getElementById(r.id); if (e) return e; }
    var n = 0;
    for (var i = 0; i < all.length; i++) if (heading(all[i]) === r.h) { if (n === r.n) return all[i]; n++; }
    return r.h ? null : (all[r.i] || null);
  }

  function snapshot(card) {
    var all = rows(), out = [], hit = card && scroller(card);
    if (hit && all.indexOf(hit) < 0) all.push(hit);
    all.forEach(function (row) {
      if (!row.isConnected || (row !== hit && !(row.scrollLeft > 0))) return;
      var r = railId(row, all);
      r.x = Math.round(row.scrollLeft);
      if (row === hit) { r.hit = 1; r.top = Math.round(row.getBoundingClientRect().top); var c = card.closest(IN_ROW) || card; r.c = Array.prototype.indexOf.call(row.children, c); out.unshift(r); }
      else if (out.length < 24) out.push(r);
    });
    var root = document.documentElement;
    return { u: here(), y: Math.round(window.scrollY || root.scrollTop || 0), r: out,
      v: { lens: root.getAttribute('data-lens') || '', dview: root.getAttribute('data-dview') || '' }, t: Date.now() };
  }

  /* ---------- the tap ---------- */
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var t = e.target && e.target.closest ? e.target : null;
    if (!t || t.closest('[data-rg]')) return;
    var a = t.closest('a[href]'), card = t.closest(IN_ROW);
    /* A product link anywhere; any card in a carousel (the app's cards are
       buttons: showProduct opens the in-app view, data-pdp the page). */
    var key = a ? productKey(a.href) : card && card.getAttribute('data-pdp') ? productKey(card.getAttribute('data-pdp'))
      : card && card.getAttribute('data-cp-t') ? norm(card.getAttribute('data-cp-t')) + '|' + norm(card.getAttribute('data-cp-r')) : '';
    if (!key && !card) return;
    if (a && a.target && a.target !== '_self') return;
    var rec = snapshot(card || a);
    try { history.replaceState(Object.assign({}, history.state || {}, { rg: rec }), '', location.href); } catch (err) {}
    var s = load(); s.o = s.o || {}; s.p = s.p || {};
    s.p[rec.u] = rec;
    if (key) s.o[key] = { u: rec.u, t: rec.t };
    /* a card that names no product (an app button): the next product page
       opened from here, within the minute, came from this tap */
    s.last = { u: rec.u, t: rec.t };
    save(s);
  }, true);

  /* ---------- putting a page back ---------- */
  var stopAt = 0, moved = false;
  function user() { moved = true; }
  ['wheel', 'touchstart', 'keydown'].forEach(function (ev) { window.addEventListener(ev, user, { passive: true }); });
  /* The tapped carousel goes back to the same height on the screen (the
     page above it may have drawn differently on a fresh load: the scroll
     follows the carousel, as the browser's own scroll anchoring would),
     every carousel to its sideways spot; until it all holds still for a
     second, or the shopper moves. */
  function restore(rec) {
    if (!rec) return;
    moved = false;
    var list = rec.r || [], hit = list[0] && list[0].hit && list[0].top != null ? list[0] : null;
    var views = rec.v || {}, settle = 0, root = document.documentElement;
    var seenView = !(views.lens || views.dview);
    if ('scrollRestoration' in history) { try { history.scrollRestoration = 'manual'; } catch (e) {} }
    stopAt = Date.now() + 10000;
    (function step() {
      if (moved || Date.now() > stopAt) return;
      var still = true;
      /* the in-place view first: its pill, once the page has drawn it */
      if (!seenView) {
        var b = null;
        if (views.lens && root.getAttribute('data-lens') !== views.lens) b = document.querySelector('#hubPills .hub-pill[data-k="' + cssEsc(views.lens) + '"]');
        else if (views.dview && root.getAttribute('data-dview') !== views.dview) b = document.querySelector('#dhJump button[data-view="' + cssEsc(views.dview) + '"]');
        else seenView = true;
        if (b && !b._rg) { b._rg = 1; b.click(); }
        still = false;
      }
      var all = rows(), hitRow = null;
      list.forEach(function (r) {
        var row = findRail(r, all);
        if (r === hit) hitRow = row;
        if (!row || row.scrollWidth - row.clientWidth < r.x - 2) { still = false; return; }
        if (Math.abs(row.scrollLeft - r.x) > 2) {
          row.style.scrollBehavior = 'auto'; row.scrollLeft = r.x; row.style.scrollBehavior = '';
          still = false;
        }
      });
      /* not drawn yet: its section, where the page draws a shelf as it nears the screen */
      var anchor = hitRow || (hit ? section(hit.h) : null);
      var y = anchor ? Math.round((window.scrollY || 0) + anchor.getBoundingClientRect().top - hit.top) : (rec.y || 0);
      if (root.scrollHeight - window.innerHeight >= y - 2) {
        if (Math.abs((window.scrollY || 0) - y) > 2) { window.scrollTo({ top: y, left: 0, behavior: 'instant' }); still = false; }
      } else still = false;
      if (hit && !hitRow) still = false;
      if (still) { if (++settle > 10) return; } else settle = 0;
      setTimeout(step, 100);
    })();
  }
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'); }

  /* A fresh load of the origin (back without the bfcache, or the pill's
     own trip to an origin further away). */
  (function () {
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    var s = load(), url = here(), rec = null;
    if (s.go === url) { rec = s.p && s.p[url]; delete s.go; save(s); }
    else if (nav && nav.type === 'back_forward') rec = (history.state && history.state.rg) || (s.p && s.p[url]);
    if (rec && noHash(rec.u) === noHash(url)) restore(rec);
  })();
  /* The app's own back step (index.html): the router re-shows the view,
     this puts the carousels back. A bfcache return needs nothing. */
  window.addEventListener('popstate', function (e) {
    var rec = e.state && e.state.rg;
    if (rec && noHash(rec.u) === noHash(here())) restore(rec);
  });

  /* ---------- the way back from a product ---------- */
  var GENDER = [['kids', /\b(girls?|boys?|kids?|toddlers?|baby|bab(y|ies)|infant|ni[ñn][oa]s?|youth|junior)\b/i],
    ['women', /\b(women'?s?|womens|ladies|lady|mujer(es)?|her)\b/i], ['men', /\b(men'?s?|mens|hombres?|him)\b/i]];
  /* The type families of product-type.js and the department that holds
     each; t: the department's own type for it (its ?t= lens). */
  var FAMILY = { juguetes: 'toys', deportes: 'sporting_goods', electronica: 'electronics', hogar: 'home_goods', belleza: 'beauty',
    perfumes: 'perfumes', bebe: 'moms', repuestos: 'auto_parts', libros: 'books', dulces: 'candy_chocolate',
    zapatos: 'shoes', carteras: 'purses', joyas: 'joyas_accesorios', accesorios: 'joyas_accesorios', sombreros: 'clothing', trajes_bano: 'clothing', ropa: 'clothing' };
  var BY_GENDER = { zapatos: 'zapatos', carteras: 'carteras', joyas: 'joyas', sombreros: 'gorras', trajes_bano: 'bano', ropa: '' };
  var G_TYPES = { women: 'bano carteras joyas zapatos', men: 'bano carteras gorras joyas zapatos', kids: 'bano gorras zapatos' };
  function sectionUrl(p) {
    p = p || {};
    var name = String(p.name || p.title || ''), fam = p.fam || '';
    try { if (!fam && window.AriaProductType) fam = window.AriaProductType.classify({ name: name, retailer: p.retailer, brand: p.brand, type: p.type }); } catch (e) {}
    var dept = FAMILY[fam], g = '';
    if (!dept) return '/categorias.html';
    if (fam in BY_GENDER) for (var i = 0; i < GENDER.length; i++) if (GENDER[i][1].test(name)) { g = GENDER[i][0]; break; }
    if (g) {
      if (fam === 'zapatos') return '/departamento.html?dept=shoes&para=' + g;
      var t = BY_GENDER[fam];
      return '/departamento.html?dept=' + g + (t && G_TYPES[g].split(' ').indexOf(t) >= 0 ? '&t=' + t : '');
    }
    return '/departamento.html?dept=' + dept;
  }
  function originFor(key) {
    var s = load(), o = key && s.o && s.o[key];
    if (o && o.u) return o.u;
    var l = s.last;
    if (key && l && l.u && Date.now() - l.t < 60000 && sameAsReferrer(l.u)) {
      s.o = s.o || {}; s.o[key] = { u: l.u, t: l.t }; delete s.last; save(s);
      return l.u;
    }
    return '';
  }
  function sameAsReferrer(u) {
    try { return !!document.referrer && history.length > 1 && noHash(new URL(u, location.href).href) === noHash(document.referrer); } catch (e) { return false; }
  }
  var backTimer = 0;
  window.addEventListener('pagehide', function () { clearTimeout(backTimer); });
  function go(u) {
    var s = load(); s.go = u; save(s);
    location.href = u;
  }
  /* producto.html's pill */
  function wirePill(pill) {
    var key = productKey(location.href), from = originFor(key);
    pill.href = from || sectionUrl({ name: new URLSearchParams(location.search).get('producto') || '', retailer: new URLSearchParams(location.search).get('tienda') || '' });
    pill.setAttribute('data-rg-to', from ? 'origin' : 'section');
    pill.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
      var u = originFor(key);
      if (!u) return;   // the section: the plain link
      e.preventDefault();
      if (sameAsReferrer(u)) {
        history.back();
        backTimer = setTimeout(function () { go(u); }, 900);
        return;
      }
      go(u);
    });
  }
  function boot() { var pill = document.querySelector('a[data-rg]'); if (pill) wirePill(pill); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.AriaRegresar = {
    sectionUrl: sectionUrl,
    /* index.html's in-app product view, opened with nothing of ours
       behind it: the product's type section. */
    fallback: function (p) { if (!p || !(p.name || p.title)) return false; location.href = sectionUrl(p); return true; },
    restore: restore
  };
})();

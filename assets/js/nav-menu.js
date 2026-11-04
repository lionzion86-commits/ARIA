/* ==================================================================
   THE HEADER MEGA-MENU (#443 c.6616347095 / c.6616389410 / c.6616425433).

   Danny: copy Nordstrom's navigation pattern. The tab row under every
   page's header (scripts/build-nav-menu.mjs writes it) opens a flyout
   OVER the page -- on the homepage too:
     - desktop: hover a tab (a small intent delay) or click it;
     - phone: tap it; the flyout is a bottom sheet;
     - click or tap off it, or Esc, and it closes: same page, nothing
       navigated, the scroll where it was;
     - only a leaf (a type, a brand, a section) navigates.
   The columns come from assets/data/nav-menu.json, fetched once, on the
   first hover / focus / tap of a tab -- never with the page, and never a
   catalogue (the Mountain Test).

   THE HEADER CREATES NOTHING (#443 c.6621544530, c.6621722209): every
   leaf is the canonical section page with that page's own parameters
   (build-nav-menu.mjs). A long column (a department's brands) shows its
   first leaves and «Ver todas las marcas (N)»: the complete list, from
   the department's real inventory (assets/data/nav-brands/<file>.json,
   fetched only on that tap), opens in the column, scrollable.

   NO DEAD ENDS (#443 c.6623258189): a tab with no columns is a plain
   link (data-nm-direct, or no columns in the menu): it navigates, no
   sheet opens. A column the generator collapsed (links: [], href) is a
   link on desktop and a row that navigates on the phone. On the phone a
   tab of one column opens straight on its list (Ofertas: its
   categories), with no drill screen in between.
   ================================================================== */
(function(){
  'use strict';
  var nav = document.querySelector('[data-nm]');
  if (!nav || nav.getAttribute('data-nm-on')) return;
  nav.setAttribute('data-nm-on', '1');

  var CSS = ''
    + '.nmf-bd{position:fixed;left:0;right:0;bottom:0;z-index:60;background:rgba(10,31,68,.38);opacity:0;transition:opacity .16s}'
    + '.nmf-bd.on{opacity:1}'
    + '.nmf{position:fixed;left:0;right:0;z-index:61;background:#fff;color:#0A1F44;box-shadow:0 18px 40px rgba(10,31,68,.18);overflow-y:auto;overscroll-behavior:contain;font-family:inherit}'
    + '.nmf-in{max-width:1240px;margin:0 auto;padding:18px 24px 24px;box-sizing:border-box}'
    + '.nmf-head{display:flex;align-items:center;gap:12px;margin:0 0 14px}'
    + '.nmf-all{font-size:15px;font-weight:800;color:#0A1F44;text-decoration:none}'
    + '.nmf-all small,.nmf-col small{font-weight:600;color:#6B7487;margin-left:6px;font-size:12px}'
    + '.nmf-x{margin-left:auto;width:40px;height:40px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:999px;background:#F3F5F9;color:#0A1F44;cursor:pointer}'
    + '.nmf-cols{display:flex;flex-wrap:wrap;gap:8px 28px}'
    + '.nmf-col{flex:1 1 170px;min-width:150px;max-width:260px}'
    + '.nmf-col h3{margin:0 0 6px;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#6B7487}'
    + '.nmf-col h3 a{color:inherit;text-decoration:none}'
    + '.nmf-col ul{list-style:none;margin:0;padding:0}'
    + '.nmf-col li a{display:block;padding:5px 0;font-size:14px;font-weight:600;color:#0A1F44;text-decoration:none;line-height:1.3}'
    + '.nmf-col li a:hover,.nmf-all:hover{text-decoration:underline}'
    + '.nmf-msg{padding:6px 0;color:#6B7487;font-size:14px}'
    + '.nmf-more{display:inline-flex;align-items:center;gap:6px;margin:6px 0 0;padding:0;border:0;background:none;color:#2456A0;font:800 14px/1.3 sans-serif;font-family:inherit;cursor:pointer;text-align:left}'
    + '.nmf-more small{font-weight:600;color:#6B7487;font-size:12px}'
    + '.nmf-col ul.nmf-full{max-height:340px;overflow-y:auto;overscroll-behavior:contain;padding-right:6px}'
    + '.nmf-drill{display:none}'
    + '.nmf-col a:focus-visible,.nmf-all:focus-visible,.nmf-drill a:focus-visible,.nmf-drill button:focus-visible{outline:2px solid #B8860B;outline-offset:2px;border-radius:4px}'
    /* PHONE: a full-height drill-down under the tab row -- the tab's
       columns, then one column's leaves with a way back. */
    + '@media (max-width:767.98px){'
    +   '.nmf{bottom:0;max-height:none!important;border-radius:16px 16px 0 0;box-shadow:0 -12px 32px rgba(10,31,68,.22)}'
    +   '.nmf-bd{top:0!important}'
    +   '.nmf-in{padding:12px 16px 28px}'
    +   '.nmf-head{position:sticky;top:-12px;background:#fff;padding:6px 0 10px;margin:0;z-index:1}'
    +   '.nmf-cols{display:none}'
    +   '.nmf-drill{display:block}'
    +   '.nmf-l0,.nmf-l1 ul{list-style:none;margin:0;padding:0}'
    +   '.nmf-go,.nmf-l1 li a,.nmf-colall{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:52px;padding:0 4px;border:0;border-top:1px solid #E4E6EC;background:none;color:#0A1F44;font:700 16px/1.25 sans-serif;font-family:inherit;text-align:left;text-decoration:none;cursor:pointer;box-sizing:border-box}'
    +   '.nmf-go small,.nmf-l1 li a small{margin-left:auto;margin-right:8px;font-weight:600;color:#6B7487;font-size:13px}'
    +   '.nmf-colall{color:#2456A0;font-weight:800}'
    +   '.nmf-l1 .nmf-more{display:flex;width:100%;min-height:52px;margin:0;padding:0 4px;border-top:1px solid #E4E6EC;font-size:16px}'
    +   '.nmf-back{display:inline-flex;align-items:center;gap:6px;height:44px;padding:0 4px;border:0;background:none;color:#0A1F44;font:800 15px/1 sans-serif;font-family:inherit;cursor:pointer}'
    +   '.nmf-l1 h3{margin:6px 4px 8px;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#6B7487}'
    + '}';
  var st = document.createElement('style'); st.id = 'nmf-css'; st.textContent = CSS; document.head.appendChild(st);

  var MENU = null, LOADING = null;
  var bd = document.createElement('div'); bd.className = 'nmf-bd'; bd.hidden = true; bd.setAttribute('data-nm-backdrop', '');
  var panel = document.createElement('div'); panel.className = 'nmf'; panel.id = 'nmFlyout'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('data-nm-panel', '');
  document.body.appendChild(bd); document.body.appendChild(panel);

  var open = null, mode = '', tOpen = 0, tClose = 0;
  var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var num = function(n){ return Number(n || 0).toLocaleString('es-PE'); };
  var fine = function(){ try { return window.matchMedia('(hover: hover) and (pointer: fine)').matches; } catch(e){ return false; } };

  function load(){
    if (MENU) return Promise.resolve(MENU);
    if (!LOADING) LOADING = fetch('/assets/data/nav-menu.json').then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(j){ MENU = j; return j; }, function(e){ LOADING = null; throw e; });
    return LOADING;
  }
  /* «Ver todas»: the column's complete list, one small file per department. */
  var FULL = {};
  function moreHTML(c, i){
    if (!c.more || !(c.all > c.links.length)) return '';
    return '<li><button type="button" class="nmf-more" data-nm-more="' + i + '">' + (c.h === 'Marcas' ? 'Ver todas las marcas' : 'Ver todos') + '<small>' + num(c.all) + '</small></button></li>';
  }
  function expand(i){
    var t = open && tabOf(open.getAttribute('data-nm-tab')), c = t && t.cols[i];
    if (!c || !c.more) return;
    var a = open;
    var got = FULL[c.more] || (FULL[c.more] = fetch(c.more).then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).catch(function(e){ delete FULL[c.more]; throw e; }));
    got.then(function(list){
      if (open !== a) return;
      Array.prototype.forEach.call(panel.querySelectorAll('ul[data-nm-ul="' + i + '"]'), function(ul){ ul.innerHTML = list.map(linkHTML).join(''); ul.classList.add('nmf-full'); });
    }, function(){
      Array.prototype.forEach.call(panel.querySelectorAll('[data-nm-more="' + i + '"]'), function(b){ b.textContent = 'No pudimos cargar la lista. Toca para reintentar.'; });
    });
  }
  function direct(a){
    if (a.hasAttribute('data-nm-direct')) return true;
    var t = MENU && tabOf(a.getAttribute('data-nm-tab'));
    return !!(t && !t.cols.length);
  }
  var isGo = function(c){ return !c.links.length && !!c.href; };
  /* A row's number: a Marcas row counts brands (its unit says so); any other row
     carries one only when the menu gives it (its columns partition the tab). */
  var colN = function(c){ return c.n ? '<small>' + num(c.n) + (/^Marcas( |$)/.test(c.h) ? ' marcas' : '') + '</small>' : ''; };
  function tabOf(k){ return MENU && (MENU.tabs || []).filter(function(t){ return t.k === k; })[0]; }
  function linkHTML(l){ return '<li><a href="' + esc(l[1]) + '" data-nm-leaf>' + esc(l[0]) + (l[2] ? '<small>' + num(l[2]) + '</small>' : '') + '</a></li>'; }
  var CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  var BACK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>';
  function paint(a){
    var k = a.getAttribute('data-nm-tab'), t = tabOf(k), label = a.textContent;
    panel.setAttribute('aria-label', label);
    var head = '<div class="nmf-head"><a class="nmf-all" href="' + esc(t ? t.href : a.getAttribute('href')) + '" data-nm-leaf>Ver todo ' + esc(label)
      + (t && t.n ? '<small>' + num(t.n) + ' productos</small>' : '') + '</a>'
      + '<button type="button" class="nmf-x" aria-label="Cerrar menú"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>';
    var body;
    if (!t) body = '<p class="nmf-msg">Cargando…</p>';
    else if (!t.cols.length) body = '';
    else {
      /* One column: the phone opens straight on its list (no drill screen). */
      var one = t.cols.length === 1 && !isGo(t.cols[0]);
      body = '<div class="nmf-cols">' + t.cols.map(function(c, i){
        if (isGo(c)) return '<section class="nmf-col" data-nm-col="' + esc(c.h) + '"><h3><a href="' + esc(c.href) + '" data-nm-leaf>' + esc(c.h) + '</a></h3></section>';
        return '<section class="nmf-col" data-nm-col="' + esc(c.h) + '"><h3>' + (c.href ? '<a href="' + esc(c.href) + '" data-nm-leaf>' + esc(c.h) + '</a>' : esc(c.h)) + '</h3><ul data-nm-ul="' + i + '">' + c.links.map(linkHTML).join('') + moreHTML(c, i) + '</ul></section>';
      }).join('') + '</div>'
        /* The phone's drill-down: the same columns, one level at a time;
           a collapsed column is a row that navigates. */
        + '<div class="nmf-drill">' + (one ? '' : '<ul class="nmf-l0" data-nm-l0>' + t.cols.map(function(c, i){
          if (isGo(c)) return '<li><a class="nmf-go" href="' + esc(c.href) + '" data-nm-leaf>' + esc(c.h) + colN(c) + CHEV + '</a></li>';
          return '<li><button type="button" class="nmf-go" data-nm-go="' + i + '">' + esc(c.h) + colN(c) + CHEV + '</button></li>';
        }).join('') + '</ul>') + t.cols.map(function(c, i){
          if (isGo(c)) return '';
          return '<div class="nmf-l1" data-nm-lvl="' + i + '"' + (one ? '' : ' hidden') + '>' + (one ? '' : '<button type="button" class="nmf-back" data-nm-back>' + BACK + esc(label) + '</button>') + '<h3>' + esc(c.h) + '</h3>'
            + (c.href ? '<a class="nmf-colall" href="' + esc(c.href) + '" data-nm-leaf>Ver todo: ' + esc(c.h) + CHEV + '</a>' : '')
            + '<ul data-nm-ul="' + i + '">' + c.links.map(linkHTML).join('') + moreHTML(c, i) + '</ul></div>';
        }).join('') + '</div>';
    }
    panel.innerHTML = '<div class="nmf-in">' + head + body + '</div>';
  }
  function place(){
    var r = nav.getBoundingClientRect(), top = Math.max(0, Math.round(r.bottom));
    panel.style.top = top + 'px';
    panel.style.maxHeight = 'calc(100vh - ' + top + 'px)';
    bd.style.top = top + 'px';
  }
  function show(a, how){
    clearTimeout(tClose); clearTimeout(tOpen);
    if (direct(a)) { hide(); if (how === 'click') window.location.assign(a.href); return; }
    if (open && open !== a) open.setAttribute('aria-expanded', 'false');
    open = a; mode = how;
    a.setAttribute('aria-expanded', 'true');
    paint(a); place();
    panel.hidden = false; bd.hidden = false;
    requestAnimationFrame(function(){ bd.classList.add('on'); });
    document.documentElement.setAttribute('data-nm-open', a.getAttribute('data-nm-tab'));
    if (!MENU) load().then(function(){
      if (open !== a) return;
      /* The menu says this tab has no columns: it is a link, go there. */
      if (direct(a)) { var m = mode; hide(); if (m === 'click') window.location.assign(a.href); return; }
      paint(a);
    }, function(){
      if (open === a) panel.querySelector('.nmf-in').insertAdjacentHTML('beforeend', '<p class="nmf-msg">No pudimos cargar el menú. Toca «Ver todo» o inténtalo de nuevo.</p>');
    });
  }
  function hide(){
    clearTimeout(tClose); clearTimeout(tOpen);
    if (!open) return;
    open.setAttribute('aria-expanded', 'false');
    open = null; mode = '';
    panel.hidden = true; bd.hidden = true; bd.classList.remove('on');
    document.documentElement.removeAttribute('data-nm-open');
  }

  /* Desktop: hover with intent, leaving closes a hover-opened flyout. */
  nav.addEventListener('pointerover', function(e){
    if (e.pointerType !== 'mouse') return;
    var a = e.target.closest && e.target.closest('.nm-tab');
    if (!a || direct(a)) return;
    load().catch(function(){});
    clearTimeout(tClose); clearTimeout(tOpen);
    if (open === a) return;
    tOpen = setTimeout(function(){ show(a, open ? mode || 'hover' : 'hover'); }, open ? 90 : 180);
  });
  function leave(e){
    if (e.pointerType !== 'mouse') return;
    clearTimeout(tOpen);
    if (!open || mode !== 'hover') return;
    var to = e.relatedTarget;
    if (to && (nav.contains(to) || panel.contains(to))) return;
    clearTimeout(tClose);
    tClose = setTimeout(function(){
      /* Only when the pointer really left: a layout shift under a still
         mouse is not leaving. */
      var at = LAST ? document.elementFromPoint(LAST[0], LAST[1]) : null;
      if (at && (nav.contains(at) || panel.contains(at))) return;
      hide();
    }, 320);
  }
  var LAST = null;
  document.addEventListener('pointermove', function(e){ if (e.pointerType === 'mouse') LAST = [e.clientX, e.clientY]; }, { passive: true });
  nav.addEventListener('pointerout', leave);
  panel.addEventListener('pointerout', leave);
  panel.addEventListener('pointerover', function(e){ if (e.pointerType === 'mouse') clearTimeout(tClose); });

  /* Click / tap a tab: open (or close what it opened). Never navigates. */
  nav.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('.nm-tab');
    if (!a) return;
    /* A tab with no columns is a link: let it navigate. */
    if (direct(a)) { hide(); return; }
    e.preventDefault();
    if (open === a && mode === 'click') { hide(); return; }
    show(a, 'click');
  });
  nav.addEventListener('focusin', function(){ load().catch(function(){}); });
  nav.addEventListener('keydown', function(e){
    var a = e.target.closest && e.target.closest('.nm-tab');
    if (!a) return;
    if ((e.key === 'Enter' || e.key === ' ') && direct(a)) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' '){
      e.preventDefault();
      if (open !== a) show(a, 'click');
      var first = function(){ var f = panel.querySelector('.nmf-col a, .nmf-l0 button'); if (f && f.offsetParent !== null) f.focus(); else { f = panel.querySelector('.nmf-all'); if (f) f.focus(); } };
      if (MENU) first(); else load().then(function(){ requestAnimationFrame(first); }, function(){});
      return;
    }
    /* Left / right walk the tabs; an open flyout follows. */
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft'){
      var tabs = Array.prototype.slice.call(nav.querySelectorAll('.nm-tab')), i = tabs.indexOf(a);
      var nx = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      e.preventDefault(); nx.focus();
      if (open) show(nx, 'click');
    }
  });

  /* Off it: the backdrop, anywhere else, or Esc. */
  bd.addEventListener('click', function(e){ e.preventDefault(); hide(); });
  panel.addEventListener('click', function(e){
    if (e.target.closest('.nmf-x')) { e.preventDefault(); var a = open; hide(); if (a) a.focus(); return; }
    /* «Ver todas las marcas»: the whole list, in place. Nothing navigates. */
    var more = e.target.closest('[data-nm-more]');
    if (more){ e.preventDefault(); expand(more.getAttribute('data-nm-more')); return; }
    /* The drill-down: into a column, and back out of it. Nothing navigates. */
    var go = e.target.closest('[data-nm-go]');
    if (go){
      e.preventDefault();
      panel.querySelector('[data-nm-l0]').hidden = true;
      var lv = panel.querySelector('[data-nm-lvl="' + go.getAttribute('data-nm-go') + '"]');
      lv.hidden = false; panel.scrollTop = 0;
      var f = lv.querySelector('a, button'); if (f) f.focus({ preventScroll: true });
      return;
    }
    if (e.target.closest('[data-nm-back]')){
      e.preventDefault();
      var cur = e.target.closest('[data-nm-lvl]'); cur.hidden = true;
      panel.querySelector('[data-nm-l0]').hidden = false;
      var back = panel.querySelector('[data-nm-go="' + cur.getAttribute('data-nm-lvl') + '"]'); if (back) back.focus({ preventScroll: true });
    }
  });
  /* KEYBOARD (desktop): arrows walk the columns -- up / down inside one,
     left / right to the same row of the next one; Home / End; Esc closes. */
  panel.addEventListener('keydown', function(e){
    if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(e.key) < 0) return;
    var cols = Array.prototype.filter.call(panel.querySelectorAll('.nmf-col, .nmf-l0, .nmf-l1:not([hidden])'), function(c){ return c.offsetParent !== null; });
    if (!cols.length) return;
    var lists = cols.map(function(c){ return Array.prototype.slice.call(c.querySelectorAll('a, button')); });
    var ci = -1, ri = -1;
    lists.forEach(function(l, i){ var j = l.indexOf(document.activeElement); if (j >= 0){ ci = i; ri = j; } });
    if (ci < 0){ ci = 0; ri = -1; }
    var l = lists[ci];
    if (e.key === 'ArrowDown') ri = Math.min(l.length - 1, ri + 1);
    else if (e.key === 'ArrowUp'){ if (ri <= 0 && open){ e.preventDefault(); open.focus(); return; } ri = ri - 1; }
    else if (e.key === 'Home') ri = 0;
    else if (e.key === 'End') ri = l.length - 1;
    else { ci = (ci + (e.key === 'ArrowRight' ? 1 : -1) + lists.length) % lists.length; l = lists[ci]; ri = Math.min(Math.max(0, ri), l.length - 1); }
    e.preventDefault();
    if (l[ri]) l[ri].focus();
  });
  document.addEventListener('click', function(e){
    if (!open) return;
    if (nav.contains(e.target) || panel.contains(e.target)) return;
    hide();
  }, true);
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && open) { var a = open; hide(); a.focus(); }
  });
  window.addEventListener('resize', function(){ if (open) place(); });
  window.addEventListener('scroll', function(){ if (open && fine()) place(); }, { passive: true });
  /* The page went back (bfcache): no flyout left open. */
  window.addEventListener('pageshow', function(e){ if (e.persisted) hide(); });
})();

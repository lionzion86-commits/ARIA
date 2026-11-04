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
    + '@media (max-width:767.98px){'
    +   '.nmf{top:auto!important;bottom:0;max-height:82vh;border-radius:18px 18px 0 0;box-shadow:0 -12px 32px rgba(10,31,68,.22)}'
    +   '.nmf-bd{top:0!important}'
    +   '.nmf-in{padding:14px 16px 22px}'
    +   '.nmf-head{position:sticky;top:-14px;background:#fff;padding:6px 0 10px;margin:0 0 6px;z-index:1}'
    +   '.nmf-cols{display:block}'
    +   '.nmf-col{max-width:none;padding:10px 0;border-top:1px solid #E4E6EC}'
    +   '.nmf-col ul{display:flex;flex-wrap:wrap;gap:8px}'
    +   '.nmf-col li a{padding:0 14px;height:40px;line-height:40px;border:1px solid #E4E6EC;border-radius:999px;font-size:14px;white-space:nowrap}'
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
  function tabOf(k){ return MENU && (MENU.tabs || []).filter(function(t){ return t.k === k; })[0]; }
  function linkHTML(l){ return '<li><a href="' + esc(l[1]) + '" data-nm-leaf>' + esc(l[0]) + (l[2] ? '<small>' + num(l[2]) + '</small>' : '') + '</a></li>'; }
  function paint(a){
    var k = a.getAttribute('data-nm-tab'), t = tabOf(k), label = a.textContent;
    panel.setAttribute('aria-label', label);
    var head = '<div class="nmf-head"><a class="nmf-all" href="' + esc(t ? t.href : a.getAttribute('href')) + '" data-nm-leaf>Ver todo ' + esc(label)
      + (t && t.n ? '<small>' + num(t.n) + ' productos</small>' : '') + '</a>'
      + '<button type="button" class="nmf-x" aria-label="Cerrar menú"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>';
    var body;
    if (!t) body = '<p class="nmf-msg">Cargando…</p>';
    else if (!t.cols.length) body = '<p class="nmf-msg">Abre la página de ' + esc(label) + ' para ver todo.</p>';
    else body = '<div class="nmf-cols">' + t.cols.map(function(c){
      return '<section class="nmf-col" data-nm-col="' + esc(c.h) + '"><h3>' + (c.href ? '<a href="' + esc(c.href) + '" data-nm-leaf>' + esc(c.h) + '</a>' : esc(c.h)) + '</h3><ul>' + c.links.map(linkHTML).join('') + '</ul></section>';
    }).join('') + '</div>';
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
    if (open && open !== a) open.setAttribute('aria-expanded', 'false');
    open = a; mode = how;
    a.setAttribute('aria-expanded', 'true');
    paint(a); place();
    panel.hidden = false; bd.hidden = false;
    requestAnimationFrame(function(){ bd.classList.add('on'); });
    document.documentElement.setAttribute('data-nm-open', a.getAttribute('data-nm-tab'));
    if (!MENU) load().then(function(){ if (open === a) paint(a); }, function(){
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
    if (!a) return;
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
    e.preventDefault();
    if (open === a && mode === 'click') { hide(); return; }
    show(a, 'click');
  });
  nav.addEventListener('focusin', function(){ load().catch(function(){}); });
  nav.addEventListener('keydown', function(e){
    var a = e.target.closest && e.target.closest('.nm-tab');
    if (a && (e.key === 'ArrowDown')) { e.preventDefault(); show(a, 'click'); var f = panel.querySelector('a'); if (f) f.focus(); }
  });

  /* Off it: the backdrop, anywhere else, or Esc. */
  bd.addEventListener('click', function(e){ e.preventDefault(); hide(); });
  panel.addEventListener('click', function(e){ if (e.target.closest('.nmf-x')) { e.preventDefault(); var a = open; hide(); if (a) a.focus(); } });
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

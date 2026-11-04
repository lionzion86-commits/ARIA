/* ==================================================================
   THE ROPA INTERIOR HEADER ON EVERY DEPARTMENT (#443 c.6545712892).

   Danny passed Ropa Interior's page and wants every department that
   way. On departamento.html this module draws, around the department's
   own rails (which stay, unchanged, as the lead):
     - the hero's stats chips: productos, tiendas, en oferta;
     - the audience switch (Todo / Mujer / Hombre / Niños) where the
       data says who the department is for (head.json's `aud`; built by
       scripts/build-department-slices.mjs, never guessed). It is a
       full-view switch: the whole page re-renders for that audience;
     - the view switch: Todo / Por tipo / Por marca / Por tienda /
       Explorar todo. Like the audience switch it REPLACES the view in
       place, under the bar (#443 c.6635829511, Danny: "clicking a pill
       changes the full screen from the top"): never an anchor jump, never
       a landing mid-section, and the shopper's scroll does not move.
       «Todo», or the active pill tapped again, brings the department back;
     - the three axes, big-card rails per type, brand and store
       (/.netlify/functions/department?axis=...), fetched as they near
       the screen;
     - Explorar todo: words plus Tipo / Marca / Tienda / Ordenar, the
       options of each filter narrowed by the others (cross-dependent,
       answered on the server: ?explore=1) -- one carousel, 48 cards at a
       time brought into it by its last card («Ver más»), never a grid
       (#443, Danny: "never again a side-by-side grid").
   It reads the department through window.AriaDept (departamento.html).
   ================================================================== */
(function(){
  'use strict';
  var D = window.AriaDept;
  if (!D || !document.getElementById('rails')) return;

  var CSS = ''
    + '.dh-stats{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}'
    + '.dh-stats span{display:inline-flex;align-items:baseline;gap:6px;height:36px;padding:0 16px;border-radius:999px;background:rgba(255,255,255,.92);color:#0A1F44;font-size:14px;font-weight:700;line-height:36px}'
    + '.dh-stats b{font-weight:800;color:#B8860B}'
    + '.dh-bar{max-width:1240px;margin:0 auto;padding:14px 20px 0;display:flex;flex-direction:column;gap:12px}'
    + '.dh-aud,.dh-jump{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}'
    + '.dh-aud::-webkit-scrollbar,.dh-jump::-webkit-scrollbar{display:none}'
    + '.dh-aud button{flex:0 0 auto;height:44px;padding:0 20px;border-radius:999px;border:1px solid #E4E6EC;background:#fff;color:#0A1F44;font:800 15px/1 inherit;font-family:inherit;cursor:pointer}'
    + '.dh-aud button small{font-weight:600;color:#6B7487;margin-left:6px;font-size:12px}'
    + '.dh-aud button[aria-pressed="true"]{background:#0A1F44;color:#fff;border-color:#0A1F44}'
    + '.dh-aud button[aria-pressed="true"] small{color:#C9D2E6}'
    + '.dh-jump button{flex:0 0 auto;height:40px;padding:0 18px;border-radius:999px;border:1px solid #E4E6EC;background:#fff;color:#0A1F44;font:800 14px/38px inherit;font-family:inherit;white-space:nowrap;cursor:pointer}'
    + '.dh-jump button[aria-pressed="true"]{background:#0A1F44;color:#fff;border-color:#0A1F44}'
    /* A view is the page: the department's carousels step aside, and only the chosen section shows. */
    + 'html[data-dview] #salesTop,html[data-dview] #rails,html[data-dview] #perfumesLead,html[data-dview] #lens,html[data-dview] #emptyState{display:none!important}'
    + 'html[data-dview] #dhAxes > .dh-sec:not(.dh-on){display:none!important}'
    + '.dh-tally{margin:4px 20px 0;color:#6B7487;font-size:14px;font-weight:600}'
    + '.dh-sec{max-width:1240px;margin:0 auto;padding:22px 0 6px;scroll-margin-top:12px}'
    + '.dh-sec > h2{margin:0 20px 2px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#6B7487}'
    + '.dh-sec .dh-note{margin:6px 20px 0;color:#6B7487;font-size:14px}'
    + '.dh-ex{padding:0 20px}'
    + '.dh-ex .dh-q{width:100%;height:46px;border:1px solid #E4E6EC;border-radius:12px;padding:0 14px;font:500 15px inherit;font-family:inherit;color:#0A1F44;background:#fff;box-sizing:border-box;margin-top:12px}'
    + '.dh-sel{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}'
    + '@media(min-width:640px){.dh-sel{grid-template-columns:repeat(4,minmax(0,1fr))}}'
    + '.dh-sel select{width:100%;height:44px;border:1px solid #E4E6EC;border-radius:12px;padding:0 10px;font:700 14px inherit;font-family:inherit;color:#0A1F44;background:#fff;min-width:0}'
    + '.dh-count{margin:12px 0 10px;color:#6B7487;font-size:14px;font-weight:600}'
    + '.dh-empty{padding:18px 0;color:#6B7487;font-size:14px}';
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  var esc = D.esc, num = function(n){ return Number(n || 0).toLocaleString('es-PE'); };
  var AXES = [['tipo', 'Por tipo'], ['marca', 'Por marca'], ['tienda', 'Por tienda']];
  var AUD = null;            // the department's switch (from the static head)
  var LAST_U = null;         // the audience the axes / explore were drawn for

  /* ---------- the bar under the hero: switch + jump ---------- */
  var hero = document.getElementById('deptHero');
  var bar = document.createElement('div'); bar.className = 'dh-bar'; bar.id = 'dhBar';
  bar.innerHTML = '<nav class="dh-aud" id="dhAud" aria-label="Para quién" hidden></nav>'
    + '<nav class="dh-jump" id="dhJump" aria-label="Ver el departamento">'
    + '<button type="button" data-view="" aria-pressed="true">Todo</button>'
    + AXES.map(function(a){ return '<button type="button" data-view="' + a[0] + '" aria-pressed="false">' + a[1] + '</button>'; }).join('')
    + '<button type="button" data-view="explorar" aria-pressed="false">Explorar todo</button></nav>';
  if (hero && hero.parentNode) hero.parentNode.insertBefore(bar, hero.nextSibling);
  /* Explorar todo carries the words and the store filter now: the old
     toolbar (a search box over the rails and a wall of store chips) goes,
     as on Ropa Interior. */
  var tb = document.getElementById('toolbar');
  if (tb) tb.setAttribute('data-dh-off', '');
  st.textContent += '#toolbar[data-dh-off]{display:none!important}';

  /* ---------- the axes and Explorar todo, after the department's rails ---------- */
  var main = document.getElementById('rails');
  var wrap = document.createElement('div'); wrap.id = 'dhAxes';
  wrap.innerHTML = AXES.map(function(a){
    return '<section class="dh-sec dh-axis" id="dh-' + a[0] + '" data-axis="' + a[0] + '" aria-label="' + a[1] + '"><h2>' + a[1] + '</h2><p class="dh-tally" hidden></p><div class="dh-rails"></div></section>';
  }).join('')
    + '<section class="dh-sec" id="dh-explorar" aria-label="Explorar todo"><h2>Explorar todo</h2>'
    + '<div class="dh-ex"><input class="dh-q" id="dhQ" type="search" placeholder="Buscar en este departamento…" aria-label="Buscar en Explorar todo" autocomplete="off">'
    + '<div class="dh-sel" role="search">'
    + '<select id="dhT" aria-label="Tipo"></select><select id="dhB" aria-label="Marca"></select><select id="dhR" aria-label="Tienda"></select>'
    + '<select id="dhS" aria-label="Ordenar"><option value="deal">Mayor descuento</option><option value="low">Precio: menor a mayor</option><option value="high">Precio: mayor a menor</option></select>'
    + '</div><p class="dh-count" id="dhCount"></p></div><div class="dh-ex-rail"><div class="rail" id="dhGrid" aria-live="polite"></div></div></section>';
  main.parentNode.insertBefore(wrap, main.nextSibling);

  function api(extra){
    var u = D.endpoint + '?dept=' + encodeURIComponent(D.key);
    var aud = D.audience();
    if (aud) u += '&u=' + encodeURIComponent(aud);
    return u + extra;
  }

  /* ---------- stats chips ---------- */
  var LAST_HEAD = null;
  function paintStats(head){
    var s = head && head.stats;
    var hi = hero && hero.querySelector('.hero-in');
    if (!hi) return;
    var el = document.getElementById('dhStats');
    if (!el){ el = document.createElement('div'); el.className = 'dh-stats'; el.id = 'dhStats'; hi.appendChild(el); }
    if (!s || !s.n){ el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '<span><b>' + num(s.n) + '</b> ' + (s.n === 1 ? 'producto' : 'productos') + '</span>'
      + '<span><b>' + num(s.stores) + '</b> ' + (s.stores === 1 ? 'tienda' : 'tiendas') + '</span>'
      + (s.sale ? '<span><b>' + num(s.sale) + '</b> en oferta</span>' : '');
  }

  /* ---------- the audience switch ---------- */
  function paintAud(){
    var nav = document.getElementById('dhAud');
    if (!AUD || AUD.length < 2){ nav.hidden = true; return; }
    var cur = D.audience();
    nav.innerHTML = '<button type="button" data-u="" aria-pressed="' + (!cur) + '">Todo</button>'
      + AUD.map(function(o){ return '<button type="button" data-u="' + esc(o.k) + '" aria-pressed="' + (cur === o.k) + '">' + esc(o.label) + '<small>' + num(o.n) + '</small></button>'; }).join('');
    nav.hidden = false;
  }
  document.getElementById('dhAud').addEventListener('click', function(e){
    var b = e.target.closest('button[data-u]');
    if (!b || b.getAttribute('data-u') === D.audience()) return;
    D.setAudience(b.getAttribute('data-u'));
    paintAud();
  });

  /* ---------- the axes: big-card rails, fetched as they near the screen ---------- */
  var AXIS_SEQ = 0;
  /* An axis carousel's «Ver todo» opens its own railed view: that type,
     brand or store on the department page (?ver=: Ofertas, then one
     carousel per store -- or, for one store, per type). */
  function axisDoor(r){
    var u = 'departamento.html?dept=' + encodeURIComponent(D.key);
    if (r.f === 't') u += '&t=' + encodeURIComponent(r.k) + '&ver=tipos';
    else if (r.f === 'b') u += '&b=' + encodeURIComponent(r.k) + '&ver=todo';
    else u += '&ver=todo&tienda=' + encodeURIComponent(r.k);
    var aud = D.audience();
    return u + (aud ? '&para=' + encodeURIComponent(aud) : '');
  }
  function railHTML(r){
    var big = r.count > (r.cards || []).length, href = esc(axisDoor(r));
    var more = big ? '<a class="ver-todo" href="' + href + '">Ver todo &#8594;</a>' : '';
    return '<section class="rail-sec" aria-label="' + esc(r.title) + '"><div class="rail-head"><h2>' + esc(r.title) + '</h2>'
      + '<span class="rail-count">' + num(r.count) + '</span>' + more + '</div>'
      + '<div class="rail">' + (r.cards || []).map(D.cardHTML).join('')
      + (big ? '<a class="rail-next" href="' + href + '">Ver todo<span>' + num(r.count) + ' productos</span></a>' : '') + '</div></section>';
  }
  var TALLY = { tipo: ['tipo', 'tipos'], marca: ['marca', 'marcas'], tienda: ['tienda', 'tiendas'] };
  function loadAxis(sec, done){
    done = done || function(){};
    if (sec.getAttribute('data-for') === String(D.audience())){ if (!sec.querySelector('.dh-note')) done(); else sec._dhDone = done; return; }
    sec.setAttribute('data-for', String(D.audience()));
    var box = sec.querySelector('.dh-rails'), seq = AXIS_SEQ, tally = sec.querySelector('.dh-tally');
    sec._dhDone = done;
    box.innerHTML = '<p class="dh-note">Cargando…</p>';
    function finish(){ var f = sec._dhDone; sec._dhDone = null; if (f) f(); }
    D.getJSON(api('&axis=' + sec.getAttribute('data-axis'))).then(function(data){
      if (seq !== AXIS_SEQ) return;
      var rails = (data && data.rails) || [];
      if (!rails.length){ sec.hidden = true; markJump(); finish(); if (VIEW === sec.getAttribute('data-axis')) setView(''); return; }
      sec.hidden = false; markJump();
      var w = TALLY[sec.getAttribute('data-axis')];
      if (tally && w){ tally.textContent = num(rails.length) + ' ' + (rails.length === 1 ? w[0] : w[1]); tally.hidden = false; }
      box.innerHTML = rails.map(railHTML).join('');
      D.watchPhotos(box);
      finish();
    }).catch(function(){
      if (seq !== AXIS_SEQ) return;
      sec.removeAttribute('data-for');
      box.innerHTML = '<p class="dh-note">No pudimos cargar esta sección. <button type="button" class="btn dh-retry">Reintentar</button></p>';
      finish();
    });
  }
  function markJump(){
    var j = document.getElementById('dhJump');
    AXES.forEach(function(a){
      var b = j.querySelector('button[data-view="' + a[0] + '"]'), sec = document.getElementById('dh-' + a[0]);
      if (b && sec) b.hidden = sec.hidden;
    });
  }
  wrap.addEventListener('click', function(e){
    var r = e.target.closest('.dh-retry');
    if (r){ var sec = r.closest('.dh-axis'); if (sec) loadAxis(sec); return; }
    if (e.target.closest('#dhMoreBtn')) runExplore(EX.page + 1);
  });
  var IO = typeof IntersectionObserver === 'function' ? new IntersectionObserver(function(es){
    es.forEach(function(e){
      if (!e.isIntersecting) return;
      if (e.target.id === 'dh-explorar') { if (EX.drawnFor !== String(D.audience())) runExplore(0); }
      else loadAxis(e.target);
    });
  }, { rootMargin: '900px 0px' }) : null;
  /* ---------- the view switch (#443 c.6635829511) ----------
     A view replaces what is under the bar: the department's carousels
     (and a hub pill's lens) step aside, the chosen section shows alone,
     loaded at once, from its start. The scroll stays where the shopper
     had it (D.keepPlace holds the page's height while it loads). */
  var VIEW = '';
  function setView(v){
    if (v === VIEW) v = '';
    D.closeLens();
    var release = D.keepPlace(bar);
    VIEW = v;
    var root = document.documentElement;
    if (v) root.setAttribute('data-dview', v); else root.removeAttribute('data-dview');
    Array.prototype.forEach.call(document.querySelectorAll('#dhJump button[data-view]'), function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === v)); });
    Array.prototype.forEach.call(wrap.querySelectorAll('.dh-sec'), function(sec){ sec.classList.toggle('dh-on', !!v && sec.id === 'dh-' + v); });
    if (!v){ release(); return; }
    var sec = document.getElementById('dh-' + v);
    if (sec && sec.classList.contains('dh-axis')) loadAxis(sec, release);
    else if (EX.drawnFor !== String(D.audience())) runExplore(0, release);
    else release();
  }
  document.getElementById('dhJump').addEventListener('click', function(e){
    var b = e.target.closest('button[data-view]');
    if (b) setView(b.getAttribute('data-view'));
  });
  /* A hub pill (a filter) is the page now: the view switch goes back to «Todo». */
  if (D.onLens) D.onLens(function(l){
    if (l && VIEW){ VIEW = ''; document.documentElement.removeAttribute('data-dview'); Array.prototype.forEach.call(document.querySelectorAll('#dhJump button[data-view]'), function(b){ b.setAttribute('aria-pressed', String(!b.getAttribute('data-view'))); }); wrap.querySelectorAll('.dh-on').forEach(function(x){ x.classList.remove('dh-on'); }); }
    /* The hero's counts are the lens's own while it is open. */
    if (l && l.stats) paintStats({ stats: l.stats });
    else if (!l) paintStats(LAST_HEAD);
  });

  /* ---------- Explorar todo ---------- */
  var EX = { t: '', b: '', r: '', q: '', s: 'deal', page: 0, drawnFor: null, seq: 0 };
  var qEl = document.getElementById('dhQ'), tEl = document.getElementById('dhT'), bEl = document.getElementById('dhB'),
      rEl = document.getElementById('dhR'), sEl = document.getElementById('dhS'), grid = document.getElementById('dhGrid'),
      countEl = document.getElementById('dhCount');
  function options(sel, all, list, cur){
    var h = '<option value="">' + all + '</option>', seen = false;
    (list || []).forEach(function(o){
      if (o[0] === cur) seen = true;
      h += '<option value="' + esc(o[0]) + '"' + (o[0] === cur ? ' selected' : '') + '>' + esc(o[1]) + ' (' + num(o[2]) + ')</option>';
    });
    /* A choice the other filters emptied stays visible, at zero. */
    if (cur && !seen) h += '<option value="' + esc(cur) + '" selected>' + esc(cur) + ' (0)</option>';
    sel.innerHTML = h;
  }
  function runExplore(page, done){
    var seq = ++EX.seq;
    var fin = function(){ var f = done; done = null; if (f) f(); };
    EX.page = page;
    EX.drawnFor = String(D.audience());
    var u = api('&explore=1' + (EX.t ? '&t=' + encodeURIComponent(EX.t) : '') + (EX.b ? '&b=' + encodeURIComponent(EX.b) : '')
      + (EX.r ? '&r=' + encodeURIComponent(EX.r) : '') + (EX.q ? '&q=' + encodeURIComponent(EX.q) : '')
      + (EX.s !== 'deal' ? '&sort=' + EX.s : '') + (page ? '&page=' + page : ''));
    if (!page) countEl.textContent = 'Cargando…';
    var old = document.getElementById('dhMoreBtn');
    if (old) old.disabled = true;
    D.getJSON(u).then(function(data){
      if (seq !== EX.seq) return;
      var f = data.facets || {};
      options(tEl, 'Todos los tipos', f.t, EX.t);
      options(bEl, 'Todas las marcas', f.b, EX.b);
      options(rEl, 'Todas las tiendas', f.r, EX.r);
      sEl.value = EX.s;
      var html = (data.cards || []).map(D.cardHTML).join('');
      var btn = document.getElementById('dhMoreBtn');
      if (btn) btn.remove();
      var before = grid.querySelectorAll('.card').length;
      if (page) grid.insertAdjacentHTML('beforeend', html); else grid.innerHTML = html;
      countEl.textContent = data.count ? num(data.count) + (data.count === 1 ? ' producto' : ' productos') : '';
      if (!data.count) grid.innerHTML = '<p class="dh-empty">Ningún producto coincide. Quita un filtro o prueba otra palabra.</p>';
      /* The carousel's last card brings the next 48 into it. */
      if (data.pages > page + 1){
        var shown = grid.querySelectorAll('.card').length;
        grid.insertAdjacentHTML('beforeend', '<button type="button" class="rail-next" id="dhMoreBtn">Ver más<span>' + num(data.count - shown) + ' más</span></button>');
      }
      if (page){ var first = grid.querySelectorAll('.card')[before]; if (first && grid.scrollTo) grid.scrollTo({ left: Math.max(0, first.offsetLeft - grid.offsetLeft - 8), behavior: 'smooth' }); }
      else if (grid.scrollTo) grid.scrollTo({ left: 0 });
      D.watchPhotos(grid);
      fin();
    }).catch(function(){
      if (seq !== EX.seq) return;
      countEl.textContent = 'No pudimos cargar los productos. Revisa tu conexión e inténtalo de nuevo.';
      fin();
    });
  }
  tEl.addEventListener('change', function(){ EX.t = tEl.value; runExplore(0); });
  bEl.addEventListener('change', function(){ EX.b = bEl.value; runExplore(0); });
  rEl.addEventListener('change', function(){ EX.r = rEl.value; runExplore(0); });
  sEl.addEventListener('change', function(){ EX.s = sEl.value; runExplore(0); });
  var qTimer = null;
  qEl.addEventListener('input', function(){
    clearTimeout(qTimer);
    qTimer = setTimeout(function(){ var v = qEl.value.trim().slice(0, 80); if (v !== EX.q){ EX.q = v; runExplore(0); } }, 350);
  });

  /* ---------- every head the page draws ---------- */
  D.onHead(function(head, filtered){
    if (head && head.aud && !AUD) AUD = head.aud;
    if (!AUD && !filtered && head && !head.aud) AUD = [];
    if (AUD === null){
      /* Opened already filtered: the switch comes from the static head. */
      AUD = [];
      D.getJSON(D.slices + 'head.json').then(function(full){ AUD = full.aud || []; paintAud(); }).catch(function(){});
    }
    LAST_HEAD = head;
    if (!(D.lensActive && D.lensActive())) paintStats(head);
    paintAud();
    /* A new audience redraws the axes and Explorar todo for it. */
    var cur = String(D.audience());
    if (LAST_U !== cur){
      LAST_U = cur; AXIS_SEQ++;
      Array.prototype.forEach.call(wrap.querySelectorAll('.dh-axis'), function(sec){
        sec.removeAttribute('data-for'); sec.hidden = false;
        if (VIEW === sec.getAttribute('data-axis')) loadAxis(sec);
        else if (IO) { IO.unobserve(sec); IO.observe(sec); } else loadAxis(sec);
      });
      markJump();
      var ex = document.getElementById('dh-explorar');
      EX.drawnFor = null;
      if (VIEW === 'explorar') runExplore(0);
      else if (IO){ IO.unobserve(ex); IO.observe(ex); } else runExplore(0);
    }
  });
})();

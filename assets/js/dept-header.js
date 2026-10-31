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
     - the jump bar: Por tipo / Por marca / Por tienda / Explorar todo;
     - the three axes, big-card rails per type, brand and store
       (/.netlify/functions/department?axis=...), fetched as they near
       the screen;
     - Explorar todo: words plus Tipo / Marca / Tienda / Ordenar, the
       options of each filter narrowed by the others (cross-dependent,
       answered on the server: ?explore=1), 48 cards at a time.
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
    + '.dh-jump a{flex:0 0 auto;height:40px;padding:0 18px;border-radius:999px;border:1px solid #E4E6EC;background:#fff;color:#0A1F44;font-size:14px;font-weight:800;line-height:38px;text-decoration:none;white-space:nowrap}'
    + '.dh-sec{max-width:1240px;margin:0 auto;padding:22px 0 6px;scroll-margin-top:12px}'
    + '.dh-sec > h2{margin:0 20px 2px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#6B7487}'
    + '.dh-sec .dh-note{margin:6px 20px 0;color:#6B7487;font-size:14px}'
    + '.dh-ex{padding:0 20px}'
    + '.dh-ex .dh-q{width:100%;height:46px;border:1px solid #E4E6EC;border-radius:12px;padding:0 14px;font:500 15px inherit;font-family:inherit;color:#0A1F44;background:#fff;box-sizing:border-box;margin-top:12px}'
    + '.dh-sel{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}'
    + '@media(min-width:640px){.dh-sel{grid-template-columns:repeat(4,minmax(0,1fr))}}'
    + '.dh-sel select{width:100%;height:44px;border:1px solid #E4E6EC;border-radius:12px;padding:0 10px;font:700 14px inherit;font-family:inherit;color:#0A1F44;background:#fff;min-width:0}'
    + '.dh-count{margin:12px 0 10px;color:#6B7487;font-size:14px;font-weight:600}'
    + '.dh-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start}'
    + '@media(min-width:640px){.dh-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}'
    + '@media(min-width:1024px){.dh-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}'
    + '.dh-grid .card{flex:none;min-width:0}'
    + '.dh-more{text-align:center;padding:16px 0 30px}'
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
    + '<nav class="dh-jump" id="dhJump" aria-label="Secciones">'
    + AXES.map(function(a){ return '<a href="#dh-' + a[0] + '">' + a[1] + '</a>'; }).join('')
    + '<a href="#dh-explorar">Explorar todo</a></nav>';
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
    return '<section class="dh-sec dh-axis" id="dh-' + a[0] + '" data-axis="' + a[0] + '" aria-label="' + a[1] + '"><h2>' + a[1] + '</h2><div class="dh-rails"></div></section>';
  }).join('')
    + '<section class="dh-sec" id="dh-explorar" aria-label="Explorar todo"><h2>Explorar todo</h2>'
    + '<div class="dh-ex"><input class="dh-q" id="dhQ" type="search" placeholder="Buscar en este departamento…" aria-label="Buscar en Explorar todo" autocomplete="off">'
    + '<div class="dh-sel" role="search">'
    + '<select id="dhT" aria-label="Tipo"></select><select id="dhB" aria-label="Marca"></select><select id="dhR" aria-label="Tienda"></select>'
    + '<select id="dhS" aria-label="Ordenar"><option value="deal">Mayor descuento</option><option value="low">Precio: menor a mayor</option><option value="high">Precio: mayor a menor</option></select>'
    + '</div><p class="dh-count" id="dhCount"></p><div class="dh-grid" id="dhGrid" aria-live="polite"></div>'
    + '<div class="dh-more" id="dhMore" hidden><button class="btn" type="button" id="dhMoreBtn">Ver más</button></div></div></section>';
  main.parentNode.insertBefore(wrap, main.nextSibling);

  function api(extra){
    var u = D.endpoint + '?dept=' + encodeURIComponent(D.key);
    var aud = D.audience();
    if (aud) u += '&u=' + encodeURIComponent(aud);
    return u + extra;
  }

  /* ---------- stats chips ---------- */
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
  function railHTML(r){
    var more = r.count > (r.cards || []).length
      ? '<button type="button" class="ver-todo dh-open" data-f="' + esc(r.f) + '" data-k="' + esc(r.k) + '">Ver todo &#8594;</button>' : '';
    return '<section class="rail-sec" aria-label="' + esc(r.title) + '"><div class="rail-head"><h2>' + esc(r.title) + '</h2>'
      + '<span class="rail-count">' + num(r.count) + '</span>' + more + '</div>'
      + '<div class="rail">' + (r.cards || []).map(D.cardHTML).join('') + '</div></section>';
  }
  function loadAxis(sec){
    if (sec.getAttribute('data-for') === String(D.audience()) ) return;
    sec.setAttribute('data-for', String(D.audience()));
    var box = sec.querySelector('.dh-rails'), seq = AXIS_SEQ;
    box.innerHTML = '<p class="dh-note">Cargando…</p>';
    D.getJSON(api('&axis=' + sec.getAttribute('data-axis'))).then(function(data){
      if (seq !== AXIS_SEQ) return;
      var rails = (data && data.rails) || [];
      if (!rails.length){ sec.hidden = true; markJump(); return; }
      sec.hidden = false; markJump();
      box.innerHTML = rails.map(railHTML).join('');
      D.watchPhotos(box);
    }).catch(function(){
      if (seq !== AXIS_SEQ) return;
      sec.removeAttribute('data-for');
      box.innerHTML = '<p class="dh-note">No pudimos cargar esta sección. <button type="button" class="btn dh-retry">Reintentar</button></p>';
    });
  }
  function markJump(){
    var j = document.getElementById('dhJump');
    AXES.forEach(function(a){
      var link = j.querySelector('a[href="#dh-' + a[0] + '"]'), sec = document.getElementById('dh-' + a[0]);
      if (link && sec) link.hidden = sec.hidden;
    });
  }
  wrap.addEventListener('click', function(e){
    var r = e.target.closest('.dh-retry');
    if (r){ var sec = r.closest('.dh-axis'); if (sec) loadAxis(sec); return; }
    var o = e.target.closest('.dh-open');
    if (!o) return;
    /* An axis rail's Ver todo opens Explorar todo on that type, brand or store. */
    EX.t = ''; EX.b = ''; EX.r = '';
    EX[o.getAttribute('data-f')] = o.getAttribute('data-k');
    document.getElementById('dh-explorar').scrollIntoView({ block: 'start' });
    runExplore(0);
  });
  var IO = typeof IntersectionObserver === 'function' ? new IntersectionObserver(function(es){
    es.forEach(function(e){
      if (!e.isIntersecting) return;
      if (e.target.id === 'dh-explorar') { if (EX.drawnFor !== String(D.audience())) runExplore(0); }
      else loadAxis(e.target);
    });
  }, { rootMargin: '900px 0px' }) : null;
  /* A jump link loads its section at once (it may be far below). */
  document.getElementById('dhJump').addEventListener('click', function(e){
    var a = e.target.closest('a[href^="#dh-"]');
    if (!a) return;
    var sec = document.getElementById(a.getAttribute('href').slice(1));
    if (!sec) return;
    if (sec.classList.contains('dh-axis')) loadAxis(sec);
    else if (EX.drawnFor !== String(D.audience())) runExplore(0);
  });

  /* ---------- Explorar todo ---------- */
  var EX = { t: '', b: '', r: '', q: '', s: 'deal', page: 0, drawnFor: null, seq: 0 };
  var qEl = document.getElementById('dhQ'), tEl = document.getElementById('dhT'), bEl = document.getElementById('dhB'),
      rEl = document.getElementById('dhR'), sEl = document.getElementById('dhS'), grid = document.getElementById('dhGrid'),
      countEl = document.getElementById('dhCount'), moreEl = document.getElementById('dhMore');
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
  function runExplore(page){
    var seq = ++EX.seq;
    EX.page = page;
    EX.drawnFor = String(D.audience());
    var u = api('&explore=1' + (EX.t ? '&t=' + encodeURIComponent(EX.t) : '') + (EX.b ? '&b=' + encodeURIComponent(EX.b) : '')
      + (EX.r ? '&r=' + encodeURIComponent(EX.r) : '') + (EX.q ? '&q=' + encodeURIComponent(EX.q) : '')
      + (EX.s !== 'deal' ? '&sort=' + EX.s : '') + (page ? '&page=' + page : ''));
    if (!page){ countEl.textContent = 'Cargando…'; moreEl.hidden = true; }
    D.getJSON(u).then(function(data){
      if (seq !== EX.seq) return;
      var f = data.facets || {};
      options(tEl, 'Todos los tipos', f.t, EX.t);
      options(bEl, 'Todas las marcas', f.b, EX.b);
      options(rEl, 'Todas las tiendas', f.r, EX.r);
      sEl.value = EX.s;
      var html = (data.cards || []).map(D.cardHTML).join('');
      if (page) grid.insertAdjacentHTML('beforeend', html); else grid.innerHTML = html;
      countEl.textContent = data.count ? num(data.count) + (data.count === 1 ? ' producto' : ' productos') : '';
      if (!data.count) grid.innerHTML = '<p class="dh-empty">Ningún producto coincide. Quita un filtro o prueba otra palabra.</p>';
      moreEl.hidden = !(data.pages > page + 1);
      D.watchPhotos(grid);
    }).catch(function(){
      if (seq !== EX.seq) return;
      countEl.textContent = 'No pudimos cargar los productos. Revisa tu conexión e inténtalo de nuevo.';
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
  document.getElementById('dhMoreBtn').addEventListener('click', function(){ runExplore(EX.page + 1); });

  /* ---------- every head the page draws ---------- */
  D.onHead(function(head, filtered){
    if (head && head.aud && !AUD) AUD = head.aud;
    if (!AUD && !filtered && head && !head.aud) AUD = [];
    if (AUD === null){
      /* Opened already filtered: the switch comes from the static head. */
      AUD = [];
      D.getJSON(D.slices + 'head.json').then(function(full){ AUD = full.aud || []; paintAud(); }).catch(function(){});
    }
    paintStats(head);
    paintAud();
    /* A new audience redraws the axes and Explorar todo for it. */
    var cur = String(D.audience());
    if (LAST_U !== cur){
      LAST_U = cur; AXIS_SEQ++;
      Array.prototype.forEach.call(wrap.querySelectorAll('.dh-axis'), function(sec){
        sec.removeAttribute('data-for'); sec.hidden = false;
        if (IO) { IO.unobserve(sec); IO.observe(sec); } else loadAxis(sec);
      });
      markJump();
      var ex = document.getElementById('dh-explorar');
      EX.drawnFor = null;
      if (IO){ IO.unobserve(ex); IO.observe(ex); } else runExplore(0);
    }
  });
})();

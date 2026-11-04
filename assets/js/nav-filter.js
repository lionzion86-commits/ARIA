/* ==================================================================
   THE CATEGORY PAGE THE HEADER OPENS (#443 c.6616347095, the Nordstrom
   pattern): departamento.html?dept=<key>&nav=1[&u=][&t=][&s=][&b=]
   [&z=][&p=][&o=1][&sort=].

     - the type pills: the type's own styles (Todas las botas · Chelsea
       · Caña alta · Botines ...) or, for a type without styles, its
       sibling types; one tap re-renders in place;
     - the filter bar, dropdown buttons only: Filtrar · Ordenar · Marca ·
       Talla · Precio. Each opens a small panel (sizes as chips, brands
       as a short list); never a checkbox wall;
     - every selection stacks (audience x type x brand x size x price x
       Ofertas) and shows as a removable chip («Marca: UGG ×»);
     - each option is counted under all the other selections, on the
       server (/.netlify/functions/nav-filter), and only options with
       products are offered: no zero-result path;
     - the state is the URL (shareable; back / forward walk it);
     - the results are one carousel, 48 cards at a time brought into it
       by its last card -- never a side-by-side grid.
   It reads the page through window.AriaDept (departamento.html).
   ================================================================== */
(function(){
  'use strict';
  var D = window.AriaDept;
  var sp0 = new URLSearchParams(location.search);
  if (!D || sp0.get('nav') !== '1') return;
  document.documentElement.classList.add('nf-on');

  var KEYS = ['u', 't', 's', 'b', 'z', 'p', 'o', 'sort'];
  var AUD = { women: 'Mujer', men: 'Hombre', kids: 'Niños' };
  var SORTS = [['deal', 'Mayor descuento'], ['low', 'Precio: menor a mayor'], ['high', 'Precio: mayor a menor']];
  var ENDPOINT = '/.netlify/functions/nav-filter';

  var CSS = ''
    + 'html.nf-on #salesTop,html.nf-on #perfumeHouses,html.nf-on #scopeBar,html.nf-on #pDoors,html.nf-on #pBrands,html.nf-on #hubPills,html.nf-on #toolbar,'
    + 'html.nf-on #loadingState,html.nf-on #emptyState,html.nf-on #lens,html.nf-on #perfumesLead,html.nf-on #rails,html.nf-on #dhBar,html.nf-on #dhAxes,html.nf-on #dhStats{display:none!important}'
    + '.nf{max-width:1240px;margin:0 auto;padding:14px 0 8px}'
    + '.nf-pills{display:flex;gap:8px;overflow-x:auto;padding:0 20px 2px;scrollbar-width:none;-webkit-overflow-scrolling:touch}'
    + '.nf-pills::-webkit-scrollbar{display:none}'
    + '.nf-pill{flex:0 0 auto;height:42px;padding:0 18px;border-radius:999px;border:1px solid #E4E6EC;background:#fff;color:#0A1F44;font:800 14px/1 inherit;font-family:inherit;cursor:pointer;white-space:nowrap}'
    + '.nf-pill small{font-weight:600;color:#6B7487;margin-left:6px;font-size:12px}'
    + '.nf-pill[aria-pressed="true"]{background:#0A1F44;color:#fff;border-color:#0A1F44}'
    + '.nf-pill[aria-pressed="true"] small{color:#C9D2E6}'
    + '.nf-bar{position:relative;display:flex;gap:8px;flex-wrap:wrap;padding:12px 20px 0}'
    + '.nf-dd{position:relative}'
    + '.nf-btn{height:40px;padding:0 14px;border-radius:10px;border:1px solid #D9E0EB;background:#fff;color:#0A1F44;font:800 14px/1 inherit;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}'
    + '.nf-btn[aria-expanded="true"],.nf-btn.has{border-color:#0A1F44;box-shadow:inset 0 0 0 1px #0A1F44}'
    + '.nf-btn svg{flex:0 0 auto}'
    + '.nf-pan{position:absolute;top:46px;left:0;z-index:40;width:300px;max-width:calc(100vw - 32px);max-height:380px;overflow-y:auto;background:#fff;border:1px solid #E4E6EC;border-radius:14px;box-shadow:0 16px 36px rgba(10,31,68,.18);padding:12px;box-sizing:border-box}'
    + '.nf-pan h4{margin:6px 0 8px;font-size:11.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#6B7487}'
    + '.nf-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px}'
    + '.nf-chip{height:38px;min-width:44px;padding:0 12px;border-radius:999px;border:1px solid #D9E0EB;background:#fff;color:#0A1F44;font:700 13.5px/1 inherit;font-family:inherit;cursor:pointer;white-space:nowrap}'
    + '.nf-chip small{font-weight:600;color:#6B7487;margin-left:4px;font-size:11.5px}'
    + '.nf-chip[aria-pressed="true"]{background:#0A1F44;color:#fff;border-color:#0A1F44}'
    + '.nf-chip[aria-pressed="true"] small{color:#C9D2E6}'
    + '.nf-list{list-style:none;margin:0;padding:0}'
    + '.nf-list button{display:flex;width:100%;align-items:center;justify-content:space-between;gap:10px;min-height:42px;padding:0 10px;border:0;border-radius:10px;background:none;color:#0A1F44;font:700 14px/1.2 inherit;font-family:inherit;cursor:pointer;text-align:left}'
    + '.nf-list button:hover{background:#F3F5F9}'
    + '.nf-list button[aria-pressed="true"]{background:#0A1F44;color:#fff}'
    + '.nf-list small{font-weight:600;color:#6B7487;font-size:12px}'
    + '.nf-list button[aria-pressed="true"] small{color:#C9D2E6}'
    + '.nf-sel{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 20px 0}'
    + '.nf-x{height:34px;padding:0 8px 0 12px;border-radius:999px;border:0;background:#EAF0FA;color:#0A1F44;font:700 13px/1 inherit;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px}'
    + '.nf-x svg{opacity:.7}'
    + '.nf-clear{border:0;background:none;color:#2456A0;font:800 13px/1 inherit;font-family:inherit;cursor:pointer;padding:8px 4px}'
    + '.nf-count{margin:12px 20px 0;color:#6B7487;font-size:14px;font-weight:600}'
    + '.nf-msg{padding:16px 20px;color:#6B7487;font-size:14px}'
    + '@media (max-width:639.98px){.nf-bar{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.nf-bar::-webkit-scrollbar{display:none}.nf-dd{position:static}'
    +   '.nf-pan{position:fixed;left:0;right:0;bottom:0;top:auto;width:auto;max-width:none;max-height:70vh;border-radius:18px 18px 0 0;padding:16px 16px 22px}}'
    + '.nf-scrim{position:fixed;inset:0;z-index:39;background:transparent}'
    + '@media (max-width:639.98px){.nf-scrim{background:rgba(10,31,68,.35)}}';
  var st = document.createElement('style'); st.id = 'nf-css'; st.textContent = CSS; document.head.appendChild(st);

  var esc = D.esc, num = function(n){ return Number(n || 0).toLocaleString('es-PE'); };
  var CARET = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  var XI = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  var hero = document.getElementById('deptHero');
  var box = document.createElement('section'); box.className = 'nf'; box.id = 'nf'; box.setAttribute('aria-label', 'Filtros y resultados');
  box.innerHTML = '<nav class="nf-pills" id="nfPills" aria-label="Tipos"></nav>'
    + '<div class="nf-bar" id="nfBar" role="toolbar" aria-label="Filtros">'
    + [['f', 'Filtrar'], ['sort', 'Ordenar'], ['b', 'Marca'], ['z', 'Talla'], ['p', 'Precio']].map(function(x){
        return '<div class="nf-dd" data-dd="' + x[0] + '"><button type="button" class="nf-btn" data-nf-btn="' + x[0] + '" aria-expanded="false" aria-haspopup="true">' + x[1] + CARET + '</button></div>';
      }).join('')
    + '</div><div class="nf-sel" id="nfSel" aria-label="Filtros aplicados"></div>'
    + '<p class="nf-count" id="nfCount">Cargando…</p>'
    + '<section class="rail-sec" id="nfRes" aria-live="polite"><div class="rail-head"><h2 id="nfTitle"></h2><span class="rail-count" id="nfN"></span></div><div class="rail" id="nfRail"></div></section>';
  if (hero && hero.parentNode) hero.parentNode.insertBefore(box, hero.nextSibling);
  var pillsEl = document.getElementById('nfPills'), barEl = document.getElementById('nfBar'), selEl = document.getElementById('nfSel'),
      countEl = document.getElementById('nfCount'), railEl = document.getElementById('nfRail'), titleEl = document.getElementById('nfTitle'), nEl = document.getElementById('nfN');

  var S = read(), DATA = null, SEQ = 0, PAGE = 0, FX = 0;
  function read(){
    var sp = new URLSearchParams(location.search), s = {};
    KEYS.forEach(function(k){ s[k] = (sp.get(k) || '').trim(); });
    if (!AUD[s.u]) s.u = '';
    if (s.o !== '1') s.o = '';
    if (!SORTS.some(function(x){ return x[0] === s.sort; })) s.sort = '';
    return s;
  }
  function urlOf(s){
    var u = new URL(location.href);
    KEYS.forEach(function(k){ if (s[k]) u.searchParams.set(k, s[k]); else u.searchParams.delete(k); });
    u.searchParams.delete('para');
    return u.pathname + u.search + u.hash;
  }
  function set(patch){
    var n = {}; KEYS.forEach(function(k){ n[k] = S[k]; });
    for (var k in patch) n[k] = patch[k];
    if (patch.t !== undefined && patch.s === undefined) n.s = '';
    S = n;
    try { history.pushState({ nf: 1 }, '', urlOf(S)); } catch(e){}
    run(0);
  }
  window.addEventListener('popstate', function(){ S = read(); run(0); });

  function getFx(){
    try { var c = JSON.parse(localStorage.getItem('aria_fx_rate_v1') || 'null'); if (c && typeof c.venta === 'number' && c.venta > 0) return Promise.resolve(c.venta); } catch(e){}
    return fetch('/.netlify/functions/exchange-rate').then(function(r){ return r.json(); }).then(function(d){ return d && d.venta > 0 ? d.venta : 0; }).catch(function(){ return 0; });
  }

  function api(page){
    var q = '?dept=' + encodeURIComponent(D.key);
    KEYS.forEach(function(k){ if (S[k]) q += '&' + k + '=' + encodeURIComponent(S[k]); });
    if (FX) q += '&fx=' + FX.toFixed(2);
    if (page) q += '&page=' + page;
    /* The vehicle (Año / Marca del vehículo / Modelo): assets/js/vehicle-fit.js. */
    if (window.AriaVehicle) q += window.AriaVehicle.query();
    return ENDPOINT + q;
  }
  function run(page){
    var seq = ++SEQ; PAGE = page;
    if (!page) countEl.textContent = 'Cargando…';
    closeDD();
    D.getJSON(api(page)).then(function(d){
      if (seq !== SEQ) return;
      DATA = d;
      paint(page);
    }).catch(function(){
      if (seq !== SEQ) return;
      countEl.textContent = 'No pudimos cargar los productos. Revisa tu conexión e inténtalo de nuevo.';
    });
  }

  function labelOf(list, k){ var m = (list || []).filter(function(x){ return x[0] === k; })[0]; return m ? m[1] : k; }
  function title(){
    var f = DATA.facets, parts = [];
    if (S.s && DATA.sl) parts.push(DATA.sl); else if (S.t && DATA.tl) parts.push(DATA.tl);
    if (!parts.length) parts.push(document.getElementById('heroTitle') && D.key ? deptName() : 'Todo');
    if (S.u) parts.push(AUD[S.u]);
    return parts.join(' · ');
  }
  var DEPT_NAME = '';
  function deptName(){
    if (!DEPT_NAME){ var h = document.getElementById('heroTitle'); DEPT_NAME = h && h.textContent && h.textContent !== 'Cargando…' ? h.textContent : 'Todo'; }
    return DEPT_NAME;
  }

  function paint(page){
    var f = DATA.facets || {};
    /* The pills: the type's styles, or its sibling types. */
    var ph = '';
    if (S.t && f.s && f.s.length){
      var all = 0; (f.t || []).forEach(function(x){ if (x[0] === S.t) all = x[2]; });
      ph = '<button type="button" class="nf-pill" data-nf-s="" aria-pressed="' + (!S.s) + '">' + esc(DATA.sAll || 'Todo') + '<small>' + num(all) + '</small></button>'
        + f.s.map(function(x){ return '<button type="button" class="nf-pill" data-nf-s="' + esc(x[0]) + '" aria-pressed="' + (S.s === x[0]) + '">' + esc(x[1]) + '<small>' + num(x[2]) + '</small></button>'; }).join('');
    } else if ((f.t || []).length > 1 || S.t){
      var tot = (f.t || []).reduce(function(s, x){ return s + x[2]; }, 0);
      ph = '<button type="button" class="nf-pill" data-nf-t="" aria-pressed="' + (!S.t) + '">Todo<small>' + num(tot) + '</small></button>'
        + (f.t || []).map(function(x){ return '<button type="button" class="nf-pill" data-nf-t="' + esc(x[0]) + '" aria-pressed="' + (S.t === x[0]) + '">' + esc(x[1]) + '<small>' + num(x[2]) + '</small></button>'; }).join('');
    }
    pillsEl.innerHTML = ph; pillsEl.hidden = !ph;

    /* The buttons: a selection marks its button; a facet with nothing to offer hides. */
    var has = { f: !!(S.u || S.o || (S.t && !(f.s && f.s.length))), sort: !!S.sort, b: !!S.b, z: !!S.z, p: !!S.p };
    var any = { f: (f.u || []).length > 1 || (f.o || []).length || (f.t || []).length > 1, sort: true, b: (f.b || []).length > 0, z: (f.z || []).length > 0, p: (f.p || []).length > 0 };
    Array.prototype.forEach.call(barEl.querySelectorAll('.nf-btn'), function(b){
      var k = b.getAttribute('data-nf-btn');
      b.classList.toggle('has', has[k]);
      b.parentNode.hidden = !(any[k] || has[k]);
    });

    /* The chips of what is applied. */
    var chips = [];
    if (S.u) chips.push(['u', AUD[S.u]]);
    if (S.t && !(f.s && f.s.length)) chips.push(['t', 'Tipo: ' + (DATA.tl || labelOf(f.t, S.t))]);
    if (S.s) chips.push(['s', 'Estilo: ' + (DATA.sl || S.s)]);
    if (S.b) chips.push(['b', 'Marca: ' + labelOf(f.b, S.b)]);
    if (S.z) chips.push(['z', 'Talla: ' + S.z]);
    if (S.p) chips.push(['p', 'Precio: ' + labelOf(f.p, S.p)]);
    if (S.o) chips.push(['o', 'Ofertas']);
    selEl.innerHTML = chips.map(function(c){ return '<button type="button" class="nf-x" data-nf-x="' + c[0] + '" aria-label="Quitar ' + esc(c[1]) + '">' + esc(c[1]) + XI + '</button>'; }).join('')
      + (chips.length > 1 ? '<button type="button" class="nf-clear" data-nf-clear>Limpiar todo</button>' : '');
    selEl.hidden = !chips.length;

    countEl.textContent = DATA.count ? num(DATA.count) + (DATA.count === 1 ? ' producto' : ' productos') : '';
    titleEl.textContent = title();
    nEl.textContent = DATA.count ? num(DATA.count) : '';
    var html = (DATA.cards || []).map(D.cardHTML).join('');
    var more = document.getElementById('nfMore'); if (more) more.remove();
    var before = railEl.querySelectorAll('.card').length;
    if (page) railEl.insertAdjacentHTML('beforeend', html); else railEl.innerHTML = html;
    if (!DATA.count) railEl.innerHTML = '<p class="nf-msg">Ningún producto coincide. Quita un filtro.</p>';
    if (DATA.pages > page + 1){
      var shown = railEl.querySelectorAll('.card').length;
      railEl.insertAdjacentHTML('beforeend', '<button type="button" class="rail-next" id="nfMore">Ver más<span>' + num(DATA.count - shown) + ' más</span></button>');
    }
    if (page){ var first = railEl.querySelectorAll('.card')[before]; if (first && railEl.scrollTo) railEl.scrollTo({ left: Math.max(0, first.offsetLeft - railEl.offsetLeft - 8), behavior: 'smooth' }); }
    else if (railEl.scrollTo) railEl.scrollTo({ left: 0 });
    D.watchPhotos(railEl);
    D.paintPrices(railEl);
    paintHero();
    try { document.dispatchEvent(new CustomEvent('aria:nf-paint', { detail: DATA })); } catch(e){}
  }
  function paintHero(){
    var h = document.getElementById('heroTitle'), k = document.getElementById('heroKicker'), p = document.getElementById('heroDesc');
    if (!DATA || !h) return;
    deptName();
    h.textContent = title();
    if (k) k.textContent = DEPT_NAME;
    if (p) p.textContent = DATA.count ? num(DATA.count) + ' productos de tiendas de Estados Unidos, con el precio final en soles.' : '';
  }
  D.onHead(function(){ DEPT_NAME = ''; if (DATA) paintHero(); });

  /* ---------- the dropdown panels ---------- */
  var OPEN = null, scrim = null;
  function closeDD(){
    if (!OPEN) return;
    var p = OPEN.querySelector('.nf-pan'); if (p) p.remove();
    OPEN.querySelector('.nf-btn').setAttribute('aria-expanded', 'false');
    OPEN = null;
    if (scrim){ scrim.remove(); scrim = null; }
  }
  function chipsHTML(attr, list, cur){
    return '<div class="nf-chips">' + list.map(function(x){ return '<button type="button" class="nf-chip" ' + attr + '="' + esc(x[0]) + '" aria-pressed="' + (cur === x[0]) + '">' + esc(x[1]) + '<small>' + num(x[2]) + '</small></button>'; }).join('') + '</div>';
  }
  function listHTML(attr, list, cur){
    return '<ul class="nf-list">' + list.map(function(x){ return '<li><button type="button" ' + attr + '="' + esc(x[0]) + '" aria-pressed="' + (cur === x[0]) + '"><span>' + esc(x[1]) + '</span>' + (x[2] != null ? '<small>' + num(x[2]) + '</small>' : '') + '</button></li>'; }).join('') + '</ul>';
  }
  function panelHTML(k){
    var f = (DATA && DATA.facets) || {};
    if (k === 'f'){
      var h = '';
      if ((f.u || []).length) h += '<h4>Para quién</h4>' + chipsHTML('data-nf-u', f.u, S.u);
      if ((f.t || []).length && !(S.t && f.s && f.s.length)) h += '<h4>Tipo</h4>' + chipsHTML('data-nf-t', f.t, S.t);
      if ((f.o || []).length) h += '<h4>Precio rebajado</h4>' + chipsHTML('data-nf-o', [['1', 'Solo ofertas', f.o[0][2]]], S.o);
      return h || '<p class="nf-msg">Sin más filtros para esta selección.</p>';
    }
    if (k === 'sort') return listHTML('data-nf-sort', SORTS.map(function(x){ return [x[0], x[1]]; }), S.sort || 'deal');
    if (k === 'b') return '<h4>Marca</h4>' + listHTML('data-nf-b', f.b || [], S.b);
    if (k === 'z') return '<h4>Talla</h4>' + chipsHTML('data-nf-z', f.z || [], S.z);
    if (k === 'p') return '<h4>Precio</h4>' + listHTML('data-nf-p', f.p || [], S.p);
    return '';
  }
  barEl.addEventListener('click', function(e){
    var b = e.target.closest('.nf-btn');
    if (b){
      var dd = b.parentNode, was = OPEN === dd;
      closeDD();
      if (was || !DATA) return;
      OPEN = dd; b.setAttribute('aria-expanded', 'true');
      scrim = document.createElement('div'); scrim.className = 'nf-scrim'; scrim.setAttribute('data-nf-scrim', '');
      scrim.addEventListener('click', closeDD);
      document.body.appendChild(scrim);
      dd.insertAdjacentHTML('beforeend', '<div class="nf-pan" role="dialog" aria-label="' + esc(b.textContent) + '">' + panelHTML(dd.getAttribute('data-dd')) + '</div>');
      var pan = dd.querySelector('.nf-pan'), r = pan.getBoundingClientRect();
      if (r.right > window.innerWidth - 8 && window.innerWidth >= 640) pan.style.left = Math.min(0, window.innerWidth - 8 - r.right) + 'px';
      return;
    }
    pick(e.target.closest('button'));
  });
  function pick(o){
    if (!o) return;
    var map = { 'data-nf-u': 'u', 'data-nf-t': 't', 'data-nf-o': 'o', 'data-nf-sort': 'sort', 'data-nf-b': 'b', 'data-nf-z': 'z', 'data-nf-p': 'p', 'data-nf-s': 's' };
    for (var a in map){
      if (!o.hasAttribute(a)) continue;
      var k = map[a], v = o.getAttribute(a), patch = {};
      patch[k] = S[k] === v && k !== 'sort' && a !== 'data-nf-s' && !(a === 'data-nf-t' && o.classList.contains('nf-pill')) ? '' : v;
      if (k === 'sort' && v === 'deal') patch.sort = '';
      set(patch);
      return;
    }
  }
  pillsEl.addEventListener('click', function(e){ pick(e.target.closest('button')); });
  selEl.addEventListener('click', function(e){
    var x = e.target.closest('[data-nf-x]');
    if (x){ var p = {}; p[x.getAttribute('data-nf-x')] = ''; set(p); return; }
    if (e.target.closest('[data-nf-clear]')) set({ u: '', t: S.t, s: '', b: '', z: '', p: '', o: '' });
  });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeDD(); });
  railEl.addEventListener('click', function(e){ if (e.target.closest('#nfMore')) { e.target.closest('#nfMore').disabled = true; run(PAGE + 1); } });

  window.AriaNF = { run: function(){ run(0); } };
  getFx().then(function(fx){ FX = fx || 0; run(0); });
})();

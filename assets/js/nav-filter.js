/* ==================================================================
   THE TYPE PILLS AND THE FILTER BAR, EVERYWHERE (#443 c.6616347095,
   c.6616389410, c.6616425433: "every option, everywhere").

   On a store (tienda.html), a brand (marca.html) and a search
   (search.html) -- listings with no type or brand filter of their own --
   under the page's hero:
     - the type pills: the listing's types, or once a type is picked its
       styles (Todas las botas · Chelsea · Caña alta ...) when the
       products' own names have them; one tap re-renders in place;
     - the filter bar, dropdown buttons only: Filtrar · Ordenar · Marca ·
       Talla · Precio. Each opens a small panel (sizes as chips, brands
       as a short list); never a checkbox wall. Marca, Talla and Precio
       take several values at once;
     - every selection stacks (audience x type x style x brand x size x
       price x Ofertas) and shows as a removable chip («Marca: UGG ×»);
     - each option is counted under all the other selections, on the
       server (_nav-filter-core.js), and only options with products are
       offered: no zero-result path;
     - the state is the URL (shareable; back / forward walk it).
   With nothing selected the page shows its own carousels under the bar
   (the landing); the first selection swaps them, in place, for the
   filtered results -- one carousel, 48 cards at a time brought into it
   by its last card, never a side-by-side grid. Clearing everything
   brings the page's own carousels back.

   NEVER A SECOND RENDERING OF A SECTION (#443 c.6621544530,
   c.6621722209: "the header creates nothing"). A section page with its
   own pills and filters keeps them and is not given this bar: a
   department (departamento.html: its Para quién switch, brand pills,
   type view and Explorar todo), Ofertas (its Por categoría view) and
   Ropa Interior (its Explorar todo). The department's old filtered view
   is gone: departamento.html sends its old address to its own page.

   OFERTAS, INSIDE ONE CATEGORY (#443 c.6629871333, Danny: "Ofertas
   zapatos mujer, hombre o niños"). ofertas.html's Por categoría view
   mounts the bar on one category (src 'ofertas=1&cat=<k>') when a
   category is chosen, under its category pills: the category's own
   offers stay the landing (its store rails), the bar narrows inside
   them. With audPills the page gets the Mujer / Hombre / Niños pills on
   top -- only the audiences the server says the category really holds
   (its aud list) -- and Para quién leaves the Filtrar panel. off()
   takes the bar away again (Todas, Por tienda).

   The page names itself in window.AriaNFHost:
     { src: 'tienda=macys', endpoint, prefix: 'f', hide: [selectors],
       anchor: element the bar goes after, cardHTML(card), after(root),
       getJSON(url), esc(s), title(): the listing's name,
     optional: names {u: 'aud'} (a key's own URL name), uvals {women:
       'mujer', ...} (the audience's URL value), audPills, resAnchor
       (the results rail goes before it), unit ['oferta', 'ofertas'] }
   ================================================================== */
(function(){
  'use strict';
  var H = window.AriaNFHost;
  if (!H || !H.anchor) return;
  if (H.boot && H.boot.done) return;

  var PFX = H.prefix || '';
  var KEYS = ['u', 't', 's', 'b', 'z', 'p', 'o', 'r', 'w', 'sort'];
  var MULTI = { b: 1, z: 1, p: 1, r: 1 };
  var SEP = '|';
  var AUD = { women: 'Mujer', men: 'Hombre', kids: 'Niños' };
  var SORTS = [['deal', 'Mayor descuento'], ['low', 'Precio: menor a mayor'], ['high', 'Precio: mayor a menor']];
  var esc = H.esc || function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var getJSON = H.getJSON || function(u){ return fetch(u).then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); };
  var num = function(n){ return Number(n || 0).toLocaleString('es-PE'); };
  var UNIT = H.unit || ['producto', 'productos'];
  var UIN = {}; if (H.uvals) for (var uk in H.uvals) UIN[H.uvals[uk]] = uk;
  var pname = function(k){ return (H.names && H.names[k]) || PFX + k; };

  var CSS = ''
    + (H.hide || []).map(function(s){ return 'html.nf-on ' + s; }).join(',') + (H.hide && H.hide.length ? '{display:none!important}' : '')
    + '.nf{max-width:1240px;margin:0 auto;padding:14px 0 8px;color:#0A1F44}'
    + '.nf-dark{color:#fff}'
    + '.nf-pills{display:flex;gap:8px;overflow-x:auto;padding:0 20px 2px;scrollbar-width:none;-webkit-overflow-scrolling:touch}'
    + '.nf-pills::-webkit-scrollbar{display:none}'
    + '.nf-aud{padding-bottom:10px}'
    + '.nf-pill{flex:0 0 auto;height:42px;padding:0 18px;border-radius:999px;border:1px solid #E4E6EC;background:#fff;color:#0A1F44;font:800 14px/1 sans-serif;font-family:inherit;cursor:pointer;white-space:nowrap}'
    + '.nf-pill small{font-weight:600;color:#6B7487;margin-left:6px;font-size:12px}'
    + '.nf-pill[aria-pressed="true"]{background:#0A1F44;color:#fff;border-color:#0A1F44}'
    + '.nf-pill[aria-pressed="true"] small{color:#C9D2E6}'
    + '.nf-bar{position:relative;display:flex;gap:8px;flex-wrap:wrap;padding:12px 20px 0}'
    + '.nf-dd{position:relative}'
    + '.nf-btn{height:40px;padding:0 14px;border-radius:10px;border:1px solid #D9E0EB;background:#fff;color:#0A1F44;font:800 14px/1 sans-serif;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}'
    + '.nf-btn[aria-expanded="true"],.nf-btn.has{border-color:#0A1F44;box-shadow:inset 0 0 0 1px #0A1F44}'
    + '.nf-btn b{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#0A1F44;color:#fff;font-size:11px;box-sizing:border-box}'
    + '.nf-btn svg{flex:0 0 auto}'
    + '.nf-pan{position:absolute;top:46px;left:0;z-index:40;width:300px;max-width:calc(100vw - 32px);max-height:380px;overflow-y:auto;background:#fff;color:#0A1F44;border:1px solid #E4E6EC;border-radius:14px;box-shadow:0 16px 36px rgba(10,31,68,.18);padding:12px;box-sizing:border-box}'
    + '.nf-pan h4{margin:6px 0 8px;font-size:11.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#6B7487}'
    + '.nf-pan .nf-note{margin:2px 0 8px;font-size:12.5px;color:#6B7487}'
    + '.nf-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px}'
    + '.nf-chip{height:38px;min-width:44px;padding:0 12px;border-radius:999px;border:1px solid #D9E0EB;background:#fff;color:#0A1F44;font:700 13.5px/1 sans-serif;font-family:inherit;cursor:pointer;white-space:nowrap}'
    + '.nf-chip small{font-weight:600;color:#6B7487;margin-left:4px;font-size:11.5px}'
    + '.nf-chip[aria-pressed="true"]{background:#0A1F44;color:#fff;border-color:#0A1F44}'
    + '.nf-chip[aria-pressed="true"] small{color:#C9D2E6}'
    + '.nf-list{list-style:none;margin:0;padding:0}'
    + '.nf-list button{display:flex;width:100%;align-items:center;justify-content:space-between;gap:10px;min-height:42px;padding:0 10px;border:0;border-radius:10px;background:none;color:#0A1F44;font:700 14px/1.2 sans-serif;font-family:inherit;cursor:pointer;text-align:left}'
    + '.nf-list button:hover{background:#F3F5F9}'
    + '.nf-list button[aria-pressed="true"]{background:#0A1F44;color:#fff}'
    + '.nf-list small{font-weight:600;color:#6B7487;font-size:12px}'
    + '.nf-list button[aria-pressed="true"] small{color:#C9D2E6}'
    + '.nf-q{display:flex;gap:8px;margin:0 0 6px}'
    + '.nf-qin{flex:1 1 auto;min-width:0;height:40px;border:1px solid #D9E0EB;border-radius:10px;padding:0 12px;font:500 16px sans-serif;font-family:inherit;color:#0A1F44;box-sizing:border-box}'
    + '.nf-done{display:block;width:100%;height:44px;margin-top:10px;border:0;border-radius:12px;background:#0A1F44;color:#fff;font:800 14px/1 sans-serif;font-family:inherit;cursor:pointer}'
    + '.nf-sel{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 20px 0}'
    + '.nf-x{height:34px;padding:0 8px 0 12px;border-radius:999px;border:0;background:#EAF0FA;color:#0A1F44;font:700 13px/1 sans-serif;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px}'
    + '.nf-x svg{opacity:.7}'
    + '.nf-clear{border:0;background:none;color:#2456A0;font:800 13px/1 sans-serif;font-family:inherit;cursor:pointer;padding:8px 4px}'
    + '.nf-dark .nf-clear{color:#F4C463}'
    + '.nf-count{margin:12px 20px 0;color:#6B7487;font-size:14px;font-weight:600}'
    + '.nf-dark .nf-count{color:#DCE6FF}'
    + '.nf-dark .nf-res .rail-head h2,.nf-dark .nf-res .rail-count{color:#fff}'
    + '.nf-msg{padding:16px 20px;color:#6B7487;font-size:14px}'
    + '.nf-res .rail-head{display:flex;align-items:center;gap:8px;padding:0 20px;margin:14px 0 2px}'
    + '.nf-res .rail-head h2{font-size:19px;font-weight:800;margin:0}'
    + '.nf-rail{display:flex;gap:12px;overflow-x:auto;padding:10px 20px 16px;scroll-snap-type:x mandatory;scrollbar-width:thin}'
    + '.nf-rail > *{flex:0 0 172px;scroll-snap-align:start}'
    + '@media(min-width:640px){.nf-rail > *{flex-basis:208px}}'
    + '.nf-more{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:240px;border:1px dashed #C9D2E6;border-radius:16px;background:#F7F9FC;color:#0A1F44;font:800 15px/1.2 sans-serif;font-family:inherit;cursor:pointer}'
    + '.nf-more span{font-weight:600;font-size:12.5px;color:#6B7487}'
    + '@media (max-width:639.98px){.nf-bar{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.nf-bar::-webkit-scrollbar{display:none}.nf-dd{position:static}'
    +   '.nf-pan{position:fixed;left:0;right:0;bottom:0;top:auto;width:auto;max-width:none;max-height:70vh;border-radius:18px 18px 0 0;padding:16px 16px 22px}}'
    + '.nf-scrim{position:fixed;inset:0;z-index:39;background:transparent}'
    + '@media (max-width:639.98px){.nf-scrim{background:rgba(10,31,68,.35)}}';
  var st = document.createElement('style'); st.id = 'nf-css'; st.textContent = CSS; document.head.appendChild(st);

  var CARET = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  var XI = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  var BTNS = [['f', 'Filtrar'], ['sort', 'Ordenar'], ['b', 'Marca'], ['z', 'Talla'], ['p', 'Precio']];

  var box = document.createElement('section'); box.className = 'nf' + (H.dark ? ' nf-dark' : ''); box.id = 'nf'; box.setAttribute('aria-label', 'Tipos y filtros');
  box.innerHTML = (H.audPills ? '<nav class="nf-pills nf-aud" id="nfAud" aria-label="Para quién" hidden></nav>' : '')
    + '<nav class="nf-pills" id="nfPills" aria-label="Tipos"></nav>'
    + '<div class="nf-bar" id="nfBar" role="toolbar" aria-label="Filtros">'
    + BTNS.map(function(x){ return '<div class="nf-dd" data-dd="' + x[0] + '"><button type="button" class="nf-btn" data-nf-btn="' + x[0] + '" aria-expanded="false" aria-haspopup="true"><span>' + x[1] + '</span>' + CARET + '</button></div>'; }).join('')
    + '</div><div class="nf-sel" id="nfSel" aria-label="Filtros aplicados" hidden></div>'
    + '<p class="nf-count" id="nfCount" hidden></p>'
    + '<section class="nf-res" id="nfRes" aria-live="polite" hidden><div class="rail-head"><h2 id="nfTitle"></h2><span class="rail-count" id="nfN"></span></div><div class="rail nf-rail" id="nfRail"></div></section>';
  H.anchor.parentNode.insertBefore(box, H.anchor.nextSibling);
  if (H.resAnchor && H.resAnchor.parentNode) H.resAnchor.parentNode.insertBefore(box.querySelector('#nfRes'), H.resAnchor);
  H.boot = { done: true, box: box };
  var pillsEl = document.getElementById('nfPills'), barEl = document.getElementById('nfBar'), selEl = document.getElementById('nfSel'),
      countEl = document.getElementById('nfCount'), resEl = document.getElementById('nfRes'), railEl = document.getElementById('nfRail'),
      titleEl = document.getElementById('nfTitle'), nEl = document.getElementById('nfN'), audEl = document.getElementById('nfAud');

  var S = read(), DATA = null, SEQ = 0, PAGE = 0, FX = 0;
  function read(){
    var sp = new URLSearchParams(location.search), s = {};
    KEYS.forEach(function(k){ var v = (sp.get(pname(k)) || '').trim(); s[k] = MULTI[k] ? (v ? v.split(SEP).filter(Boolean) : []) : v; });
    if (UIN[s.u]) s.u = UIN[s.u];
    if (!AUD[s.u]) s.u = '';
    if (s.o !== '1') s.o = '';
    if (!SORTS.some(function(x){ return x[0] === s.sort; })) s.sort = '';
    return s;
  }
  function active(s){ return !!(s.u || s.t || s.s || s.b.length || s.z.length || s.p.length || s.r.length || s.w || s.o || s.sort); }
  function urlOf(s){
    var u = new URL(location.href);
    KEYS.forEach(function(k){ var v = MULTI[k] ? s[k].join(SEP) : s[k]; if (k === 'u' && v && H.uvals && H.uvals[v]) v = H.uvals[v]; if (v) u.searchParams.set(pname(k), v); else u.searchParams.delete(pname(k)); });
    return u.pathname + u.search + u.hash;
  }
  function set(patch){
    var n = {}; KEYS.forEach(function(k){ n[k] = MULTI[k] ? S[k].slice() : S[k]; });
    for (var k in patch) n[k] = patch[k];
    if (patch.t !== undefined && patch.s === undefined) n.s = '';
    S = n;
    var url = urlOf(S);
    try { history.pushState({ nf: 1 }, '', url); } catch(e){}
    LAST_Q = location.search;
    hold();
    run(0);
  }
  /* A PILL NEVER MOVES THE SHOPPER (#443 c.6635829511). The swap hides
     the page's own carousels and the results load after it: the page
     keeps its height meanwhile (the browser cannot pull the scroll up),
     the scroll stays where the shopper had it, and -- only if the bar
     sits above the screen -- the view starts at its top. */
  var HOLD = null;
  function hold(){
    if (HOLD) HOLD(true);
    var root = document.documentElement, y = window.pageYOffset || root.scrollTop || 0, moved = false, done = false;
    function user(){ moved = true; }
    var evs = ['wheel', 'touchmove', 'keydown'];
    evs.forEach(function(ev){ window.addEventListener(ev, user, { passive: true }); });
    root.style.minHeight = root.scrollHeight + 'px';
    function pin(){ if (!moved && Math.abs((window.pageYOffset || 0) - y) > 1) window.scrollTo(0, y); }
    if (window.requestAnimationFrame) requestAnimationFrame(pin);
    var t = setTimeout(function(){ if (HOLD === me) letGo(); }, 10000);
    var me = HOLD = function(superseded){
      if (done) return;
      done = true; clearTimeout(t);
      evs.forEach(function(ev){ window.removeEventListener(ev, user); });
      if (superseded) return;
      pin();
      root.style.minHeight = '';
      var r = box.getBoundingClientRect();
      if (r.top < 0 && !moved) window.scrollBy(0, r.top);
    };
  }
  function letGo(){ var h = HOLD; HOLD = null; if (h) h(); }
  /* A jump link's #hash is a popstate too: only a new query re-reads. */
  var LAST_Q = location.search;
  window.addEventListener('popstate', function(){ if (location.search === LAST_Q || !H.src) return; LAST_Q = location.search; S = read(); run(0); });

  function getFx(){
    try { var c = JSON.parse(localStorage.getItem('aria_fx_rate_v1') || 'null'); if (c && typeof c.venta === 'number' && c.venta > 0) return Promise.resolve(c.venta); } catch(e){}
    return fetch('/.netlify/functions/exchange-rate').then(function(r){ return r.json(); }).then(function(d){ return d && d.venta > 0 ? d.venta : 0; }).catch(function(){ return 0; });
  }
  function api(page){
    var q = (H.endpoint.indexOf('?') >= 0 ? '&' : '?') + H.src;
    KEYS.forEach(function(k){ var v = MULTI[k] ? S[k].join(SEP) : S[k]; if (v) q += '&' + k + '=' + encodeURIComponent(v); });
    if (FX) q += '&fx=' + FX.toFixed(2);
    if (page) q += '&page=' + page;
    return H.endpoint + q;
  }
  function results(on){
    document.documentElement.classList.toggle('nf-on', on);
    resEl.hidden = !on; countEl.hidden = !on;
    if (H.onMode) try { H.onMode(on); } catch(e){}
  }
  function run(page){
    var seq = ++SEQ; PAGE = page;
    var on = active(S);
    results(on);
    if (!page && on) countEl.textContent = 'Cargando…';
    var keep = OPEN && MULTI[OPEN.getAttribute('data-dd')] ? OPEN.getAttribute('data-dd') : '';
    if (!keep) closeDD();
    getJSON(api(page)).then(function(d){
      if (seq !== SEQ) return;
      DATA = d;
      paint(page, on);
      if (!page) letGo();
      if (keep && OPEN) refreshPanel();
    }).catch(function(){
      if (seq !== SEQ) return;
      letGo();
      countEl.hidden = false;
      countEl.textContent = 'No pudimos cargar los productos. Revisa tu conexión e inténtalo de nuevo.';
    });
  }

  function labelOf(list, k){ var m = (list || []).filter(function(x){ return x[0] === k; })[0]; return m ? m[1] : k; }
  function title(){
    var parts = [];
    if (S.s && DATA.sl) parts.push(DATA.sl); else if (S.t && DATA.tl) parts.push(DATA.tl);
    if (!parts.length) parts.push((H.title && H.title()) || 'Todo');
    if (S.u) parts.push(AUD[S.u]);
    /* The brands chosen name the set (up to two; more are counted). */
    var f = (DATA && DATA.facets) || {};
    if (S.b.length) parts.push(S.b.length <= 2 ? S.b.map(function(v){ return labelOf(f.b, v); }).join(' y ') : S.b.length + ' marcas');
    if (S.o) parts.push('Ofertas');
    return parts.join(' · ');
  }

  function paint(page, on){
    var f = DATA.facets || {};
    /* The pills: the type's styles, or the listing's types. */
    var ph = '';
    if (S.t && f.s && f.s.length){
      var all = 0; (f.t || []).forEach(function(x){ if (x[0] === S.t) all = x[2]; });
      ph = '<button type="button" class="nf-pill" data-nf-t="" aria-pressed="false">Todo</button>'
        + '<button type="button" class="nf-pill" data-nf-s="" aria-pressed="' + (!S.s) + '">' + esc(DATA.sAll || 'Todo') + '<small>' + num(all) + '</small></button>'
        + f.s.map(function(x){ return '<button type="button" class="nf-pill" data-nf-s="' + esc(x[0]) + '" aria-pressed="' + (S.s === x[0]) + '">' + esc(x[1]) + '<small>' + num(x[2]) + '</small></button>'; }).join('');
    } else if ((f.t || []).length > 1 || S.t){
      var tot = DATA.tAll != null ? DATA.tAll : (f.t || []).reduce(function(s, x){ return s + x[2]; }, 0);
      ph = '<button type="button" class="nf-pill" data-nf-t="" aria-pressed="' + (!S.t) + '">Todo<small>' + num(tot) + '</small></button>'
        + (f.t || []).map(function(x){ return '<button type="button" class="nf-pill" data-nf-t="' + esc(x[0]) + '" aria-pressed="' + (S.t === x[0]) + '">' + esc(x[1]) + '<small>' + num(x[2]) + '</small></button>'; }).join('');
    }
    pillsEl.innerHTML = ph; pillsEl.hidden = !ph;
    /* Mujer / Hombre / Niños: the audiences the listing really holds
       (the server's aud), each counted under the other selections. */
    if (audEl){
      var ah = '', ok = DATA.aud || [];
      if (ok.length){
        ah = '<button type="button" class="nf-pill" data-nf-u="" aria-pressed="' + (!S.u) + '">Todos' + (DATA.uAll != null ? '<small>' + num(DATA.uAll) + '</small>' : '') + '</button>';
        ok.forEach(function(k){
          var c = 0; (f.u || []).forEach(function(x){ if (x[0] === k) c = x[2]; });
          if (!c && S.u !== k) return;
          ah += '<button type="button" class="nf-pill" data-nf-u="' + esc(k) + '" aria-pressed="' + (S.u === k) + '">' + esc(AUD[k] || k) + '<small>' + num(c) + '</small></button>';
        });
      }
      audEl.innerHTML = ah; audEl.hidden = !ah;
    }

    var n = { f: (S.u && !audEl ? 1 : 0) + (S.o ? 1 : 0) + S.r.length + (S.w ? 1 : 0), sort: S.sort ? 1 : 0, b: S.b.length, z: S.z.length, p: S.p.length };
    var any = { f: true, sort: true, b: (f.b || []).length > 1 || S.b.length > 0, z: (f.z || []).length > 0, p: (f.p || []).length > 0 };
    Array.prototype.forEach.call(barEl.querySelectorAll('.nf-btn'), function(b){
      var k = b.getAttribute('data-nf-btn'), old = b.querySelector('b');
      if (old) old.remove();
      b.classList.toggle('has', n[k] > 0);
      if (n[k] > 0 && k !== 'sort') b.querySelector('span').insertAdjacentHTML('afterend', '<b>' + n[k] + '</b>');
      b.parentNode.hidden = !(any[k] || n[k]);
    });

    var chips = [];
    if (S.u) chips.push(['u', '', AUD[S.u]]);
    if (S.t) chips.push(['t', '', 'Tipo: ' + (DATA.tl || labelOf(f.t, S.t))]);
    if (S.s) chips.push(['s', '', 'Estilo: ' + (DATA.sl || S.s)]);
    S.b.forEach(function(v){ chips.push(['b', v, 'Marca: ' + labelOf(f.b, v)]); });
    S.z.forEach(function(v){ chips.push(['z', v, 'Talla: ' + v]); });
    S.p.forEach(function(v){ chips.push(['p', v, 'Precio: ' + labelOf(f.p, v)]); });
    S.r.forEach(function(v){ chips.push(['r', v, 'Tienda: ' + labelOf(f.r, v)]); });
    if (S.w) chips.push(['w', '', '«' + S.w + '»']);
    if (S.o) chips.push(['o', '', 'Ofertas']);
    if (S.sort) chips.push(['sort', '', labelOf(SORTS, S.sort)]);
    selEl.innerHTML = chips.map(function(c){ return '<button type="button" class="nf-x" data-nf-x="' + c[0] + '" data-v="' + esc(c[1]) + '" aria-label="Quitar ' + esc(c[2]) + '">' + esc(c[2]) + XI + '</button>'; }).join('')
      + (chips.length > 1 ? '<button type="button" class="nf-clear" data-nf-clear>Limpiar todo</button>' : '');
    selEl.hidden = !chips.length;
    if (!on) return;

    countEl.textContent = DATA.count ? num(DATA.count) + ' ' + (DATA.count === 1 ? UNIT[0] : UNIT[1]) : '';
    titleEl.textContent = title();
    nEl.textContent = DATA.count ? num(DATA.count) : '';
    var html = (DATA.cards || []).map(function(c){ try { return H.cardHTML(c); } catch(e){ return ''; } }).join('');
    var more = document.getElementById('nfMore'); if (more) more.remove();
    var before = railEl.children.length;
    if (page) railEl.insertAdjacentHTML('beforeend', html); else railEl.innerHTML = html;
    if (!DATA.count) railEl.innerHTML = '<p class="nf-msg">Ningún producto coincide. Quita un filtro.</p>';
    if (DATA.pages > page + 1){
      var shown = Math.min(DATA.count, (page + 1) * 48);
      railEl.insertAdjacentHTML('beforeend', '<button type="button" class="rail-next nf-more" id="nfMore">Ver más<span>' + num(DATA.count - shown) + ' más</span></button>');
    }
    if (page){ var first = railEl.children[before]; if (first && railEl.scrollTo) railEl.scrollTo({ left: Math.max(0, first.offsetLeft - railEl.offsetLeft - 8), behavior: 'smooth' }); }
    else if (railEl.scrollTo) railEl.scrollTo({ left: 0 });
    if (H.after) try { H.after(railEl); } catch(e){}
    if (H.onPaint) try { H.onPaint(DATA, title()); } catch(e){}
  }

  /* ---------- the dropdown panels ---------- */
  var OPEN = null, scrim = null;
  function closeDD(){
    if (!OPEN) return;
    var p = OPEN.querySelector('.nf-pan'); if (p) p.remove();
    OPEN.querySelector('.nf-btn').setAttribute('aria-expanded', 'false');
    OPEN = null;
    if (scrim){ scrim.remove(); scrim = null; }
  }
  function has(k, v){ return MULTI[k] ? S[k].indexOf(v) >= 0 : S[k] === v; }
  function chipsHTML(k, list){
    return '<div class="nf-chips">' + list.map(function(x){ return '<button type="button" class="nf-chip" data-nf-' + k + '="' + esc(x[0]) + '" aria-pressed="' + has(k, x[0]) + '">' + esc(x[1]) + (x[2] != null ? '<small>' + num(x[2]) + '</small>' : '') + '</button>'; }).join('') + '</div>';
  }
  function listHTML(k, list, cur){
    return '<ul class="nf-list">' + list.map(function(x){ var on = cur != null ? cur === x[0] : has(k, x[0]); return '<li><button type="button" data-nf-' + k + '="' + esc(x[0]) + '" aria-pressed="' + on + '"><span>' + esc(x[1]) + '</span>' + (x[2] != null ? '<small>' + num(x[2]) + '</small>' : '') + '</button></li>'; }).join('') + '</ul>';
  }
  /* A chosen value the others narrowed away stays listed, to be removed. */
  function withChosen(k, list){
    var out = (list || []).slice();
    S[k].forEach(function(v){ if (!out.some(function(x){ return x[0] === v; })) out.unshift([v, k === 'z' ? v : v, null]); });
    return out;
  }
  function panelHTML(k){
    var f = (DATA && DATA.facets) || {};
    if (k === 'f'){
      var h = '';
      if ((f.u || []).length && !audEl) h += '<h4>Para quién</h4>' + chipsHTML('u', f.u);
      if ((f.t || []).length) h += '<h4>Tipo</h4>' + chipsHTML('t', f.t);
      if ((f.o || []).length) h += '<h4>Precio rebajado</h4>' + chipsHTML('o', [['1', 'Solo ofertas', f.o[0][2]]]);
      if ((f.r || []).length > 1 || S.r.length) h += '<h4>Tienda</h4>' + chipsHTML('r', withChosen('r', f.r));
      h += '<h4>Palabras</h4><form class="nf-q" data-nf-qform><input type="search" class="nf-qin" name="w" value="' + esc(S.w) + '" placeholder="Buscar en esta lista…" aria-label="Buscar en esta lista" maxlength="80" autocomplete="off"><button type="submit" class="nf-chip">Buscar</button></form>';
      return h;
    }
    if (k === 'sort') return listHTML('sort', SORTS.map(function(x){ return [x[0], x[1]]; }), S.sort || 'deal');
    var done = '<button type="button" class="nf-done" data-nf-done>Listo</button>';
    if (k === 'b') return '<h4>Marca</h4><p class="nf-note">Puedes elegir varias.</p>' + listHTML('b', withChosen('b', f.b)) + done;
    if (k === 'z') return '<h4>Talla</h4><p class="nf-note">Las tallas que publica cada tienda. Puedes elegir varias.</p>' + chipsHTML('z', withChosen('z', f.z)) + done;
    if (k === 'p') return '<h4>Precio</h4><p class="nf-note">Precio final en soles.</p>' + listHTML('p', withChosen('p', f.p)) + done;
    return '';
  }
  function refreshPanel(){
    var pan = OPEN && OPEN.querySelector('.nf-pan');
    if (!pan) return;
    var top = pan.scrollTop;
    pan.innerHTML = panelHTML(OPEN.getAttribute('data-dd'));
    pan.scrollTop = top;
  }
  barEl.addEventListener('submit', function(e){
    var fm = e.target.closest('[data-nf-qform]');
    if (!fm) return;
    e.preventDefault();
    var v = (fm.querySelector('input').value || '').trim().slice(0, 80);
    closeDD();
    if (v !== S.w) set({ w: v });
  });
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
    if (e.target.closest('[data-nf-done]')) { closeDD(); return; }
    pick(e.target.closest('button'));
  });
  function pick(o){
    if (!o) return;
    for (var i = 0; i < KEYS.length; i++){
      var k = KEYS[i], a = 'data-nf-' + k;
      if (!o.hasAttribute(a)) continue;
      var v = o.getAttribute(a), patch = {};
      if (MULTI[k]){
        var cur = S[k].slice(), at = cur.indexOf(v);
        if (at >= 0) cur.splice(at, 1); else cur.push(v);
        patch[k] = cur;
      } else if (k === 'sort') patch.sort = v === 'deal' ? '' : v;
      else if (o.classList.contains('nf-pill')) patch[k] = v;
      else patch[k] = S[k] === v ? '' : v;
      set(patch);
      return;
    }
  }
  pillsEl.addEventListener('click', function(e){ pick(e.target.closest('button')); });
  if (audEl) audEl.addEventListener('click', function(e){ pick(e.target.closest('button')); });
  selEl.addEventListener('click', function(e){
    var x = e.target.closest('[data-nf-x]');
    if (x){
      var k = x.getAttribute('data-nf-x'), p = {};
      if (MULTI[k]) p[k] = S[k].filter(function(v){ return v !== x.getAttribute('data-v'); });
      else p[k] = '';
      set(p); return;
    }
    if (e.target.closest('[data-nf-clear]')) set({ u: '', t: '', s: '', b: [], z: [], p: [], r: [], w: '', o: '', sort: '' });
  });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeDD(); });
  railEl.addEventListener('click', function(e){ var m = e.target.closest('#nfMore'); if (m) { m.disabled = true; run(PAGE + 1); } });

  /* A page with two listings points the bar at the other one in place. */
  var EMPTY = function(){ return { u: '', t: '', s: '', b: [], z: [], p: [], o: '', r: [], w: '', sort: '' }; };
  function resource(src, anchor){
    if (src === H.src && !box.hidden) return;
    H.src = src; box.hidden = false;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor.nextSibling);
    S = EMPTY();
    try { history.replaceState(null, '', urlOf(S)); } catch(e){}
    LAST_Q = location.search;
    run(0);
  }
  /* The page leaves the listing (Todas, Por tienda): the bar goes, its state with it. */
  function off(){
    SEQ++; closeDD(); S = EMPTY(); H.src = '';
    try { history.replaceState(null, '', urlOf(S)); } catch(e){}
    LAST_Q = location.search;
    results(false); box.hidden = true;
  }
  window.AriaNF = { state: function(){ return S; }, set: set, box: box, resource: resource, off: off, active: function(){ return active(S); }, data: function(){ return DATA; }, url: function(){ return api(0); } };
  /* A page that mounted the bar and left the listing before it loaded. */
  if (!H.src) box.hidden = true;
  getFx().then(function(fx){ FX = fx || 0; if (H.src) run(0); });
})();

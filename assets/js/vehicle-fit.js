/* ==================================================================
   THE VEHICLE, ONE VIEW (#443 c.6620267344, amended c.6620289895; one
   canonical page per section, c.6621544530 / c.6621722209).

   ONE VIEW, ARIA AUTO'S OWN PAGE:
     /aria-auto.html?vy=<año>&vmk=<marca>&vmd=<modelo>[&t=<tipo>][&b=<marca del repuesto>]#buscar
   Brake pads for a 2011 BMW 3 Series land there from every entry point:
     - Aria Auto's own selector (Año / Marca del vehículo / Modelo) and
       its part chips, tiles and search box draw the view in place;
     - the «Tu vehículo» card on the auto parts department
       (departamento.html?dept=auto_parts) and on the auto stores
       (tienda.html?tienda=advanceauto) only links to it;
     - auto.html's finder (the same finder) opens it.
   The department and the stores render nothing new: no vehicle filter
   inside their pages.

   THE DATA is Aria Auto's own (auto-cache.json VEHICLE_SPECIFIC filings,
   the selector's make and model names: scripts/build-fitment.mjs). The
   phone never downloads it: options, counts and cards come from
   /.netlify/functions/vehicle-fit (_fitment-core.js). Only a year, make,
   model, part type or part brand with products behind it is offered.
   A product with no vehicle data is never shown as fitting: it is
   listed apart, «Universal / sin datos de compatibilidad».

   THE VEHICLE STAYS in this browser (aria_vehicle_v1, try/catch), and
   shows as a removable chip («Vehículo: 2011 BMW 3 Series ×»).
   ================================================================== */
(function(){
  'use strict';
  var STORE_KEY = 'aria_vehicle_v1';
  var ENDPOINT = '/.netlify/functions/vehicle-fit';
  var VIEW = '/aria-auto.html';
  var FIT_DEPTS = { auto_parts: 1 };
  /* The auto-parts stores with a store page (scripts/lib/retailers.js kind "auto"). */
  var FIT_STORES = { advanceauto: 1 };

  function slug(s){
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n){ return Number(n || 0).toLocaleString('es-PE'); }
  function clean(v){
    v = v || {};
    var o = { y: /^\d{4}$/.test(String(v.y || '')) ? String(v.y) : '', mk: slug(v.mk), md: slug(v.md), mkL: String(v.mkL || '').slice(0, 40), mdL: String(v.mdL || '').slice(0, 40) };
    if (!o.mk) { o.md = ''; o.mkL = ''; }
    if (!o.md) o.mdL = '';
    return o;
  }
  function has(v){ return !!(v && (v.y || v.mk || v.md)); }
  function full(v){ return !!(v && v.y && v.mk && v.md); }
  function label(v){ return has(v) ? [v.y, v.mkL || v.mk, v.mdL || v.md].filter(Boolean).join(' ') : ''; }
  function saved(){
    try { var v = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); return has(v) ? clean(v) : null; } catch(e){ return null; }
  }
  function save(v){
    try { if (has(v)) localStorage.setItem(STORE_KEY, JSON.stringify(clean(v))); else localStorage.removeItem(STORE_KEY); } catch(e){}
  }
  function fromUrl(){
    var sp = new URLSearchParams(location.search);
    return clean({ y: sp.get('vy'), mk: sp.get('vmk'), md: sp.get('vmd') });
  }
  function qOf(v, o){
    o = o || {};
    var q = [];
    if (v.y) q.push('vy=' + encodeURIComponent(v.y));
    if (v.mk) q.push('vmk=' + encodeURIComponent(v.mk));
    if (v.md) q.push('vmd=' + encodeURIComponent(v.md));
    if (o.t) q.push('t=' + encodeURIComponent(o.t));
    if (o.b) q.push('b=' + encodeURIComponent(o.b));
    if (o.page) q.push('page=' + o.page);
    return q.join('&');
  }
  /* THE ONE VIEW: a vehicle (and a part type), from any entry point. */
  function viewUrl(o){
    o = o || {};
    var q = qOf(clean(o.v), { t: o.t, b: o.b });
    return VIEW + (q ? '?' + q : '') + '#buscar';
  }
  function ask(v, o){
    return fetch(ENDPOINT + '?' + qOf(v, o)).then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  window.AriaVehicle = { key: STORE_KEY, slug: slug, saved: saved, save: save, fromUrl: fromUrl, viewUrl: viewUrl, label: label };

  var CSS = ''
    + '.vf-card{max-width:1240px;margin:14px auto 4px;padding:16px;border:1px solid #E4E6EC;border-radius:16px;background:#F7F9FC;box-sizing:border-box;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;font-family:inherit}'
    + '.vf-card h2{grid-column:1/-1;margin:0;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#6B7487}'
    + '.vf-card p{grid-column:1/-1;margin:0;color:#3B4458;font-size:13.5px;line-height:1.45}'
    + '.vf-f{display:flex;flex-direction:column;gap:4px;min-width:0}'
    + '.vf-f span{font-size:12px;font-weight:700;color:#3B4458;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.vf-f select{width:100%;min-width:0;height:42px;padding:0 8px;border:1px solid #D9E0EB;border-radius:10px;background:#fff;color:#0A1F44;font:700 14px/1 inherit;font-family:inherit}'
    + '.vf-f select:disabled{background:#F3F5F9;color:#8A93A8}'
    + '.vf-f select.has{border-color:#0A1F44;box-shadow:inset 0 0 0 1px #0A1F44}'
    + '.vf-card .vf-t{grid-column:1/-1}'
    + '.vf-go{grid-column:1/-1;display:flex;align-items:center;justify-content:center;min-height:46px;padding:0 16px;border-radius:12px;background:#0A1F44;color:#fff;font-weight:800;font-size:15px;text-decoration:none;text-align:center}'
    + '.vf-go[aria-disabled="true"]{background:#C9D2E6;pointer-events:none}'
    + '.vf-chip{justify-self:start;height:34px;padding:0 8px 0 12px;border-radius:999px;border:0;background:#EAF0FA;color:#0A1F44;font:700 13px/1 inherit;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px}'
    + '.vf-card .vf-chip{grid-column:1/-1}'
    + '@media (min-width:640px){.vf-card{grid-template-columns:2fr 1fr 1.4fr 1.4fr;align-items:end}.vf-card .vf-t{grid-column:auto}}'
    /* the view, inside Aria Auto */
    + '#vfView{margin-top:22px}'
    + '#vfView .vf-head{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 10px}'
    + '#vfView .vf-pills{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:2px 0 4px}'
    + '#vfView .vf-pills::-webkit-scrollbar{display:none}'
    + '#vfView .vf-pill{flex:0 0 auto;height:40px;padding:0 16px;border-radius:999px;border:1px solid #D9E0EB;background:#fff;color:#0A1F44;font:800 14px/1 inherit;font-family:inherit;cursor:pointer;white-space:nowrap}'
    + '#vfView .vf-pill small{font-weight:600;color:#6B7487;margin-left:6px;font-size:12px}'
    + '#vfView .vf-pill[aria-pressed="true"]{background:#0A1F44;color:#fff;border-color:#0A1F44}'
    + '#vfView .vf-pill[aria-pressed="true"] small{color:#C9D2E6}'
    + '#vfView .vf-bar{display:flex;gap:10px;align-items:end;margin:8px 0 2px;max-width:320px}'
    + '#vfView .vf-count,#vfView .vf-note{margin:10px 0;color:#5B6475;font-size:14px;line-height:1.45}'
    + '#vfView .vf-none{margin-top:20px}'
    + '#vfView .vf-none h3{margin:0 0 4px;font-size:18px;color:#0A1F44}'
    + '#vfView .vf-more{flex:0 0 auto;align-self:center;height:46px;padding:0 18px;border-radius:12px;border:1px solid #0A1F44;background:#fff;color:#0A1F44;font:800 14px/1 inherit;font-family:inherit;cursor:pointer}'
    + '#vfView .card .price .usd{font-size:12px;color:#6B7487}';
  function css(){
    if (document.getElementById('vf-css')) return;
    var st = document.createElement('style'); st.id = 'vf-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  var XI = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  function chipHTML(v){ var t = 'Vehículo: ' + label(v); return '<button type="button" class="vf-chip" data-vf-x aria-label="Quitar ' + esc(t) + '">' + esc(t) + XI + '</button>'; }

  /* One select: a placeholder, then only the options with products. */
  function selHTML(field, title, list, cur, ph, disabled){
    var opts = (list || []).slice();
    if (cur && !opts.some(function(o){ return o[0] === cur; })) opts.unshift([cur, cur, null]);
    return '<label class="vf-f' + (field === 't' ? ' vf-t' : '') + '"><span>' + esc(title) + '</span><select data-vf="' + field + '"' + (disabled ? ' disabled' : '') + (cur ? ' class="has"' : '') + ' aria-label="' + esc(title) + '">'
      + '<option value="">' + esc(ph) + '</option>'
      + opts.map(function(o){ return '<option value="' + esc(o[0]) + '"' + (o[0] === cur ? ' selected' : '') + '>' + esc(o[1]) + (o[2] != null ? ' (' + num(o[2]) + ')' : '') + '</option>'; }).join('')
      + '</select></label>';
  }
  /* Aria Auto's cascade: a new year clears the make and model; a new make, the model. */
  function next(v, field, val, d){
    var n = clean(v);
    if (field === 'y') { n.y = val; n.mk = ''; n.md = ''; }
    else if (field === 'mk') { n.mk = val; n.md = ''; }
    else if (field === 'md') n.md = val;
    var f = (d && d.facets) || {};
    var lab = function(list, k){ var m = (list || []).filter(function(o){ return o[0] === k; })[0]; return m ? m[1] : ''; };
    n.mkL = n.mk ? (lab(f.mk, n.mk) || (n.mk === v.mk ? v.mkL : '')) : '';
    n.mdL = n.md ? (lab(f.md, n.md) || (n.md === v.md ? v.mdL : '')) : '';
    return clean(n);
  }

  /* ================= «TU VEHÍCULO»: the card that opens the view ================= */
  function cardMode(anchor, before, intro){
    css();
    var card = document.createElement('section');
    card.className = 'vf-card'; card.id = 'vfCard'; card.setAttribute('aria-label', 'Tu vehículo');
    anchor.parentNode.insertBefore(card, before ? anchor : anchor.nextSibling);
    var v = saved() || clean({}), t = '', D = null, SEQ = 0;
    function draw(d){
      D = d;
      if (d && d.v){ v.mkL = d.v.mkL || v.mkL; v.mdL = d.v.mdL || v.mdL; }
      var f = (d && d.facets) || {}, n = d ? d.count : 0;
      card.innerHTML = '<h2>Tu vehículo</h2><p>' + esc(intro) + '</p>'
        + (has(v) ? chipHTML(v) : '')
        + selHTML('t', 'Tipo de repuesto', f.t, t, 'Todos los tipos')
        + selHTML('y', 'Año', f.y, v.y, 'Elige el año')
        + selHTML('mk', 'Marca del vehículo', f.mk, v.mk, 'Elige la marca')
        + selHTML('md', 'Modelo', f.md, v.md, v.mk ? 'Elige el modelo' : 'Primero la marca', !v.mk)
        + (full(v) && n
          ? '<a class="vf-go" id="vfGo" href="' + esc(viewUrl({ v: v, t: t })) + '">Ver ' + num(n) + (n === 1 ? ' repuesto' : ' repuestos') + ' para tu ' + esc(label(v)) + '</a>'
          : '<a class="vf-go" id="vfGo" aria-disabled="true" href="' + esc(viewUrl({ v: v, t: t })) + '">' + (full(v) ? 'Aún no hay repuestos catalogados para tu ' + esc(label(v)) : 'Elige año, marca y modelo') + '</a>');
    }
    function load(){
      var seq = ++SEQ;
      ask(v, { t: t }).then(function(d){
        if (seq !== SEQ) return;
        /* a type this vehicle has no parts for is dropped, never offered empty */
        if (t && !((d.facets && d.facets.t) || []).some(function(o){ return o[0] === t; })) { t = ''; return load(); }
        draw(d);
      }).catch(function(){ if (seq === SEQ) card.innerHTML = '<h2>Tu vehículo</h2><p>No pudimos cargar los vehículos. Revisa tu conexión e inténtalo de nuevo.</p>'; });
    }
    card.addEventListener('change', function(e){
      var s = e.target.closest('select[data-vf]');
      if (!s) return;
      var f = s.getAttribute('data-vf');
      if (f === 't') t = s.value;
      else { v = next(v, f, s.value, D); save(v); }
      load();
    });
    card.addEventListener('click', function(e){ if (e.target.closest('[data-vf-x]')) { v = clean({}); save(null); load(); } });
    card.innerHTML = '<h2>Tu vehículo</h2><p>Cargando…</p>';
    load();
  }

  /* On an auto store, the store's own «Marca» filter is the part's brand. */
  function partBrandLabels(root){
    if (!root || typeof MutationObserver !== 'function') return;
    function fix(){
      var b = root.querySelector('[data-nf-btn="b"]');
      var bt = b && (b.querySelector('span') || b.firstChild);
      if (bt && bt.textContent === 'Marca') bt.textContent = 'Marca del repuesto';
      Array.prototype.forEach.call(root.querySelectorAll('[data-dd="b"] .nf-pan h4, .nf-pan h4'), function(h){ if (h.textContent === 'Marca') h.textContent = 'Marca del repuesto'; });
      Array.prototype.forEach.call(root.querySelectorAll('[data-nf-x]'), function(x){ var n = x.firstChild; if (n && n.nodeType === 3 && /^Marca: /.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/^Marca: /, 'Marca del repuesto: '); });
    }
    new MutationObserver(fix).observe(root, { childList: true, subtree: true });
    fix();
  }

  /* ================= THE VIEW, IN ARIA AUTO ================= */
  function finderMode(drawHere){
    var y = document.getElementById('autoYear'), mk = document.getElementById('autoMake'), md = document.getElementById('autoModel');
    if (!y || !mk || !md) return;
    css();
    var MINE = false, box = null, SEQ = 0, STATE = { v: clean({}), t: '', b: '' }, PAGE = 0, LAST = null;
    function readState(){
      var sp = new URLSearchParams(location.search);
      return { v: fromUrl(), t: slug(sp.get('t')), b: String(sp.get('b') || '').trim().toLowerCase().slice(0, 80) };
    }
    function writeState(s, push, keepHash){
      var u = new URL(location.href);
      ['vy', 'vmk', 'vmd', 't', 'b', 'page'].forEach(function(k){ u.searchParams.delete(k); });
      var q = qOf(s.v, { t: s.t, b: s.b });
      var url = u.pathname + (q ? '?' + q : '') + (s.v.y && !keepHash ? '#buscar' : u.hash);
      try { history[push ? 'pushState' : 'replaceState']({ vf: 1 }, '', url); } catch(e){}
    }
    function pick(sel, want){
      for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value && slug(sel.options[i].value) === want){ sel.value = sel.options[i].value; MINE = true; try { sel.dispatchEvent(new Event('change', { bubbles: true })); } finally { MINE = false; } return true; }
      return false;
    }
    /* Aria Auto's own selector shows the vehicle (its own change handlers run). */
    function toSelects(v){
      if (!full(v)) return;
      if (slug(y.value) === v.y && slug(mk.value) === v.mk && slug(md.value) === v.md) return;
      if (pick(y, v.y) && pick(mk, v.mk)) pick(md, v.md);
    }
    function fromSelects(){ return clean({ y: y.value, mk: mk.value, md: md.value, mkL: mk.value, mdL: md.value }); }

    function host(){
      if (box) return box;
      var anchor = document.getElementById('aaFinder') || document.getElementById('results');
      box = document.createElement('section');
      box.id = 'vfView'; box.setAttribute('aria-live', 'polite'); box.setAttribute('aria-label', 'Repuestos para tu vehículo');
      anchor.parentNode.insertBefore(box, anchor.nextSibling);
      box.addEventListener('click', onClick);
      box.addEventListener('change', onChange);
      return box;
    }
    function rate(){ try { return typeof window.pageRate === 'function' ? window.pageRate() : Promise.resolve(0); } catch(e){ return Promise.resolve(0); } }
    function money(n){ return 'S/ ' + Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function priceHTML(c, fx){
      var usd = typeof window.finalUsd === 'function' ? window.finalUsd(c.p, c.r) : NaN;
      if (!(usd > 0)) return '';
      var was = c.o && typeof window.finalUsd === 'function' ? window.finalUsd(c.o, c.r) : 0;
      /* Soles only, the IMP line directly under them (#443 c.6629812301,
         Danny: "we only show soles. Then we show the import underneath").
         Without a rate, soles placeholders that /import-tax.js fills when one
         lands -- never dollars. */
      var F = window.AriaImportTax && window.AriaImportTax.fx;
      var r = fx > 0 ? fx : (F ? F.now() : 0);
      var soles = function(n, cls){ return r ? (cls ? '<span class="' + cls + '">' : '') + esc(money(n * r)) + (cls ? '</span>' : '') : (F ? F.slot(n, { cls: cls || '' }) : 'S/ \u2026'); };
      return '<div class="price" data-usd="' + usd + '"><div class="pen">' + soles(usd) + (was > usd ? soles(was, 'was') : '') + '</div></div>'
        /* THE IMPORT TAX UNDER THE PRICE (#443 c.6592753099): /import-tax.js. */
        + (window.AriaImportTax ? window.AriaImportTax.lineHTML({ raw: c.p, retailer: c.r, title: c.t }) : '');
    }
    var STORE = { autozone: 'AutoZone', advanceauto: 'Advance Auto Parts' };
    function cardHTML(c, fx){
      if (!c || !c.i || !c.t) return '';
      var href = 'producto.html?producto=' + encodeURIComponent(c.t) + (c.r ? '&tienda=' + encodeURIComponent(c.r) : '');
      return '<a class="card" href="' + esc(href) + '"><div class="card-img">' + (c.s > 0 ? '<span class="badge">-' + (c.s | 0) + '%</span>' : '')
        + '<img src="' + esc(c.i) + '" alt="" width="560" height="560" loading="lazy" decoding="async" onerror="var a=this.closest(\'.card\');if(a)a.remove();"></div>'
        + '<div class="card-body"><div class="card-retailer">' + esc(STORE[c.r] || c.r) + '</div><div class="card-brand">' + (c.b ? esc(c.b) : '&nbsp;') + '</div>'
        + '<h3 class="card-title">' + esc(c.t) + '</h3>' + priceHTML(c, fx) + '</div></a>';
    }
    function load(page){
      var s = STATE, seq = ++SEQ;
      if (!full(s.v)) { if (box) box.innerHTML = ''; return; }
      PAGE = page || 0;
      if (!PAGE) { host().innerHTML = '<h2>Buscando repuestos para tu ' + esc(label(s.v)) + '…</h2>'; }
      Promise.all([ask(s.v, { t: s.t, b: s.b, page: PAGE }), rate()]).then(function(res){
        if (seq !== SEQ) return;
        var d = res[0], fx = res[1] || 0;
        /* a type or brand the vehicle has no parts for is dropped, never shown empty */
        if (!PAGE && ((s.t && !(d.facets.t || []).some(function(o){ return o[0] === s.t; })) || (s.b && !(d.facets.b || []).some(function(o){ return o[0] === s.b; })))) {
          if (!(d.facets.t || []).some(function(o){ return o[0] === s.t; })) s.t = '';
          if (!(d.facets.b || []).some(function(o){ return o[0] === s.b; })) s.b = '';
          writeState(s, false); return load(0);
        }
        s.v.mkL = d.v.mkL || s.v.mkL; s.v.mdL = d.v.mdL || s.v.mdL;
        save(s.v);
        if (PAGE) return more(d, fx);
        LAST = d;
        paint(d, fx);
      }).catch(function(){ if (seq === SEQ) host().innerHTML = '<p class="vf-note">No pudimos cargar los repuestos. Revisa tu conexión e inténtalo de nuevo.</p>'; });
    }
    function paint(d, fx){
      var s = STATE, f = d.facets || {};
      var all = 0; (f.t || []).forEach(function(o){ all += o[2]; });
      var pills = '<button type="button" class="vf-pill" data-vf-t="" aria-pressed="' + (!s.t) + '">Todo</button>'
        + (f.t || []).map(function(o){ return '<button type="button" class="vf-pill" data-vf-t="' + esc(o[0]) + '" aria-pressed="' + (s.t === o[0]) + '">' + esc(o[1]) + '<small>' + num(o[2]) + '</small></button>'; }).join('');
      var brands = (f.b || []).length > 1 || s.b ? '<div class="vf-bar">' + selHTML('b', 'Marca del repuesto', f.b, s.b, 'Todas las marcas') + '</div>' : '';
      var cards = (d.cards || []).map(function(c){ return cardHTML(c, fx); }).join('');
      var none = d.none && d.none.count ? '<section class="vf-none" id="vfNone" aria-label="Universal / sin datos de compatibilidad"><h3>Universal / sin datos de compatibilidad <small>(' + num(d.none.count) + ')</small></h3>'
        + '<p class="vf-note">La tienda no publica con qué vehículos calzan estos repuestos, o son universales. No te decimos que le calzan a tu auto: confirma el número de parte antes de pedir.</p>'
        + '<div class="rail" id="vfNoneRail">' + d.none.cards.map(function(c){ return cardHTML(c, fx); }).join('') + '</div></section>' : '';
      host().innerHTML = '<div class="vf-head"><h2 style="margin:0">' + esc((d.tl || 'Repuestos') + ' para tu ' + label(s.v)) + '</h2>' + chipHTML(s.v) + '</div>'
        + '<nav class="vf-pills" aria-label="Tipo de repuesto">' + pills + '</nav>' + brands
        + '<p class="vf-count" id="vfCount">' + (d.count ? num(d.count) + (d.count === 1 ? ' repuesto catalogado' : ' repuestos catalogados') + ' para tu ' + esc(label(s.v)) + '.' : 'Aún no tenemos repuestos catalogados para tu ' + esc(label(s.v)) + '.') + '</p>'
        + '<div class="rail" id="vfRail">' + cards + (d.pages > 1 ? '<button type="button" class="vf-more" data-vf-more>Ver más</button>' : '') + '</div>'
        + none;
    }
    function more(d, fx){
      var rail = document.getElementById('vfRail'); if (!rail) return;
      var m = rail.querySelector('[data-vf-more]'); if (m) m.remove();
      rail.insertAdjacentHTML('beforeend', (d.cards || []).map(function(c){ return cardHTML(c, fx); }).join('') + (d.pages > PAGE + 1 ? '<button type="button" class="vf-more" data-vf-more>Ver más</button>' : ''));
    }
    function go(s, push, scroll){
      STATE = s; writeState(s, push); load(0);
      if (scroll && box) try { box.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e){}
    }
    function onClick(e){
      var p = e.target.closest('[data-vf-t]');
      if (p) return go({ v: STATE.v, t: p.getAttribute('data-vf-t'), b: STATE.b }, true);
      if (e.target.closest('[data-vf-more]')) { e.target.closest('[data-vf-more]').disabled = true; return load(PAGE + 1); }
      if (e.target.closest('[data-vf-x]')) {
        save(null); STATE = { v: clean({}), t: '', b: '' }; writeState(STATE, true);
        if (box) box.innerHTML = '';
        y.value = ''; MINE = true; try { y.dispatchEvent(new Event('change', { bubbles: true })); } finally { MINE = false; }
      }
    }
    function onChange(e){
      var s = e.target.closest('select[data-vf="b"]');
      if (s) go({ v: STATE.v, t: STATE.t, b: s.value }, true);
    }
    /* The shopper's own pick in the selector: the view follows. */
    [y, mk, md].forEach(function(s){
      s.addEventListener('change', function(ev){
        if (MINE) return;
        var v = fromSelects();
        if (full(v)) { save(v); if (drawHere) go({ v: v, t: STATE.t, b: '' }, true); }
        else if (drawHere && full(STATE.v)) { STATE = { v: clean({}), t: '', b: '' }; writeState(STATE, true); if (box) box.innerHTML = ''; }
      });
    });
    /* A part name plus a vehicle opens the view; a part number, or a word
       the catalogue does not name, stays with the finder's own search. */
    function route(orig){
      var sv = window.selectedVehicle, qEl = document.getElementById('partQuery'), q = qEl ? qEl.value.trim() : '';
      if (!sv || !q || typeof window.getIndex !== 'function' || typeof window.matchQuery !== 'function') return orig();
      var v = clean({ y: sv.year, mk: sv.make, md: sv.model, mkL: sv.make, mdL: sv.model });
      window.getIndex().then(function(idx){
        var m = window.matchQuery(q, idx);
        if (!idx || m.exact < 0 || m.pn) return orig();
        var part = idx.parts[m.exact];
        return ask(v, {}).then(function(d){
          var hit = ((d.facets && d.facets.t) || []).filter(function(o){ return slug(o[1]) === slug(part.es); })[0];
          if (!hit || !(hit[2] > 0)) return orig();
          save(v);
          var r = document.getElementById('results'); if (r){ r.classList.add('hidden'); r.innerHTML = ''; }
          if (drawHere) go({ v: v, t: hit[0], b: '' }, true, true);
          else location.assign(viewUrl({ v: v, t: hit[0] }));
        });
      }).catch(function(){ orig(); });
    }
    function wrap(){
      var orig = window.doSearch;
      if (typeof orig !== 'function' || orig.vf) return;
      var w = function(){ route(function(){ orig(); }); };
      w.vf = 1;
      window.doSearch = w;
    }
    document.addEventListener('click', function(e){
      if (!e.target.closest || !e.target.closest('#searchBtn') || !window.doSearch || !window.doSearch.vf) return;
      e.stopPropagation(); e.preventDefault();
      window.doSearch();
    }, true);
    window.addEventListener('popstate', function(){
      if (!drawHere) return;
      STATE = readState(); toSelects(STATE.v);
      if (full(STATE.v)) load(0); else if (box) box.innerHTML = '';
    });
    function start(){
      wrap();
      var s = readState();
      if (!full(s.v)) { var k = saved(); if (full(k)) { s = { v: k, t: '', b: '' }; if (drawHere) writeState(s, false, true); } }
      toSelects(s.v);
      if (drawHere && full(s.v)) {
        STATE = s; load(0);
        if (location.hash === '#buscar') setTimeout(function(){ if (box) try { box.scrollIntoView({ block: 'start' }); } catch(e){} }, 400);
      }
    }
    /* After the finder's own init (it runs on DOMContentLoaded too, registered first). */
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else setTimeout(start, 0);
  }

  /* ---------- where am I ---------- */
  var sp = new URLSearchParams(location.search), path = location.pathname;
  function ready(fn){ if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
  if (/departamento(\.html)?$/.test(path) && FIT_DEPTS[sp.get('dept')]){
    ready(function(){ var h = document.getElementById('deptHero'); if (h) cardMode(h, false, 'Elige tu vehículo y el tipo de repuesto: en Aria Auto te mostramos los que están catalogados para tu auto, con el precio en soles.'); });
  } else if (/tienda(\.html)?$/.test(path) && FIT_STORES[sp.get('tienda')]){
    ready(function(){
      var w = document.getElementById('storeWrap'), tb = w && w.querySelector('.toolbar');
      if (tb) cardMode(tb, true, 'Esta tienda no publica con qué vehículos calza cada repuesto. Elige tu vehículo y en Aria Auto te mostramos los repuestos catalogados para tu auto, en un solo lugar.');
      partBrandLabels(w);
    });
  } else if (document.getElementById('autoYear')) {
    /* aria-auto.html draws the view; auto.html (the same finder) opens it. */
    finderMode(/aria-auto(\.html)?$|^\/auto\/?$|^\/$/.test(path) || !!document.getElementById('aaFinder'));
  }
})();

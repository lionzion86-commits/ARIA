/* ==================================================================
   THE VEHICLE, EVERYWHERE AUTO PARTS ARE SOLD (#443 c.6620267344,
   amended c.6620289895). One fitment system, never parallel copies.

   - THE DATA is Aria Auto's own: the vehicles AutoZone catalogues each
     part for (auto-cache.json -> assets/sections/auto/_fn/fitment.json,
     scripts/build-fitment.mjs), with the make and model names of Aria
     Auto's selector. The phone never downloads it: every option and
     count comes from the filter bar's engine
     (/.netlify/functions/nav-filter, _fitment-core.js).
   - THE PARAMS are the same on every page: vy=<año>, vmk=<marca>,
     vmd=<modelo> (Aria Auto's slug: «3 Series» -> 3-series).
   - ONE PLACE: a part type plus a vehicle, chosen from the department,
     an auto store or Aria Auto, lands on the same view --
     departamento.html?dept=auto_parts&nav=1&t=<tipo>&vy=&vmk=&vmd=
     (viewUrl below) -- with the same filters and the same results.
   - THE VEHICLE STAYS: it is kept in this browser (aria_vehicle_v1) and
     applied on the next auto page, shown as a removable chip
     («Vehículo: 2011 BMW 3 Series ×»).
   - HONEST: only a year, make or model some product fits is offered,
     each with its count under every other filter. A product with no
     vehicle data is never shown as fitting: with a vehicle chosen it is
     listed apart, «Universal / sin datos de compatibilidad».

   Three places use it:
     departamento.html?dept=auto_parts&nav=1  the vehicle row on the
                                              filter bar (nav-filter.js)
     departamento.html?dept=auto_parts,
     tienda.html?tienda=<auto store>          the vehicle card, which
                                              opens the view
     aria-auto.html, auto.html                Aria Auto's own selector
                                              (Año / Marca / Modelo):
                                              restored, kept, and a part
                                              plus a vehicle opens the view
   ================================================================== */
(function(){
  'use strict';
  var STORE_KEY = 'aria_vehicle_v1';
  var DEPT = 'auto_parts';
  var FIT_DEPTS = { auto_parts: 1 };
  /* The auto-parts stores (scripts/lib/retailers.js kind "auto"). */
  var FIT_STORES = { advanceauto: 1, autozone: 1 };
  var ENDPOINT = '/.netlify/functions/nav-filter';
  var VK = ['vy', 'vmk', 'vmd'];

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
  function label(v){
    if (!has(v)) return '';
    return [v.y, v.mkL || v.mk, v.mdL || v.md].filter(Boolean).join(' ');
  }
  /* ---------- the kept vehicle ---------- */
  function saved(){
    try { var v = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); return has(v) ? clean(v) : null; } catch(e){ return null; }
  }
  function save(v){
    try { if (has(v)) localStorage.setItem(STORE_KEY, JSON.stringify(clean(v))); else localStorage.removeItem(STORE_KEY); } catch(e){}
  }
  /* ---------- the URL ---------- */
  function fromUrl(){
    var sp = new URLSearchParams(location.search);
    return clean({ y: sp.get('vy'), mk: sp.get('vmk'), md: sp.get('vmd') });
  }
  function query(){
    var v = fromUrl(), q = '';
    if (v.y) q += '&vy=' + encodeURIComponent(v.y);
    if (v.mk) q += '&vmk=' + encodeURIComponent(v.mk);
    if (v.md) q += '&vmd=' + encodeURIComponent(v.md);
    return q;
  }
  function writeUrl(v, push){
    var u = new URL(location.href);
    var vals = { vy: v.y, vmk: v.mk, vmd: v.md };
    VK.forEach(function(k){ if (vals[k]) u.searchParams.set(k, vals[k]); else u.searchParams.delete(k); });
    try { history[push ? 'pushState' : 'replaceState'](push ? { nf: 1 } : history.state, '', u.pathname + u.search + u.hash); } catch(e){}
  }
  /* THE ONE VIEW: a part type plus a vehicle, from any entry point. */
  function viewUrl(o){
    o = o || {};
    var v = clean(o.v), q = '/departamento.html?dept=' + DEPT + '&nav=1';
    if (o.t) q += '&t=' + encodeURIComponent(o.t);
    if (v.y) q += '&vy=' + encodeURIComponent(v.y);
    if (v.mk) q += '&vmk=' + encodeURIComponent(v.mk);
    if (v.md) q += '&vmd=' + encodeURIComponent(v.md);
    return q;
  }
  function ask(v, t){
    var q = ENDPOINT + '?dept=' + DEPT + (t ? '&t=' + encodeURIComponent(t) : '');
    if (v.y) q += '&vy=' + encodeURIComponent(v.y);
    if (v.mk) q += '&vmk=' + encodeURIComponent(v.mk);
    if (v.md) q += '&vmd=' + encodeURIComponent(v.md);
    return fetch(q).then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }

  window.AriaVehicle = { key: STORE_KEY, slug: slug, saved: saved, save: save, fromUrl: fromUrl, query: query, viewUrl: viewUrl, label: label };

  var CSS = ''
    + '.vf-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:12px 20px 0;align-items:end}'
    + '.vf-row h3,.vf-card h2{grid-column:1/-1;margin:0;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#6B7487}'
    + '.vf-f{display:flex;flex-direction:column;gap:4px;min-width:0}'
    + '.vf-f span{font-size:12px;font-weight:700;color:#3B4458;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.vf-f select{width:100%;min-width:0;height:42px;padding:0 8px;border:1px solid #D9E0EB;border-radius:10px;background:#fff;color:#0A1F44;font:700 14px/1 inherit;font-family:inherit}'
    + '.vf-f select:disabled{background:#F3F5F9;color:#8A93A8}'
    + '.vf-f select.has{border-color:#0A1F44;box-shadow:inset 0 0 0 1px #0A1F44}'
    + '.vf-note{margin:8px 20px 0;color:#6B7487;font-size:13.5px;line-height:1.45}'
    + '.vf-none{margin-top:18px}'
    + '.vf-none .vf-note{margin:0 20px 10px}'
    + '.vf-card{max-width:1240px;margin:14px auto 4px;padding:16px;border:1px solid #E4E6EC;border-radius:16px;background:#F7F9FC;box-sizing:border-box;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}'
    + '.vf-card p{grid-column:1/-1;margin:0;color:#3B4458;font-size:13.5px;line-height:1.45}'
    + '.vf-card .vf-t{grid-column:1/-1}'
    + '.vf-go{grid-column:1/-1;display:flex;align-items:center;justify-content:center;min-height:46px;padding:0 16px;border-radius:12px;background:#0A1F44;color:#fff;font-weight:800;font-size:15px;text-decoration:none;text-align:center}'
    + '.vf-go[aria-disabled="true"]{background:#C9D2E6;color:#fff;pointer-events:none}'
    + '.vf-chip{grid-column:1/-1;justify-self:start;height:34px;padding:0 8px 0 12px;border-radius:999px;border:0;background:#EAF0FA;color:#0A1F44;font:700 13px/1 inherit;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px}'
    + '@media (min-width:640px){.vf-row{grid-template-columns:repeat(3,minmax(0,220px))}.vf-card{grid-template-columns:2fr 1fr 1.4fr 1.4fr;align-items:end}.vf-card .vf-t{grid-column:auto}}';
  function css(){
    if (document.getElementById('vf-css')) return;
    var st = document.createElement('style'); st.id = 'vf-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  var XI = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  /* One select: a placeholder, then only the options with products. */
  function selHTML(field, title, list, cur, ph, disabled){
    var opts = (list || []).slice();
    if (cur && !opts.some(function(o){ return o[0] === cur; })) opts.unshift([cur, cur, null]);
    return '<label class="vf-f"><span>' + esc(title) + '</span><select data-vf="' + field + '"' + (disabled ? ' disabled' : '') + (cur ? ' class="has"' : '') + ' aria-label="' + esc(title) + '">'
      + '<option value="">' + esc(ph) + '</option>'
      + opts.map(function(o){ return '<option value="' + esc(o[0]) + '"' + (o[0] === cur ? ' selected' : '') + '>' + esc(o[1]) + (o[2] != null ? ' (' + num(o[2]) + ')' : '') + '</option>'; }).join('')
      + '</select></label>';
  }
  function vehicleSelects(fit, v){
    var f = (fit && fit.facets) || {};
    return selHTML('y', 'Año', f.y, v.y, 'Elige el año')
      + selHTML('mk', 'Marca del vehículo', f.mk, v.mk, 'Elige la marca')
      + selHTML('md', 'Modelo', f.md, v.md, v.mk ? 'Elige el modelo' : 'Primero la marca', !v.mk);
  }
  /* Aria Auto's cascade: a new year clears the make and model; a new make, the model. */
  function next(v, field, val, fit){
    var n = clean(v);
    if (field === 'y') { n.y = val; n.mk = ''; n.md = ''; }
    else if (field === 'mk') { n.mk = val; n.md = ''; }
    else if (field === 'md') n.md = val;
    var f = (fit && fit.facets) || {};
    var lab = function(list, k){ var m = (list || []).filter(function(o){ return o[0] === k; })[0]; return m ? m[1] : ''; };
    n.mkL = n.mk ? (lab(f.mk, n.mk) || (n.mk === v.mk ? v.mkL : '')) : '';
    n.mdL = n.md ? (lab(f.md, n.md) || (n.md === v.md ? v.mdL : '')) : '';
    return clean(n);
  }

  /* ================= 1. THE FILTER BAR (departamento.html?dept=auto_parts&nav=1) ================= */
  function barMode(){
    css();
    /* The kept vehicle applies before the bar asks (nav-filter.js runs after this file). */
    var cur = fromUrl();
    if (!has(cur)) { var s = saved(); if (s) writeUrl(s, false); }
    var LAST = null;
    document.addEventListener('aria:nf-paint', function(e){ paint(e.detail); });
    function paint(d){
      var fit = d && d.fit;
      if (!fit) return;
      LAST = fit;
      var v = fromUrl();
      v.mkL = (fit.v && fit.v.mkL) || ''; v.mdL = (fit.v && fit.v.mdL) || '';
      if (has(v)) save(v);
      /* the row */
      var bar = document.getElementById('nfBar');
      var row = document.getElementById('vfRow');
      if (!row && bar){
        row = document.createElement('div'); row.className = 'vf-row'; row.id = 'vfRow'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Tu vehículo');
        bar.parentNode.insertBefore(row, bar);
        row.addEventListener('change', function(ev){
          var s = ev.target.closest('select[data-vf]');
          if (!s) return;
          var n = next(fromUrl(), s.getAttribute('data-vf'), s.value, LAST);
          save(n); writeUrl(n, true);
          if (window.AriaNF) window.AriaNF.run();
        });
      }
      if (row) row.innerHTML = '<h3>Tu vehículo</h3>' + vehicleSelects(fit, v);
      /* the part brand is the part's, the make is the car's */
      relabel();
      /* the chip */
      var sel = document.getElementById('nfSel');
      if (sel){
        var old = sel.querySelector('[data-vf-x]'); if (old) old.remove();
        if (has(v)){
          var t = 'Vehículo: ' + label(v);
          sel.insertAdjacentHTML('afterbegin', '<button type="button" class="nf-x" data-vf-x aria-label="Quitar ' + esc(t) + '">' + esc(t) + XI + '</button>');
          sel.hidden = false;
        }
      }
      /* what the count means */
      var note = document.getElementById('vfNote');
      if (!note && row){ note = document.createElement('p'); note.className = 'vf-note'; note.id = 'vfNote'; row.parentNode.insertBefore(note, row.nextSibling); }
      if (note){
        note.textContent = !has(v)
          ? 'Elige tu vehículo para ver solo los repuestos que le calzan.'
          : full(v)
            ? (d.count ? num(d.count) + (d.count === 1 ? ' repuesto catalogado' : ' repuestos catalogados') + ' para tu ' + label(v) + '.' : 'Aún no tenemos repuestos de este tipo catalogados para tu ' + label(v) + '.')
            : 'Elige ' + (!v.y ? 'el año' : !v.mk ? 'la marca' : 'el modelo') + ' para ver solo lo que calza con tu auto.';
      }
      /* the products with no vehicle data, apart */
      var res = document.getElementById('nfRes');
      var box = document.getElementById('vfNone');
      if (box) box.remove();
      if (res && has(v) && fit.none && fit.none.count && window.AriaDept){
        var D = window.AriaDept;
        res.insertAdjacentHTML('afterend', '<section class="rail-sec vf-none" id="vfNone" aria-label="Universal / sin datos de compatibilidad"><div class="rail-head"><h2>Universal / sin datos de compatibilidad</h2><span class="rail-count">' + num(fit.none.count) + '</span></div>'
          + '<p class="vf-note">La tienda no publica con qué vehículos calzan estos repuestos, o son universales. No te decimos que le calzan a tu auto: confirma el número de parte antes de pedir.</p>'
          + '<div class="rail" id="vfNoneRail">' + (fit.none.cards || []).map(D.cardHTML).join('') + '</div></section>');
        var r = document.getElementById('vfNoneRail');
        D.watchPhotos(r); D.paintPrices(r);
      }
    }
    function relabel(){
      var b = document.querySelector('[data-nf-btn="b"]');
      if (b && b.firstChild && b.firstChild.nodeType === 3) b.firstChild.nodeValue = 'Marca del repuesto';
      var x = document.querySelector('[data-nf-x="b"]');
      if (x && x.firstChild && x.firstChild.nodeType === 3) x.firstChild.nodeValue = x.firstChild.nodeValue.replace(/^Marca:/, 'Marca del repuesto:');
      var h = document.querySelector('[data-dd="b"] .nf-pan h4');
      if (h) h.textContent = 'Marca del repuesto';
    }
    document.addEventListener('click', function(e){
      if (e.target.closest('[data-vf-x]')){
        save(null); writeUrl(clean({}), true);
        if (window.AriaNF) window.AriaNF.run();
        return;
      }
      /* «Limpiar todo» takes the vehicle too (before the bar's own handler). */
      if (e.target.closest('[data-nf-clear]')){ save(null); writeUrl(clean({}), false); }
    }, true);
    /* the brand panel opens with the bar's own heading: name it the part's */
    var obs = null;
    document.addEventListener('aria:nf-paint', function(){
      var bar = document.getElementById('nfBar');
      if (obs || !bar || typeof MutationObserver !== 'function') return;
      obs = new MutationObserver(function(){ var h = bar.querySelector('[data-dd="b"] .nf-pan h4'); if (h && h.textContent !== 'Marca del repuesto') h.textContent = 'Marca del repuesto'; });
      obs.observe(bar, { childList: true, subtree: true });
    });
  }

  /* ================= 2. THE VEHICLE CARD (an auto store; the department's landing) ================= */
  function cardMode(anchor, before, intro){
    css();
    var card = document.createElement('section');
    card.className = 'vf-card'; card.id = 'vfCard'; card.setAttribute('aria-label', 'Busca repuestos para tu vehículo');
    if (before) anchor.parentNode.insertBefore(card, anchor); else anchor.parentNode.insertBefore(card, anchor.nextSibling);
    var v = saved() || clean({}), t = '', FIT = null, SEQ = 0;
    function draw(d){
      var fit = d && d.fit;
      FIT = fit;
      if (fit && fit.v){ v.mkL = fit.v.mkL || v.mkL; v.mdL = fit.v.mdL || v.mdL; }
      var types = (d && d.facets && d.facets.t) || [];
      var n = d ? d.count : 0;
      card.innerHTML = '<h2>Busca repuestos para tu vehículo</h2>'
        + '<p>' + esc(intro) + '</p>'
        + (has(v) ? '<button type="button" class="vf-chip" data-vf-x aria-label="Quitar Vehículo: ' + esc(label(v)) + '">Vehículo: ' + esc(label(v)) + XI + '</button>' : '')
        + '<label class="vf-f vf-t"><span>Tipo de repuesto</span><select data-vf="t" aria-label="Tipo de repuesto"' + (t ? ' class="has"' : '') + '><option value="">Todos los tipos</option>'
        + types.map(function(o){ return '<option value="' + esc(o[0]) + '"' + (o[0] === t ? ' selected' : '') + '>' + esc(o[1]) + ' (' + num(o[2]) + ')</option>'; }).join('') + '</select></label>'
        + vehicleSelects(fit, v)
        + (has(v) && n
          ? '<a class="vf-go" id="vfGo" href="' + esc(viewUrl({ t: t, v: v })) + '">Ver ' + num(n) + (n === 1 ? ' repuesto' : ' repuestos') + ' para tu ' + esc(label(v)) + '</a>'
          : '<a class="vf-go" id="vfGo" aria-disabled="true" href="' + esc(viewUrl({ t: t, v: v })) + '">' + (has(v) ? 'Aún no hay repuestos catalogados para tu ' + esc(label(v)) : 'Elige tu vehículo') + '</a>');
    }
    function load(){
      var seq = ++SEQ;
      ask(v, t).then(function(d){
        if (seq !== SEQ) return;
        /* a kept type the vehicle has no parts for is dropped, not offered empty */
        if (t && !((d.facets && d.facets.t) || []).some(function(o){ return o[0] === t; })) { t = ''; return load(); }
        draw(d);
      }).catch(function(){ if (seq === SEQ) card.innerHTML = '<h2>Busca repuestos para tu vehículo</h2><p>No pudimos cargar los vehículos. Revisa tu conexión e inténtalo de nuevo.</p>'; });
    }
    card.addEventListener('change', function(e){
      var s = e.target.closest('select[data-vf]');
      if (!s) return;
      var f = s.getAttribute('data-vf');
      if (f === 't') t = s.value;
      else { v = next(v, f, s.value, FIT); save(v); }
      load();
    });
    card.addEventListener('click', function(e){
      if (e.target.closest('[data-vf-x]')) { v = clean({}); save(null); load(); }
    });
    card.innerHTML = '<h2>Busca repuestos para tu vehículo</h2><p>Cargando…</p>';
    load();
  }

  /* ================= 3. ARIA AUTO'S OWN SELECTOR ================= */
  function finderMode(){
    var y = document.getElementById('autoYear'), mk = document.getElementById('autoMake'), md = document.getElementById('autoModel');
    if (!y || !mk || !md) return;
    function pick(sel, want){
      for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value && slug(sel.options[i].value) === want){ sel.value = sel.options[i].value; sel.dispatchEvent(new Event('change', { bubbles: true })); return true; }
      return false;
    }
    function restore(){
      var s = fromUrl(); if (!has(s)) s = saved();
      if (!s || !s.y || y.value) return;
      if (pick(y, s.y) && s.mk && pick(mk, s.mk) && s.md) pick(md, s.md);
    }
    function keep(){
      var v = clean({ y: y.value, mk: mk.value, md: md.value, mkL: mk.value, mdL: md.value });
      save(v);
    }
    [y, mk, md].forEach(function(s){ s.addEventListener('change', function(ev){ if (ev.isTrusted) keep(); }); });
    /* A part name plus a vehicle opens the one view; a part number or a
       word the catalogue does not name stays in the finder. */
    function route(orig){
      var v = window.selectedVehicle, qEl = document.getElementById('partQuery'), q = qEl ? qEl.value.trim() : '';
      if (!v || !q || typeof window.getIndex !== 'function' || typeof window.matchQuery !== 'function') return orig();
      var veh = clean({ y: v.year, mk: v.make, md: v.model, mkL: v.make, mdL: v.model });
      window.getIndex().then(function(idx){
        var m = window.matchQuery(q, idx);
        if (!idx || m.exact < 0 || m.pn) return orig();
        var part = idx.parts[m.exact];
        return ask(veh).then(function(d){
          var hit = ((d.facets && d.facets.t) || []).filter(function(o){ return String(o[1]).toLowerCase() === String(part.es).toLowerCase(); })[0];
          if (!hit || !(hit[2] > 0)) return orig();
          save(veh);
          location.assign(viewUrl({ t: hit[0], v: veh }));
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
    function go(){ wrap(); restore(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else setTimeout(go, 0);
  }

  /* ---------- where am I ---------- */
  var sp = new URLSearchParams(location.search), path = location.pathname;
  if (/departamento(\.html)?$/.test(path) && FIT_DEPTS[sp.get('dept')]){
    if (sp.get('nav') === '1') barMode();
    else {
      var go = function(){ var h = document.getElementById('deptHero'); if (h) cardMode(h, false, 'Elige el tipo de repuesto y tu vehículo: te mostramos los que están catalogados para tu auto, con el precio en soles.'); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
    }
  } else if (/tienda(\.html)?$/.test(path) && FIT_STORES[sp.get('tienda')]){
    var goT = function(){
      var w = document.getElementById('storeWrap'), tb = w && w.querySelector('.toolbar');
      if (tb) cardMode(tb, true, 'Esta tienda no publica con qué vehículos calza cada repuesto. Elige tu vehículo y te mostramos los repuestos catalogados para tu auto en Aria Auto, en un solo lugar.');
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', goT); else goT();
  } else if (document.getElementById('autoYear') || /(aria-auto|auto)(\.html)?$/.test(path)) {
    finderMode();
  }
})();

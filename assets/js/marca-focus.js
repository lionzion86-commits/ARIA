/* THE BRAND PAGE, FOCUSED ON A MODEL (#443 c.6569512697, Danny's
   destination guardrail). A search that names a brand and a model
   ("nike air force 1", "converse all star", "air force 1") lands on the
   brand's page -- never on a results wall -- and the page leads with
   that model in the brand pattern: the Comparador de Precios (the same
   model at every store), its Ofertas, then one rail per store, each
   rail paging on in place. The brand's own carousels follow, unchanged.

   marca.html?marca=<key>&q=<model>. marca.html calls
   ariaBrandFocus(label) once the brand's head has arrived; the answer is
   the site search's own (/.netlify/functions/search, the doctrine lanes
   and comparison charts) for "<label> <model>". Card markup, photos and
   prices are marca.html's own helpers (cardImgAttrs, watchPhotos,
   priceInner/paintPrices). No model, or nothing found: no block. */
(function () {
  "use strict";
  var API = "/.netlify/functions/search";
  function qParam() {
    try { var m = /[?&]q=([^&#]*)/.exec(location.search); return m ? decodeURIComponent(m[1].replace(/\+/g, " ")).trim().slice(0, 80) : ""; }
    catch (e) { return ""; }
  }
  function e(s) { return typeof esc === "function" ? esc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  function money(n) { var v = Math.round(Number(n) * 100) / 100; return "$" + (v % 1 === 0 ? String(v) : v.toFixed(2)); }
  function card(c) {
    if (!c || !c.image) return "";
    var href = "producto.html?producto=" + encodeURIComponent(c.title || "") + (c.store ? "&tienda=" + encodeURIComponent(c.store) : "");
    var was = Number(c.wasUsd) > Number(c.usd) ? Number(c.wasUsd) : 0;
    var pct = was ? Math.round((1 - Number(c.usd) / was) * 100) : 0;
    var img = "<img " + (c.ph > 1 ? 'data-g="' + (c.ph | 0) + '" ' : "") + cardImgAttrs(c.image).replace(/^src=/, "data-src=").replace(/ srcset=/, " data-srcset=").replace(/ sizes=/, " data-sizes=") +
      ' alt="" width="560" height="560" decoding="async" onerror="if(!imgOrigRetry(this))photoGone(this)">';
    return '<a class="card" href="' + e(href) + '"><div class="img">' + (pct >= 5 ? '<span class="sale-badge">-' + pct + "%</span>" : "") + img + "</div>" +
      '<div class="body"><div class="brand">' + (c.condition ? '<span class="card-cond">' + e(c.condition) + "</span>" : "") + e(c.brand || "") + "</div>" +
      '<div class="name">' + e(c.title) + "</div>" +
      '<div class="retailer">' + (c.storeLabel || c.store ? "Vendido por " + e(c.storeLabel || c.store) : "&nbsp;") + "</div>" +
      '<div class="price" data-usd="' + Number(c.usd) + '"' + (was ? ' data-was="' + was + '"' : "") + ">" + priceInner(Number(c.usd), was) + "</div>" +
      imp(c, "div") + "</div></a>";
  }
  /* THE IMPORT TAX UNDER THE PRICE (#443 c.6592753099): /import-tax.js, the
     arithmetic checkout charges, on the price the card shows; nothing
     under $200 of goods. Cards and Comparador rows alike. */
  function imp(c, tag) {
    return window.AriaImportTax ? window.AriaImportTax.lineHTML({ usd: c.usd, retailer: c.store, title: c.title }, { tag: tag }) : "";
  }
  function shipLine(sh) {
    sh = sh || {};
    var free = sh.freeOverUsd ? " · gratis desde " + money(sh.freeOverUsd) : "";
    if (sh.state === "free") return "Envío de la tienda: GRATIS";
    if (sh.state === "fee") return "Envío de la tienda: " + money(sh.usd) + free;
    return "Envío de la tienda: lo calcula la tienda al pagar" + free;
  }
  /* Every chart shows the product's photo, and every store row its own
     photo and its own title, so the shopper sees which model and which
     colourway each store sells, not just numbers (Danny 2026-11-02, the
     Adidas Samba chart). Lazy like every card photo: watchPhotos(box). */
  function thumb(src, px) {
    if (!src) return "";
    return "<img " + cardImgAttrs(src, px + "px").replace(/^src=/, "data-src=").replace(/ srcset=/, " data-srcset=").replace(/ sizes=/, " data-sizes=") +
      ' alt="" width="' + px + '" height="' + px + '" decoding="async" onerror="if(!imgOrigRetry(this)){this.remove()}">';
  }
  function chart(c) {
    /* Standing rule: no picture, no row; no pictures, no chart. */
    var rows = (c.stores || []).filter(function (s) { return Number(s.usd) > 0 && s.image; });
    if (rows.length < 2) return "";
    var head = c.image || (rows[0] && rows[0].image);
    return '<div class="fc-chart"><div class="fc-head">' + (head ? '<div class="fc-photo">' + thumb(head, 88) + "</div>" : "") +
      '<div style="min-width:0"><div class="fc-kicker">' + e(c.brand || "") + " · En " + rows.length + ' tiendas</div><div class="fc-title">' + e(c.title) + "</div></div></div>" +
      rows.map(function (s) {
        var badges = (s.best ? '<span class="fc-b">Mejor precio</span>' : "") + (s.bestCost ? '<span class="fc-b fc-win">Mejor costo hasta Miami</span>' : "");
        var href = "producto.html?producto=" + encodeURIComponent(s.title || "") + (s.store ? "&tienda=" + encodeURIComponent(s.store) : "");
        return '<a class="fc-row' + (s.bestCost ? " win" : "") + '" href="' + e(href) + '">' +
          (s.image ? '<div class="fc-thumb">' + thumb(s.image, 56) + "</div>" : "") +
          '<div class="fc-store"><b>' + e(s.storeLabel || s.store) + "</b>" +
          (s.title ? '<span class="fc-model">' + e(typeof shownTitle === "function" ? shownTitle(s.title) : s.title) + "</span>" : "") + badges +
          '<small>' + e(shipLine(s.ship)) + '</small></div><div class="fc-pc"><div class="price fc-price" data-usd="' + Number(s.usd) + '">' + priceInner(Number(s.usd), 0) + "</div>" + imp(s, "span") + "</div></a>";
      }).join("") + "</div>";
  }
  /* A store's lane ends in that store's page, narrowed to the search, in
     carousels by product type; the Ofertas lane brings its next cards in
     (#443, Danny: "never a side-by-side grid"). */
  function storeDoor(l) {
    var store = l.store || (/^tienda:(.+)$/.exec(l.key || "") || [])[1] || "", pages = window.ARIA_STORE_PAGES || "";
    return store && pages.indexOf(" " + store + " ") >= 0 ? "tienda.html?tienda=" + encodeURIComponent(store) + "&q=" + encodeURIComponent(l.doorQ || SEARCHED) : "";
  }
  function lane(l) {
    var door = storeDoor(l);
    var more = !(l.n > l.items.length) ? "" : door
      ? '<a class="fc-more" href="' + e(door) + '">Ver todo<span>' + Number(l.n).toLocaleString("es-PE") + " productos</span></a>"
      : '<button type="button" class="fc-more" data-lane="' + e(l.key) + '" data-off="' + l.items.length + '" data-n="' + l.n + '">Ver más<span>' + (l.n - l.items.length).toLocaleString("es-PE") + " más</span></button>";
    return '<section class="rail-section fc-lane"><div class="rail-head"><h2>' + e(l.title) + '</h2><span class="rail-count">' + Number(l.n).toLocaleString("es-PE") + "</span></div>" +
      '<div class="rail">' + l.items.map(card).join("") + more + "</div></section>";
  }
  var CSS = ".fc{margin:4px 0 18px}.fc-h{font-size:21px;font-weight:800;color:var(--navy);margin:6px 0 2px;line-height:1.25}" +
    ".fc-sub{font-size:14px;color:var(--muted);margin:0 0 12px}.fc-sec{font-size:18px;font-weight:800;color:var(--navy);margin:10px 0 2px}" +
    ".fc-secsub{font-size:15px;font-weight:800;color:var(--blue);margin:0 0 10px}" +
    ".fc-chart{border:1px solid var(--line);border-radius:16px;padding:14px;margin:0 0 10px;background:#fff}" +
    ".fc-kicker{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--blue)}" +
    ".fc-title{font-size:15px;font-weight:800;color:var(--navy);margin:2px 0 8px;line-height:1.3}" +
    ".fc-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 6px;border-top:1px solid var(--line);color:var(--ink);text-decoration:none}" +
    ".fc-row.win{background:#DCEBFF;border-radius:12px;box-shadow:inset 4px 0 0 var(--blue)}" +
    ".fc-head{display:flex;gap:12px;align-items:center;margin:0 0 8px}" +
    ".fc-photo{position:relative;flex:0 0 88px;width:88px;height:88px;border-radius:12px;background:var(--sky,#F1F5FB);overflow:hidden}" +
    ".fc-thumb{position:relative;flex:0 0 56px;width:56px;height:56px;border-radius:10px;background:var(--sky,#F1F5FB);overflow:hidden}" +
    ".fc-photo img,.fc-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}" +
    ".fc-model{display:block;font-size:12px;color:var(--ink);margin-top:2px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}" +
    ".fc-store{min-width:0;flex:1 1 auto}.fc-store b{display:block;font-size:14px;color:var(--navy)}.fc-store small{display:block;font-size:12px;color:var(--muted);margin-top:2px}" +
    ".fc-b{display:inline-block;font-size:11px;font-weight:800;border-radius:999px;padding:2px 8px;margin:3px 4px 0 0;background:#E8F7EE;color:#15803D}.fc-b.fc-win{background:var(--navy);color:#fff}" +
    ".fc-price{text-align:right;flex:0 0 auto;margin:0;padding:0;min-height:0}" +
    ".fc-pc{flex:0 0 auto;text-align:right}" +
    ".fc-more{flex:0 0 140px;align-self:stretch;text-decoration:none;border:1px dashed var(--line);border-radius:16px;background:#fff;color:var(--navy);font:800 15px/1.2 inherit;font-family:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px}" +
    ".fc-more span{font-size:12px;font-weight:600;color:var(--muted)}";
  var Q = "", SEARCHED = "";
  window.ariaBrandFocus = function (label) {
    Q = qParam();
    var box = document.getElementById("brandFocus");
    if (!Q || !box) return;
    SEARCHED = (new RegExp("^" + String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(Q) ? Q : label + " " + Q).trim();
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    box.innerHTML = '<h2 class="fc-h">' + e(SEARCHED) + '</h2><p class="fc-sub">Buscando este modelo en cada tienda…</p>';
    box.hidden = false;
    fetch(API + "?q=" + encodeURIComponent(SEARCHED) + "&page=1").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var lanes = (d && d.lanes || []).filter(function (l) { return l.items && l.items.length; });
      var charts = (d && (d.compares || (d.compare ? [d.compare] : [])) || []).map(chart).join("");
      if (!lanes.length && !charts) { box.hidden = true; box.innerHTML = ""; return; }
      box.innerHTML = '<h2 class="fc-h">' + e(SEARCHED) + '</h2><p class="fc-sub">Este modelo en cada tienda, y abajo todo ' + e(label) + ".</p>" +
        (charts ? '<h3 class="fc-sec">Comparador de Precios</h3><p class="fc-secsub">Compara el mismo producto en diferentes tiendas.</p>' + charts : "") +
        lanes.map(lane).join("");
      if (typeof watchPhotos === "function") watchPhotos(box);
    }).catch(function () { box.hidden = true; box.innerHTML = ""; });
  };
  document.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest ? ev.target.closest("button.fc-more") : null;
    if (!b || b.disabled) return;
    b.disabled = true;
    var key = b.getAttribute("data-lane"), off = Number(b.getAttribute("data-off")) || 0, n = Number(b.getAttribute("data-n")) || 0;
    fetch(API + "?q=" + encodeURIComponent(SEARCHED) + "&lane=" + encodeURIComponent(key) + "&off=" + off).then(function (r) { return r.json(); }).then(function (d) {
      var items = (d && d.items) || [];
      var holder = document.createElement("div");
      holder.innerHTML = items.map(card).join("");
      while (holder.firstChild) b.parentNode.insertBefore(holder.firstChild, b);
      if (typeof watchPhotos === "function") watchPhotos(b.parentNode);
      off += items.length;
      if (!items.length || off >= n) b.remove();
      else { b.setAttribute("data-off", off); b.querySelector("span").textContent = (n - off).toLocaleString("es-PE") + " más"; b.disabled = false; }
    }).catch(function () { b.disabled = false; });
  });
})();

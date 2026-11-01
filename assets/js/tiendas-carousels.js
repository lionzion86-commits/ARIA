/* ============================================================
   «TODAS LAS TIENDAS» -- CATEGORY CAROUSELS OF STORES (#443, Danny's
   rulings 2026-11-01).

   The homepage's store block: a run of category carousels (Ropa y Moda,
   Moda Exclusiva, Lencería, Ropa de Baño...), each with its STORES as
   pills. Tapping a pill shows that store's rail inside the carousel --
   only that category's products from that store -- and every rail ends
   on a door, «Ver más en <tienda>», into the store's own page.

   The membership is data (scripts/build-tiendas-carousels.mjs, from the
   storefront registry and the store slices); nothing here names a store.

   THE MOUNTAIN TEST. Nothing loads with the page. index.json (labels
   only) is fetched when the block nears the screen; a carousel's first
   rail (one small file) when that carousel nears the screen; any other
   rail only when its pill is tapped. Every photo is loading="lazy".

   Cards are the bundle's own (railCardHTML), each opening Aria's product
   page; without the bundle, a plain card of the same data.
   ============================================================ */
(function () {
  "use strict";
  var DIR = "/assets/home/tiendas/";
  var css =
    ".tcBlock .tcCar{padding:18px 0 6px}" +
    ".tcBlock .tcHead{padding:0 20px 10px}" +
    ".tcBlock .tcHead h3{margin:0;color:#fff;font-weight:800;font-size:19px;letter-spacing:-.01em;line-height:1.15}" +
    ".tcBlock .tcHead p{margin:3px 0 0;color:rgba(255,255,255,.7);font-size:12.5px;font-weight:600}" +
    ".tcPills{display:flex;gap:8px;overflow-x:auto;padding:0 20px 10px;scrollbar-width:none}.tcPills::-webkit-scrollbar{display:none}" +
    ".tcPills button{flex:0 0 auto;height:34px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.35);background:transparent;" +
    "color:#fff;font:700 12.5px/32px system-ui,-apple-system,sans-serif;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent}" +
    ".tcPills button[aria-selected=\"true\"]{background:#F4C463;border-color:#F4C463;color:#0A1F44}" +
    ".tcCount{padding:0 20px 8px;color:rgba(255,255,255,.72);font-size:11.5px;font-weight:600}" +
    ".tcRail{display:flex;gap:12px;overflow-x:auto;padding:0 20px 18px;min-height:300px;scrollbar-width:none}.tcRail::-webkit-scrollbar{display:none}" +
    ".tcDoor{flex:0 0 auto;width:148px;border-radius:16px;display:grid;place-items:center;text-align:center;padding:12px;text-decoration:none;" +
    "background:#1a2744;border:1px solid rgba(255,255,255,.18);color:#fff}" +
    ".tcDoor b{display:block;font-size:14px;font-weight:800;line-height:1.25}.tcDoor span{display:block;margin-top:6px;color:#F4C463;font-size:12px;font-weight:700}" +
    ".tcCard{flex:0 0 auto;width:172px;border-radius:16px;overflow:hidden;background:#1a2744;color:#fff;text-decoration:none}" +
    ".tcCard .tcImg{display:block;height:172px;background:#fff}.tcCard img{width:100%;height:100%;object-fit:contain;padding:10px;box-sizing:border-box}" +
    ".tcCard .tcT{display:block;padding:8px 12px 2px;font-size:12.5px;font-weight:700;line-height:1.3;max-height:34px;overflow:hidden}" +
    ".tcCard .tcP{display:block;padding:0 12px 12px;font-size:15px;font-weight:800}" +
    "@media (min-width:1024px){.tcBlock .tcHead,.tcPills,.tcCount{padding-left:32px;padding-right:32px}.tcRail{padding:0 32px 22px;gap:16px}}";
  var st = document.createElement("style");
  st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  var indexP = null, railP = {}, active = {};
  function getJSON(u) {
    return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function door(key) { return "/tienda.html?tienda=" + encodeURIComponent(key); }
  function pdp(p) { return "/producto.html?producto=" + encodeURIComponent(p.title) + "&tienda=" + encodeURIComponent(p.retailer); }
  function nfmt(n) { try { return Number(n).toLocaleString("es-PE"); } catch (e) { return String(n); } }

  function cardHTML(p) {
    if (typeof railCardHTML === "function") {
      var h = railCardHTML(p, "location.href=this.getAttribute('data-pdp')", 'data-pdp="' + esc(pdp(p)) + '" data-tiendas-card', { dark: true });
      if (h) return h;
    }
    return '<a class="tcCard" data-tiendas-card href="' + esc(pdp(p)) + '"><span class="tcImg"><img src="' + esc(p.image) + '" alt="" loading="lazy" decoding="async"></span>' +
      '<span class="tcT">' + esc(p.title) + '</span><span class="tcP">US$ ' + esc(Number(p.price).toFixed(2)) + "</span></a>";
  }
  function doorHTML(s) {
    return '<a class="tcDoor" data-tiendas-door="' + esc(s.k) + '" href="' + esc(door(s.k)) + '"><span style="margin:0;color:#fff"><b>Ver más en ' + esc(s.label) + '</b>' +
      "<span>Entrar a la tienda &#8594;</span></span></a>";
  }

  function carouselHTML(c) {
    var h = '<div class="tcCar" data-tiendas-carousel="' + esc(c.k) + '">' +
      '<div class="tcHead"><h3>' + esc(c.title) + "</h3>" + (c.sub ? "<p>" + esc(c.sub) + "</p>" : "") + "</div>" +
      '<div class="tcPills" role="tablist" aria-label="Tiendas de ' + esc(c.title) + '">';
    c.stores.forEach(function (s, i) {
      h += '<button type="button" role="tab" data-tiendas-pill="' + esc(s.k) + '" aria-selected="' + (i === 0) + '">' + esc(s.label) + "</button>";
    });
    return h + '</div><div class="tcCount" data-tiendas-count></div><div class="tcRail" data-tiendas-rail></div></div>';
  }

  function show(car, c, key) {
    var s = null;
    for (var i = 0; i < c.stores.length; i++) if (c.stores[i].k === key) s = c.stores[i];
    if (!s) return;
    active[c.k] = key;
    var btns = car.querySelectorAll("[data-tiendas-pill]");
    for (var j = 0; j < btns.length; j++) btns[j].setAttribute("aria-selected", String(btns[j].getAttribute("data-tiendas-pill") === key));
    var count = car.querySelector("[data-tiendas-count]");
    if (count) count.textContent = nfmt(s.n) + " productos en " + s.label;
    var rail = car.querySelector("[data-tiendas-rail]");
    var id = c.k + "-" + key;
    if (!railP[id]) railP[id] = getJSON(DIR + encodeURIComponent(id) + ".json");
    railP[id].then(function (d) {
      if (active[c.k] !== key || !rail) return;
      var cards = d && Array.isArray(d.cards) ? d.cards : [];
      rail.innerHTML = cards.map(cardHTML).join("") + doorHTML(s);
      rail.setAttribute("data-tiendas-store", key);
      rail.scrollLeft = 0;
    });
  }

  function paint(block, idx) {
    if (block._tcPainted || !idx || !Array.isArray(idx.carousels)) return;
    block._tcPainted = true;
    var host = block.querySelector("[data-tiendas-carousels]");
    if (!host) return;
    host.innerHTML = idx.carousels.map(carouselHTML).join("");
    var cars = host.querySelectorAll("[data-tiendas-carousel]");
    var byK = {};
    idx.carousels.forEach(function (c) { byK[c.k] = c; });
    var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        var c = byK[e.target.getAttribute("data-tiendas-carousel")];
        if (c && !active[c.k]) show(e.target, c, c.stores[0].k);
      });
    }, { rootMargin: "400px 0px" }) : null;
    for (var i = 0; i < cars.length; i++) {
      var c = byK[cars[i].getAttribute("data-tiendas-carousel")];
      if (io) io.observe(cars[i]); else show(cars[i], c, c.stores[0].k);
    }
    host.addEventListener("click", function (e) {
      var b = e.target && e.target.closest && e.target.closest("[data-tiendas-pill]");
      if (!b) return;
      var car = b.closest("[data-tiendas-carousel]");
      var c = car && byK[car.getAttribute("data-tiendas-carousel")];
      if (c) show(car, c, b.getAttribute("data-tiendas-pill"));
    });
  }

  function load(block) {
    if (!indexP) indexP = getJSON(DIR + "index.json");
    indexP.then(function (idx) { paint(block, idx); });
  }
  function init() {
    var blocks = document.querySelectorAll("[data-tiendas-block]");
    var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); load(e.target); } });
    }, { rootMargin: "800px 0px" }) : null;
    for (var i = 0; i < blocks.length; i++) { if (io) io.observe(blocks[i]); else load(blocks[i]); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();

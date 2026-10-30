/* ============================================================
   ONE PILL ROW ABOVE EVERY STORE RAIL (Danny, #443 c.6525893681).

   Each homepage store rail gets one row of pills -- the store's own
   aisles, with real depth (scripts/build-store-rail-pills.mjs). A pill
   swaps THAT rail's cards in place; «Todo», or the active pill tapped
   again, puts the rail back. The shopper never has to enter the store.

   THE MOUNTAIN TEST. Nothing loads with the page: a rail's row (a few
   hundred bytes) is fetched once its cards have painted, and a pill's
   cards (one small file) only when it is tapped. No catalogue is
   filtered on the phone.

   The cards are the bundle's own (railCardHTML), each opening Aria's
   product page. A rail the bundle repaints (after the sale enrich) goes
   back to «Todo».
   ============================================================ */
(function () {
  "use strict";
  var DIR = "/assets/home/store-pills/";
  var css =
    ".srp{display:flex;gap:8px;overflow-x:auto;padding:0 20px 12px;scrollbar-width:none}.srp::-webkit-scrollbar{display:none}" +
    ".srp button{flex:0 0 auto;height:32px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.35);background:transparent;" +
    "color:#fff;font:700 12.5px/30px system-ui,-apple-system,sans-serif;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent}" +
    ".srp button[aria-selected=\"true\"]{background:#F4C463;border-color:#F4C463;color:#0A1F44}" +
    "@media (min-width:1024px){.srp{padding:0 32px 14px}}";
  var st = document.createElement("style");
  st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  var rowsCache = {}, pillCache = {}, saved = {}, active = {};
  function getJSON(u) {
    return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function rowsOf(key) { return document.querySelectorAll('[data-store-rail-row="' + key + '"]'); }

  /* The shared shelf the bundle's card taps read (openStoreRailProduct). */
  function shelf(key, v) {
    try { if (arguments.length > 1) storeRailsRendered[key] = v; return storeRailsRendered[key]; } catch (e) { return undefined; }
  }
  function pdp(p) { return "/producto.html?producto=" + encodeURIComponent(p.title) + "&tienda=" + encodeURIComponent(p.retailer); }
  function cardsHTML(key, cards) {
    if (typeof railCardHTML !== "function") return "";
    return cards.map(function (p) {
      return railCardHTML(p, "location.href=this.getAttribute('data-pdp')", 'data-pdp="' + esc(pdp(p)) + '"', { dark: true });
    }).join("") + (typeof storeRailMoreHTML === "function" ? storeRailMoreHTML(key, true) : "");
  }

  function paintPills(key) {
    var data = rowsCache[key];
    if (!data || !data.pills || data.pills.length < 2) return;
    rowsOf(key).forEach(function (row) {
      var bar = row.previousElementSibling && row.previousElementSibling.classList.contains("srp") ? row.previousElementSibling : null;
      if (!bar) {
        bar = document.createElement("div");
        bar.className = "srp";
        bar.setAttribute("role", "tablist");
        bar.setAttribute("aria-label", "Categorías de la tienda");
        row.parentNode.insertBefore(bar, row);
      }
      var a = active[key] || "";
      var h = '<button type="button" role="tab" data-srp="" aria-selected="' + (!a) + '">Todo</button>';
      data.pills.forEach(function (p) {
        h += '<button type="button" role="tab" data-srp="' + esc(p.k) + '" aria-selected="' + (a === p.k) + '">' + esc(p.label) + "</button>";
      });
      bar.innerHTML = h;
    });
  }

  function swap(key, k) {
    if (k === (active[key] || "")) k = "";
    if (!k) {
      if (saved[key]) {
        active[key] = "";
        shelf(key, saved[key].picks);
        rowsOf(key).forEach(function (row, i) { row._srpSelf = true; row.innerHTML = saved[key].html[i] || ""; row.scrollLeft = 0; });
        saved[key] = null;
      }
      paintPills(key);
      return;
    }
    if (!pillCache[key + "/" + k]) pillCache[key + "/" + k] = getJSON(DIR + key + "-" + encodeURIComponent(k) + ".json");
    active[key] = k;
    paintPills(key);
    pillCache[key + "/" + k].then(function (d) {
      if (active[key] !== k) return;
      if (!d || !Array.isArray(d.cards) || !d.cards.length) { swap(key, ""); return; }
      if (!saved[key]) saved[key] = { picks: shelf(key), html: Array.prototype.map.call(rowsOf(key), function (r) { return r.innerHTML; }) };
      shelf(key, d.cards);
      var html = cardsHTML(key, d.cards);
      rowsOf(key).forEach(function (row) { row._srpSelf = true; row.innerHTML = html; row.scrollLeft = 0; });
    });
  }

  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest(".srp button[data-srp]");
    if (!b) return;
    var row = b.parentNode.nextElementSibling;
    var key = row && row.getAttribute("data-store-rail-row");
    if (key) swap(key, b.getAttribute("data-srp"));
  });

  /* A rail's row is fetched when the rail nears the screen, and only for
     a store the manifest lists (no request for a store without a row). A
     repaint the bundle makes on its own (the enrich) resets it to «Todo». */
  var manifest = null;
  function load(key) {
    if (rowsCache[key]) return;
    rowsCache[key] = { pills: [] };
    if (!manifest) manifest = getJSON(DIR + "index.json");
    manifest.then(function (m) {
      if (!m || !Array.isArray(m.stores) || m.stores.indexOf(key) === -1) return;
      getJSON(DIR + key + ".json").then(function (d) { if (d && Array.isArray(d.pills)) { rowsCache[key] = d; paintPills(key); } });
    });
  }
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); load(e.target.getAttribute("data-store-rail-row")); } });
  }, { rootMargin: "300px 0px" }) : null;
  function watch(row) {
    if (row._srpWatched) return;
    row._srpWatched = true;
    var key = row.getAttribute("data-store-rail-row");
    new MutationObserver(function () {
      if (row._srpSelf) { row._srpSelf = false; return; }
      if (active[key]) { active[key] = ""; saved[key] = null; paintPills(key); }
    }).observe(row, { childList: true });
    if (io) io.observe(row); else load(key);
  }
  function init() { document.querySelectorAll("[data-store-rail-row]").forEach(watch); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();

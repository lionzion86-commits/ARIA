/* «TAMBIÉN PUEDE SER…» (#443 c.6569515583, Danny): a search lands on ONE
   surface -- a store, a brand or a category page -- and the other close
   matches ride along as a small chip row, one tap sideways.

   search.html's router (netlify/functions/_search-destinations.js) puts
   them on the landing url as &tp=<JSON [[kind, label, url], ...]>. This
   script draws the row right under the page's hero (marca.html,
   departamento.html) or at the top of the store (tienda.html). Only urls
   to the three surfaces are drawn; anything else in tp is ignored. No
   tp, no row. */
(function () {
  "use strict";
  var SURFACE_RX = /^(tienda|marca|departamento)\.html\?(tienda|marca|dept)=[a-z0-9_]+(&[a-z]+=[^&"<>\s]*)*$/;
  var KIND = { store: "Tienda", brand: "Marca", category: "Categoría" };
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function list() {
    try {
      var m = /[?&]tp=([^&#]*)/.exec(location.search);
      if (!m) return [];
      var arr = JSON.parse(decodeURIComponent(m[1].replace(/\+/g, " ")));
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (a) {
        return Array.isArray(a) && KIND[a[0]] && typeof a[1] === "string" && a[1] && typeof a[2] === "string" && SURFACE_RX.test(a[2]);
      }).slice(0, 4);
    } catch (e) { return []; }
  }
  function draw() {
    var items = list();
    if (!items.length || document.getElementById("tpRow")) return;
    var css = document.createElement("style");
    css.textContent = ".tp-row{display:flex;align-items:center;gap:8px;overflow-x:auto;scrollbar-width:none;max-width:1240px;margin:10px auto 4px;padding:2px 16px 6px;-webkit-overflow-scrolling:touch}" +
      ".tp-row::-webkit-scrollbar{display:none}" +
      ".tp-row .tp-lead{flex:0 0 auto;font-size:13px;font-weight:700;color:#6B7280;white-space:nowrap}" +
      ".tp-row a{flex:0 0 auto;display:inline-flex;align-items:baseline;gap:6px;min-height:36px;padding:8px 14px;border:1px solid #2456A0;border-radius:999px;background:#fff;color:#0A1F44;font-size:13px;font-weight:800;text-decoration:none;white-space:nowrap}" +
      ".tp-row a small{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#2456A0}";
    document.head.appendChild(css);
    var row = document.createElement("nav");
    row.id = "tpRow";
    row.className = "tp-row";
    row.setAttribute("aria-label", "También puede ser");
    row.innerHTML = '<span class="tp-lead">También puede ser…</span>' + items.map(function (a) {
      return '<a href="' + esc(a[2]) + '" data-kind="' + esc(a[0]) + '"><small>' + esc(KIND[a[0]]) + "</small>" + esc(a[1]) + "</a>";
    }).join("");
    var hero = document.getElementById("brandHero") || document.getElementById("deptHero");
    if (hero && hero.parentNode) {
      if (hero.closest && hero.closest("main")) row.style.paddingLeft = row.style.paddingRight = "0";
      hero.parentNode.insertBefore(row, hero.nextSibling);
      return;
    }
    var store = document.getElementById("storeWrap");
    if (store) { row.style.paddingLeft = row.style.paddingRight = "0"; store.insertBefore(row, store.firstChild); return; }
    var main = document.querySelector("main");
    if (main) main.insertBefore(row, main.firstChild);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", draw);
  else draw();
})();

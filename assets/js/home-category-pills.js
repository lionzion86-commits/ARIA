/* ============================================================
   «TODAS LAS TIENDAS»: STORE PILLS ON TOP OF EVERY CATEGORY CAROUSEL
   (Danny, #443, 2026-11-01).

   Each homepage category carousel carries a row of pills above it:
   «Todas» (the carousel exactly as the page paints it) and one pill per
   store that truly sells that category (scripts/build-home-category-
   pills.mjs, from the department and store-page data). A store pill
   swaps THAT carousel's cards in place for the store's products of that
   category only, ending on «Ver más en <Tienda>», the store's own page;
   «Todas», or the active pill tapped again, puts the carousel back. The
   four new carousels (Ropa de Baño, Hogar y Especialidades, Auto, Motos)
   are painted from here: their «Todas» rail is the build's own file.

   THE MOUNTAIN TEST. Nothing loads with the page. The labels index (a
   few KB) is fetched when the first category carousel nears the screen,
   a new carousel's «Todas» rail when that carousel does, and a store's
   rail (one small file) only when its pill is tapped. Photos are lazy
   (the bundle's card).

   The cards are the bundle's own (railCardHTML), priced by the bundle's
   own normalizeLiveItem from the catalogue's US price -- the same soles
   as every other card -- and each opens Aria's product page. A carousel
   the bundle repaints on its own goes back to «Todas».
   ============================================================ */
(function () {
  "use strict";
  var DIR = "/assets/home/category-pills/";
  var css =
    ".hcp{display:flex;gap:8px;overflow-x:auto;padding:0 20px 12px;scrollbar-width:none}.hcp::-webkit-scrollbar{display:none}" +
    ".hcp button{flex:0 0 auto;height:32px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.35);background:transparent;" +
    "color:#fff;font:700 12.5px/30px system-ui,-apple-system,sans-serif;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent}" +
    ".hcp button[aria-selected=\"true\"]{background:#F4C463;border-color:#F4C463;color:#0A1F44}" +
    ".hcp.hcpL button{border-color:rgba(10,31,68,.25);color:#0A1F44}" +
    ".hcp.hcpL button[aria-selected=\"true\"]{background:#0A1F44;border-color:#0A1F44;color:#fff}" +
    "@media (min-width:1024px){.hcp{padding:0 32px 14px}}";
  var st = document.createElement("style");
  st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  var index = null, files = {};
  function getJSON(u) {
    return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function file(name) {
    if (!files[name]) files[name] = getJSON(DIR + name);
    return files[name];
  }
  function loadIndex() {
    if (!index) index = getJSON(DIR + "index.json");
    return index;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function light(row) { return row.getAttribute("data-cat-pills-theme") === "light"; }

  /* A card from the build is the catalogue's own record (US price); the
     bundle prices it exactly as it prices every card on the page. No
     pricer, no photo or no price: no card. */
  function priced(c, dept) {
    if (typeof normalizeLiveItem !== "function") return null;
    try {
      var it = normalizeLiveItem({ title: c.title, brand: c.brand, price: c.price, originalPrice: c.originalPrice,
        onSale: Number(c.originalPrice) > Number(c.price), image: c.image }, { retailer: c.retailer, department: dept || "" });
      if (!it || !it.title || !(Number(it.price) > 0)) return null;
      if (typeof hasRealImage === "function" && !hasRealImage(it)) return null;
      it.retailer = c.retailer;
      if (c.ph) it.ph = c.ph;
      return it;
    } catch (e) { return null; }
  }
  function pdp(p) { return "/producto.html?producto=" + encodeURIComponent(p.title) + "&tienda=" + encodeURIComponent(p.retailer); }
  function moreTile(href, lead, label, dark) {
    return '<a href="' + esc(href) + '" data-cat-pills-more class="flex-shrink-0 w-[128px] rounded-2xl focus-ring grid place-items-center text-center px-3"' +
      ' style="text-decoration:none;background:' + (dark ? "#1a2744" : "var(--paper)") + ";border:1px solid " + (dark ? "rgba(255,255,255,0.14)" : "var(--line)") + '">' +
      '<span class="block"><span class="block text-[11.5px]" style="color:' + (dark ? "#AFBBD6" : "#6B7487") + '">' + esc(lead) + "</span>" +
      '<span class="block text-[13px] font-extrabold mt-0.5 leading-snug" style="color:' + (dark ? "#fff" : "var(--navy)") + '">' + esc(label) + " &#8594;</span></span></a>";
  }
  function cardsHTML(row, d) {
    if (typeof railCardHTML !== "function" || !d || !Array.isArray(d.cards)) return "";
    var dark = !light(row), h = "";
    d.cards.forEach(function (c) {
      var p = priced(c, d.d);
      if (p) h += railCardHTML(p, "location.href=this.getAttribute('data-pdp')", 'data-pdp="' + esc(pdp(p)) + '" data-cat-pills-card="' + esc(c.retailer) + '"', { dark: dark });
    });
    if (!h) return "";
    if (d.store) h += moreTile(d.door, "Ver más en", d.label, dark);
    else if (d.door) h += moreTile(d.door, "Ver todo en", d.title, dark);
    return h;
  }

  function paintBar(row) {
    var s = row._hcp, entry = s.entry;
    if (!entry || !entry.s || !entry.s.length) return;
    var bar = s.bar;
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "hcp" + (light(row) ? " hcpL" : "");
      bar.setAttribute("role", "tablist");
      bar.setAttribute("aria-label", "Tiendas de " + entry.t);
      bar.setAttribute("data-cat-pills-bar", row.getAttribute("data-cat-pills"));
      /* On top of the carousel: above its own type pills when it has them (Electrónica). */
      var sec = row.closest("section"), typeRow = row.hasAttribute("data-pill-rail") && sec ? sec.querySelector("[data-pill-row]") : null;
      var at = typeRow || row;
      at.parentNode.insertBefore(bar, at);
      bar._row = row;
      s.bar = bar;
    }
    var a = s.active, labels = (s.labels || {});
    var h = '<button type="button" role="tab" data-hcp="" aria-selected="' + (!a) + '">Todas</button>';
    entry.s.forEach(function (x) {
      h += '<button type="button" role="tab" data-hcp="' + esc(x[0]) + '" aria-selected="' + (a === x[0]) + '">' + esc(labels[x[0]] || x[0]) + "</button>";
    });
    bar.innerHTML = h;
  }

  function put(row, html) {
    row._hcp.self = true;
    row.innerHTML = html;
    row.scrollLeft = 0;
  }
  /* A new carousel's own «Todas» rail. */
  function paintTodas(row) {
    var k = row.getAttribute("data-cat-pills");
    return file(k + "-todas.json").then(function (d) {
      if (row._hcp.active) return;
      var html = cardsHTML(row, d);
      var sec = row.closest("section");
      if (!html) { if (sec) sec.hidden = true; return; }
      put(row, html);
      if (sec) sec.hidden = false;
    });
  }

  function swap(row, store) {
    var s = row._hcp, k = row.getAttribute("data-cat-pills");
    if (store === s.active) store = "";
    if (!store) {
      if (s.active) {
        s.active = "";
        if (s.own) paintTodas(row);
        else if (s.saved != null) put(row, s.saved);
        s.saved = null;
      }
      paintBar(row);
      return;
    }
    s.active = store;
    paintBar(row);
    file(k + "-" + store + ".json").then(function (d) {
      if (s.active !== store) return;
      var html = cardsHTML(row, d);
      if (!html) { swap(row, ""); return; }
      if (!s.own && s.saved == null) s.saved = row.innerHTML;
      put(row, html);
    });
  }

  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest(".hcp button[data-hcp]");
    if (!b) return;
    var row = b.parentNode._row;
    if (row && row._hcp) swap(row, b.getAttribute("data-hcp"));
  });

  function load(row) {
    var s = row._hcp;
    if (s.loaded) return;
    s.loaded = true;
    loadIndex().then(function (ix) {
      var k = row.getAttribute("data-cat-pills");
      var entry = ix && ix.c && ix.c[k];
      if (!entry) { if (s.own) { var sec = row.closest("section"); if (sec) sec.hidden = true; } return; }
      s.entry = entry;
      s.labels = ix.labels || {};
      paintBar(row);
      if (s.own && !s.active) paintTodas(row);
    });
  }
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); load(e.target); } });
  }, { rootMargin: "400px 0px" }) : null;
  function watch(row) {
    if (row._hcp) return;
    row._hcp = { active: "", saved: null, own: row.hasAttribute("data-cat-pills-own"), self: false };
    if (row._hcp.own && !row.children.length && typeof railSkeletonHTML === "function") {
      try { row._hcp.self = true; row.innerHTML = railSkeletonHTML(4, "flex-shrink-0 w-[172px]"); } catch (e) {}
    }
    /* A repaint the bundle makes on its own (the enrich, a type pill)
       puts the row back on «Todas». */
    new MutationObserver(function () {
      var s = row._hcp;
      if (s.self) { s.self = false; return; }
      if (s.active && !s.own) { s.active = ""; s.saved = null; paintBar(row); }
    }).observe(row, { childList: true });
    if (io) io.observe(row); else load(row);
  }
  function init() { document.querySelectorAll("[data-cat-pills]").forEach(watch); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();

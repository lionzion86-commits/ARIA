/* ============================================================
   THE HEADER BANNER (#443 c.6642024745, c.6642039652).

   A store, brand or department page opens on a banner that represents
   it. The page names its hero; this paints it:

     AriaBanner.paint({ kind: "store", key: "dsw", host: heroEl,
                        bg: imgEl, scrim: scrimEl,
                        fallbacks: ["/assets/tienda/hero/dsw.jpg", ...] })

   1. assets/banners/<kind>/<key>.json, when assets/banners/<kind>/
      index.json lists the key (scripts/build-banners.mjs, from
      scripts/lib/banner-registry.js): the brand's own product photos as
      tiles over its colour, each a small CDN size with a srcset;
   2. else the page's single backdrop photos, tried in order (the store's
      phone-sized hero, then its full store photo);
   3. else nothing: the hero keeps its colour and says so
      (data-banner-tier="0").

   The Mountain Test: decoration, never on the critical path. Pages call
   it after their first product photos; every image is lazy, decoded
   async, low priority, absolutely positioned inside a hero whose size
   the text already set (no layout shift), and a failed photo removes
   its own tile.
   ============================================================ */
(function () {
  "use strict";
  if (window.AriaBanner) return;
  var CSS = ".pb-art{position:absolute;inset:0;z-index:0;display:flex;gap:2px;pointer-events:none;background:#111;box-shadow:inset 0 -5px 0 var(--pb-c,#111)}" +
    ".pb-t{position:relative;flex:1 1 0;min-width:0;overflow:hidden;background:#fff}" +
    ".pb-t:nth-child(n+4){display:none}" +
    "@media(min-width:760px){.pb-t:nth-child(4){display:block}}" +
    ".pb-t img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 22%;opacity:0;transition:opacity .35s}" +
    ".pb-contain .pb-t img{object-fit:contain;object-position:50% 50%;padding:8% 6% 14%;box-sizing:border-box}" +
    ".pb-t img.pb-in{opacity:1}" +
    ".pb-art::after{content:'';position:absolute;inset:0;bottom:5px}" +
    ".pb-dark::after{background:linear-gradient(180deg,rgba(0,0,0,.42) 0%,rgba(0,0,0,.70) 60%,rgba(0,0,0,.84) 100%)}" +
    ".pb-light::after{background:linear-gradient(180deg,rgba(251,227,238,.70) 0%,rgba(251,227,238,.86) 55%,rgba(251,227,238,.94) 100%)}" +
    "@media(min-width:760px){.pb-dark::after{background:linear-gradient(90deg,rgba(0,0,0,.86) 0%,rgba(0,0,0,.62) 42%,rgba(0,0,0,.30) 100%)}" +
    ".pb-light::after{background:linear-gradient(90deg,rgba(251,227,238,.96) 0%,rgba(251,227,238,.80) 42%,rgba(251,227,238,.30) 100%)}}" +
    "@media (prefers-reduced-motion: reduce){.pb-t img{transition:none}}";
  var KEY_RX = /^[a-z0-9_]{1,60}$/, KINDS = { store: 1, brand: 1, dept: 1 };

  function css() {
    if (document.getElementById("pbCss")) return;
    var st = document.createElement("style");
    st.id = "pbCss";
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  function mark(host, tier, status, src) {
    if (!host) return;
    host.setAttribute("data-banner-tier", String(tier));
    host.setAttribute("data-banner-status", status);
    if (src) host.setAttribute("data-banner-src", src);
  }
  function getJSON(url) {
    if (!window.fetch) return Promise.reject(new Error("no fetch"));
    return fetch(url, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    });
  }

  /* The single-photo path: the page's own <img>, each candidate in turn. */
  function single(o) {
    var list = (o.fallbacks || []).filter(Boolean), i = 0, bg = o.bg;
    if (!bg || !list.length) { mark(o.host, 0, "MISSING"); return; }
    try { bg.setAttribute("fetchpriority", "low"); bg.decoding = "async"; } catch (e) {}
    bg.onload = function () {
      bg.hidden = false;
      if (o.scrim) o.scrim.hidden = false;
      mark(o.host, 3, "NOT-YET-REPRESENTED", list[i]);
      if (o.onPhoto) try { o.onPhoto(list[i]); } catch (e) {}
    };
    bg.onerror = function () {
      i++;
      if (i < list.length) { bg.src = list[i]; return; }
      bg.hidden = true;
      if (o.scrim) o.scrim.hidden = true;
      bg.removeAttribute("src");
      mark(o.host, 0, "MISSING");
    };
    bg.src = list[0];
  }

  function tiles(o, b) {
    var host = o.host, ts = (b.tiles || []).filter(function (t) { return t && /^https:\/\//.test(t.src || ""); });
    if (!ts.length) return false;
    css();
    var art = document.createElement("div");
    art.className = "pb-art pb-" + (b.scrim === "light" ? "light" : "dark") + " pb-" + (b.fit === "contain" ? "contain" : "cover");
    art.setAttribute("aria-hidden", "true");
    if (/^#[0-9a-f]{3,8}$/i.test(b.color || "")) art.style.setProperty("--pb-c", b.color);
    for (var i = 0; i < ts.length && i < 4; i++) {
      var cell = document.createElement("span"), im = document.createElement("img");
      cell.className = "pb-t";
      im.alt = "";
      im.loading = "lazy";
      im.decoding = "async";
      im.width = 320; im.height = 400;
      try { im.setAttribute("fetchpriority", "low"); } catch (e) {}
      im.onload = function () { this.className = "pb-in"; };
      im.onerror = function () { var c = this.parentNode; if (c && c.parentNode) c.parentNode.removeChild(c); };
      if (ts[i].srcset) { im.srcset = ts[i].srcset; im.sizes = "(min-width:760px) 25vw, 34vw"; }
      im.src = ts[i].src;
      cell.appendChild(im);
      art.appendChild(cell);
    }
    if (o.bg) o.bg.hidden = true;
    if (o.scrim) o.scrim.hidden = true;
    host.insertBefore(art, host.firstChild);
    host.classList.add("pb-on");
    host.setAttribute("data-banner", b.kind + ":" + b.key);
    mark(host, b.tier, b.status, "/assets/banners/" + b.kind + "/" + b.key + ".json");
    return true;
  }

  function paint(o) {
    if (!o || !o.host) return;
    if (o.host.getAttribute("data-banner-tier") != null || o.host.__pb) return;
    o.host.__pb = 1;
    var kind = String(o.kind || ""), key = String(o.key || "").toLowerCase();
    if (!KINDS[kind] || !KEY_RX.test(key)) { single(o); return; }
    /* The kind's index first (one small cached file): a page asks for a
       banner file only when it is published, never a 404. */
    getJSON("/assets/banners/" + kind + "/index.json").then(function (keys) {
      if (!keys || keys.indexOf(key) === -1) { single(o); return; }
      return getJSON("/assets/banners/" + kind + "/" + key + ".json").then(function (b) {
        if (!b || !tiles(o, b)) single(o);
      });
    }).catch(function () { if (o.host.getAttribute("data-banner-tier") == null) single(o); });
  }

  window.AriaBanner = { paint: paint };
  var q = window.AriaBannerQ || [];
  window.AriaBannerQ = { push: function (o) { paint(o); } };
  for (var i = 0; i < q.length; i++) paint(q[i]);
})();

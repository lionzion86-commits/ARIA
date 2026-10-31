/* ============================================================
   EVERY PHOTO ON THE CARD, NONE ON THE WIRE UNTIL ASKED (#443
   c.6522012464, Danny's multi-photo restore, Oct 30).

   The galleries are already built: each product's PDP shard
   (assets/pdp/p/<FNV-1a of the title>.json, scripts/build-pdp-slices.mjs)
   carries its images[]. A card on any carousel gets two small arrows;
   the FIRST tap or swipe fetches that one shard (a few KB, once per
   shard) and shows the next photo. Nothing else loads: the page still
   opens on the cover photo alone (the Mountain Test), each extra photo
   is fetched only when the shopper asks for it, and the one after it is
   warmed while they look.

   NEVER A DEAD BUTTON (#443 c.6522824310): only a card the build knows
   holds two or more photos gets arrows and dots -- the count rides on
   the card as `ph` and reaches the photo as data-g
   (scripts/lib/photo-counts.js).

   THE RAIL OWNS THE SWIPE (#443 c.6544144050, c.6544165764, Danny's
   iPhone QA): a sideways drag that starts anywhere on a card -- its
   photo included -- scrolls the rail. The photo changes ONLY by its
   arrows (and shows where it is by its dots); a tap on the card opens
   the product; page scroll is the browser's. The photo used to keep the
   drag for itself (touch-action:pan-y + a swipe-to-step handler), so
   every rail whose cards carry a gallery stopped scrolling under the
   shopper's thumb while single-photo rails (Ofertas, Perfumes) still
   did. Nothing here listens to touch any more.

   Same rows as card-grow.js; loaded beside it (defer) on every page
   with a carousel. Search cards have their own swipe (search.html).
   ============================================================ */
(function () {
  "use strict";
  var ROW = ".ariaRail:not(#liveRefineChips), div.rail, .track, .rel-row";
  var SHARDS = 4096, BASE = "/assets/pdp/p/";
  var CARD = ":is(" + ROW + ") > :is(a, button, div.card, article)";

  /* THE ARROW IS A STRIP (#443 c.6545843738, Danny's live tap test): the
     tap target is a full-height strip down each side of the photo -- left
     = previous, right = next -- with the small round chevron drawn inside
     it. A sloppy tap anywhere on the strip flips the photo and never opens
     the product; a sideways drag that starts on a strip scrolls the rail
     (the browser sends no click once a touch has moved: the #556 rule). */
  var css =
    ".cp-nav{position:absolute;top:0;bottom:0;z-index:3;width:30%;margin:0;border:0;padding:0;background:transparent;" +
    "display:flex;align-items:center;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:pan-x pan-y}" +
    ".cp-nav.cp-prev{left:0;justify-content:flex-start;padding-left:6px}.cp-nav.cp-next{right:0;justify-content:flex-end;padding-right:6px}" +
    ".cp-nav i{display:block;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.88);color:#0B1E3D;" +
    "font:700 18px/30px system-ui,sans-serif;font-style:normal;text-align:center;box-shadow:0 2px 8px rgba(10,20,40,.18);pointer-events:none}" +
    ".cp-nav[hidden]{display:none}" +
    ".cp-dots{position:absolute;left:0;right:0;bottom:8px;z-index:3;display:flex;justify-content:center;gap:4px;pointer-events:none}" +
    ".cp-dots i{width:5px;height:5px;border-radius:50%;background:rgba(11,30,61,.25)}.cp-dots i.on{background:#0B1E3D}";
  var st = document.createElement("style");
  st.id = "ariaCardPhotos";
  st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  /* The product page's own key and shard (producto.html norm/pdpShard). */
  var ta = document.createElement("textarea");
  function decode(s) { ta.innerHTML = String(s || ""); return ta.value; }
  function norm(s) { return decode(s).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " "); }
  function shardOf(key) {
    var h = 0x811c9dc5;
    for (var i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ("00" + ((h >>> 0) % SHARDS).toString(16)).slice(-3);
  }
  /* "57|rest" = the previous URL's first 57 characters, then the rest. */
  function unpack(list, image) {
    if (!Array.isArray(list) || !list.length) return image ? [String(image)] : [];
    var out = [], prev = String(image || "");
    for (var i = 0; i < list.length; i++) {
      var e = String(list[i] || ""), m = e.match(/^(\d+)\|/);
      var u = m ? prev.slice(0, +m[1]) + e.slice(m[0].length) : e;
      if (u) out.push(u);
      prev = u;
    }
    return out;
  }

  var cache = {};
  function shard(s) {
    if (!cache[s]) cache[s] = fetch(BASE + s + ".json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    return cache[s];
  }
  /* The card's product: its link to producto.html. */
  function productOf(card) {
    /* A homepage card is a button: its product rides on it (railCardHTML). */
    var ct = card.getAttribute && card.getAttribute("data-cp-t");
    if (ct) return { title: ct, store: (card.getAttribute("data-cp-r") || "").toLowerCase() };
    var a = card.tagName === "A" ? card : card.querySelector("a[href*='producto']");
    if (!a) return null;
    var u;
    try { u = new URL(a.getAttribute("href"), location.href); } catch (e) { return null; }
    if (!/producto(\.html)?$/.test(u.pathname)) return null;
    var t = u.searchParams.get("producto") || u.searchParams.get("id") || u.searchParams.get("nombre");
    return t ? { title: t, store: (u.searchParams.get("tienda") || u.searchParams.get("store") || "").toLowerCase() } : null;
  }
  function galleryOf(card, img) {
    if (card._cpGallery) return card._cpGallery;
    var p = productOf(card);
    if (!p) return (card._cpGallery = Promise.resolve([]));
    var key = norm(p.title);
    card._cpGallery = shard(shardOf(key)).then(function (d) {
      var cands = (d && d[key]) || [];
      var rec = null;
      for (var i = 0; i < cands.length; i++) if (String(cands[i].retailer || "").toLowerCase() === p.store) { rec = cands[i]; break; }
      rec = rec || cands[0];
      if (!rec) return [];
      var cover = img.currentSrc || img.src;
      var list = unpack(rec.images, rec.image);
      /* The card's own cover first, then the rest, one copy each. The card
         may show a resized copy of the cover (another URL, the same photo):
         the record's own cover is that photo, never a second step. */
      var seen = {}, out = [];
      seen[img.src] = seen[cover] = seen[img.getAttribute("data-img-fallback") || ""] = 1;
      if (rec.image) seen[String(rec.image)] = 1;
      out.push(cover);
      list.forEach(function (u) { if (u && !seen[u]) { seen[u] = 1; out.push(u); } });
      return out.slice(0, 8);
    });
    return card._cpGallery;
  }

  function step(card, dir) {
    var img = card.querySelector("img");
    if (!img) return;
    galleryOf(card, img).then(function (g) {
      if (g.length < 2) { card.querySelectorAll(".cp-nav,.cp-dots").forEach(function (b) { b.hidden = true; }); return; }
      var i = ((card._cpIdx || 0) + dir + g.length) % g.length;
      card._cpIdx = i;
      img.removeAttribute("srcset");
      img.src = g[i];
      /* Warm only the next one. */
      var nx = new Image(); nx.decoding = "async"; nx.src = g[(i + 1) % g.length];
      paintDots(card, img, g.length, i);
    });
  }

  /* The strips and dots live in the photo's own box, so they cover the
     photo exactly whatever loads when. */
  function photoBox(img) {
    var box = img.parentElement;
    if (box && getComputedStyle(box).position === "static") box.style.position = "relative";
    return box;
  }
  function paintDots(card, img, n, on) {
    var dots = card.querySelector(".cp-dots");
    if (!dots) {
      dots = document.createElement("span");
      dots.className = "cp-dots";
      photoBox(img).appendChild(dots);
    }
    var h = "";
    for (var k = 0; k < n; k++) h += "<i" + (k === on ? ' class="on"' : "") + "></i>";
    dots.innerHTML = h;
  }

  function arm(card) {
    if (card._cpArmed || card.classList.contains("sk") || card.querySelector(".swipe")) return;
    card._cpArmed = true;
    var img = card.querySelector("img[data-g]");
    if (!img || (+img.getAttribute("data-g") || 0) < 2 || !productOf(card)) return;
    var box = photoBox(img);
    ["prev", "next"].forEach(function (k) {
      var b = document.createElement("span");
      b.setAttribute("role", "button");
      b.className = "cp-nav cp-" + k;
      b.setAttribute("aria-label", k === "next" ? "Foto siguiente" : "Foto anterior");
      b.innerHTML = "<i>" + (k === "next" ? "›" : "‹") + "</i>";
      b._cpCard = card;
      box.appendChild(b);
    });
    paintDots(card, img, Math.min(+img.getAttribute("data-g"), 8), 0);
  }

  /* A tap on an arrow steps the photo; it never opens the product. */
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest(".cp-nav");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    step(b._cpCard || b.closest(CARD) || b.parentElement, b.classList.contains("cp-next") ? 1 : -1);
  }, true);

  /* Arm the cards on screen as rows appear and scroll: buttons only,
     no request until a tap. */
  var pending = false;
  function scan() {
    pending = false;
    var cards = document.querySelectorAll(CARD);
    var vh = window.innerHeight || 800;
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      /* A photo that failed to load and was taken off the card takes its arrows with it. */
      if (c._cpArmed) { if (!c.querySelector("img") && c.querySelector(".cp-nav")) c.querySelectorAll(".cp-nav,.cp-dots").forEach(function (x) { x.remove(); }); continue; }
      var r = c.getBoundingClientRect();
      if (r.bottom > -200 && r.top < vh + 400 && r.right > -50 && r.left < (window.innerWidth || 400) + 400) arm(c);
    }
  }
  function later() { if (!pending) { pending = true; (window.requestAnimationFrame || setTimeout)(scan); } }
  document.addEventListener("scroll", later, { capture: true, passive: true });
  window.addEventListener("resize", later);
  if ("MutationObserver" in window) new MutationObserver(later).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", later); else later();
})();

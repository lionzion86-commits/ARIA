/* ============================================================
   EVERY CAROUSEL SCROLLS WITH A MOUSE AND A TRACKPAD (#443
   c.6615548354, Danny and his mom: "it used to work on everything,
   even a Kindle").

   WHY IT STOPPED. Every carousel snaps to its cards
   (scroll-snap-type:x mandatory). A wheel or trackpad scroll that ends
   less than half a card from where it started is pulled back to the
   nearest card -- where it began. With the 164px cards that was 82px
   and a mouse notch (100px) got past it; the big card (232-300px,
   Oct 31: a4f0a1a, bba50c4) doubled it, so a notch of shift+wheel and
   a short two-finger swipe snap straight back. Carousels only (#622,
   52ed06b) then took away the desktop grids, so a carousel became the
   only way to reach most products. A mouse never had another way in:
   no arrows, the scrollbar hidden on the homepage, Ofertas and Ropa
   Interior, and drag only on the product page's related rail.

   WHAT THIS DOES, on a pointer device only ((hover:hover) and
   (pointer:fine)); a phone gets nothing from this file and keeps its
   snap and its swipe exactly as they were:

     - no snapping, so a trackpad and shift+wheel move the row by what
       the hand moved (the browser's own scrolling; nothing here listens
       to the wheel, so a plain vertical wheel always scrolls the page);
     - an arrow on each side of the row that pages by the cards on
       screen (hidden at the end it cannot go past);
     - click-drag with the mouse: a drag past a few px scrolls the row
       and never opens the card under it; a plain click still does;
     - arrow keys on a focused card move to the next/previous card.

   Same rows as card-grow.js and card-photos.js, plus the app's full-list
   views; loaded beside them (defer) on every page with a carousel.
   Markup is never touched inside a row: the arrows sit beside it in its
   parent, so every rule and script that reads a row's cards is unchanged.
   ============================================================ */
(function () {
  "use strict";
  if (window.__ariaCarouselDesk) return;
  window.__ariaCarouselDesk = 1;

  var ROW = ".ariaRail:not(#liveRefineChips), div.rail, .track, .rel-row, .ariaCarousel, " +
            "#railExpandGrid, #storeResultsGrid, #catalogGrid, .dh-strip";
  var DESK = "(hover:hover) and (pointer:fine)";
  var DRAG = 6;            // px a mouse moves before a press is a drag, not a click
  var MIN_H = 120;         // chip strips (the brand houses) are not shelves: no arrows

  var css =
    "@media " + DESK + "{" +
      ":is(" + ROW + "){scroll-snap-type:none !important}" +
      ":is(" + ROW + ").cd-drag{cursor:grabbing;user-select:none;-webkit-user-select:none}" +
      ":is(" + ROW + ").cd-drag *{cursor:grabbing !important}" +
      ".cd-arrow{position:absolute;z-index:6;width:44px;height:44px;margin:-22px 0 0;padding:0;border:1px solid rgba(11,30,61,.12);" +
        "border-radius:50%;background:rgba(255,255,255,.96);color:#0B1E3D;box-shadow:0 4px 14px rgba(10,20,40,.22);cursor:pointer;" +
        "display:flex;align-items:center;justify-content:center;transition:opacity .15s ease,transform .15s ease}" +
      ".cd-arrow:hover{transform:scale(1.06)}" +
      ".cd-arrow:focus-visible{outline:3px solid #2456A0;outline-offset:2px}" +
      ".cd-arrow svg{width:22px;height:22px;pointer-events:none}" +
      ".cd-arrow[data-off]{opacity:0;pointer-events:none}" +
      ".cd-arrow[hidden]{display:none !important}" +
    "}" +
    "@media not all and " + DESK + "{.cd-arrow{display:none !important}}";
  var st = document.createElement("style");
  st.id = "ariaCarouselDesk";
  st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  /* A phone or tablet: its swipe already works and stays exactly as it was. */
  if (!window.matchMedia || !matchMedia(DESK).matches) return;

  function scrolls(row) {
    var ox = getComputedStyle(row).overflowX;
    return ox === "auto" || ox === "scroll";
  }
  function rowOf(el) {
    var r = el && el.closest ? el.closest(ROW) : null;
    return r && scrolls(r) ? r : null;
  }

  /* One page of cards: as many whole cards as fit, at least one. */
  function pageOf(row) {
    var cs = getComputedStyle(row);
    var gap = parseFloat(cs.columnGap) || 0;
    var inner = row.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    var w = 0;
    for (var c = row.firstElementChild; c && !w; c = c.nextElementSibling) w = c.offsetWidth;
    if (!w) return Math.max(120, row.clientWidth * 0.8);
    var n = Math.max(1, Math.floor((inner + gap) / (w + gap)));
    return n * (w + gap);
  }
  function go(row, dir) {
    var by = dir * pageOf(row);
    if (row.scrollBy) row.scrollBy({ left: by, behavior: "smooth" }); else row.scrollLeft += by;
  }

  /* ---------------- arrows ---------------- */
  var CHEV = { prev: "M15 5l-7 7 7 7", next: "M9 5l7 7-7 7" };
  var tracked = [];
  function arrow(row, k) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "cd-arrow cd-" + k;
    b.setAttribute("aria-label", k === "next" ? "Ver siguientes" : "Ver anteriores");
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + CHEV[k] + '"/></svg>';
    b.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      go(row, k === "next" ? 1 : -1);
    });
    return b;
  }
  function attach(row) {
    if (row._cdArrows) return;
    var p = row.parentElement;
    if (!p) return;
    if (getComputedStyle(p).position === "static") p.style.position = "relative";
    var prev = arrow(row, "prev"), next = arrow(row, "next");
    p.appendChild(prev); p.appendChild(next);
    row._cdArrows = [prev, next];
    row.addEventListener("scroll", function () { queue(); }, { passive: true });
    tracked.push(row);
  }
  function place(row) {
    var a = row._cdArrows, prev = a[0], next = a[1];
    if (!row.isConnected || prev.parentElement !== row.parentElement) {
      prev.remove(); next.remove(); row._cdArrows = null; return false;
    }
    var rr = row.getBoundingClientRect();
    var on = rr.width > 0 && rr.height >= MIN_H && row.scrollWidth > row.clientWidth + 4 && scrolls(row);
    if (!on) { prev.hidden = next.hidden = true; return true; }
    prev.hidden = next.hidden = false;
    var p = row.parentElement, pr = p.getBoundingClientRect(), cs = getComputedStyle(row);
    var pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0;
    var top = rr.top - pr.top - p.clientTop + pt + (rr.height - pt - pb) / 2;
    prev.style.top = next.style.top = Math.round(top) + "px";
    prev.style.left = Math.round(rr.left - pr.left - p.clientLeft + 8) + "px";
    next.style.left = Math.round(rr.right - pr.left - p.clientLeft - 52) + "px";
    var max = row.scrollWidth - row.clientWidth;
    if (row.scrollLeft > 2) prev.removeAttribute("data-off"); else prev.setAttribute("data-off", "");
    if (row.scrollLeft < max - 2) next.removeAttribute("data-off"); else next.setAttribute("data-off", "");
    return true;
  }

  var queued = false;
  function run() {
    queued = false;
    var rows = document.querySelectorAll(ROW);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r._cdArrows && r.offsetParent && scrolls(r) && r.scrollWidth > r.clientWidth + 4 && r.offsetHeight >= MIN_H) attach(r);
    }
    tracked = tracked.filter(place);
  }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(run); } }

  /* ---------------- click-drag ---------------- */
  var drag = null, eatClick = false;
  document.addEventListener("pointerdown", function (e) {
    if (e.pointerType !== "mouse" || e.button !== 0 || (e.target.closest && e.target.closest(".cd-arrow"))) return;
    var row = rowOf(e.target);
    if (!row || row.scrollWidth <= row.clientWidth + 4) return;
    drag = { row: row, x: e.clientX, left: row.scrollLeft, moved: false };
  }, true);
  window.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerType !== "mouse") return;
    if (!(e.buttons & 1)) { end(); return; }
    var dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > DRAG) {
      drag.moved = true;
      drag.row.classList.add("cd-drag");
      try { var s = getSelection(); if (s) s.removeAllRanges(); } catch (err) {}
    }
    if (drag.moved) { drag.row.scrollLeft = drag.left - dx; e.preventDefault(); }
  }, true);
  function end() {
    if (!drag) return;
    if (drag.moved) {
      drag.row.classList.remove("cd-drag");
      /* The click the browser sends on release is the end of a drag, not a tap. */
      eatClick = true;
      setTimeout(function () { eatClick = false; }, 0);
    }
    drag = null;
  }
  window.addEventListener("pointerup", end, true);
  window.addEventListener("pointercancel", end, true);
  window.addEventListener("blur", end);
  /* First in line (window, capture): ahead of the cards' own onclick, the
     photo arrows (card-photos.js) and any link. */
  window.addEventListener("click", function (e) {
    if (!eatClick) return;
    eatClick = false;
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  }, true);
  /* A mouse drag on a card photo or link would start the browser's own
     drag-and-drop of that image or URL instead of moving the row. */
  document.addEventListener("dragstart", function (e) {
    if (rowOf(e.target)) e.preventDefault();
  }, true);

  /* ---------------- keyboard ---------------- */
  document.addEventListener("keydown", function (e) {
    if ((e.key !== "ArrowRight" && e.key !== "ArrowLeft") || e.altKey || e.ctrlKey || e.metaKey) return;
    var t = e.target, row = t && t.parentElement && rowOf(t.parentElement);
    if (!row || t.parentElement !== row) return;
    var n = e.key === "ArrowRight" ? t.nextElementSibling : t.previousElementSibling;
    while (n && !(n.matches("a[href], button, [tabindex]") && n.offsetWidth)) n = e.key === "ArrowRight" ? n.nextElementSibling : n.previousElementSibling;
    if (!n) return;
    e.preventDefault();
    n.focus({ preventScroll: true });
    if (n.scrollIntoView) n.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  });

  /* Rows that fill in, appear or move later. */
  document.addEventListener("scroll", queue, { capture: true, passive: true });
  addEventListener("resize", queue, { passive: true });
  addEventListener("load", queue);
  function arm() {
    queue();
    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      setTimeout(function () { pending = false; queue(); }, 120);
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arm); else arm();
})();

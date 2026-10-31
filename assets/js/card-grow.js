/* ============================================================
   CARDS THAT FEEL ALIVE, ON EVERY CAROUSEL (#443 interaction standard,
   Danny 2026-10-25, c.6401134261 / c.6401147454 / c.6401335615).

   "The grow-on-focus/hover card interaction currently exists ONLY in
   the Perfumes block. It must be UNIVERSAL: every carousel/shelf on the
   page" -- homepage shelves, Ofertas, store rails, department pages,
   brand rooms, Perfumes included -- and the product page's related shelves.

   Pointer (desktop): hovering a card lifts it and grows it to 1.12 with
   a deeper shadow. Phone (no hover): the card nearest the middle of its
   carousel grows to 1.10 as the row scrolls, and a tap presses it to
   .97. The grow settles over 500ms ease-out, the press is quick.
   Only the transform animates (the shadow changes once, with the
   focus); nothing under reduced motion.

   Every page with a carousel loads this file (defer). One capturing
   scroll listener for the whole page, one rAF per frame, class toggles
   only: a card row added later (department rails, Ver mas pages) is
   picked up without wiring of its own.
   ============================================================ */
(function () {
  "use strict";

  /* The rows: .ariaRail (homepage and the app), div.rail (department,
     store, Ofertas, results, brand and designer rooms), .track (Ropa
     Interior), .rel-row (the product page's related shelves). Chip rows
     are not shelves. */
  var ROW = ".ariaRail:not(#liveRefineChips), div.rail, .track, .rel-row";
  var CARD = ":is(" + ROW + ") > :is(a, button):not(.sk)";
  var SETTLE = "500ms cubic-bezier(.22,1,.36,1)";
  /* below-row room: a grown card is 10-12% taller. Every row carries the
     big card now (#443 c.6545104608), as tall as Ropa Interior's, so
     every row gets the room Ropa Interior's had. */
  var ROOM = 60, TALL_ROOM = 60;

  var css =
    /* Room for a grown card: a carousel scrolls sideways, so it clips
       anything that sticks out above or below it. A card grows from its
       top edge -- down and to the sides, never up into the row's heading
       and its "Ver todo" -- so the room goes below the row. The thin band
       on top is for the desktop lift; its negative margin keeps the row
       where it was. */
    ":is(" + ROW + "){padding-top:8px !important;margin-top:-8px !important;padding-bottom:" + ROOM + "px !important}" +
    ":is(" + ROW + ").track{padding-bottom:" + TALL_ROOM + "px !important}" +
    /* Only the transform animates (the compositor's job); the shadow
       changes once with the focus instead of repainting every frame. */
    CARD + "{position:relative;transform-origin:center top;transition:transform " + SETTLE + ";will-change:transform}" +
    /* The end cards grow inward, so the row's edge never cuts them. */
    CARD + ":first-child{transform-origin:left top}" +
    CARD + ":last-child{transform-origin:right top}" +
    "@media (hover:hover) and (pointer:fine){" +
      CARD + ":hover{z-index:2;transform:translateY(-4px) scale(1.12);box-shadow:0 22px 44px rgba(10,20,40,.34),0 6px 14px rgba(10,20,40,.18)}" +
    "}" +
    "@media (hover:none){" +
      CARD + ".is-focus{z-index:2;transform:scale(1.10);box-shadow:0 18px 36px rgba(10,20,40,.30),0 5px 12px rgba(10,20,40,.16)}" +
      CARD + ":active{transform:scale(.97);transition-duration:120ms}" +
    "}" +
    "@media (prefers-reduced-motion:reduce){" + CARD + "{transition:none !important;transform:none !important}}";

  function addStyle() {
    if (document.getElementById("ariaCardGrow")) return;
    var s = document.createElement("style");
    s.id = "ariaCardGrow";
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }
  addStyle();

  /* PHONE FOCUS: with no hover, the card nearest the middle of the row
     takes the focus as it scrolls in. Pointer devices hover instead. */
  if (!window.matchMedia || !matchMedia("(hover: none)").matches) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  function isCard(el) {
    var t = el.tagName;
    return (t === "A" || t === "BUTTON") && !el.classList.contains("sk");
  }

  function focusRow(row) {
    var r = row.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || !r.width) return;
    var mid = r.left + r.width / 2, best = null, bestD = Infinity;
    for (var c = row.firstElementChild; c; c = c.nextElementSibling) {
      if (!isCard(c)) continue;
      var b = c.getBoundingClientRect(), d = Math.abs(b.left + b.width / 2 - mid);
      if (d < bestD) { bestD = d; best = c; }
    }
    var last = row.querySelector(":scope > .is-focus");
    if (best === last) return;
    if (last) last.classList.remove("is-focus");
    if (best) best.classList.add("is-focus");
  }

  var dirty = [], all = false, queued = false;
  function run() {
    queued = false;
    var rows = all ? document.querySelectorAll(ROW) : dirty;
    for (var i = 0; i < rows.length; i++) focusRow(rows[i]);
    dirty = []; all = false;
  }
  function queue(row) {
    if (row) { if (dirty.indexOf(row) < 0) dirty.push(row); } else all = true;
    if (!queued) { queued = true; requestAnimationFrame(run); }
  }

  /* A row scrolling sideways refocuses that row; the page scrolling
     brings new rows into view, so it refocuses those on screen. */
  document.addEventListener("scroll", function (e) {
    var t = e.target;
    if (t && t.nodeType === 1 && t.matches(ROW)) queue(t); else queue(null);
  }, { capture: true, passive: true });
  addEventListener("resize", function () { queue(null); }, { passive: true });

  function arm() {
    queue(null);
    /* Rows that fill in (or appear) after load. */
    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      setTimeout(function () { pending = false; queue(null); }, 150);
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arm); else arm();
})();

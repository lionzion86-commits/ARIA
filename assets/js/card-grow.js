/* ============================================================
   CARDS THAT FEEL ALIVE, ON EVERY CAROUSEL (#443 interaction standard,
   Danny 2026-10-25, c.6401134261 / c.6401147454 / c.6401335615).

   "The grow-on-focus/hover card interaction currently exists ONLY in
   the Perfumes block. It must be UNIVERSAL: every carousel/shelf on the
   page" -- homepage shelves, Ofertas, store rails, department pages,
   brand rooms, Perfumes included -- and the product page's related shelves.

   Pointer (desktop): hovering a card lifts it and grows it to 1.12 with
   a deeper shadow; the grow settles over 500ms ease-out. Phone (no
   hover): a tap presses the card to .97, quickly. Nothing under reduced
   motion.

   CARDS AT REST ARE FLAT (Danny's #522 review, #443 c.6476447519): the
   phone used to grow the card nearest the middle of each row to 1.10,
   so on an iPhone one card always sat magnified with no hover -- every
   carousel, not only SNIPES. Magnification is hover-only now; at rest
   every card is the same size. The press on tap stays (it is feedback
   to a touch, not a resting state).

   Every page with a carousel loads this file (defer); it adds one style
   sheet and nothing else.
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
  /* below-row room: a grown card is 10-12% taller; Ropa Interior's cards
     are the tallest on the site */
  var ROOM = 40, TALL_ROOM = 60;

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

})();

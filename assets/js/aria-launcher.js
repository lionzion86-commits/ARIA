/* ============================================================
   ARIA'S ORB ON EVERY PAGE (2026-10-19, #386, Danny's field test).

   "Tapping a card navigates to the product page and the chat vanishes
   -- worse, the floating Aria button is not on the product page at
   all. The only way back into the chat is returning to the homepage."

   The home page (index.html) draws its own orb and holds the chat. Every
   other page loads this file, which draws the same orb in the same
   corner and, on a tap, goes back to /?aria=1: the home page reopens the
   panel with the conversation as it was (sessionStorage, see THE
   CONVERSATION OUTLIVES THE PAGE in the app bundle) and the mic waits
   for its own tap. Nothing here talks to a server or holds a call:
   leaving the chat already ended it.

   Light on purpose: one 7 KB picture (WebP, PNG for old Safari), no
   framework, loaded with `defer`, nothing on the critical path.
   ============================================================ */
(function () {
  "use strict";
  function draw() {
    if (document.getElementById("assistantBtn") || document.getElementById("ariaLauncher")) return;
    var style = document.createElement("style");
    style.textContent =
      "#ariaLauncher{position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:900;" +
      "width:64px;height:64px;padding:0;border:0;border-radius:50%;background:transparent;cursor:pointer;" +
      "touch-action:manipulation;-webkit-tap-highlight-color:transparent;filter:drop-shadow(0 8px 18px rgba(10,31,68,.28));" +
      "transition:transform .2s ease}" +
      "#ariaLauncher:active{transform:scale(.94)}" +
      "#ariaLauncher img{display:block;width:64px;height:64px;border-radius:50%;object-fit:cover}" +
      "#ariaLauncher:focus-visible{outline:3px solid #2456A0;outline-offset:3px}" +
      "@media print{#ariaLauncher{display:none}}";
    document.head.appendChild(style);
    var a = document.createElement("a");
    a.id = "ariaLauncher";
    a.href = "/?aria=1";
    a.setAttribute("aria-label", "Asistente de compras Aria");
    a.innerHTML =
      '<picture><source srcset="/assets/aria-orb-pixar-192.webp" type="image/webp">' +
      '<img src="/assets/aria-orb-pixar-64.png" width="64" height="64" alt="Aria" decoding="async"></picture>';
    document.body.appendChild(a);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", draw, { once: true });
  else draw();
})();

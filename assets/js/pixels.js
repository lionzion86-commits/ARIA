/* ============================================================
   META + TIKTOK PIXELS (2026-10-19, #415).

   THE TWO IDS. One line each, here and nowhere else. Paste the ID
   between the quotes and deploy; leave it empty and that pixel does
   not exist: no script is fetched, no request reaches Meta or TikTok,
   nothing is logged, and every page works exactly as before.
   ============================================================ */
var ARIA_META_PIXEL_ID = "";
var ARIA_TIKTOK_PIXEL_ID = "";

/* HOW THE PAGES TALK TO IT. Each page's <head> carries a two-line stub,

     window.ariaTrack = window.ariaTrack || function(){ (ariaTrack.q = ariaTrack.q || []).push(arguments) };

   so ariaTrack('AddToCart', {...}) can be called before this file has
   arrived. This file is loaded `async` (it never holds up the page) and replays
   that queue.

   The events, with the same meaning on both pixels:
     PageView          every full page load (automatic, below)
     ViewContent       a product is shown (producto.html, the app's product view)
     AddToCart         a line reaches the cart
     InitiateCheckout  checkout.html opens with something in the cart
     Purchase          payment confirmed: value, currency PEN, order id
   TikTok calls a purchase "CompletePayment"; the name is mapped here.

   THE SDKS LOAD AFTER THE PAGE HAS. Both vendors' snippets fetch their
   script at once; here the fetch waits for the window's load event, so
   a shopper on a slow connection never waits on an ad pixel for the
   page or the search box (#409, the mountain test). The calls made
   before then are queued by the vendors' own stubs and sent when the
   script arrives. */
(function(){
  var META = String(ARIA_META_PIXEL_ID || "").trim();
  var TIKTOK = String(ARIA_TIKTOK_PIXEL_ID || "").trim();
  var queued = (window.ariaTrack && window.ariaTrack.q) || [];

  if (!META && !TIKTOK){
    window.ariaTrack = function(){};
    return;
  }

  function whenLoaded(fn){
    if (document.readyState === "complete") setTimeout(fn, 0);
    else window.addEventListener("load", function(){ setTimeout(fn, 0); }, { once: true });
  }
  function addScript(src){
    var s = document.createElement("script");
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }

  if (META){
    /* Meta's base code, minus its immediate script fetch. */
    var n = window.fbq = function(){
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!window._fbq) window._fbq = n;
    n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    window.fbq("init", META);
    window.fbq("track", "PageView");
    whenLoaded(function(){ addScript("https://connect.facebook.net/en_US/fbevents.js"); });
  }

  if (TIKTOK){
    /* TikTok's base code, minus its immediate script fetch. */
    var w = window, t = "ttq";
    w.TiktokAnalyticsObject = t;
    var ttq = w[t] = w[t] || [];
    ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent", "grantConsent"];
    ttq.setAndDefer = function(o, m){ o[m] = function(){ o.push([m].concat(Array.prototype.slice.call(arguments, 0))); }; };
    for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
    ttq.instance = function(id){
      var e = ttq._i[id] || [];
      for (var k = 0; k < ttq.methods.length; k++) ttq.setAndDefer(e, ttq.methods[k]);
      return e;
    };
    ttq.load = function(id, opts){
      var r = "https://analytics.tiktok.com/i18n/pixel/events.js";
      ttq._i = ttq._i || {}; ttq._i[id] = []; ttq._i[id]._u = r;
      ttq._t = ttq._t || {}; ttq._t[id] = +new Date();
      ttq._o = ttq._o || {}; ttq._o[id] = opts || {};
      whenLoaded(function(){ addScript(r + "?sdkid=" + id + "&lib=" + t); });
    };
    ttq.load(TIKTOK);
    ttq.page();
  }

  var TIKTOK_NAME = { Purchase: "CompletePayment" };

  /* params: { value, currency, contentId, contentName, contentIds,
     numItems, orderId }. Only what a call gives is sent. */
  function track(event, params){
    params = params || {};
    try {
      var ids = params.contentIds || (params.contentId ? [String(params.contentId)] : null);
      if (META){
        var m = {};
        if (params.value != null) m.value = Math.round(Number(params.value) * 100) / 100;
        if (params.currency) m.currency = params.currency;
        if (ids) { m.content_ids = ids; m.content_type = "product"; }
        if (params.contentName) m.content_name = params.contentName;
        if (params.numItems != null) m.num_items = params.numItems;
        if (params.orderId) m.order_id = String(params.orderId);
        /* The order id doubles as the event id, so one order is one
           Purchase even if a future server-side event repeats it. */
        window.fbq("track", event, m, params.orderId ? { eventID: "order-" + params.orderId } : undefined);
      }
      if (TIKTOK){
        var k = {};
        if (params.value != null) k.value = Math.round(Number(params.value) * 100) / 100;
        if (params.currency) k.currency = params.currency;
        if (ids) {
          k.content_type = "product";
          k.contents = ids.map(function(id){ return { content_id: id, content_name: params.contentName || undefined }; });
        }
        if (params.orderId) k.order_id = String(params.orderId);
        window.ttq.track(TIKTOK_NAME[event] || event, k, params.orderId ? { event_id: "order-" + params.orderId } : undefined);
      }
    } catch (e) { /* a pixel never breaks the page */ }
  }

  window.ariaTrack = track;
  for (var j = 0; j < queued.length; j++) track(queued[j][0], queued[j][1]);
})();

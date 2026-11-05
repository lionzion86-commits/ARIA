/* ============================================================
   ARIA'S PLUSH STAR (#443 c.6647694000, the talking star c.6648427324,
   the corner c.6648429009 / c.6648434250; Danny 2026-11-04).

   Draws Aria herself in every slot she lives in: the bottom-right corner
   launcher (the whole character, no ball around her), her place at the
   top of the open chat for the whole conversation, the small face beside
   each of her messages and the «escribiendo» row.

   FOUR FRAMES, NOTHING ELSE: open eyes (idle), blink, talk1 (mouth open),
   talk2 (smile). Lucifer's delivered art, resized by
   scripts/import-aria-star.mjs. Every slot draws the same cached files.
   The open frame paints with the page; the other three load once the
   page has finished loading, before she ever needs them. No video.

   STATES, each wired to a real signal in the chat stack:
     idle       open frame, bob + breath (CSS transform), blink every
                3.5-5 s at random, closed ~150 ms
     listening  slight lean-in tilt. Signal: the shopper typing in
                #assistantInput (each keystroke, held 1.5 s), or the app's
                setOrbState('listening'), which fires when the live call
                hears the shopper's voice (Realtime speech_started, the
                owned voice's VAD "aria.user speaking")
     thinking   tilt + soft pulse. Signal: setOrbState('thinking') (a
                search or a reply is being fetched) or the «Aria está
                escribiendo…» row being up (showAssistantTyping)
     happy      smile frame (talk2) + one small hop, 1.2 s. Signal:
                rememberShownProduct(), i.e. product cards landing in the
                chat ("aria:results")
     speaking   talk1/talk2 alternate every 120-180 ms. Signal:
                setOrbState('speaking'), which the app sets on her audio's
                onplaying and clears on onended/onpause/onerror (and the
                live voice's own speaking/listening). The mouth moves only
                inside that window. NOT amplitude-driven: no stage of her
                audio exposes a level (no AnalyserNode anywhere; the only
                audioLevel is WebRTC getStats, sampled every 1-5 s for
                diagnostics), so the cadence is timed, not her loudness.
   prefers-reduced-motion: a still star, open frame only, in every state.

   UNTIL THE FRAMES LAND, NOTHING CHANGES. The manifest below is null
   until the import stamps it; while it is null this file defines
   window.AriaStar = { active:false } and stops, and every slot keeps
   the orb exactly as it is today. The manifest travels inside this
   file, so it is never fetched.
   ============================================================ */
(function () {
  "use strict";
  var M = /*ARIA-STAR-MANIFEST:START*/{"base":"/assets/aria/star/","frames":{"open":"star-open-240.eb7338f1.webp","blink":"star-blink-240.6bc48708.webp","talk1":"star-talk1-240.fd38a1e9.webp","talk2":"star-talk2-240.26be56f3.webp"},"slots":{"launcher":80,"presence":64,"avatar":24,"loader":20}}/*ARIA-STAR-MANIFEST:END*/;
  var api = { active: false };
  window.AriaStar = api;
  if (!M || !M.frames || !M.frames.open) return;

  var t0 = window.performance && performance.now ? performance.now() : 0;
  var FR = {}, NAMES = ["open", "blink", "talk1", "talk2"];
  for (var n = 0; n < NAMES.length; n++) FR[NAMES[n]] = M.base + M.frames[NAMES[n]];
  var SIZE = M.slots || { launcher: 80, presence: 64, avatar: 24, loader: 20 };
  var TIMING = { min: 3500, max: 5000, closed: 150, mouthMin: 120, mouthMax: 180, happy: 1200, typingHold: 1500 };
  var doc = document, root = doc.documentElement;
  var mounts = [];
  var sig = { speaking: false, thinking: false, typingRow: false, listening: false, keys: false, happy: false };
  var ready = false, blinkTimer = 0, mouthTimer = 0, happyTimer = 0, keyTimer = 0, blinks = 0, mouthFlips = 0;
  var blinking = false, mouth = "talk1";
  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var still = function () { return !!(mq && mq.matches); };

  api.active = true;
  api.manifest = M;
  api.timing = TIMING;
  api.frames = FR;

  var L = SIZE.launcher, P = SIZE.presence, A = SIZE.avatar, Ld = SIZE.loader;
  /* Transform and opacity only: nothing here can trigger layout. */
  var css =
    "@keyframes ariaStarIdle{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(0,-5%,0) scale(1.045)}}" +
    "@keyframes ariaStarTalk{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(0,-3%,0) scale(1.03)}}" +
    "@keyframes ariaStarLean{0%,100%{transform:translate3d(-4%,1%,0) rotate(-7deg) scale(1.04)}50%{transform:translate3d(-4%,-1%,0) rotate(-7deg) scale(1.06)}}" +
    "@keyframes ariaStarThink{0%,100%{transform:rotate(8deg) scale(1);opacity:1}50%{transform:rotate(8deg) scale(1.06);opacity:.9}}" +
    "@keyframes ariaStarHappy{0%{transform:translate3d(0,0,0) scale(1)}30%{transform:translate3d(0,-12%,0) scale(1.1)}60%{transform:translate3d(0,0,0) scale(.97)}100%{transform:translate3d(0,0,0) scale(1)}}" +
    ".aria-star{position:relative;display:inline-block;flex:0 0 auto}" +
    ".aria-star .aria-star-b{position:absolute;inset:0;will-change:transform;animation:ariaStarIdle 3.6s ease-in-out infinite}" +
    ".aria-star[data-state=speaking] .aria-star-b{animation:ariaStarTalk .9s ease-in-out infinite}" +
    ".aria-star[data-state=listening] .aria-star-b{animation:ariaStarLean 2.4s ease-in-out infinite}" +
    ".aria-star[data-state=thinking] .aria-star-b{animation:ariaStarThink 1.1s ease-in-out infinite}" +
    ".aria-star[data-state=happy] .aria-star-b{animation:ariaStarHappy .7s ease-out 1}" +
    ".aria-star img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;border-radius:0;pointer-events:none}" +
    /* THE CORNER IS HER (c.6648434250): the whole character, no ball or
       badge; a little larger than the orb so her face reads, still inside
       the corner the page already keeps clear (--orb-dock-safe 104px). */
    "html.aria-star-on #assistantBtn{width:" + L + "px;height:" + L + "px;border-radius:0}" +
    "html.aria-star-on #assistantIconSpark{border-radius:0}" +
    "html.aria-star-on #assistantIconSpark::before,html.aria-star-on #assistantIconSpark::after,html.aria-star-on #assistantIconSpark .aria-orb-ring{display:none}" +
    "html.aria-star-on #assistantIconSpark,html.aria-star-on #assistantIconSpark.is-speaking,html.aria-star-on #assistantIconSpark.is-thinking{animation:none}" +
    "html.aria-star-on #ariaOrbImg,html.aria-star-on #ariaOrbBlink{border-radius:0;object-fit:contain}" +
    "html.aria-star-on #ariaOrbFloat{animation:ariaStarIdle 3.6s ease-in-out infinite}" +
    "html.aria-star-on #assistantIconSpark[data-state=speaking] #ariaOrbFloat{animation:ariaStarTalk .9s ease-in-out infinite}" +
    "html.aria-star-on #assistantIconSpark[data-state=listening] #ariaOrbFloat{animation:ariaStarLean 2.4s ease-in-out infinite}" +
    "html.aria-star-on #assistantIconSpark[data-state=thinking] #ariaOrbFloat{animation:ariaStarThink 1.1s ease-in-out infinite}" +
    "html.aria-star-on #assistantIconSpark[data-state=happy] #ariaOrbFloat{animation:ariaStarHappy .7s ease-out 1}" +
    "#ariaLauncher.aria-star-corner{width:" + L + "px;height:" + L + "px;border-radius:0;filter:none}" +
    "#ariaLauncher .aria-star img{border-radius:0;object-fit:contain;width:100%;height:100%}" +
    /* HER PLACE IN THE OPEN CHAT, for the whole conversation. */
    "html.aria-star-on #assistantHeadFace{background:transparent!important;width:" + P + "px;height:" + P + "px;border-radius:0}" +
    "html.aria-star-on #assistantHeadFace>svg{display:none}" +
    /* Beside each of her messages: the open frame, still (cached). */
    "html.aria-star-on #assistantMessages .ariaChatMsg:not(.ml-auto){position:relative;margin-left:" + (A + 6) + "px}" +
    "html.aria-star-on #assistantMessages .ariaChatMsg:not(.ml-auto)::before{content:'';position:absolute;left:-" + (A + 6) + "px;bottom:0;width:" + A + "px;height:" + A + "px;background:url('" + FR.open + "') center/contain no-repeat}" +
    /* The «escribiendo» row: her face, thinking. */
    "html.aria-star-on #assistantTyping::before{content:'';flex:0 0 " + Ld + "px;width:" + Ld + "px;height:" + Ld + "px;background:url('" + FR.open + "') center/contain no-repeat;animation:ariaStarThink 1.1s ease-in-out infinite}" +
    "@media (prefers-reduced-motion: reduce){.aria-star .aria-star-b,html.aria-star-on #assistantTyping::before{animation:none!important}}";
  var style = doc.createElement("style");
  style.id = "ariaStarCss";
  style.textContent = css;
  (doc.head || root).appendChild(style);
  root.classList.add("aria-star-on");

  function img(frame, alt) {
    var i = doc.createElement("img");
    i.className = "aria-star-f";
    i.setAttribute("data-frame", frame);
    i.alt = alt || "";
    if (!alt) i.setAttribute("aria-hidden", "true");
    i.decoding = "async";
    i.draggable = false;
    if (frame === "open" || ready) i.src = FR[frame];
    if (frame !== "open") i.style.opacity = "0";
    return i;
  }

  /* A fresh star for a slot: root > motion wrapper > the four frames. */
  function make(slot) {
    var px = SIZE[slot] || 40;
    var s = doc.createElement("span");
    s.className = "aria-star";
    s.setAttribute("data-slot", slot);
    s.style.width = px + "px";
    s.style.height = px + "px";
    var b = doc.createElement("span");
    b.className = "aria-star-b";
    var f = {};
    for (var i = 0; i < NAMES.length; i++) { f[NAMES[i]] = img(NAMES[i], NAMES[i] === "open" && slot === "launcher" ? "Aria" : ""); b.appendChild(f[NAMES[i]]); }
    s.appendChild(b);
    mounts.push({ el: s, f: f });
    paint();
    return s;
  }

  /* index.html's corner launcher, already in the page (the import points
     its <img> at the frames). Adopted, not redrawn, so nothing loads twice. */
  function adoptIndexLauncher() {
    var spark = doc.getElementById("assistantIconSpark"), fl = doc.getElementById("ariaOrbFloat");
    var o = doc.getElementById("ariaOrbImg"), k = doc.getElementById("ariaOrbBlink");
    if (!spark || !fl || !o || !k) return;
    var f = { open: o, blink: k };
    if ((o.getAttribute("src") || "").replace(/^\//, "") !== FR.open.slice(1)) { o.removeAttribute("onerror"); o.src = FR.open; }
    k.removeAttribute("onerror");
    k.setAttribute("data-src", FR.blink);
    var tk = ["talk1", "talk2"];
    for (var i = 0; i < tk.length; i++) {
      var e = fl.querySelector('img[data-aria-star="' + tk[i] + '"]');
      if (!e) { e = img(tk[i], ""); fl.appendChild(e); }
      f[tk[i]] = e;
    }
    for (var key in f) {
      var im = f[key];
      im.style.borderRadius = "0"; im.style.objectFit = "contain"; im.style.transition = "none";
      im.style.position = "absolute"; im.style.inset = "0"; im.style.width = "100%"; im.style.height = "100%";
      if (key !== "open") im.style.opacity = "0";
    }
    spark.classList.add("aria-star");
    spark.setAttribute("data-slot", "launcher");
    fl.classList.add("aria-star-b");
    mounts.push({ el: spark, f: f });
    paint();
  }

  function mountPresence() {
    var face = doc.getElementById("assistantHeadFace");
    if (!face || face.querySelector(".aria-star")) return;
    face.appendChild(make("presence"));
  }

  /* ---- which pose, which frame ---- */
  function state() {
    if (still()) return "idle";
    if (sig.speaking) return "speaking";
    if (sig.thinking || sig.typingRow) return "thinking";
    if (sig.happy) return "happy";
    if (sig.listening || sig.keys) return "listening";
    return "idle";
  }
  function frameFor(st) {
    if (!ready || still()) return "open";
    if (st === "speaking") return mouth;
    if (st === "happy") return "talk2";
    return blinking ? "blink" : "open";
  }
  var last = "";
  function paint() {
    var st = state(), fr = frameFor(st);
    api.state = st; api.frame = fr;
    for (var i = 0; i < mounts.length; i++) {
      var m = mounts[i];
      if (m.el.getAttribute("data-state") !== st) m.el.setAttribute("data-state", st);
      m.el.classList.toggle("is-blink", fr === "blink");
      for (var k = 0; k < NAMES.length; k++) {
        var im = m.f[NAMES[k]];
        if (!im || (NAMES[k] !== "open" && !im.getAttribute("src"))) continue;
        var want = NAMES[k] === fr ? "1" : "0";
        if (im.style.opacity !== want) im.style.opacity = want;
      }
    }
    if (api.trace && fr + "|" + st !== last) api.trace.push({ t: Date.now(), state: st, frame: fr });
    last = fr + "|" + st;
    mouthLoop(st === "speaking" && ready);
  }

  /* ---- blink (idle and listening only) ---- */
  function nextDelay() { return TIMING.min + Math.random() * (TIMING.max - TIMING.min); }
  function scheduleBlink() {
    clearTimeout(blinkTimer);
    if (still() || !ready) return;
    blinkTimer = setTimeout(function () {
      var st = state();
      if (!doc.hidden && (st === "idle" || st === "listening")) {
        blinks++;
        blinking = true; paint();
        setTimeout(function () { blinking = false; paint(); }, TIMING.closed);
      }
      scheduleBlink();
    }, nextDelay());
  }

  /* ---- the mouth: only inside the speaking window ---- */
  function mouthLoop(on) {
    if (!on) { if (mouthTimer) { clearTimeout(mouthTimer); mouthTimer = 0; } mouth = "talk1"; return; }
    if (mouthTimer) return;
    mouthTimer = setTimeout(function () {
      mouthTimer = 0;
      if (state() !== "speaking") return;
      mouth = mouth === "talk1" ? "talk2" : "talk1";
      mouthFlips++;
      paint();
    }, TIMING.mouthMin + Math.random() * (TIMING.mouthMax - TIMING.mouthMin));
  }

  /* The three other frames load after the page (they never compete with
     the first screen), every slot at once, one request each. */
  function loadFrames() {
    if (still() || ready || !mounts.length) return;
    var left = 0;
    var done = function () { ready = true; paint(); scheduleBlink(); };
    var one = function () { if (--left === 0) done(); };
    var rest = ["blink", "talk1", "talk2"];
    for (var r = 0; r < rest.length; r++) {
      for (var i = 0; i < mounts.length; i++) {
        var im = mounts[i].f[rest[r]];
        if (im && !im.getAttribute("src")) im.src = FR[rest[r]];
      }
      var probe = mounts[0].f[rest[r]];
      if (probe.complete && probe.naturalWidth) continue;
      left++;
      probe.addEventListener("load", one, { once: true });
      probe.addEventListener("error", one, { once: true });
    }
    if (left === 0) done();
  }

  /* ---- the signals ---- */
  doc.addEventListener("aria:state", function (e) {
    var s = e && e.detail && e.detail.state;
    sig.speaking = s === "speaking";
    sig.thinking = s === "thinking";
    sig.listening = s === "listening";
    paint();
  });
  doc.addEventListener("aria:typing", function (e) {
    sig.typingRow = !!(e && e.detail && e.detail.on);
    paint();
  });
  doc.addEventListener("aria:results", function () {
    sig.happy = true;
    clearTimeout(happyTimer);
    happyTimer = setTimeout(function () { sig.happy = false; paint(); }, TIMING.happy);
    paint();
  });
  /* The shopper typing to her. */
  doc.addEventListener("input", function (e) {
    var t = e.target;
    if (!t || t.id !== "assistantInput") return;
    sig.keys = !!t.value;
    clearTimeout(keyTimer);
    if (sig.keys) keyTimer = setTimeout(function () { sig.keys = false; paint(); }, TIMING.typingHold);
    paint();
  }, true);

  if (mq) {
    var onChange = function () {
      if (still()) { clearTimeout(blinkTimer); blinking = false; }
      else if (ready) scheduleBlink();
      else loadFrames();
      paint();
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  api.make = make;
  api.nextDelay = nextDelay;
  api.blinkCount = function () { return blinks; };
  api.mouthFlips = function () { return mouthFlips; };
  api.blinkReady = function () { return ready; };

  function start() {
    adoptIndexLauncher();
    mountPresence();
    if (doc.readyState === "complete") loadFrames();
    else window.addEventListener("load", loadFrames, { once: true });
    if (window.performance && performance.now) api.initMs = performance.now() - t0;
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();

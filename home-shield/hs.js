/* Aria Home Shield: the homeowner pages (index.html and caso.html).
   No framework, no shop bundle. One i18n object holds every word in
   English and Spanish. One <audio> element and one speech channel carry
   Aria's voice (hs-tts); the mic goes to hs-stt; turns go to hs-chat. */
(function () {
  "use strict";
  var FN = "/.netlify/functions/";
  var doc = document, root = doc.documentElement;

  /* ================================================================
     COPY. Every visible word, both languages.
     ================================================================ */
  var I18N = window.HS_I18N;

  /* ================================================================
     LANGUAGE
     ================================================================ */
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ }
    return null;
  }
  var lang = root.lang === "es" ? "es" : "en";
  function t(key, vars) {
    var s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }
  var langHooks = [];
  function applyLang(next, user) {
    lang = next === "es" ? "es" : "en";
    window.HS_APPLY_LANG(lang);
    var i;
    var lb = doc.getElementById("hsLang");
    if (lb) lb.setAttribute("lang", lang === "es" ? "en" : "es");
    if (user) {
      store("hs_lang", lang);
      try { var u = new URL(location.href); u.searchParams.set("lang", lang); history.replaceState(null, "", u.pathname + u.search + u.hash); } catch (e) { /* old browser */ }
    }
    for (i = 0; i < langHooks.length; i++) langHooks[i]();
    root.classList.remove("hs-pending");
  }

  /* ================================================================
     ONE VOICE, ONE CHANNEL. Every word Aria says goes through speak():
     one persistent <audio>, unlocked by the first tap; a new speech
     aborts the one in flight (synthesis included) and cancelled audio
     never plays; text is delivered in sentence chunks with real pauses.
     ================================================================ */
  var audio = doc.getElementById("hsAudio");
  var SILENCE = "data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQgAAAAAAAAAAAAAAA==";
  var unlocked = false;
  function unlockAudio() {
    if (unlocked || !audio) return;
    unlocked = true;
    try { audio.src = SILENCE; var p = audio.play(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* ignore */ }
  }
  doc.addEventListener("pointerdown", unlockAudio, { capture: true, passive: true });
  doc.addEventListener("keydown", unlockAudio, { capture: true, passive: true });

  var muted = store("hs_muted") === "1";
  var speech = { id: 0, ac: null, owner: null, onStop: null, active: false };
  window.HS_SPEECH = speech;

  function chunkText(text) {
    var s = String(text || "").replace(/\s+/g, " ").trim();
    if (!s) return [];
    var parts = s.match(/[^.!?…]+[.!?…]+["”’)]*\s*|[^.!?…]+$/g) || [s];
    var out = [], cur = "";
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) continue;
      // First chunk alone (fast start), then sentences grouped up to ~260 chars.
      if (!out.length && !cur) { out.push(p); continue; }
      if ((cur + " " + p).trim().length > 260 && cur) { out.push(cur); cur = p; } else cur = (cur + " " + p).trim();
    }
    if (cur) out.push(cur);
    var fin = [];
    for (i = 0; i < out.length; i++) {
      var c = out[i];
      while (c.length > 800) { var cut = c.lastIndexOf(" ", 780); if (cut < 200) cut = 780; fin.push(c.slice(0, cut)); c = c.slice(cut).trim(); }
      fin.push(c);
    }
    return fin;
  }

  function synth(text, signal) {
    return fetch(FN + "hs-tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text, lang: lang }),
      signal: signal
    }).then(function (r) {
      var ct = r.headers.get("content-type") || "";
      if (r.ok && ct.indexOf("audio") === 0) return r.blob();
      return r.json().catch(function () { return {}; }).then(function (j) {
        var e = new Error((j && j.error) || "voice error " + r.status);
        e.code = j && j.code; e.status = r.status;
        throw e;
      });
    });
  }

  function playBlob(blob, id) {
    return new Promise(function (resolve, reject) {
      if (id !== speech.id) return resolve(false);
      var url = URL.createObjectURL(blob);
      var done = function (ok) {
        audio.removeEventListener("ended", onEnd); audio.removeEventListener("error", onErr); audio.removeEventListener("pause", onPause);
        try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
        resolve(ok);
      };
      var onEnd = function () { done(true); };
      var onPause = function () { if (id !== speech.id) done(false); };
      var onErr = function () { done(false); };
      audio.addEventListener("ended", onEnd); audio.addEventListener("error", onErr); audio.addEventListener("pause", onPause);
      speech.cancelPlay = function () { done(false); };
      audio.src = url;
      var p = audio.play();
      if (p && p.catch) p.catch(function (e) { done(false); if (id === speech.id) reject(e); });
    });
  }
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function stopSpeech() {
    speech.id++;
    if (speech.ac) { try { speech.ac.abort(); } catch (e) { /* ignore */ } }
    speech.ac = null;
    try { audio.pause(); } catch (e) { /* ignore */ }
    if (speech.cancelPlay) { var c = speech.cancelPlay; speech.cancelPlay = null; c(); }
    var cb = speech.onStop; speech.onStop = null; speech.owner = null; speech.active = false;
    setSpeaking(false);
    if (cb) cb();
  }

  /* LATENCY MARKS for the turn in flight (the test harness reads them). */
  var lat = null;
  window.HS_LAT = [];
  function mark(k) { if (lat && !lat[k]) lat[k] = performance.now(); }

  /** Open a speech queue: push() sentences as they exist, end() when the
   * text is complete. Sentence n+1 is synthesized while n plays; one
   * channel, so opening another queue (or stopSpeech) cancels this one. */
  function speechQueue(opts) {
    opts = opts || {};
    stopSpeech();
    var id = speech.id;
    var q = { chunks: [], ended: false, i: 0, wake: null };
    var off = muted || !audio;
    var ac = new AbortController();
    if (!off) { speech.ac = ac; speech.owner = opts.owner || null; speech.onStop = opts.onStop || null; speech.active = true; }
    var pending = [];
    var fetchAt = function (i) {
      if (!pending[i] && i < q.chunks.length) {
        pending[i] = synth(q.chunks[i], ac.signal).then(function (b) { if (i === 0) mark("ttsFirstByte"); return b; });
        pending[i].catch(function () {});
      }
      return pending[i];
    };
    var poke = function () { if (q.wake) { var w = q.wake; q.wake = null; w(); } };
    q.push = function (text) {
      text = String(text || "").trim();
      if (off || !text || id !== speech.id) return;
      q.chunks.push(text);
      if (q.chunks.length - 1 <= q.i + 1) fetchAt(q.chunks.length - 1);
      poke();
    };
    q.end = function () { q.ended = true; poke(); };
    var loop = function () {
      if (id !== speech.id) return Promise.resolve({ cancelled: true });
      if (q.i < q.chunks.length) {
        return fetchAt(q.i).then(function (blob) {
          if (id !== speech.id) return { cancelled: true };
          fetchAt(q.i + 1);
          if (opts.onStart && q.i === 0) opts.onStart();
          setSpeaking(true);
          var onPlaying = function () { mark("firstAudio"); audio.removeEventListener("playing", onPlaying); };
          audio.addEventListener("playing", onPlaying);
          return playBlob(blob, id).then(function (played) {
            setSpeaking(false);
            if (!played || id !== speech.id) return { cancelled: true };
            q.i++;
            return wait(q.i < q.chunks.length ? (/[.!?…]["”’)]*$/.test(q.chunks[q.i - 1]) ? 260 : 160) : 0).then(loop);
          });
        });
      }
      if (q.ended) return Promise.resolve({ ok: true });
      return new Promise(function (r) { q.wake = r; }).then(loop);
    };
    q.done = off ? Promise.resolve({ ok: true, skipped: true }) : loop().then(function (r) {
      if (id === speech.id) { speech.active = false; speech.owner = null; speech.onStop = null; }
      return r;
    }, function (err) {
      if (id === speech.id) { speech.active = false; speech.owner = null; speech.onStop = null; setSpeaking(false); }
      if (err && err.name === "AbortError") return { cancelled: true };
      return { error: err };
    });
    return q;
  }

  /** Speak a whole text (Listen buttons, the greeting). */
  function speak(text, opts) {
    var q = speechQueue(opts);
    chunkText(text).forEach(q.push);
    q.end();
    return q.done;
  }

  /* Sentence splitter for streamed text: whole sentences out as they close. */
  function sentenceSplitter(onSentence) {
    var buf = "";
    return {
      feed: function (t) {
        buf += t;
        var re = /[^.!?…]*[.!?…]+["”’)]*\s+/g, m, last = 0;
        while ((m = re.exec(buf))) { var sen = m[0].trim(); if (sen) onSentence(sen); last = re.lastIndex; }
        buf = buf.slice(last);
      },
      flush: function () { var r = buf.trim(); buf = ""; if (r) onSentence(r); }
    };
  }

  /* ================================================================
     ARIA'S STAR: blink and breathe when idle, mouth moves while her
     audio plays, steady glow while the mic is live.
     ================================================================ */
  var stars = [], starState = "idle", blinkT = 0, mouthT = 0, framesLoaded = {};
  function loadFrame(name) {
    if (framesLoaded[name]) return;
    framesLoaded[name] = "loading";
    var imgs = doc.querySelectorAll(".f-" + name), left = imgs.length;
    for (var i = 0; i < imgs.length; i++) {
      (function (im) {
        im.addEventListener("load", function () { if (--left <= 0) framesLoaded[name] = true; }, { once: true });
        im.src = im.getAttribute("data-src");
      })(imgs[i]);
    }
  }
  function setFrame(f) {
    if (f !== "open" && framesLoaded[f] !== true) f = "open";
    for (var i = 0; i < stars.length; i++) stars[i].face.setAttribute("data-frame", f);
  }
  function setStarState(s, labelKey) {
    starState = s;
    for (var i = 0; i < stars.length; i++) stars[i].el.setAttribute("data-state", s);
    var labels = doc.querySelectorAll("[data-star-state]");
    var key = labelKey || "state." + (s === "speaking" ? "speaking" : s === "listening" ? "listening" : s === "thinking" ? "thinking" : "idle");
    for (i = 0; i < labels.length; i++) { labels[i].setAttribute("data-i18n", key); labels[i].textContent = t(key); }
  }
  function setSpeaking(on) {
    clearTimeout(mouthT);
    if (on) {
      loadFrame("talk1"); loadFrame("talk2");
      if (starState !== "speaking") setStarState("speaking");
      var flip = function (m) { setFrame(m); mouthT = setTimeout(function () { flip(m === "talk1" ? "talk2" : "talk1"); }, 120 + Math.random() * 60); };
      flip("talk1");
    } else {
      setFrame("open");
      if (starState === "speaking") setStarState(convo.active ? convo.uiState() : "idle");
    }
  }
  function blinkLoop() {
    clearTimeout(blinkT);
    blinkT = setTimeout(function () {
      if (starState !== "speaking") { setFrame("blink"); setTimeout(function () { if (starState !== "speaking") setFrame("open"); }, 150); }
      blinkLoop();
    }, 3500 + Math.random() * 1500);
  }
  function initStars() {
    var els = doc.querySelectorAll(".hs-star");
    for (var i = 0; i < els.length; i++) stars.push({ el: els[i], face: els[i].querySelector(".hs-star-face") });
    var later = function () { loadFrame("blink"); };
    if (doc.readyState === "complete") setTimeout(later, 400); else window.addEventListener("load", function () { setTimeout(later, 400); });
    if (!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) blinkLoop();
  }

  /* ================================================================
     ASSET SLOTS: photography and the badge render only when the build
     stamped the file into the manifest (scripts/build-home-shield-assets.mjs).
     ================================================================ */
  function initAssets() {
    var m = null;
    try { var raw = (doc.getElementById("hs-assets") || {}).textContent || ""; m = JSON.parse(raw.replace(/\/\*HS-ASSETS:(START|END)\*\//g, "")); } catch (e) { m = null; }
    if (!m) return;
    var photos = m.photos || {};
    var slots = doc.querySelectorAll("[data-photo]");
    for (var i = 0; i < slots.length; i++) {
      var p = photos[slots[i].getAttribute("data-photo")];
      if (!p || !p.src) continue;
      var im = doc.createElement("img");
      im.src = p.src; im.alt = (p.alt && (p.alt[lang] || p.alt.en)) || ""; im.loading = slots[i].getAttribute("data-photo") === "hero" ? "eager" : "lazy"; im.decoding = "async";
      if (p.w) { im.width = p.w; im.height = p.h; }
      slots[i].appendChild(im); slots[i].hidden = false;
    }
    if (m.badge) {
      var b = doc.querySelectorAll("[data-badge]");
      for (i = 0; i < b.length; i++) { b[i].style.backgroundImage = "url('" + m.badge + "')"; b[i].hidden = false; }
    }
  }

  /* ================================================================
     LISTEN CONTROLS: each reads its own section in Aria's voice; one
     voice at a time.
     ================================================================ */
  function sectionText(sel) {
    var el = doc.querySelector(sel);
    if (!el) return "";
    var parts = el.querySelectorAll(".hs-say");
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var only = parts[i].closest("[data-say-lang]");
      if (only && only.getAttribute("data-say-lang") !== lang) continue;
      var s = parts[i].textContent.replace(/\s+/g, " ").trim();
      if (s && !/[.!?:;…]$/.test(s)) s += ".";
      if (s) out.push(s);
    }
    return out.join(" ");
  }
  function setListenBtn(btn, st) {
    btn.classList.toggle("is-on", st === "on");
    btn.classList.toggle("is-loading", st === "loading");
    var lbl = btn.querySelector("[data-i18n]");
    if (lbl) { lbl.setAttribute("data-i18n", st ? "stop" : "listen"); lbl.textContent = t(st ? "stop" : "listen"); }
  }
  function onListen(btn) {
    if (speech.owner === btn) { stopSpeech(); return; }
    convo.stop(); abortTurn();
    var text = sectionText(btn.getAttribute("data-listen"));
    setListenBtn(btn, "loading");
    var reset = function () { setListenBtn(btn, ""); };
    var errBox = pageError(btn);
    if (errBox) errBox.hidden = true;
    speak(text, { owner: btn, onStop: reset, onStart: function () { setListenBtn(btn, "on"); } }).then(function (r) {
      if (speech.owner !== btn) reset();
      if (r && r.error) showListenError(btn, r.error);
    });
  }
  function pageError(btn) {
    var host = btn.parentNode;
    return host && host.querySelector(".hs-listen-err");
  }
  function showListenError(btn, err) {
    var box = pageError(btn);
    if (!box) { box = doc.createElement("p"); box.className = "hs-listen-err hs-err"; box.setAttribute("role", "alert"); btn.parentNode.appendChild(box); }
    box.textContent = t("err.voice", { e: err.message || String(err) });
    box.hidden = false;
  }

  /* ================================================================
     CONVERSATION STATE (text + voice)
     ================================================================ */
  var chat = { messages: [], draft: null, ready: false, caseId: null, token: null, link: null, busy: false, greeted: false, pendingFile: null, cardMode: null, edited: false };
  window.HS_CHAT = chat;
  var sheet = doc.getElementById("hsSheet");
  var msgs = doc.getElementById("hsMsgs");
  var errEl = doc.getElementById("hsErr");
  var input = doc.getElementById("hsInput");

  function showErr(msg) { if (!errEl) return; errEl.textContent = msg; errEl.hidden = !msg; }
  function scrollDown() { if (msgs) msgs.scrollTop = msgs.scrollHeight; }
  function addMsg(role, text, extra) {
    var b = doc.createElement("div");
    b.className = "hs-msg " + (role === "user" ? "hs-msg-u" : "hs-msg-a");
    b.textContent = text;
    if (extra) b.appendChild(extra);
    msgs.appendChild(b);
    scrollDown();
    return b;
  }
  var typingEl = null;
  function typing(on) {
    if (on && !typingEl) { typingEl = doc.createElement("div"); typingEl.className = "hs-typing"; typingEl.setAttribute("aria-label", t("state.thinking")); typingEl.innerHTML = "<i></i><i></i><i></i>"; msgs.appendChild(typingEl); scrollDown(); }
    if (!on && typingEl) { typingEl.remove(); typingEl = null; }
  }
  function introText() { return t("intro.line1") + " " + t("intro.line2"); }
  function greet() {
    if (chat.greeted) return false;
    chat.greeted = true;
    addMsg("assistant", introText());
    chat.messages.push({ role: "assistant", content: introText() });
    return true;
  }
  var lastFocus = null;
  function openSheet() {
    if (!sheet) return;
    if (sheet.hidden) { lastFocus = doc.activeElement; sheet.hidden = false; doc.body.style.overflow = "hidden"; doc.body.classList.add("hs-sheet-open"); }
  }
  function closeSheet() {
    convo.stop(); abortTurn();
    if (!sheet) return;
    sheet.hidden = true; doc.body.style.overflow = ""; doc.body.classList.remove("hs-sheet-open");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function post(fn, body) {
    return fetch(FN + fn, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error((j && j.error) || "HTTP " + r.status); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  /* The turn in flight: one at a time; barge-in and close abort it. */
  var turn = { ac: null };
  function abortTurn() {
    if (turn.ac) { try { turn.ac.abort(); } catch (e) { /* ignore */ } turn.ac = null; }
    stopSpeech();
  }
  window.HS_ABORT_TURN = abortTurn;

  function readSSE(res, onEvent) {
    var reader = res.body.getReader(), dec = new TextDecoder(), buf = "";
    var pump = function () {
      return reader.read().then(function (r) {
        if (r.done) return;
        buf += dec.decode(r.value, { stream: true });
        var parts = buf.split("\n\n");
        buf = parts.pop();
        parts.forEach(function (ev) {
          var line = ev.split("\n").filter(function (l) { return l.indexOf("data:") === 0; }).map(function (l) { return l.slice(5).trim(); }).join("");
          if (!line) return;
          try { onEvent(JSON.parse(line)); } catch (e) { /* skip */ }
        });
        return pump();
      });
    };
    return pump();
  }

  function sendText(text, viaVoice) {
    text = String(text || "").trim();
    if (!text) return Promise.resolve();
    if (chat.busy) abortTurn();
    showErr("");
    greetIfNeeded(false);
    addMsg("user", text);
    chat.messages.push({ role: "user", content: text });
    chat.busy = true;
    typing(true);
    if (convo.active) convo.set("thinking"); else setStarState("thinking");
    if (!lat) lat = { t0: performance.now() };
    var ac = new AbortController();
    turn.ac = ac;
    var q = speechQueue({ owner: "chat" });
    var bubble = null, shown = "", final = null, streamErr = null;
    var split = sentenceSplitter(function (sen) {
      if (!q.chunks.length) { mark("firstSentence"); if (convo.active) convo.set("speaking"); }
      q.push(sen);
    });
    return fetch(FN + "hs-chat", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, signal: ac.signal,
      body: JSON.stringify({ messages: chat.messages, lang: lang, caseDraft: chat.draft, voice: !!viaVoice || convo.active, policy: chat.policy || null })
    }).then(function (res) {
      var ct = res.headers.get("content-type") || "";
      if (!res.ok || ct.indexOf("text/event-stream") < 0) {
        return res.json().catch(function () { return {}; }).then(function (j) {
          if (!res.ok) throw new Error((j && j.error) || "HTTP " + res.status);
          final = j; // a buffered JSON answer still works
        });
      }
      return readSSE(res, function (ev) {
        if (ev.t) {
          mark("firstToken");
          if (!bubble) { typing(false); bubble = addMsg("assistant", ""); }
          shown += ev.t; bubble.textContent = shown; scrollDown();
          split.feed(ev.t);
        } else if (ev.done) final = ev;
        else if (ev.error) streamErr = new Error(ev.error);
      });
    }).then(function () {
      mark("streamEnd");
      if (streamErr && !shown) throw streamErr;
      typing(false); chat.busy = false; turn.ac = null;
      var reply = String((final && final.reply) || shown || "");
      if (!bubble) bubble = addMsg("assistant", reply); else bubble.textContent = reply;
      if (!shown) chunkText(reply).forEach(function (c) { split.feed(c + " "); });
      split.flush(); q.end();
      chat.messages.push({ role: "assistant", content: reply });
      if (final && final.caseDraft) chat.draft = mergeDraft(chat.draft, final.caseDraft);
      if (final && final.ready && !chat.caseId) showCaseCard("case");
      else if (chat.cardMode === "case" && !chat.edited) showCaseCard("case");
      return q.done;
    }).then(function (r) {
      if (lat) { lat.done = performance.now(); window.HS_LAT.push(lat); lat = null; }
      if (r && r.error) showErr(t("err.voice", { e: r.error.message }));
      if (r && r.cancelled) return r;
      if (convo.active) convo.listen(); else setStarState("idle");
      return r;
    }).catch(function (e) {
      typing(false); chat.busy = false; lat = null;
      if (turn.ac === ac) turn.ac = null;
      if (e && e.name === "AbortError") {
        if (shown) chat.messages.push({ role: "assistant", content: shown });
        return { cancelled: true };
      }
      q.end();
      showErr(t("err.chat", { e: e.message }));
      if (convo.active) convo.listen(); else setStarState("idle");
    });
  }
  function greetIfNeeded(speakIt) {
    if (!greet()) return Promise.resolve({ ok: true });
    return speakIt ? sayReply(introText(), true) : Promise.resolve({ ok: true });
  }
  /* Aria's reply in her voice; in a voice conversation, the mic reopens after. */
  function sayReply(text, isGreeting) {
    if (convo.active) convo.set("speaking");
    return speak(text, { owner: "chat" }).then(function (r) {
      if (r && r.error) showErr(t("err.voice", { e: r.error.message }));
      if (r && r.cancelled) return r;
      if (convo.active) convo.listen(); else setStarState("idle");
      return r;
    });
  }
  function mergeDraft(prev, next) {
    var d = {};
    var k, src = prev || {};
    for (k in src) d[k] = src[k];
    for (k in next) if (next[k] !== null && next[k] !== undefined) d[k] = next[k];
    return d;
  }

  /* ================================================================
     VOICE CONVERSATION: tap Aria -> mic on. Simple voice-activity
     endpointing (about 900 ms of silence ends a turn), tap to end a turn
     early, barge-in stops her when the homeowner starts talking.
     ================================================================ */
  var convo = (function () {
    var c = { active: false, state: "off", stream: null, ctx: null, an: null, buf: null, timer: 0, rec: null, chunks: [], mime: "", startedAt: 0, lastVoice: 0, heard: false, loud: 0, peak: 0, openedAt: 0, warned: false, calib: [], idleRounds: 0 };
    var SILENCE_MS = 900, MAX_UTTER_MS = 30000, NO_SPEECH_MS = 15000, BARGE_MS = 260;
    c.uiState = function () { return c.state === "speaking" ? "speaking" : c.state === "thinking" ? "thinking" : c.state === "listening" ? "listening" : "idle"; };
    c.set = function (s) {
      c.state = s;
      if (s === "listening") setStarState("listening", c.heard ? "state.hearing" : "state.listening");
      else if (s === "thinking") setStarState("thinking");
      else if (s === "speaking") setStarState("speaking");
      else if (s === "starting") setStarState("thinking", "state.starting");
      else setStarState("idle");
      var mic = doc.getElementById("hsMic");
      if (mic) { mic.setAttribute("aria-pressed", c.active ? "true" : "false"); var a = t(c.active ? "chat.micStop" : "chat.mic"); mic.setAttribute("aria-label", a); mic.setAttribute("title", a); mic.setAttribute("data-i18n-aria", c.active ? "chat.micStop" : "chat.mic"); }
    };
    function level() {
      if (!c.an) return 0;
      c.an.getFloatTimeDomainData(c.buf);
      var sum = 0;
      for (var i = 0; i < c.buf.length; i++) sum += c.buf[i] * c.buf[i];
      return Math.sqrt(sum / c.buf.length);
    }
    function pickMime() {
      var opts = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
      for (var i = 0; i < opts.length; i++) if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(opts[i])) return opts[i];
      return "";
    }
    /* Noise floor: a low percentile of the last ~3 s, skipping the first
       second after the mic opens. Someone already talking cannot raise the
       threshold above a normal voice: it is capped. */
    function tick() {
      if (!c.active) return;
      var now = Date.now(), lv = level();
      if (now - c.openedAt > 1000) { c.calib.push(lv); if (c.calib.length > 60) c.calib.shift(); }
      var th = vadThresholds(c.calib), thr = th.speech, barge = th.barge;
      if (c.state === "listening") {
        if (lv > c.peak) c.peak = lv;
        if (!c.warned && !c.heard && now - c.startedAt > 4000 && c.peak < 0.0015) { c.warned = true; micProblem(); }
        if (lv > thr) { if (!c.heard) { c.heard = true; c.set("listening"); } c.lastVoice = now; }
        if (c.heard && now - c.lastVoice > SILENCE_MS) return c.finish();
        if (c.heard && now - c.startedAt > MAX_UTTER_MS) return c.finish();
        if (!c.heard && now - c.startedAt > NO_SPEECH_MS) {
          c.idleRounds++;
          if (c.idleRounds >= 3) { c.stop(); showErr(t("info.autoStop")); return; }
          c.restartRec();
        }
      } else if (c.state === "speaking") {
        if (lv > barge) { c.loud += 50; if (c.loud >= BARGE_MS) { c.loud = 0; abortTurn(); c.listen(true); } } else c.loud = 0;
      }
    }
    c.restartRec = function () {
      if (c.rec && c.rec.state !== "inactive") { c.rec.ondataavailable = null; c.rec.onstop = null; try { c.rec.stop(); } catch (e) { /* ignore */ } }
      c.startRec();
    };
    c.startRec = function () {
      c.chunks = []; c.startedAt = Date.now(); c.heard = false; c.peak = 0;
      try { c.rec = c.mime ? new MediaRecorder(c.stream, { mimeType: c.mime }) : new MediaRecorder(c.stream); } catch (e) { c.rec = new MediaRecorder(c.stream); }
      c.rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) c.chunks.push(ev.data); };
      c.rec.onerror = function (ev) {
        var e = ev && (ev.error || ev);
        showErr(t("err.mic", { e: (e && (e.message || e.name)) || "recorder error" }));
        if (c.active && c.state === "listening") setTimeout(function () { if (c.active) c.restartRec(); }, 300);
      };
      c.rec.start(250);
    };
    c.resume = function () { if (c.ctx && c.ctx.state === "suspended" && c.ctx.resume) { try { c.ctx.resume(); } catch (e) { /* ignore */ } } };
    c.listen = function (barged) {
      if (!c.active) return;
      c.resume();
      sayMicPending();
      c.set("listening");
      c.startRec();
      if (barged) { c.heard = true; c.lastVoice = Date.now(); c.set("listening"); }
    };
    c.finish = function () {
      if (!c.rec || c.state !== "listening") return;
      c.set("thinking");
      c.idleRounds = 0;
      lat = { t0: performance.now() - Math.max(0, Date.now() - c.lastVoice), voice: true };
      var rec = c.rec;
      rec.onstop = function () {
        var type = (c.mime || rec.mimeType || "audio/webm").split(";")[0];
        var blob = new Blob(c.chunks, { type: type });
        c.chunks = [];
        if (blob.size < 1200) return c.listen();
        blobToB64(blob).then(function (b64) {
          mark("sttSent");
          return post("hs-stt", { audio: b64, mime: type, lang: lang });
        }).then(function (j) {
          mark("sttDone");
          if (!c.active) return;
          var text = String((j && j.text) || "").trim();
          if (!text) return c.listen();
          return sendText(text, true);
        }).catch(function (e) {
          showErr(t("err.stt", { e: e.message }));
          c.listen();
        });
      };
      try { rec.stop(); } catch (e) { c.listen(); }
    };
    c.start = function () {
      if (c.active) return Promise.resolve();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        showErr(t("err.mic", { e: "not supported on this browser" }));
        return Promise.resolve();
      }
      c.active = true; c.idleRounds = 0; c.warned = false;
      c.set("starting");
      /* The AudioContext is made and resumed HERE, inside the tap: created
         after the permission prompt it starts suspended on desktop and the
         analyser reads zeros forever. */
      var AC = window.AudioContext || window.webkitAudioContext;
      try { c.ctx = new AC(); } catch (e) { c.ctx = null; }
      c.resume();
      return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(function (stream) {
        if (!c.active) { stream.getTracks().forEach(function (tr) { tr.stop(); }); return; }
        c.stream = stream;
        if (!c.ctx) c.ctx = new AC();
        c.resume();
        var track = stream.getAudioTracks()[0];
        if (track) {
          if (track.muted) micProblem();
          track.onmute = function () { if (c.active) micProblem(); };
          track.onended = function () { if (c.active) { showErr(t("err.mic", { e: "the microphone was disconnected" })); c.stop(); } };
        }
        c.openedAt = Date.now();
        var src = c.ctx.createMediaStreamSource(stream);
        c.an = c.ctx.createAnalyser(); c.an.fftSize = 1024;
        c.buf = new Float32Array(c.an.fftSize);
        src.connect(c.an);
        c.mime = pickMime();
        c.calib = [];
        c.timer = setInterval(tick, 50);
      }).catch(function (e) {
        c.active = false; c.set("off");
        showErr(t("err.mic", { e: (e && (e.message || e.name)) || "blocked" }));
        throw e;
      });
    };
    c.stop = function () {
      if (!c.active && !c.stream) return;
      c.active = false;
      clearInterval(c.timer);
      if (c.rec && c.rec.state !== "inactive") { c.rec.onstop = null; try { c.rec.stop(); } catch (e) { /* ignore */ } }
      if (c.stream) c.stream.getTracks().forEach(function (tr) { tr.stop(); });
      if (c.ctx) { try { c.ctx.close(); } catch (e) { /* ignore */ } }
      c.stream = null; c.ctx = null; c.an = null; c.rec = null;
      if (c.state === "speaking") stopSpeech();
      c.set("off");
    };
    return c;
  })();
  window.HS_CONVO = convo;

  /** Speech and barge-in thresholds from recent mic levels: the 10th
   * percentile is the room, and the speech threshold is capped so a voice
   * always clears it. */
  function vadThresholds(levels) {
    var floor = 0.006;
    if (levels && levels.length >= 6) { var srt = levels.slice().sort(function (a, b) { return a - b; }); floor = Math.max(0.002, srt[Math.floor(srt.length * 0.1)]); }
    return { floor: floor, speech: Math.min(Math.max(0.018, floor * 3), 0.04), barge: Math.min(Math.max(0.05, floor * 6), 0.09) };
  }
  window.HS_VAD = vadThresholds;

  /* The mic gives us nothing: say so, on screen and in her voice. */
  var micWarnedAt = 0;
  function micProblem() {
    if (Date.now() - micWarnedAt < 10000) return;
    micWarnedAt = Date.now();
    showErr(t("err.micSilent"));
    if (!speech.active) speak(t("err.micSilent"), { owner: "chat" });
    else micPending = true; // said as soon as her current line ends
  }
  var micPending = false;
  function sayMicPending() { if (micPending && !speech.active) { micPending = false; speak(t("err.micSilent"), { owner: "chat" }); } }

  function blobToB64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(",")[1] || ""); };
      r.onerror = function () { rej(r.error); };
      r.readAsDataURL(blob);
    });
  }

  /* Tap Aria: start the spoken conversation; tap again to interrupt her or
     to end your turn early. */
  function onStarTap() {
    openSheet();
    if (convo.active) {
      if (convo.state === "speaking") { stopSpeech(); convo.listen(); return; }
      if (convo.state === "listening" && convo.heard) { convo.finish(); return; }
      return;
    }
    stopSpeech();
    loadFrame("talk1"); loadFrame("talk2");
    var micReady = convo.start();
    var greeting = greetIfNeeded(false).then(function () {
      if (chat.messages.length === 1) { convo.set("speaking"); return speak(introText(), { owner: "chat" }); }
      return { ok: true };
    });
    Promise.all([micReady.catch(function () { return null; }), greeting]).then(function (r) {
      var g = r[1];
      if (g && g.error) showErr(t("err.voice", { e: g.error.message }));
      if (g && g.cancelled) return;
      if (convo.active && convo.stream) convo.listen();
    });
  }

  /* ================================================================
     "YOUR CASE": editable summary + contact + REQUIRED consent.
     ================================================================ */
  var ISSUES = ["denied_claim", "underpaid_claim", "roof", "leak_water", "policy_review", "inspection", "other"];
  var TRADES = ["public_adjuster", "attorney", "roofer", "insurance_agent", "inspector"];
  var URG = ["emergency", "soon", "planning"];
  var cardEl = null;

  /* Mirror of the server's scrub (_hs-prompt.js scrubPII): the summary is
     what an unapproved pro reads, so what the homeowner types there is
     cleaned before it leaves the page. */
  function scrubPII(s, insurer) {
    var x = String(s || "");
    x = x.replace(/https?:\/\/\S+|www\.\S+/gi, "[link]");
    x = x.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
    x = x.replace(/\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){0,4}(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd|way|terrace|ter|place|pl|circle|cir|parkway|pkwy|highway|hwy|trail|trl|calle|avenida|camino)\b\.?/gi, "[address]");
    x = x.replace(/(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[phone]");
    x = x.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[id]");
    x = x.replace(/\b(policy|claim|account|p[oó]liza|reclamo|n[uú]mero|number)\s*(?:number|no\.?|#|n[uú]mero|de)?\s*[:#]?\s*[A-Z0-9-]*\d[A-Z0-9-]{3,}/gi, "$1 [number]");
    x = x.replace(/\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]{7,}\b/gi, "[number]");
    x = x.replace(/\b\d{7,}\b/g, "[number]");
    x = x.replace(/\b(my name is|i'm called|me llamo|mi nombre es)\s+[^\s,.;]+(\s+[A-Z][^\s,.;]*)?/gi, "$1 [name]");
    if (insurer && String(insurer).trim().length >= 3) x = x.split(new RegExp(String(insurer).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")).join("the insurer");
    return x.replace(/\s{2,}/g, " ").trim();
  }
  window.HS_SCRUB = scrubPII;

  function h(tag, attrs, kids) {
    var e = doc.createElement(tag);
    if (attrs) for (var k in attrs) { if (k === "text") e.textContent = attrs[k]; else if (k === "html") e.innerHTML = attrs[k]; else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? "" : attrs[k]); }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? doc.createTextNode(c) : c); });
    return e;
  }
  function field(labelKey, control, hintKey) {
    return h("label", { class: "hs-field" }, [h("span", { text: t(labelKey) }), control, hintKey ? h("span", { class: "hs-hint", text: t(hintKey) }) : null]);
  }
  function readCard() {
    if (!cardEl) return null;
    var f = cardEl.querySelector("form");
    var trades = [];
    var tb = f.querySelectorAll("input[name=trade]:checked");
    for (var i = 0; i < tb.length; i++) trades.push(tb[i].value);
    var pref = f.querySelector("input[name=pref]:checked");
    return {
      issue: f.issue.value, trades: trades, zip: f.zip.value.replace(/\D/g, "").slice(0, 5), urgency: f.urgency.value, summary: f.summary.value,
      name: f.cname.value, phone: f.phone.value, email: f.email.value, pref: pref ? pref.value : "phone", consent: f.consent.checked
    };
  }

  function showCaseCard(mode) {
    chat.cardMode = mode;
    var d = chat.draft || {};
    if (mode === "file") d = mergeDraft({ issue: "policy_review", urgency: "planning", trades: ["insurance_agent"], summary: t("policy.summary") }, d.issue ? d : {});
    var keep = readCard();
    var old = cardEl;
    var v = keep || { issue: d.issue || "other", trades: d.trades || [], zip: d.zip || "", urgency: d.urgency || "soon", summary: d.summary || "", name: "", phone: "", email: "", pref: "phone", consent: false };
    if (keep && !chat.edited) { v.issue = d.issue || v.issue; v.trades = d.trades || v.trades; v.zip = d.zip || v.zip; v.urgency = d.urgency || v.urgency; v.summary = d.summary || v.summary; }

    var issueSel = h("select", { name: "issue" }, ISSUES.map(function (k) { return h("option", { value: k, selected: k === v.issue, text: t("issue." + k) }); }));
    var urgSel = h("select", { name: "urgency" }, URG.map(function (k) { return h("option", { value: k, selected: k === v.urgency, text: t("urg." + k) }); }));
    var tradeBox = h("fieldset", { class: "hs-field" }, [h("legend", { text: t("case.trades") }), h("div", { class: "hs-opts" }, TRADES.map(function (k) {
      return h("label", { class: "hs-opt" }, [h("input", { type: "checkbox", name: "trade", value: k, checked: v.trades.indexOf(k) >= 0 }), h("span", { text: t("trade." + k) })]);
    }))]);
    var prefBox = h("fieldset", { class: "hs-field" }, [h("legend", { text: t("case.pref") }), h("div", { class: "hs-opts" }, ["phone", "text", "email"].map(function (k) {
      return h("label", { class: "hs-opt" }, [h("input", { type: "radio", name: "pref", value: k, checked: v.pref === k }), h("span", { text: t("pref." + k) })]);
    }))]);
    var consent = h("input", { type: "checkbox", name: "consent", id: "hsConsent", checked: v.consent });
    var sendBtn = h("button", { class: "hs-btn hs-btn-gold", type: "submit", id: "hsSendCase", disabled: !v.consent, text: t(mode === "file" ? "case.sendFile" : "case.send") });
    var msg = h("p", { class: "hs-form-msg", role: "status" });
    var form = h("form", { novalidate: true }, [
      field("case.issue", issueSel),
      tradeBox,
      h("div", { class: "hs-row2" }, [
        field("case.zip", h("input", { name: "zip", inputmode: "numeric", autocomplete: "postal-code", maxlength: "5", value: v.zip })),
        field("case.urgency", urgSel)
      ]),
      field("case.summary", h("textarea", { name: "summary", maxlength: "600" }, [v.summary]), "case.summaryHint"),
      h("h4", { text: t("case.contact") }),
      field("case.name", h("input", { name: "cname", autocomplete: "name", value: v.name })),
      h("div", { class: "hs-row2" }, [
        field("case.phone", h("input", { name: "phone", type: "tel", autocomplete: "tel", inputmode: "tel", value: v.phone })),
        field("case.email", h("input", { name: "email", type: "email", autocomplete: "email", value: v.email }))
      ]),
      prefBox,
      h("label", { class: "hs-consent", for: "hsConsent" }, [consent, h("span", { text: t("case.consent") })]),
      sendBtn,
      msg
    ]);
    form.querySelector("textarea").value = v.summary;
    form.addEventListener("input", function (e) { if (e.target !== consent) chat.edited = true; });
    consent.addEventListener("change", function () { sendBtn.disabled = !consent.checked; msg.textContent = ""; });
    form.addEventListener("submit", function (e) { e.preventDefault(); submitCase(form, sendBtn, msg, mode); });

    cardEl = h("section", { class: "hs-card", id: "hsCaseCard", "aria-labelledby": "hsCaseTitle" }, [
      mode === "file" ? h("p", { class: "hs-card-sub", text: t("policy.fileTitle") }) : null,
      h("h3", { id: "hsCaseTitle", text: t(mode === "file" ? "case.fileTitle" : "case.title") }),
      h("p", { class: "hs-card-sub", text: t(mode === "file" ? "case.fileSub" : "case.sub") }),
      form
    ]);
    if (old && old.parentNode) old.parentNode.replaceChild(cardEl, old);
    else { msgs.appendChild(cardEl); scrollDown(); }
  }

  function submitCase(form, btn, msg, mode) {
    var v = readCard();
    if (!v.consent) { msg.textContent = t("case.needConsent"); return; }
    var phoneOk = v.phone.replace(/\D/g, "").length >= 10;
    var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim());
    if (!v.name.trim() || !(phoneOk || emailOk)) { msg.textContent = t("case.needContact"); return; }
    if (!/^\d{5}$/.test(v.zip)) { msg.textContent = t("case.needZip"); return; }
    var d = chat.draft || {};
    var insurer = d.insurer || null;
    var caseDraft = {
      issue: v.issue, trades: v.trades, zip: v.zip, state: d.state || null, urgency: v.urgency,
      summary: scrubPII(v.summary, insurer), insurer: insurer, claimStatus: d.claimStatus || null
    };
    var contact = { name: v.name.trim(), phone: phoneOk ? v.phone.trim() : "", email: emailOk ? v.email.trim() : "", preferred: v.pref };
    btn.disabled = true; btn.textContent = t("case.sending"); msg.textContent = "";
    post("hs-case-create", { caseDraft: caseDraft, contact: contact, consent: true, consentText: t("case.consent"), lang: lang })
      .then(function (j) {
        if (!j.caseId || !j.token) throw new Error("no case id");
        chat.caseId = j.caseId; chat.token = j.token; chat.draft = mergeDraft(chat.draft, caseDraft);
        chat.link = location.origin + (j.statusUrl && j.statusUrl.charAt(0) === "/" ? j.statusUrl : "/home-shield/caso.html?c=" + encodeURIComponent(j.caseId) + "&t=" + encodeURIComponent(j.token));
        store("hs_case", chat.link);
        showMyCase();
        renderSent();
        if (chat.pendingFile) { var f = chat.pendingFile; chat.pendingFile = null; uploadPolicy(f); }
      })
      .catch(function (e) {
        btn.disabled = false; btn.textContent = t(mode === "file" ? "case.sendFile" : "case.send");
        msg.textContent = t("err.chat", { e: e.message });
      });
  }

  function renderSent() {
    var a = h("a", { class: "hs-btn hs-btn-gold", href: chat.link, text: t("case.open") });
    var copy = h("button", { class: "hs-btn hs-btn-line", type: "button", text: t("case.copy") });
    copy.addEventListener("click", function () {
      try { navigator.clipboard.writeText(chat.link).then(function () { copy.textContent = t("case.copied"); }); } catch (e) { /* no clipboard */ }
    });
    var done = h("section", { class: "hs-card hs-done", id: "hsCaseDone" }, [
      h("h3", { text: t("case.sentTitle") }),
      h("p", { class: "hs-card-sub", text: t("case.sentBody") }),
      h("code", { class: "hs-link", id: "hsCaseLink", text: chat.link }),
      h("p", { class: "hs-save", text: t("case.save") }),
      a, copy
    ]);
    if (cardEl && cardEl.parentNode) cardEl.parentNode.replaceChild(done, cardEl);
    else msgs.appendChild(done);
    cardEl = null; chat.cardMode = "sent";
    scrollDown();
  }

  function showMyCase() {
    var l = chat.link || store("hs_case");
    var a = doc.getElementById("hsMyCase");
    if (a && l) { a.href = l; a.hidden = false; }
  }

  /* ================================================================
     POLICY UPLOAD -> hs-doc-upload -> hs-policy-review
     ================================================================ */
  var fileInput = doc.getElementById("hsFile");
  var OK_TYPES = /^(application\/pdf|image\/(jpeg|png|heic|heif))$/;
  function onUploadClick() {
    openSheet();
    greetIfNeeded(false);
    if (fileInput) { fileInput.value = ""; fileInput.click(); }
  }
  function onFilePicked() {
    var f = fileInput.files && fileInput.files[0];
    if (!f) return;
    showErr("");
    var typeOk = OK_TYPES.test(f.type) || /\.(pdf|jpe?g|png|heic|heif)$/i.test(f.name);
    if (!typeOk) { addMsg("assistant", t("policy.type")); return; }
    if (f.size > 10 * 1024 * 1024) { addMsg("assistant", t("policy.size")); return; }
    if (chat.caseId) uploadPolicy(f);
    else { chat.pendingFile = f; showCaseCard("file"); }
  }
  /* Base64 JSON; files over 4 MB go in ~3 MB chunks (Netlify's 6 MB cap). */
  var CHUNK = 3 * 1024 * 1024;
  function sendFile(f) {
    var base = { caseId: chat.caseId, token: chat.token, kind: "policy" };
    var type = f.type || (/\.pdf$/i.test(f.name) ? "application/pdf" : "");
    if (f.size <= 4 * 1024 * 1024) {
      return blobToB64(f).then(function (b64) { return post("hs-doc-upload", Object.assign({}, base, { file: { name: f.name, type: type, size: f.size, data: b64 } })); });
    }
    var total = Math.ceil(f.size / CHUNK), uploadId = null;
    var step = function (i) {
      return blobToB64(f.slice(i * CHUNK, Math.min(f.size, (i + 1) * CHUNK))).then(function (b64) {
        var chunk = { index: i, total: total };
        if (uploadId) chunk.uploadId = uploadId;
        return post("hs-doc-upload", Object.assign({}, base, { file: { name: f.name, type: type, size: f.size, data: b64, chunk: chunk } }));
      }).then(function (j) {
        if (j.docId) return j;
        uploadId = j.uploadId || uploadId;
        return step(i + 1);
      });
    };
    return step(0);
  }
  function list(titleKey, items) {
    if (!items || !items.length) return null;
    return h("div", { class: "hs-review-group" }, [h("p", { class: "hs-review-h", text: t(titleKey) }),
      h("ul", { class: "hs-flags" }, items.map(function (x) { return h("li", { text: typeof x === "string" ? x : (x && (x.label || x.text)) || "" }); }))]);
  }
  /*COMPARE:START*/
  /* "How it compares": built only from the policy's own terms (the review's
     findings) against what is common in Florida, hedged. No premiums, no
     carrier names, nothing invented. */
  function compareFindings(findings, L) {
    var es = L === "es", out = [], by = {};
    (findings || []).forEach(function (f) { if (f && f.key) by[f.key] = f; });
    var num = function (f, re) { var m = re.exec(String((f && f.label) || "")); return m ? m[1] : null; };
    var hd = by.hurricane_deductible, pct = num(hd, /(\d{1,2}(?:\.\d+)?)\s*%/);
    if (pct) {
      var n = parseFloat(pct);
      out.push(es
        ? "Deducible por huracán: muchas pólizas en Florida tienen 2%, y también se ofrecen 5% o 10% para bajar la prima. El tuyo es " + pct + "%" + (n > 2 ? ", más alto que el 2% común: pagarías más de tu bolsillo después de una tormenta." : ", en el nivel común o por debajo.")
        : "Hurricane deductible: many Florida policies carry 2%, and 5% or 10% options exist to lower the premium. Yours is " + pct + "%" + (n > 2 ? ", higher than the common 2%, so you would pay more out of pocket after a storm." : ", at or below the common level."));
    }
    if (by.roof_acv) out.push(es
      ? "Techo: el tuyo se paga a valor real en efectivo (con depreciación). Muchas pólizas pagan costo de reemplazo, aunque para techos más viejos muchas aseguradoras en Florida solo ofrecen valor real. Pregunta si hay costo de reemplazo disponible para tu techo."
      : "Roof: yours pays actual cash value (depreciated). Many policies pay replacement cost, though for older roofs many Florida insurers offer only actual cash value. Ask whether replacement cost is available for your roof.");
    else if (by.rcv) out.push(es
      ? "Techo: el tuyo menciona costo de reemplazo, lo que está del lado fuerte frente a pólizas que pagan techos solo a valor real."
      : "Roof: yours mentions replacement cost, which is on the strong side compared with policies that pay roofs at actual cash value only.");
    var ws = num(by.water_sublimit, /(\$\s?[\d,]{3,})/);
    if (ws) out.push(es
      ? "Agua: tu póliza limita ciertos daños por agua a " + ws + ". Algunas pólizas tienen límites así y otras no; compara ese límite cuando pidas cotizaciones."
      : "Water: your policy caps some water damage at " + ws + ". Some policies have limits like this and others do not; compare that limit when you get quotes.");
    var ol = by.ordinance_law, olp = num(ol, /(\d{1,3})\s*%/);
    out.push(ol
      ? (es ? "Ordenanza o ley: incluida" + (olp ? " al " + olp + "%" : "") + ". Las opciones comunes son 25% o 50% de la cobertura de vivienda." : "Ordinance or law: included" + (olp ? " at " + olp + "%" : "") + ". Common options are 25% or 50% of the dwelling coverage.")
      : (es ? "Ordenanza o ley: no la encontré. Suele ofrecerse al 25% o 50%; paga lo que exige el código de construcción al reparar." : "Ordinance or law: I did not find it. It is commonly offered at 25% or 50%, and it pays for what building code requires when you repair."));
    out.push(by.loss_of_use
      ? (es ? "Pérdida de uso: incluida, para vivienda temporal si no puedes quedarte en casa." : "Loss of use: included, for temporary housing if you cannot stay home.")
      : (es ? "Pérdida de uso: no la encontré. La mayoría de las pólizas de vivienda la incluyen; confírmalo." : "Loss of use: I did not find it. Most homeowners policies include it; confirm it."));
    if (by.matching) out.push(by.matching.tone === "weak"
      ? (es ? "Igualación: tu póliza la limita. Si solo se daña parte del techo o del piso, eso decide si reemplazan lo no dañado para que combine." : "Matching: your policy limits it. When only part of a roof or floor is damaged, matching decides whether undamaged parts are replaced so they match.")
      : (es ? "Igualación: tu póliza la menciona; revisa las condiciones con un profesional." : "Matching: your policy mentions it; review the conditions with a professional."));
    out.push(es
      ? "Esto compara los términos de tu póliza, no precios. Un agente local con licencia en Aria Home Shield puede cotizarte una cobertura comparable para que veas ofertas reales."
      : "This compares your policy's terms, not prices. A licensed local agent on Aria Home Shield can quote comparable coverage so you can see real offers.");
    return out;
  }
  /*COMPARE:END*/
  window.HS_COMPARE = compareFindings;
  /* Aria speaks all four sections. */
  function spokenReview(plain, strong, weak, improve, compare) {
    var parts = [];
    var sec = function (k, items) { if (items.length) parts.push(t(k) + ": " + items.map(function (x) { return String(x).replace(/[.;\s]+$/, ""); }).join(". ") + "."); };
    sec("policy.strong", strong); sec("policy.weak", weak); sec("policy.improve", improve); sec("policy.compare", compare);
    return parts.length ? parts.join(" ") : plain;
  }
  function uploadPolicy(f) {
    var status = addMsg("assistant", t("policy.uploading"));
    setStarState("thinking");
    sendFile(f).then(function (j) {
      status.textContent = t("policy.reviewing");
      return post("hs-policy-review", { caseId: chat.caseId, token: chat.token, docId: j.docId, lang: lang });
    }).then(function (r) {
      status.remove();
      var strong = r.strong || [], weak = r.weak || [], improve = r.improve || [];
      var flags = Array.isArray(r.flags) ? r.flags : [];
      var compare = r.textFound ? compareFindings(r.findings, lang) : [];
      chat.policy = { textFound: !!r.textFound, strong: strong, weak: weak, improve: improve, compare: compare, flags: flags, excerpt: String(r.excerpt || "").slice(0, 6000) };
      var box = h("div", { class: "hs-review" }, [
        list("policy.strong", strong), list("policy.weak", weak), list("policy.improve", improve), list("policy.compare", compare),
        !strong.length && !weak.length && !improve.length ? list("policy.found", flags) : null
      ]);
      if (r.textFound !== false) {
        var better = h("button", { class: "hs-btn hs-btn-gold", type: "button", text: t("policy.better") });
        better.addEventListener("click", function () { findBetterPolicy(better); });
        box.appendChild(better);
      }
      var plain = String(r.plainSummary || "");
      addMsg("assistant", plain, box);
      var lines = [plain];
      if (strong.length) lines.push(t("policy.strong") + ": " + strong.join("; "));
      if (weak.length) lines.push(t("policy.weak") + ": " + weak.join("; "));
      if (improve.length) lines.push(t("policy.improve") + ": " + improve.join("; "));
      if (compare.length) lines.push(t("policy.compare") + ": " + compare.join(" "));
      chat.messages.push({ role: "assistant", content: lines.join("\n") });
      setStarState("idle");
      return sayReply(spokenReview(plain, strong, weak, improve, compare));
    }).catch(function (e) {
      status.textContent = t("policy.err", { e: e.message });
      setStarState("idle");
    });
  }
  function findBetterPolicy(btn) {
    btn.disabled = true;
    var d = chat.draft = mergeDraft(chat.draft, {});
    var had = (d.trades || []).indexOf("insurance_agent") >= 0;
    d.trades = (d.trades || []).slice();
    if (!had) d.trades.push("insurance_agent");
    if (!d.issue) d.issue = "policy_review";
    if (chat.caseId && had) { addMsg("assistant", t("policy.betterDone")); sayReply(t("policy.betterDone")); }
    else { addMsg("assistant", t("policy.betterLater")); sayReply(t("policy.betterLater")); chat.edited = false; showCaseCard("case"); }
  }

  /* ================================================================
     caso.html: the homeowner's private case page.
     ================================================================ */
  function prettyPhone(p) {
    var d = String(p || "").replace(/\D/g, "");
    if (d.length === 11 && d.charAt(0) === "1") d = d.slice(1);
    return d.length === 10 ? "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6) : String(p);
  }
  function initCaso() {
    var q = new URLSearchParams(location.search);
    var c = q.get("c"), tok = q.get("t");
    var box = doc.getElementById("casoBody");
    var poll = 0, data = null, deleted = false, busy = false, threads = {}, drafts = {};
    if (c && tok) store("hs_case", location.href.split("#")[0]);
    function getJ(url) {
      return fetch(url, { headers: { Accept: "application/json" } }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || "HTTP " + r.status); e.status = r.status; e.code = j.code; throw e; } return j; });
      });
    }
    function get() {
      if (!c || !tok) return Promise.reject(Object.assign(new Error("bad link"), { status: 404 }));
      return getJ(FN + "hs-case-status?c=" + encodeURIComponent(c) + "&t=" + encodeURIComponent(tok));
    }
    function norm(j) {
      var cs = j.case || {};
      var offers = (j.offers || []).map(function (o) {
        var p = o.pro || {};
        return { id: o.id, proId: p.id || o.proId || "", status: o.status || "pending", message: o.message || "",
          name: p.name || "", company: p.company || "", trades: p.trades || [], licenseType: p.licenseType || "",
          licenseNumber: p.licenseNumber || "", licenseState: p.licenseState || "", verified: !!p.verified,
          phone: p.phone || "", email: p.email || "" };
      });
      var conn = null;
      if (cs.status === "connected") conn = offers.filter(function (o) { return o.status === "accepted"; })[0] || null;
      return { status: cs.status || "open", summary: cs.summary || "", issue: cs.issue, trades: cs.trades || [],
        area: (cs.area && (cs.area.label || cs.area.zip3)) || cs.zip || "", offers: offers, conn: conn };
    }
    function loadThread(o) {
      if (!o.proId) return Promise.resolve();
      return getJ(FN + "hs-case-messages?c=" + encodeURIComponent(c) + "&t=" + encodeURIComponent(tok) + "&p=" + encodeURIComponent(o.proId))
        .then(function (j) { threads[o.proId] = j.messages || []; }).catch(function () { /* keep what we had */ });
    }
    function threadEl(o) {
      var msgsList = threads[o.proId] || [];
      var list = h("div", { class: "hs-thread-msgs" }, msgsList.length ? msgsList.map(function (m) {
        return h("p", { class: "hs-tmsg " + (m.from === "homeowner" ? "is-me" : "is-pro"), text: m.text });
      }) : [h("p", { class: "hs-meta", text: t("caso.threadEmpty") })]);
      var inp = h("input", { type: "text", maxlength: "2000", "data-thread-input": o.proId, placeholder: t("caso.threadPh"), "aria-label": t("caso.threadPh") });
      inp.value = drafts[o.proId] || "";
      inp.addEventListener("input", function () { drafts[o.proId] = inp.value; });
      var form = h("form", { class: "hs-thread-form", "data-thread": o.proId }, [inp, h("button", { class: "hs-btn hs-btn-line", type: "submit", text: t("chat.send") })]);
      return h("div", { class: "hs-thread" }, [h("p", { class: "hs-review-h", text: t("caso.thread", { name: o.name || o.company }) }), list, form,
        o.status === "accepted_talk_first" ? h("p", { class: "hs-meta", text: t("caso.threadPrivate") }) : null]);
    }
    function render() {
      if (deleted) { box.innerHTML = ""; box.appendChild(h("div", { class: "hs-panel" }, [h("p", { class: "hs-ok", text: t("caso.deleted") }), h("a", { href: "/home-shield/", text: t("caso.back") })])); return; }
      if (!data) return;
      var d = data;
      var stepN = d.status === "connected" ? 4 : d.offers.length ? 3 : 2;
      var tl = h("ol", { class: "hs-timeline", id: "casoTimeline", "aria-label": t("caso.title") }, ["caso.s1", "caso.s2", "caso.s3", "caso.s4"].map(function (k, i) {
        var n = i + 1;
        return h("li", { class: n < stepN || (n === 4 && stepN === 4) ? "is-done" : n === stepN ? "is-now" : "", "aria-current": n === stepN ? "step" : null, text: t(k) });
      }));
      var parts = [tl];
      if (d.conn) {
        var cn = d.conn;
        parts.push(h("section", { class: "hs-panel hs-connected", id: "casoConnected" }, [
          h("h2", { class: "hs-h3", text: t("caso.connected") }),
          h("p", { text: t("caso.connectedBody", { name: cn.name || cn.company || "" }) }),
          h("p", { class: "hs-meta", text: [cn.name, cn.company].filter(Boolean).join(" · ") }),
          h("div", { class: "hs-contact" }, [
            cn.phone ? h("a", { href: "tel:" + String(cn.phone).replace(/[^\d+]/g, ""), text: prettyPhone(cn.phone) }) : null,
            cn.email ? h("a", { href: "mailto:" + cn.email, text: cn.email }) : null
          ])
        ]));
      }
      if (d.summary) parts.push(h("section", { class: "hs-panel" }, [h("h2", { class: "hs-h3", text: t("caso.summary") }), h("p", { text: d.summary }),
        h("p", { class: "hs-meta", text: [d.issue ? t("issue." + d.issue) : "", (d.trades || []).map(function (x) { return t("trade." + x); }).join(", "), d.area].filter(Boolean).join(" · ") })]));
      parts.push(h("h2", { class: "hs-h3", text: t("caso.offers") }));
      if (!d.offers.length) parts.push(h("p", { class: "hs-panel", text: t("caso.none") }));
      d.offers.forEach(function (o) {
        var lic = [o.licenseType ? t("lic." + o.licenseType) : "", o.licenseNumber, o.licenseState].filter(Boolean).join(" ");
        var btn = function (act, key, cls) { return h("button", { class: "hs-btn " + cls, type: "button", "data-offer": o.id, "data-act": act, disabled: busy, text: t(key) }); };
        var acts = null, open = d.status !== "connected";
        if (o.status === "pending" && open) {
          acts = h("div", { class: "hs-offer-actions" }, [btn("talk_first", "caso.talkFirst", "hs-btn-gold hs-wide"), btn("accept", "caso.share", "hs-btn-line"), btn("decline", "caso.decline", "hs-btn-line")]);
        } else if (o.status === "accepted_talk_first" && open) {
          acts = h("div", { class: "hs-offer-actions" }, [btn("share_contact", "caso.share", "hs-btn-gold"), btn("decline", "caso.decline", "hs-btn-line")]);
        }
        var note = o.status === "declined" ? t("caso.declined") : o.status === "accepted_talk_first" ? t("caso.talking") : o.status === "accepted" ? t("caso.sharedNote") : o.status === "pending" && open ? t("caso.talkFirstNote") : "";
        parts.push(h("article", { class: "hs-offer" + (o.status === "declined" ? " is-declined" : ""), "data-offer-id": o.id, "data-status": o.status }, [
          h("h3", { text: o.name || o.company }),
          h("p", { class: "hs-meta", text: [o.company, (o.trades || []).map(function (x) { return t("trade." + x); }).join(", ")].filter(Boolean).join(" · ") }),
          lic ? h("p", { class: "hs-meta hs-lic", text: t("caso.license") + ": " + lic + (o.verified ? " · " + t("caso.verified") : "") }) : null,
          o.message ? h("blockquote", { text: o.message }) : null,
          note ? h("p", { class: "hs-meta", text: note }) : null,
          acts,
          o.status === "accepted_talk_first" || o.status === "accepted" ? threadEl(o) : null
        ]));
      });
      parts.push(h("button", { class: "hs-del", type: "button", id: "casoDelete", text: t("caso.delete") }));
      var focusId = doc.activeElement && doc.activeElement.getAttribute && doc.activeElement.getAttribute("data-thread-input");
      box.innerHTML = "";
      parts.forEach(function (p) { box.appendChild(p); });
      if (focusId) { var fi = box.querySelector('[data-thread-input="' + focusId + '"]'); if (fi) fi.focus(); }
    }
    function err(e) {
      var p = h("p", { class: "hs-err", role: "alert", text: t("caso.err", { e: e.message }) });
      box.insertBefore(p, box.firstChild);
    }
    function refresh() {
      return get().then(function (j) {
        data = norm(j);
        var open = data.offers.filter(function (o) { return o.status === "accepted_talk_first" || o.status === "accepted"; });
        return Promise.all(open.map(loadThread));
      }).then(function () { render(); }).catch(function (e) {
        if (e.status === 404 || e.status === 403 || e.status === 401) { clearInterval(poll); box.innerHTML = ""; box.appendChild(h("div", { class: "hs-panel" }, [h("p", { text: t("caso.bad") }), h("a", { href: "/home-shield/", text: t("caso.back") })])); }
      });
    }
    box.addEventListener("submit", function (e) {
      var f = e.target.closest("form[data-thread]");
      if (!f) return;
      e.preventDefault();
      var proId = f.getAttribute("data-thread"), inp = f.querySelector("input"), text = inp.value.trim();
      if (!text) return;
      inp.disabled = true;
      post("hs-case-messages", { caseId: c, token: tok, proId: proId, text: text }).then(function (j) {
        drafts[proId] = "";
        (threads[proId] = threads[proId] || []).push(j.message || { from: "homeowner", text: text });
        render();
        if (j.scrubbed) { var n = box.querySelector('form[data-thread="' + proId + '"]'); if (n) n.parentNode.appendChild(h("p", { class: "hs-meta", text: t("caso.scrubbed") })); }
      }).catch(function (x) { inp.disabled = false; err(x); });
    });
    box.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-act")) {
        busy = true;
        b.disabled = true;
        post("hs-offer-respond", { caseId: c, token: tok, offerId: b.getAttribute("data-offer"), action: b.getAttribute("data-act") })
          .then(function () { busy = false; return refresh(); })
          .catch(function (x) { busy = false; render(); err(x); });
      } else if (b.id === "casoDelete") {
        var ask = h("div", { class: "hs-panel", id: "casoDeleteAsk" }, [h("p", { text: t("caso.deleteAsk") }), h("button", { class: "hs-del", type: "button", id: "casoDeleteYes", text: t("caso.deleteConfirm") })]);
        b.replaceWith(ask);
      } else if (b.id === "casoDeleteYes") {
        b.disabled = true;
        post("hs-case-delete", { caseId: c, token: tok }).then(function () { deleted = true; clearInterval(poll); store("hs_case", null); render(); }).catch(function (x) { b.disabled = false; err(x); });
      }
    });
    langHooks.push(render);
    box.textContent = t("caso.loading");
    refresh();
    poll = setInterval(function () { if (!doc.hidden && !busy) refresh(); }, 15000);
    window.HS_CASO_REFRESH = refresh;
  }

  /* ================================================================
     WIRING
     ================================================================ */
  function init() {
    applyLang(lang, false);
    var lb = doc.getElementById("hsLang");
    if (lb) lb.addEventListener("click", function () { stopSpeech(); applyLang(lang === "es" ? "en" : "es", true); });
    if (doc.body.getAttribute("data-page") === "caso") { initCaso(); return; }

    initAssets();
    initStars();
    showMyCase();
    var mute = doc.getElementById("hsMute");
    var paintMute = function () { if (!mute) return; mute.setAttribute("aria-pressed", muted ? "true" : "false"); mute.setAttribute("data-i18n-aria", muted ? "chat.unmute" : "chat.mute"); var a = t(muted ? "chat.unmute" : "chat.mute"); mute.setAttribute("aria-label", a); mute.setAttribute("title", a); };
    paintMute();
    if (mute) mute.addEventListener("click", function () { muted = !muted; store("hs_muted", muted ? "1" : "0"); if (muted) stopSpeech(); paintMute(); });
    langHooks.push(function () {
      paintMute();
      if (cardEl) showCaseCard(chat.cardMode);
      var on = doc.querySelectorAll(".hs-listen");
      for (var i = 0; i < on.length; i++) setListenBtn(on[i], on[i] === speech.owner ? "on" : "");
    });

    doc.addEventListener("click", function (e) {
      var el = e.target.closest("[data-action],[data-listen]");
      if (!el) return;
      if (el.hasAttribute("data-listen")) { onListen(el); return; }
      var act = el.getAttribute("data-action");
      if (act === "star") onStarTap();
      else if (act === "upload") onUploadClick();
      else if (act === "talk") {
        stopSpeech();
        openSheet();
        var starter = el.getAttribute("data-starter");
        if (starter) { greetIfNeeded(false); sendText(t(starter)); }
        else greetIfNeeded(true);
        if (!starter && input) setTimeout(function () { input.focus(); }, 60);
      }
    });
    var compose = doc.getElementById("hsCompose");
    if (compose) compose.addEventListener("submit", function (e) { e.preventDefault(); var v = input.value; input.value = ""; stopSpeech(); sendText(v); });
    var mic = doc.getElementById("hsMic");
    if (mic) mic.addEventListener("click", function () { if (convo.active) { convo.stop(); stopSpeech(); } else onStarTap(); });
    var close = doc.getElementById("hsClose");
    if (close) close.addEventListener("click", closeSheet);
    doc.addEventListener("keydown", function (e) { if (e.key === "Escape" && sheet && !sheet.hidden) closeSheet(); });
    if (fileInput) fileInput.addEventListener("change", onFilePicked);
    if (input) input.addEventListener("input", function () { if (convo.active && convo.state === "speaking") stopSpeech(); });
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init); else init();
})();

/* ============================================================
   ARIA'S OWNED VOICE, THE PAGE'S HALF (#443 c.6416074857).

   Loaded only when the owned voice is switched on for this browser
   (?voz=propia, which sticks; ?voz=vivo or ?voz=clasica switches it
   off) and only when the microphone is tapped. Everything else on the
   page is unchanged, and the Realtime voice stays the default.

   What this file does, and nothing more:
     - asks /api/voice-token for a room with Aria's agent in it;
     - joins it over LiveKit (vendored client, loaded on demand) and
       publishes the microphone track the page already opened;
     - hands her audio to the page's own audio sink, and tells the
       agent when that sink is actually playing, so the greeting never
       starts into a speaker that is not on yet;
     - answers the agent's requests -- the page's memory, a tool run in
       the page, a line for the transcript -- by calling the page's own
       functions, the same ones the Realtime voice uses.

   Any failure before the agent is in the room returns { ok:false } and
   the page says so. It never hands the tap to another voice: one
   session, one voice (#443 c.6549932007).

   ONE VOICE. Only an agent that announces Grecia's engine (attribute
   aria.voice = "elevenlabs/...") is taken; the first one is the call's
   voice, and no other participant's audio is ever played. A stale
   worker from an older build, or any second agent in the room, is
   recorded (call.state().ignored) and never heard.
   ============================================================ */
(function () {
  'use strict';

  var TOKEN_URL = '/api/voice-token';
  var CLIENT_SRC = '/assets/vendor/livekit-client-2.22.4.umd.js';
  /* A worker that is not deployed, or is full, never joins; past this
     the page reports that the voice did not connect. Long enough for a
     cold LiveKit Cloud worker. */
  var AGENT_JOIN_MS = 15000;
  var VOICE_ATTR = 'aria.voice';
  var VOICE_ENGINE = /^elevenlabs\//;
  function voiceOf(p) {
    var a = p && p.attributes;
    return (a && typeof a[VOICE_ATTR] === 'string') ? a[VOICE_ATTR] : '';
  }
  /** Grecia's worker: an agent that says it speaks with ElevenLabs. */
  function isGreciaAgent(p) {
    return !!(p && p.isAgent && VOICE_ENGINE.test(voiceOf(p)));
  }
  var CLIENT_LOAD_MS = 10000;

  var RPC = { READY: 'aria.ready', CUE: 'aria.cue', TEXT: 'aria.text', CONTEXT: 'aria.context', TOOL: 'aria.tool', TURN: 'aria.turn', USER: 'aria.user', SHOW: 'aria.show' };

  var clientPromise = null;
  function loadClient() {
    if (window.LivekitClient) return Promise.resolve(window.LivekitClient);
    if (clientPromise) return clientPromise;
    clientPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      var timer = setTimeout(function () { reject(new Error('el cliente de voz tardó demasiado en cargar')); }, CLIENT_LOAD_MS);
      s.src = CLIENT_SRC;
      s.async = true;
      s.onload = function () { clearTimeout(timer); window.LivekitClient ? resolve(window.LivekitClient) : reject(new Error('el cliente de voz no se definió')); };
      s.onerror = function () { clearTimeout(timer); reject(new Error('no se pudo cargar el cliente de voz')); };
      document.head.appendChild(s);
    }).catch(function (e) { clientPromise = null; throw e; });
    return clientPromise;
  }

  /* RETURN WITH MEMORY (#443 rider 3): the thread id this device was
     given, brought back so the worker reads the same thread from our
     store. The id opens nothing by itself; only the worker can read a
     thread. Private windows and blocked storage just start fresh. */
  var THREAD_KEY = 'aria.voice.thread';
  function savedThread() {
    try { return localStorage.getItem(THREAD_KEY) || ''; } catch (e) { return ''; }
  }
  function saveThread(id) {
    try { if (id) localStorage.setItem(THREAD_KEY, id); } catch (e) { /* fresh next time */ }
  }

  async function mintToken() {
    try {
      var res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thread: savedThread() }) });
      var body = null;
      try { body = await res.json(); } catch (e) { body = null; }
      if (!res.ok || !body || !body.token || !body.url) {
        return { ok: false, said: (body && body.error) || ('el servidor respondió ' + res.status) };
      }
      saveThread(body.thread);
      return { ok: true, mint: body, at: Date.now() };
    } catch (e) {
      return { ok: false, said: 'no pude contactar al servidor', detail: e.message };
    }
  }

  /* WARM BEFORE THE TAP (#443 ear test 2: ten seconds from tap to her
     hello). Opening the chat loads the client and mints a room, so the
     tap only connects. A minted room is good for one call and a few
     minutes; anything older is minted again at the tap. */
  var WARM_MAX_AGE_MS = 4 * 60 * 1000;
  /* A failed warm-up is this moment's answer (the tap that started it
     falls back on it rather than asking twice), but not for long. */
  var WARM_FAILED_AGE_MS = 15000;
  var warmed = null;
  function fresh(w) {
    return !!w && Date.now() - w.at < (w.failed ? WARM_FAILED_AGE_MS : WARM_MAX_AGE_MS);
  }
  function warm() {
    if (fresh(warmed)) return warmed.ready;
    var w = { at: Date.now(), failed: false, ready: null };
    w.ready = Promise.all([mintToken(), loadClient().catch(function (e) { return { error: e }; })]);
    w.ready.then(function (r) { if (!r[0].ok || (r[1] && r[1].error)) w.failed = true; });
    warmed = w;
    return w.ready;
  }
  /** The warm room if there is a fresh one, taken once; otherwise a new one. Client and token in parallel. */
  function takeWarm() {
    var w = warmed;
    warmed = null;
    if (fresh(w)) return w.ready;
    return Promise.all([mintToken(), loadClient().catch(function (e) { return { error: e }; })]);
  }

  /**
   * The answers to the agent's requests, from the page's hooks. Pure
   * (no LiveKit), so the tests drive it directly.
   */
  function rpcHandlers(hooks) {
    var h = {};
    h[RPC.CONTEXT] = async function () {
      var c = {};
      try { c = hooks.context() || {}; } catch (e) { c = {}; }
      return JSON.stringify({ history: Array.isArray(c.history) ? c.history : [], recipient: c.recipient || null });
    };
    h[RPC.TOOL] = async function (payload) {
      var req = {};
      try { req = JSON.parse(payload || '{}'); } catch (e) { req = {}; }
      var out;
      try { out = await hooks.tool(String(req.name || ''), req.arguments); }
      catch (e) { out = { unavailable: 'esa consulta se me trabó, déjame intentar de nuevo' }; }
      return JSON.stringify(out == null ? {} : out);
    };
    h[RPC.TURN] = async function (payload) {
      var req = {};
      try { req = JSON.parse(payload || '{}'); } catch (e) { req = {}; }
      var speech = true;
      try { speech = hooks.turn(req.role === 'assistant' ? 'assistant' : 'user', String(req.text || '')) !== false; }
      catch (e) { speech = true; }
      return JSON.stringify({ speech: speech });
    };
    /* Notices: his voice started or stopped (our VAD), and product ids
       her answer pointed at. Never an error back to the worker. */
    h[RPC.USER] = async function (payload) {
      var req = {};
      try { req = JSON.parse(payload || '{}'); } catch (e) { req = {}; }
      try { if (hooks.user) hooks.user(String(req.state || '')); } catch (e) {}
      return '{}';
    };
    h[RPC.SHOW] = async function (payload) {
      var req = {};
      try { req = JSON.parse(payload || '{}'); } catch (e) { req = {}; }
      var ids = Array.isArray(req.ids) ? req.ids.filter(function (x) { return typeof x === 'string'; }).slice(0, 8) : [];
      var shown = 0;
      try { if (hooks.show && ids.length) shown = hooks.show(ids) || 0; } catch (e) {}
      return JSON.stringify({ shown: shown });
    };
    return h;
  }

  /**
   * Start a call. `hooks` are the page's:
   *   micTrack            the MediaStreamTrack the page opened
   *   attachRemote(stream) play her audio; call onPlaying when it plays
   *   context()           { history, recipient }
   *   tool(name, rawArgs) the tool's output object
   *   turn(role, text)    false when the page reads it as noise
   *   state(kind)         'listening' | 'thinking' | 'speaking' | ...
   *   user(state)         his voice: 'speaking' | 'listening' | ...
   *   show(ids)           put up the cards for these product ids
   *   dropped(why)        the line died under the call
   *   ended(why)          the agent closed the call (its cap)
   * Resolves { ok:true, call } or { ok:false, said, detail }.
   */
  async function start(hooks) {
    var both = await takeWarm();
    var got = both[0];
    if (!got.ok) return { ok: false, said: got.said, detail: got.detail || null };
    if (both[1] && both[1].error) return { ok: false, said: both[1].error.message };
    var LK = both[1];

    var room = new LK.Room({ adaptiveStream: false, dynacast: false });
    var stopping = false;
    var agent = null;
    var handlers = rpcHandlers(hooks);
    /* Only her worker reaches the page: a stale or second agent's
       requests (a transcript line, a tool) are refused. */
    function fromHer(data) {
      var who = data && data.callerIdentity;
      if (!who) return true;
      if (agent) return who === agent.identity;
      return isGreciaAgent(room.remoteParticipants && room.remoteParticipants.get(who));
    }
    Object.keys(handlers).forEach(function (m) {
      room.registerRpcMethod(m, function (data) {
        if (!fromHer(data)) return Promise.reject(new Error('not this call\'s voice'));
        return handlers[m](data && data.payload);
      });
    });

    var joined;
    var agentJoined = new Promise(function (r) { joined = r; });
    var ignored = {};
    var pendingAudio = {};
    var attached = false;
    function attach(track) {
      if (attached || !track) return;
      attached = true;
      try { hooks.attachRemote(new MediaStream([track.mediaStreamTrack])); } catch (e) { console.warn('[aria] owned voice: could not attach her audio', e); }
    }
    function isHer(p) { return !!(agent && p && p.identity === agent.identity); }
    function noteAgent(p) {
      if (!p || !p.isAgent || isHer(p)) return;
      if (!agent && isGreciaAgent(p)) {
        agent = p;
        delete ignored[p.identity];
        joined(p);
        if (pendingAudio[p.identity]) attach(pendingAudio[p.identity]);
        pendingAudio = {};
        return;
      }
      ignored[p.identity] = voiceOf(p) || 'sin voz anunciada';
    }
    room.on(LK.RoomEvent.ParticipantConnected, noteAgent);
    room.on(LK.RoomEvent.TrackSubscribed, function (track, _pub, p) {
      noteAgent(p);
      if (!track || track.kind !== 'audio' || !p || !p.isAgent) return;
      if (isHer(p)) attach(track);
      else if (!agent) pendingAudio[p.identity] = track; /* heard only if this agent turns out to be her */
    });
    room.on(LK.RoomEvent.ParticipantAttributesChanged, function (changed, p) {
      if (!p || !p.isAgent) return;
      if (changed && changed[VOICE_ATTR] != null) noteAgent(p);
      if (isHer(p) && changed && changed['lk.agent.state']) {
        try { hooks.state(changed['lk.agent.state']); } catch (e) {}
      }
    });
    room.on(LK.RoomEvent.ParticipantDisconnected, function (p) {
      if (!stopping && agent && p && p.identity === agent.identity) { stopping = true; try { hooks.ended('el agente cerró la llamada'); } catch (e) {} }
    });
    room.on(LK.RoomEvent.Disconnected, function (reason) {
      if (!stopping) { stopping = true; try { hooks.dropped('desconectado: ' + String(reason)); } catch (e) {} }
    });

    function stop() {
      if (stopping && room.state === 'disconnected') return;
      stopping = true;
      try { room.disconnect(true); } catch (e) {}
    }

    try {
      await room.connect(got.mint.url, got.mint.token, { autoSubscribe: true });
      try { await room.startAudio(); } catch (e) {}
      await room.localParticipant.publishTrack(hooks.micTrack, { source: LK.Track.Source.Microphone, dtx: true });
      room.remoteParticipants.forEach(noteAgent);
      var who = await Promise.race([agentJoined, new Promise(function (r) { setTimeout(function () { r(null); }, AGENT_JOIN_MS); })]);
      if (!who) {
        stop();
        var stale = Object.keys(ignored).map(function (k) { return k + ' (' + ignored[k] + ')'; }).join(', ');
        return { ok: false, said: 'Aria no entró a la llamada', detail: 'no Grecia agent in ' + got.mint.room + ' after ' + AGENT_JOIN_MS + 'ms' + (stale ? '; ignored: ' + stale : '') };
      }
    } catch (e) {
      stop();
      return { ok: false, said: 'la conexión de voz no se estableció', detail: e && e.message };
    }

    var rpc = function (method, payload) {
      return room.localParticipant.performRpc({ destinationIdentity: agent.identity, method: method, payload: payload });
    };
    var call = {
      engine: 'owned',
      room: got.mint.room,
      /* Her speaker is playing: the greeting may start. */
      ready: function () { rpc(RPC.READY, '{}').catch(function () {}); },
      /* A doctrine line (opening nudge, sign-off), said by her brain. */
      cue: function (text) { rpc(RPC.CUE, JSON.stringify({ cue: String(text || '') })).catch(function () {}); return true; },
      /* A line he typed during the call: she answers it out loud. */
      text: function (text) { rpc(RPC.TEXT, JSON.stringify({ text: String(text || '') })).catch(function () {}); return true; },
      stop: stop,
      state: function () { return { room: got.mint.room, connection: room.state, agent: agent ? agent.identity : null, voice: agent ? voiceOf(agent) : null, ignored: Object.keys(ignored).map(function (k) { return { identity: k, voice: ignored[k] }; }) }; },
    };
    return { ok: true, call: call };
  }

  window.AriaOwnedVoice = { isGreciaAgent: isGreciaAgent, VOICE_ATTR: VOICE_ATTR, AGENT_JOIN_MS: AGENT_JOIN_MS, start: start, warm: warm, rpcHandlers: rpcHandlers, RPC: RPC, TOKEN_URL: TOKEN_URL, CLIENT_SRC: CLIENT_SRC };
})();

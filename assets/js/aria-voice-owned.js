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
   the page starts the Realtime voice instead: there is never a tap
   with no voice at all.
   ============================================================ */
(function () {
  'use strict';

  var TOKEN_URL = '/api/voice-token';
  var CLIENT_SRC = '/assets/vendor/livekit-client-2.22.4.umd.js';
  /* A worker that is not deployed, or is full, never joins; past this
     the page gives the call to the Realtime voice. */
  var AGENT_JOIN_MS = 8000;
  var CLIENT_LOAD_MS = 10000;

  var RPC = { READY: 'aria.ready', CUE: 'aria.cue', TEXT: 'aria.text', CONTEXT: 'aria.context', TOOL: 'aria.tool', TURN: 'aria.turn' };

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
      return { ok: true, mint: body };
    } catch (e) {
      return { ok: false, said: 'no pude contactar al servidor', detail: e.message };
    }
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
   *   dropped(why)        the line died under the call
   *   ended(why)          the agent closed the call (its cap)
   * Resolves { ok:true, call } or { ok:false, said, detail }.
   */
  async function start(hooks) {
    var got = await mintToken();
    if (!got.ok) return { ok: false, said: got.said, detail: got.detail || null };
    var LK;
    try { LK = await loadClient(); }
    catch (e) { return { ok: false, said: e.message }; }

    var room = new LK.Room({ adaptiveStream: false, dynacast: false });
    var stopping = false;
    var agent = null;
    var handlers = rpcHandlers(hooks);
    Object.keys(handlers).forEach(function (m) {
      room.registerRpcMethod(m, function (data) { return handlers[m](data && data.payload); });
    });

    var joined;
    var agentJoined = new Promise(function (r) { joined = r; });
    function noteAgent(p) {
      if (!agent && p && p.isAgent) { agent = p; joined(p); }
    }
    room.on(LK.RoomEvent.ParticipantConnected, noteAgent);
    room.on(LK.RoomEvent.TrackSubscribed, function (track, _pub, p) {
      noteAgent(p);
      if (track && track.kind === 'audio' && p && p.isAgent) {
        try { hooks.attachRemote(new MediaStream([track.mediaStreamTrack])); } catch (e) { console.warn('[aria] owned voice: could not attach her audio', e); }
      }
    });
    room.on(LK.RoomEvent.ParticipantAttributesChanged, function (changed, p) {
      if (p && p.isAgent && changed && changed['lk.agent.state']) {
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
      if (!who) { stop(); return { ok: false, said: 'Aria no entró a la llamada', detail: 'no agent in ' + got.mint.room + ' after ' + AGENT_JOIN_MS + 'ms' }; }
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
      state: function () { return { room: got.mint.room, connection: room.state, agent: agent ? agent.identity : null }; },
    };
    return { ok: true, call: call };
  }

  window.AriaOwnedVoice = { start: start, rpcHandlers: rpcHandlers, RPC: RPC, TOKEN_URL: TOKEN_URL, CLIENT_SRC: CLIENT_SRC };
})();

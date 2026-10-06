/* ============================================================
   THE VOICE TURN — PURE, AND SHARED WITH THE PAGE.

   Split out of realtime-voice.js so the browser can load it. The other
   half builds the session (instructions, tools, VAD) and must stay
   server-side, because instructions editable from a console are
   instructions a shopper can rewrite. Everything here is safe to ship
   to the client: it decides what to DO with an event, and holds no
   credential and no prompt.

   THE BARGE-IN LOGIC LIVES HERE because it is the behaviour the whole
   brief turns on, and it is a dozen lines of decision wrapped in a
   great deal of audio plumbing. Keeping the decision pure is what lets
   it be tested without a microphone.
   ============================================================ */

/* ------------------------------------------------------------------
   TOOLS

   ONLY THE ONES WITH A REAL BACKEND. The brief lists eleven; these are
   the ones this repo can actually answer truthfully today. A tool that
   returns a plausible shape with nothing behind it is worse than no
   tool at all here, because the model will narrate its output as fact
   — which is the one thing section 12 forbids. What is missing, and
   why, is listed in the PR body rather than stubbed.

   create_order is deliberately absent even though orders-create.js
   exists: taking money is not something a microphone should be able to
   do on a mis-heard sentence.
   ------------------------------------------------------------------ */
export const REALTIME_TOOLS = Object.freeze([
  {
    type: "function",
    name: "search_products",
    description:
      "Busca productos en el catálogo de Aria (tiendas de EE.UU. con envío a Perú). " +
      "Todo lo que devuelve se puede comprar. Úsala apenas el cliente diga qué busca.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Qué busca, en español o inglés." },
        brand: { type: "string", description: "Marca, solo si el cliente la nombró." },
        max_price_usd: { type: "number", description: "Tope en dólares, solo si lo dijo." },
        max_price_pen: { type: "number", description: "Tope en soles, solo si lo dijo." },
        limit: { type: "number", description: "Cuántos resultados (1-8, por defecto 4)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_product_details",
    description:
      "Detalle completo de UN producto: precio, peso, tallas y el total puesto en Perú. " +
      "Úsala cuando el cliente pregunte por uno en concreto.",
    parameters: {
      type: "object",
      properties: { product_id: { type: "string", description: "El id que devolvió search_products." } },
      required: ["product_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "calculate_total_delivered_price",
    description:
      "El total REAL puesto en la puerta: producto + flete por peso + aranceles e IGV si aplica. " +
      "Úsala siempre que el cliente pregunte cuánto le sale algo en total.",
    parameters: {
      type: "object",
      properties: {
        product_id: { type: "string", description: "El producto." },
        quantity: { type: "number", description: "Cuántas unidades (por defecto 1)." },
      },
      required: ["product_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_order_status",
    description: "Estado de un pedido por su código Aria. Solo si el cliente da el código.",
    parameters: {
      type: "object",
      properties: { order_ref: { type: "string", description: "El código Aria del pedido." } },
      required: ["order_ref"],
      additionalProperties: false,
    },
  },
]);

/** The tool names the client is allowed to execute. */
export const REALTIME_TOOL_NAMES = Object.freeze(REALTIME_TOOLS.map((t) => t.name));

/* ------------------------------------------------------------------
   TOOL ARGUMENTS

   The model produces these as JSON text, and a model under time
   pressure produces malformed JSON sometimes. A bad argument must
   become a message Aria can say out loud, never a thrown exception
   that kills the audio session mid-sentence.
   ------------------------------------------------------------------ */

/** @returns {{ok:true,args:object}|{ok:false,error:string}} */
export function parseToolArguments(name, raw) {
  if (!REALTIME_TOOL_NAMES.includes(name)) {
    return { ok: false, error: `No existe la herramienta "${name}".` };
  }
  let args = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) args = {};
    else {
      try { args = JSON.parse(raw); }
      catch { return { ok: false, error: "No pude leer los parámetros de la herramienta." }; }
    }
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { ok: false, error: "Los parámetros deben ser un objeto." };
  }
  const spec = REALTIME_TOOLS.find((t) => t.name === name);
  for (const req of spec.parameters.required || []) {
    const v = args[req];
    if (v === undefined || v === null || (typeof v === "string" && !v.trim())) {
      return { ok: false, error: `Falta "${req}".` };
    }
  }
  /* Numbers arrive as strings often enough to be worth coercing here
     rather than in four call sites. */
  const out = {};
  for (const [k, v] of Object.entries(args)) {
    const t = spec.parameters.properties[k];
    if (!t) continue;                       // unknown key: dropped, not an error
    if (t.type === "number"){
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) continue;
      out[k] = n;
    } else if (t.type === "string"){
      if (typeof v !== "string" || !v.trim()) continue;
      out[k] = v.trim().slice(0, 300);
    }
  }
  for (const req of spec.parameters.required || []) {
    if (out[req] === undefined) return { ok: false, error: `"${req}" no es válido.` };
  }
  return { ok: true, args: out };
}

/* ------------------------------------------------------------------
   BARGE-IN — THE STATE MACHINE

   Pure on purpose. The behaviour the whole brief turns on is three
   lines of logic wrapped in a great deal of audio plumbing, and the
   logic is the part that can be wrong in a way nobody notices until a
   shopper is talking over a voice that will not stop.

   THE RULE: the shopper starting to speak always wins. Aria's audio
   stops, whatever is queued is dropped, and what she had already said
   is kept in the transcript — a cancelled turn still happened, and
   forgetting it would make her repeat herself.
   ------------------------------------------------------------------ */

export const VOICE_IDLE = "idle";          // nobody is talking
export const VOICE_LISTENING = "listening";// shopper is talking
export const VOICE_THINKING = "thinking";  // model is working, no audio yet
export const VOICE_SPEAKING = "speaking";  // Aria's audio is playing

export function createVoiceTurnState(){
  return { phase: VOICE_IDLE, spokenSoFar: "", interruptions: 0, lastResponseId: null };
}

/**
 * Fold one realtime server event into the turn state.
 *
 * Returns the state plus the ACTIONS the transport must take. Keeping
 * the actions as data is what makes this testable: the test asserts
 * that a speech_started during playback yields `stopPlayback` and
 * `cancelResponse`, with no audio hardware anywhere near it.
 */
export function voiceTurnReducer(state, event){
  const s = { ...state };
  const actions = [];
  const type = event && event.type;

  switch (type){
    case "input_audio_buffer.speech_started": {
      /* THE BARGE-IN. The shopper has begun talking. If Aria is mid
         sentence this is an interruption and everything she has queued
         must go — the brief is explicit that buffered audio must not
         keep playing. */
      if (s.phase === VOICE_SPEAKING || s.phase === VOICE_THINKING){
        s.interruptions++;
        actions.push("stopPlayback", "clearAudioQueue");
        /* Only an in-flight response can be cancelled; cancelling a
           finished one is an error back from the server. */
        if (s.lastResponseId) actions.push("cancelResponse");
      }
      s.phase = VOICE_LISTENING;
      break;
    }
    case "input_audio_buffer.speech_stopped":
      /* Semantic VAD decided the utterance is complete. The server
         creates the response itself (create_response: true), so there
         is nothing to send — only the UI changes. */
      if (s.phase === VOICE_LISTENING) s.phase = VOICE_THINKING;
      break;

    case "response.created":
      s.lastResponseId = (event.response && event.response.id) || null;
      s.spokenSoFar = "";
      if (s.phase !== VOICE_LISTENING) s.phase = VOICE_THINKING;
      break;

    case "response.output_audio.delta":
      /* Audio is arriving. If the shopper started talking since it was
         requested, this belongs to a turn that is already dead. */
      if (s.phase === VOICE_LISTENING){ actions.push("dropAudio"); break; }
      s.phase = VOICE_SPEAKING;
      actions.push("playAudio");
      break;

    case "response.output_audio_transcript.delta":
      if (typeof event.delta === "string") s.spokenSoFar += event.delta;
      break;

    case "response.done":
    case "response.output_audio.done":
      if (s.phase === VOICE_SPEAKING || s.phase === VOICE_THINKING) s.phase = VOICE_IDLE;
      s.lastResponseId = null;
      break;

    case "error":
      /* An error must never leave the UI stuck on "speaking" with the
         orb pulsing at a silent panel. */
      s.phase = VOICE_IDLE;
      s.lastResponseId = null;
      actions.push("stopPlayback");
      break;

    default:
      break;
  }
  return { state: s, actions };
}

/* ------------------------------------------------------------------
   WHEN TO USE IT AT ALL
   ------------------------------------------------------------------ */

/**
 * Can this browser hold a realtime session?
 *
 * Answered from capabilities rather than user-agent sniffing, and it
 * fails CLOSED: anything unexpected falls back to the speech-to-text
 * loop the site already has, which works everywhere and is what every
 * shopper has today. A realtime session that half-starts is worse than
 * the old one that works.
 */
export function realtimeSupported(env){
  const e = env || {};
  if (!e.RTCPeerConnection) return { ok: false, reason: "este navegador no soporta WebRTC" };
  if (!e.mediaDevices || typeof e.mediaDevices.getUserMedia !== "function") {
    return { ok: false, reason: "este navegador no da acceso al micrófono" };
  }
  if (!e.isSecureContext) return { ok: false, reason: "la voz en vivo necesita HTTPS" };
  return { ok: true, reason: null };
}

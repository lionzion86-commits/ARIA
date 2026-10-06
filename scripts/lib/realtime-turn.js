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
        max_price_usd: { type: "number", description:
          "Tope EN DÓLARES. Solo si dijo 'dólares'. Si habló en SOLES no uses este campo." },
        max_price_pen: { type: "number", description:
          "Tope EN SOLES. Si dijo 'soles' o 'lucas', el número va AQUÍ, tal cual lo dijo, sin convertir. 500 soles no son 500 dólares." },
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
    name: "get_sale_scoop",
    /* THE FRIEND WHO KNOWS WHERE THE SALES ARE.

       Relevance is the whole design. One best deal PER STORE rather
       than five from whichever shop happens to be deepest, because
       the useful sentence is "Macy's has 30% but Kohl's has 80%" and
       you cannot say that from five Kohl's rows. */
    description:
      "Ofertas REALES de una marca o categoría que el cliente acaba de mencionar: " +
      "tienda, precio antes, precio ahora y el descuento. Úsala cuando nombre una marca " +
      "o un tipo de producto, nunca para cambiar de tema. Nunca inventes un descuento.",
    parameters: {
      type: "object",
      properties: {
        brand: { type: "string", description: "La marca que nombró, si nombró una." },
        category: { type: "string", description: "El tipo de producto que busca, si lo dijo." },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_store_info",
    /* SHE KNOWS THE MALL, NOT JUST THE SHELVES. A shopper who asks
       "¿qué tiene Zumiez?" is not asking for a product search, and
       guessing at a store's contents is how she ends up promising
       skateboards from a store that sells eighteen t-shirts. The
       knowledge base is measured off the committed catalogues, and a
       store with no catalogue answers `not_stocked` so she can say so
       instead of inventing a shelf. */
    description:
      "Lo que sabemos de una tienda: qué vende, para quién es, para quién NO es, " +
      "su rango de precio y cuántos productos tiene. Úsala cuando el cliente nombre " +
      "una tienda. Si la tienda no tiene catálogo te lo dice — dilo, no ofrezcas sus productos.",
    parameters: {
      type: "object",
      properties: {
        store_name: { type: "string", description: "La tienda que nombró, como la dijo." },
      },
      required: ["store_name"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "recommend_stores_for",
    /* THE GUIDE, BEFORE THE SEARCH. "A mi nieto le gusta el skate"
       has two answers in two different stores, so this returns the
       question to ask rather than a guess — and the branches it
       returns are already filtered to stores with the stock to back
       them. */
    description:
      "Las tiendas correctas para un interés: 'skate', 'belleza', 'regalo para un niño', " +
      "'zapatillas para correr'. Úsala ANTES de buscar productos, cuando el cliente " +
      "menciona un interés en lugar de un producto específico. Si devuelve 'clarify', " +
      "haz esa pregunta tal cual antes de buscar nada.",
    parameters: {
      type: "object",
      properties: {
        interest: { type: "string", description: "El interés o la ocasión, en sus palabras." },
        resolved: {
          type: "boolean",
          description: "true solo si ya hiciste la pregunta de 'clarify' y él respondió.",
        },
      },
      required: ["interest"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_top_sales",
    /* THE VAGUE SHOPPER GOES TO THE SALES. Danny: "if you're vague,
       send them to sales because in sales they'll probably buy."

       SEPARATE FROM get_sale_scoop ON PURPOSE. That tool refuses to
       answer without a brand or a category, which is what guarantees
       it can never pitch jackets to someone buying cleats. A vague
       shopper has no topic to be relevant to, and asking him for one
       is the twenty-questions the addendum forbids — so the general
       case gets its own door rather than a hole in that guarantee. */
    description:
      "Las ofertas más fuertes del sitio ahora mismo, agrupadas por categoría. " +
      "Úsala cuando el cliente NO sepa qué quiere: 'no sé', 'estoy viendo', 'qué hay', " +
      "'algo bonito', o cuando se queda callado. Nunca inventes un descuento.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Opcional. Si ya dijo un rubro — ropa, zapatillas, hogar — pásalo.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "lookup_part_by_number",
    /* A PART NUMBER IS THE ONE THING A SHOPPER CAN BE SURE OF. It is
       stamped on the old part, so it beats any description — and it
       names the part, not the car, which is why the answer comes back
       with every vehicle we have seen it filed under rather than a
       single confident fit. */
    description:
      "Busca un repuesto por su número de parte (OEM o del fabricante). Devuelve el " +
      "repuesto, su precio y TODOS los autos en los que lo tenemos registrado. " +
      "Si aparece en varios, pregúntale cuál tiene. Si no existe, dilo — nunca adivines.",
    parameters: {
      type: "object",
      properties: {
        part_number: { type: "string", description: "El número tal como lo dictó." },
      },
      required: ["part_number"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "lookup_parts_by_vehicle",
    /* FITMENT HAS TWO STATES AND NO THIRD. "confirmed" means the
       catalogue has that exact year, make and model; "likely" means the
       same car in a different year. Nothing in the data supports more
       than that, so nothing here offers more. */
    description:
      "Busca repuestos para un auto. Cada repuesto vuelve con 'fitment': 'confirmed' " +
      "(datos de ese año exacto) o 'likely' (mismo auto, otro año — NO está confirmado). " +
      "Nunca digas que una pieza entra si el fitment es 'likely': di que lo más probable " +
      "es que entre y que confirme con el número de parte.",
    parameters: {
      type: "object",
      properties: {
        year: { type: "integer", description: "Año del auto." },
        make: { type: "string", description: "Marca: toyota, hyundai, kia…" },
        model: { type: "string", description: "Modelo: hilux, corolla, sonata…" },
        part_type: { type: "string", description: "El repuesto en español: 'pastillas de freno'." },
      },
      required: ["year", "make", "model", "part_type"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "decode_vin",
    /* The VIN removes the guesswork from year and make. Model, trim
       and engine come back null when we cannot read them, and null
       means ask, never assume. */
    description:
      "Lee un VIN de 17 caracteres y devuelve año, marca y — si se puede — modelo, " +
      "versión y motor. Si model viene null, PREGÚNTALE el modelo, no lo adivines. " +
      "Si checksum_ok es false, pídele que te lo confirme pero sigue adelante.",
    parameters: {
      type: "object",
      properties: {
        vin: { type: "string", description: "El VIN como lo dictó, 17 caracteres." },
      },
      required: ["vin"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "check_brand_exists",
    /* "No" is never the whole answer. This provides the honest half:
       whether we carry it, and what is genuinely close if we do not. */
    description:
      "Revisa si tenemos una marca. Devuelve exists, cuántos productos, y si NO la " +
      "tenemos, marcas parecidas que SÍ tenemos. Úsala antes de decirle que no hay algo. " +
      "Si viene 'heard_as', puede que hayas entendido mal el nombre: confírmalo.",
    parameters: {
      type: "object",
      properties: {
        brand_name: { type: "string", description: "La marca que pidió." },
      },
      required: ["brand_name"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "request_brand",
    /* The half that turns a "no" into a reason to come back. */
    description:
      "Anota una marca que el cliente pidió y no tenemos, para traerla. Úsala solo " +
      "si él dijo que sí. Después dile 'Listo, ya está pedida. Te aviso cuando llegue.' " +
      "NUNCA le des una fecha de llegada.",
    parameters: {
      type: "object",
      properties: {
        brand_name: { type: "string", description: "La marca que quiere." },
        shopper_note: { type: "string", description: "Qué producto de esa marca buscaba, si lo dijo." },
      },
      required: ["brand_name"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_current_user",
    /* SHE TAKES NO USER ID, HERE OR BELOW. The server knows who is on
       the call from the session cookie; letting the model name a
       customer would let a mis-heard sentence read someone else's
       history out loud. */
    description:
      "Quién está en la llamada. Si logged_in es false es un invitado: atiéndelo normal " +
      "y NO le pidas que inicie sesión. Si viene first_name, salúdalo por su nombre.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "get_order_history",
    description:
      "Los últimos pedidos de quien está en la llamada. Si orders viene vacío NUNCA " +
      "inventes una compra. OJO: no sabemos si llegaron — delivery_known siempre es false — " +
      "así que pregunta cómo le fue, nunca afirmes que le llegó.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Cuántos pedidos traer. Por defecto 3." },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_user_preferences",
    description:
      "Las marcas que este cliente compra de verdad, contadas de sus propios pedidos. " +
      "Si la lista viene vacía, no le inventes gustos.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "get_cart_total",
    /* THE $200 LEVER, AND THE REASON IT IS A TOOL.

       Peru's de minimis is measured on the DUTIABLE BASE — what the
       goods really cost — not on the total the shopper sees, which
       carries our service margin. The two differ by about 24%: a cart
       reading $230 is still tax-free, and tax starts at a cart around
       $248. Aria cannot be allowed to work that out loud, because she
       would get it wrong in the direction that costs a sale or, worse,
       promises a tax exemption that does not exist.

       So she asks, and the answer arrives already reasoned: whether
       tax applies, and how much more she can honestly say fits. */
    description:
      "El carrito del comprador ahora mismo: el total que él ve, si ya le aplican " +
      "impuestos de importación, y cuánto más puede agregar sin que le apliquen. " +
      "Úsala antes de hablar del umbral de impuestos — nunca calcules tú.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "get_cart_items",
    /* THE SPLIT, WORKED OUT IN CODE.

       Dividing a cart into two groups that each land under the
       threshold is arithmetic on the dutiable base, and Aria is
       forbidden from doing arithmetic for good reason. So the division
       arrives already done: which products in which group, what each
       group totals, and an honest no when it cannot be done. She
       reads it out; she never computes it. */
    description:
      "Los productos del carrito, y — si el pedido pasa el umbral — una división ya " +
      "calculada en dos grupos que quedan debajo. Úsala para guiar la división: nombra " +
      "los productos de cada grupo tal como te los da. Nunca calcules tú la división.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
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
      /* A NEW ANSWER IS COMING, SO THE AUDIO PATH MUST BE OPEN.

         THE BUG THIS FIXES (production, 2026-10-06): the greeting was
         audible and every answer after it was silent, while the text
         kept appearing.

         Over WebRTC the model's audio is a continuous MediaStreamTrack,
         not a stream of `response.output_audio.delta` events — those
         belong to the WebSocket transport. So "playAudio" never fired,
         and `sink.open()` was called exactly once, by hand, at the
         start of the call. That is why the greeting worked.

         Then the shopper spoke. A barge-in cuts the audio path, and
         the ONLY thing that re-opened it was "playAudio" — the action
         that never comes. One interruption and the call was silent for
         good. The symptom proves the mechanism: if "playAudio" were
         firing, the next answer would have re-opened the path by
         itself.

         `response.created` arrives on the data channel in both
         transports, so it is the signal that works regardless of how
         the audio travels.

         And the phase is set unconditionally now. It used to stay
         LISTENING if the shopper was still talking, which dropped the
         audio of the answer to what they had just said — the server
         only creates a response once it has decided the turn ended. */
      s.lastResponseId = (event.response && event.response.id) || null;
      s.spokenSoFar = "";
      s.phase = VOICE_THINKING;
      actions.push("openAudio");
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
      /* SHE IS TALKING, WHICH IS NOT SILENCE. The idle timer was only
         re-armed by "playAudio", so over WebRTC — where that never
         fires — a long answer counted as nobody being there, and a
         thirty-five second one hung up on a shopper mid-sentence. */
      actions.push("noteActivity");
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

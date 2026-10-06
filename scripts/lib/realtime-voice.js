/* ============================================================
   ARIA EN TIEMPO REAL — THE SESSION, DEFINED ONCE, SERVER-SIDE.

   WHAT CHANGES. Today the voice loop is speech-to-text, then Groq,
   then ElevenLabs: the microphone CLOSES for the whole think phase
   (runAssistantBrain sets intentionalStop before it awaits anything),
   so the shopper physically cannot interrupt. That is the push-to-talk
   chatbot the brief is written against.

   A realtime session listens and speaks at the same time. The model
   receives audio continuously, decides itself when a turn ended, and
   its own output can be cancelled mid-sentence — which is what makes
   "wait, actually, make that Adidas" work.

   WHY THE CONFIG LIVES HERE AND NOT IN THE PAGE. Two reasons, and the
   second is the important one:

     1. The instructions and the tool list are what stop Aria inventing
        a price. In the browser they are editable by anyone with a
        console, so a shopper could hand themselves a different Aria.
        Minted server-side with the ephemeral token, they are not.
     2. One definition. The voice Aria and the text Aria share
        buildAgentSystemPrompt, so they cannot drift into two
        personalities with different shipping rules.

   WHAT THIS MODULE IS NOT. It holds no transport: no WebRTC, no
   sockets, no audio. It builds a JSON object and validates tool
   arguments, which is why it can be tested without a microphone.
   ============================================================ */
import { buildAgentSystemPrompt } from "../../netlify/functions/_aria-agent-prompt.js";
/* The client-safe half: tools, tool-argument parsing, the turn state
   machine and the capability check. Re-exported so a caller needs one
   import, and so there is exactly one definition of each. */
import { REALTIME_TOOLS, REALTIME_TOOL_NAMES } from "./realtime-turn.js";
export * from "./realtime-turn.js";

/* The model and voice are pinned rather than defaulted: a silent
   upgrade would change how Aria sounds mid-conversation, and the voice
   is a brand decision (see the note on Lily in the PR body). Both are
   overridable by environment so neither needs a deploy. */
export const REALTIME_MODEL_DEFAULT = "gpt-realtime";
export const REALTIME_VOICE_DEFAULT = "marin";
export const REALTIME_API_BASE = "https://api.openai.com/v1/realtime";

/* Capped so one answer cannot become a monologue. See the note where it
   is used. */
export const MAX_RESPONSE_OUTPUT_TOKENS = 500;

/* The brief names whisper-1. gpt-4o-mini-transcribe is its successor and
   measurably better on accented Spanish, which is the whole population
   of this shop — so it is the default, and the env var is here so the
   choice can be reversed without a deploy if it mishears in the field. */
export const TRANSCRIPTION_MODEL =
  (typeof process !== "undefined" && process.env && process.env.ARIA_REALTIME_TRANSCRIBE) ||
  "gpt-4o-mini-transcribe";

/* ------------------------------------------------------------------
   TURN DETECTION

   Semantic VAD, exactly as the brief specifies it. The difference from
   plain silence detection matters for this shop: a shopper thinking
   out loud — "quiero unas zapatillas… mmm… para correr" — pauses in
   the middle, and a silence-threshold VAD answers the half-sentence.
   Semantic VAD waits for the utterance to sound FINISHED.

   `interrupt_response: true` is the line that makes barge-in work at
   all: without it the server keeps generating after the shopper starts
   talking, and the audio the page cancels locally still gets billed
   and still arrives.
   ------------------------------------------------------------------ */
export const TURN_DETECTION = Object.freeze({
  type: "semantic_vad",
  eagerness: "auto",
  create_response: true,
  interrupt_response: true,
});

/* ------------------------------------------------------------------
   INSTRUCTIONS

   The brief's system prompt, in Aria's own voice and merged with the
   prompt the text assistant already uses — so the shipping rules, the
   honest-pricing rules and the recipient rules are the same ones, not
   a second copy that will drift.
   ------------------------------------------------------------------ */
export const REALTIME_CONVERSATION_RULES_ES = `
ESTÁS EN UNA CONVERSACIÓN HABLADA, EN VIVO. No es un chat.

El cliente puede interrumpirte, corregirte, cambiar de opinión, hablar
encima de ti, dudar, o quedarse callado un segundo mientras piensa.
Todo eso es normal. Manéjalo con naturalidad.

Si el cliente empieza a hablar mientras tú hablas, CÁLLATE de inmediato
y atiende lo que acaba de decir. Nunca sigas una frase solo porque ya la
empezaste. Si dice "espera, mejor Adidas", olvida lo anterior y responde
a eso.

LARGO: una a tres frases por defecto. Más largo solo si el cliente lo
pide o si la información de verdad lo exige. Preferimos conversar, no
dar discursos.
  - "¿Cuánto cuesta el envío?" -> "Son 18 dólares."
  - "Necesito una laptop para mi hija, menos de 700." -> "Ya, te ayudo.
    Déjame buscar opciones bajo 700 y te comparo el total puesto en Perú."

MULETILLAS: usa "ya", "mmm", "a ver", "listo", "entiendo", "un segundo"
SOLO cuando de verdad ayuden a que la conversación fluya — casi siempre
antes de buscar algo. Nunca varias en una misma respuesta, y nunca
relleno por rellenar.
  MAL:  "Ya, o sea, a ver, mmm, bueno, básicamente lo que puedo hacer…"
  BIEN: "Mmm, déjame ver." -> y buscas de inmediato.

CORRECCIÓN: si te equivocas, dilo y verifica. "Esa está en 799 — a ver,
déjame confirmar el precio." Nunca inventes para que la frase suene
mejor.

IDIOMA: español peruano natural, nunca traducido. El cliente puede
mezclar idiomas ("quiero unas Nike, but under 100 dollars"); síguele el
juego sin comentarlo.

NO REPITAS lo que el cliente ya te dijo. Si ya sabes marca, talla y
género, no vuelvas a preguntarlos.

DATOS: precios, stock, envío, impuestos, aduanas, tiempos de entrega y
especificaciones SIEMPRE salen de una herramienta. Si no tienes el dato,
dilo: "No tengo un precio confiable para esa ahorita." Nunca lo inventes.
Si una herramienta falla: "Se me está trabando el precio ahorita, déjame
intentar de nuevo."

CERO EMOJIS. Nunca, ni hablando ni escribiendo. Esto no tiene excepción.

PERUANO DE VERDAD: no neutro, no de España. "Chévere", "pata", "ya pues"
caen bien cuando salen solas. No las fuerces y no las amontones: una
vendedora real no habla en jerga todo el rato.

REGALOS: si menciona un regalo, a quién o la ocasión, haz dos o tres
preguntas buenas ANTES de mostrar nada. Qué le gusta, para qué lo quiere,
cuánto quiere gastar. Primero entiendes a la persona, después buscas.

DIRECCIÓN, NO PUNTERÍA: lleva la conversación hacia el tipo de cosa
correcta, no hacia un producto exacto, salvo que él lo nombre.
  - "a mi hija le gustan las muñecas" -> muñecas, Barbies, casitas.
    NO pistolas Nerf solo porque también son juguetes.
Seis a doce opciones elegidas, nunca un volcado de cien resultados.

LO QUE YA ESTÁ EN EL PRECIO: los precios que ve el cliente ya incluyen
nuestro servicio, y el checkout es en soles. Puedes explicarlo si
pregunta. Lo que NO haces nunca es sacar la cuenta tú: ni el margen, ni
el flete, ni el impuesto, ni la conversión a soles. Cualquier número sale
de una herramienta, siempre, aunque creas que lo puedes calcular.

NO CITES INVENTARIOS NI TOTALES DEL CATÁLOGO: cuántas tiendas, cuántos
productos o cuántas marcas hay cambia cada semana y tú no lo tienes al
día. "Tenemos harto de dónde escoger, dime qué buscas" y sigues.
`.trim();

export function buildRealtimeInstructions(recipient = null) {
  return [buildAgentSystemPrompt(recipient), REALTIME_CONVERSATION_RULES_ES].join("\n\n");
}

/* ------------------------------------------------------------------
   THE SESSION OBJECT
   ------------------------------------------------------------------ */

/**
 * The `session` payload, for minting a token and for `session.update`.
 *
 * @param {{model?:string, voice?:string, recipient?:object, instructions?:string}} [opts]
 */
export function buildRealtimeSession(opts = {}) {
  const model = opts.model || REALTIME_MODEL_DEFAULT;
  const voice = opts.voice || REALTIME_VOICE_DEFAULT;
  return {
    type: "realtime",
    model,
    instructions: opts.instructions || buildRealtimeInstructions(opts.recipient || null),
    audio: {
      input: {
        /* The shopper is on a phone in a room with other people. */
        noise_reduction: { type: "near_field" },
        transcription: { model: TRANSCRIPTION_MODEL, language: "es" },
        turn_detection: { ...TURN_DETECTION },
      },
      output: { voice, speed: 1.0 },
    },
    tools: REALTIME_TOOLS.map((t) => ({ ...t })),
    tool_choice: "auto",
    /* A HARD CEILING ON HOW LONG SHE CAN TALK. The prompt asks for one
       to three sentences, but a prompt is a preference and this is a
       limit: output audio is the expensive half, and a model that
       monologues for ninety seconds is both a worse salesperson and a
       bigger bill. 500 tokens is roughly a long paragraph — generous
       for three sentences, impossible to filibuster from. */
    max_response_output_tokens: MAX_RESPONSE_OUTPUT_TOKENS,
  };
}


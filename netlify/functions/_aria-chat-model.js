/* ============================================================
   ONE DEFINITION OF THE CHAT TURN — shared by the buffered endpoint
   and the streaming one.

   WHY THIS EXISTS. aria-chat-stream.js answers the same question as
   aria-chat-groq.js; only the shape of the response differs. If each
   built its own request, the two would drift the way every duplicated
   table in this repo has drifted — and the thing that would drift is
   Aria's PERSONALITY: the model, the temperature, the reply-length cap,
   the system prompt. A shopper would get a different Aria depending on
   whether streaming happened to be available that day, which is exactly
   what the brief forbids.

   So the request is built here, once, and both endpoints send it
   verbatim. The only line either of them changes is `stream`. A test
   pins that the two differ in nothing else.

   WHAT IS NOT HERE: routing. Which retailers are searched, what counts
   as a product, when a search happens at all — all of that is the
   caller's, in index.html, and none of it moved.
   ============================================================ */
import { buildSystemPrompt, sanitizeHistory } from "./_aria-prompt.js";

/* ============================================================
   SPOKEN PUNCTUATION -> REAL PUNCTUATION (2026-09-24)

   REPORTED FROM THE LIVE SITE (Danny, voice chat): Aria said the word
   "comma" out loud — "of course we do comma why" — instead of pausing
   at a comma. Nobody says "comma" or "period" in conversation; hearing
   it is the single fastest way to sound like a robot.

   THE CHAIN. Danny dictates by voice, so his punctuation arrives as
   words ("comma", "punto") in the speech-to-text transcript. The model
   echoes those words into its reply, and Grok TTS then speaks them
   literally. The recognition is es-PE but Danny dictates in English, so
   both languages' punctuation words are covered here.

   THE FIX. This runs over the reply BEFORE it reaches Grok TTS (see
   speechFor) and before the reply is returned to the client, so the
   bubble on screen and the voice saying it always agree. index.html
   carries a mirrored copy (spokenPunctuationToMarks) for the
   speech-to-text side — the transcript is cleaned before it ever
   reaches the chat, so search and the model see "shoes, red ones"
   instead of "shoes comma red ones".
   ============================================================ */
const SPOKEN_PUNCTUATION_RULES = [
  [/(exclamation\s+points?|signos?\s+de\s+exclamaci[oó]n)/gi, "!"],
  [/(question\s+marks?|signos?\s+de\s+(interrogaci[oó]n|pregunta))/gi, "?"],
  [/(punto\s+y\s+coma|semicolons?)/gi, ";"],
  [/(dos\s+puntos|colons?)/gi, ":"],
  /* "punto" is guarded against the idiom "a punto de" / "punto de venta"
     (point of sale): a dictated period is never followed by "de". */
  [/(periods?|puntos?(?!\s+de\b))/gi, "."],
  /* "coma" is guarded against "en coma": a dictated comma is never
     preceded by "en". */
  [/(commas?|(?<!en\s)comas?)/gi, ","],
  [/(new\s+paragraphs?|nuevos?\s+p[aá]rrafos?)/gi, "\n"],
  [/(new\s+lines?|nuevas?\s+l[ií]neas?)/gi, "\n"],
  [/(at\s+signs?|arrobas?)/gi, "@"],
  [/(hyphens?|dashes|guiones?)/gi, "-"],
];

/** Convert dictated punctuation words ("comma", "punto", ...) into the
 * marks they mean, so Aria's voice never says them out loud. */
export function sanitizeSpokenPunctuation(text) {
  let t = String(text || "");
  if (!t) return t;
  // Padded so a punctuation word at either end still matches; the
  // lookahead keeps the trailing space unconsumed so "comma comma"
  // converts both, not just the first.
  t = " " + t + " ";
  for (const [re, sym] of SPOKEN_PUNCTUATION_RULES) {
    t = t.replace(new RegExp(" (" + re.source + ")(?= )", re.flags), " " + sym + " ");
  }
  return (
    t
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\s*([,.!?;:])/g, "$1")
      .trim()
  );
}

export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_MODEL = "openai/gpt-oss-120b";
export const TEMPERATURE = 0.7;
/* Aria answers in 2-3 sentences (see BASE_PROMPT_ES), so this is a
   safety rail rather than a target. It matters more under streaming:
   the cap is what bounds how long a stream can stay open. */
export const MAX_TOKENS = 250;

/** The exact JSON body both endpoints POST to Groq, minus `stream`. */
export function chatRequestBody(body) {
  const message = typeof body?.message === "string" ? body.message : "";
  // History was already being sent by the caller and silently dropped
  // before sanitizeHistory landed, so every turn was answered with no
  // memory of the last one.
  const history = sanitizeHistory(body?.history);
  const products = Array.isArray(body?.products) ? body.products.slice(0, 6) : [];
  // Recipient gender/age the client extracted; see recipientRulesEs.
  const recipient = body?.recipient && typeof body.recipient === "object" ? body.recipient : null;

  return {
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: buildSystemPrompt(products, recipient) },
      ...history,
      { role: "user", content: message },
    ],
    temperature: TEMPERATURE,
    max_tokens: MAX_TOKENS,
  };
}

/**
 * Ara's voice for a finished reply, or null.
 *
 * BEST EFFORT, AND IT ALWAYS WAS. A voice failure must never cost the
 * customer the text reply, so every path here returns null rather than
 * throwing, and the browser's own speech synthesis covers the gap
 * client-side. Lifted out of aria-chat-groq.js unchanged so the
 * streaming endpoint keeps the behaviour the site already has instead
 * of quietly dropping Ara's voice — the brief said not to ADD audio,
 * not to take away what is there.
 */
export async function speechFor(reply) {
  if (!reply || !process.env.GROK_API_KEY) return null;
  try {
    // The voice must never speak punctuation words ("comma", "punto"):
    // the reply is sanitized before Grok renders it, so what the shopper
    // hears is what the bubble shows. See sanitizeSpokenPunctuation.
    const speakable = sanitizeSpokenPunctuation(reply);
    const res = await fetch("https://api.x.ai/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ voice_id: "ara", text: speakable, language: "es" }),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch {
    return null;
  }
}

/**
 * The text delta carried by one Groq SSE line, or null.
 *
 * Groq speaks OpenAI's dialect: each `data:` line is a chunk whose
 * choices[0].delta.content holds the new text, and the stream ends with
 * the literal `data: [DONE]`. Chunks arrive split across TCP reads, so
 * the CALLER owns the buffering — this only ever judges one complete
 * line. A line we cannot parse yields null and is skipped: a malformed
 * keep-alive must not end a reply halfway through a sentence.
 */
export function deltaFromLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === "[DONE]") return null;
  try {
    const chunk = JSON.parse(payload);
    const text = chunk?.choices?.[0]?.delta?.content;
    return typeof text === "string" && text ? text : null;
  } catch {
    return null;
  }
}

/** True once a Groq SSE line says the reply is complete. */
export function isDoneLine(line) {
  return String(line || "").trim() === "data: [DONE]";
}

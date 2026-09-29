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

   So the turn is built here, once, and both endpoints send the same turn.
   Each translates it to its own provider's wire params (the only thing
   that differs is the provider shape, plus `stream`), so the model, the
   grounding and the system prompt cannot drift between the primary and
   the fallback. A test pins that the two differ in nothing else.

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

/* EMOJI NARRATION (2026-09-27). Told "no emojis", the model sometimes writes
   what the emoji would have been — "(thumbs up)", "(sonrisa)" — instead of
   dropping it. Only parentheticals made SOLELY of emoji-description words are
   stripped; real asides like "(incl. impuestos)" are untouched. Runs on the
   finished reply, next to sanitizeSpokenPunctuation. */
const EMOJI_NARRATION_WORDS = new Set(
  "thumb thumbs up down ok check pulgar sonrisa sonriendo sonrie guino abrazo aplausos aplaudiendo fuego estrella llanto llorando risa riendo carcajada beso fiesta regalo rezando manos"
    .split(" ")
);
// Bare "(up)" / "(ok)" are too generic to strip on their own.
const EMOJI_NARRATION_GENERIC_SINGLETON = new Set(["up", "down", "ok", "check", "manos", "arriba", "abajo"]);
const foldAscii = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function sanitizeEmojiNarration(text) {
  let t = String(text || "");
  if (!t) return t;
  t = t.replace(/\(([^()]{1,40})\)/g, (m, inner) => {
    const words = foldAscii(inner).trim().split(/\s+/).filter(Boolean);
    if (words.length >= 1 && words.length <= 3 && words.every((w) => EMOJI_NARRATION_WORDS.has(w))) {
      if (words.length === 1 && EMOJI_NARRATION_GENERIC_SINGLETON.has(words[0])) return m;
      return "";
    }
    return m;
  });
  return t.replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").replace(/\s+([,.!?;:])/g, "$1").trim();
}

export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_MODEL = "openai/gpt-oss-120b";
export const TEMPERATURE = 0.7;
/* REASONING BUDGET (2026-09-28) — ROOT CAUSE of the deterministic
   "No reply from model". openai/gpt-oss-120b is a REASONING model: it
   thinks in a `reasoning` channel (delta.reasoning, channel:"analysis")
   before writing `content`. Groq counts reasoning tokens against
   max_tokens. With the default medium effort, a real shopping question
   burned the whole 250-token budget on reasoning (usage proved it:
   completion_tokens=250, reasoning_tokens=248, content chars=0) and the
   stream closed with zero content — every time, deterministically. The
   parser was never wrong; the model simply never got to speak.
   "low" spends ~30 reasoning tokens instead of ~250, and 600 gives the
   reply headroom without an unbounded stream. Aria answers in 2-3
   sentences, so 600 is a rail, not a target. */
export const REASONING_EFFORT = "low";
export const MAX_TOKENS = 600;

/* OPENAI PRIMARY (2026-09-28). gpt-6-luna, verified against the
   official model catalog (platform.openai.com/docs/models): "our most
   efficient model for focused, high-volume tasks", reasoning "none"
   supported, streaming and function calling available.
   `reasoning_effort: "none"` is mandatory — it is what makes this a
   non-reasoning call (the production failure mode documented at
   REASONING_EFFORT is a reasoning model burning its budget before the
   first word). `temperature` is deliberately absent: sources conflict
   on whether GPT-6 accepts it at effort "none", and an unverified
   param that 400s breaks every chat. GPT-6 takes
   max_completion_tokens, not max_tokens. Official short-context
   pricing: $0.10 input / $0.01 cached input / $0.50 output per 1M
   tokens. */
export const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
export const OPENAI_MODEL = "gpt-6-luna";
export const OPENAI_REASONING_EFFORT = "none";
export const OPENAI_MAX_COMPLETION_TOKENS = 250;

/* LAST LINE OF DEFENSE (2026-09-28). If Groq answers twice with zero
   content, the shopper gets this honest one-liner instead of a dead
   "No reply from model" — short enough to speak aloud safely, and it
   invites the retry by voice. Never shown as an error code. */
export const EMPTY_REPLY_FALLBACK_ES =
  "Ay, se me fue la idea por un segundo — ¿me repites tu pregunta?";

/** The exact turn Aria answers, built once. The primary endpoint POSTs
 * the OpenAI shape (minus `stream`); provider "groq" builds the same
 * turn for the fallback endpoint — same messages, same grounding,
 * same system prompt — translated to the params Groq's
 * OpenAI-compatible API takes. The two wire shapes carry an identical
 * turn; the personality cannot drift between them. */
export function chatRequestBody(body, provider = "openai") {
  const message = typeof body?.message === "string" ? body.message : "";
  // History was already being sent by the caller and silently dropped
  // before sanitizeHistory landed, so every turn was answered with no
  // memory of the last one.
  const history = sanitizeHistory(body?.history);
  const products = Array.isArray(body?.products) ? body.products.slice(0, 6) : [];
  // Recipient gender/age the client extracted; see recipientRulesEs.
  const recipient = body?.recipient && typeof body.recipient === "object" ? body.recipient : null;

  const messages = [
    { role: "system", content: buildSystemPrompt(products, recipient) },
    ...history,
    { role: "user", content: message },
  ];

  if (provider === "groq") {
    return {
      model: GROQ_MODEL,
      messages,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      /* gpt-oss-120b is a reasoning model; without this it spends the
         whole token budget thinking and never answers (see
         REASONING_EFFORT). Groq's OpenAI-compatible endpoint honors it. */
      reasoning_effort: REASONING_EFFORT,
    };
  }

  return {
    model: OPENAI_MODEL,
    messages,
    /* "none" is what makes this a non-reasoning call — without it the
       model can burn the budget thinking before the first word, the
       exact production failure REASONING_EFFORT documents above. */
    reasoning_effort: OPENAI_REASONING_EFFORT,
    /* GPT-6 takes max_completion_tokens, not max_tokens. */
    max_completion_tokens: OPENAI_MAX_COMPLETION_TOKENS,
  };
}

/* ============================================================
   ARIA'S VOICE: ELEVENLABS "LILY" (2026-09-28, Danny's pick)

   WAS xAI TTS, voice "ara" — which Danny heard as flat. Lily is a
   Peruvian Spanish voice from the ElevenLabs Voice Library, and Peru is
   who this shop sells to, so the accent is the point rather than a
   preference.

   ONE VOICE, ONE CALL SITE. Every place the assistant speaks — the
   opening greeting, a buffered reply, a streamed reply — renders its
   audio here. aria-chat.js used to carry its own second copy of the TTS
   call, which is how the greeting could have kept the old voice after
   the chat had moved; a test now pins that it does not.

   THE KEY IS SERVER-SIDE AND STAYS THERE. xi-api-key is read from the
   environment inside this Netlify function. The browser never names a
   voice and never sees a credential, so neither can be swapped or
   spoofed from the client — a test pins that too.
   ============================================================ */
export const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
/* Lily — Peruvian Spanish. ELEVENLABS_VOICE_ID overrides this without a
   deploy, so a voice change is a dashboard edit rather than a PR. */
export const ELEVENLABS_VOICE_ID_DEFAULT = "ek0qR5Bu0N3aPdijsdae";
/* eleven_flash_v2_5 — ElevenLabs' lowest-latency TTS model (~75ms
   TTFB), 32 languages. Latency is the whole point of the sentence
   pipeline, so the voice model is pinned, not defaulted. */
export const ELEVENLABS_TTS_MODEL = "eleven_flash_v2_5";

/**
 * Lily's voice for a finished reply, or null.
 *
 * BEST EFFORT, AND IT ALWAYS WAS. A voice failure must never cost the
 * customer the text reply, so every path here returns null rather than
 * throwing, and the browser's own speech synthesis covers the gap
 * client-side. That contract is unchanged by the provider swap: what
 * used to be "no Ara" is now "no Lily", and the bubble still speaks.
 */
export async function speechFor(reply) {
  if (!reply || !process.env.ELEVENLABS_API_KEY) return null;
  try {
    // The voice must never speak punctuation words ("comma", "punto"):
    // The voice must never speak punctuation words ("comma", "punto"):
    // the reply is sanitized before ElevenLabs renders it, so what the
    // shopper hears is what the bubble shows. See
    // sanitizeSpokenPunctuation.
    const speakable = sanitizeEmojiNarration(sanitizeSpokenPunctuation(reply));
    /* A reply that is nothing but punctuation words sanitizes down to
       marks alone, and sending "," to a TTS API buys a billed request
       for a sound no one needs. */
    if (!speakable) return null;
    const voiceId = process.env.ELEVENLABS_VOICE_ID || ELEVENLABS_VOICE_ID_DEFAULT;
    const res = await fetch(`${ELEVENLABS_TTS_URL}/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: speakable,
        model_id: ELEVENLABS_TTS_MODEL,
        voice_settings: { stability: 0.35, similarity_boost: 0.75, style: 0.55, use_speaker_boost: true },
      }),
    });
    if (!res.ok) return null;
    /* MP3, which is what the client already plays: index.html sets
       `data:audio/mp3;base64,` and did so for xAI too, so the swap needs
       no client change. Accept: audio/mpeg keeps that true. */
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch {
    return null;
  }
}

/**
 * The text delta carried by one SSE line, or null.
 *
 * Both providers speak OpenAI's SSE dialect: each `data:` line is a chunk whose
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

/* Both providers report mid-stream failures as an SSE event instead of
   an HTTP error: `data: {"error": {"message": "Rate limit reached...",
   "code": "rate_limit_exceeded"}}` with HTTP 200. Without this, a 429
   arrives looking exactly like an empty reply and the client's 429
   handling never fires. Returns { message, code } or null. */
export function sseErrorFromLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === "[DONE]") return null;
  try {
    const chunk = JSON.parse(payload);
    const err = chunk && chunk.error;
    if (!err) return null;
    return { message: err.message || err.code || String(err), code: err.code };
  } catch {
    return null;
  }
}
